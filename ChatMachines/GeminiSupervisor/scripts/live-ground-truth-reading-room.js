'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { isDeepStrictEqual } = require('util');

const repoRoot = path.resolve(__dirname, '../../..');
const supervisorRoot = path.join(repoRoot, 'ChatMachines/GeminiSupervisor');
const sourcePath = path.join(supervisorRoot, 'Agents.md');
const requestPath = path.join(supervisorRoot, 'live-ground-truth/read-request.json');
const readingRoom = path.join(supervisorRoot, 'live-ground-truth/reading-room');

const DOC_NAME = 'Agents.reader.json';
const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const CHARACTER_HEIGHT_PX = 20;
const CONSERVATIVE_CHARACTER_WIDTH_PX = 12;
const PAD_X = 24;
const PAD_Y = 20;
const FONT_SIZE_PX = 16;
const ROWS = Math.floor((VIEWPORT_HEIGHT - (2 * PAD_Y)) / CHARACTER_HEIGHT_PX);
const COLUMNS = Math.floor((VIEWPORT_WIDTH - (2 * PAD_X)) / CONSERVATIVE_CHARACTER_WIDTH_PX);
const CPX = ROWS * COLUMNS;
const CARD_NAME_RE = /^[0-9a-f]{32}\.png$/;
const ACTIVE_RE = /^Agents\.reader\.json-([0-9a-f]{40})$/i;
const manifestRoot = process.env.READING_ROOM_MANIFEST_DIR || path.join(repoRoot, '.live-ground-truth-cache');

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
    items.push({ type: 'content', text: match[1], eol: match[2] });
    if (match[2] === '') break;
  }

  return {
    doc_id: 'agents',
    canonical_path: 'ChatMachines/GeminiSupervisor/Agents.md',
    source_blob_sha: gitBlobSha(bytes),
    items
  };
}

function validateCommitSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value || '')) throw new Error(`Invalid commit SHA: ${value}`);
  return value.toLowerCase();
}

function pathsFor(commitSha) {
  const sha = validateCommitSha(commitSha);
  return {
    active: path.join(readingRoom, `${DOC_NAME}-${sha}`),
    failed: path.join(readingRoom, `${DOC_NAME}-${sha}-FAILED`),
    pass: path.join(readingRoom, `${DOC_NAME}-${sha}-PASS`)
  };
}

function randomCardName() {
  return `${crypto.randomBytes(16).toString('hex')}.png`;
}

function shuffle(values) {
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function entryChars(value) {
  return JSON.stringify(value).length + 8;
}

function nominalCardCount(values) {
  const totalChars = values.reduce((sum, value) => sum + entryChars(value), 0);
  return Math.max(
    1,
    Math.ceil(totalChars / CPX),
    Math.ceil(values.length / ROWS)
  );
}

function partitionBalanced(values, cardCount, maxItems) {
  const groups = [];
  let cursor = 0;
  const costs = values.map(entryChars);
  const suffix = new Array(values.length + 1).fill(0);
  for (let i = values.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + costs[i];

  for (let card = 0; card < cardCount; card++) {
    const cardsLeft = cardCount - card;
    const itemsLeft = values.length - cursor;
    if (itemsLeft <= 0) break;

    const minNeededAfter = Math.max(0, cardsLeft - 1);
    const hardMax = Math.min(maxItems, itemsLeft - minNeededAfter);
    const target = suffix[cursor] / cardsLeft;
    const group = [];
    let used = 0;

    while (group.length < hardMax && cursor < values.length) {
      const cost = costs[cursor];
      const mustTake = group.length === 0;
      const wouldExceed = !mustTake && used + cost > target;
      if (wouldExceed) break;
      group.push(values[cursor]);
      used += cost;
      cursor++;
    }

    if (group.length === 0 && cursor < values.length) group.push(values[cursor++]);
    groups.push(group);
  }

  while (cursor < values.length) {
    const last = groups[groups.length - 1];
    if (!last || last.length >= maxItems) groups.push([]);
    groups[groups.length - 1].push(values[cursor++]);
  }

  return groups;
}

function orderedSlots(values, parity) {
  const slots = [];
  const orderedOnOdd = parity === 'odd';
  for (const value of values) {
    if (orderedOnOdd) {
      slots.push(value, null);
    } else {
      slots.push(null, value);
    }
  }
  if (slots.length > ROWS) throw new Error(`Ordered card exceeds ${ROWS} rows`);
  return slots;
}

function xmlEscape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function visibleLine(value, index) {
  if (value === null) return 'null';
  return `[${index}] ${JSON.stringify(value)}`;
}

function cardSvg(slots) {
  const maxWidth = VIEWPORT_WIDTH - (2 * PAD_X);
  const texts = slots.map((value, row) => {
    const line = visibleLine(value, row);
    const y = PAD_Y + ((row + 1) * CHARACTER_HEIGHT_PX) - 4;
    const estimatedWidth = Math.max(1, line.length * CONSERVATIVE_CHARACTER_WIDTH_PX);
    const lengthAttrs = estimatedWidth > maxWidth
      ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"`
      : '';
    return `<text x="${PAD_X}" y="${y}"${lengthAttrs}>${xmlEscape(line)}</text>`;
  }).join('');

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_WIDTH}" height="${VIEWPORT_HEIGHT}" viewBox="0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}">` +
    `<rect width="100%" height="100%" fill="white"/>` +
    `<g fill="black" font-family="DejaVu Sans Mono, monospace" font-size="${FONT_SIZE_PX}px">${texts}</g>` +
    `</svg>`,
    'utf8'
  );
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function manifestPath(commitSha) {
  return path.join(manifestRoot, `${validateCommitSha(commitSha)}.json`);
}

async function writeCard(slots) {
  const fileName = randomCardName();
  const filePath = path.join(readingRoom, fileName);
  const png = await sharp(cardSvg(slots)).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(filePath, png);
  return { fileName, pngSha256: sha256(png) };
}

function removeGeneratedCards() {
  if (!fs.existsSync(readingRoom)) return;
  for (const name of fs.readdirSync(readingRoom)) {
    if (CARD_NAME_RE.test(name)) fs.rmSync(path.join(readingRoom, name), { force: true });
  }
}

function removeLegacyCanonical() {
  const legacy = path.join(readingRoom, DOC_NAME);
  if (fs.existsSync(legacy)) fs.rmSync(legacy, { force: true });
}

function removeActiveChallenges() {
  if (!fs.existsSync(readingRoom)) return;
  for (const name of fs.readdirSync(readingRoom)) {
    if (ACTIVE_RE.test(name)) fs.rmSync(path.join(readingRoom, name), { force: true });
  }
}

async function buildChallenge(commitSha) {
  const sha = validateCommitSha(commitSha);
  const full = projectAgents();
  const canonical = full.items;
  const shuffled = shuffle(canonical);
  const shuffledCardCount = nominalCardCount(shuffled);
  const orderedCardCount = Math.max(1, shuffledCardCount * 2);

  const shuffledGroups = partitionBalanced(shuffled, shuffledCardCount, ROWS);
  const orderedMax = Math.floor(ROWS / 2);
  const orderedGroups = partitionBalanced(canonical, orderedCardCount, orderedMax);

  fs.mkdirSync(readingRoom, { recursive: true });
  removeGeneratedCards();
  removeLegacyCanonical();
  removeActiveChallenges();

  const cards = {};
  for (const group of shuffledGroups) {
    const { fileName, pngSha256 } = await writeCard(group);
    cards[fileName] = { role: 'shuffled', slots: group, png_sha256: pngSha256 };
  }
  for (const group of orderedGroups) {
    const parity = crypto.randomInt(0, 2) === 0 ? 'odd' : 'even';
    const slots = orderedSlots(group, parity);
    const { fileName, pngSha256 } = await writeCard(slots);
    cards[fileName] = { role: 'ordered', parity, slots, png_sha256: pngSha256 };
  }

  fs.mkdirSync(manifestRoot, { recursive: true });
  writeJson(manifestPath(sha), {
    challenge: 'agents-png-locator-v1',
    challenge_commit_sha: sha,
    source_blob_sha: full.source_blob_sha,
    item_count: canonical.length,
    cards
  });

  const challenge = {
    challenge: 'agents-png-locator-v1',
    source_blob_sha: full.source_blob_sha,
    viewport: {
      width_px: VIEWPORT_WIDTH,
      height_px: VIEWPORT_HEIGHT,
      character_height_px: CHARACTER_HEIGHT_PX,
      conservative_character_width_px: CONSERVATIVE_CHARACTER_WIDTH_PX,
      rows: ROWS,
      columns: COLUMNS,
      cpx: CPX
    },
    card_model: {
      shuffled_cards: shuffledGroups.length,
      ordered_reference_cards: orderedGroups.length,
      total_cards: Object.keys(cards).length,
      filenames_are_random: true,
      collection_is_mixed: true,
      ordered_reference_rule: 'Counting the first visible row as 1, each ordered-reference card places canonical members only on one parity: all odd rows or all even rows. Opposite-parity rows are null and are not canonical members.',
      placement_rule: 'Only dense shuffled cards are legal placement sources. Ordered-reference cards are reference-only.'
    },
    answer_format: 'locator[n] = [png_filename, array_index_in_that_png]',
    item_count: canonical.length,
    locator: Array(canonical.length).fill(null)
  };

  const active = pathsFor(sha).active;
  writeJson(active, challenge);
  console.log(`[live-ground-truth] issued ${path.basename(active)} with ${Object.keys(cards).length} mixed PNG cards (${shuffledGroups.length} shuffled, ${orderedGroups.length} ordered-reference)`);
  return challenge;
}

function parseChallengePath(challengePath) {
  const normalized = challengePath.replace(/\\/g, '/');
  const prefix = 'ChatMachines/GeminiSupervisor/live-ground-truth/reading-room/';
  if (!normalized.startsWith(prefix)) throw new Error('Challenge path is outside the reading room');
  const name = path.posix.basename(normalized);
  const match = ACTIVE_RE.exec(name);
  if (!match) throw new Error(`Not an active Live Ground Truth challenge: ${name}`);
  return { challengeCommitSha: match[1].toLowerCase() };
}

function cardInventory(challengeCommitSha) {
  const filePath = manifestPath(challengeCommitSha);
  if (!fs.existsSync(filePath)) throw new Error(`Challenge manifest not restored: ${filePath}`);
  const manifest = readJson(filePath);
  if (!manifest || manifest.challenge !== 'agents-png-locator-v1' || !manifest.cards) {
    throw new Error('Invalid challenge manifest');
  }

  const inventory = new Map();
  for (const [name, card] of Object.entries(manifest.cards)) {
    if (!CARD_NAME_RE.test(name) || !Array.isArray(card.slots)) throw new Error(`Invalid manifest card: ${name}`);
    const pngPath = path.join(readingRoom, name);
    if (!fs.existsSync(pngPath)) throw new Error(`Challenge PNG is missing: ${name}`);
    const actualSha = sha256(fs.readFileSync(pngPath));
    if (actualSha !== card.png_sha256) throw new Error(`Challenge PNG was modified: ${name}`);
    inventory.set(name, { slots: card.slots, placement: card.role === 'shuffled' });
  }
  return { manifest, inventory };
}

function verifyLocator(locator, canonical, inventory) {
  if (!Array.isArray(locator) || locator.length !== canonical.length) return false;

  const used = new Set();
  let placementSlotCount = 0;
  for (const card of inventory.values()) {
    if (card.placement) placementSlotCount += card.slots.length;
  }
  if (placementSlotCount !== canonical.length) return false;

  for (let n = 0; n < canonical.length; n++) {
    const loc = locator[n];
    if (!Array.isArray(loc) || loc.length !== 2) return false;
    const [fileName, arrayIndex] = loc;
    if (typeof fileName !== 'string' || !CARD_NAME_RE.test(fileName)) return false;
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) return false;

    const card = inventory.get(fileName);
    if (!card || !card.placement || arrayIndex >= card.slots.length) return false;

    const unique = `${fileName}:${arrayIndex}`;
    if (used.has(unique)) return false;
    used.add(unique);

    if (!isDeepStrictEqual(card.slots[arrayIndex], canonical[n])) return false;
  }

  return used.size === canonical.length;
}

async function verify(challengePath, evaluationCommitSha) {
  const { challengeCommitSha } = parseChallengePath(challengePath);
  const evaluationSha = validateCommitSha(evaluationCommitSha);
  const resultPaths = pathsFor(evaluationSha);
  const absoluteChallenge = path.join(repoRoot, challengePath);
  if (!fs.existsSync(absoluteChallenge)) throw new Error(`Challenge file not found: ${challengePath}`);

  const full = projectAgents();
  const submitted = readJson(absoluteChallenge);
  const { manifest, inventory } = cardInventory(challengeCommitSha);
  const pass =
    manifest.source_blob_sha === full.source_blob_sha &&
    manifest.item_count === full.items.length &&
    submitted?.challenge === 'agents-png-locator-v1' &&
    submitted?.source_blob_sha === full.source_blob_sha &&
    verifyLocator(submitted.locator, full.items, inventory);

  fs.rmSync(absoluteChallenge, { force: true });
  removeGeneratedCards();

  if (pass) {
    writeJson(resultPaths.pass, {
      status: 'PASS',
      source_blob_sha: full.source_blob_sha,
      item_count: full.items.length,
      locator: submitted.locator
    });
    console.log(`[live-ground-truth] PASS ${evaluationSha}`);
    return true;
  }

  writeJson(resultPaths.failed, { status: 'FAILED' });
  await buildChallenge(evaluationSha);
  console.log(`[live-ground-truth] FAILED ${evaluationSha}; issued fresh PNG challenge`);
  return false;
}

async function issue(commitSha) {
  const request = readJson(requestPath);
  if (request['Agents.md'] !== true) throw new Error('read-request.json must contain "Agents.md": true');
  await buildChallenge(commitSha);
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'issue') {
    await issue(process.argv[3]);
    return;
  }
  if (mode === 'verify') {
    const ok = await verify(process.argv[3], process.argv[4]);
    process.exitCode = ok ? 0 : 2;
    return;
  }
  throw new Error('Usage: live-ground-truth-reading-room.js issue <commit-sha> | verify <challenge-path> <evaluation-commit-sha>');
}

main().catch((error) => {
  console.error(`[live-ground-truth] ${error.stack || error.message}`);
  process.exitCode = 1;
});
