#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../../..');
const requestPath = path.join(repoRoot, 'ChatMachines/GeminiSupervisor/live-ground-truth/read-request.json');
const roomPath = path.join(repoRoot, 'ChatMachines/GeminiSupervisor/live-ground-truth/reading-room');
const taskDefinitionPath = path.join(repoRoot, 'ChatMachines/ComprehensionTasks/Tasks/task_semantic_define_each_array_item.json');
const projectionRelativePath = 'ChatMachines/ComprehensionTasks/ProjectionsForTasks/agentsmdbaseproejction.json';
const projectionPath = path.join(repoRoot, projectionRelativePath);
const flattenCheckerPath = path.join(repoRoot, 'ChatMachines/ComprehensionTasks/scripts/check-single-child.js');

const TASK_ID = 'task_semantic_define_each_array_item';
const ACTIVE_RE = new RegExp(`^${TASK_ID}-([0-9a-f]{40})\\.json$`, 'i');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function validateCommitSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value || '')) throw new Error(`Invalid commit SHA: ${value}`);
  return value.toLowerCase();
}

function activePathFor(commitSha) {
  return path.join(roomPath, `${TASK_ID}-${validateCommitSha(commitSha)}.json`);
}

function resultPathFor(commitSha, status) {
  return path.join(roomPath, `${TASK_ID}-${validateCommitSha(commitSha)}-${status}.json`);
}

function removeActiveInstances() {
  if (!fs.existsSync(roomPath)) return;
  for (const name of fs.readdirSync(roomPath)) {
    if (ACTIVE_RE.test(name)) fs.rmSync(path.join(roomPath, name), { force: true });
  }
}

function resolveRepoFile(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new Error('Expected a non-empty repository-relative filename.');
  }
  const resolved = path.resolve(repoRoot, relativePath);
  const prefix = `${repoRoot}${path.sep}`;
  if (resolved !== repoRoot && !resolved.startsWith(prefix)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

function filePredicates(relativePath) {
  const absolute = resolveRepoFile(relativePath);
  const exists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  let parsed = null;
  let raw = '';
  let isJson = false;
  let isMinified = false;
  let isFlattened = false;

  if (exists) {
    raw = fs.readFileSync(absolute, 'utf8');
    try {
      parsed = JSON.parse(raw);
      isJson = true;
      isMinified = raw.trim() === JSON.stringify(parsed);
    } catch {
      isJson = false;
    }
  }

  if (exists && isJson) {
    try {
      const output = execFileSync(process.execPath, [flattenCheckerPath, absolute], { encoding: 'utf8' });
      const result = JSON.parse(output);
      isFlattened = result.valid === true;
    } catch {
      isFlattened = false;
    }
  }

  return {
    file_does_exist_$bool: exists,
    file_is_json_$bool: isJson,
    file_is_minified_$bool: isMinified,
    file_is_flattened_$bool: isFlattened,
    parsed
  };
}

function terminalNode(value) {
  let node = value;
  while (node !== null && typeof node === 'object') {
    if (Array.isArray(node)) {
      if (node.length !== 1) return node;
      node = node[0];
      continue;
    }
    const keys = Object.keys(node);
    if (keys.length !== 1) return node;
    node = node[keys[0]];
  }
  return node;
}

function terminalIsEmptyContainer(value) {
  const terminal = terminalNode(value);
  if (Array.isArray(terminal)) return terminal.length === 0;
  return terminal !== null && typeof terminal === 'object' && Object.keys(terminal).length === 0;
}

function expectedNonemptyCount(array) {
  if (!Array.isArray(array)) throw new Error('Target JSON must be an array.');
  return array.reduce((count, item) => count + (terminalIsEmptyContainer(item) ? 0 : 1), 0);
}

function parseJsonArchive(archiveRelativePath) {
  const absolute = resolveRepoFile(archiveRelativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`Complete batch archive does not exist: ${archiveRelativePath}`);
  }

  const lower = archiveRelativePath.toLowerCase();
  let text;

  if (lower.endsWith('.zip')) {
    const listing = execFileSync('unzip', ['-Z1', absolute], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter(name => name.toLowerCase().endsWith('.json'));
    if (listing.length !== 1) throw new Error('ZIP solution must contain exactly one JSON file.');
    text = execFileSync('unzip', ['-p', absolute, listing[0]], { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    const listing = execFileSync('tar', ['-tzf', absolute], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter(name => name.toLowerCase().endsWith('.json'));
    if (listing.length !== 1) throw new Error('TAR.GZ solution must contain exactly one JSON file.');
    text = execFileSync('tar', ['-xOzf', absolute, listing[0]], { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  } else if (lower.endsWith('.gz')) {
    text = zlib.gunzipSync(fs.readFileSync(absolute)).toString('utf8');
  } else {
    text = fs.readFileSync(absolute, 'utf8');
  }

  return JSON.parse(text);
}

function validateDefinitionOnlyArray(records, expectedCount) {
  if (!Array.isArray(records)) return false;
  if (records.length !== expectedCount) return false;
  for (let i = 0; i < records.length; i++) {
    if (!(i in records)) return false;
    const record = records[i];
    if (record === null || typeof record !== 'object' || Array.isArray(record)) return false;
    const keys = Object.keys(record);
    if (keys.length !== 1 || keys[0] !== 'item') return false;
    if (typeof record.item !== 'string' || record.item.trim() === '') return false;
  }
  return true;
}

async function issue(commitSha) {
  const sha = validateCommitSha(commitSha);
  const request = readJson(requestPath);
  if (request['Agents.md'] !== true) throw new Error('read-request.json must contain "Agents.md": true');

  const task = readJson(taskDefinitionPath);
  const predicates = filePredicates(projectionRelativePath);
  const readiness = [
    predicates.file_does_exist_$bool,
    predicates.file_is_json_$bool,
    predicates.file_is_minified_$bool,
    predicates.file_is_flattened_$bool
  ];
  if (!readiness.every(Boolean)) {
    throw new Error(`Comprehension target is not ready: ${JSON.stringify({
      file_does_exist_$bool: predicates.file_does_exist_$bool,
      file_is_json_$bool: predicates.file_is_json_$bool,
      file_is_minified_$bool: predicates.file_is_minified_$bool,
      file_is_flattened_$bool: predicates.file_is_flattened_$bool
    })}`);
  }

  const instance = JSON.parse(JSON.stringify(task));
  instance.verify_target_array.filename = projectionRelativePath;

  fs.mkdirSync(roomPath, { recursive: true });
  removeActiveInstances();
  writeJson(activePathFor(sha), instance);
  console.log(`[comprehension-task] instantiated ${TASK_ID} for ${projectionRelativePath}`);
}

async function verify(instanceRelativePath, evaluationCommitSha) {
  const evaluationSha = validateCommitSha(evaluationCommitSha);
  const absoluteInstance = resolveRepoFile(instanceRelativePath);
  if (!fs.existsSync(absoluteInstance)) throw new Error(`Task instance not found: ${instanceRelativePath}`);

  const instance = readJson(absoluteInstance);
  const target = instance?.verify_target_array?.filename;
  const predicates = filePredicates(target);
  const ready = predicates.file_does_exist_$bool && predicates.file_is_json_$bool && predicates.file_is_minified_$bool && predicates.file_is_flattened_$bool;
  let pass = ready;
  let expectedCount = null;
  let archiveFilename = null;
  let failure = null;

  try {
    if (!ready) throw new Error('Target-array readiness truth table did not evaluate to AND=true.');
    expectedCount = expectedNonemptyCount(predicates.parsed);

    if (instance?.count_array_nonempty_items?.filename !== '$verify_target_array.filename') {
      throw new Error('count_array_nonempty_items.filename no longer points to verify_target_array.filename.');
    }
    if (instance?.count_array_nonempty_items?.how_many !== expectedCount) {
      throw new Error(`how_many must equal ${expectedCount}.`);
    }
    if (instance?.doRecord_withReturnSchema?.original_array_filename !== '$verify_target_array.filename') {
      throw new Error('original_array_filename no longer points to verify_target_array.filename.');
    }
    if (instance?.doRecord_withReturnSchema?.nonempty_items_counted !== expectedCount) {
      throw new Error(`nonempty_items_counted must equal ${expectedCount}.`);
    }
    if (instance?.doRecord_withReturnSchema?.returnSchemaArraySize !== expectedCount) {
      throw new Error(`returnSchemaArraySize must equal ${expectedCount}.`);
    }

    const batches = instance?.doRecord_withReturnSchema?.batch_archive_filenames;
    if (!Array.isArray(batches) || (expectedCount > 0 && batches.length === 0)) {
      throw new Error('batch_archive_filenames must record the generated batch archives.');
    }

    archiveFilename = instance?.combine_and_send_batch_archives?.complete_batch_archive_filename;
    if (typeof archiveFilename !== 'string' || archiveFilename.trim() === '' || archiveFilename === 'not_yet_combined') {
      throw new Error('complete_batch_archive_filename has not been completed.');
    }

    const records = parseJsonArchive(archiveFilename);
    if (!validateDefinitionOnlyArray(records, expectedCount)) {
      throw new Error('Complete archive does not contain exactly one non-empty {"item":"definition"} record per non-empty source signature.');
    }
  } catch (error) {
    pass = false;
    failure = error.message;
  }

  fs.rmSync(absoluteInstance, { force: true });

  if (pass) {
    writeJson(resultPathFor(evaluationSha, 'PASS'), {
      status: 'PASS',
      task: TASK_ID,
      source_filename: target,
      nonempty_items_counted: expectedCount,
      complete_batch_archive_filename: archiveFilename
    });
    console.log(`[comprehension-task] PASS ${evaluationSha}`);
    return true;
  }

  writeJson(resultPathFor(evaluationSha, 'FAILED'), {
    status: 'FAILED',
    task: TASK_ID,
    reason: failure || 'Task completion verification failed.'
  });
  console.log(`[comprehension-task] FAILED ${evaluationSha}: ${failure || 'verification failed'}`);
  return false;
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'issue') {
    await issue(process.argv[3]);
    return;
  }
  if (mode === 'verify') {
    const ok = await verify(process.argv[3], process.argv[4]);
    process.exitCode = ok ? 0 : 2;
    return;
  }
  throw new Error('Usage: comprehension-task-reading-room.js issue <commit-sha> | verify <task-instance-path> <evaluation-commit-sha>');
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
