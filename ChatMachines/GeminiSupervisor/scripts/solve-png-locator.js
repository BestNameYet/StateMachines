'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const repoRoot = path.resolve(__dirname, '../../..');
const supervisorRoot = path.join(repoRoot, 'ChatMachines/GeminiSupervisor');
const sourcePath = path.join(supervisorRoot, 'Agents.md');
const readingRoom = path.join(supervisorRoot, 'live-ground-truth/reading-room');

const WIDTH = 1440;
const HEIGHT = 900;
const CHAR_HEIGHT = 20;
const CHAR_WIDTH = 12;
const PAD_X = 24;
const PAD_Y = 20;
const FONT_SIZE = 20;
const ROWS = Math.floor((HEIGHT - (2 * PAD_Y)) / CHAR_HEIGHT);
const COLUMNS = Math.floor((WIDTH - (2 * PAD_X)) / CHAR_WIDTH);
const INDEX_PREFIX_CHARS = 8;
const ACTIVE_RE = /^Agents\.reader\.json-([0-9a-f]{40})$/i;
const CARD_RE = /^[0-9a-f]{32}\.png$/;

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
  const text = fs.readFileSync(sourcePath, 'utf8');
  const items = [];
  const re = /(.*?)(\r\n|\n|\r|$)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[0] === '' && re.lastIndex === text.length) break;
    items.push(...splitLineToRenderableItems(match[1], match[2]));
    if (match[2] === '') break;
  }
  return items;
}

function xmlEscape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function candidateCardSvg(value) {
  const texts = [];
  for (let row = 0; row < ROWS; row++) {
    const line = `[${row}] ${JSON.stringify(value)}`;
    const y = PAD_Y + ((row + 1) * CHAR_HEIGHT) - 3;
    texts.push(`<text x="${PAD_X}" y="${y}">${xmlEscape(line)}</text>`);
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="100%" height="100%" fill="white"/>` +
    `<g xml:space="preserve" fill="black" font-family="DejaVu Sans Mono, monospace" font-size="${FONT_SIZE}px">${texts.join('')}</g>` +
    `</svg>`,
    'utf8'
  );
}

function rowHash(raw, width, channels, row) {
  const hash = crypto.createHash('sha256');
  const top = PAD_Y + (row * CHAR_HEIGHT);
  for (let y = top; y < top + CHAR_HEIGHT; y++) {
    const start = (y * width) * channels;
    const end = start + (width * channels);
    hash.update(raw.subarray(start, end));
  }
  return hash.digest('hex');
}

function rowHasInk(raw, width, channels, row) {
  const top = PAD_Y + (row * CHAR_HEIGHT);
  for (let y = top; y < top + CHAR_HEIGHT; y++) {
    const start = (y * width) * channels;
    const end = start + (width * channels);
    for (let i = start; i < end; i++) if (raw[i] !== 255) return true;
  }
  return false;
}

async function buildCandidateMaps(canonical) {
  const byKey = new Map();
  for (const item of canonical) byKey.set(JSON.stringify(item), item);
  const unique = [...byKey.entries()];
  const maps = Array.from({ length: ROWS }, () => new Map());

  const batchSize = 16;
  for (let offset = 0; offset < unique.length; offset += batchSize) {
    const batch = unique.slice(offset, offset + batchSize);
    const results = await Promise.all(batch.map(async ([key, value]) => {
      const { data, info } = await sharp(candidateCardSvg(value))
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return { key, hashes: Array.from({ length: ROWS }, (_, row) => rowHash(data, info.width, info.channels, row)) };
    }));
    for (const result of results) {
      for (let row = 0; row < ROWS; row++) {
        const hash = result.hashes[row];
        const existing = maps[row].get(hash);
        if (existing && existing !== result.key) {
          throw new Error(`Pixel collision at row ${row}: ${existing} <> ${result.key}`);
        }
        maps[row].set(hash, result.key);
      }
    }
  }
  console.log(`[solver] exact-position signatures=${unique.length * ROWS}`);
  return maps;
}

async function decodeCard(filePath, maps, canonicalByKey) {
  const { data, info } = await sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== WIDTH || info.height !== HEIGHT) {
    throw new Error(`Unexpected card dimensions ${path.basename(filePath)}: ${info.width}x${info.height}`);
  }
  const rows = [];
  for (let row = 0; row < ROWS; row++) {
    const key = maps[row].get(rowHash(data, info.width, info.channels, row));
    if (!key) {
      if (!rowHasInk(data, info.width, info.channels, row)) break;
      throw new Error(`Unmatched rendered row ${row} in ${path.basename(filePath)}`);
    }
    rows.push({ row, key, value: canonicalByKey.get(key) });
  }
  if (!rows.length) throw new Error(`No decodable rows in ${path.basename(filePath)}`);
  return rows;
}

function contiguousStart(sequenceKeys, canonicalKeys) {
  if (!sequenceKeys.length) return -1;
  const first = sequenceKeys[0];
  for (let start = 0; start + sequenceKeys.length <= canonicalKeys.length; start++) {
    if (canonicalKeys[start] !== first) continue;
    let ok = true;
    for (let j = 1; j < sequenceKeys.length; j++) {
      if (canonicalKeys[start + j] !== sequenceKeys[j]) { ok = false; break; }
    }
    if (ok) return start;
  }
  return -1;
}

function findActiveChallenge() {
  const names = fs.readdirSync(readingRoom).filter((name) => ACTIVE_RE.test(name));
  if (names.length !== 1) throw new Error(`Expected exactly one active challenge, found ${names.length}`);
  return path.join(readingRoom, names[0]);
}

async function main() {
  const activePath = findActiveChallenge();
  const challenge = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  if (challenge.challenge !== 'agents-png-locator-v2') throw new Error(`Unsupported challenge ${challenge.challenge}`);

  const canonical = projectAgents();
  if (canonical.length !== challenge.item_count) throw new Error(`Canonical item count mismatch ${canonical.length} != ${challenge.item_count}`);
  const canonicalKeys = canonical.map(JSON.stringify);
  const canonicalByKey = new Map(canonical.map((item) => [JSON.stringify(item), item]));
  const maps = await buildCandidateMaps(canonical);

  const cardNames = fs.readdirSync(readingRoom).filter((name) => CARD_RE.test(name)).sort();
  if (cardNames.length !== challenge.card_model.total_cards) throw new Error(`Card count mismatch ${cardNames.length} != ${challenge.card_model.total_cards}`);

  const placement = new Map();
  let mixedCount = 0;
  let referenceCount = 0;

  for (const name of cardNames) {
    const rows = await decodeCard(path.join(readingRoom, name), maps, canonicalByKey);
    const fullStart = contiguousStart(rows.map((r) => r.key), canonicalKeys);
    if (fullStart >= 0) { referenceCount++; continue; }

    const evenRows = rows.filter((r) => r.row % 2 === 0);
    const oddRows = rows.filter((r) => r.row % 2 === 1);
    const evenStart = contiguousStart(evenRows.map((r) => r.key), canonicalKeys);
    const oddStart = contiguousStart(oddRows.map((r) => r.key), canonicalKeys);
    const evenOrdered = evenStart >= 0;
    const oddOrdered = oddStart >= 0;
    if (evenOrdered === oddOrdered) throw new Error(`Could not determine ordered parity for ${name}: even=${evenStart}, odd=${oddStart}`);

    mixedCount++;
    const shuffledRows = evenOrdered ? oddRows : evenRows;
    for (const row of shuffledRows) {
      if (!placement.has(row.key)) placement.set(row.key, []);
      placement.get(row.key).push([name, row.row]);
    }
  }

  if (mixedCount !== challenge.card_model.mixed_interleave_cards) throw new Error(`Mixed card count mismatch ${mixedCount} != ${challenge.card_model.mixed_interleave_cards}`);
  if (referenceCount !== challenge.card_model.dense_ordered_reference_cards) throw new Error(`Reference card count mismatch ${referenceCount} != ${challenge.card_model.dense_ordered_reference_cards}`);

  const locator = [];
  for (const key of canonicalKeys) {
    const queue = placement.get(key);
    if (!queue || !queue.length) throw new Error(`No unused shuffled occurrence for ${key}`);
    locator.push(queue.shift());
  }
  let leftovers = 0;
  for (const queue of placement.values()) leftovers += queue.length;
  if (leftovers !== 0) throw new Error(`Unused shuffled slots remain: ${leftovers}`);

  challenge.locator = locator;
  fs.writeFileSync(activePath, JSON.stringify(challenge) + '\n', 'utf8');
  console.log(`[solver] SOLVED ${path.basename(activePath)} items=${locator.length}, cards=${cardNames.length}`);
}

main().catch((error) => {
  console.error(`[solver] ${error.stack || error.message}`);
  process.exitCode = 1;
});
