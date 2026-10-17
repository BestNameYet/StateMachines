#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function findScriptNodes(target, collected = []) {
  if (!target || typeof target !== 'object') {
    return collected;
  }
  if (Array.isArray(target)) {
    for (const element of target) {
      findScriptNodes(element, collected);
    }
    return collected;
  }
  for (const [key, value] of Object.entries(target)) {
    if (key === 'script' && typeof value === 'string') {
      collected.push(value);
    } else if (typeof value === 'object' && value !== null) {
      findScriptNodes(value, collected);
    }
  }
  return collected;
}

async function executeScript(scriptSource, index, childArgs) {
  process.stdout.write(`[MetaProcedure Runner] Executing script [${index + 1}]...\n`);

  const scriptFilename = path.resolve(process.cwd(), `metaprocedure_script_${index + 1}.js`);
  const scriptDirname = path.dirname(scriptFilename);

  const moduleObject = {
    id: scriptFilename,
    filename: scriptFilename,
    path: scriptDirname,
    exports: {},
    loaded: false,
    children: []
  };

  const simulatedArgv = [process.argv[0], scriptFilename, ...childArgs];

  const scopedProcess = new Proxy(process, {
    get(target, prop, receiver) {
      if (prop === 'argv') {
        return simulatedArgv;
      }
      const val = Reflect.get(target, prop);
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    }
  });

  const scopedRequire = function (id) {
    if (id === 'process' || id === 'node:process') {
      return scopedProcess;
    }
    return require(id);
  };
  for (const prop of Object.getOwnPropertyNames(require)) {
    try {
      scopedRequire[prop] = require[prop];
    } catch (_) {}
  }
  scopedRequire.main = moduleObject;

  const contextObject = {
    console,
    process: scopedProcess,
    require: scopedRequire,
    module: moduleObject,
    exports: moduleObject.exports,
    __filename: scriptFilename,
    __dirname: scriptDirname,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate
  };
  contextObject.global = contextObject;
  contextObject.globalThis = contextObject;

  const executionContext = vm.createContext(contextObject);
  const script = new vm.Script(scriptSource, {
    filename: scriptFilename,
    displayErrors: true
  });

  const originalArgv = process.argv;
  try {
    process.argv = simulatedArgv;
    const result = script.runInContext(executionContext);
    if (result && typeof result.then === 'function') {
      await result;
    }
  } finally {
    process.argv = originalArgv;
  }

  moduleObject.loaded = true;
  process.stdout.write(`[MetaProcedure Runner] Script [${index + 1}] executed successfully.\n`);
}

async function run() {
  const configPath = process.argv[2] || path.resolve(process.cwd(), 'config.json');
  const childArgs = process.argv.length > 2 ? process.argv.slice(3) : [];

  if (!fs.existsSync(configPath)) {
    console.error(`[MetaProcedure Runner] Target config file not found: ${configPath}`);
    process.exit(1);
  }

  let configData;
  try {
    const rawJson = fs.readFileSync(configPath, 'utf8');
    configData = JSON.parse(rawJson);
  } catch (parseError) {
    console.error(`[MetaProcedure Runner] Failed reading or parsing JSON from ${configPath}:`, parseError.message);
    process.exit(1);
  }

  const scripts = findScriptNodes(configData);
  if (scripts.length === 0) {
    console.log(`[MetaProcedure Runner] No 'script' string values detected in ${configPath}.`);
    return;
  }

  console.log(`[MetaProcedure Runner] Discovered ${scripts.length} script definition(s).`);
  for (let i = 0; i < scripts.length; i++) {
    try {
      await executeScript(scripts[i], i, childArgs);
    } catch (scriptError) {
      console.error(`[MetaProcedure Runner] Failure during execution of script [${i + 1}]:`, scriptError);
      process.exitCode = 1;
    }
  }
}

run().catch((fatalError) => {
  console.error('[MetaProcedure Runner] Fatal runner error:', fatalError);
  process.exit(1);
});
