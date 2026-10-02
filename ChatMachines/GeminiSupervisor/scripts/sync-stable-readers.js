'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../../..');
const depMapPath = path.join(rootDir, 'ChatMachines/GeminiSupervisor/dependency-map.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function gitBlobSha(relPath) {
  return execFileSync('git', ['rev-parse', `HEAD:${relPath}`], {
    cwd: rootDir,
    encoding: 'utf8'
  }).trim();
}

function gitLastCommitSha(relPath) {
  return execFileSync('git', ['log', '-1', '--format=%H', '--', relPath], {
    cwd: rootDir,
    encoding: 'utf8'
  }).trim();
}

function gitBlobShaForBytes(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function sourceToOrderedItems(text) {
  const items = [];
  let cursor = 0;
  let lineNumber = 1;

  if (text.length === 0) {
    return [{ type: 'content', line_number: 1, text: '', eol: '' }];
  }

  while (cursor < text.length) {
    const newline = text.indexOf('\n', cursor);
    let end;
    let eol;

    if (newline === -1) {
      end = text.length;
      eol = '';
    } else if (newline > cursor && text[newline - 1] === '\r') {
      end = newline - 1;
      eol = '\r\n';
    } else {
      end = newline;
      eol = '\n';
    }

    items.push({
      type: 'content',
      line_number: lineNumber++,
      text: text.slice(cursor, end),
      eol
    });

    if (newline === -1) {
      cursor = text.length;
    } else {
      cursor = newline + 1;
    }
  }

  return items;
}

function buildReader(docId, entry, sourceText, sourceBlobSha, sourceCommitSha) {
  return {
    doc_id: docId,
    canonical_path: entry.canonical_path,
    format: entry.format,
    source_provenance: {
      source_blob_sha: sourceBlobSha,
      source_commit_sha: sourceCommitSha
    },
    items: sourceToOrderedItems(sourceText)
  };
}

function syncStableReaders() {
  const depMap = readJson(depMapPath);
  const registry = depMap.truth_readable_registry;

  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('dependency-map.json.truth_readable_registry must be an object');
  }

  let changed = 0;

  for (const [docId, entry] of Object.entries(registry)) {
    const sourceAbs = path.join(rootDir, entry.canonical_path);
    const readerAbs = path.join(rootDir, entry.stable_reader_path);

    if (!fs.existsSync(sourceAbs)) {
      throw new Error(`Canonical truth-readable document is missing: ${entry.canonical_path}`);
    }

    const sourceBlobSha = gitBlobSha(entry.canonical_path);
    const sourceCommitSha = gitLastCommitSha(entry.canonical_path);

    let readerMatches = false;
    if (fs.existsSync(readerAbs) && entry.reader_blob_sha) {
      const currentReaderBytes = fs.readFileSync(readerAbs);
      const currentReaderBlobSha = gitBlobShaForBytes(currentReaderBytes);
      readerMatches = currentReaderBlobSha === entry.reader_blob_sha;
    }

    const provenanceMatches =
      entry.source_blob_sha === sourceBlobSha &&
      entry.source_commit_sha === sourceCommitSha;

    if (readerMatches && provenanceMatches) {
      console.log(`[sync-stable-readers] unchanged: ${docId}`);
      continue;
    }

    const sourceText = fs.readFileSync(sourceAbs, 'utf8');
    const reader = buildReader(docId, entry, sourceText, sourceBlobSha, sourceCommitSha);
    const readerText = JSON.stringify(reader, null, 2) + '\n';
    const readerBytes = Buffer.from(readerText, 'utf8');
    const readerBlobSha = gitBlobShaForBytes(readerBytes);

    fs.mkdirSync(path.dirname(readerAbs), { recursive: true });
    fs.writeFileSync(readerAbs, readerBytes);

    entry.source_blob_sha = sourceBlobSha;
    entry.source_commit_sha = sourceCommitSha;
    entry.reader_blob_sha = readerBlobSha;
    entry.item_count = reader.items.length;
    entry.last_synced_at = new Date().toISOString();

    changed++;
    console.log(`[sync-stable-readers] rebuilt: ${docId}`);
  }

  if (changed > 0) {
    writeJson(depMapPath, depMap);
  }

  console.log(`[sync-stable-readers] changed_readers=${changed}`);
  return changed;
}

if (require.main === module) {
  syncStableReaders();
}

module.exports = {
  syncStableReaders,
  sourceToOrderedItems,
  gitBlobShaForBytes
};
