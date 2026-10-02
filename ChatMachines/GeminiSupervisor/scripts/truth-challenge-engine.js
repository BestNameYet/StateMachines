'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');

const rootDir = path.resolve(__dirname, '../../..');
const supervisorDir = path.join(rootDir, 'ChatMachines/GeminiSupervisor');
const depMapPath = path.join(supervisorDir, 'dependency-map.json');
const runsRoot = path.join(supervisorDir, 'runs');
const PLACEHOLDER_KEY = '^MISSING_KEY^';
const PLACEHOLDER_VALUE = '^MISSING_VALUE^';
const DAMAGE_RATE = 0.10;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
}

function removeDirIfExists(dirPath) {
  if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
}

function validateNonce(runNonce) {
  if (typeof runNonce !== 'string' || !/^[A-Za-z0-9_-]+$/.test(runNonce)) {
    throw new Error(`Invalid run_nonce: ${runNonce}`);
  }
  return runNonce;
}

function validateDocId(docId) {
  if (typeof docId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(docId)) {
    throw new Error(`Invalid document id: ${docId}`);
  }
  return docId;
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

function verifyStableReader(docId, entry) {
  const readerAbs = path.join(rootDir, entry.stable_reader_path);
  if (!fs.existsSync(readerAbs)) {
    throw new Error(`Stable reader missing for ${docId}: ${entry.stable_reader_path}`);
  }
  if (!entry.source_blob_sha || !entry.source_commit_sha || !entry.reader_blob_sha) {
    throw new Error(`Dependency provenance is incomplete for ${docId}; reader sync must run first`);
  }

  const readerBytes = fs.readFileSync(readerAbs);
  const actualReaderBlob = gitBlobShaForBytes(readerBytes);
  if (actualReaderBlob !== entry.reader_blob_sha) {
    throw new Error(`Stable reader blob provenance mismatch for ${docId}`);
  }

  const reader = JSON.parse(readerBytes.toString('utf8'));
  if (!Array.isArray(reader.items)) {
    throw new Error(`Stable reader ${docId} has no items array`);
  }
  const source = reader.source_provenance || {};
  if (
    source.source_blob_sha !== entry.source_blob_sha ||
    source.source_commit_sha !== entry.source_commit_sha
  ) {
    throw new Error(`Stable reader source provenance mismatch for ${docId}`);
  }
  return reader;
}

function isSubstantialItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (!text) return false;
  if (/^[{}\[\],:]+$/.test(text)) return false;
  return text.length >= 4;
}

function candidateIndices(items) {
  const substantial = [];
  const fallback = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      fallback.push(i);
      if (isSubstantialItem(item)) substantial.push(i);
    }
  }
  return substantial.length ? substantial : fallback;
}

function randomChoice(array) {
  if (!array.length) throw new Error('Cannot choose from an empty array');
  return array[crypto.randomInt(0, array.length)];
}

function selectDistributedIndices(items, damageRate = DAMAGE_RATE) {
  const eligible = candidateIndices(items);
  if (!eligible.length) return [];

  const target = Math.max(1, Math.min(eligible.length, Math.round(eligible.length * damageRate)));
  const bandCount = Math.max(1, Math.min(10, target, eligible.length));
  const selected = new Set();

  for (let band = 0; band < bandCount; band++) {
    const start = Math.floor((band * eligible.length) / bandCount);
    const end = Math.floor(((band + 1) * eligible.length) / bandCount);
    const bandCandidates = eligible.slice(start, Math.max(start + 1, end));
    selected.add(randomChoice(bandCandidates));
  }

  const remaining = eligible.filter((index) => !selected.has(index));
  while (selected.size < target && remaining.length) {
    const offset = crypto.randomInt(0, remaining.length);
    selected.add(remaining.splice(offset, 1)[0]);
  }

  return [...selected].sort((a, b) => a - b);
}

function placeholderRecord() {
  return { [PLACEHOLDER_KEY]: PLACEHOLDER_VALUE };
}

function buildFullProjection(runNonce, docId, entry, reader) {
  return {
    run_nonce: runNonce,
    doc_id: docId,
    canonical_path: entry.canonical_path,
    source_provenance: {
      source_blob_sha: entry.source_blob_sha,
      source_commit_sha: entry.source_commit_sha,
      reader_blob_sha: entry.reader_blob_sha,
      stable_reader_path: entry.stable_reader_path
    },
    items: structuredClone(reader.items)
  };
}

function damageProjection(fullProjection) {
  const repair = structuredClone(fullProjection);
  const damagedIndices = selectDistributedIndices(repair.items, DAMAGE_RATE);
  for (const index of damagedIndices) {
    repair.items[index] = placeholderRecord();
  }
  return { repair, damagedIndices };
}

function containsPlaceholder(value) {
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (!value || typeof value !== 'object') {
    return value === PLACEHOLDER_KEY || value === PLACEHOLDER_VALUE;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === PLACEHOLDER_KEY || child === PLACEHOLDER_VALUE) return true;
    if (containsPlaceholder(child)) return true;
  }
  return false;
}

function truthDirFor(runNonce) {
  return path.join(runsRoot, validateNonce(runNonce), 'truth-reader');
}

function selectedDocsFromForm(runNonce) {
  const formPath = path.join(runsRoot, validateNonce(runNonce), 'step-0-form.json');
  if (!fs.existsSync(formPath)) throw new Error(`Step 0 form missing: ${formPath}`);
  const form = readJson(formPath);
  const formNonce = form?.start_of_turn?.run_nonce ?? form?.system_locked?.run_nonce;
  if (formNonce !== runNonce) throw new Error('Step 0 form run_nonce does not match its run directory');
  const selection = form?.start_of_turn?.document_selection ?? form?.worker_editable?.document_selection;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new Error('Step 0 form document_selection must be an object');
  }
  const registry = getRegistry();
  const expected = Object.keys(registry).sort();
  const actual = Object.keys(selection).sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error('Step 0 form document_selection keys must exactly match truth_readable_registry keys');
  }
  for (const [docId, value] of Object.entries(selection)) {
    if (typeof value !== 'boolean') throw new Error(`document_selection.${docId} must be boolean`);
  }
  return Object.keys(selection).filter((docId) => selection[docId]);
}

function initializeRunChallenges(runNonce, selectedDocIds) {
  validateNonce(runNonce);
  if (!Array.isArray(selectedDocIds)) throw new Error('selectedDocIds must be an array');
  const selected = [...new Set(selectedDocIds.map(validateDocId))];
  const registry = getRegistry();
  for (const docId of selected) {
    if (!registry[docId]) throw new Error(`Unknown truth-readable document: ${docId}`);
  }

  const truthDir = truthDirFor(runNonce);
  const baselineDir = path.join(truthDir, '.baseline');
  const manifestPath = path.join(truthDir, 'manifest.json');
  const passPath = path.join(truthDir, 'PASS.json');

  if (fs.existsSync(manifestPath)) {
    throw new Error(`An active repair challenge already exists for ${runNonce}`);
  }
  removeIfExists(passPath);
  removeDirIfExists(baselineDir);
  fs.mkdirSync(baselineDir, { recursive: true });

  const manifest = {
    run_nonce: runNonce,
    challenge_type: 'full_projection_repair',
    instruction: 'Compare each *.repair.json file with its corresponding *.full.json file and completely restore the repair file until it exactly matches the full file. Change nothing else.',
    placeholder: { [PLACEHOLDER_KEY]: PLACEHOLDER_VALUE },
    damage_rate: DAMAGE_RATE,
    issued_at: new Date().toISOString(),
    selected_documents: selected,
    documents: {}
  };

  for (const docId of selected) {
    const entry = registry[docId];
    const reader = verifyStableReader(docId, entry);
    const full = buildFullProjection(runNonce, docId, entry, reader);
    const { repair, damagedIndices } = damageProjection(full);

    const fullPath = path.join(truthDir, `${docId}.full.json`);
    const repairPath = path.join(truthDir, `${docId}.repair.json`);
    const baselineFullPath = path.join(baselineDir, `${docId}.full.json`);
    const baselineRepairPath = path.join(baselineDir, `${docId}.repair.json`);

    writeJson(fullPath, full);
    writeJson(repairPath, repair);
    writeJson(baselineFullPath, full);
    writeJson(baselineRepairPath, repair);

    manifest.documents[docId] = {
      full_path: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
      repair_path: path.relative(rootDir, repairPath).replace(/\\/g, '/'),
      item_count: full.items.length,
      damaged_count: damagedIndices.length,
      source_blob_sha: entry.source_blob_sha,
      source_commit_sha: entry.source_commit_sha,
      reader_blob_sha: entry.reader_blob_sha
    };
  }

  if (selected.length === 0) {
    writeJson(passPath, {
      run_nonce: runNonce,
      status: 'PASS',
      verification: 'no_documents_selected',
      selected_documents: [],
      verified_at: new Date().toISOString(),
      verified_commit: process.env.GITHUB_SHA || null
    });
    removeDirIfExists(baselineDir);
    return { pass: true, generated: false, selected_documents: [] };
  }

  writeJson(manifestPath, manifest);
  return { pass: null, generated: true, manifest };
}

function restoreDamagedRepairs(truthDir, manifest) {
  const baselineDir = path.join(truthDir, '.baseline');
  for (const docId of Object.keys(manifest.documents)) {
    const baselineRepairPath = path.join(baselineDir, `${docId}.repair.json`);
    const repairPath = path.join(truthDir, `${docId}.repair.json`);
    if (!fs.existsSync(baselineRepairPath)) {
      throw new Error(`Trusted damaged baseline missing for ${docId}`);
    }
    fs.copyFileSync(baselineRepairPath, repairPath);
  }
}

function verifyRunRepairs(runNonce) {
  validateNonce(runNonce);
  const truthDir = truthDirFor(runNonce);
  const manifestPath = path.join(truthDir, 'manifest.json');
  const baselineDir = path.join(truthDir, '.baseline');
  if (!fs.existsSync(manifestPath)) throw new Error(`No active repair challenge for ${runNonce}`);

  const manifest = readJson(manifestPath);
  if (manifest.run_nonce !== runNonce) throw new Error('Truth-reader manifest nonce mismatch');
  const failures = [];
  const receiptDocs = [];

  for (const [docId, meta] of Object.entries(manifest.documents || {})) {
    const fullPath = path.join(truthDir, `${docId}.full.json`);
    const repairPath = path.join(truthDir, `${docId}.repair.json`);
    const baselineFullPath = path.join(baselineDir, `${docId}.full.json`);

    if (!fs.existsSync(fullPath) || !fs.existsSync(repairPath) || !fs.existsSync(baselineFullPath)) {
      failures.push(`${docId}: required challenge file missing`);
      continue;
    }

    try {
      const full = readJson(fullPath);
      const trustedFull = readJson(baselineFullPath);
      const repair = readJson(repairPath);

      if (!isDeepStrictEqual(full, trustedFull)) {
        failures.push(`${docId}: intact full projection was modified`);
        continue;
      }
      if (full.run_nonce !== runNonce || full.doc_id !== docId) {
        failures.push(`${docId}: projection binding mismatch`);
        continue;
      }
      if (containsPlaceholder(repair)) {
        failures.push(`${docId}: missing placeholders remain`);
        continue;
      }
      if (!isDeepStrictEqual(repair, full)) {
        failures.push(`${docId}: repair projection is not an exact match for the full projection`);
        continue;
      }

      receiptDocs.push({
        doc_id: docId,
        source_blob_sha: meta.source_blob_sha,
        source_commit_sha: meta.source_commit_sha,
        reader_blob_sha: meta.reader_blob_sha,
        item_count: meta.item_count,
        damaged_count: meta.damaged_count
      });
    } catch (error) {
      failures.push(`${docId}: ${error.message}`);
    }
  }

  if (failures.length) {
    restoreDamagedRepairs(truthDir, manifest);
    writeJson(path.join(truthDir, 'status.json'), {
      run_nonce: runNonce,
      status: 'FAIL',
      failures,
      checked_at: new Date().toISOString()
    });
    console.error(`[truth-reader] FAIL ${runNonce}: ${failures.join('; ')}`);
    return { pass: false, failures };
  }

  const passReceipt = {
    run_nonce: runNonce,
    status: 'PASS',
    challenge_type: 'full_projection_repair',
    verification: 'exact_deep_equality',
    selected_documents: manifest.selected_documents,
    documents: receiptDocs,
    verified_at: new Date().toISOString(),
    verified_commit: process.env.GITHUB_SHA || null
  };

  writeJson(path.join(truthDir, 'PASS.json'), passReceipt);
  removeIfExists(path.join(truthDir, 'status.json'));
  for (const docId of Object.keys(manifest.documents || {})) {
    removeIfExists(path.join(truthDir, `${docId}.full.json`));
    removeIfExists(path.join(truthDir, `${docId}.repair.json`));
  }
  removeDirIfExists(baselineDir);
  removeIfExists(manifestPath);

  console.log(`[truth-reader] PASS ${runNonce}`);
  return { pass: true, receipt: passReceipt };
}

function generateFromStep0Form(runNonce) {
  const selected = selectedDocsFromForm(runNonce);
  return initializeRunChallenges(runNonce, selected);
}

function main() {
  const mode = process.argv[2];
  const runNonce = process.argv[3];

  if (mode === 'generate') {
    initializeRunChallenges(runNonce, process.argv.slice(4));
    return;
  }
  if (mode === 'generate-from-form') {
    generateFromStep0Form(runNonce);
    return;
  }
  if (mode === 'verify') {
    const result = verifyRunRepairs(runNonce);
    if (!result.pass) process.exitCode = 2;
    return;
  }

  throw new Error('Usage: node truth-challenge-engine.js [generate <run_nonce> <doc...> | generate-from-form <run_nonce> | verify <run_nonce>]');
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
  initializeRunChallenges,
  generateFromStep0Form,
  verifyRunRepairs,
  selectDistributedIndices,
  damageProjection,
  containsPlaceholder
};
