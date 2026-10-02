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
const baseDividerMaxTokens = 12000;

const temporaryCompactTaskSuffix = ' Return a compact consolidation. The complete serialized response must remain below 6000 estimated tokens under Math.ceil(characters / 3.9). Prefer merging overlapping records over retaining near-duplicates. Keep names concise, descriptions to one or two sentences, mechanic_summary values to one concise sentence, and include only evidence necessary to preserve distinct implementation support.';
const temporaryCompactCriteriaSuffix = '\n5. Compactness: The complete serialized response must remain below 6000 estimated tokens using Math.ceil(characters / 3.9); remove redundant wording and redundant evidence while preserving distinct source support.';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function approximateTokens(value) {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (value !== null && value !== undefined) text = JSON.stringify(value);
  return text ? Math.ceil(text.length / charsPerToken) : 0;
}

function stripTemporaryCompactness(evaluator) {
  if (!evaluator) return;
  if (typeof evaluator.task === 'string' && evaluator.task.endsWith(temporaryCompactTaskSuffix)) {
    evaluator.task = evaluator.task.slice(0, -temporaryCompactTaskSuffix.length);
  }
  if (typeof evaluator.criteria === 'string' && evaluator.criteria.endsWith(temporaryCompactCriteriaSuffix)) {
    evaluator.criteria = evaluator.criteria.slice(0, -temporaryCompactCriteriaSuffix.length);
  }
}

function removeResponseTokenConditions(acceptance) {
  if (!acceptance || !Array.isArray(acceptance.conditions)) return;
  acceptance.conditions = acceptance.conditions.filter(condition => condition?.source !== 'response.tokens');
}

function updateConfig(config) {
  config.token_counter = {
    implementation: 'linear_chars_divisor',
    characters_per_token: charsPerToken,
    formula: 'Math.ceil(text.length / 3.9)'
  };

  config.stage1_round_policy = {
    b0: {
      divider_max_tokens: baseDividerMaxTokens,
      response_limit: 'response.tokens < divider.max_tokens / 2',
      division_source: 'precomputed Gemini countTokens batches'
    },
    consolidation: {
      applies_when: 'B > 0',
      divider_max_tokens_formula: '12000 * (2 ** B)',
      response_limit_formula: 'floor(round_input_tokens / assigned_b_count)',
      purpose: 'allow canonical feature lists to grow as batches are recombined while preventing aggregate round expansion'
    },
    terminal_round: {
      response_token_limit: null,
      note: 'terminal round is exempt from the consolidation response ceiling'
    }
  };

  for (const rule of config.B_rules || []) {
    const evaluator = rule?.iterator?.evaluator;
    if (!evaluator) continue;
    evaluator.model = model;

    if (rule?.when?.B?.gt === 0) {
      stripTemporaryCompactness(evaluator);
      removeResponseTokenConditions(rule.iterator.acceptance);
      rule.iterator.divider.base_max_tokens = baseDividerMaxTokens;
      rule.iterator.divider.max_tokens_formula = '12000 * (2 ** B)';
      rule.iterator.acceptance.dynamic_response_limit = {
        ordinary_round: 'floor(round_input_tokens / assigned_b_count)',
        terminal_round: null
      };
    }
  }

  return config;
}

function scaledIteratorForB(B, config) {
  const iterator = clone(runtime.resolveIteratorForB(B, config));
  if (B > 0) {
    iterator.divider.max_tokens = baseDividerMaxTokens * (2 ** B);
  }
  return iterator;
}

function iteratorForAssignedRound({state, baseIterator, roundInputTokens, assignedBatchCount}) {
  const iterator = clone(baseIterator);

  if (state.B === 0) return iterator;

  removeResponseTokenConditions(iterator.acceptance);

  if (state.terminalRound === true) {
    iterator.acceptance.effective_response_token_limit = null;
    iterator.acceptance.response_limit_reason = 'terminal_round_exempt';
    return iterator;
  }

  if (!Number.isInteger(assignedBatchCount) || assignedBatchCount < 1) {
    throw new Error(`Invalid assigned batch count for B${state.B}: ${assignedBatchCount}`);
  }

  const responseLimit = Math.floor(roundInputTokens / assignedBatchCount);
  iterator.acceptance.conditions.push({
    id: 'response_not_exceeding_round_input_share',
    source: 'response.tokens',
    operator: 'lte',
    value: responseLimit
  });
  iterator.acceptance.effective_response_token_limit = responseLimit;
  iterator.acceptance.response_limit_reason = 'floor(round_input_tokens / assigned_b_count)';
  return iterator;
}

function loadSuccessfulB0Checkpoints(expectedB0) {
  const checkpoints = new Map();
  for (const entry of expectedB0) {
    const file = path.join(outputRoot, 'B0', `b${entry.b}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const result = readJson(file);
      if (result?.B === 0 && result?.b === entry.b && result?.status === 'success' && result?.response !== null && result?.response !== undefined) {
        checkpoints.set(entry.b, result);
      }
    } catch {}
  }
  return checkpoints;
}

function persistBatchResult(B, b, result) {
  const dir = path.join(outputRoot, `B${B}`);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, `b${b}.json`), result);
}

function persistRound(round, aggregate, metadata) {
  const dir = path.join(outputRoot, `B${round.B}`);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'round.json'), {
    B: round.B,
    status: round.status,
    assignedBatchCount: round.assignedBatchCount,
    roundInputTokens: metadata.roundInputTokens,
    dividerMaxTokens: metadata.dividerMaxTokens,
    responseTokenLimit: metadata.responseTokenLimit,
    terminalRoundOnEntry: metadata.terminalRoundOnEntry,
    aggregateResponseTokens: round.aggregateResponseTokens,
    batches: round.batches,
    aggregate
  });
}

function persistState(state, finalReturn = null) {
  writeJson(path.join(outputRoot, 'runtime-state.json'), state);
  if (finalReturn !== null) writeJson(path.join(outputRoot, 'final.json'), finalReturn);
}

async function processRound({state, config, dependencies, batches, iterator, roundInputTokens, checkpointResults = null}) {
  const round = runtime.createRoundState({ B: state.B, batches, iterator });
  const metadata = {
    roundInputTokens,
    dividerMaxTokens: iterator.divider.max_tokens,
    responseTokenLimit: iterator.acceptance?.effective_response_token_limit ?? null,
    terminalRoundOnEntry: state.terminalRound === true
  };
  state.b = 0;

  while (state.b < batches.length) {
    const batch = batches[state.b];
    let result = checkpointResults?.get(state.b) || null;

    if (result) {
      result = clone(result);
      result.id = `B${state.B}-b${state.b}`;
      result.B = state.B;
      result.b = state.b;
      result.assignedContextTokens = batch.assignedContextTokens;
      result.provenance = batch.provenance || [];
      result.checkpointReused = true;
    } else {
      result = await runtime.processBatch({
        B: state.B,
        b: state.b,
        batch,
        iterator,
        config,
        gemini: null,
        dependencies
      });
    }

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
      persistRound(round, null, metadata);
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
  persistRound(round, aggregate, metadata);

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

  const config = updateConfig(readJson(configPath));
  const analysis = readJson(analysisPath);
  const expectedB0 = analysis?.B0?.batches || [];
  if (!expectedB0.length) throw new Error('No pre-divided B0 batches were found in stage1-corpus-analysis.json.');

  const b0Checkpoints = loadSuccessfulB0Checkpoints(expectedB0);

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  writeJson(configPath, config);

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

  const b0Iterator = scaledIteratorForB(0, config);
  const b0RoundInputTokens = expectedB0.reduce((sum, entry) => sum + Number(entry.tokens || 0), 0);
  let result = await processRound({
    state,
    config,
    dependencies,
    batches: b0Batches,
    iterator: b0Iterator,
    roundInputTokens: b0RoundInputTokens,
    checkpointResults: b0Checkpoints
  });
  if (result.terminal) {
    console.log(JSON.stringify(result.finalReturn, null, 2));
    return;
  }

  while (true) {
    const roundInputTokens = approximateTokens(state.currentContext);
    const divisionIterator = scaledIteratorForB(state.B, config);
    const batches = await runtime.divideContextIntoBatches({
      context: state.currentContext,
      divider: divisionIterator.divider,
      config,
      dependencies,
      gemini: null,
      B: state.B
    });
    const iterator = iteratorForAssignedRound({
      state,
      baseIterator: divisionIterator,
      roundInputTokens,
      assignedBatchCount: batches.length
    });

    result = await processRound({
      state,
      config,
      dependencies,
      batches,
      iterator,
      roundInputTokens
    });
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
