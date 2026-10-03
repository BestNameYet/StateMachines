'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const supervisorRoot = path.join(repoRoot, 'ChatMachines/GeminiSupervisor');
const readingRoom = path.join(supervisorRoot, 'live-ground-truth/reading-room');

const ACTIVE_RE = /^Agents\.reader\.json-([0-9a-f]{40})$/i;
const CARD_RE = /^[0-9a-f]{32}\.png$/;
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;
const BATCH_SIZE = Number(process.env.PNG_AGENT_BATCH_SIZE || 6);
const REQUEST_TIMEOUT_MS = Number(process.env.PNG_AGENT_TIMEOUT_MS || 300000);

if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
if (!model) throw new Error('GEMINI_MODEL is missing');

function findActiveChallenge() {
  const names = fs.readdirSync(readingRoom).filter(name => ACTIVE_RE.test(name));
  if (names.length !== 1) throw new Error(`Expected exactly one active challenge; found ${names.length}`);
  return path.join(readingRoom, names[0]);
}

function extractJson(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch (error) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!fenced) throw error;
    return JSON.parse(fenced[1]);
  }
}

async function callGemini(parts, systemInstruction, maxOutputTokens = 32768) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens
        }
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }
  );

  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch (_) {
    throw new Error(`Gemini returned non-JSON HTTP ${response.status}: ${raw.slice(0, 2000)}`);
  }
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  const reply = body.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim();
  if (!reply) throw new Error(`Gemini returned no text: ${JSON.stringify(body).slice(0, 4000)}`);
  return extractJson(reply);
}

function imagePart(fileName) {
  const bytes = fs.readFileSync(path.join(readingRoom, fileName));
  return {
    inline_data: {
      mime_type: 'image/png',
      data: bytes.toString('base64')
    }
  };
}

function validateTranscription(payload, expectedFiles, rowsPerCard) {
  if (!payload || !Array.isArray(payload.cards) || payload.cards.length !== expectedFiles.length) return false;
  const byName = new Map(payload.cards.map(card => [card.file, card]));
  for (const file of expectedFiles) {
    const card = byName.get(file);
    if (!card || !Array.isArray(card.rows) || card.rows.length !== rowsPerCard) return false;
    if (!card.rows.every((row, i) => row && row.position === i && typeof row.text === 'string')) return false;
  }
  return true;
}

async function transcribeBatch(files, rowsPerCard) {
  const parts = [{
    text:
      `Read every supplied PNG card. Each card has exactly ${rowsPerCard} visible numbered rows, positions 0 through ${rowsPerCard - 1}. ` +
      'Transcribe the visible row payloads exactly. Preserve punctuation, quotes, backslashes, spaces inside strings, and JSON escape sequences. ' +
      'Do not infer hidden source files and do not reorder rows. Return JSON only as {"cards":[{"file":"...png","rows":[{"position":0,"text":"complete visible row text"}, ...]}]}. ' +
      'The text field must contain the COMPLETE visible row including its leading [position] prefix.'
  }];

  for (const file of files) {
    parts.push({ text: `FILE ${file}` });
    parts.push(imagePart(file));
  }

  const system =
    'You are the visual reading worker for a document-reading enforcement test. ' +
    'Your only evidence is the PNG pixels supplied in this request. Perform careful visual/OCR reading; do not use repository source text, manifests, or guessed content.';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await callGemini(parts, system, 32768);
    if (validateTranscription(result, files, rowsPerCard)) return result.cards;
    console.error(`[agent-test] transcription validation failed, attempt ${attempt}, files=${files.join(',')}`);
  }
  throw new Error(`Gemini could not return a complete ${rowsPerCard}-row transcription for batch ${files.join(',')}`);
}

function validateLocator(locator, challenge, cardNames) {
  if (!Array.isArray(locator) || locator.length !== challenge.item_count) return false;
  const known = new Set(cardNames);
  return locator.every(loc =>
    Array.isArray(loc) && loc.length === 2 &&
    typeof loc[0] === 'string' && known.has(loc[0]) &&
    Number.isInteger(loc[1]) && loc[1] >= 0 && loc[1] < challenge.viewport.rows
  );
}

async function solveFromTranscriptions(challenge, cardRows, cardNames) {
  const compact = {};
  for (const file of cardNames) {
    compact[file] = cardRows.get(file).map(row => row.text);
  }

  const instructions = [
    'Solve the locator challenge using ONLY the supplied card transcriptions.',
    `There are ${challenge.card_model.dense_ordered_reference_cards} ordered-reference cards and ${challenge.card_model.mixed_interleave_cards} mixed cards, randomly named and mixed together.`,
    `The canonical ordered array has ${challenge.item_count} positions.`,
    'Every card has the same number of visible rows.',
    'An ordered-reference card contains only a contiguous segment of the canonical ordered array.',
    'On each mixed card, one fixed visible-row parity is a contiguous segment of the canonical ordered array and the opposite parity is shuffled material. The ordered parity may differ from card to card.',
    'Determine the global canonical order from the ordered material. Then, for every canonical position n, locate the matching SHUFFLED occurrence on a mixed card and return [filename, zero-based visible row position].',
    'Do not use ordered-reference rows or ordered-parity rows as locator sources.',
    'Each shuffled visible position may be used once. Duplicate values may be assigned to any otherwise-valid unused shuffled occurrence containing the identical value.',
    `Return JSON only: {"locator":[...]} with exactly ${challenge.item_count} entries. No prose.`,
    '',
    'CARD TRANSCRIPTIONS:',
    JSON.stringify(compact)
  ].join('\n');

  const system =
    'You are the solving agent in a document-reading enforcement test. The transcriptions are the complete evidence produced from the PNG cards. ' +
    'Reconstruct the ordered array and produce the requested shuffled locator. Do not assume filename order carries meaning.';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await callGemini([{ text: instructions }], system, 65536);
    if (validateLocator(result.locator, challenge, cardNames)) return result.locator;
    console.error(`[agent-test] locator shape validation failed, attempt ${attempt}`);
  }
  throw new Error('Gemini did not return a complete locator of the required shape');
}

async function main() {
  const activePath = findActiveChallenge();
  const challenge = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  if (challenge.challenge !== 'agents-png-locator-v2') throw new Error(`Unsupported challenge ${challenge.challenge}`);

  const cardNames = fs.readdirSync(readingRoom).filter(name => CARD_RE.test(name)).sort();
  if (cardNames.length !== challenge.card_model.total_cards) {
    throw new Error(`Expected ${challenge.card_model.total_cards} PNGs, found ${cardNames.length}`);
  }

  const cardRows = new Map();
  for (let offset = 0; offset < cardNames.length; offset += BATCH_SIZE) {
    const batch = cardNames.slice(offset, offset + BATCH_SIZE);
    console.log(`[agent-test] visual read batch ${offset / BATCH_SIZE + 1}/${Math.ceil(cardNames.length / BATCH_SIZE)} (${batch.length} cards)`);
    const cards = await transcribeBatch(batch, challenge.viewport.rows);
    for (const card of cards) cardRows.set(card.file, card.rows);
  }

  if (cardRows.size !== cardNames.length) throw new Error(`Transcribed ${cardRows.size}/${cardNames.length} cards`);
  console.log(`[agent-test] all ${cardRows.size} cards read; asking model to reconstruct locator`);

  const locator = await solveFromTranscriptions(challenge, cardRows, cardNames);
  challenge.locator = locator;
  fs.writeFileSync(activePath, JSON.stringify(challenge) + '\n', 'utf8');
  console.log(`[agent-test] wrote model-produced locator with ${locator.length} entries to ${path.basename(activePath)}`);
}

main().catch(error => {
  console.error(`[agent-test] ${error.stack || error.message}`);
  process.exitCode = 1;
});
