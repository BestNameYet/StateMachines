'use strict';

const fs = require('node:fs');
const path = require('node:path');

const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const agentsPath = 'ChatMachines/GeminiSupervisor/Agents.md';
const agentsHeaderJsonPath = 'ChatMachines/TokenizerCalibration/agents-by-header.json';
const resultsPath = 'ChatMachines/TokenizerCalibration/tokenizer-results.json';

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

    const jsonText = jsonLines.join('\n').trim();
    if (!jsonText) continue;

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Invalid JSON under header "${currentHeader}": ${error.message}`);
    }

    sections.push({ [currentHeader]: parsed });
  }

  return sections;
}

async function exactCount(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`countTokens ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  return result.totalTokens;
}

async function measure(file) {
  const text = fs.readFileSync(file, 'utf8');
  const characters = text.length;
  const exactTokens = await exactCount(text);
  const div3 = Math.ceil(characters / 3);
  const div4 = Math.ceil(characters / 4);

  return {
    file,
    characters,
    exact_tokens: exactTokens,
    characters_per_token: Number((characters / exactTokens).toFixed(4)),
    ceil_chars_div_3: div3,
    div_3_error_tokens: div3 - exactTokens,
    div_3_error_percent: Number((((div3 - exactTokens) / exactTokens) * 100).toFixed(2)),
    ceil_chars_div_4: div4,
    div_4_error_tokens: div4 - exactTokens,
    div_4_error_percent: Number((((div4 - exactTokens) / exactTokens) * 100).toFixed(2))
  };
}

async function main() {
  const rawAgents = fs.readFileSync(agentsPath, 'utf8');
  const headerJson = agentsJsonByHeader(rawAgents);

  fs.mkdirSync(path.dirname(agentsHeaderJsonPath), { recursive: true });
  fs.writeFileSync(agentsHeaderJsonPath, JSON.stringify(headerJson) + '\n');

  const samples = [
    agentsPath,
    agentsHeaderJsonPath,
    'ChatMachines/GeminiSupervisor/send-to-gemini.js',
    'ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json'
  ];

  const results = [];
  for (const file of samples) results.push(await measure(file));

  const raw = results.find(item => item.file === agentsPath);
  const structured = results.find(item => item.file === agentsHeaderJsonPath);

  const output = {
    generated_at: new Date().toISOString(),
    model,
    agents_header_json: {
      sections: headerJson.length,
      raw_tokens: raw.exact_tokens,
      structured_tokens: structured.exact_tokens,
      token_change: structured.exact_tokens - raw.exact_tokens,
      token_change_percent: Number((((structured.exact_tokens - raw.exact_tokens) / raw.exact_tokens) * 100).toFixed(2))
    },
    samples: results
  };

  fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
