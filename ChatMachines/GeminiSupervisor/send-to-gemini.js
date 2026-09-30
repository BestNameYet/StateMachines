/**
 * Gemini Supervisor controller for GitHub Actions / Node.js 22.
 *
 * Architectural contract:
 * - ChatGPT owns every non-supervisory execution step.
 * - Node.js deterministically validates and transitions state.
 * - Gemini owns only the Supervisory Gate.
 * - A supervisory FAIL never executes or retries a step inside this runtime.
 *   It leaves the same step active and waits for a new ChatGPT execution event.
 *
 * Accepted trigger shape:
 * {
 *   "run_nonce": "<path-safe run id>",
 *   "execution": {
 *     "source_role": "ChatGPT model",
 *     "step": 0,
 *     "return_schema": { ...the exact Agents.md return schema for Step 0... }
 *   }
 * }
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

    return { runDir, stateFile, messagesFile, storeFile, stateWrapper, state: stateWrapper.current_state, messages, store };
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

  return { runDir, stateFile, messagesFile, storeFile, stateWrapper, state, messages, store };
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

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateExecutionControlFields(returnSchema) {
  const candidates = findObjectsWithControlFields(returnSchema);
  const findings = [];

  if (candidates.length === 0) {
    findings.push({
      check: "execution_control_fields_present",
      pass: false,
      comment: "No execution return object contains the required role/control fields."
    });
    return findings;
  }

  const candidate = candidates[0];
  const record = candidate.value;
  const recordPath = candidate.path.length ? candidate.path.join(".") : "$";

  findings.push({
    check: "role_required",
    pass: record.role_required === executionRoleRequired,
    comment: `${recordPath}.role_required must equal \"${executionRoleRequired}\".`
  });
  findings.push({
    check: "role_forbidden",
    pass: record.role_forbidden === executionRoleForbidden,
    comment: `${recordPath}.role_forbidden must equal \"${executionRoleForbidden}\".`
  });
  findings.push({
    check: "role_completed",
    pass: record.role_completed === executionRoleRequired,
    comment: `${recordPath}.role_completed must equal \"${executionRoleRequired}\".`
  });
  findings.push({
    check: "role_verification_method",
    pass: nonEmptyString(record?.role_verification?.method),
    comment: `${recordPath}.role_verification.method must be a non-empty string.`
  });
  findings.push({
    check: "role_verification_evidence",
    pass: nonEmptyString(record?.role_verification?.evidence),
    comment: `${recordPath}.role_verification.evidence must be a non-empty string.`
  });
  findings.push({
    check: "return_schema_completed",
    pass: record.return_schema_completed === true,
    comment: `${recordPath}.return_schema_completed must be true.`
  });

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

function parseIncomingExecution(trigger, currentStep) {
  const execution = trigger?.execution;

  if (!execution || typeof execution !== "object" || Array.isArray(execution)) {
    return {
      accepted: false,
      reason: "The trigger does not contain an execution object. Raw user input is not a ChatGPT execution return and cannot satisfy the active execution step.",
      execution: null
    };
  }

  if (execution.source_role !== executionRoleRequired) {
    return {
      accepted: false,
      reason: `execution.source_role must be \"${executionRoleRequired}\".`,
      execution
    };
  }

  if (!Number.isInteger(execution.step)) {
    return {
      accepted: false,
      reason: "execution.step must be an integer.",
      execution
    };
  }

  if (execution.step !== currentStep) {
    return {
      accepted: false,
      reason: `Received ChatGPT execution for Step ${execution.step}, but the deterministic current_step is Step ${currentStep}.`,
      execution
    };
  }

  if (!execution.return_schema || typeof execution.return_schema !== "object" || Array.isArray(execution.return_schema)) {
    return {
      accepted: false,
      reason: "execution.return_schema must be a JSON object containing the completed ChatGPT execution return schema.",
      execution
    };
  }

  return { accepted: true, reason: null, execution };
}

function buildControllerValidation(step, execution, state) {
  const findings = [
    {
      check: "execution_source_role",
      pass: execution.source_role === executionRoleRequired,
      comment: `Execution event source must be ${executionRoleRequired}.`
    },
    {
      check: "execution_step_matches_state",
      pass: execution.step === state.procedure.current_step,
      comment: `Execution Step ${execution.step} must equal current state Step ${state.procedure.current_step}.`
    },
    ...validateExecutionControlFields(execution.return_schema)
  ];

  if (step === 0) {
    findings.push({
      check: "step0_verbatim_user_request_present",
      pass: nonEmptyString(extractUserRequestFromStep0(execution.return_schema)),
      comment: "Step 0 must contain start_of_turn.user_request as a non-empty verbatim user request."
    });
  }

  if (step === 3) {
    findings.push({
      check: "step3_internal_loop_complete",
      pass: !step3RequiresLoop(execution.return_schema),
      comment: "Step 3 cannot pass its supervisory gate while its own return schema directs a return to Step_3.A or reports incomplete completion."
    });
  }

  return {
    pass: findings.every(finding => finding.pass),
    findings
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
      instruction: "Evaluate only the supplied ChatGPT execution return. Do not execute, repair, retry, complete, or simulate the ChatGPT-owned execution step. Recursively mirror every returned key and array entry. The next execution step is permitted only when gate_result is PASS.",
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
    return { valid: false, reason: `supervisory_gate.role_required must equal \"${supervisorRoleRequired}\".` };
  }
  if (gate.role_forbidden !== supervisorRoleForbidden) {
    return { valid: false, reason: `supervisory_gate.role_forbidden must equal \"${supervisorRoleForbidden}\".` };
  }
  if (gate.role_completed !== supervisorRoleRequired) {
    return { valid: false, reason: `supervisory_gate.role_completed must equal \"${supervisorRoleRequired}\".` };
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
  controllerValidation,
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
    "The ChatGPT execution return below is the complete input to this gate. Do not execute or rewrite the step:",
    JSON.stringify(executionReturn, null, 2),
    "Deterministic Node.js controller validation findings:",
    JSON.stringify(controllerValidation, null, 2),
    "The governing Agents.md Step block is:",
    stepBlock,
    "Populate this unevaluated supervisory template:",
    JSON.stringify(template, null, 2),
    "Set role_completed to \"Gemini model\" because this response is generated by the Gemini API inside send-to-gemini.js. Populate role_verification.method and role_verification.evidence with the directly observed runtime/API context represented by this call.",
    "If ANY deterministic controller finding has pass=false, gate_result MUST be FAIL.",
    "Set gate_result PASS only when all granular evaluations and the step-level evaluation pass, the ChatGPT execution return is complete, and the role requirements are satisfied.",
    "Return only the completed supervisory return schema as valid JSON."
  ];

  if (step === 3) {
    prompt.splice(1, 0,
      "Read evaluation-tests.md and evaluator-definitions.md completely and use them throughout this Step 3 Supervisory Gate. Populate supervisory_gate.evaluation_documents_read."
    );
  }

  if ((step === 3 || step === 4) && statedRequirements.length > 0) {
    prompt.push(
      "Step 2 stated requirements that must be checked:",
      JSON.stringify(statedRequirements, null, 2)
    );
  }

  let userMessage = { role: "user", parts: [{ text: prompt.join("\n\n") }] };
  let appendedSystemInstruction = "";
  let repairCount = 0;

  while (true) {
    const reply = await generateSupervisor([userMessage], appendedSystemInstruction, step, agentsText);

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
      const controllerRequiresFail = !controllerValidation.pass;
      const gateContradictsController = controllerRequiresFail && gate.valid && gate.value !== "FAIL";

      if (gate.valid && role.valid && !gateContradictsController) {
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
      if (gateContradictsController) reasons.push("Controller validation contains a deterministic FAIL, so gate_result must be FAIL.");

      appendedSystemInstruction = [
        "SYSTEM CORRECTION FOR THIS SUPERVISORY RESPONSE:",
        ...reasons,
        "Repair only the Supervisory Gate response. Do not execute or simulate the ChatGPT-owned step.",
        "Return only complete valid JSON."
      ].join("\n");
    } else {
      appendedSystemInstruction = [
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
      parts: [{ text: "Repair your immediately preceding Supervisory Gate response according to the system correction. Return only the corrected supervisory JSON." }]
    };
  }
}

function recordExecutionAttempt(state, step, execution, controllerValidation, supervision) {
  const key = String(step);
  const existing = state.procedure.step_records[key];
  const attempts = Array.isArray(existing?.attempts) ? existing.attempts : [];
  const attempt = attempts.length + 1;

  attempts.push({
    attempt,
    received_at: now(),
    execution_source_role: execution.source_role,
    execution_return: execution.return_schema,
    controller_validation: controllerValidation,
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

function persistRejectedExecution({
  runNonce,
  state,
  stateWrapper,
  stateFile,
  messages,
  messagesFile,
  store,
  storeFile,
  trigger,
  reason
}) {
  appendMessage(messages, messagesFile, {
    kind: "rejected_incoming_event",
    timestamp: now(),
    received: trigger,
    reason
  });

  appendStoreRecord(store, storeFile, {
    run_nonce: runNonce,
    step: state.procedure.current_step,
    operation: "execution_rejected",
    deterministic_validation: {
      pass: false,
      reason
    },
    received_event: trigger
  });

  state.status = "awaiting_chatgpt_execution";
  state.procedure.awaiting = {
    type: "chatgpt_execution",
    step: state.procedure.current_step,
    reason: "incoming_event_rejected"
  };
  state.last_rejected_event = { timestamp: now(), reason };
  state.updated_at = now();
  writeJson(stateFile, stateWrapper);
}

async function main() {
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing from the GitHub Actions environment.");

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
    persistRejectedExecution({
      runNonce,
      state,
      stateWrapper,
      stateFile,
      messages,
      messagesFile,
      store,
      storeFile,
      trigger,
      reason: "This run is already complete and is not awaiting another execution."
    });
    return;
  }

  const step = state.procedure.current_step;
  const incoming = parseIncomingExecution(trigger, step);

  if (!incoming.accepted) {
    persistRejectedExecution({
      runNonce,
      state,
      stateWrapper,
      stateFile,
      messages,
      messagesFile,
      store,
      storeFile,
      trigger,
      reason: incoming.reason
    });

    console.log(JSON.stringify({
      runtime: "Node.js",
      mode: "event-driven-controller",
      run_nonce: runNonce,
      current_step: state.procedure.current_step,
      status: state.status,
      accepted_execution: false,
      reason: incoming.reason
    }, null, 2));
    return;
  }

  const execution = incoming.execution;
  const controllerValidation = buildControllerValidation(step, execution, state);

  if (step === 0 && store.initial_user_message === null) {
    const userRequest = extractUserRequestFromStep0(execution.return_schema);
    if (userRequest !== null) {
      store.initial_user_message = {
        role: "user",
        parts: [{ text: userRequest }]
      };
      writeJson(storeFile, store);
      appendMessage(messages, messagesFile, {
        kind: "initial_user_message",
        role: "user",
        parts: [{ text: userRequest }]
      });
    }
  }

  appendMessage(messages, messagesFile, {
    kind: "chatgpt_execution",
    timestamp: now(),
    step,
    source_role: execution.source_role,
    return_schema: execution.return_schema
  });

  appendStoreRecord(store, storeFile, {
    run_nonce: runNonce,
    step,
    operation: "chatgpt_execution_received",
    execution_source_role: execution.source_role,
    execution_return: execution.return_schema,
    controller_validation: controllerValidation
  });

  state.status = "supervising";
  state.updated_at = now();
  writeJson(stateFile, stateWrapper);

  const statedRequirements = extractStatedRequirements(state);
  const supervision = await requestSupervisorySchema({
    runNonce,
    step,
    execution,
    controllerValidation,
    statedRequirements,
    messages,
    messagesFile,
    store,
    storeFile,
    agentsText
  });

  recordExecutionAttempt(state, step, execution, controllerValidation, supervision);

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
