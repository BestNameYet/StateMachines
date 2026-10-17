'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(process.cwd());
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const maxTokens = 12000;
const outRoot = 'ChatMachines/TokenizerCalibration';
const batchesRoot = path.join(outRoot, 'stage1-batches');

const corpus = [
  { path: 'ChatMachines/GeminiSupervisor/config.json', classification: 'required', kind: 'json' },
  { path: 'ChatMachines/GeminiSupervisor/Agents.md', classification: 'required', kind: 'agents' },
  { path: 'ChatMachines/GeminiSupervisor/send-to-gemini.js', classification: 'required', kind: 'javascript' },
  { path: '.github/workflows/gemini-chat.yml', classification: 'required', kind: 'text' },
  { path: 'ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json', classification: 'required', kind: 'json' },
  { path: 'ChatMachines/GeminiSupervisor/skills/live-ground-truth-verification/SKILL.md', classification: 'supporting', kind: 'text' },
  { path: 'ChatMachines/GeminiSupervisor/work-action-approval-rulebook.json', classification: 'supporting', kind: 'json' },
  { path: 'ChatMachines/GeminiSupervisor/dependency-map.json', classification: 'supporting', kind: 'json' },
  { path: 'ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json', classification: 'supporting', kind: 'json' },
  { path: 'ChatMachines/GeminiSupervisor/MANIFEST.md', classification: 'supporting', kind: 'text' },
  { path: 'ChatMachines/GeminiSupervisor/runs/demo_20260930T155153_eadd5e5248/state.json', classification: 'optional_sample', kind: 'json' }
];

function readText(rel) {
  return fs.readFileSync(path.resolve(repoRoot, rel), 'utf8');
}

function agentsJsonByHeader(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let currentHeader = 'Agents.md';
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].match(/^#{1,6}\s+(.+?)\s*$/);
    if (header) {
      currentHeader = header[1];
      continue;
    }
    if (lines[i].trim() !== '```json') continue;
    const jsonLines = [];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '```') {
      jsonLines.push(lines[i]);
      i += 1;
    }
    const text = jsonLines.join('\n').trim();
    if (text) sections.push({ [currentHeader]: JSON.parse(text) });
  }
  return sections;
}

function normalizeDocument(spec) {
  const raw = readText(spec.path);
  if (spec.kind === 'json') return JSON.stringify(JSON.parse(raw));
  if (spec.kind === 'agents') return JSON.stringify(agentsJsonByHeader(raw));
  return raw;
}

async function countTokens(text) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:countTokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }] })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`countTokens ${response.status}: ${body}`);
  const parsed = JSON.parse(body);
  return parsed.totalTokens;
}

function wrapped(pathName, classification, segment, content) {
  return { path: pathName, classification, segment, content };
}

function splitJs(text, spec) {
  const matches = [...text.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)];
  if (!matches.length) return [wrapped(spec.path, spec.classification, 'whole', text)];
  const units = [];
  if (matches[0].index > 0) {
    units.push(wrapped(spec.path, spec.classification, 'preamble', text.slice(0, matches[0].index)));
  }
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    units.push(wrapped(spec.path, spec.classification, `function:${matches[i][1]}`, text.slice(start, end)));
  }
  return units;
}

function splitMarkdown(text, spec) {
  const matches = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)];
  if (!matches.length) return [wrapped(spec.path, spec.classification, 'whole', text)];
  const units = [];
  if (matches[0].index > 0) units.push(wrapped(spec.path, spec.classification, 'preamble', text.slice(0, matches[0].index)));
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    units.push(wrapped(spec.path, spec.classification, `heading:${matches[i][1].trim()}`, text.slice(start, end)));
  }
  return units;
}

async function splitJsonValue(value, spec, jsonPath = '$') {
  const candidate = wrapped(spec.path, spec.classification, jsonPath, JSON.stringify(value));
  if (await countTokens(JSON.stringify([candidate])) <= maxTokens) return [candidate];

  if (Array.isArray(value)) {
    if (value.length <= 1) throw new Error(`Unsplittable JSON array segment exceeds ${maxTokens} tokens: ${spec.path} ${jsonPath}`);
    const mid = Math.ceil(value.length / 2);
    return [
      ...(await splitJsonValue(value.slice(0, mid), spec, `${jsonPath}[0:${mid}]`)),
      ...(await splitJsonValue(value.slice(mid), spec, `${jsonPath}[${mid}:${value.length}]`))
    ];
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) throw new Error(`Unsplittable JSON object segment exceeds ${maxTokens} tokens: ${spec.path} ${jsonPath}`);
    if (entries.length === 1) {
      const [key, child] = entries[0];
      return splitJsonValue(child, spec, `${jsonPath}.${key}`);
    }
    const out = [];
    for (const [key, child] of entries) {
      out.push(...await splitJsonValue(child, spec, `${jsonPath}.${key}`));
    }
    return out;
  }

  throw new Error(`Unsplittable scalar exceeds ${maxTokens} tokens: ${spec.path} ${jsonPath}`);
}

async function splitOversizeText(unit) {
  const lines = unit.content.split(/(?<=\n)/);
  if (lines.length <= 1) throw new Error(`Unsplittable text segment exceeds ${maxTokens} tokens: ${unit.path} ${unit.segment}`);
  const out = [];
  let current = '';
  let part = 0;
  for (const line of lines) {
    const proposed = current + line;
    const probe = wrapped(unit.path, unit.classification, `${unit.segment}:part-${part}`, proposed);
    if (current && await countTokens(JSON.stringify([probe])) > maxTokens) {
      out.push(wrapped(unit.path, unit.classification, `${unit.segment}:part-${part}`, current));
      part += 1;
      current = line;
    } else {
      current = proposed;
    }
  }
  if (current) out.push(wrapped(unit.path, unit.classification, `${unit.segment}:part-${part}`, current));
  return out;
}

async function initialUnits(spec, content) {
  const whole = wrapped(spec.path, spec.classification, 'whole', content);
  if (await countTokens(JSON.stringify([whole])) <= maxTokens) return [whole];

  if (spec.kind === 'agents') {
    const sections = JSON.parse(content);
    const out = [];
    for (let i = 0; i < sections.length; i += 1) {
      const key = Object.keys(sections[i])[0] || `section-${i}`;
      out.push(wrapped(spec.path, spec.classification, `header:${key}`, JSON.stringify(sections[i])));
    }
    return out;
  }

  if (spec.kind === 'json') return splitJsonValue(JSON.parse(content), spec);

  const structural = spec.kind === 'javascript' ? splitJs(content, spec) : splitMarkdown(content, spec);
  const out = [];
  for (const unit of structural) {
    if (await countTokens(JSON.stringify([unit])) <= maxTokens) out.push(unit);
    else out.push(...await splitOversizeText(unit));
  }
  return out;
}

async function pack(units) {
  const batches = [];
  let current = [];
  for (const unit of units) {
    const singletonTokens = await countTokens(JSON.stringify([unit]));
    if (singletonTokens > maxTokens) throw new Error(`Unit still exceeds max_tokens: ${unit.path} ${unit.segment} = ${singletonTokens}`);
    const candidate = [...current, unit];
    const candidateTokens = await countTokens(JSON.stringify(candidate));
    if (current.length && candidateTokens > maxTokens) {
      const currentTokens = await countTokens(JSON.stringify(current));
      batches.push({ units: current, tokens: currentTokens });
      current = [unit];
    } else {
      current = candidate;
    }
  }
  if (current.length) batches.push({ units: current, tokens: await countTokens(JSON.stringify(current)) });
  return batches;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing.');

  const docs = [];
  const allUnits = [];
  for (const spec of corpus) {
    if (!fs.existsSync(path.resolve(repoRoot, spec.path))) throw new Error(`Corpus file missing: ${spec.path}`);
    const content = normalizeDocument(spec);
    const serialized = JSON.stringify({ path: spec.path, classification: spec.classification, content });
    const tokens = await countTokens(serialized);
    docs.push({ path: spec.path, classification: spec.classification, kind: spec.kind, characters: content.length, wrapped_tokens: tokens });
    allUnits.push(...await initialUnits(spec, content));
  }

  const serializedCorpus = JSON.stringify(corpus.map((spec, i) => ({
    path: spec.path,
    classification: spec.classification,
    content: normalizeDocument(spec)
  })));
  const totalTokens = await countTokens(serializedCorpus);
  const batches = await pack(allUnits);

  fs.rmSync(batchesRoot, { recursive: true, force: true });
  fs.mkdirSync(batchesRoot, { recursive: true });
  batches.forEach((batch, index) => {
    fs.writeFileSync(path.join(batchesRoot, `B0-b${index}.json`), JSON.stringify(batch.units) + '\n');
  });

  const analysis = {
    generated_at: new Date().toISOString(),
    model,
    max_tokens: maxTokens,
    corpus_policy: {
      send_to_gemini: 'current repository source, unminified',
      agents_md: 'header-keyed JSON representation, JSON.stringify(JSON.parse(text)) equivalent',
      json_files: 'JSON.stringify(JSON.parse(text))',
      other_text_files: 'original text',
      code_gs: 'excluded because no current active dependency was established',
      optional_sample: 'included'
    },
    total_serialized_corpus_tokens: totalTokens,
    sum_individual_wrapped_document_tokens: docs.reduce((sum, d) => sum + d.wrapped_tokens, 0),
    documents: docs,
    B0: {
      batch_count: batches.length,
      batches: batches.map((batch, index) => ({
        b: index,
        tokens: batch.tokens,
        unit_count: batch.units.length,
        units: batch.units.map(u => ({ path: u.path, classification: u.classification, segment: u.segment }))
      }))
    }
  };

  fs.writeFileSync(path.join(outRoot, 'stage1-corpus-analysis.json'), JSON.stringify(analysis, null, 2) + '\n');
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
