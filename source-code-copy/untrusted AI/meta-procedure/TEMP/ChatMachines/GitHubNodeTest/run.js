const fs = require('node:fs');
const path = require('node:path');

const result = {
  runtime: 'Node.js',
  node_version: process.version,
  platform: process.platform,
  architecture: process.arch,
  cwd: process.cwd(),
  script: path.relative(process.cwd(), __filename),
  fetch_available: typeof fetch === 'function',
  fs_available: typeof fs.readFileSync === 'function'
};

console.log(JSON.stringify(result, null, 2));
