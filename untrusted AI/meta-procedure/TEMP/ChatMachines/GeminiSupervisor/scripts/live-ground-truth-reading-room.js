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
const FONT_SIZE_PX = 20;
const RAW_ROWS = Math.floor((VIEWPORT_HEIGHT - (2 * PAD_Y)) / CHARACTER_HEIGHT_PX);
const ROWS = RAW_ROWS - (RAW_ROWS % 2);
const COLUMNS = Math.floor((VIEWPORT_WIDTH - (2 * PAD_X)) / CONSERVATIVE_CHARACTER_WIDTH_PX);
const CPX = ROWS * COLUMNS;
const INDEX_PREFIX_CHARS = 8;
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

function entryChars(value) {
  return JSON.stringify(value).length + INDEX_PREFIX_CHARS;
}

function splitLineToRenderableItems(text, eol) {
  if (text === '') return [{ type: 'content', text: '', eol }];

  const chunks = [];
  let current = '';
  for (const ch of text) {
    const candidate = current + ch;
    const probe = { type: 'content', text: candidate, eol: '\r\n' };
    if (current && entryChars(probe) > COLUMNS) {
      chunks.push({ type: 'content', text: current, eol: '' });
      current = ch;
    } else {
      current = candidate;
    }
  }
  chunks.push({ type: 'content', text: current, eol });
  return chunks;
}

function projectAgents() {
  const bytes = fs.readFileSync(sourcePath);
  const text = bytes.toString('utf8');
  const items = [];
  const re = /(.*?)(\r\n|\n|\r|$)/g;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match[0] === '' && re.lastIndex === text.length) break;
    items.push(...splitLineToRenderableItems(match[1], match[2]));
    if (match[2] === '') break;
  }

  // Make the canonical projected array fill complete even-row cards exactly.
  // Splitting preserves document order and bytes: the first fragment has no EOL and
  // the second fragment retains the original EOL. At most ROWS-1 splits are needed.
  const targetItemCount = Math.ceil(items.length / ROWS) * ROWS;
  while (items.length < targetItemCount) {
    let splitIndex = -1;
    let longest = 1;
    for (let i = 0; i < items.length; i++) {
      const length = items[i]?.text?.length || 0;
      if (length > longest) {
        longest = length;
        splitIndex = i;
      }
    }
    if (splitIndex < 0) throw new Error(`Cannot split projected items to ${targetItemCount}`);
    const original = items[splitIndex];
    const midpoint = Math.ceil(original.text.length / 2);
    items.splice(
      splitIndex,
      1,
      { type: 'content', text: original.text.slice(0, midpoint), eol: '' },
      { type: 'content', text: original.text.slice(midpoint), eol: original.eol }
    );
  }

  for (const item of items) {
    if (entryChars(item) > COLUMNS) {
      throw new Error(`Projected item exceeds conservative row width: ${entryChars(item)} > ${COLUMNS}`);
    }
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

function nominalCardCount(values) {
  const totalChars = values.reduce((sum, value) => sum + entryChars(value), 0);
  return Math.max(1, Math.ceil(totalChars / CPX), Math.ceil(values.length / ROWS));
}

function partitionBalanced(values, cardCount, maxItems, costFn = entryChars) {
  const groups = [];
  let cursor = 0;
  const costs = values.map(costFn);
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
      if (!mustTake && used + cost > target) break;
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

function buildMixedSlots(pairs, orderedParity) {
  const slots = [];
  const placementSlots = [];
  const orderedOnOdd = orderedParity === 'odd';

  for (const pair of pairs) {
    if (orderedOnOdd) {
      slots.push(pair.ordered, pair.shuffled);
      placementSlots.push(false, true);
    } else {
      slots.push(pair.shuffled, pair.ordered);
      placementSlots.push(true, false);
    }
  }

  if (slots.length > ROWS) throw new Error(`Mixed card exceeds ${ROWS} rows`);
  return { slots, placementSlots };
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
  return `[${index}] ${JSON.stringify(value)}`;
}

function cardSvg(slots) {
  const texts = slots.map((value, row) => {
    const line = visibleLine(value, row);
    if (line.length > COLUMNS) throw new Error(`Rendered row ${row} exceeds conservative width: ${line.length} > ${COLUMNS}`);
    const y = PAD_Y + ((row + 1) * CHARACTER_HEIGHT_PX) - 3;
    return `<text x="${PAD_X}" y="${y}">${xmlEscape(line)}</text>`;
  }).join('');

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_WIDTH}" height="${VIEWPORT_HEIGHT}" viewBox="0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}">` +
    `<rect width="100%" height="100%" fill="white"/>` +
    `<g xml:space="preserve" fill="black" font-family="DejaVu Sans Mono, monospace" font-size="${FONT_SIZE_PX}px">${texts}</g>` +
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

  if (canonical.length % ROWS !== 0) throw new Error('Canonical item count must fill whole ordered cards');
  const referenceCardCount = canonical.length / ROWS;
  const referenceGroups = [];
  for (let i = 0; i < canonical.length; i += ROWS) {
    referenceGroups.push(canonical.slice(i, i + ROWS));
  }

  const pairs = canonical.map((ordered, i) => ({ ordered, shuffled: shuffled[i] }));
  const pairsPerMixedCard = ROWS / 2;
  const mixedCardCount = referenceCardCount * 2;
  const mixedGroups = [];
  for (let i = 0; i < pairs.length; i += pairsPerMixedCard) {
    mixedGroups.push(pairs.slice(i, i + pairsPerMixedCard));
  }
  if (mixedGroups.length !== mixedCardCount) {
    throw new Error(`Expected ${mixedCardCount} mixed cards, got ${mixedGroups.length}`);
  }

  fs.mkdirSync(readingRoom, { recursive: true });
  removeGeneratedCards();
  removeLegacyCanonical();
  removeActiveChallenges();

  const cards = {};

  for (const group of referenceGroups) {
    const { fileName, pngSha256 } = await writeCard(group);
    cards[fileName] = {
      role: 'ordered-reference',
      slots: group,
      placement_slots: Array(group.length).fill(false),
      png_sha256: pngSha256
    };
  }

  for (const group of mixedGroups) {
    const orderedParity = crypto.randomInt(0, 2) === 0 ? 'odd' : 'even';
    const { slots, placementSlots } = buildMixedSlots(group, orderedParity);
    const { fileName, pngSha256 } = await writeCard(slots);
    cards[fileName] = {
      role: 'mixed',
      ordered_parity: orderedParity,
      slots,
      placement_slots: placementSlots,
      png_sha256: pngSha256
    };
  }

  fs.mkdirSync(manifestRoot, { recursive: true });
  writeJson(manifestPath(sha), {
    challenge: 'agents-png-locator-v2',
    challenge_commit_sha: sha,
    source_blob_sha: full.source_blob_sha,
    item_count: canonical.length,
    logical_copies: { ordered: 2, shuffled: 1 },
    cards
  });

  const challenge = {
    challenge: 'agents-png-locator-v2',
    source_blob_sha: full.source_blob_sha,
    handshake: {
      protocol: 'This challenge is a handshake. Issuing the challenge is the request leg; committing a completed locator is the response leg; a verifier PASS is the acknowledgement that closes the handshake.',
      no_end_of_turn: 'Do not end the turn while this handshake remains open. Continue the read, solve, submit, and evaluate sequence until the verifier returns PASS, unless live evidence establishes an external blocker that makes continuation impossible.',
      completion_condition: 'The handshake is complete only after the verifier returns PASS for the active challenge. A plan, partial locator, submission without PASS, or statement of completion does not close the handshake.'
    },
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
      logical_ordered_copies: 2,
      logical_shuffled_copies: 1,
      dense_ordered_reference_cards: referenceGroups.length,
      mixed_interleave_cards: mixedGroups.length,
      total_cards: Object.keys(cards).length,
      filenames_are_random: true,
      collection_is_mixed: true,
      interleave_rule: 'On every mixed card, counting the first visible row as 1, the ordered-array copy occupies only one parity (all odd rows or all even rows). The shuffled-array copy occupies the opposite parity.',
      placement_rule: 'Only shuffled rows on mixed cards are legal placement sources. Dense ordered-reference rows and ordered-parity rows on mixed cards are reference-only.'
    },
    answer_format: 'locator[n] = [png_filename, zero_based_array_index_in_that_png]',
    item_count: canonical.length,
    locator: Array(canonical.length).fill(null)
  };

  const active = pathsFor(sha).active;
  writeJson(active, challenge);
  console.log(`[live-ground-truth] issued ${path.basename(active)} with ${Object.keys(cards).length} random PNG cards (${referenceGroups.length} dense ordered-reference, ${mixedGroups.length} ordered+shuffled interleave)`);
  console.log(`[live-ground-truth] logical corpus = ordered x2 + shuffled x1; Cpx=${CPX}; items=${canonical.length}`);
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
  if (!manifest || manifest.challenge !== 'agents-png-locator-v2' || !manifest.cards) {
    throw new Error('Invalid challenge manifest');
  }

  const inventory = new Map();
  for (const [name, card] of Object.entries(manifest.cards)) {
    if (!CARD_NAME_RE.test(name) || !Array.isArray(card.slots) || !Array.isArray(card.placement_slots)) {
      throw new Error(`Invalid manifest card: ${name}`);
    }
    if (card.slots.length !== card.placement_slots.length) throw new Error(`Placement mask mismatch: ${name}`);

    const pngPath = path.join(readingRoom, name);
    if (!fs.existsSync(pngPath)) throw new Error(`Challenge PNG is missing: ${name}`);
    const actualSha = sha256(fs.readFileSync(pngPath));
    if (actualSha !== card.png_sha256) throw new Error(`Challenge PNG was modified: ${name}`);

    inventory.set(name, {
      slots: card.slots,
      placementSlots: card.placement_slots
    });
  }
  return { manifest, inventory };
}

function verifyLocator(locator, canonical, inventory) {
  if (!Array.isArray(locator) || locator.length !== canonical.length) return false;

  let legalPlacementCount = 0;
  for (const card of inventory.values()) {
    legalPlacementCount += card.placementSlots.filter(Boolean).length;
  }
  if (legalPlacementCount !== canonical.length) return false;

  const used = new Set();
  for (let n = 0; n < canonical.length; n++) {
    const loc = locator[n];
    if (!Array.isArray(loc) || loc.length !== 2) return false;
    const [fileName, arrayIndex] = loc;
    if (typeof fileName !== 'string' || !CARD_NAME_RE.test(fileName)) return false;
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) return false;

    const card = inventory.get(fileName);
    if (!card || arrayIndex >= card.slots.length || card.placementSlots[arrayIndex] !== true) return false;

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
    submitted?.challenge === 'agents-png-locator-v2' &&
    submitted?.source_blob_sha === full.source_blob_sha &&
    verifyLocator(submitted.locator, full.items, inventory);

  fs.rmSync(absoluteChallenge, { force: true });
  removeGeneratedCards();

  if (pass) {
    writeJson(resultPaths.pass, {
      status: 'PASS',
      source_blob_sha: full.source_blob_sha,
      item_count: full.items.length
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