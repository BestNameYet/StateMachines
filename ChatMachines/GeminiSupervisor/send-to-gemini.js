/**
 * Gemini Supervisor runner for GitHub Actions / Node.js 22.
 *
 * Exact supervisory transition key: supervisory_gate.gate_result = "PASS" | "FAIL"
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = "ChatMachines/GeminiSupervisor";
const triggerPath = `${root}/nextmessage/nextmessage.json`;
const agentsPath = `${root}/Agents.md`;
const testsPath = `${root}/evaluation-tests.md`;
const definitionsPath = `${root}/evaluator-definitions.md`;

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const transitionPath = ["supervisory_gate", "gate_result"];
const transitionValues = new Set(["PASS", "FAIL"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeJson(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

function initializeOrValidateRunContainer(runNonce, nextmessage, steps) {
  const runDir = path.join(root, "runs", runNonce);
  const stateFile = path.join(runDir, "state.json");
  const messagesFile = path.join(runDir, "messages.json");
  const storeFile = path.join(runDir, "store", "store.json");

  let stateWrapper;
  let messages;
  let store;

  const isNewRun = !fs.existsSync(stateFile) && !fs.existsSync(messagesFile);

  if (isNewRun) {
    fs.mkdirSync(path.join(runDir, "store"), { recursive: true });

    const initialState = {
      current_state: {
        run_nonce: runNonce,
        status: "running",
        created_at: now(),
        updated_at: now(),
        git_commits: [],
        procedure: {
          current_step: steps[0],
          completed_steps: [],
          remaining_steps: [...steps],
          step_records: {}
        }
      }
    };

    const initialMessages = {
      run_nonce: runNonce,
      contents: [nextmessage]
    };

    const initialStore = {
      run_nonce: runNonce,
      created_at: now(),
      initial_user_message: nextmessage,
      records: []
    };

    writeJson(stateFile, initialState);
    writeJson(messagesFile, initialMessages);
    writeJson(storeFile, initialStore);

    stateWrapper = initialState;
    messages = initialMessages;
    store = initialStore;
  } else {
    if (!fs.existsSync(stateFile) || !fs.existsSync(messagesFile) || !fs.existsSync(storeFile)) {
      throw new Error(`Incomplete run container at ${runDir}. Required files missing.`);
    }

    stateWrapper = readJson(stateFile);
    messages = readJson(messagesFile);
    store = readJson(storeFile);

    if (stateWrapper?.current_state?.run_nonce !== runNonce) {
      throw new Error(`Mismatched run_nonce in state.json: expected ${runNonce}, found ${stateWrapper?.current_state?.run_nonce}`);
    }
    if (messages?.run_nonce !== runNonce) {
      throw new Error(`Mismatched run_nonce in messages.json: expected ${runNonce}, found ${messages?.run_nonce}`);
    }
    if (store?.run_nonce !== runNonce) {
      throw new Error(`Mismatched run_nonce in store.json: expected ${runNonce}, found ${store?.run_nonce}`);
    }

    if (!Array.isArray(messages.contents)) {
      messages.contents = [];
    }
    const lastMessage = messages.contents[messages.contents.length - 1];
    if (JSON.stringify(lastMessage) !== JSON.stringify(nextmessage)) {
      messages.contents.push(nextmessage);
      writeJson(messagesFile, messages);
    }
  }

  const state = stateWrapper.current_state;
  state.procedure = state.procedure || {};
  state.procedure.completed_steps = Array.isArray(state.procedure.completed_steps)
    ? state.procedure.completed_steps
    : [];
  state.procedure.step_records = state.procedure.step_records || {};
  state.git_commits = Array.isArray(state.git_commits) ? state.git_commits : [];

  if (!Number.isInteger(state.procedure.current_step) || !steps.includes(state.procedure.current_step)) {
    const firstRemaining = steps.find(step => !state.procedure.completed_steps.includes(step));
    state.procedure.current_step = firstRemaining !== undefined ? firstRemaining : steps[0];
  }

  state.procedure.remaining_steps = steps.filter(
    step => !state.procedure.completed_steps.includes(step)
  );

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

function replyText(reply) {
  return reply.parts.map(part => part.text || "").join("\n").trim();
}

function parseReturnedSchema(reply) {
  const text = replyText(reply);
  try {
    return JSON.parse(text);
  } catch (_) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    throw _;
  }
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
  return {
    evaluation: null,
    comment: null
  };
}

function buildUnevaluatedSupervisoryGate(step, executionReturn) {
  const granularTemplate = buildUnevaluatedGranularMirror(executionReturn);
  const gate = {
    supervisory_gate: {
      instruction: "Immediately after this step returns its execution schema, the supervisor must evaluate that returned schema before the next execution step may begin. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",
      granular_evaluation: granularTemplate,
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

function persistSemanticExchange(runNonce, messages, store, messagesFile, storeFile, metadata, userMessage, modelReply) {
  messages.contents.push(userMessage, modelReply);

  const record = {
    record_id: `${Date.now()}-${store.records.length + 1}`,
    run_nonce: runNonce,
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
  writeJson(messagesFile, messages);
  writeJson(storeFile, store);
  return store.records.length - 1;
}

function updateStoredRecord(store, storeFile, recordIndex, fields) {
  Object.assign(store.records[recordIndex], fields);
  writeJson(storeFile, store);
}

async function callSemanticOperator(runNonce, messages, store, messagesFile, storeFile, metadata, userMessage, appendedSystemInstruction = "") {
  const contents = messages.contents.concat(userMessage);
  const reply = await generate(contents, appendedSystemInstruction, metadata.step);
  const recordIndex = persistSemanticExchange(
    runNonce,
    messages,
    store,
    messagesFile,
    storeFile,
    { ...metadata, appendedSystemInstruction },
    userMessage,
    reply
  );
  return { reply, recordIndex };
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

  if (typeof loopDecision === "string" && loopDecision.trim().toLowerCase() === "true") {
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

async function requestExecutionSchema(runNonce, messages, store, messagesFile, storeFile, step, attempt, previousFailure, statedRequirements) {
  const promptParts = [
    `Perform exactly Step ${step} from Agents.md.`,
    "The return schema for this step is the central control surface. You communicate completion and results exclusively through that exact return schema.",
    "Ensure return_schema_completed is true for this step. A value of false means the step schema is incomplete and will fail supervisory evaluation.",
    "Return only the complete execution return schema required by that step as valid JSON.",
    "Do not perform the Supervisory Gate yourself. The returned execution schema will be supplied to the supervisor as its input."
  ];

  if (step === 3) {
    promptParts.push(
      "MANDATORY FOR STEP 3: In accordance with Step_3.evaluation_documents_read, read evaluation-tests.md and evaluator-definitions.md completely and use both as evaluation context throughout Step 3.",
      "Step 3.G controls repetition or completion. If any test result in Step 3.F is T, set Loop_Decision to True, set return_to to Step_3.A, reject P, and loop. Set return_schema_completed to true only when Loop_Decision is False and P has passed all Step3_TSR tests."
    );
    if (statedRequirements && statedRequirements.length > 0) {
      promptParts.push(
        "Stated requirements extracted in Step 2 that must be satisfied by plan P and UI_output:",
        JSON.stringify(statedRequirements, null, 2)
      );
    }
  }

  if (step === 4 && statedRequirements && statedRequirements.length > 0) {
    promptParts.push(
      "Stated requirements from Step 2 to verify in completion reporting:",
      JSON.stringify(statedRequirements, null, 2)
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
      runNonce,
      messages,
      store,
      messagesFile,
      storeFile,
      { step, operation, attempt },
      userMessage
    );

    let schema;
    while (true) {
      try {
        schema = parseReturnedSchema(call.reply);
        updateStoredRecord(store, storeFile, call.recordIndex, { return_schema: schema });
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
          runNonce,
          messages,
          store,
          messagesFile,
          storeFile,
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
            "In accordance with Step 3.G, Loop_Decision is True and/or return_schema_completed is false.",
            "The current proposed plan P is rejected. Return to Step 3.A, re-decompose, reconstruct P, and re-evaluate against every test in Step3_TSR until Loop_Decision is False and return_schema_completed is true.",
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

async function requestSupervisorySchema(runNonce, messages, store, messagesFile, storeFile, step, attempt, executionReturn, statedRequirements) {
  const unevaluatedGateTemplate = buildUnevaluatedSupervisoryGate(step, executionReturn);
  const supervisorPrompt = [
    `Perform only the Supervisory Gate for Step ${step} from Agents.md.`,
    "The execution return below is the input to this Supervisory Gate:",
    JSON.stringify(executionReturn, null, 2),
    "You must evaluate that returned schema and populate the unevaluated supervisory gate schema template.",
    "The evaluative and result fields in this template begin unevaluated (null). Replace each null placeholder with your actual evaluation:",
    "1. Replace null in granular_evaluation terminal entries with { \"evaluation\": \"PASS\" | \"FAIL\", \"comment\": \"<required supervisor evaluation>\" }.",
    "2. In step_level_evaluation, replace null with your holistic step evaluation and comment.",
    "3. In failures, add an entry for every granular or step-level FAIL.",
    `4. Set supervisory_gate.gate_result to \"PASS\" only when every granular evaluation and step-level evaluation are PASS and return_schema_completed is true; otherwise set it to \"FAIL\".`,
    "Unevaluated Supervisory Gate Schema Template to populate:",
    JSON.stringify(unevaluatedGateTemplate, null, 2),
    "Return only the completed supervisory return schema as valid JSON."
  ];

  if (step === 3) {
    supervisorPrompt.splice(
      1,
      0,
      "MANDATORY FOR STEP 3 SUPERVISORY GATE: In accordance with supervisory_gate.evaluation_documents_read, read evaluation-tests.md and evaluator-definitions.md completely and use both documents as evaluation context for the Step 3 Supervisory Gate. Set supervisory_gate.evaluation_documents_read to \"evaluation-tests.md and evaluator-definitions.md read completely\"."
    );
  }

  if ((step === 3 || step === 4) && statedRequirements && statedRequirements.length > 0) {
    supervisorPrompt.push(
      "Verify the execution return against all Step 2 stated requirements:",
      JSON.stringify(statedRequirements, null, 2)
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
      runNonce,
      messages,
      store,
      messagesFile,
      storeFile,
      { step, operation, attempt },
      userMessage,
      appendedSystemInstruction
    );

    let schema = null;
    let parseError = null;
    try {
      schema = parseReturnedSchema(call.reply);
      updateStoredRecord(store, storeFile, call.recordIndex, { return_schema: schema });
    } catch (error) {
      parseError = error;
    }

    if (schema) {
      const gate = normalizedGateValue(schema);
      if (gate.valid) {
        updateStoredRecord(store, storeFile, call.recordIndex, { transition_value: gate.value });
        return { reply: call.reply, schema, gate_result: gate.value };
      }
    }

    const exactPath = transitionPath.join(".");
    appendedSystemInstruction = parseError
      ? [
          "SYSTEM CORRECTION FOR THIS RESPONSE:",
          "Your immediately preceding supervisory response could not be parsed as valid JSON.",
          `Parser error: ${parseError.message}`,
          "Populate and return the complete unevaluated supervisory gate schema template as valid JSON.",
          `Ensure that ${exactPath} is populated with either \"PASS\" or \"FAIL\" and no required fields remain null.`
        ].join("\n")
      : [
          "SYSTEM CORRECTION FOR THIS RESPONSE:",
          `The required transition key:value was not found at the exact JSON path ${exactPath}, or remained null/unpopulated, or was not PASS or FAIL.`,
          "Complete your evaluation of the execution return using the unevaluated supervisory schema template.",
          `Set ${exactPath} to either \"PASS\" or \"FAIL\" based on your granular and step-level evaluations.`,
          "Return only the complete valid supervisory return schema."
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

function commitStepCheckpoint(runNonce, step, gateResult, runDir) {
  try {
    execFileSync("git", ["add", runDir], { stdio: "pipe" });
    const commitMsg = `checkpoint(${runNonce}): Step ${step} gate ${gateResult}`;
    execFileSync("git", ["commit", "-m", commitMsg, "--allow-empty"], { stdio: "pipe" });
    const hash = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    return hash;
  } catch (err) {
    return `git-checkpoint-local-${Date.now()}`;
  }
}

function recordAttempt(state, step, attempt, executionReturn, supervisoryReturn, gateResult, commitHash = null) {
  state.procedure.step_records[String(step)] = {
    attempt,
    execution_return: executionReturn,
    supervisory_return: supervisoryReturn,
    transition_key: transitionPath.join("."),
    transition_value: gateResult,
    commit_hash: commitHash,
    updated_at: now()
  };
  if (commitHash) {
    state.git_commits.push({
      step,
      gate_result: gateResult,
      commit_hash: commitHash,
      timestamp: now()
    });
  }
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

function extractStatedRequirements(state) {
  const step2Record = state?.procedure?.step_records?.["2"]?.execution_return;
  if (!step2Record) return [];
  const list = step2Record?.step_2_record?.stated_requirements || step2Record?.stated_requirements;
  return Array.isArray(list) ? list : [];
}

async function main() {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the GitHub Actions environment.");
  }

  const agentsText = readText(agentsPath);
  const steps = extractProcedureSteps(agentsText);

  const trigger = readJson(triggerPath);
  const runNonce = validateRunNonce(trigger.run_nonce);
  const nextmessage = trigger.nextmessage;

  if (
    !nextmessage ||
    nextmessage.role !== "user" ||
    !Array.isArray(nextmessage.parts) ||
    !nextmessage.parts.some(p => typeof p.text === "string")
  ) {
    throw new Error("trigger nextmessage must be a Gemini user content object containing text.");
  }

  const {
    runDir,
    stateFile,
    messagesFile,
    storeFile,
    stateWrapper,
    state,
    messages,
    store
  } = initializeOrValidateRunContainer(runNonce, nextmessage, steps);

  state.status = "running";

  while (state.procedure.current_step !== null) {
    const step = state.procedure.current_step;
    let attempt = 0;
    let previousFailure = null;
    const statedRequirements = extractStatedRequirements(state);

    while (true) {
      attempt += 1;

      const execution = await requestExecutionSchema(
        runNonce,
        messages,
        store,
        messagesFile,
        storeFile,
        step,
        attempt,
        previousFailure,
        statedRequirements
      );

      const supervision = await requestSupervisorySchema(
        runNonce,
        messages,
        store,
        messagesFile,
        storeFile,
        step,
        attempt,
        execution.schema,
        statedRequirements
      );

      let commitHash = null;
      if (supervision.gate_result === "PASS") {
        commitHash = commitStepCheckpoint(runNonce, step, supervision.gate_result, runDir);
      }

      recordAttempt(
        state,
        step,
        attempt,
        execution.schema,
        supervision.schema,
        supervision.gate_result,
        commitHash
      );

      state.updated_at = now();
      writeJson(stateFile, stateWrapper);

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

  if (state.git_commits.length < steps.length) {
    state.status = "failed_checkpoint_verification";
  }

  state.updated_at = now();
  writeJson(stateFile, stateWrapper);

  console.log(JSON.stringify({
    runtime: "Node.js",
    node_version: process.version,
    model,
    run_nonce: runNonce,
    transition_key: transitionPath.join("."),
    completed_steps: state.procedure.completed_steps,
    git_commits: state.git_commits.length,
    stored_records: store.records.length,
    store: storeFile,
    status: state.status
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
