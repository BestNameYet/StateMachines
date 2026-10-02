'use strict';

/** Generic hierarchical evaluation runtime implementation. */

async function runHierarchicalEvaluation({context, config, gemini, dependencies = {}}) {
  const state = createRuntimeState(context);
  while (true) {
    const iterator = resolveIteratorForB(state.B, config);
    const batches = await divideContextIntoBatches({context: state.currentContext, divider: iterator.divider, config, dependencies, gemini, B: state.B});
    state.b = 0;
    const round = createRoundState({B: state.B, batches, iterator});

    while (state.b < batches.length) {
      const batch = batches[state.b];
      const batchResult = await processBatch({B: state.B, b: state.b, batch, iterator, config, gemini, dependencies});
      commitBatchResult({round, batchResult});
      updateSupervisoryState({runtimeState: state, batchResult});

      if (evaluateFailedBatchStopCondition({runtimeState: state, iterator, config})) {
        state.status = 'failed_b_stop';
        round.status = 'failed_b_stop';
        return assembleProgramReturn({reason: 'failed_b_stop', runtimeState: state, round, aggregate: null, config});
      }
      state.b += 1;
    }

    const aggregate = await aggregateSuccessfulBatchResults({round, config, dependencies, gemini});
    round.status = 'complete';
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

async function countTokens({value, config, dependencies, gemini}) {
  if (typeof dependencies?.countTokens === 'function') {
    return dependencies.countTokens(value, config);
  }
  if (typeof gemini?.countTokens === 'function') {
    try {
      const res = await gemini.countTokens({contents: value});
      if (typeof res?.totalTokens === 'number') return res.totalTokens;
      if (typeof res === 'number') return res;
    } catch {}
  }

  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (value !== null && value !== undefined) {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  if (!text) return 0;
  const matches = text.match(/\w+|[^\s\w]|\s+/g);
  return matches ? matches.length : Math.ceil(text.length / 4);
}

async function divideContextIntoBatches({context, divider, config, dependencies, gemini, B}) {
  const maxTokens = divider.max_tokens;
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) throw new Error('divider.max_tokens must be positive');
  const units = await createDivisionUnits({context, divider, config, dependencies});
  const assignments = await shiftDivisionBoundariesUntilFit({units, maxTokens, divider, config, dependencies, gemini});
  const batches = [];
  for (let b = 0; b < assignments.length; b++) {
    const assignment = assignments[b];
    const assignedTokens = assignment.tokens ?? await countTokens({value: assignment.context, config, dependencies, gemini});
    if (assignedTokens > maxTokens) {
      throw new Error(`Assigned b context tokens (${assignedTokens}) exceeds divider.max_tokens (${maxTokens})`);
    }
    batches.push({
      id: createBatchId(B, b),
      B,
      b,
      context: assignment.context,
      assignedContextTokens: assignedTokens,
      provenance: assignment.provenance || []
    });
  }
  return batches;
}

async function createDivisionUnits({context, divider, config, dependencies}) {
  if (typeof dependencies?.createDivisionUnits === 'function') {
    return dependencies.createDivisionUnits({context, divider, config});
  }
  if (Array.isArray(context)) {
    return context.map((item, index) => {
      const prov = item?.provenance || (item?.batch_id ? [item.batch_id] : [`unit_${index}`]);
      return {value: item, provenance: Array.isArray(prov) ? prov : [prov]};
    });
  }
  if (typeof context === 'string') {
    try {
      const parsed = JSON.parse(context);
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => {
          const prov = item?.provenance || (item?.batch_id ? [item.batch_id] : [`unit_${index}`]);
          return {value: item, provenance: Array.isArray(prov) ? prov : [prov]};
        });
      }
    } catch {}
    const segments = context.split(/\n\n+/).filter(s => s.trim().length > 0);
    if (segments.length > 1) {
      return segments.map((seg, idx) => ({value: seg, provenance: [`chunk_${idx}`]}));
    }
  }
  return [{value: context, provenance: []}];
}

function combineUnitsContext(unitValues) {
  if (unitValues.length === 0) return '';
  if (unitValues.every(u => typeof u === 'string')) return unitValues.join('\n\n');
  if (unitValues.length === 1) return unitValues[0];
  return unitValues;
}

async function ensureUnitFits({unit, maxTokens, config, dependencies, gemini}) {
  const tokenCount = await countTokens({value: unit.value, config, dependencies, gemini});
  if (tokenCount <= maxTokens) {
    return [{value: unit.value, tokens: tokenCount, provenance: unit.provenance || []}];
  }
  if (typeof unit.value === 'string') {
    const lines = unit.value.split('\n');
    if (lines.length > 1) {
      const subUnits = [];
      let currentChunk = [];
      for (const line of lines) {
        currentChunk.push(line);
        const chunkStr = currentChunk.join('\n');
        const cTokens = await countTokens({value: chunkStr, config, dependencies, gemini});
        if (cTokens > maxTokens && currentChunk.length > 1) {
          currentChunk.pop();
          subUnits.push({value: currentChunk.join('\n'), provenance: unit.provenance || []});
          currentChunk = [line];
        }
      }
      if (currentChunk.length > 0) {
        subUnits.push({value: currentChunk.join('\n'), provenance: unit.provenance || []});
      }
      const result = [];
      for (const sub of subUnits) {
        const fits = await ensureUnitFits({unit: sub, maxTokens, config, dependencies, gemini});
        result.push(...fits);
      }
      return result;
    } else {
      const words = unit.value.split(/\s+/);
      if (words.length > 1) {
        const subUnits = [];
        let currentChunk = [];
        for (const word of words) {
          currentChunk.push(word);
          const chunkStr = currentChunk.join(' ');
          const cTokens = await countTokens({value: chunkStr, config, dependencies, gemini});
          if (cTokens > maxTokens && currentChunk.length > 1) {
            currentChunk.pop();
            subUnits.push({value: currentChunk.join(' '), provenance: unit.provenance || []});
            currentChunk = [word];
          }
        }
        if (currentChunk.length > 0) {
          subUnits.push({value: currentChunk.join(' '), provenance: unit.provenance || []});
        }
        const result = [];
        for (const sub of subUnits) {
          const fits = await ensureUnitFits({unit: sub, maxTokens, config, dependencies, gemini});
          result.push(...fits);
        }
        return result;
      } else {
        const charStep = Math.max(1, Math.floor(maxTokens * 2));
        const subUnits = [];
        for (let i = 0; i < unit.value.length; i += charStep) {
          subUnits.push({value: unit.value.slice(i, i + charStep), provenance: unit.provenance || []});
        }
        const result = [];
        for (const sub of subUnits) {
          const fits = await ensureUnitFits({unit: sub, maxTokens, config, dependencies, gemini});
          result.push(...fits);
        }
        return result;
      }
    }
  } else {
    const jsonStr = JSON.stringify(unit.value);
    return ensureUnitFits({unit: {value: jsonStr, provenance: unit.provenance || []}, maxTokens, config, dependencies, gemini});
  }
}

async function shiftDivisionBoundariesUntilFit({units, maxTokens, divider, config, dependencies, gemini}) {
  if (typeof dependencies?.shiftDivisionBoundariesUntilFit === 'function') {
    return dependencies.shiftDivisionBoundariesUntilFit({
      units,
      maxTokens,
      divider,
      countTokens: value => countTokens({value, config, dependencies, gemini})
    });
  }

  const atomicUnits = [];
  for (const unit of units) {
    const fitting = await ensureUnitFits({unit, maxTokens, config, dependencies, gemini});
    atomicUnits.push(...fitting);
  }

  if (atomicUnits.length === 0) {
    return [{context: null, tokens: 0, provenance: []}];
  }

  const assignments = [];
  let currentGroup = [];
  let currentProvenances = [];

  for (let i = 0; i < atomicUnits.length; i++) {
    const candidateGroup = [...currentGroup, atomicUnits[i].value];
    const candidateContext = combineUnitsContext(candidateGroup);
    const candidateTokens = await countTokens({value: candidateContext, config, dependencies, gemini});

    if (candidateTokens <= maxTokens) {
      currentGroup = candidateGroup;
      currentProvenances.push(...(atomicUnits[i].provenance || []));
    } else {
      if (currentGroup.length > 0) {
        const finalContext = combineUnitsContext(currentGroup);
        const finalTokens = await countTokens({value: finalContext, config, dependencies, gemini});
        assignments.push({
          context: finalContext,
          tokens: finalTokens,
          provenance: [...new Set(currentProvenances)]
        });
        currentGroup = [atomicUnits[i].value];
        currentProvenances = [...(atomicUnits[i].provenance || [])];
      } else {
        assignments.push({
          context: atomicUnits[i].value,
          tokens: atomicUnits[i].tokens,
          provenance: [...new Set(atomicUnits[i].provenance || [])]
        });
        currentGroup = [];
        currentProvenances = [];
      }
    }
  }

  if (currentGroup.length > 0) {
    const finalContext = combineUnitsContext(currentGroup);
    const finalTokens = await countTokens({value: finalContext, config, dependencies, gemini});
    assignments.push({
      context: finalContext,
      tokens: finalTokens,
      provenance: [...new Set(currentProvenances)]
    });
  }

  return assignments;
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
  if (retryInput) {
    if (retryInput.original_invocation && Object.keys(retryInput).length === 1) {
      return retryInput.original_invocation;
    }
    return retryInput;
  }
  return {context: batch.context, task: evaluator.task, criteria: evaluator.criteria, response_contract: evaluator.response_contract};
}

async function invokeGemini({input, evaluator, gemini}) {
  if (gemini) {
    if (typeof gemini.invoke === 'function') {
      return await gemini.invoke({model: evaluator.model, input});
    }
    if (typeof gemini.generateContent === 'function') {
      const response = await gemini.generateContent({
        model: evaluator.model,
        contents: typeof input === 'string' ? input : JSON.stringify(input)
      });
      return response?.text?.() || response?.response?.text?.() || response;
    }
    if (typeof gemini.getGenerativeModel === 'function') {
      const modelInstance = gemini.getGenerativeModel({model: evaluator.model});
      const response = await modelInstance.generateContent(
        typeof input === 'string' ? input : JSON.stringify(input)
      );
      return response?.response?.text?.() || response?.text?.() || response;
    }
    if (typeof gemini === 'function') {
      return await gemini({model: evaluator.model, input});
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const model = evaluator.model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const promptText = typeof input === 'string' ? input : JSON.stringify(input);
    const body = {
      contents: [{parts: [{text: promptText}]}]
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }
    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidateText !== undefined) return candidateText;
    return JSON.stringify(data);
  }

  throw new Error('Gemini API interface is required');
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
  const acceptance = await evaluateAcceptanceConditions({normalizedResponse: normalized.response, normalization: normalized, evaluator, iterator, config, dependencies, gemini});
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
  if (!requiredFields.length) return true;
  if (!value || typeof value !== 'object') return false;
  return requiredFields.every(field => getPath(value, field) !== undefined);
}

function extractFieldsFromMalformedSerialization(rawResponse, contract) {
  if (typeof rawResponse !== 'string') return null;
  let text = rawResponse.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim();
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {}
    text = candidate;
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substring = text.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(substring);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {
      try {
        const cleaned = substring.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      } catch {}
    }
  }

  const requiredFields = contract?.required_fields || [];
  if (requiredFields.length > 0) {
    const recovered = {};
    let allFound = true;
    for (const field of requiredFields) {
      const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`["']?${escapedField}["']?\\s*:\\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(-?\\d+(?:\\.\\d+)?)|(true|false|null)|(\\[[^\]]*\\])|(\\{[^}]*\\}))`, 'i');
      const match = text.match(regex);
      if (match) {
        if (match[1] !== undefined) recovered[field] = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        else if (match[2] !== undefined) recovered[field] = match[2];
        else if (match[3] !== undefined) recovered[field] = Number(match[3]);
        else if (match[4] !== undefined) recovered[field] = match[4] === 'true' ? true : match[4] === 'false' ? false : null;
        else if (match[5] !== undefined) {
          try { recovered[field] = JSON.parse(match[5]); } catch { recovered[field] = match[5]; }
        } else if (match[6] !== undefined) {
          try { recovered[field] = JSON.parse(match[6]); } catch { recovered[field] = match[6]; }
        }
      } else {
        allFound = false;
        break;
      }
    }
    if (allFound) return recovered;
  }

  return null;
}

async function applyNormalizationStrategy({strategy, rawResponse, contract, dependencies}) {
  switch (strategy) {
    case 'recover_required_fields_from_malformed_serialization':
      if (typeof dependencies?.recoverRequiredFields === 'function') return dependencies.recoverRequiredFields({rawResponse, contract});
      return extractFieldsFromMalformedSerialization(rawResponse, contract);
    default:
      throw new Error(`Unknown normalization strategy: ${strategy}`);
  }
}

async function evaluateAcceptanceConditions({normalizedResponse, normalization, evaluator, iterator, config, dependencies, gemini}) {
  const acceptance = iterator.acceptance || evaluator.acceptance || config.acceptance || {conditions: []};
  let responseTokens = null;
  for (const condition of acceptance.conditions || []) {
    const result = await evaluateAcceptanceCondition({condition, normalizedResponse, normalization, evaluator, iterator, config, dependencies, gemini, responseTokens});
    if (result.responseTokens !== undefined && result.responseTokens !== null) responseTokens = result.responseTokens;
    if (!result.passed) return {accepted: false, error: {condition: condition.id, details: result.details}, responseTokens};
  }
  return {accepted: true, error: null, responseTokens};
}

async function evaluateAcceptanceCondition({condition, normalizedResponse, normalization, evaluator, iterator, config, dependencies, gemini, responseTokens}) {
  switch (condition.source) {
    case 'invocation.status':
      return {passed: evaluateScalarCondition('success', condition)};
    case 'response':
      if (condition.operator === 'required_fields_recoverable') {
        const contract = resolveResponseContract(evaluator.response_contract, config);
        const recoverable = normalization.recovered === true || requiredFieldsRecoverable(normalizedResponse, contract);
        return {passed: recoverable === condition.value};
      }
      break;
    case 'response.tokens': {
      let tokens = responseTokens;
      if (tokens === null || tokens === undefined) tokens = await countTokens({value: normalizedResponse, config, dependencies, gemini});
      const expected = resolveConfiguredValue(condition.value, {divider: iterator.divider});
      return {passed: compareValues(tokens, condition.operator, expected), responseTokens: tokens};
    }
  }
  const actual = resolveSourceValue(condition.source, {invocation: {status: 'success'}, response: normalizedResponse, normalization, evaluator, iterator});
  if (actual !== undefined) {
    const expected = resolveConfiguredValue(condition.value, {divider: iterator.divider});
    return {passed: compareValues(actual, condition.operator, expected)};
  }
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
    retried.retryCount = retryNumber;
    if (retried.accepted) return applyRetrySuccess({conditional, attempt: retried});
    current = retried;
    current.retryCount = retryNumber;
    if (conditional.on_failure?.stop_retry_sequence === true) return applyRetryFailureTerminal({conditional, attempt: current});
  }
  current.retryCount = retryNumber;
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
  const terminalBehavior = attempt.terminalRetryBehavior || {};
  let successful = attempt.accepted === true;
  if (terminalBehavior.status === 'failed') successful = false;

  let response = attempt.normalizedResponse ?? attempt.rawResponse ?? null;
  if (terminalBehavior.retain === null) {
    response = null;
  } else if (terminalBehavior.retain === 'retry_response' || terminalBehavior.retain === 'latest_response') {
    response = attempt.normalizedResponse ?? attempt.rawResponse ?? null;
  }

  return {
    id: createBatchId(B, b),
    B,
    b,
    status: successful ? 'success' : 'failed',
    assignedContextTokens: batch.assignedContextTokens,
    response,
    responseTokens: attempt.responseTokens,
    error: attempt.mechanicalError || null,
    failureMetadata: terminalBehavior.include_failure_metadata ? {
      failureType: attempt.failureType,
      mechanicalError: attempt.mechanicalError
    } : null,
    retries: attempt.retryCount || 0,
    provenance: batch.provenance || []
  };
}

function commitBatchResult({round, batchResult}) { round.batches.push(batchResult); }

function updateSupervisoryState({runtimeState, batchResult}) {
  runtimeState.supervisory.batches.push({
    id: batchResult.id,
    B: batchResult.B,
    b: batchResult.b,
    status: batchResult.status,
    error: batchResult.error,
    responseTokens: batchResult.responseTokens,
    retries: batchResult.retries,
    provenance: batchResult.provenance
  });
  if (batchResult.status === 'failed') runtimeState.supervisory.failedBCount += 1;
  else runtimeState.supervisory.successfulBCount += 1;
}

function evaluateFailedBatchStopCondition({runtimeState, iterator}) {
  const stop = iterator.failed_b_stop;
  if (!stop?.condition) return false;
  const configuredValue = stop.condition.value;
  if (configuredValue === null || configuredValue === undefined) return false;
  return evaluateDeclarativeCondition({
    condition: stop.condition,
    scope: {supervisory: {failed_b_count: runtimeState.supervisory.failedBCount}}
  });
}

async function aggregateSuccessfulBatchResults({round, config, dependencies, gemini}) {
  const successful = round.batches.filter(batch => batch.status === 'success');
  let aggregateResponseTokens = 0;
  const records = [];
  for (const batch of successful) {
    let tokens = batch.responseTokens;
    if (tokens === null || tokens === undefined) {
      tokens = await countTokens({value: batch.response, config, dependencies, gemini});
    }
    aggregateResponseTokens += tokens;
    const provenanceAncestry = [batch.id, ...(batch.provenance || [])];
    records.push({
      batch_id: batch.id,
      response: batch.response,
      provenance: [...new Set(provenanceAncestry)]
    });
  }
  round.aggregateResponseTokens = aggregateResponseTokens;
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
    if (definition.divide_by !== undefined && typeof value === 'number') value /= definition.divide_by;
    if (definition.multiply_by !== undefined && typeof value === 'number') value *= definition.multiply_by;
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
    case 'gt': return actual !== null && expected !== null && actual > expected;
    case 'gte': return actual !== null && expected !== null && actual >= expected;
    case 'lt': return actual !== null && expected !== null && actual < expected;
    case 'lte': return actual !== null && expected !== null && actual <= expected;
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
  combineUnitsContext,
  ensureUnitFits,
  shiftDivisionBoundariesUntilFit,
  processBatch,
  resolveEvaluatorConfiguration,
  assembleEvaluatorInput,
  invokeGemini,
  executeEvaluatorAttempt,
  normalizeEvaluatorResponse,
  resolveResponseContract,
  tryParseJson,
  requiredFieldsRecoverable,
  extractFieldsFromMalformedSerialization,
  applyNormalizationStrategy,
  evaluateAcceptanceConditions,
  evaluateAcceptanceCondition,
  executeRetryConditionals,
  retryConditionalMatches,
  buildRetryInput,
  applyRetrySuccess,
  applyRetryFailureTerminal,
  createTerminalBatchResult,
  commitBatchResult,
  updateSupervisoryState,
  evaluateFailedBatchStopCondition,
  aggregateSuccessfulBatchResults,
  serializeAggregateContext,
  evaluateTerminationCondition,
  evaluateDeclarativeCondition,
  resolveConfiguredValue,
  resolveSourceValue,
  evaluateScalarCondition,
  compareValues,
  createBatchId,
  assembleProgramReturn,
  resolveReturnEnvelope,
  getPath,
  normalizeSystemError
};
