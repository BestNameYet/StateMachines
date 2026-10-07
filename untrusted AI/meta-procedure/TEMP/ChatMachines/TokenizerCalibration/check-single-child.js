#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function getChildInfo(value) {
  if (value === null || typeof value !== 'object') {
    return { count: 0, type: 'primitive' };
  }
  if (Array.isArray(value)) {
    return { count: value.length, type: 'array' };
  }
  return { count: Object.keys(value).length, type: 'object' };
}

function formatPath(basePath, segment, isIndex = false) {
  if (isIndex) {
    return basePath ? `${basePath}[${segment}]` : `[${segment}]`;
  }
  const safeIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  if (safeIdentifier.test(segment)) {
    return basePath ? `${basePath}.${segment}` : segment;
  }
  return basePath ? `${basePath}[${JSON.stringify(segment)}]` : `[${JSON.stringify(segment)}]`;
}

function checkItem(node, currentPath, topLevelIndex, violations) {
  if (node === null || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const element = node[i];
      const elementPath = formatPath(currentPath, i, true);
      checkItem(element, elementPath, topLevelIndex, violations);
    }
    return;
  }

  for (const key of Object.keys(node)) {
    const value = node[key];
    const keyPath = formatPath(currentPath, key, false);
    const childInfo = getChildInfo(value);

    if (childInfo.count > 1) {
      violations.push({
        top_level_index: topLevelIndex,
        path: keyPath,
        child_count: childInfo.count,
        value_type: childInfo.type
      });
    }

    if (value !== null && typeof value === 'object') {
      checkItem(value, keyPath, topLevelIndex, violations);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(JSON.stringify({
      error: 'Missing required file path argument.',
      usage: 'node check-single-child.js <path-to-json-file>'
    }, null, 2));
    process.exit(2);
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    console.error(JSON.stringify({
      error: `File not found: ${inputPath}`
    }, null, 2));
    process.exit(2);
  }

  let raw;
  try {
    raw = fs.readFileSync(inputPath, 'utf8');
  } catch (err) {
    console.error(JSON.stringify({
      error: `Failed to read file: ${err.message}`
    }, null, 2));
    process.exit(2);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(JSON.stringify({
      error: `Failed to parse JSON: ${err.message}`
    }, null, 2));
    process.exit(2);
  }

  if (!Array.isArray(data)) {
    console.error(JSON.stringify({
      error: 'Top-level JSON value must be an array.'
    }, null, 2));
    process.exit(2);
  }

  const violations = [];
  for (let i = 0; i < data.length; i++) {
    checkItem(data[i], '', i, violations);
  }

  const result = {
    file: inputPath,
    total_top_level_items: data.length,
    valid: violations.length === 0,
    violation_count: violations.length,
    violations
  };

  console.log(JSON.stringify(result, null, 2));

  if (violations.length > 0) {
    process.exit(1);
  }
}

main();
