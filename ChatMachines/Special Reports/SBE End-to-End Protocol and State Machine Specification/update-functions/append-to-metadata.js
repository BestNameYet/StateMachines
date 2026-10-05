'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reportRoot = path.resolve(__dirname, '..');

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateRegion(metadata, fileArg) {
  const region = metadata.metadata_region;
  if (!region || typeof region !== 'object' || Array.isArray(region)) {
    throw new Error(`metadata.metadata_region must be an object in ${fileArg}.`);
  }
  if (!Number.isInteger(region.length) || region.length <= 2) {
    throw new Error(`metadata.metadata_region.length must be an integer greater than 2 in ${fileArg}.`);
  }
  if (!Number.isInteger(region.body_start) || region.body_start !== region.length) {
    throw new Error(`metadata.metadata_region.body_start must equal metadata.metadata_region.length in ${fileArg}.`);
  }
  if (typeof region.padding_character !== 'string' || region.padding_character.length !== 1 || /\s/.test(region.padding_character)) {
    throw new Error(`metadata.metadata_region.padding_character must be exactly one non-whitespace character in ${fileArg}.`);
  }
  if (region.coordinate_unit !== 'UTF-16_code_unit') {
    throw new Error(`metadata.metadata_region.coordinate_unit must equal "UTF-16_code_unit" in ${fileArg}.`);
  }
  return region;
}

function buildDocument(envelope, body, fileArg) {
  const region = validateRegion(envelope.metadata, fileArg);
  const metadataLine = JSON.stringify(envelope);
  const paddingCount = region.length - metadataLine.length - 2;
  if (paddingCount < 0) {
    throw new Error(`Updated metadata exceeds the ${region.length}-character reserved region in ${fileArg}.`);
  }

  const reserved = `${metadataLine}\n${region.padding_character.repeat(paddingCount)}\n`;
  if (reserved.length !== region.length) {
    throw new Error(`Reserved metadata region length mismatch in ${fileArg}.`);
  }
  return reserved + body;
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
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex < 0) {
    throw new Error(`Target file has no embedded metadata JSON line: ${fileArg}`);
  }

  let envelope;
  try {
    envelope = JSON.parse(text.slice(0, newlineIndex).replace(/\r$/, ''));
  } catch (error) {
    throw new Error(`First line is not valid metadata JSON in ${fileArg}: ${error.message}`);
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

  const originalRegion = validateRegion(envelope.metadata, fileArg);
  if (text.length < originalRegion.body_start) {
    throw new Error(`Target file is shorter than metadata.metadata_region.body_start in ${fileArg}.`);
  }
  const body = text.slice(originalRegion.body_start);

  if (key === 'this' && value !== 'metadata') {
    throw new Error('metadata.this is invariant and may only be set to "metadata".');
  }

  envelope.metadata[key] = value;
  const nextText = buildDocument(envelope, body, fileArg);
  fs.writeFileSync(targetPath, nextText, 'utf8');

  return {
    file: path.relative(reportRoot, targetPath).split(path.sep).join('/'),
    key,
    value
  };
}

module.exports = appendToMetadata;
