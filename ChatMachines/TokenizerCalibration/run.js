'use strict';

const fs = require('node:fs');
const path = require('node:path');

const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const samples = [
  'ChatMachines/GeminiSupervisor/Agents.md',
  'ChatMachines/GeminiSupervisor/send-to-gemini.js',
  'ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json'
];

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

async function main() {
  const results = [];

  for (const file of samples) {
    const text = fs.readFileSync(file, 'utf8');
    const characters = text.length;
    const exactTokens = await exactCount(text);
    const div3 = Math.ceil(characters / 3);
    const div4 = Math.ceil(characters / 4);

    results.push({
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
    });
  }

  const totalCharacters = results.reduce((sum, item) => sum + item.characters, 0);
  const totalExactTokens = results.reduce((sum, item) => sum + item.exact_tokens, 0);
  const totalDiv3 = Math.ceil(totalCharacters / 3);
  const totalDiv4 = Math.ceil(totalCharacters / 4);

  const output = {
    generated_at: new Date().toISOString(),
    model,
    samples: results,
    combined: {
      characters: totalCharacters,
      exact_tokens: totalExactTokens,
      characters_per_token: Number((totalCharacters / totalExactTokens).toFixed(4)),
      ceil_chars_div_3: totalDiv3,
      div_3_error_tokens: totalDiv3 - totalExactTokens,
      div_3_error_percent: Number((((totalDiv3 - totalExactTokens) / totalExactTokens) * 100).toFixed(2)),
      ceil_chars_div_4: totalDiv4,
      div_4_error_tokens: totalDiv4 - totalExactTokens,
      div_4_error_percent: Number((((totalDiv4 - totalExactTokens) / totalExactTokens) * 100).toFixed(2))
    }
  };

  const outputPath = 'ChatMachines/TokenizerCalibration/tokenizer-results.json';
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
