'use strict';

const fs = require('node:fs');

const inputPath = 'ChatMachines/TokenizerCalibration/agents-by-header.json';
const outputPath = 'ChatMachines/TokenizerCalibration/agents-by-header-flattened.json';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isContainer(value) {
  return Array.isArray(value) || isObject(value);
}

function decomposeObjectMembers(objectValue, wrap, atoms) {
  const keys = Object.keys(objectValue);
  if (keys.length === 0) {
    atoms.push(wrap({}));
    return;
  }

  for (const key of keys) {
    const child = objectValue[key];

    if (isObject(child)) {
      atoms.push(wrap({ [key]: {} }));
      if (Object.keys(child).length > 0) {
        decomposeObjectMembers(child, value => wrap({ [key]: value }), atoms);
      }
      continue;
    }

    if (Array.isArray(child)) {
      atoms.push(wrap({ [key]: [] }));
      if (child.length > 0) {
        decomposeArrayMembers(child, value => wrap({ [key]: value }), atoms);
      }
      continue;
    }

    atoms.push(wrap({ [key]: child }));
  }
}

function decomposeArrayMembers(arrayValue, wrap, atoms) {
  for (const member of arrayValue) {
    if (isObject(member)) {
      if (Object.keys(member).length === 0) {
        atoms.push(wrap([{}]));
      } else {
        decomposeObjectMembers(member, value => wrap([value]), atoms);
      }
      continue;
    }

    if (Array.isArray(member)) {
      if (member.length === 0) {
        atoms.push(wrap([[]]));
      } else {
        decomposeArrayMembers(member, value => wrap([value]), atoms);
      }
      continue;
    }

    atoms.push(wrap([member]));
  }
}

function flattenAtomicProjection(source) {
  const atoms = [];
  const identity = value => value;

  if (isObject(source)) {
    atoms.push({});
    decomposeObjectMembers(source, identity, atoms);
    return atoms;
  }

  if (Array.isArray(source)) {
    atoms.push([]);
    decomposeArrayMembers(source, identity, atoms);
    return atoms;
  }

  return [source];
}

function main() {
  const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const flattened = flattenAtomicProjection(source);
  fs.writeFileSync(outputPath, JSON.stringify(flattened) + '\n', 'utf8');
  console.log(JSON.stringify({ input: inputPath, output: outputPath, atoms: flattened.length }));
}

if (require.main === module) main();

module.exports = { flattenAtomicProjection };
