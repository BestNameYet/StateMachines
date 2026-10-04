'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reportRoot = path.resolve(__dirname, '..');

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function appendToMetadata(fileArg, keyValueArg) {
  if (typeof fileArg !== 'string' || fileArg.trim() === '') {
    throw new Error('fileArg must be a non-empty report-root-relative file path.');
  }
  if (!keyValueArg || typeof keyValueArg !== 'object' || Array.isArray(keyValueArg)) {
    throw new Error('keyValueArg must be an object containing exactly one key:value pair.');
  }

  const keys = Object.keys(keyValueArg);
  if (keys.length !== 1) {
    throw new Error('keyValueArg must contain exactly one key:value pair.');
  }

  const key = keys[0];
  const value = keyValueArg[key];
  const targetPath = path.resolve(reportRoot, fileArg);

  if (!isInside(reportRoot, targetPath)) {
    throw new Error('Target file must be inside the SBE report root.');
  }
  if (path.extname(targetPath).toLowerCase() !== '.txt') {
    throw new Error('Target file must be a .txt document.');
  }
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    throw new Error(`Target file does not exist: ${fileArg}`);
  }

  const text = fs.readFileSync(targetPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const metadataLineIndex = lines.findIndex(line => line.trim() !== '');
  if (metadataLineIndex < 0) {
    throw new Error(`Target file has no embedded metadata JSON: ${fileArg}`);
  }

  let envelope;
  try {
    envelope = JSON.parse(lines[metadataLineIndex]);
  } catch (error) {
    throw new Error(`First non-empty line is not valid metadata JSON in ${fileArg}: ${error.message}`);
  }

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error(`Metadata envelope must be an object in ${fileArg}.`);
  }
  if (!envelope.metadata || typeof envelope.metadata !== 'object' || Array.isArray(envelope.metadata)) {
    throw new Error(`Metadata envelope must contain a metadata object in ${fileArg}.`);
  }
  if (envelope.metadata.this !== 'metadata') {
    throw new Error(`metadata.this must equal "metadata" in ${fileArg}.`);
  }
  if (key === 'this' && value !== 'metadata') {
    throw new Error('metadata.this is invariant and may only be set to "metadata".');
  }

  envelope.metadata[key] = value;
  lines[metadataLineIndex] = JSON.stringify(envelope);
  fs.writeFileSync(targetPath, lines.join('\n'), 'utf8');

  return {
    file: path.relative(reportRoot, targetPath).split(path.sep).join('/'),
    key,
    value
  };
}

module.exports = appendToMetadata;
