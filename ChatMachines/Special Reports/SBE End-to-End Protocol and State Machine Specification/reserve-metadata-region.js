#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reportRoot = __dirname;
const RESERVED_CHARS = 16384;
const PADDING_CHARACTER = '~';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute));
    else if (entry.isFile()) out.push(absolute);
  }
  return out;
}

function parseMetadataLine(text, relativePath) {
  const newlineIndex = text.indexOf('\n');
  const firstLine = (newlineIndex < 0 ? text : text.slice(0, newlineIndex)).replace(/\r$/, '');

  let parsed;
  try {
    parsed = JSON.parse(firstLine);
  } catch (error) {
    throw new Error(`First line of ${relativePath} must be metadata JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Metadata in ${relativePath} must be a JSON object.`);
  }

  const metadata = (
    parsed.metadata &&
    typeof parsed.metadata === 'object' &&
    !Array.isArray(parsed.metadata) &&
    parsed.this === undefined
  ) ? parsed.metadata : parsed;

  if (metadata.this !== 'metadata') {
    throw new Error(`this must equal "metadata" in ${relativePath}.`);
  }

  return { metadata, newlineIndex };
}

function extractBody(text, metadata, newlineIndex) {
  const region = metadata.metadata_region;
  if (
    region &&
    typeof region === 'object' &&
    !Array.isArray(region) &&
    Number.isInteger(region.body_start) &&
    region.body_start >= 0 &&
    text.length >= region.body_start
  ) {
    return text.slice(region.body_start);
  }

  if (newlineIndex < 0) return '';

  let body = text.slice(newlineIndex + 1);
  if (body.startsWith('\r\n')) body = body.slice(2);
  else if (body.startsWith('\n')) body = body.slice(1);
  return body;
}

function buildReservedDocument(metadata, body, relativePath) {
  metadata.metadata_region = {
    length: RESERVED_CHARS,
    padding_character: PADDING_CHARACTER,
    body_start: RESERVED_CHARS,
    coordinate_unit: 'UTF-16_code_unit'
  };

  const metadataLine = JSON.stringify(metadata);
  const paddingCount = RESERVED_CHARS - metadataLine.length - 2;
  if (paddingCount < 0) {
    throw new Error(`Metadata in ${relativePath} exceeds the ${RESERVED_CHARS}-character reserved region.`);
  }

  const reserved = `${metadataLine}\n${PADDING_CHARACTER.repeat(paddingCount)}\n`;
  if (reserved.length !== RESERVED_CHARS) {
    throw new Error(`Reserved metadata region length mismatch in ${relativePath}.`);
  }

  return reserved + body;
}

function main() {
  const textFiles = walk(reportRoot)
    .filter(file => file.toLowerCase().endsWith('.txt'))
    .sort();

  let changed = 0;
  for (const file of textFiles) {
    const relativePath = path.relative(reportRoot, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    const { metadata, newlineIndex } = parseMetadataLine(text, relativePath);
    const body = extractBody(text, metadata, newlineIndex);
    const next = buildReservedDocument(metadata, body, relativePath);

    if (next !== text) {
      fs.writeFileSync(file, next, 'utf8');
      changed += 1;
    }
  }

  console.log(`Reserved ${RESERVED_CHARS} metadata characters with ${JSON.stringify(PADDING_CHARACTER)} padding in ${changed} document(s).`);
}

main();
