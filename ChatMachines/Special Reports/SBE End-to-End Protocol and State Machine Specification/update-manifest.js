#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const reportRoot = __dirname;
const repoRoot = path.resolve(reportRoot, '../../..');
const metadataPath = path.join(reportRoot, 'metadata.json');
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

function readMetadata() {
  const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('metadata.json must contain one JSON object.');
  }
  if (!parsed.metadata || typeof parsed.metadata !== 'object' || Array.isArray(parsed.metadata)) {
    throw new Error('metadata.json must contain a metadata object.');
  }
  return parsed.metadata;
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
  const metadata = readMetadata();
  const textFiles = walk(reportRoot)
    .filter(file => file.toLowerCase().endsWith('.txt'))
    .sort((a, b) => toPosix(path.relative(reportRoot, a)).localeCompare(toPosix(path.relative(reportRoot, b))));

  const documents = textFiles.map(file => {
    const relative = toPosix(path.relative(reportRoot, file));
    const record = metadata[relative];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Missing metadata object for ${relative}.`);
    }
    if (typeof record.file_description !== 'string' || record.file_description.trim() === '') {
      throw new Error(`metadata[${JSON.stringify(relative)}].file_description must be a non-empty string.`);
    }

    const dirname = path.posix.dirname(relative);
    return {
      filename: path.posix.basename(relative),
      folder_structure: dirname === '.' ? [] : dirname.split('/'),
      file_description: record.file_description.trim(),
      last_commit: lastCommitFor(file)
    };
  });

  const manifest = {
    metadata: {
      manifest_description: 'Generated manifest of text documents in the SBE report root and its subdirectories.',
      report_root: toPosix(path.relative(repoRoot, reportRoot)),
      file_description_source: 'metadata.json -> metadata[relative_document_path].file_description'
    },
    documents
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${documents.length} document records to ${manifestPath}.`);
}

main();
