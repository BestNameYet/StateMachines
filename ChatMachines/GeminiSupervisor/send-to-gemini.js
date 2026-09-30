/**
 * Gemini Supervisor runner for GitHub Actions / Node.js 22.
 *
 * This file runs the supervisor directly in the GitHub Actions Node runtime.
 * Apps Script is not part of this execution path.
 *
 * One invocation performs exactly one persisted machine substep:
 *   EXECUTION   -> run the current Agents.md step
 *   SUPERVISION -> evaluate that step's returned schema
 *   TRANSITION  -> apply PASS/FAIL and prepare the next step
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

function systemInstruction() {
  return [
    readText(testsPath),
    readText(definitionsPath),
    readText(agentsPath)
  ].join("\n\n");
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

function ensureMachineState(state) {
  state.procedure = state.procedure || {};
  if (!Number.isInteger(state.procedure.current_step)) {
    state.procedure.current_step = 0;
  }
  state.procedure.completed_steps = state.procedure.completed_steps || [];
  state.procedure.remaining_steps = state.procedure.remaining_steps || [];

  if (!state.machine) {
    state.machine = {
      phase: "EXECUTION",
      iteration: 0,
      execution: {
        step: state.procedure.current_step,
        started: false,
        completed: false,
        return_schema_received: false,
        result: null
      },
      supervision: {
        step: state.procedure.current_step,
        required: false,
        started: false,
        completed: false,
        return_schema_received: false,
        gate_result: null,
        result: null
      },
      transition: {
        ready: false,
        decision: null,
        from_step: state.procedure.current_step,
        to_step: null
      }
    };
  }
  return state;
}

function resetForExecution(state, step) {
  state.machine.phase = "EXECUTION";
  state.machine.execution = {
    step,
    started: false,
    completed: false,
    return_schema_received: false,
    result: null
  };
  state.machine.supervision = {
    step,
    required: false,
    started: false,
    completed: false,
    return_schema_received: false,
    gate_result: null,
    result: null
  };
  state.machine.transition = {
    ready: false,
    decision: null,
    from_step: step,
    to_step: null
  };
}

function replyText(reply) {
  return reply.parts.map(part => part.text || "").join("\n").trim();
}

function parseReturnedSchema(reply) {
  const text = replyText(reply);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Gemini return schema was not valid JSON: ${error.message}`);
  }
}

function findGateResult(value) {
  if (!value || typeof value !== "object") return null;

  if (typeof value.gate_result === "string") {
    return value.gate_result.toUpperCase();
  }

  if (value.gate_result && typeof value.gate_result === "object") {
    const direct =
      value.gate_result.value ||
      value.gate_result.result ||
      value.gate_result.evaluation;
    if (typeof direct === "string") return direct.toUpperCase();
  }

  for (const child of Object.values(value)) {
    const result = findGateResult(child);
    if (result) return result;
  }
  return null;
}

async function callGemini(messages, prompt) {
  const contents = messages.contents.slice();
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction() }]
        },
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

async function runExecution(state, messages) {
  const step = state.procedure.current_step;

  state.machine.execution.started = true;
  state.machine.execution.step = step;

  const reply = await callGemini(
    messages,
    [
      `Perform exactly Step ${step} from Agents.md.`,
      "Do not perform the supervisory gate and do not begin the next step.",
      "Return only the complete execution return schema required by that step as valid JSON.",
      "Current persisted state:",
      JSON.stringify(state, null, 2)
    ].join("\n\n")
  );

  state.machine.execution.result = parseReturnedSchema(reply);
  state.machine.execution.return_schema_received = true;
  state.machine.execution.completed = true;
  state.machine.supervision.required = true;
  state.machine.phase = "SUPERVISION";
  state.machine.iteration += 1;
}

async function runSupervision(state, messages) {
  const step = state.procedure.current_step;

  state.machine.supervision.started = true;
  state.machine.supervision.step = step;

  const reply = await callGemini(
    messages,
    [
      `Perform only the Supervisory Gate for Step ${step} from Agents.md.`,
      "Evaluate the execution return schema entry by entry at matching schema paths and then perform the step-level evaluation.",
      "Return only the complete supervisory return schema as valid JSON, including gate_result PASS or FAIL.",
      "Execution return schema:",
      JSON.stringify(state.machine.execution.result, null, 2),
      "Current persisted state:",
      JSON.stringify(state, null, 2)
    ].join("\n\n")
  );

  const schema = parseReturnedSchema(reply);
  const gate = findGateResult(schema);
  if (gate !== "PASS" && gate !== "FAIL") {
    throw new Error("Supervisory return schema must contain gate_result PASS or FAIL.");
  }

  state.machine.supervision.result = schema;
  state.machine.supervision.return_schema_received = true;
  state.machine.supervision.completed = true;
  state.machine.supervision.required = false;
  state.machine.supervision.gate_result = gate;
  state.machine.transition.ready = true;
  state.machine.transition.decision = gate === "PASS" ? "CONTINUE" : "REPEAT";
  state.machine.transition.from_step = step;
  state.machine.transition.to_step = gate === "PASS" ? step + 1 : step;
  state.machine.phase = "TRANSITION";
}

function applyTransition(state) {
  const transition = state.machine.transition;
  if (!transition.ready) {
    throw new Error("Transition phase reached without a ready transition.");
  }

  const from = transition.from_step;

  if (transition.decision === "CONTINUE") {
    if (!state.procedure.completed_steps.includes(from)) {
      state.procedure.completed_steps.push(from);
    }
    state.procedure.current_step = transition.to_step;
  } else if (transition.decision === "REPEAT") {
    state.procedure.current_step = from;
  } else {
    throw new Error(`Unknown transition decision: ${transition.decision}`);
  }

  resetForExecution(state, state.procedure.current_step);
}

async function main() {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the GitHub Actions environment.");
  }

  const messages = appendNextMessage(
    readJson(messagesPath),
    readJson(nextPath).nextmessage
  );

  const stateWrapper = readJson(statePath);
  if (!stateWrapper.current_state) {
    throw new Error("current_state.json must contain current_state.");
  }

  const state = ensureMachineState(stateWrapper.current_state);
  const phase = state.machine.phase;

  if (phase === "EXECUTION") {
    await runExecution(state, messages);
  } else if (phase === "SUPERVISION") {
    await runSupervision(state, messages);
  } else if (phase === "TRANSITION") {
    applyTransition(state);
  } else {
    throw new Error(`Unknown machine phase: ${phase}`);
  }

  state.updated_at = now();
  writeJson(statePath, { current_state: state });
  writeJson(messagesPath, messages);

  console.log(JSON.stringify({
    runtime: "Node.js",
    node_version: process.version,
    model,
    completed_substep: phase,
    next_phase: state.machine.phase,
    current_step: state.procedure.current_step
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
