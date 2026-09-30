/**
 * Gemini Supervisor controller for GitHub Actions / Node.js 22.
 *
 * Architectural contract:
 * - ChatGPT owns every non-supervisory execution step.
 * - Node.js deterministically inspects incoming execution events and controls state.
 * - Gemini owns only the Supervisory Gate.
 * - Deterministic validation never substitutes for the Supervisory Gate.
 * - A deterministic validation failure is inserted into the run message stream as
 *   a system message immediately before the Gemini supervisory call.
 * - A supervisory FAIL never executes or retries a step inside this runtime.
 *   It leaves the same step active and waits for a new ChatGPT execution event.
 */

const fs = require("node:fs");
const path = require("node:path");

const root = "ChatMachines/GeminiSupervisor";
const triggerPath = `${root}/nextmessage/nextmessage.json`;
const agentsPath = `${root}/Agents.md`;
const testsPath = `${root}/evaluation-tests.md`;
const definitionsPath = `${root}/evaluator-definitions.md`;

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const transitionPath = ["supervisory_gate", "gate_result"];
const transitionValues = new Set(["PASS", "FAIL"]);
const executionRoleRequired = "ChatGPT model";
const executionRoleForbidden = "Gemini model";
const supervisorRoleRequired = "Gemini model";
const supervisorRoleForbidden = "ChatGPT model";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeJson(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function now() {
  return new Date().toISOString();
}

function validateRunNonce(runNonce) {
  if (typeof runNonce !== "string" || !/^[a-zA-Z0-9_-]+$/.test(runNonce)) {
    throw new Error(`Invalid run_nonce: "${runNonce}". Must be a non-empty path-safe identifier.`);
  }
  return runNonce;
}

function extractProcedureSteps(agentsText) {
  const found = [];
  const seen = new Set();
  const pattern = /^## Step\s+(\d+)\s*$/gm;
  let match;

  while ((match = pattern.exec(agentsText)) !== null) {
    const step = Number(match[1]);
    if (!seen.has(step)) {
      seen.add(step);
      found.push(step);
    }
  }

  if (found.length === 0) {
    throw new Error("Agents.md contains no procedure steps matching '## Step N'.");
  }

  return found.sort((a, b) => a - b);
}

function extractStepBlock(agentsText, step) {
  const heading = new RegExp(`^## Step\\s+${step}\\s*$`, "m");
  const match = heading.exec(agentsText);
  if (!match) throw new Error(`Agents.md does not contain Step ${step}.`);

  const start = match.index;
  const remainder = agentsText.slice(start + match[0].length);
  const next = /^## Step\s+\d+\s*$/m.exec(remainder);
  const end = next ? start + match[0].length + next.index : agentsText.length;
  return agentsText.slice(start, end).trim();
}

function contextFilesForStep(step) {
  return step === 3
    ? ["Agents.md", "evaluation-tests.md", "evaluator-definitions.md"]
    : ["Agents.md"];
}

function initializeOrValidateRunContainer(runNonce, steps) {
  const runDir = path.join(root, "runs", runNonce);
  const stateFile = path.join(runDir, "state.json");
  const messagesFile = path.join(runDir, "messages.json");
  const storeFile = path.join(runDir, "store", "store.json");

  const anyExists = fs.existsSync(stateFile) || fs.existsSync(messagesFile) || fs.existsSync(storeFile);

  if (!anyExists) {
    fs.mkdirSync(path.join(runDir, "store"), { recursive: true });

    const stateWrapper = {
      current_state: {
        run_nonce: runNonce,
        status: "awaiting_chatgpt_execution",
        created_at: now(),
        updated_at: now(),
        event_count: 0,
        procedure: {
          current_step: steps[0],
          completed_steps: [],
          remaining_steps: [...steps],
          step_records: {},
          awaiting: {
            type: "chatgpt_execution",
            step: steps[0]
          }
        }
      }
    };

    const messages = {
      run_nonce: runNonce,
      contents: []
    };

    const store = {
      run_nonce: runNonce,
      created_at: now(),
      initial_user_message: null,
      records: []
    };

    writeJson(stateFile, stateWrapper);
    writeJson(messagesFile, messages);
    writeJson(storeFile, store);

    return {
      runDir,
      stateFile,
      messagesFile,
      storeFile,
      stateWrapper,
      state: stateWrapper.current_state,
      messages,
      store
    };
  }

  if (!fs.existsSync(stateFile) || !fs.existsSync(messagesFile) || !fs.existsSync(storeFile)) {
    throw new Error(`Incomplete run container at ${runDir}. Required files missing.`);
  }

  const stateWrapper = readJson(stateFile);
  const messages = readJson(messagesFile);
  const store = readJson(storeFile);
  const state = stateWrapper.current_state;

  if (state?.run_nonce !== runNonce) {
    throw new Error(`Mismatched run_nonce in state.json: expected ${runNonce}, found ${state?.run_nonce}`);
  }
  if (messages?.run_nonce !== runNonce) {
    throw new Error(`Mismatched run_nonce in messages.json: expected ${runNonce}, found ${messages?.run_nonce}`);
  }
  if (store?.run_nonce !== runNonce) {
    throw new Error(`Mismatched run_nonce in store.json: expected ${runNonce}, found ${store?.run_nonce}`);
  }

  state.procedure = state.procedure || {};
  state.procedure.completed_steps = Array.isArray(state.procedure.completed_steps)
    ? state.procedure.completed_steps
    : [];
  state.procedure.step_records = state.procedure.step_records || {};
  state.event_count = Number.isInteger(state.event_count) ? state.event_count : 0;

  if (state.procedure.current_step !== null && !steps.includes(state.procedure.current_step)) {
    const firstRemaining = steps.find(step => !state.procedure.completed_steps.includes(step));
    state.procedure.current_step = firstRemaining === undefined ? null : firstRemaining;
  }

  state.procedure.remaining_steps = steps.filter(
    step => !state.procedure.completed_steps.includes(step)
  );

  if (state.procedure.current_step === null && state.procedure.remaining_steps.length > 0) {
    state.procedure.current_step = state.procedure.remaining_steps[0];
  }

  state.procedure.awaiting = state.procedure.current_step === null
    ? null
    : { type: "chatgpt_execution", step: state.procedure.current_step };

  return {
    runDir,
    stateFile,
    messagesFile,
    storeFile,
    stateWrapper,
    state,
    messages,
    store
  };
}

function appendMessage(messages, messagesFile, value) {
  if (!Array.isArray(messages.contents)) messages.contents = [];
  messages.contents.push(value);
  writeJson(messagesFile, messages);
}

function appendStoreRecord(store, storeFile, record) {
  if (!Array.isArray(store.records)) store.records = [];
  const completeRecord = {
    record_id: `${Date.now()}-${store.records.length + 1}`,
    timestamp: now(),
    ...record
  };
  store.records.push(completeRecord);
  writeJson(storeFile, store);
  return completeRecord;
}

function valueAtExactPath(value, pathArr) {
  let current = value;
  for (const key of pathArr) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, value: undefined };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

function normalizedGateValue(schema) {
  const result = valueAtExactPath(schema, transitionPath);
  if (!result.found || typeof result.value !== "string") {
    return { valid: false, value: null };
  }
  const upper = result.value.trim().toUpperCase();
  return { valid: transitionValues.has(upper), value: upper };
}

function replyText(reply) {
  return reply.parts.map(part => part.text || "").join("\n").trim();
}

function parseReturnedSchema(reply) {
  const text = replyText(reply);
  try {
    return JSON.parse(text);
  } catch (error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    throw error;
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function findObjectsWithControlFields(value, pathParts = [], results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findObjectsWithControlFields(item, [...pathParts, index], results));
    return results;
  }

  if (!value || typeof value !== "object") return results;

  const controlKeys = [
    "role_required",
    "role_forbidden",
    "role_completed",
    "role_verification",
    "return_schema_completed"
  ];

  if (controlKeys.some(key => Object.prototype.hasOwnProperty.call(value, key))) {
    results.push({ path: pathParts, value });
  }

  for (const [key, child] of Object.entries(value)) {
    findObjectsWithControlFields(child, [...pathParts, key], results);
  }

  return results;
}

function validateExecutionControlFields(returnSchema) {
  const candidates = findObjectsWithControlFields(returnSchema);
  const findings = [];

  if (candidates.length === 0) {
    findings.push("No execution return object contains the required role/control fields.");
    return findings;
  }

  const candidate = candidates[0];
  const record = candidate.value;
  const recordPath = candidate.path.length ? candidate.path.join(".") : "$";

  if (record.role_required !== executionRoleRequired) {
    findings.push(`${recordPath}.role_required must equal "${executionRoleRequired}".`);
  }
  if (record.role_forbidden !== executionRoleForbidden) {
    findings.push(`${recordPath}.role_forbidden must equal "${executionRoleForbidden}".`);
  }
  if (record.role_completed !== executionRoleRequired) {
    findings.push(`${recordPath}.role_completed must equal "${executionRoleRequired}".`);
  }
  if (!nonEmptyString(record?.role_verification?.method)) {
    findings.push(`${recordPath}.role_verification.method must be a non-empty string.`);
  }
  if (!nonEmptyString(record?.role_verification?.evidence)) {
    findings.push(`${recordPath}.role_verification.evidence must be a non-empty string.`);
  }
  if (record.return_schema_completed !== true) {
    findings.push(`${recordPath}.return_schema_completed must be true.`);
  }

  return findings;
}

function step3RequiresLoop(schema) {
  if (!schema || typeof schema !== "object") return false;
  const step3 = schema.Step_3 || schema;

  let loopDecision = step3?.G?.Loop_Decision;
  if (loopDecision && typeof loopDecision === "object" && "value" in loopDecision) {
    loopDecision = loopDecision.value;
  }

  let returnTo = step3?.G?.return_to;
  if (returnTo && typeof returnTo === "object" && "value" in returnTo) {
    returnTo = returnTo.value;
  }

  let completed = step3?.return_schema_completed ?? step3?.step_3_completed;
  if (completed && typeof completed === "object" && "value" in completed) {
    completed = completed.value;
  }

  return (
    (typeof loopDecision === "string" && loopDecision.trim().toLowerCase() === "true") ||
    (typeof returnTo === "string" && returnTo.includes("Step_3.A")) ||
    completed === false ||
    completed === "false"
  );
}

function extractUserRequestFromStep0(returnSchema) {
  const direct = returnSchema?.start_of_turn?.user_request;
  return nonEmptyString(direct) ? direct : null;
}

function extractStatedRequirements(state) {
  const step2Record = state?.procedure?.step_records?.["2"]?.execution_return;
  if (!step2Record) return [];
  const list = step2Record?.step_2_record?.stated_requirements || step2Record?.stated_requirements;
  return Array.isArray(list) ? list : [];
}

function rawSubmittedPayload(trigger) {
  if (trigger && Object.prototype.hasOwnProperty.call(trigger, "nextmessage")) {
    return trigger.nextmessage;
  }
  return trigger;
}

function inspectIncomingEvent(trigger, currentStep) {
  const failures = [];
  const suppliedExecution = trigger?.execution;

  let execution;
  if (!suppliedExecution || typeof suppliedExecution !== "object" || Array.isArray(suppliedExecution)) {
    failures.push("The trigger does not contain an execution object. Raw input is not a ChatGPT execution return for the active step.");
    execution = {
      source_role: null,
      step: currentStep,
      return_schema: rawSubmittedPayload(trigger)
    };
  } else {
    execution = {
      source_role: suppliedExecution.source_role ?? null,
      step: Number.isInteger(suppliedExecution.step) ? suppliedExecution.step : currentStep,
      return_schema: (
        suppliedExecution.return_schema &&
        typeof suppliedExecution.return_schema === "object" &&
        !Array.isArray(suppliedExecution.return_schema)
      )
        ? suppliedExecution.return_schema
        : suppliedExecution
    };

    if (suppliedExecution.source_role !== executionRoleRequired) {
      failures.push(`execution.source_role must equal "${executionRoleRequired}".`);
    }
    if (!Number.isInteger(suppliedExecution.step)) {
      failures.push("execution.step must be an integer.");
    } else if (suppliedExecution.step !== currentStep) {
      failures.push(`Received execution for Step ${suppliedExecution.step}, but current_step is Step ${currentStep}.`);
    }
    if (
      !suppliedExecution.return_schema ||
      typeof suppliedExecution.return_schema !== "object" ||
      Array.isArray(suppliedExecution.return_schema)
    ) {
      failures.push("execution.return_schema must be a JSON object containing the ChatGPT execution return schema.");
    }
  }

  if (execution.source_role !== executionRoleRequired) {
    failures.push(`Execution source is not server/controller-identified as "${executionRoleRequired}".`);
  }

  failures.push(...validateExecutionControlFields(execution.return_schema));

  if (currentStep === 0 && !nonEmptyString(extractUserRequestFromStep0(execution.return_schema))) {
    failures.push("Step 0 must contain start_of_turn.user_request as a non-empty verbatim user request.");
  }

  if (currentStep === 3 && step3RequiresLoop(execution.return_schema)) {
    failures.push("Step 3 return indicates its internal loop is incomplete or directs a return to Step_3.A.");
  }

  return {
    execution,
    failures: [...new Set(failures)]
  };
}

function buildValidationSystemMessage(step, failures) {
  if (!Array.isArray(failures) || failures.length === 0) return null;

  const text = [
    `DETERMINISTIC PRE-SUPERVISION VALIDATION FAILED FOR STEP ${step}.`,
    "This is controller evidence only; it is not an execution return schema and it does not replace the Supervisory Gate.",
    "The submitted payload must still be evaluated by the Gemini supervisor under Agents.md.",
    "Validation findings:",
    ...failures.map((failure, index) => `${index + 1}. ${failure}`)
  ].join("\n");

  return {
    kind: "system_validation_message",
    role: "system",
    timestamp: now(),
    step,
    parts: [{ text }]
  };
}

function buildUnevaluatedGranularMirror(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => buildUnevaluatedGranularMirror(item));
  }
  if (obj !== null && typeof obj === "object") {
    const mirror = {};
    for (const key of Object.keys(obj)) {
      mirror[key] = buildUnevaluatedGranularMirror(obj[key]);
    }
    return mirror;
  }
  return { evaluation: null, comment: null };
}

function buildUnevaluatedSupervisoryGate(step, executionReturn) {
  const gate = {
    supervisory_gate: {
      role_required: supervisorRoleRequired,
      role_forbidden: supervisorRoleForbidden,
      role_completed: null,
      role_verification: {
        method: null,
        evidence: null
      },
      instruction: "Evaluate only the supplied execution candidate. Do not execute, repair, retry, complete, or simulate the ChatGPT-owned execution step. Recursively mirror every returned key and array entry. The next execution step is permitted only when gate_result is PASS.",
      granular_evaluation: buildUnevaluatedGranularMirror(executionReturn),
      step_level_evaluation: {
        evaluation: null,
        comment: null
      },
      failures: [],
      gate_result: null
    }
  };

  if (step === 3) {
    gate.supervisory_gate = {
      evaluation_documents_read: null,
      ...gate.supervisory_gate
    };
  }

  return gate;
}

function baseSystemInstruction(step, agentsText) {
  const parts = [agentsText];
  if (step === 3) {
    parts.unshift(readText(definitionsPath));
    parts.unshift(readText(testsPath));
  }
  return parts.join("\n\n");
}

async function generateSupervisor(contents, appendedSystemInstruction, step, agentsText) {
  const systemText = [
    baseSystemInstruction(step, agentsText),
    "ROLE BOUNDARY: You are the Gemini model and may perform only the Supervisory Gate. You are strictly forbidden from completing, repairing, retrying, or simulating the ChatGPT-owned execution step. The Node.js controller, not you, controls state transitions.",
    appendedSystemInstruction
  ].filter(Boolean).join("\n\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents
      }),
      signal: AbortSignal.timeout(180000)
    }
  );

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    throw new Error(`Gemini returned non-JSON HTTP ${response.status}: ${text}`);
  }

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  }

  const reply = body.candidates?.[0]?.content;
  if (reply?.role !== "model" || !Array.isArray(reply.parts) || reply.parts.length === 0) {
    throw new Error(`Gemini returned no model content: ${JSON.stringify(body)}`);
  }

  return reply;
}

function validateSupervisorRoleFields(schema) {
  const gate = schema?.supervisory_gate;
  if (!gate || typeof gate !== "object") {
    return { valid: false, reason: "Missing supervisory_gate object." };
  }
  if (gate.role_required !== supervisorRoleRequired) {
    return { valid: false, reason: `supervisory_gate.role_required must equal "${supervisorRoleRequired}".` };
  }
  if (gate.role_forbidden !== supervisorRoleForbidden) {
    return { valid: false, reason: `supervisory_gate.role_forbidden must equal "${supervisorRoleForbidden}".` };
  }
  if (gate.role_completed !== supervisorRoleRequired) {
    return { valid: false, reason: `supervisory_gate.role_completed must equal "${supervisorRoleRequired}".` };
  }
  if (!nonEmptyString(gate?.role_verification?.method)) {
    return { valid: false, reason: "supervisory_gate.role_verification.method must be populated." };
  }
  if (!nonEmptyString(gate?.role_verification?.evidence)) {
    return { valid: false, reason: "supervisory_gate.role_verification.evidence must be populated." };
  }
  return { valid: true, reason: null };
}

async function requestSupervisorySchema({
  runNonce,
  step,
  execution,
  validationSystemMessage,
  statedRequirements,
  messages,
  messagesFile,
  store,
  storeFile,
  agentsText
}) {
  const executionReturn = execution.return_schema;
  const template = buildUnevaluatedSupervisoryGate(step, executionReturn);
  const stepBlock = extractStepBlock(agentsText, step);

  const prompt = [
    `Perform only the Supervisory Gate for Step ${step}.`,
    "The submitted execution candidate below is the complete input to this gate. Do not execute or rewrite the step:",
    JSON.stringify(executionReturn, null, 2),
    "The governing Agents.md Step block is:",
    stepBlock,
    "Populate this unevaluated supervisory template:",
    JSON.stringify(template, null, 2),
    "Set role_completed to \"Gemini model\" because this response is generated by the Gemini API inside send-to-gemini.js. Populate role_verification.method and role_verification.evidence with the directly observed runtime/API context represented by this call.",
    "Return only the completed supervisory return schema as valid JSON."
  ];

  if (step === 3) {
    prompt.splice(
      1,
      0,
      "Read evaluation-tests.md and evaluator-definitions.md completely and use them throughout this Step 3 Supervisory Gate. Populate supervisory_gate.evaluation_documents_read."
    );
  }

  if ((step === 3 || step === 4) && statedRequirements.length > 0) {
    prompt.push(
      "Step 2 stated requirements that must be checked:",
      JSON.stringify(statedRequirements, null, 2)
    );
  }

  const validationSystemText = validationSystemMessage?.parts?.[0]?.text || "";
  let userMessage = { role: "user", parts: [{ text: prompt.join("\n\n") }] };
  let repairInstruction = "";
  let repairCount = 0;

  while (true) {
    const appendedSystemInstruction = [validationSystemText, repairInstruction]
      .filter(Boolean)
      .join("\n\n");

    const reply = await generateSupervisor(
      [userMessage],
      appendedSystemInstruction,
      step,
      agentsText
    );

    appendMessage(messages, messagesFile, {
      kind: repairCount === 0 ? "gemini_supervisory_gate" : "gemini_supervisory_gate_repair",
      step,
      attempt: repairCount + 1,
      role: "model",
      parts: reply.parts
    });

    let schema = null;
    let parseError = null;

    try {
      schema = parseReturnedSchema(reply);
    } catch (error) {
      parseError = error;
    }

    if (schema) {
      const gate = normalizedGateValue(schema);
      const role = validateSupervisorRoleFields(schema);

      if (gate.valid && role.valid) {
        appendStoreRecord(store, storeFile, {
          run_nonce: runNonce,
          step,
          operation: repairCount === 0 ? "supervisory_gate" : "supervisory_gate_repair",
          context_files: contextFilesForStep(step),
          model,
          return_schema: schema,
          transition_value: gate.value
        });

        return { schema, gate_result: gate.value };
      }

      const reasons = [];
      if (!gate.valid) reasons.push(`Missing/invalid ${transitionPath.join(".")}.`);
      if (!role.valid) reasons.push(role.reason);

      repairInstruction = [
        "SYSTEM CORRECTION FOR THIS SUPERVISORY RESPONSE:",
        ...reasons,
        "Repair only the Supervisory Gate response. Do not execute or simulate the ChatGPT-owned step.",
        "Return only complete valid JSON."
      ].join("\n");
    } else {
      repairInstruction = [
        "SYSTEM CORRECTION FOR THIS SUPERVISORY RESPONSE:",
        `The preceding response was not valid JSON: ${parseError?.message || "unknown parse error"}`,
        "Repair only the Supervisory Gate response. Do not execute or simulate the ChatGPT-owned step.",
        `Ensure ${transitionPath.join(".")} is exactly PASS or FAIL.`,
        "Return only complete valid JSON."
      ].join("\n");
    }

    repairCount += 1;
    userMessage = {
      role: "user",
      parts: [{
        text: "Repair your immediately preceding Supervisory Gate response according to the system correction. Return only the corrected supervisory JSON."
      }]
    };
  }
}

function recordExecutionAttempt(state, step, execution, validationFailures, supervision) {
  const key = String(step);
  const existing = state.procedure.step_records[key];
  const attempts = Array.isArray(existing?.attempts) ? existing.attempts : [];
  const attempt = attempts.length + 1;

  attempts.push({
    attempt,
    received_at: now(),
    execution_source_role: execution.source_role,
    execution_return: execution.return_schema,
    deterministic_validation_failures: validationFailures,
    supervisory_return: supervision.schema,
    transition_key: transitionPath.join("."),
    transition_value: supervision.gate_result
  });

  state.procedure.step_records[key] = {
    latest_attempt: attempt,
    attempts,
    execution_return: execution.return_schema,
    supervisory_return: supervision.schema,
    transition_key: transitionPath.join("."),
    transition_value: supervision.gate_result,
    updated_at: now()
  };
}

function advanceAfterPass(state, steps, step) {
  if (!state.procedure.completed_steps.includes(step)) {
    state.procedure.completed_steps.push(step);
  }

  state.procedure.remaining_steps = steps.filter(
    candidate => !state.procedure.completed_steps.includes(candidate)
  );

  const index = steps.indexOf(step);
  const nextStep = index >= 0 ? steps[index + 1] : undefined;

  if (nextStep === undefined) {
    state.procedure.current_step = null;
    state.procedure.awaiting = null;
    state.status = "completed";
    return;
  }

  state.procedure.current_step = nextStep;
  state.procedure.awaiting = {
    type: "chatgpt_execution",
    step: nextStep
  };
  state.status = "awaiting_chatgpt_execution";
}

function remainOnStepAfterFail(state, step, supervision) {
  state.procedure.current_step = step;
  state.procedure.awaiting = {
    type: "chatgpt_execution",
    step,
    reason: "supervisory_gate_fail"
  };
  state.status = "awaiting_chatgpt_execution";
  state.last_supervisory_failure = {
    step,
    timestamp: now(),
    supervisory_return: supervision.schema
  };
}

function preserveInitialUserMessageFromTrigger(store, storeFile, messages, messagesFile, trigger) {
  if (store.initial_user_message !== null) return;

  const candidate = trigger?.nextmessage;
  if (
    candidate?.role === "user" &&
    Array.isArray(candidate.parts) &&
    candidate.parts.some(part => typeof part?.text === "string")
  ) {
    store.initial_user_message = candidate;
    writeJson(storeFile, store);
    appendMessage(messages, messagesFile, {
      kind: "initial_user_message",
      role: "user",
      parts: candidate.parts
    });
  }
}

async function main() {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the GitHub Actions environment.");
  }

  const agentsText = readText(agentsPath);
  const steps = extractProcedureSteps(agentsText);
  const trigger = readJson(triggerPath);
  const runNonce = validateRunNonce(trigger.run_nonce);

  const {
    stateFile,
    messagesFile,
    storeFile,
    stateWrapper,
    state,
    messages,
    store
  } = initializeOrValidateRunContainer(runNonce, steps);

  state.event_count += 1;
  state.updated_at = now();

  if (state.procedure.current_step === null || state.status === "completed") {
    const systemMessage = {
      kind: "system_validation_message",
      role: "system",
      timestamp: now(),
      step: null,
      parts: [{ text: "Deterministic validation: this run is already complete and is not awaiting another execution." }]
    };
    appendMessage(messages, messagesFile, systemMessage);
    state.updated_at = now();
    writeJson(stateFile, stateWrapper);
    console.log(JSON.stringify({
      runtime: "Node.js",
      mode: "event-driven-controller",
      run_nonce: runNonce,
      status: state.status,
      processed: false,
      reason: "run already complete"
    }, null, 2));
    return;
  }

  const step = state.procedure.current_step;
  preserveInitialUserMessageFromTrigger(store, storeFile, messages, messagesFile, trigger);

  const inspection = inspectIncomingEvent(trigger, step);
  const execution = inspection.execution;
  const validationSystemMessage = buildValidationSystemMessage(step, inspection.failures);

  appendMessage(messages, messagesFile, {
    kind: "incoming_execution_candidate",
    timestamp: now(),
    step,
    source_role: execution.source_role,
    return_schema: execution.return_schema
  });

  if (validationSystemMessage) {
    appendMessage(messages, messagesFile, validationSystemMessage);
  }

  appendStoreRecord(store, storeFile, {
    run_nonce: runNonce,
    step,
    operation: "incoming_execution_candidate_received",
    execution_source_role: execution.source_role,
    execution_return: execution.return_schema,
    validation_system_message: validationSystemMessage
      ? validationSystemMessage.parts[0].text
      : null
  });

  state.status = "supervising";
  state.updated_at = now();
  writeJson(stateFile, stateWrapper);

  const statedRequirements = extractStatedRequirements(state);
  const supervision = await requestSupervisorySchema({
    runNonce,
    step,
    execution,
    validationSystemMessage,
    statedRequirements,
    messages,
    messagesFile,
    store,
    storeFile,
    agentsText
  });

  recordExecutionAttempt(
    state,
    step,
    execution,
    inspection.failures,
    supervision
  );

  if (supervision.gate_result === "PASS") {
    advanceAfterPass(state, steps, step);
  } else {
    remainOnStepAfterFail(state, step, supervision);
  }

  state.updated_at = now();
  writeJson(stateFile, stateWrapper);

  console.log(JSON.stringify({
    runtime: "Node.js",
    node_version: process.version,
    mode: "event-driven-controller",
    model,
    run_nonce: runNonce,
    processed_execution_step: step,
    validation_system_message_inserted: Boolean(validationSystemMessage),
    supervisory_gate_result: supervision.gate_result,
    current_step: state.procedure.current_step,
    completed_steps: state.procedure.completed_steps,
    awaiting: state.procedure.awaiting,
    status: state.status
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
