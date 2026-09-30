/**
 * Gemini Supervisor runner for GitHub Actions / Node.js 22.
 *
 * The procedure in Agents.md controls execution. Each execution step returns
 * its schema, that exact return becomes input to that step's Supervisory Gate,
 * and the supervisor's required key:value controls whether the execution step
 * repeats or the procedure advances.
 *
 * Required supervisory transition key for every step:
 *   supervisory_gate.gate_result = "PASS" | "FAIL"
 *
 * If that exact key:value is missing or invalid, the complete request context
 * plus the responder's own prior response is sent back to the same semantic
 * operator with an appended system correction instructing it to revise the
 * response and include the required key:value.
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiSupervisor";
const messagesPath = `${root}/messages.json`;
const nextPath = `${root}/nextmessage/nextmessage.json`;
const statePath = `${root}/current_state.json`;
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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  return JSON.parse(candidate);
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

async function requestExecutionSchema(messages, step, previousFailure) {
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

  let requestContents = messages.contents.concat({
    role: "user",
    parts: [{ text: promptParts.join("\n\n") }]
  });

  while (true) {
    let reply = await generate(requestContents, "", step);
    let schema = null;
    let parseSuccess = false;

    while (!parseSuccess) {
      try {
        schema = parseReturnedSchema(reply);
        parseSuccess = true;
      } catch (error) {
        requestContents = requestContents.concat(
          reply,
          {
            role: "user",
            parts: [{ text: "Revise the immediately preceding response according to the appended system instruction. Return only the complete corrected JSON." }]
          }
        );

        reply = await generate(
          requestContents,
          [
            "SYSTEM CORRECTION FOR THIS RESPONSE:",
            `The Step ${step} semantic-operator response was not valid JSON and therefore cannot serve as the required execution return schema.`,
            `Parser error: ${error.message}`,
            "Revise your immediately preceding response into complete valid JSON matching the exact Step return schema. Do not omit required fields."
          ].join("\n"),
          step
        );
      }
    }

    if (step === 3 && step3RequiresLoop(schema)) {
      requestContents = requestContents.concat(
        reply,
        {
          role: "user",
          parts: [{
            text: [
              "In accordance with Step 3.G, Loop_Decision is True and/or step_3_completed is false.",
              "The current proposed plan P is rejected. Return to Step 3.A, re-decompose, reconstruct P, and re-evaluate against every test in Step3_TSR until Loop_Decision is False and step_3_completed is true.",
              "Return the complete revised Step 3 execution schema as valid JSON."
            ].join("\n\n")
          }]
        }
      );
      continue;
    }

    return { reply, schema };
  }
}

async function requestSupervisorySchema(messages, step, executionReturn) {
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
    supervisorPrompt.splice(1, 0, "MANDATORY FOR STEP 3 SUPERVISORY GATE: In accordance with supervisory_gate.evaluation_documents_read, read evaluation-tests.md and evaluator-definitions.md completely and use both documents as evaluation context for the Step 3 Supervisory Gate.");
  }

  const originalContext = messages.contents.concat({
    role: "user",
    parts: [{ text: supervisorPrompt.join("\n\n") }]
  });

  let context = originalContext;
  let reply = await generate(context, "", step);

  while (true) {
    let schema = null;
    let parseError = null;

    try {
      schema = parseReturnedSchema(reply);
    } catch (error) {
      parseError = error;
    }

    if (schema) {
      const gate = normalizedGateValue(schema);
      if (gate.valid) {
        return { reply, schema, gate_result: gate.value };
      }
    }

    const exactPath = transitionPath.join(".");
    const correction = parseError
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

    context = context.concat(
      reply,
      {
        role: "user",
        parts: [{ text: "Revise the immediately preceding response according to the appended system instruction. Return only the complete corrected JSON." }]
      }
    );

    reply = await generate(context, correction, step);
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

      const execution = await requestExecutionSchema(messages, step, previousFailure);
      const supervision = await requestSupervisorySchema(messages, step, execution.schema);

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

  console.log(JSON.stringify({
    runtime: "Node.js",
    node_version: process.version,
    model,
    transition_key: transitionPath.join("."),
    completed_steps: state.procedure.completed_steps,
    status: state.status
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
