'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const repoRoot = path.resolve(__dirname, '../../..');
const readingRoom = path.join(repoRoot, 'ChatMachines/GeminiSupervisor/live-ground-truth/reading-room');
const TASK_ID = 'task_semantic_define_each_array_item';
const ACTIVE_RE = new RegExp(`^${TASK_ID}-([0-9a-f]{40})\\.json$`, 'i');
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;
const BATCH_SIZE = Number(process.env.COMPREHENSION_BATCH_SIZE || 24);
const REQUEST_TIMEOUT_MS = Number(process.env.COMPREHENSION_TIMEOUT_MS || 300000);

if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
if (!model) throw new Error('GEMINI_MODEL is missing');

function findActiveTask() {
  const names = fs.readdirSync(readingRoom).filter(name => ACTIVE_RE.test(name));
  if (names.length !== 1) throw new Error(`Expected exactly one active comprehension task; found ${names.length}`);
  return path.join(readingRoom, names[0]);
}

function resolveRepoFile(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') throw new Error('Expected a non-empty repository-relative filename.');
  const resolved = path.resolve(repoRoot, relativePath);
  const prefix = `${repoRoot}${path.sep}`;
  if (resolved !== repoRoot && !resolved.startsWith(prefix)) throw new Error(`Path escapes repository root: ${relativePath}`);
  return resolved;
}

function terminalNode(value) {
  let node = value;
  while (node !== null && typeof node === 'object') {
    if (Array.isArray(node)) {
      if (node.length !== 1) return node;
      node = node[0];
      continue;
    }
    const keys = Object.keys(node);
    if (keys.length !== 1) return node;
    node = node[keys[0]];
  }
  return node;
}

function terminalIsEmptyContainer(value) {
  const terminal = terminalNode(value);
  if (Array.isArray(terminal)) return terminal.length === 0;
  return terminal !== null && typeof terminal === 'object' && Object.keys(terminal).length === 0;
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

function validDefinitionArray(value, expectedLength) {
  return Array.isArray(value) && value.length === expectedLength && value.every(record => {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) return false;
    const keys = Object.keys(record);
    return keys.length === 1 && keys[0] === 'item' && typeof record.item === 'string' && record.item.trim() !== '';
  });
}

async function defineBatch(batch, filename, batchNumber, batchCount) {
  const prompt = [
    `Target filename: ${filename}`,
    `Batch ${batchNumber} of ${batchCount}.`,
    'Each INPUT_SIGNATURE below is one non-empty flattened semantic signature from that JSON array.',
    'For every signature, in the exact supplied order, generate its semantic definition in the context of the target filename.',
    'Define what the signature means in the document/task contract, using its path, field name, and terminal value. Do not merely restate JSON syntax.',
    'Return definition only. Each output record must have exactly one key named item and one non-empty string value.',
    `Return JSON only as an array of exactly ${batch.length} records: [{"item":"semantic definition"}, ...].`,
    'Do not add source indexes, source values, categories, confidence, gate fields, commentary, or any other keys.',
    '',
    'INPUT_SIGNATURES:',
    JSON.stringify(batch)
  ].join('\n');

  const system = [
    'You are the semantic-definition worker for a comprehension-task test.',
    'The supplied JSON signatures are authoritative input evidence.',
    'A flattened signature encodes a document path and usually a terminal field/value. Explain the semantic role of that exact signature in context.',
    'Output one definition-only record for every supplied signature, preserving order exactly.',
    'Do not omit, merge, reorder, or add records.'
  ].join(' ');

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await callGemini([{ text: prompt }], system, 32768);
    if (validDefinitionArray(result, batch.length)) return result;
    console.error(`[comprehension-agent] batch ${batchNumber} shape validation failed, attempt ${attempt}`);
  }
  throw new Error(`Gemini could not return a valid definition-only array for batch ${batchNumber}`);
}

function writeGzip(relativePath, value) {
  const absolute = resolveRepoFile(relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  fs.writeFileSync(absolute, zlib.gzipSync(bytes, { level: 9 }));
}

async function main() {
  const activePath = findActiveTask();
  const task = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  const filename = task?.verify_target_array?.filename;
  const targetPath = resolveRepoFile(filename);
  const source = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  if (!Array.isArray(source)) throw new Error('Comprehension target must be a top-level JSON array');

  const nonempty = source.filter(item => !terminalIsEmptyContainer(item));
  const expectedCount = nonempty.length;
  const batchCount = Math.ceil(expectedCount / BATCH_SIZE);
  const activeName = path.basename(activePath);
  const commitSha = (activeName.match(ACTIVE_RE) || [])[1];
  if (!commitSha) throw new Error(`Could not derive task instance SHA from ${activeName}`);

  const archiveRoot = `ChatMachines/GeminiSupervisor/live-ground-truth/reading-room/comprehension-task-batches/${commitSha}`;
  const batchArchiveFilenames = [];
  const allRecords = [];

  console.log(`[comprehension-agent] source items=${source.length}; nonempty=${expectedCount}; batches=${batchCount}`);

  for (let offset = 0; offset < expectedCount; offset += BATCH_SIZE) {
    const batchNumber = Math.floor(offset / BATCH_SIZE) + 1;
    const batch = nonempty.slice(offset, offset + BATCH_SIZE);
    console.log(`[comprehension-agent] semantic batch ${batchNumber}/${batchCount} (${batch.length} signatures)`);
    const records = await defineBatch(batch, filename, batchNumber, batchCount);
    allRecords.push(...records);

    const batchRelative = `${archiveRoot}/batch-${String(batchNumber).padStart(4, '0')}.json.gz`;
    writeGzip(batchRelative, records);
    batchArchiveFilenames.push(batchRelative);
  }

  if (!validDefinitionArray(allRecords, expectedCount)) throw new Error('Combined semantic output failed definition-only validation');

  const completeRelative = `${archiveRoot}/complete.json.gz`;
  writeGzip(completeRelative, allRecords);

  task.count_array_nonempty_items.how_many = expectedCount;
  task.doRecord_withReturnSchema.nonempty_items_counted = expectedCount;
  task.doRecord_withReturnSchema.returnSchemaArraySize = expectedCount;
  task.doRecord_withReturnSchema.returnSchemaArray = allRecords;
  task.doRecord_withReturnSchema.batch_archive_filenames = batchArchiveFilenames;
  task.combine_and_send_batch_archives.complete_batch_archive_filename = completeRelative;

  fs.writeFileSync(activePath, `${JSON.stringify(task, null, 2)}\n`, 'utf8');
  console.log(`[comprehension-agent] completed ${expectedCount} definitions; archive=${completeRelative}`);
}

main().catch(error => {
  console.error(`[comprehension-agent] ${error.stack || error.message}`);
  process.exitCode = 1;
});
