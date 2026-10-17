'use strict';

/**
 * Canonical atomic JSON flattening as specified by the GeminiSupervisor README.
 * Each returned projection element contributes exactly one source fact and keeps
 * only the original nested ancestor structure needed to locate that fact.
 * No third-party dependencies. No source mutation or index/path metadata.
 *
 * @param {object|Array} input A parsed JSON object or array (not a scalar).
 * @returns {Array<object|Array>} Canonically ordered atomic projection.
 */
function flattenJson(input) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('Canonical flattening requires a JSON object or array root.');
  }

  const projection = [Array.isArray(input) ? [] : {}];

  /** Build one atom by wrapping one payload fact in its literal ancestor route. */
  function emit(route, fact) {
    let atom = fact;
    for (let i = route.length - 1; i >= 0; i -= 1) {
      const step = route[i];
      atom = step.kind === 'member' ? [atom] : { [step.key]: atom };
    }
    projection.push(atom);
  }

  /**
   * @param {*} value Current JSON value.
   * @param {Array<{kind: 'member'}|{kind: 'property', key: string}>} route
   * @param {boolean} keyed Whether the current value is an object property.
   */
  function visit(value, route, keyed) {
    if (Array.isArray(value)) {
      if (keyed || (route.length > 0 && value.length === 0)) {
        emit(route, []);
      }
      for (const member of value) {
        visit(member, route.concat({ kind: 'member' }), false);
      }
      return;
    }

    if (value !== null && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keyed || (route.length > 0 && keys.length === 0)) {
        emit(route, {});
      }
      for (const key of keys) {
        visit(value[key], route.concat({ kind: 'property', key }), true);
      }
      return;
    }

    // Any scalar encountered here is an object-property value or array member.
    emit(route, value);
  }

  visit(input, [], false);
  return projection;
}

/** Each atom is a single-branch chain ending in exactly one fact. */
function isAtomic(atom) {
  let node = atom;
  while (true) {
    if (Array.isArray(node)) {
      if (node.length === 0) return true;
      if (node.length !== 1) return false;
      node = node[0];
    } else if (node !== null && typeof node === 'object') {
      const keys = Object.keys(node);
      if (keys.length === 0) return true;
      if (keys.length !== 1) return false;
      node = node[keys[0]];
    } else {
      return true;
    }
  }
}

/** Execute exact README examples plus independent edge cases. */
function runTests() {
  const assert = require('node:assert/strict');
  const cases = [
    {
      id: 'T1', description: 'README nested objects',
      input: { procedure: { step_contract: { step_0: { key: 'start_of_turn', value: 'ready' } } } },
      expected: [
        {}, { procedure: {} }, { procedure: { step_contract: {} } },
        { procedure: { step_contract: { step_0: {} } } },
        { procedure: { step_contract: { step_0: { key: 'start_of_turn' } } } },
        { procedure: { step_contract: { step_0: { value: 'ready' } } } }
      ]
    },
    {
      id: 'T2', description: 'README keyed array',
      input: { rule_following: ['A', 'B', 'C'] },
      expected: [{}, { rule_following: [] }, { rule_following: ['A'] },
        { rule_following: ['B'] }, { rule_following: ['C'] }]
    },
    {
      id: 'T3', description: 'README mixed object/array nesting',
      input: { outer: [{ inner: ['A', 'B'] }] },
      expected: [{}, { outer: [] }, { outer: [{ inner: [] }] },
        { outer: [{ inner: ['A'] }] }, { outer: [{ inner: ['B'] }] }]
    },
    {
      id: 'T4', description: 'README otherwise-disappearing empty anonymous object',
      input: { outer: [{}] },
      expected: [{}, { outer: [] }, { outer: [{}] }]
    },
    { id: 'E1', description: 'Empty root object', input: {}, expected: [{}] },
    { id: 'E2', description: 'Empty root array', input: [], expected: [[]] },
    {
      id: 'E3', description: 'Empty keyed containers',
      input: { obj: {}, arr: [] },
      expected: [{}, { obj: {} }, { arr: [] }]
    },
    {
      id: 'E4', description: 'Null, false, zero, empty string, true and decimal',
      input: { n: null, b: false, z: 0, s: '', t: true, f: 1.25 },
      expected: [{}, { n: null }, { b: false }, { z: 0 },
        { s: '' }, { t: true }, { f: 1.25 }]
    },
    {
      id: 'E5', description: 'Repeated array values remain separate atoms',
      input: { a: ['x', 'x', null] },
      expected: [{}, { a: [] }, { a: ['x'] }, { a: ['x'] }, { a: [null] }]
    },
    {
      id: 'E6', description: 'Anonymous nested arrays with an empty member',
      input: [[1, 2], []],
      expected: [[], [[1]], [[2]], [[]]]
    },
    {
      id: 'E7', description: 'Mixed array members',
      input: { top: [{ x: 1 }, { y: 2 }, [], {}] },
      expected: [{}, { top: [] }, { top: [{ x: 1 }] },
        { top: [{ y: 2 }] }, { top: [[]] }, { top: [{}] }]
    },
    {
      id: 'E8', description: 'Deeply nested mixed array/object value',
      input: { x: [{ y: [[{ z: null }]] }] },
      expected: [{}, { x: [] }, { x: [{ y: [] }] }, { x: [{ y: [[{ z: null }]] }] }]
    },
    {
      id: 'E9', description: 'Property named __proto__ is retained literally',
      input: JSON.parse('{"__proto__":{"p":1}}'),
      expected: [
        {}, JSON.parse('{"__proto__":{}}'),
        JSON.parse('{"__proto__":{"p":1}}')
      ]
    },
    {
      id: 'E10', description: 'Array of scalar types',
      input: [null, false, 0, ''],
      expected: [[], [null], [false], [0], ['']]
    }
  ];

  const tests = [];
  for (const tc of cases) {
    let actual;
    try {
      const before = JSON.stringify(tc.input);
      actual = flattenJson(tc.input);
      assert.deepStrictEqual(actual, tc.expected);
      assert.strictEqual(JSON.stringify(tc.input), before, 'Input mutation');
      assert(actual.every(isAtomic), 'Non-atomic element');
      assert.deepStrictEqual(flattenJson(tc.input), actual, 'Non-deterministic output');
      assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), actual, 'JSON serialization loss');
      tests.push({ test_id: tc.id, description: tc.description,
        expected: tc.expected, actual, status: 'PASS' });
    } catch (err) {
      tests.push({ test_id: tc.id, description: tc.description,
        expected: tc.expected, actual: actual === undefined ? null : actual,
        status: 'FAIL', error: String(err) });
    }
  }

  const rejection = { test_id: 'E11', description: 'Scalar JSON roots are rejected',
    expected: 'TypeError', actual: null, status: 'PASS' };
  try {
    assert.throws(() => flattenJson(null), TypeError);
    assert.throws(() => flattenJson(5), TypeError);
    assert.throws(() => flattenJson('hello'), TypeError);
    rejection.actual = 'TypeError';
  } catch (err) {
    rejection.status = 'FAIL';
    rejection.actual = String(err);
  }
  tests.push(rejection);
  return { tests, passed: tests.filter(t => t.status === 'PASS').length,
    failed: tests.filter(t => t.status === 'FAIL').length };
}

if (require.main === module) {
  const fs = require('node:fs');
  if (process.argv[2] === '--test') {
    const result = runTests();
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.failed !== 0) process.exitCode = 1;
  } else if (process.argv.length === 3) {
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
      process.stdout.write(JSON.stringify(flattenJson(value)) + '\n');
    } catch (err) {
      process.stderr.write(String(err) + '\n');
      process.exitCode = 1;
    }
  } else {
    process.stderr.write('Usage: node flatten-json.js input.json | node flatten-json.js --test\n');
    process.exitCode = 2;
  }
}

module.exports = { flattenJson, isAtomic, runTests };
