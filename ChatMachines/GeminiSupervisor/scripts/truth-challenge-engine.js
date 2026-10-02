'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');

const rootDir = path.resolve(__dirname, '../../..');
const supervisorDir = path.join(rootDir, 'ChatMachines/GeminiSupervisor');
const depMapPath = path.join(supervisorDir, 'dependency-map.json');
const selectorPath = path.join(supervisorDir, 'truth-selector.json');
const statusPath = path.join(supervisorDir, 'truth-status.json');
const statePath = path.join(supervisorDir, '.truth-challenge-state.json');
const snapshotsRoot = path.join(supervisorDir, '.truth-challenges');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function gitBlobShaForBytes(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function getRegistry() {
  const depMap = readJson(depMapPath);
  const registry = depMap.truth_readable_registry;
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('dependency-map.json.truth_readable_registry must be an object');
  }
  return registry;
}

function getSelectedDocuments(registry) {
  const selector = readJson(selectorPath);
  const selected = selector.selected_documents;

  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) {
    throw new Error('truth-selector.json.selected_documents must be an object');
  }

  const expectedKeys = Object.keys(registry).sort();
  const actualKeys = Object.keys(selected).sort();

  if (!isDeepStrictEqual(actualKeys, expectedKeys)) {
    throw new Error('truth-selector.json keys must exactly match truth_readable_registry keys');
  }

  for (const [key, value] of Object.entries(selected)) {
    if (typeof value !== 'boolean') {
      throw new Error(`truth-selector.json ${key} must be boolean`);
    }
  }

  return Object.keys(selected).filter((key) => selected[key] === true);
}

function verifyStableReader(docId, entry) {
  const readerAbs = path.join(rootDir, entry.stable_reader_path);
  if (!fs.existsSync(readerAbs)) {
    throw new Error(`Stable reader missing for ${docId}: ${entry.stable_reader_path}`);
  }

  if (!entry.source_blob_sha || !entry.source_commit_sha || !entry.reader_blob_sha) {
    throw new Error(`Dependency provenance is incomplete for ${docId}; dependency sync must run first`);
  }

  const readerBytes = fs.readFileSync(readerAbs);
  const readerBlobSha = gitBlobShaForBytes(readerBytes);

  if (readerBlobSha !== entry.reader_blob_sha) {
    throw new Error(`Stable reader blob provenance mismatch for ${docId}`);
  }

  const reader = JSON.parse(readerBytes.toString('utf8'));
  const prov = reader.source_provenance || {};

  if (
    prov.source_blob_sha !== entry.source_blob_sha ||
    prov.source_commit_sha !== entry.source_commit_sha
  ) {
    throw new Error(`Stable reader source provenance mismatch for ${docId}`);
  }

  return reader;
}

function makeSeedItem(docId, sequence) {
  const seedValue = crypto.randomBytes(16).toString('hex');
  return {
    type: 'truth_seed',
    seed_id: `${docId}:seed:${sequence}`,
    seed_value: seedValue,
    proof_value: '0'.repeat(seedValue.length)
  };
}

function makeSeededProjection(reader, challengeId) {
  const sourceItems = reader.items;
  if (!Array.isArray(sourceItems)) {
    throw new Error(`Stable reader ${reader.doc_id} has no items array`);
  }

  const interval = Math.max(1, Math.ceil(Math.max(sourceItems.length, 1) / 12));
  const seededItems = [];
  let sequence = 0;

  seededItems.push(makeSeedItem(reader.doc_id, sequence++));

  for (let i = 0; i < sourceItems.length; i++) {
    seededItems.push(sourceItems[i]);

    if ((i + 1) % interval === 0 && i !== sourceItems.length - 1) {
      seededItems.push(makeSeedItem(reader.doc_id, sequence++));
    }
  }

  seededItems.push(makeSeedItem(reader.doc_id, sequence++));

  return {
    challenge_id: challengeId,
    instruction: 'For every truth_seed item, swap seed_value and proof_value. Change nothing else.',
    doc_id: reader.doc_id,
    canonical_path: reader.canonical_path,
    source_provenance: reader.source_provenance,
    items: seededItems
  };
}

function generateChallenge() {
  if (fs.existsSync(statePath)) {
    throw new Error('An active truth challenge already exists');
  }

  const registry = getRegistry();
  const selectedDocs = getSelectedDocuments(registry);

  if (selectedDocs.length === 0) {
    console.log('[truth-challenge] no documents selected');
    return { generated: false };
  }

  const challengeId = `truth_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const snapshotDir = path.join(snapshotsRoot, challengeId);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const challengeDocs = [];

  for (const docId of selectedDocs) {
    const entry = registry[docId];
    const reader = verifyStableReader(docId, entry);
    const projection = makeSeededProjection(reader, challengeId);
    const serialized = JSON.stringify(projection, null, 2) + '\n';

    const activeAbs = path.join(rootDir, entry.active_projection_path);
    const snapshotRel = path
      .relative(rootDir, path.join(snapshotDir, `${docId}.snapshot.json`))
      .replace(/\\/g, '/');
    const snapshotAbs = path.join(rootDir, snapshotRel);

    fs.mkdirSync(path.dirname(activeAbs), { recursive: true });
    fs.writeFileSync(activeAbs, serialized, 'utf8');
    fs.writeFileSync(snapshotAbs, serialized, 'utf8');

    challengeDocs.push({
      doc_id: docId,
      active_projection_path: entry.active_projection_path,
      snapshot_path: snapshotRel
    });
  }

  writeJson(statePath, {
    challenge_id: challengeId,
    selected_documents: selectedDocs,
    documents: challengeDocs,
    issued_at: new Date().toISOString()
  });

  writeJson(statusPath, {
    challenge_id: challengeId,
    status: 'ACTIVE',
    timestamp: new Date().toISOString(),
    selected: selectedDocs,
    last_verified_commit: null,
    summary: 'Seed/proof swap puzzle issued.'
  });

  console.log(`[truth-challenge] issued ${challengeId}`);
  return { generated: true, challengeId };
}

function expectedSolvedProjection(snapshot) {
  const expected = structuredClone(snapshot);

  for (const item of expected.items) {
    if (item && item.type === 'truth_seed') {
      const originalSeed = item.seed_value;
      const originalProof = item.proof_value;

      if (
        typeof originalSeed !== 'string' ||
        typeof originalProof !== 'string' ||
        originalProof !== '0'.repeat(originalSeed.length)
      ) {
        throw new Error(`Invalid trusted seed snapshot at ${item.seed_id || 'unknown seed'}`);
      }

      item.seed_value = originalProof;
      item.proof_value = originalSeed;
    }
  }

  return expected;
}

function restoreOriginalProjections(state) {
  for (const doc of state.documents) {
    const snapshotAbs = path.join(rootDir, doc.snapshot_path);
    const activeAbs = path.join(rootDir, doc.active_projection_path);

    if (!fs.existsSync(snapshotAbs)) {
      throw new Error(`Trusted snapshot missing: ${doc.snapshot_path}`);
    }

    fs.mkdirSync(path.dirname(activeAbs), { recursive: true });
    fs.copyFileSync(snapshotAbs, activeAbs);
  }
}

function resetSelector(registry) {
  const selectedDocuments = {};
  for (const key of Object.keys(registry)) {
    selectedDocuments[key] = false;
  }
  writeJson(selectorPath, { selected_documents: selectedDocuments });
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function removeDirIfExists(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function verifyChallenge() {
  if (!fs.existsSync(statePath)) {
    throw new Error('No active truth challenge state exists');
  }

  const state = readJson(statePath);
  const registry = getRegistry();
  const failures = [];

  for (const doc of state.documents) {
    const snapshotAbs = path.join(rootDir, doc.snapshot_path);
    const activeAbs = path.join(rootDir, doc.active_projection_path);

    if (!fs.existsSync(snapshotAbs)) {
      failures.push(`${doc.doc_id}: trusted snapshot missing`);
      continue;
    }

    if (!fs.existsSync(activeAbs)) {
      failures.push(`${doc.doc_id}: active projection missing`);
      continue;
    }

    try {
      const snapshot = readJson(snapshotAbs);
      const actual = readJson(activeAbs);
      const expected = expectedSolvedProjection(snapshot);

      if (!isDeepStrictEqual(actual, expected)) {
        failures.push(`${doc.doc_id}: projection is not the exact seed/proof swap solution`);
      }
    } catch (error) {
      failures.push(`${doc.doc_id}: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    restoreOriginalProjections(state);
    console.error(`[truth-challenge] FAIL: ${failures.join('; ')}`);
    return { pass: false, failures };
  }

  resetSelector(registry);

  for (const doc of state.documents) {
    removeIfExists(path.join(rootDir, doc.active_projection_path));
  }

  removeDirIfExists(path.join(snapshotsRoot, state.challenge_id));
  removeIfExists(statePath);

  writeJson(statusPath, {
    challenge_id: state.challenge_id,
    status: 'PASS',
    timestamp: new Date().toISOString(),
    selected: state.selected_documents,
    last_verified_commit: process.env.GITHUB_SHA || null,
    summary: 'Every truth seed completed the required in-place seed/proof swap.'
  });

  console.log(`[truth-challenge] PASS: ${state.challenge_id}`);
  return { pass: true };
}

function main() {
  const mode = process.argv[2];

  if (mode === 'generate') {
    generateChallenge();
    return;
  }

  if (mode === 'verify') {
    const result = verifyChallenge();
    if (!result.pass) {
      process.exitCode = 2;
    }
    return;
  }

  throw new Error('Usage: node truth-challenge-engine.js [generate|verify]');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  generateChallenge,
  verifyChallenge,
  makeSeededProjection,
  expectedSolvedProjection
};
