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
  const firstNonEmptyLine = text.split(/\r?\n/).find(line => line.trim() !== '');
  const relative = toPosix(path.relative(reportRoot, file));

  if (!firstNonEmptyLine) {
    throw new Error(`Missing embedded metadata JSON in ${relative}.`);
  }

  let envelope;
  try {
    envelope = JSON.parse(firstNonEmptyLine);
  } catch (error) {
    throw new Error(`First non-empty line of ${relative} must be the embedded metadata JSON object: ${error.message}`);
  }

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error(`Embedded metadata envelope in ${relative} must be a JSON object.`);
  }

  const metadata = envelope.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`Embedded metadata envelope in ${relative} must contain a metadata object.`);
  }
  if (metadata.this !== 'metadata') {
    throw new Error(`Embedded metadata in ${relative} must contain metadata.this = "metadata".`);
  }
  if (typeof metadata.file_description !== 'string' || metadata.file_description.trim() === '') {
    throw new Error(`Embedded metadata in ${relative} must contain a non-empty metadata.file_description.`);
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
      file_description_source: 'embedded text-file JSON -> metadata.file_description',
      embedded_metadata_contract: '{"metadata":{"this":"metadata","file_description":"..."}}'
    },
    documents
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${documents.length} document records to ${manifestPath}.`);
}

main();
