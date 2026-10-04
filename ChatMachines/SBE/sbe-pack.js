const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const input = process.argv[2];
const output = process.argv[3];
const password = process.env.GZ_PASSWORD;

if (!input || !output) throw new Error('Usage: node sbe-pack.js <input.gz> <output.7z>');
if (!password) throw new Error('GZ_PASSWORD is missing.');
if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error(`Input is not a file: ${input}`);

fs.mkdirSync(path.dirname(output), { recursive: true });

function run(args) {
  const result = spawnSync('7z', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`7z failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

run(['a', '-t7z', '-mhe=on', `-p${password}`, output, input]);
run(['t', `-p${password}`, output]);
console.log(output);
