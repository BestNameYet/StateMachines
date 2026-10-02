'use strict';

const fs = require('node:fs');
const path = require('node:path');
const runtime = require('../../hierarchical-runtime/audit.js');

const repoRoot = path.resolve(process.cwd());
const evalRoot = 'ChatMachines/GeminiEvaluation/evaluations/stage1_current_feature_inventory_20261002_1';
const configPath = path.join(repoRoot, evalRoot, 'config.json');
const analysisPath = path.join(repoRoot, 'ChatMachines/TokenizerCalibration/stage1-corpus-analysis.json');
const batchesRoot = path.join(repoRoot, 'ChatMachines/TokenizerCalibration/stage1-batches');
const outputRoot = path.join(repoRoot, evalRoot, 'execution');
const model = 'gemini-3.8-flash';
const charsPerToken = 3.9;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function approximateTokens(value) {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (value !== null && value !== undefined) text = JSON.stringify(value);
  return text ? Math.ceil(text.length / charsPerToken) : 0;
}

function updateConfig(config) {
  config.token_counter = {
    implementation: 'linear_chars_divisor',
    characters_per_token: charsPerToken,
    formula: 'Math.ceil(text.length / 3.9)'
  };
  for (const rule of config.B_rules || []) {
    if (rule?.iterator?.evaluator) rule.iterator.evaluator.model = model;
  }
  return config;
}

function persistBatchResult(B, b, result) {
  const dir = path.join(outputRoot, `B${B}`);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, `b${b}.json`), result);
}

function persistRound(round, aggregate) {
  const dir = path.join(outputRoot, `B${round.B}`);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'round.json'), {
    B: round.B,
    status: round.status,
    assignedBatchCount: round.assignedBatchCount,
    aggregateResponseTokens: round.aggregateResponseTokens,
    batches: round.batches,
    aggregate
  });
}

function persistState(state, finalReturn = null) {
  writeJson(path.join(outputRoot, 'runtime-state.json'), state);
  if (finalReturn !== null) writeJson(path.join(outputRoot, 'final.json'), finalReturn);
}

async function processRound({state, config, dependencies, batches}) {
  const iterator = runtime.resolveIteratorForB(state.B, config);
  const round = runtime.createRoundState({ B: state.B, batches, iterator });
  state.b = 0;

  while (state.b < batches.length) {
    const batch = batches[state.b];
    const result = await runtime.processBatch({
      B: state.B,
      b: state.b,
      batch,
      iterator,
      config,
      gemini: null,
      dependencies
    });
    runtime.commitBatchResult({ round, batchResult: result });
    runtime.updateSupervisoryState({ runtimeState: state, batchResult: result });
    persistBatchResult(state.B, state.b, result);

    if (runtime.evaluateFailedBatchStopCondition({ runtimeState: state, iterator, config })) {
      state.status = 'failed_b_stop';
      round.status = 'failed_b_stop';
      state.rounds.push(round);
      const finalReturn = runtime.assembleProgramReturn({
        reason: 'failed_b_stop',
        runtimeState: state,
        round,
        aggregate: null,
        config
      });
      persistRound(round, null);
      persistState(state, finalReturn);
      return { terminal: true, finalReturn };
    }
    state.b += 1;
  }

  const aggregate = await runtime.aggregateSuccessfulBatchResults({
    round,
    config,
    dependencies,
    gemini: null
  });
  round.status = 'complete';
  state.rounds.push(round);
  persistRound(round, aggregate);

  if (state.terminalRound === true) {
    state.status = 'complete';
    const finalReturn = runtime.assembleProgramReturn({
      reason: 'terminal_round_complete',
      runtimeState: state,
      round,
      aggregate,
      config
    });
    persistState(state, finalReturn);
    return { terminal: true, finalReturn };
  }

  if (runtime.evaluateTerminationCondition({ aggregate, iterator, runtimeState: state, config })) {
    state.terminalRound = true;
  }

  state.currentContext = aggregate.context;
  state.B += 1;
  persistState(state);
  return { terminal: false, aggregate };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing.');

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const config = updateConfig(readJson(configPath));
  writeJson(configPath, config);

  const analysis = readJson(analysisPath);
  const expectedB0 = analysis?.B0?.batches || [];
  if (!expectedB0.length) throw new Error('No pre-divided B0 batches were found in stage1-corpus-analysis.json.');

  const dependencies = {
    countTokens: value => approximateTokens(value)
  };

  const state = runtime.createRuntimeState(null);
  const b0Batches = expectedB0.map(entry => {
    const file = path.join(batchesRoot, `B0-b${entry.b}.json`);
    if (!fs.existsSync(file)) throw new Error(`Missing pre-divided B0 batch: ${file}`);
    return {
      id: `B0-b${entry.b}`,
      B: 0,
      b: entry.b,
      context: readJson(file),
      assignedContextTokens: entry.tokens,
      provenance: [`predivided:B0-b${entry.b}`]
    };
  });

  let result = await processRound({ state, config, dependencies, batches: b0Batches });
  if (result.terminal) {
    console.log(JSON.stringify(result.finalReturn, null, 2));
    return;
  }

  while (true) {
    const iterator = runtime.resolveIteratorForB(state.B, config);
    const batches = await runtime.divideContextIntoBatches({
      context: state.currentContext,
      divider: iterator.divider,
      config,
      dependencies,
      gemini: null,
      B: state.B
    });
    result = await processRound({ state, config, dependencies, batches });
    if (result.terminal) {
      console.log(JSON.stringify(result.finalReturn, null, 2));
      return;
    }
  }
}

main().catch(error => {
  fs.mkdirSync(outputRoot, { recursive: true });
  writeJson(path.join(outputRoot, 'fatal-error.json'), {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || null,
    timestamp: new Date().toISOString()
  });
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
