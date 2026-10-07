'use strict';

const fs = require('node:fs');

const [sourcePath, rebuiltPath, reportPath] = process.argv.slice(2);
if (!sourcePath || !rebuiltPath || !reportPath) {
  throw new Error('Usage: node validate-rebuild.js <source.html> <rebuilt.html> <report.json>');
}

const targetKeys = new Set([
  'is_visually_hidden_from_conversation',
  'is_redacted',
  'hide_inline_actions'
]);

const expectedSourceTrue = {
  is_visually_hidden_from_conversation: 673,
  is_redacted: 1806,
  hide_inline_actions: 301
};

function payloadInfo(html) {
  const re = /streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g;
  const chunks = [];
  let match;
  while ((match = re.exec(html))) {
    let decoded;
    try {
      decoded = JSON.parse(match[1]);
    } catch {
      continue;
    }
    chunks.push({
      start: match.index,
      end: re.lastIndex,
      literal: match[1],
      decoded
    });
  }
  const main = chunks.find(
    item => typeof item.decoded === 'string' && item.decoded.trim().startsWith('[')
  );
  if (!main) {
    throw new Error('Main flattened React Router payload not found.');
  }
  const raw = JSON.parse(main.decoded.trim());
  if (!Array.isArray(raw)) {
    throw new Error('Main payload did not parse to a flat array.');
  }
  return { main, raw };
}

function semanticAt(raw, slot) {
  if (slot === -5 || slot === -1) return undefined;
  if (slot === -2) return NaN;
  if (slot === -3) return Infinity;
  if (slot === -4) return -Infinity;
  if (typeof slot !== 'number' || slot < 0 || slot >= raw.length) return slot;
  return raw[slot];
}

function targetStats(raw) {
  const counts = Object.fromEntries(
    [...targetKeys].map(key => [key, { true: 0, false: 0, other: 0 }])
  );
  for (const item of raw) {
    if (!item || Array.isArray(item) || typeof item !== 'object') continue;
    for (const [encodedKey, valueSlot] of Object.entries(item)) {
      if (!/^_\d+$/.test(encodedKey)) continue;
      const name = raw[Number(encodedKey.slice(1))];
      if (!targetKeys.has(name)) continue;
      const value = semanticAt(raw, valueSlot);
      if (value === true) counts[name].true += 1;
      else if (value === false) counts[name].false += 1;
      else counts[name].other += 1;
    }
  }
  return counts;
}

function decode(raw) {
  const cache = new Map();

  function decodeSlot(slot) {
    if (slot === -5 || slot === -1) return undefined;
    if (slot === -2) return NaN;
    if (slot === -3) return Infinity;
    if (slot === -4) return -Infinity;
    if (typeof slot !== 'number' || slot < 0 || slot >= raw.length) return slot;
    if (cache.has(slot)) return cache.get(slot);

    const item = raw[slot];
    if (item === null || typeof item !== 'object') {
      cache.set(slot, item);
      return item;
    }

    if (Array.isArray(item)) {
      if (item.length === 2 && item[0] === 'P') {
        const promiseMarker = { __promise: item[1] };
        cache.set(slot, promiseMarker);
        return promiseMarker;
      }
      if (item.length === 2 && item[0] === 'D') {
        const date = new Date(item[1]);
        cache.set(slot, date);
        return date;
      }
      const array = [];
      cache.set(slot, array);
      for (const value of item) array.push(decodeSlot(value));
      return array;
    }

    const object = {};
    cache.set(slot, object);
    for (const [key, valueSlot] of Object.entries(item)) {
      const propertyName = key.startsWith('_') ? raw[Number(key.slice(1))] : key;
      const propertyValue = decodeSlot(valueSlot);
      if (propertyName !== undefined && propertyValue !== undefined) {
        object[propertyName] = propertyValue;
      }
    }
    return object;
  }

  return decodeSlot(0);
}

function normalizeTargets(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) normalizeTargets(item, seen);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (targetKeys.has(key) && child === true) {
      value[key] = false;
    } else {
      normalizeTargets(child, seen);
    }
  }
}

function countHideAll(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  let count = 0;
  if (Array.isArray(value)) {
    for (const item of value) count += countHideAll(item, seen);
    return count;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'reasoning_recap_type' && child === 'hide_all') count += 1;
    count += countHideAll(child, seen);
  }
  return count;
}

const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
const rebuiltHtml = fs.readFileSync(rebuiltPath, 'utf8');
const source = payloadInfo(sourceHtml);
const rebuilt = payloadInfo(rebuiltHtml);

const sourceOutside =
  sourceHtml.slice(0, source.main.start) +
  '__MAIN_PAYLOAD__' +
  sourceHtml.slice(source.main.end);
const rebuiltOutside =
  rebuiltHtml.slice(0, rebuilt.main.start) +
  '__MAIN_PAYLOAD__' +
  rebuiltHtml.slice(rebuilt.main.end);

if (sourceOutside !== rebuiltOutside) {
  throw new Error('HTML changed outside the main streamController.enqueue payload.');
}

const before = targetStats(source.raw);
const after = targetStats(rebuilt.raw);

for (const key of targetKeys) {
  if (before[key].true !== expectedSourceTrue[key]) {
    throw new Error(
      `Unexpected source true-count for ${key}: expected ${expectedSourceTrue[key]}, got ${before[key].true}`
    );
  }
  if (after[key].true !== 0) {
    throw new Error(`Target key still has true values after rebuild: ${key}`);
  }
  if (after[key].false !== before[key].true + before[key].false) {
    throw new Error(`Target occurrence count changed unexpectedly for ${key}`);
  }
  if (after[key].other !== before[key].other) {
    throw new Error(`Non-boolean values changed for target key ${key}`);
  }
}

const sourceRoot = decode(source.raw);
const rebuiltRoot = decode(rebuilt.raw);
const sourceHideAll = countHideAll(sourceRoot);
const rebuiltHideAll = countHideAll(rebuiltRoot);

if (sourceHideAll !== 19 || rebuiltHideAll !== sourceHideAll) {
  throw new Error(
    `reasoning_recap_type=hide_all changed or source count was unexpected: ${sourceHideAll} -> ${rebuiltHideAll}`
  );
}

normalizeTargets(sourceRoot);
if (JSON.stringify(sourceRoot) !== JSON.stringify(rebuiltRoot)) {
  throw new Error('Decoded payload differs beyond the requested target true-to-false changes.');
}

const report = {
  status: 'PASS',
  source_html: sourcePath,
  rebuilt_html: rebuiltPath,
  target_counts_before: before,
  target_counts_after: after,
  reasoning_recap_type_hide_all: {
    before: sourceHideAll,
    after: rebuiltHideAll
  },
  html_outside_main_payload_identical: true,
  decoded_payload_matches_expected_transformation: true
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
