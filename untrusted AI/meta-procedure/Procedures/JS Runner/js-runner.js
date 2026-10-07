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

async function executeScript(scriptSource, index) {
  process.stdout.write(`[MetaProcedure Runner] Executing script [${index + 1}]...\n`);
  const contextObject = {
    console,
    process,
    require,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate
  };
  const executionContext = vm.createContext(contextObject);
  const script = new vm.Script(scriptSource, {
    filename: `metaprocedure_script_${index + 1}.js`,
    displayErrors: true
  });
  const result = script.runInContext(executionContext);
  if (result && typeof result.then === 'function') {
    await result;
  }
  process.stdout.write(`[MetaProcedure Runner] Script [${index + 1}] executed successfully.\n`);
}

async function run() {
  const configPath = process.argv[2] || path.resolve(process.cwd(), 'config.json');
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
      await executeScript(scripts[i], i);
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