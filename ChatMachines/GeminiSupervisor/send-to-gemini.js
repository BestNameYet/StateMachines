/**
 * Gemini Supervisor runner for GitHub Actions / Node.js 22.
 *
 * Agents.md controls the procedure. Every semantic-operator call is persisted
 * as an input/return pair in both the conversation stream and the record store.
 * The exact supervisory transition key is:
 *   supervisory_gate.gate_result = "PASS" | "FAIL"
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiSupervisor";
const messagesPath = `${root}/messages.json`;
const nextPath = `${root}/nextmessage/nextmessage.json`;
const statePath = `${root}/current_state.json`;
const storePath = `${root}/store/store.json`;
const agentsPath = `${root}/Agents.md`;
const testsPath = `${root}/evaluation-tests.md`;
const definitionsPath = `${root}/evaluator-definitions.md`;

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const transitionPath = ["supervisory_gate", "gate_result"];
const transitionValues = new Set(["PASS", "FAIL"]);

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function writeJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function now() {
  return new Date().toISOString();
}

function ensureStore(store) {
  if (!store || typeof store !== "object") store = {};
  if (!Array.isArray(store.records)) store.records = [];
  return store;
}

function appendNextMessage(messages, nextmessage) {
  if (!Array.isArray(messages.contents)) {
    throw new Error("messages.json must contain contents[].");
  }
  if (
    !nextmessage ||
    nextmessage.role !== "user" ||
    !Array.isArray(nextmessage.parts) ||
    !nextmessage.parts.some(part => typeof part.text === "string")
  ) {
    throw new Error("nextmessage.json.nextmessage must be a Gemini user content object containing text.");
  }

  const last = messages.contents[messages.contents.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(nextmessage)) {
    messages.contents.push(nextmessage);
  }
  return messages;
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

function ensureProcedureState(state, steps) {
  state.procedure = state.procedure || {};
  state.procedure.completed_steps = Array.isArray(state.procedure.completed_steps)
    ? state.procedure.completed_steps
    : [];
  state.procedure.step_records = state.procedure.step_records || {};

  if (!Number.isInteger(state.procedure.current_step) || !steps.includes(state.procedure.current_step)) {
    const firstRemaining = steps.find(step => !state.procedure.completed_steps.includes(step));
    state.procedure.current_step = firstRemaining !== undefined ? firstRemaining : steps[0];
  }

  state.procedure.remaining_steps = steps.filter(
    step => !state.procedure.completed_steps.includes(step)
  );

  return state;
}

function replyText(reply) {
  return reply.parts.map(part => part.text || "").join("\n").trim();
}

function parseReturnedSchema(reply) {
  const text = replyText(reply);
  try {
    return JSON.parse(text);
  } catch (_) {
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
    if (!fenced) throw _;
    return JSON.parse(fenced[1].trim());
  }
}

function valueAtExactPath(value, path) {
  let current = value;
  for (const key of path) {
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
    return { valid: false, value: result.value };
  }

  const value = result.value.toUpperCase();
  return { valid: transitionValues.has(value), value };
}

function baseSystemInstruction(step) {
  const parts = [readText(agentsPath)];
  if (step === 3) {
    parts.unshift(readText(definitionsPath));
    parts.unshift(readText(testsPath));
  }
  return parts.join("\n\n");
}

function contextFilesForStep(step) {
  return step === 3
    ? ["Agents.md", "evaluation-tests.md", "evaluator-definitions.md"]
    : ["Agents.md"];
}

async function generate(contents, appendedSystemInstruction = "", step = null) {
  const systemText = [baseSystemInstruction(step), appendedSystemInstruction]
    .filter(Boolean)
    .join("\n\n");

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

function persistSemanticExchange(messages, store, metadata, userMessage, modelReply) {
  messages.contents.push(userMessage, modelReply);

  const record = {
    record_id: `${Date.now()}-${store.records.length + 1}`,
    timestamp: now(),
    step: metadata.step,
    operation: metadata.operation,
    attempt: metadata.attempt,
    context_files: contextFilesForStep(metadata.step),
    appended_system_instruction: metadata.appendedSystemInstruction || null,
    user: userMessage,
    model: modelReply,
    return_schema: null,
    transition_value: null
  };

  store.records.push(record);
  writeJson(messagesPath, messages);
  writeJson(storePath, store);
  return store.records.length - 1;
}

function updateStoredReturn(store, recordIndex, fields) {
  Object.assign(store.records[recordIndex], fields);
  writeJson(storePath, store);
}

async function callSemanticOperator(messages, store, metadata, userMessage, appendedSystemInstruction = "") {
  const contents = messages.contents.concat(userMessage);
  const reply = await generate(contents, appendedSystemInstruction, metadata.step);
  const recordIndex = persistSemanticExchange(
    messages,
    store,
    { ...metadata, appendedSystemInstruction },
    userMessage,
    reply
  );
  return { reply, recordIndex };
}

function step3RequiresLoop(schema) {
  if (!schema || typeof schema !== "object") return false;
  const step3 = schema.Step_3 || schema;
  const loopDecision = step3?.G?.Loop_Decision;
  const returnTo = step3?.G?.return_to;
  const completed = step3?.step_3_completed;

  if (typeof loopDecision === "string" && loopDecision.toLowerCase() === "true") {
    return true;
  }
  if (typeof returnTo === "string" && returnTo.includes("Step_3.A")) {
    return true;
  }
  if (completed === false || completed === "false") {
    return true;
  }
  return false;
}

async function requestExecutionSchema(messages, store, step, attempt, previousFailure) {
  const promptParts = [
    `Perform exactly Step ${step} from Agents.md.`,
    "Return only the complete execution return schema required by that step as valid JSON.",
    "Do not perform the Supervisory Gate yourself. The returned execution schema will be supplied to the supervisor as its input."
  ];

  if (step === 3) {
    promptParts.push(
      "MANDATORY FOR STEP 3: In accordance with Step_3.evaluation_documents_read, read evaluation-tests.md and evaluator-definitions.md completely and use both as evaluation context throughout Step 3.",
      "Step 3.G controls repetition or completion. If any test result in Step 3.F is T, set Loop_Decision to True, set return_to to Step_3.A, reject P, and loop. Set step_3_completed to true only when Loop_Decision is False and P has passed all Step3_TSR tests."
    );
  }

  if (previousFailure) {
    promptParts.push(
      "This execution step is being restarted because its preceding Supervisory Gate returned FAIL.",
      "Previous execution return:",
      JSON.stringify(previousFailure.execution_return, null, 2),
      "Supervisory return that caused the restart:",
      JSON.stringify(previousFailure.supervisory_return, null, 2),
      "Revise the execution so the current attempt satisfies the governing step and supervisory findings."
    );
  }

  let userMessage = {
    role: "user",
    parts: [{ text: promptParts.join("\n\n") }]
  };
  let operation = "execution";

  while (true) {
    let call = await callSemanticOperator(
      messages,
      store,
      { step, operation, attempt },
      userMessage
    );

    let schema;
    while (true) {
      try {
        schema = parseReturnedSchema(call.reply);
        updateStoredReturn(store, call.recordIndex, { return_schema: schema });
        break;
      } catch (error) {
        const correction = [
          "SYSTEM CORRECTION FOR THIS RESPONSE:",
          `The Step ${step} semantic-operator response was not valid JSON and therefore cannot serve as the required execution return schema.`,
          `Parser error: ${error.message}`,
          "Revise your immediately preceding response into complete valid JSON matching the exact Step return schema. Do not omit required fields."
        ].join("\n");

        userMessage = {
          role: "user",
          parts: [{
            text: "Revise the immediately preceding response according to the appended system instruction. Return only the complete corrected JSON."
          }]
        };
        operation = "execution_json_repair";
        call = await callSemanticOperator(
          messages,
          store,
          { step, operation, attempt },
          userMessage,
          correction
        );
      }
    }

    if (step === 3 && step3RequiresLoop(schema)) {
      userMessage = {
        role: "user",
        parts: [{
          text: [
            "In accordance with Step 3.G, Loop_Decision is True and/or step_3_completed is false.",
            "The current proposed plan P is rejected. Return to Step 3.A, re-decompose, reconstruct P, and re-evaluate against every test in Step3_TSR until Loop_Decision is False and step_3_completed is true.",
            "Return the complete revised Step 3 execution schema as valid JSON."
          ].join("\n\n")
        }]
      };
      operation = "execution_step3_loop";
      continue;
    }

    return { reply: call.reply, schema };
  }
}

async function requestSupervisorySchema(messages, store, step, attempt, executionReturn) {
  const supervisorPrompt = [
    `Perform only the Supervisory Gate for Step ${step} from Agents.md.`,
    "The execution return below is the input to this Supervisory Gate.",
    "Evaluate it exactly as required by the Step's Supervisory Gate.",
    "Return only the complete supervisory return schema as valid JSON.",
    `The transition controller requires the exact key:value at ${transitionPath.join(".")} with value PASS or FAIL.`,
    "Execution return schema:",
    JSON.stringify(executionReturn, null, 2)
  ];

  if (step === 3) {
    supervisorPrompt.splice(
      1,
      0,
      "MANDATORY FOR STEP 3 SUPERVISORY GATE: In accordance with supervisory_gate.evaluation_documents_read, read evaluation-tests.md and evaluator-definitions.md completely and use both documents as evaluation context for the Step 3 Supervisory Gate."
    );
  }

  let userMessage = {
    role: "user",
    parts: [{ text: supervisorPrompt.join("\n\n") }]
  };
  let operation = "supervisory_gate";
  let appendedSystemInstruction = "";

  while (true) {
    const call = await callSemanticOperator(
      messages,
      store,
      { step, operation, attempt },
      userMessage,
      appendedSystemInstruction
    );

    let schema = null;
    let parseError = null;
    try {
      schema = parseReturnedSchema(call.reply);
      updateStoredReturn(store, call.recordIndex, { return_schema: schema });
    } catch (error) {
      parseError = error;
    }

    if (schema) {
      const gate = normalizedGateValue(schema);
      if (gate.valid) {
        updateStoredReturn(store, call.recordIndex, { transition_value: gate.value });
        return { reply: call.reply, schema, gate_result: gate.value };
      }
    }

    const exactPath = transitionPath.join(".");
    appendedSystemInstruction = parseError
      ? [
          "SYSTEM CORRECTION FOR THIS RESPONSE:",
          "Your immediately preceding supervisory response could not be parsed as valid JSON.",
          `Parser error: ${parseError.message}`,
          `The transition controller also requires the exact key:value ${exactPath}: \"PASS\" or ${exactPath}: \"FAIL\".`,
          "Revise the complete response as valid JSON and include that exact transition key:value."
        ].join("\n")
      : [
          "SYSTEM CORRECTION FOR THIS RESPONSE:",
          `The required transition key:value was not found at the exact JSON path ${exactPath}, or its value was not PASS or FAIL.`,
          `Revise your immediately preceding response to include exactly ${exactPath}: \"PASS\" or ${exactPath}: \"FAIL\", according to your evaluation.`,
          "Preserve and correct the rest of the complete supervisory schema; do not replace it with only the transition key."
        ].join("\n");

    userMessage = {
      role: "user",
      parts: [{
        text: "Revise the immediately preceding response according to the appended system instruction. Return only the complete corrected JSON."
      }]
    };
    operation = "supervisory_gate_repair";
  }
}

function recordAttempt(state, step, attempt, executionReturn, supervisoryReturn, gateResult) {
  state.procedure.step_records[String(step)] = {
    attempt,
    execution_return: executionReturn,
    supervisory_return: supervisoryReturn,
    transition_key: transitionPath.join("."),
    transition_value: gateResult,
    updated_at: now()
  };
}

function advanceProcedure(state, steps, step) {
  if (!state.procedure.completed_steps.includes(step)) {
    state.procedure.completed_steps.push(step);
  }

  const index = steps.indexOf(step);
  const nextStep = index >= 0 ? steps[index + 1] : undefined;

  if (nextStep === undefined) {
    state.procedure.current_step = null;
    state.procedure.remaining_steps = [];
    state.status = "completed";
    return false;
  }

  state.procedure.current_step = nextStep;
  state.procedure.remaining_steps = steps.filter(
    candidate => !state.procedure.completed_steps.includes(candidate)
  );
  return true;
}

async function main() {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the GitHub Actions environment.");
  }

  const agentsText = readText(agentsPath);
  const steps = extractProcedureSteps(agentsText);
  const messages = appendNextMessage(
    readJson(messagesPath),
    readJson(nextPath).nextmessage
  );
  const store = ensureStore(readJson(storePath));

  const stateWrapper = readJson(statePath);
  if (!stateWrapper.current_state) {
    throw new Error("current_state.json must contain current_state.");
  }

  const state = ensureProcedureState(stateWrapper.current_state, steps);
  state.status = "running";

  while (state.procedure.current_step !== null) {
    const step = state.procedure.current_step;
    let attempt = 0;
    let previousFailure = null;

    while (true) {
      attempt += 1;

      const execution = await requestExecutionSchema(
        messages,
        store,
        step,
        attempt,
        previousFailure
      );
      const supervision = await requestSupervisorySchema(
        messages,
        store,
        step,
        attempt,
        execution.schema
      );

      recordAttempt(
        state,
        step,
        attempt,
        execution.schema,
        supervision.schema,
        supervision.gate_result
      );

      state.updated_at = now();
      writeJson(statePath, { current_state: state });
      writeJson(messagesPath, messages);
      writeJson(storePath, store);

      if (supervision.gate_result === "FAIL") {
        previousFailure = {
          execution_return: execution.schema,
          supervisory_return: supervision.schema
        };
        continue;
      }

      advanceProcedure(state, steps, step);
      break;
    }
  }

  state.updated_at = now();
  writeJson(statePath, { current_state: state });
  writeJson(messagesPath, messages);
  writeJson(storePath, store);

  console.log(JSON.stringify({
    runtime: "Node.js",
    node_version: process.version,
    model,
    transition_key: transitionPath.join("."),
    completed_steps: state.procedure.completed_steps,
    stored_records: store.records.length,
    store: storePath,
    status: state.status
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
