const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const input = process.argv[2];
const output = process.argv[3];
const extras = process.argv.slice(4);
const password = process.env.GZ_PASSWORD;

if (!input || !output) throw new Error('Usage: node sbe-pack.js <input.gz> <output.7z> [extra files ...]');
if (!password) throw new Error('GZ_PASSWORD is missing.');
const inputs = [input, ...extras];
for (const file of inputs) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Input is not a file: ${file}`);
}

fs.mkdirSync(path.dirname(output), { recursive: true });

function available7z() {
  for (const binary of ['7z', '7zz']) {
    const check = spawnSync(binary, ['-h'], { stdio: 'ignore' });
    if (!check.error) return binary;
  }
  throw new Error('No 7z-compatible executable is available on the runner.');
}

const binary = available7z();
function run(args) {
  const result = spawnSync(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${binary} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

run(['a', '-t7z', '-mhe=on', `-p${password}`, output, ...inputs]);
run(['t', `-p${password}`, output]);
console.log(output);
