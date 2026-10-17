import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

function byCreationTime(mapping, leftId, rightId) {
  const left = mapping[leftId];
  const right = mapping[rightId];
  const leftTime = left?.message?.create_time;
  const rightTime = right?.message?.create_time;
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return leftId.localeCompare(rightId);
}

export function branchPaths(conversation) {
  const mapping = conversation?.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new TypeError('Each conversation must have a mapping object');
  }

  const ids = Object.keys(mapping);
  const children = new Map(ids.map(id => [id, []]));
  const roots = [];

  for (const id of ids) {
    const node = mapping[id];
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new TypeError(`Mapping node ${id} must be an object`);
    }
    const parent = node.parent;
    if (parent == null) {
      roots.push(id);
    } else {
      if (typeof parent !== 'string' || !Object.hasOwn(mapping, parent)) {
        throw new Error(`Mapping node ${id} has a missing parent: ${String(parent)}`);
      }
      children.get(parent).push(id);
    }
  }

  for (const childIds of children.values()) {
    childIds.sort((a, b) => byCreationTime(mapping, a, b));
  }
  roots.sort((a, b) => byCreationTime(mapping, a, b));

  const paths = [];
  const visited = new Set();
  const stack = roots.slice().reverse().map(id => ({id, path: []}));

  while (stack.length) {
    const {id, path: ancestors} = stack.pop();
    if (ancestors.includes(id)) throw new Error(`Cycle detected at mapping node ${id}`);
    visited.add(id);
    const currentPath = [...ancestors, id];
    const next = children.get(id);
    if (next.length === 0) {
      paths.push(currentPath);
    } else {
      for (let index = next.length - 1; index >= 0; index--) {
        stack.push({id: next[index], path: currentPath});
      }
    }
  }

  if (visited.size !== ids.length) {
    const unreachable = ids.filter(id => !visited.has(id));
    throw new Error(`Mapping contains nodes outside every root path: ${unreachable.join(', ')}`);
  }

  return paths;
}

function textParts(message) {
  const parts = message?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.filter(part => typeof part === 'string').join('\n');
}

export function formatBranch(conversation, nodePath) {
  const turns = [];
  for (const nodeId of nodePath) {
    const message = conversation.mapping[nodeId]?.message;
    if (!message) continue;
    const role = message.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = textParts(message);
    if (!text.trim()) continue;
    turns.push(`${role}: ${text}`);
  }
  return turns.join('\n');
}

export function extractDialogues(batch) {
  const conversations = Array.isArray(batch) ? batch : [batch];
  if (conversations.length === 0) throw new Error('Batch contains no conversations');

  const outputs = [];
  conversations.forEach((conversation, conversationIndex) => {
    const paths = branchPaths(conversation);
    paths.forEach((nodePath, branchIndex) => {
      const text = formatBranch(conversation, nodePath);
      if (!text) return;
      outputs.push({conversationIndex, branchIndex, text});
    });
  });
  return outputs;
}

export function writeDialogues(batch, outputPath) {
  const dialogues = extractDialogues(batch);
  if (fs.existsSync(outputPath) && (!fs.statSync(outputPath).isDirectory() || fs.readdirSync(outputPath).length > 0)) {
    throw new Error(`Output directory must be new or empty: ${outputPath}`);
  }
  fs.mkdirSync(outputPath, {recursive: true});

  for (const dialogue of dialogues) {
    const conversation = Array.isArray(batch) ? batch[dialogue.conversationIndex] : batch;
    const id = conversation.id ?? conversation.conversation_id ?? `conversation-${dialogue.conversationIndex + 1}`;
    const filename = `${String(dialogue.conversationIndex + 1).padStart(4, '0')}-${safeName(id)}-branch-${String(dialogue.branchIndex + 1).padStart(4, '0')}.txt`;
    fs.writeFileSync(path.join(outputPath, filename), dialogue.text + '\n', {encoding: 'utf8', flag: 'wx'});
  }
  return dialogues.length;
}

function runTests() {
  const fixture = [{
    id: 'sample/one',
    mapping: {
      root: {id: 'root', parent: null, message: null},
      u1: {id: 'u1', parent: 'root', message: {author: {role: 'user'}, content: {parts: ['Question']}, create_time: 1}},
      a1: {id: 'a1', parent: 'u1', message: {author: {role: 'assistant'}, content: {parts: ['First answer']}, create_time: 2}},
      a2: {id: 'a2', parent: 'u1', message: {author: {role: 'assistant'}, content: {parts: ['Alternate answer']}, create_time: 3}},
      u2: {id: 'u2', parent: 'a1', message: {author: {role: 'user'}, content: {parts: ['Follow-up']}, create_time: 4}},
      tool: {id: 'tool', parent: 'u2', message: {author: {role: 'python'}, content: {parts: ['ignored']}, create_time: 5}},
      a3: {id: 'a3', parent: 'tool', message: {author: {role: 'assistant'}, content: {parts: ['Final']}, create_time: 6}},
    },
  }];
  const output = extractDialogues(fixture);
  assert.equal(output.length, 2);
  assert.equal(output[0].text, 'user: Question\nassistant: First answer\nuser: Follow-up\nassistant: Final');
  assert.equal(output[1].text, 'user: Question\nassistant: Alternate answer');
  assert.ok(output.every(item => !item.text.includes('sample/one')));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialogue-extraction-'));
  try {
    const outputDir = path.join(tempDir, 'out');
    assert.equal(writeDialogues(fixture, outputDir), 2);
    const files = fs.readdirSync(outputDir).sort();
    assert.equal(files.length, 2);
    assert.equal(fs.readFileSync(path.join(outputDir, files[0]), 'utf8').trim(), output[0].text);
    assert.equal(fs.readFileSync(path.join(outputDir, files[1]), 'utf8').trim(), output[1].text);
  } finally {
    fs.rmSync(tempDir, {recursive: true, force: true});
  }

  assert.throws(() => branchPaths({mapping: {orphan: {parent: 'missing'}}}), /missing parent/);
  assert.throws(() => branchPaths({mapping: {a: {parent: 'b'}, b: {parent: 'a'}}}), /outside every root path/);
  console.log('Dialogue extraction tests passed');
}

function safeName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+|\.+$/g, '') || 'conversation';
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--input' || flag === '--output') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      args[flag.slice(2)] = value;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!args.input || !args.output) throw new Error('Usage: node extract-dialogues.mjs --input <batch.json> --output <new-or-empty-directory>');
  return args;
}

function main() {
  if (process.argv.includes('--test')) return runTests();
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../../..');
  const inputPath = path.resolve(repoRoot, args.input);
  if (!inputPath.startsWith(repoRoot + path.sep)) throw new Error('Input must be a repository-relative path');
  const rootRealPath = fs.realpathSync(repoRoot);
  const inputRealPath = fs.realpathSync(inputPath);
  if (!inputRealPath.startsWith(rootRealPath + path.sep)) throw new Error('Input must resolve inside the repository');
  const outputPath = path.resolve(args.output);
  const batch = JSON.parse(fs.readFileSync(inputRealPath, 'utf8'));
  writeDialogues(batch, outputPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 2;
  }
}
