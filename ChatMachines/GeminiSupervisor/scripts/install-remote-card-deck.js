'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const repoRoot = path.resolve(__dirname, '../../..');
const supervisorRoot = path.join(repoRoot, 'ChatMachines/GeminiSupervisor');
const readingRoom = path.join(supervisorRoot, 'live-ground-truth/reading-room');
const CARD_RE = /^[0-9a-f]{32}\.png$/;
const ACTIVE_RE = /^Agents\.reader\.json-[0-9a-f]{40}$/i;

function removeOldDeck() {
  fs.mkdirSync(readingRoom, { recursive: true });
  for (const name of fs.readdirSync(readingRoom)) {
    if (CARD_RE.test(name) || ACTIVE_RE.test(name)) {
      fs.rmSync(path.join(readingRoom, name), { force: true });
    }
  }
}

async function main() {
  const responsePath = process.argv[2];
  const commitSha = process.argv[3];
  if (!responsePath || !/^[0-9a-f]{40}$/i.test(commitSha || '')) {
    throw new Error('Usage: install-remote-card-deck.js <response-json> <commit-sha>');
  }

  const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
  if (response.protocol !== 'agents-png-remote-deck-v1') throw new Error('Unexpected remote deck protocol');
  if (!Array.isArray(response.cards) || response.cards.length !== response.total_card_count) throw new Error('Invalid remote card collection');
  if (!response.viewport || !Number.isInteger(response.viewport.rows) || response.viewport.rows <= 0) throw new Error('Invalid viewport');
  if (response.total_card_count !== response.ordered_card_count + response.mixed_card_count) throw new Error('Card count invariant failed');
  if (response.mixed_card_count !== response.ordered_card_count * 2) throw new Error('Expected exact 1:2 ordered/mixed card ratio');

  const names = new Set();
  for (const card of response.cards) {
    if (!card || typeof card.file !== 'string' || !CARD_RE.test(card.file)) throw new Error('Invalid random card filename');
    if (names.has(card.file)) throw new Error(`Duplicate card filename ${card.file}`);
    if (typeof card.svg !== 'string' || !card.svg.startsWith('<svg')) throw new Error(`Invalid SVG deck entry ${card.file}`);
    names.add(card.file);
  }

  removeOldDeck();

  for (const card of response.cards) {
    const output = path.join(readingRoom, card.file);
    const info = await sharp(Buffer.from(card.svg, 'utf8'))
      .png({ compressionLevel: 9 })
      .toFile(output);
    if (info.width !== response.viewport.width_px || info.height !== response.viewport.height_px) {
      throw new Error(`Unexpected raster dimensions for ${card.file}: ${info.width}x${info.height}`);
    }
  }

  const challenge = {
    challenge: 'agents-png-locator-v3-remote-deck',
    run: response.run,
    source_blob_sha: response.source_blob_sha,
    viewport: response.viewport,
    card_model: {
      ordered_reference_cards: response.ordered_card_count,
      mixed_interleave_cards: response.mixed_card_count,
      total_cards: response.total_card_count,
      filenames_are_random: true,
      collection_order_is_random: true,
      interleave_rule: 'On every mixed card, one visible-row parity contains an ordered contiguous segment; the opposite parity contains the shuffled copy. Parity is independently randomized per mixed card.',
      placement_rule: 'The locator maps canonical positions to the shuffled occurrences on mixed cards.'
    },
    answer_format: 'locator[n] = [png_filename, zero_based_visible_row_position]',
    item_count: response.item_count,
    locator: Array(response.item_count).fill(null)
  };

  const challengePath = path.join(readingRoom, `Agents.reader.json-${commitSha.toLowerCase()}`);
  fs.writeFileSync(challengePath, JSON.stringify(challenge) + '\n', 'utf8');
  console.log(`[remote-deck] installed ${response.total_card_count} PNG cards and ${path.basename(challengePath)}`);
}

main().catch(error => {
  console.error(`[remote-deck] ${error.stack || error.message}`);
  process.exitCode = 1;
});
