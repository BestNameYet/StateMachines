#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const reportRoot = __dirname;
const repoRoot = path.resolve(reportRoot, '../../..');
const manifestPath = path.join(reportRoot, 'MANIFEST.json');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute));
    else if (entry.isFile()) out.push(absolute);
  }
  return out;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function readEmbeddedMetadata(file) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = toPosix(path.relative(reportRoot, file));
  const firstNewline = text.indexOf('\n');

  if (firstNewline < 0) {
    throw new Error(`Missing embedded metadata JSON line in ${relative}.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text.slice(0, firstNewline).replace(/\r$/, ''));
  } catch (error) {
    throw new Error(`First line of ${relative} must be the embedded metadata JSON object: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Embedded metadata in ${relative} must be a JSON object.`);
  }

  // Transitional compatibility: accept the former {"metadata": {...}} envelope,
  // but the canonical on-disk format is now the metadata object itself.
  const metadata = (
    parsed.metadata &&
    typeof parsed.metadata === 'object' &&
    !Array.isArray(parsed.metadata) &&
    parsed.this === undefined
  ) ? parsed.metadata : parsed;

  if (metadata.this !== 'metadata') {
    throw new Error(`Embedded metadata in ${relative} must contain this = "metadata".`);
  }
  if (typeof metadata.file_description !== 'string' || metadata.file_description.trim() === '') {
    throw new Error(`Embedded metadata in ${relative} must contain a non-empty file_description.`);
  }

  const region = metadata.metadata_region;
  if (!region || typeof region !== 'object' || Array.isArray(region)) {
    throw new Error(`Embedded metadata in ${relative} must contain metadata_region.`);
  }
  if (!Number.isInteger(region.length) || region.length <= 2) {
    throw new Error(`metadata_region.length must be an integer greater than 2 in ${relative}.`);
  }
  if (region.body_start !== region.length) {
    throw new Error(`metadata_region.body_start must equal metadata_region.length in ${relative}.`);
  }
  if (typeof region.padding_character !== 'string' || region.padding_character.length !== 1 || /\s/.test(region.padding_character)) {
    throw new Error(`metadata_region.padding_character must be one non-whitespace character in ${relative}.`);
  }
  if (region.coordinate_unit !== 'UTF-16_code_unit') {
    throw new Error(`metadata_region.coordinate_unit must equal "UTF-16_code_unit" in ${relative}.`);
  }
  if (text.length < region.body_start) {
    throw new Error(`${relative} is shorter than metadata_region.body_start.`);
  }

  const paddingStart = firstNewline + 1;
  const paddingEnd = region.body_start - 1;
  if (paddingEnd < paddingStart || text[paddingEnd] !== '\n') {
    throw new Error(`Reserved metadata region terminator is invalid in ${relative}.`);
  }
  const padding = text.slice(paddingStart, paddingEnd);
  if (padding !== region.padding_character.repeat(padding.length)) {
    throw new Error(`Reserved metadata padding is invalid in ${relative}.`);
  }

  return metadata;
}

function lastCommitFor(absolutePath) {
  const repoRelative = toPosix(path.relative(repoRoot, absolutePath));
  const sha = execFileSync('git', ['-C', repoRoot, 'log', '-1', '--format=%H', '--', repoRelative], {
    encoding: 'utf8'
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`Could not resolve last commit for ${repoRelative}.`);
  }
  return sha;
}

function main() {
  const textFiles = walk(reportRoot)
    .filter(file => file.toLowerCase().endsWith('.txt'))
    .sort((a, b) => toPosix(path.relative(reportRoot, a)).localeCompare(toPosix(path.relative(reportRoot, b))));

  const documents = textFiles.map(file => {
    const relative = toPosix(path.relative(reportRoot, file));
    const metadata = readEmbeddedMetadata(file);
    const dirname = path.posix.dirname(relative);

    return {
      filename: path.posix.basename(relative),
      folder_structure: dirname === '.' ? [] : dirname.split('/'),
      file_description: metadata.file_description.trim(),
      last_commit: lastCommitFor(file)
    };
  });

  const manifest = {
    metadata: {
      this: 'metadata',
      manifest_description: 'Generated manifest of text documents in the SBE report root and its subdirectories.',
      report_root: toPosix(path.relative(repoRoot, reportRoot)),
      file_description_source: 'embedded text-file JSON -> file_description',
      embedded_metadata_contract: '{"this":"metadata","file_description":"...","metadata_region":{"length":N,"padding_character":"<one non-whitespace character>","body_start":N,"coordinate_unit":"UTF-16_code_unit"}}'
    },
    documents
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${documents.length} document records to ${manifestPath}.`);
}

main();
