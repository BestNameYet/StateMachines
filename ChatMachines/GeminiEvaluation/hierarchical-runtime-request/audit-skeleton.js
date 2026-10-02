'use strict';

/** Generic hierarchical evaluation runtime skeleton. */

async function runHierarchicalEvaluation({context, config, gemini, dependencies = {}}) {
  const state = createRuntimeState(context);
  while (true) {
    const iterator = resolveIteratorForB(state.B, config);
    const batches = await divideContextIntoBatches({context: state.currentContext, divider: iterator.divider, config, dependencies, B: state.B});
    state.b = 0;
    const round = createRoundState({B: state.B, batches, iterator});

    while (state.b < batches.length) {
      const batch = batches[state.b];
      const batchResult = await processBatch({B: state.B, b: state.b, batch, iterator, config, gemini, dependencies});
      commitBatchResult({round, batchResult});
      updateSupervisoryState({runtimeState: state, batchResult});

      if (evaluateFailedBatchStopCondition({runtimeState: state, iterator, config})) {
        state.status = 'failed_b_stop';
        return assembleProgramReturn({reason: 'failed_b_stop', runtimeState: state, round, aggregate: null, config});
      }
      state.b += 1;
    }

    const aggregate = await aggregateSuccessfulBatchResults({round, config, dependencies});
    state.rounds.push(round);

    if (state.terminalRound === true) {
      state.status = 'complete';
      return assembleProgramReturn({reason: 'terminal_round_complete', runtimeState: state, round, aggregate, config});
    }

    if (evaluateTerminationCondition({aggregate, iterator, runtimeState: state, config})) {
      state.terminalRound = true;
    }

    state.currentContext = aggregate.context;
    state.B += 1;
  }
}

function createRuntimeState(initialContext) {
  return {
    B: 0,
    b: 0,
    terminalRound: false,
    currentContext: initialContext,
    status: 'running',
    rounds: [],
    supervisory: {batches: [], failedBCount: 0, successfulBCount: 0}
  };
}

function createRoundState({B, batches, iterator}) {
  return {B, iterator, assignedBatchCount: batches.length, batches: [], aggregateResponseTokens: 0, status: 'running'};
}

function resolveIteratorForB(B, config) {
  const rules = config.B_rules || [];
  for (const rule of rules) {
    if (evaluateConfigCondition(rule.when, {B})) return resolveIteratorDefinition(rule.iterator, config);
  }
  throw new Error(`No B rule matched B=${B}`);
}

function resolveIteratorDefinition(definition, config) {
  if (typeof definition === 'string') {
    const resolved = config.iterators?.[definition];
    if (!resolved) throw new Error(`Unknown iterator configuration: ${definition}`);
    return resolved;
  }
  if (definition && typeof definition === 'object') return definition;
  throw new Error('Invalid iterator configuration');
}

function evaluateConfigCondition(condition, scope) {
  if (!condition) return false;
  for (const [field, comparison] of Object.entries(condition)) {
    if (!evaluateComparison(resolveSourceValue(field, scope), comparison, scope)) return false;
  }
  return true;
}

function evaluateComparison(actual, comparison, scope = {}) {
  if (comparison === null || typeof comparison !== 'object' || Array.isArray(comparison)) return actual === comparison;
  for (const [operator, configuredValue] of Object.entries(comparison)) {
    const expected = resolveConfiguredValue(configuredValue, scope);
    if (!compareValues(actual, operator, expected)) return false;
  }
  return true;
}

async function countTokens({value, config, dependencies}) {
  // IMPLEMENTATION_SLOT:countTokens
  if (typeof dependencies.countTokens === 'function') return dependencies.countTokens(value, config);
  throw new Error('Token counter implementation is required');
}

async function divideContextIntoBatches({context, divider, config, dependencies, B}) {
  const maxTokens = divider.max_tokens;
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) throw new Error('divider.max_tokens must be positive');
  const units = await createDivisionUnits({context, divider, config, dependencies});
  const assignments = await shiftDivisionBoundariesUntilFit({units, maxTokens, divider, config, dependencies});
  return assignments.map((assignment, b) => ({
    id: createBatchId(B, b),
    B,
    b,
    context: assignment.context,
    assignedContextTokens: assignment.tokens,
    provenance: assignment.provenance || []
  }));
}

async function createDivisionUnits({context, divider, config, dependencies}) {
  // IMPLEMENTATION_SLOT:createDivisionUnits
  if (typeof dependencies.createDivisionUnits === 'function') return dependencies.createDivisionUnits({context, divider, config});
  return [{value: context, provenance: []}];
}

async function shiftDivisionBoundariesUntilFit({units, maxTokens, divider, config, dependencies}) {
  // IMPLEMENTATION_SLOT:shiftDivisionBoundariesUntilFit
  if (typeof dependencies.shiftDivisionBoundariesUntilFit === 'function') {
    return dependencies.shiftDivisionBoundariesUntilFit({
      units,
      maxTokens,
      divider,
      countTokens: value => countTokens({value, config, dependencies})
    });
  }
  throw new Error('Division-boundary implementation is required');
}

async function processBatch({B, b, batch, iterator, config, gemini, dependencies}) {
  const evaluator = resolveEvaluatorConfiguration(iterator.evaluator, config);
  let attempt = await executeEvaluatorAttempt({B, b, batch, evaluator, iterator, retryInput: null, config, gemini, dependencies});
  if (!attempt.accepted) {
    attempt = await executeRetryConditionals({initialAttempt: attempt, B, b, batch, evaluator, iterator, config, gemini, dependencies});
  }
  return createTerminalBatchResult({B, b, batch, attempt});
}

function resolveEvaluatorConfiguration(definition, config) {
  if (typeof definition === 'string') {
    const evaluator = config.evaluators?.[definition];
    if (!evaluator) throw new Error(`Unknown evaluator: ${definition}`);
    return evaluator;
  }
  return definition;
}

function assembleEvaluatorInput({batch, evaluator, retryInput = null}) {
  if (retryInput) return retryInput;
  return {context: batch.context, task: evaluator.task, criteria: evaluator.criteria, response_contract: evaluator.response_contract};
}

async function invokeGemini({input, evaluator, gemini}) {
  // IMPLEMENTATION_SLOT:invokeGemini
  return gemini.invoke({model: evaluator.model, input});
}

async function executeEvaluatorAttempt({B, b, batch, evaluator, iterator, retryInput, config, gemini, dependencies}) {
  const input = assembleEvaluatorInput({batch, evaluator, retryInput});
  let rawResponse;
  try {
    rawResponse = await invokeGemini({input, evaluator, gemini});
  } catch (error) {
    return {accepted: false, failureType: 'system_error', mechanicalError: normalizeSystemError(error), rawResponse: null, normalizedResponse: null, responseTokens: null};
  }

  const normalized = await normalizeEvaluatorResponse({rawResponse, evaluator, iterator, config, dependencies});
  const acceptance = await evaluateAcceptanceConditions({normalizedResponse: normalized.response, normalization: normalized, evaluator, iterator, config, dependencies});
  return {
    accepted: acceptance.accepted,
    failureType: acceptance.accepted ? null : 'mechanical_response_failure',
    mechanicalError: acceptance.error,
    rawResponse,
    normalizedResponse: normalized.response,
    responseTokens: acceptance.responseTokens,
    acceptance
  };
}

async function normalizeEvaluatorResponse({rawResponse, evaluator, iterator, config, dependencies}) {
  const contract = resolveResponseContract(evaluator.response_contract, config);
  const parsed = tryParseJson(rawResponse);
  if (parsed.ok && requiredFieldsRecoverable(parsed.value, contract)) return {response: parsed.value, normalized: false, recovered: true};

  const strategies = iterator.normalization?.strategies || evaluator.normalization?.strategies || config.normalization?.strategies || [];
  for (const strategy of strategies) {
    const recovered = await applyNormalizationStrategy({strategy, rawResponse, contract, dependencies});
    if (recovered && requiredFieldsRecoverable(recovered, contract)) return {response: recovered, normalized: true, recovered: true};
  }
  return {response: parsed.ok ? parsed.value : rawResponse, normalized: false, recovered: false};
}

function resolveResponseContract(definition, config) {
  if (typeof definition === 'string') {
    const contract = config.response_contracts?.[definition];
    if (!contract) throw new Error(`Unknown response contract: ${definition}`);
    return contract;
  }
  return definition;
}

function tryParseJson(value) {
  if (value && typeof value === 'object') return {ok: true, value};
  try { return {ok: true, value: JSON.parse(value)}; }
  catch { return {ok: false, value: null}; }
}

function requiredFieldsRecoverable(value, contract) {
  const requiredFields = contract?.required_fields || [];
  return requiredFields.every(field => getPath(value, field) !== undefined);
}

async function applyNormalizationStrategy({strategy, rawResponse, contract, dependencies}) {
  // IMPLEMENTATION_SLOT:normalizationStrategies
  switch (strategy) {
    case 'recover_required_fields_from_malformed_serialization':
      if (typeof dependencies.recoverRequiredFields === 'function') return dependencies.recoverRequiredFields({rawResponse, contract});
      return null;
    default:
      throw new Error(`Unknown normalization strategy: ${strategy}`);
  }
}

async function evaluateAcceptanceConditions({normalizedResponse, normalization, evaluator, iterator, config, dependencies}) {
  const acceptance = iterator.acceptance || evaluator.acceptance || config.acceptance || {conditions: []};
  let responseTokens = null;
  for (const condition of acceptance.conditions || []) {
    const result = await evaluateAcceptanceCondition({condition, normalizedResponse, normalization, evaluator, iterator, config, dependencies, responseTokens});
    if (result.responseTokens !== undefined && result.responseTokens !== null) responseTokens = result.responseTokens;
    if (!result.passed) return {accepted: false, error: {condition: condition.id, details: result.details}, responseTokens};
  }
  return {accepted: true, error: null, responseTokens};
}

async function evaluateAcceptanceCondition({condition, normalizedResponse, normalization, evaluator, iterator, config, dependencies, responseTokens}) {
  switch (condition.source) {
    case 'invocation.status':
      return {passed: evaluateScalarCondition('success', condition)};
    case 'response':
      if (condition.operator === 'required_fields_recoverable') return {passed: normalization.recovered === condition.value};
      break;
    case 'response.tokens': {
      let tokens = responseTokens;
      if (tokens === null) tokens = await countTokens({value: normalizedResponse, config, dependencies});
      const expected = resolveConfiguredValue(condition.value, {divider: iterator.divider});
      return {passed: compareValues(tokens, condition.operator, expected), responseTokens: tokens};
    }
  }
  // IMPLEMENTATION_SLOT:acceptanceConditionTypes
  throw new Error(`Unsupported acceptance condition: ${condition.id}`);
}

async function executeRetryConditionals({initialAttempt, B, b, batch, evaluator, iterator, config, gemini, dependencies}) {
  const conditionals = iterator.retry?.conditionals || [];
  let current = initialAttempt;
  let retryNumber = 0;
  for (const conditional of conditionals) {
    if (!retryConditionalMatches({conditional, attempt: current, retryNumber})) continue;
    const retryInput = buildRetryInput({inputs: conditional.invoke?.inputs || [], B, b, batch, evaluator, attempt: current, retryNumber});
    const retried = await executeEvaluatorAttempt({B, b, batch, evaluator, iterator, retryInput, config, gemini, dependencies});
    retryNumber += 1;
    if (retried.accepted) return applyRetrySuccess({conditional, attempt: retried});
    current = retried;
    if (conditional.on_failure?.stop_retry_sequence === true) return applyRetryFailureTerminal({conditional, attempt: current});
  }
  return current;
}

function retryConditionalMatches({conditional, attempt, retryNumber}) {
  const when = conditional.when || {};
  if (when.condition && when.condition !== attempt.failureType) return false;
  if (when.retry_number && !evaluateComparison(retryNumber, when.retry_number)) return false;
  return true;
}

function buildRetryInput({inputs, B, b, batch, evaluator, attempt, retryNumber}) {
  const available = {
    context: batch.context,
    previous_response: attempt.normalizedResponse ?? attempt.rawResponse,
    mechanical_error: attempt.mechanicalError,
    task: evaluator.task,
    criteria: evaluator.criteria,
    response_contract: evaluator.response_contract,
    original_invocation: {context: batch.context, task: evaluator.task, criteria: evaluator.criteria, response_contract: evaluator.response_contract},
    attempt_number: retryNumber,
    B,
    b
  };
  const result = {};
  for (const name of inputs) {
    if (!Object.prototype.hasOwnProperty.call(available, name)) throw new Error(`Unknown retry input: ${name}`);
    result[name] = available[name];
  }
  return result;
}

function applyRetrySuccess({attempt}) { return attempt; }
function applyRetryFailureTerminal({conditional, attempt}) { return {...attempt, terminalRetryBehavior: conditional.on_failure || {}}; }

function createTerminalBatchResult({B, b, batch, attempt}) {
  const successful = attempt.accepted === true;
  return {
    id: createBatchId(B, b), B, b,
    status: successful ? 'success' : 'failed',
    assignedContextTokens: batch.assignedContextTokens,
    response: attempt.normalizedResponse ?? attempt.rawResponse ?? null,
    responseTokens: attempt.responseTokens,
    error: attempt.mechanicalError || null,
    provenance: batch.provenance || []
  };
}

function commitBatchResult({round, batchResult}) { round.batches.push(batchResult); }

function updateSupervisoryState({runtimeState, batchResult}) {
  runtimeState.supervisory.batches.push({id: batchResult.id, B: batchResult.B, b: batchResult.b, status: batchResult.status, error: batchResult.error});
  if (batchResult.status === 'failed') runtimeState.supervisory.failedBCount += 1;
  else runtimeState.supervisory.successfulBCount += 1;
}

function evaluateFailedBatchStopCondition({runtimeState, iterator}) {
  const stop = iterator.failed_b_stop;
  if (!stop?.condition) return false;
  return evaluateDeclarativeCondition({condition: stop.condition, scope: {supervisory: {failed_b_count: runtimeState.supervisory.failedBCount}}});
}

async function aggregateSuccessfulBatchResults({round, config, dependencies}) {
  const successful = round.batches.filter(batch => batch.status === 'success');
  let aggregateResponseTokens = 0;
  const records = [];
  for (const batch of successful) {
    let tokens = batch.responseTokens;
    if (tokens === null || tokens === undefined) tokens = await countTokens({value: batch.response, config, dependencies});
    aggregateResponseTokens += tokens;
    records.push({batch_id: batch.id, response: batch.response, provenance: [batch.id, ...(batch.provenance || [])]});
  }
  return {records, context: serializeAggregateContext(records), aggregateResponseTokens};
}

function serializeAggregateContext(records) { return JSON.stringify(records); }

function evaluateTerminationCondition({aggregate, iterator, runtimeState}) {
  const termination = iterator.termination;
  if (!termination?.condition) throw new Error('Termination condition is required');
  return evaluateDeclarativeCondition({
    condition: termination.condition,
    scope: {round: {aggregate_response_tokens: aggregate.aggregateResponseTokens}, divider: iterator.divider, B: runtimeState.B}
  });
}

function evaluateDeclarativeCondition({condition, scope}) {
  const left = resolveConfiguredValue(condition.left ?? (condition.source ? {source: condition.source} : undefined), scope);
  const right = resolveConfiguredValue(condition.right ?? condition.value, scope);
  return compareValues(left, condition.operator, right);
}

function resolveConfiguredValue(definition, scope) {
  if (definition === null || definition === undefined) return definition;
  if (typeof definition !== 'object' || Array.isArray(definition)) return definition;
  if (definition.source) {
    let value = resolveSourceValue(definition.source, scope);
    if (definition.divide_by !== undefined) value /= definition.divide_by;
    if (definition.multiply_by !== undefined) value *= definition.multiply_by;
    return value;
  }
  return definition;
}

function resolveSourceValue(path, source) { return getPath(source, path); }
function evaluateScalarCondition(actual, condition) { return compareValues(actual, condition.operator, resolveConfiguredValue(condition.value, {})); }

function compareValues(actual, operator, expected) {
  switch (operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    default: throw new Error(`Unsupported operator: ${operator}`);
  }
}

function createBatchId(B, b) { return `B${B}-b${b}`; }

function assembleProgramReturn({reason, runtimeState, round, aggregate, config}) {
  const envelope = config.program_return?.envelope;
  const scope = {reason, runtime: runtimeState, round, aggregate};
  if (!envelope) return scope;
  return resolveReturnEnvelope(envelope, scope);
}

function resolveReturnEnvelope(definition, scope) {
  if (Array.isArray(definition)) return definition.map(value => resolveReturnEnvelope(value, scope));
  if (definition && typeof definition === 'object') {
    if (Object.keys(definition).length === 1 && definition.source) return resolveSourceValue(definition.source, scope);
    const output = {};
    for (const [key, value] of Object.entries(definition)) output[key] = resolveReturnEnvelope(value, scope);
    return output;
  }
  return definition;
}

function getPath(object, path) {
  if (object === null || object === undefined) return undefined;
  if (path === null || path === undefined || path === '') return object;
  return String(path).split('.').reduce((value, key) => value === null || value === undefined ? undefined : value[key], object);
}

function normalizeSystemError(error) {
  return {name: error?.name || 'Error', message: error?.message || String(error)};
}

module.exports = {
  runHierarchicalEvaluation,
  createRuntimeState,
  createRoundState,
  resolveIteratorForB,
  resolveIteratorDefinition,
  evaluateConfigCondition,
  evaluateComparison,
  countTokens,
  divideContextIntoBatches,
  createDivisionUnits,
  shiftDivisionBoundariesUntilFit,
  processBatch,
  resolveEvaluatorConfiguration,
  assembleEvaluatorInput,
  invokeGemini,
  executeEvaluatorAttempt,
  normalizeEvaluatorResponse,
  resolveResponseContract,
  requiredFieldsRecoverable,
  applyNormalizationStrategy,
  evaluateAcceptanceConditions,
  evaluateAcceptanceCondition,
  executeRetryConditionals,
  retryConditionalMatches,
  buildRetryInput,
  createTerminalBatchResult,
  commitBatchResult,
  updateSupervisoryState,
  evaluateFailedBatchStopCondition,
  aggregateSuccessfulBatchResults,
  serializeAggregateContext,
  evaluateTerminationCondition,
  evaluateDeclarativeCondition,
  resolveConfiguredValue,
  compareValues,
  assembleProgramReturn,
  resolveReturnEnvelope
};
