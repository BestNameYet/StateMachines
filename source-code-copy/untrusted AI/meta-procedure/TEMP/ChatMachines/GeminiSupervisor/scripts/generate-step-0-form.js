'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');

const rootDir = path.resolve(__dirname, '../../..');
const supervisorDir = path.join(rootDir, 'ChatMachines/GeminiSupervisor');
const depMapPath = path.join(supervisorDir, 'dependency-map.json');
const runsRoot = path.join(supervisorDir, 'runs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function validateNonce(runNonce) {
  if (typeof runNonce !== 'string' || !/^[A-Za-z0-9_-]+$/.test(runNonce)) {
    throw new Error(`Invalid run_nonce: ${runNonce}`);
  }
  return runNonce;
}

function registryKeys() {
  const map = readJson(depMapPath);
  const registry = map.truth_readable_registry;
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('dependency-map.json.truth_readable_registry must be an object');
  }
  return Object.keys(registry);
}

function pathsFor(runNonce) {
  const runDir = path.join(runsRoot, validateNonce(runNonce));
  return {
    runDir,
    formPath: path.join(runDir, 'step-0-form.json'),
    lockPath: path.join(runDir, '.step-0-form.lock.json')
  };
}

function generateStep0Form(userRequest, existingNonce = null) {
  const runNonce = validateNonce(existingNonce || `run_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`);
  const { formPath, lockPath } = pathsFor(runNonce);
  if (fs.existsSync(formPath) || fs.existsSync(lockPath)) {
    throw new Error(`Step 0 form already exists for ${runNonce}`);
  }

  const documents = registryKeys();
  const documentSelection = Object.fromEntries(documents.map((docId) => [docId, false]));
  const generatedAt = new Date().toISOString();
  const request = typeof userRequest === 'string' ? userRequest : '';

  const form = {
    start_of_turn: {
      role_required: 'ChatGPT model',
      role_forbidden: 'Gemini model',
      role_completed: '',
      role_verification: {
        method: '',
        evidence: ''
      },
      run_nonce: runNonce,
      user_request: request,
      current_timestamp: generatedAt,
      return_schema_completed_timestamp: '',
      nonce: runNonce,
      task_understanding: '',
      execution_plan: '',
      document_selection: documentSelection,
      return_schema_completed: false
    },
    _form_control: {
      form_version: 1,
      step_number: 0,
      generated_at: generatedAt,
      selectable_document_universe: documents,
      worker_editable_paths: [
        'start_of_turn.role_completed',
        'start_of_turn.role_verification.method',
        'start_of_turn.role_verification.evidence',
        'start_of_turn.return_schema_completed_timestamp',
        'start_of_turn.task_understanding',
        'start_of_turn.execution_plan',
        'start_of_turn.document_selection.*',
        'start_of_turn.return_schema_completed'
      ]
    }
  };

  const lock = {
    form_version: 1,
    step_number: 0,
    run_nonce: runNonce,
    generated_at: generatedAt,
    locked: {
      role_required: form.start_of_turn.role_required,
      role_forbidden: form.start_of_turn.role_forbidden,
      run_nonce: form.start_of_turn.run_nonce,
      user_request: form.start_of_turn.user_request,
      current_timestamp: form.start_of_turn.current_timestamp,
      nonce: form.start_of_turn.nonce,
      selectable_document_universe: documents
    }
  };

  writeJson(formPath, form);
  writeJson(lockPath, lock);
  return { runNonce, formPath, lockPath, form };
}

function validateStep0Form(runNonce) {
  const { formPath, lockPath } = pathsFor(runNonce);
  if (!fs.existsSync(formPath) || !fs.existsSync(lockPath)) {
    throw new Error(`Step 0 form or lock missing for ${runNonce}`);
  }

  const form = readJson(formPath);
  const lock = readJson(lockPath);
  const start = form.start_of_turn;
  if (!start || typeof start !== 'object' || Array.isArray(start)) {
    throw new Error('Step 0 form requires start_of_turn object');
  }

  const expectedLocked = lock.locked;
  const actualLocked = {
    role_required: start.role_required,
    role_forbidden: start.role_forbidden,
    run_nonce: start.run_nonce,
    user_request: start.user_request,
    current_timestamp: start.current_timestamp,
    nonce: start.nonce,
    selectable_document_universe: form?._form_control?.selectable_document_universe
  };
  if (!isDeepStrictEqual(actualLocked, expectedLocked)) {
    throw new Error('Step 0 system-locked fields were modified');
  }

  const expectedDocs = [...expectedLocked.selectable_document_universe].sort();
  const selection = start.document_selection;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new Error('start_of_turn.document_selection must be an object');
  }
  const actualDocs = Object.keys(selection).sort();
  if (!isDeepStrictEqual(actualDocs, expectedDocs)) {
    throw new Error('Step 0 document-selection keys changed from the locked document universe');
  }
  for (const [docId, selected] of Object.entries(selection)) {
    if (typeof selected !== 'boolean') throw new Error(`document_selection.${docId} must be boolean`);
  }

  return form;
}

function main() {
  const mode = process.argv[2];
  if (mode === 'validate') {
    validateStep0Form(process.argv[3]);
    console.log(`Step 0 form valid for ${process.argv[3]}`);
    return;
  }
  if (mode === 'generate') {
    const runNonce = process.argv[3] || null;
    const userRequest = process.argv.slice(4).join(' ');
    const result = generateStep0Form(userRequest, runNonce);
    console.log(`Generated Step 0 form for ${result.runNonce}`);
    return;
  }
  throw new Error('Usage: node generate-step-0-form.js [generate <run_nonce> <user request...> | validate <run_nonce>]');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { generateStep0Form, validateStep0Form };
