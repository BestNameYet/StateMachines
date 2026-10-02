'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '../../..');
const supervisorRoot = path.join(repoRoot, 'ChatMachines/GeminiSupervisor');
const sourcePath = path.join(supervisorRoot, 'Agents.md');
const requestPath = path.join(supervisorRoot, 'live-ground-truth/read-request.json');
const readingRoom = path.join(supervisorRoot, 'live-ground-truth/reading-room');

const DOC_NAME = 'Agents.reader.json';
const PLACEHOLDER_KEY = '^MISSING_KEY^';
const PLACEHOLDER_VALUE = '^MISSING_VALUE^';
const DAMAGE_RATE = 0.10;

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, jsonBytes(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function projectAgents() {
  const bytes = fs.readFileSync(sourcePath);
  const text = bytes.toString('utf8');
  const items = [];
  const re = /(.*?)(\r\n|\n|\r|$)/g;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match[0] === '' && re.lastIndex === text.length) break;
    items.push({
      type: 'content',
      text: match[1],
      eol: match[2]
    });
    if (match[2] === '') break;
  }

  return {
    doc_id: 'agents',
    canonical_path: 'ChatMachines/GeminiSupervisor/Agents.md',
    source_blob_sha: gitBlobSha(bytes),
    items
  };
}

function substantial(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (!text) return false;
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

function reverseAndDamageProjection(full) {
  const damaged = structuredClone(full);
  damaged.items.reverse();
  for (const index of chooseDamageIndices(damaged.items)) {
    damaged.items[index] = { [PLACEHOLDER_KEY]: PLACEHOLDER_VALUE };
  }
  return damaged;
}

function validateCommitSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value || '')) throw new Error(`Invalid commit SHA: ${value}`);
  return value.toLowerCase();
}

function pathsFor(commitSha) {
  const sha = validateCommitSha(commitSha);
  return {
    canonical: path.join(readingRoom, DOC_NAME),
    active: path.join(readingRoom, `${DOC_NAME}-${sha}`),
    failed: path.join(readingRoom, `${DOC_NAME}-${sha}-FAILED`),
    pass: path.join(readingRoom, `${DOC_NAME}-${sha}-PASS`)
  };
}

function rm(filePath) {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
}

function issue(commitSha) {
  const request = readJson(requestPath);
  if (request['Agents.md'] !== true) {
    throw new Error('read-request.json must contain "Agents.md": true');
  }

  const p = pathsFor(commitSha);
  const full = projectAgents();

  fs.mkdirSync(readingRoom, { recursive: true });
  rm(p.active);
  rm(p.failed);
  rm(p.pass);

  writeJson(p.canonical, full);
  writeJson(p.active, reverseAndDamageProjection(full));

  console.log(`[live-ground-truth] issued reverse-order ${path.basename(p.active)}`);
}

function parseChallengePath(challengePath) {
  const normalized = challengePath.replace(/\\/g, '/');
  const prefix = 'ChatMachines/GeminiSupervisor/live-ground-truth/reading-room/';
  if (!normalized.startsWith(prefix)) throw new Error('Challenge path is outside the reading room');

  const name = path.posix.basename(normalized);
  const match = /^Agents\.reader\.json-([0-9a-f]{40})$/i.exec(name);
  if (!match) throw new Error(`Not an active Live Ground Truth challenge: ${name}`);

  return { challengeCommitSha: match[1].toLowerCase() };
}

function verify(challengePath, evaluationCommitSha) {
  parseChallengePath(challengePath);
  const evaluationSha = validateCommitSha(evaluationCommitSha);
  const resultPaths = pathsFor(evaluationSha);
  const absoluteChallenge = path.join(repoRoot, challengePath);

  if (!fs.existsSync(absoluteChallenge)) throw new Error(`Challenge file not found: ${challengePath}`);
  if (!fs.existsSync(resultPaths.canonical)) throw new Error(`Canonical ${DOC_NAME} is missing`);

  const canonicalBytes = fs.readFileSync(resultPaths.canonical);
  const submittedBytes = fs.readFileSync(absoluteChallenge);
  const pass = submittedBytes.equals(canonicalBytes);

  rm(absoluteChallenge);
  rm(resultPaths.active);
  rm(resultPaths.failed);
  rm(resultPaths.pass);

  if (pass) {
    fs.writeFileSync(resultPaths.pass, canonicalBytes);
    console.log(`[live-ground-truth] PASS ${evaluationSha}`);
    return true;
  }

  writeJson(resultPaths.failed, { status: 'FAILED' });
  const canonical = JSON.parse(canonicalBytes.toString('utf8'));
  writeJson(resultPaths.active, reverseAndDamageProjection(canonical));
  console.log(`[live-ground-truth] FAILED ${evaluationSha}; issued fresh reverse-order random damage`);
  return false;
}

function main() {
  const mode = process.argv[2];

  if (mode === 'issue') {
    issue(process.argv[3]);
    return;
  }

  if (mode === 'verify') {
    const ok = verify(process.argv[3], process.argv[4]);
    process.exitCode = ok ? 0 : 2;
    return;
  }

  throw new Error(
    'Usage: live-ground-truth-reading-room.js issue <commit-sha> | verify <challenge-path> <evaluation-commit-sha>'
  );
}

try {
  main();
} catch (error) {
  console.error(`[live-ground-truth] ${error.stack || error.message}`);
  process.exitCode = 1;
}
