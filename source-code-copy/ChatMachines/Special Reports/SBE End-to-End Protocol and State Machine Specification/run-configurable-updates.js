#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const reportRoot = __dirname;
const repoRoot = path.resolve(reportRoot, '../../..');
const defaultConfigPath = path.join(reportRoot, 'configurable-updates.yml');

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function loadConfig(configPath) {
  const parsed = YAML.parse(fs.readFileSync(configPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Configuration must be a YAML object.');
  }
  if (parsed.version !== 1) {
    throw new Error('Configuration version must equal 1.');
  }
  if (!Array.isArray(parsed.lists)) {
    throw new Error('Configuration lists must be an array.');
  }
  return parsed;
}

async function main() {
  const requestedConfig = process.argv[2]
    ? path.resolve(repoRoot, process.argv[2])
    : defaultConfigPath;

  if (!isInside(reportRoot, requestedConfig)) {
    throw new Error('Configuration file must be inside the SBE report root.');
  }
  if (!fs.existsSync(requestedConfig)) {
    throw new Error(`Configuration file not found: ${requestedConfig}`);
  }

  const config = loadConfig(requestedConfig);

  for (let listIndex = 0; listIndex < config.lists.length; listIndex++) {
    const list = config.lists[listIndex];
    if (!list || typeof list !== 'object' || Array.isArray(list)) {
      throw new Error(`lists[${listIndex}] must be an object.`);
    }
    if (typeof list.name !== 'string' || list.name.trim() === '') {
      throw new Error(`lists[${listIndex}].name must be a non-empty string.`);
    }
    if (typeof list.script !== 'string' || list.script.trim() === '') {
      throw new Error(`lists[${listIndex}].script must be a non-empty string.`);
    }
    if (!Array.isArray(list.args)) {
      throw new Error(`lists[${listIndex}].args must be an array of positional-argument arrays.`);
    }

    const scriptPath = path.resolve(reportRoot, list.script);
    if (!isInside(reportRoot, scriptPath)) {
      throw new Error(`${list.name}: script must be inside the SBE report root.`);
    }
    if (path.extname(scriptPath).toLowerCase() !== '.js') {
      throw new Error(`${list.name}: script must be a .js file.`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`${list.name}: script not found: ${list.script}`);
    }

    delete require.cache[require.resolve(scriptPath)];
    const handler = require(scriptPath);
    if (typeof handler !== 'function') {
      throw new Error(`${list.name}: ${list.script} must export one function.`);
    }

    for (let argIndex = 0; argIndex < list.args.length; argIndex++) {
      const args = list.args[argIndex];
      if (!Array.isArray(args)) {
        throw new Error(`${list.name}.args[${argIndex}] must be an array of positional arguments.`);
      }
      console.log(`${list.name}[${argIndex}] -> ${list.script}(${args.length} arg(s))`);
      await handler(...args);
    }
  }

  console.log(`Completed ${config.lists.length} configured list(s).`);
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
