/**
 * Gemini Supervisor state-machine runner.
 *
 * One invocation performs exactly one pending substep:
 *   EXECUTION   -> run current Agents.md step
 *   SUPERVISION -> evaluate that returned step schema
 *   TRANSITION  -> apply PASS/FAIL and prepare the next invocation
 *
 * State is persisted after every substep so an interrupted run resumes at the
 * correct boundary instead of repeating already-completed work.
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiSupervisor";
const streamPath = `${root}/messages.json`;
const nextPath = `${root}/nextmessage/nextmessage.json`;
const statePath = `${root}/current_state.json`;
const agentsPath = `${root}/Agents.md`;
const testsPath = `${root}/evaluation-tests.md`;
const definitionsPath = `${root}/evaluator-definitions.md`;
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function now() {
  return new Date().toISOString();
}

function ensureMachineState(state) {
  state.procedure ||= {};
  if (!Number.isInteger(state.procedure.current_step)) state.procedure.current_step = 0;
  state.procedure.completed_steps ||= [];
  state.procedure.remaining_steps ||= [];

  state.machine ||= {
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

function persist(wrapper) {
  wrapper.current_state.updated_at = now();
  writeJson(statePath, wrapper);
}

function systemInstruction() {
  return [
    fs.readFileSync(testsPath, "utf8"),
    fs.readFileSync(definitionsPath, "utf8"),
    fs.readFileSync(agentsPath, "utf8")
  ].join("\n\n");
}

function appendPendingUserMessage(stream) {
  const { nextmessage } = readJson(nextPath);
  if (nextmessage?.role !== "user" ||
      !Array.isArray(nextmessage.parts) ||
      !nextmessage.parts.some(part => typeof part.text === "string")) {
    throw new Error("nextmessage.json must contain a user message with text.");
  }

  const last = stream.contents.at(-1);
  if (JSON.stringify(last) !== JSON.stringify(nextmessage)) {
    stream.contents.push(nextmessage);
  }
}

async function callGemini(contents, prompt) {
  const requestContents = [
    ...contents,
    { role: "user", parts: [{ text: prompt }] }
  ];

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
        contents: requestContents
      }),
      signal: AbortSignal.timeout(120000)
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  }

  const reply = body.candidates?.[0]?.content;
  if (reply?.role !== "model" || !Array.isArray(reply.parts) || reply.parts.length === 0) {
    throw new Error("Gemini returned no model content.");
  }
  return reply;
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
  if (typeof value.gate_result === "string") return value.gate_result.toUpperCase();
  if (value.gate_result && typeof value.gate_result === "object") {
    const direct = value.gate_result.value || value.gate_result.result || value.gate_result.evaluation;
    if (typeof direct === "string") return direct.toUpperCase();
  }
  for (const child of Object.values(value)) {
    const found = findGateResult(child);
    if (found) return found;
  }
  return null;
}

async function runExecution(wrapper, stream) {
  const state = wrapper.current_state;
  const step = state.procedure.current_step;

  state.machine.execution.started = true;
  state.machine.execution.step = step;
  persist(wrapper);

  const prompt = [
    `Perform exactly Step ${step} from Agents.md.`,
    "Do not perform the supervisory gate and do not begin the next step.",
    "Return only the complete execution return schema required by that step as valid JSON.",
    "Current persisted state follows:",
    JSON.stringify(state, null, 2)
  ].join("\n\n");

  const reply = await callGemini(stream.contents, prompt);
  const schema = parseReturnedSchema(reply);

  state.machine.execution.completed = true;
  state.machine.execution.return_schema_received = true;
  state.machine.execution.result = schema;
  state.machine.supervision.required = true;
  state.machine.phase = "SUPERVISION";
  state.machine.iteration += 1;
  persist(wrapper);
}

async function runSupervision(wrapper, stream) {
  const state = wrapper.current_state;
  const step = state.procedure.current_step;

  state.machine.supervision.started = true;
  state.machine.supervision.step = step;
  persist(wrapper);

  const prompt = [
    `Perform only the Supervisory Gate for Step ${step} from Agents.md.`,
    "Evaluate the returned execution schema entry by entry at the same schema paths, then perform the step-level evaluation.",
    "Return only the complete supervisory return schema as valid JSON, including gate_result PASS or FAIL.",
    "Execution return schema:",
    JSON.stringify(state.machine.execution.result, null, 2),
    "Current persisted state:",
    JSON.stringify(state, null, 2)
  ].join("\n\n");

  const reply = await callGemini(stream.contents, prompt);
  const schema = parseReturnedSchema(reply);
  const gate = findGateResult(schema);
  if (gate !== "PASS" && gate !== "FAIL") {
    throw new Error("Supervisory return schema must contain gate_result PASS or FAIL.");
  }

  state.machine.supervision.required = false;
  state.machine.supervision.completed = true;
  state.machine.supervision.return_schema_received = true;
  state.machine.supervision.gate_result = gate;
  state.machine.supervision.result = schema;
  state.machine.transition.ready = true;
  state.machine.transition.decision = gate === "PASS" ? "CONTINUE" : "REPEAT";
  state.machine.transition.from_step = step;
  state.machine.transition.to_step = gate === "PASS" ? step + 1 : step;
  state.machine.phase = "TRANSITION";
  persist(wrapper);
}

function applyTransition(wrapper) {
  const state = wrapper.current_state;
  const transition = state.machine.transition;
  if (!transition.ready) throw new Error("Transition phase reached without a ready transition.");

  const from = transition.from_step;
  const to = transition.to_step;

  if (transition.decision === "CONTINUE") {
    if (!state.procedure.completed_steps.includes(from)) {
      state.procedure.completed_steps.push(from);
    }
    state.procedure.current_step = to;
  } else if (transition.decision === "REPEAT") {
    state.procedure.current_step = from;
  } else {
    throw new Error(`Unknown transition decision: ${transition.decision}`);
  }

  resetForExecution(state, state.procedure.current_step);
  persist(wrapper);
}

async function main() {
  if (!apiKey) throw new Error("GEMINI_API_KEY repository secret is missing.");

  const stream = readJson(streamPath);
  if (!Array.isArray(stream.contents)) {
    throw new Error("messages.json must contain a contents array.");
  }
  appendPendingUserMessage(stream);

  const wrapper = readJson(statePath);
  if (!wrapper.current_state) throw new Error("current_state.json must contain current_state.");
  ensureMachineState(wrapper.current_state);

  const phase = wrapper.current_state.machine.phase;
  if (phase === "EXECUTION") {
    await runExecution(wrapper, stream);
  } else if (phase === "SUPERVISION") {
    await runSupervision(wrapper, stream);
  } else if (phase === "TRANSITION") {
    applyTransition(wrapper);
  } else {
    throw new Error(`Unknown machine phase: ${phase}`);
  }

  console.log(`Completed one ${phase} substep; state persisted for the next invocation.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
