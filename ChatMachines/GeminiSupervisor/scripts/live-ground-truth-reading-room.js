'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '../../..');
const supervisorRoot = path.join(repoRoot, 'ChatMachines/GeminiSupervisor');
const sourcePath = path.join(supervisorRoot, 'Agents.md');
const requestPath = path.join(supervisorRoot, 'live-ground-truth/read-request.json');
const readingRoom = path.join(supervisorRoot, 'live-ground-truth/reading-room');
const baselineRoom = path.join(supervisorRoot, 'live-ground-truth/baselines');

const DOC_NAME = 'Agents.reader.json';
const PLACEHOLDER_KEY = '^MISSING_KEY^';
const PLACEHOLDER_VALUE = '^MISSING_VALUE^';
const DAMAGE_RATE = 0.10;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function projectText(bytes, sourceCommitSha) {
  const text = bytes.toString('utf8');
  const items = [];
  const re = /(.*?)(\r\n|\n|\r|$)/g;
  let match;
  let lineNumber = 1;

  while ((match = re.exec(text)) !== null) {
    if (match[0] === '' && re.lastIndex === text.length) break;
    items.push({
      type: 'content',
      line_number: lineNumber++,
      text: match[1],
      eol: match[2]
    });
    if (match[2] === '') break;
  }

  return {
    doc_id: 'agents',
    canonical_path: 'ChatMachines/GeminiSupervisor/Agents.md',
    format: 'text',
    source_provenance: {
      source_blob_sha: gitBlobSha(bytes),
      source_commit_sha: sourceCommitSha
    },
    items
  };
}

function substantial(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (!text) return false;
  if (/^[{}\[\],:]+$/.test(text)) return false;
  return text.length >= 4;
}

function chooseDamageIndices(items) {
  const preferred = [];
  const fallback = [];

  for (let i = 0; i < items.length; i++) {
    if (items[i] && typeof items[i] === 'object' && !Array.isArray(items[i])) {
      fallback.push(i);
      if (substantial(items[i])) preferred.push(i);
    }
  }

  const eligible = preferred.length ? preferred : fallback;
  if (!eligible.length) return [];

  const target = Math.max(1, Math.min(eligible.length, Math.round(eligible.length * DAMAGE_RATE)));
  const bandCount = Math.max(1, Math.min(10, target, eligible.length));
  const selected = new Set();

  for (let band = 0; band < bandCount; band++) {
    const start = Math.floor((band * eligible.length) / bandCount);
    const end = Math.floor(((band + 1) * eligible.length) / bandCount);
    const bandItems = eligible.slice(start, Math.max(start + 1, end));
    selected.add(bandItems[crypto.randomInt(0, bandItems.length)]);
  }

  const remaining = eligible.filter((index) => !selected.has(index));
  while (selected.size < target && remaining.length) {
    selected.add(remaining.splice(crypto.randomInt(0, remaining.length), 1)[0]);
  }

  return [...selected].sort((a, b) => a - b);
}

function damageProjection(full) {
  const damaged = structuredClone(full);
  for (const index of chooseDamageIndices(damaged.items)) {
    damaged.items[index] = { [PLACEHOLDER_KEY]: PLACEHOLDER_VALUE };
  }
  return damaged;
}

function validateCommitSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value || '')) throw new Error(`Invalid commit SHA: ${value}`);
  return value.toLowerCase();
}

function pathsFor(requestCommitSha) {
  const sha = validateCommitSha(requestCommitSha);
  return {
    canonical: path.join(readingRoom, DOC_NAME),
    active: path.join(readingRoom, `${DOC_NAME}-${sha}`),
    failed: path.join(readingRoom, `${DOC_NAME}-${sha}-FAILED`),
    pass: path.join(readingRoom, `${DOC_NAME}-${sha}-PASS`),
    baseline: path.join(baselineRoom, `${DOC_NAME}-${sha}.json`)
  };
}

function rm(filePath) {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
}

function issue(requestCommitSha) {
  const request = readJson(requestPath);
  if (request['Agents.md'] !== true) {
    console.log('[live-ground-truth] Agents.md is not requested; nothing to issue.');
    return;
  }

  const p = pathsFor(requestCommitSha);
  const sourceBytes = fs.readFileSync(sourcePath);
  const full = projectText(sourceBytes, requestCommitSha);
  const damaged = damageProjection(full);

  fs.mkdirSync(readingRoom, { recursive: true });
  fs.mkdirSync(baselineRoom, { recursive: true });

  rm(p.active);
  rm(p.failed);
  rm(p.pass);

  writeJson(p.canonical, full);
  writeJson(p.active, damaged);
  writeJson(p.baseline, damaged);

  console.log(`[live-ground-truth] issued ${path.basename(p.active)}`);
}

function parseChallengePath(challengePath) {
  const normalized = challengePath.replace(/\\/g, '/');
  const prefix = 'ChatMachines/GeminiSupervisor/live-ground-truth/reading-room/';
  if (!normalized.startsWith(prefix)) throw new Error('Challenge path is outside the reading room');

  const name = path.posix.basename(normalized);
  const match = /^Agents\.reader\.json-([0-9a-f]{40})(-FAILED)?$/i.exec(name);
  if (!match) throw new Error(`Not an active Live Ground Truth challenge: ${name}`);

  return { requestCommitSha: match[1].toLowerCase(), wasFailed: Boolean(match[2]) };
}

function verify(challengePath) {
  const { requestCommitSha } = parseChallengePath(challengePath);
  const p = pathsFor(requestCommitSha);
  const absoluteChallenge = path.join(repoRoot, challengePath);

  if (!fs.existsSync(absoluteChallenge)) throw new Error(`Challenge file not found: ${challengePath}`);
  if (!fs.existsSync(p.baseline)) throw new Error(`Trusted damaged baseline not found for ${requestCommitSha}`);

  const sourceBytes = fs.readFileSync(sourcePath);
  const expectedFull = projectText(sourceBytes, requestCommitSha);
  const expectedFullBytes = Buffer.from(JSON.stringify(expectedFull, null, 2) + '\n', 'utf8');

  // The reading-room canonical copy is system-owned and is refreshed on every evaluation.
  fs.writeFileSync(p.canonical, expectedFullBytes);

  const submittedBytes = fs.readFileSync(absoluteChallenge);
  const pass = submittedBytes.equals(expectedFullBytes);

  rm(p.active);
  rm(p.failed);
  rm(p.pass);

  if (pass) {
    fs.writeFileSync(p.pass, expectedFullBytes);
    rm(p.baseline);
    console.log(`[live-ground-truth] PASS ${requestCommitSha}`);
    return true;
  }

  fs.copyFileSync(p.baseline, p.failed);
  console.log(`[live-ground-truth] FAILED ${requestCommitSha}; damaged projection reset`);
  return false;
}

function main() {
  const mode = process.argv[2];
  if (mode === 'issue') {
    issue(process.argv[3]);
    return;
  }
  if (mode === 'verify') {
    const ok = verify(process.argv[3]);
    process.exitCode = ok ? 0 : 2;
    return;
  }
  throw new Error('Usage: live-ground-truth-reading-room.js issue <request-commit-sha> | verify <challenge-path>');
}

try {
  main();
} catch (error) {
  console.error(`[live-ground-truth] ${error.stack || error.message}`);
  process.exitCode = 1;
}
