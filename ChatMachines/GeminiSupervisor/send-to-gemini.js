/**
 * Gemini Supervisor transport runner.
 *
 * GitHub does only transport work:
 * 1. Read source program and its required inputs.
 * 2. Append nextmessage to messages.
 * 3. POST { sourcecode, arguments } to Code.gs.
 * 4. Persist the returned state/messages.
 *
 * Supervisor execution and Gemini calls occur inside Apps Script.
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiSupervisor";
const messagesPath = `${root}/messages.json`;
const nextPath = `${root}/nextmessage/nextmessage.json`;
const statePath = `${root}/current_state.json`;
const agentsPath = `${root}/Agents.md`;
const testsPath = `${root}/evaluation-tests.md`;
const definitionsPath = `${root}/evaluator-definitions.md`;
const webAppUrl = process.env.APPS_SCRIPT_WEB_APP_URL;

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function writeJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function appendNextMessage(messages, nextmessage) {
  if (!Array.isArray(messages.contents)) throw new Error("messages.json must contain contents[].");
  if (!nextmessage || nextmessage.role !== "user" || !Array.isArray(nextmessage.parts)) {
    throw new Error("nextmessage.json.nextmessage must be a Gemini user content object.");
  }
  const last = messages.contents[messages.contents.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(nextmessage)) messages.contents.push(nextmessage);
  return messages;
}

/* Serialized verbatim and executed by Code.gs with one arguments object. */
function supervisorMachine(input) {
  const state = input.state;
  const messages = input.messages;
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  const model = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || "gemini-3.8-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing from Apps Script properties.");

  state.procedure = state.procedure || {};
  if (!Number.isInteger(state.procedure.current_step)) state.procedure.current_step = 0;
  state.procedure.completed_steps = state.procedure.completed_steps || [];

  if (!state.machine) {
    state.machine = {
      phase: "EXECUTION",
      iteration: 0,
      execution: { step: state.procedure.current_step, started: false, completed: false, return_schema_received: false, result: null },
      supervision: { step: state.procedure.current_step, required: false, started: false, completed: false, return_schema_received: false, gate_result: null, result: null },
      transition: { ready: false, decision: null, from_step: state.procedure.current_step, to_step: null }
    };
  }

  function reset(step) {
    state.machine.phase = "EXECUTION";
    state.machine.execution = { step: step, started: false, completed: false, return_schema_received: false, result: null };
    state.machine.supervision = { step: step, required: false, started: false, completed: false, return_schema_received: false, gate_result: null, result: null };
    state.machine.transition = { ready: false, decision: null, from_step: step, to_step: null };
  }

  function replyText(reply) {
    return reply.parts.map(function (part) { return part.text || ""; }).join("\n").trim();
  }

  function parseSchema(reply) {
    const text = replyText(reply);
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(fenced ? fenced[1].trim() : text);
  }

  function findGate(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.gate_result === "string") return value.gate_result.toUpperCase();
    if (value.gate_result && typeof value.gate_result === "object") {
      const direct = value.gate_result.value || value.gate_result.result || value.gate_result.evaluation;
      if (typeof direct === "string") return direct.toUpperCase();
    }
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      const result = findGate(value[keys[i]]);
      if (result) return result;
    }
    return null;
  }

  function callGemini(prompt) {
    const contents = messages.contents.slice();
    contents.push({ role: "user", parts: [{ text: prompt }] });
    const response = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      {
        method: "post",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey },
        payload: JSON.stringify({
          system_instruction: { parts: [{ text: input.system_instruction }] },
          contents: contents
        }),
        muteHttpExceptions: true
      }
    );
    const status = response.getResponseCode();
    const body = JSON.parse(response.getContentText());
    if (status < 200 || status >= 300) throw new Error("Gemini HTTP " + status + ": " + JSON.stringify(body.error || body));
    const reply = body.candidates && body.candidates[0] && body.candidates[0].content;
    if (!reply || reply.role !== "model" || !Array.isArray(reply.parts)) throw new Error("Gemini returned no model content.");
    return reply;
  }

  const step = state.procedure.current_step;
  const phase = state.machine.phase;

  if (phase === "EXECUTION") {
    state.machine.execution.started = true;
    state.machine.execution.step = step;
    const reply = callGemini([
      "Perform exactly Step " + step + " from Agents.md.",
      "Do not perform the supervisory gate and do not begin the next step.",
      "Return only the complete execution return schema required by that step as valid JSON.",
      "Current persisted state:", JSON.stringify(state, null, 2)
    ].join("\n\n"));
    state.machine.execution.result = parseSchema(reply);
    state.machine.execution.return_schema_received = true;
    state.machine.execution.completed = true;
    state.machine.supervision.required = true;
    state.machine.phase = "SUPERVISION";
    state.machine.iteration += 1;
  } else if (phase === "SUPERVISION") {
    state.machine.supervision.started = true;
    state.machine.supervision.step = step;
    const reply = callGemini([
      "Perform only the Supervisory Gate for Step " + step + " from Agents.md.",
      "Evaluate the execution return schema entry by entry at matching schema paths and perform the step-level evaluation.",
      "Return only the complete supervisory return schema as valid JSON, including gate_result PASS or FAIL.",
      "Execution return schema:", JSON.stringify(state.machine.execution.result, null, 2),
      "Current persisted state:", JSON.stringify(state, null, 2)
    ].join("\n\n"));
    const schema = parseSchema(reply);
    const gate = findGate(schema);
    if (gate !== "PASS" && gate !== "FAIL") throw new Error("Supervisory schema must contain gate_result PASS or FAIL.");
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
  } else if (phase === "TRANSITION") {
    const transition = state.machine.transition;
    if (!transition.ready) throw new Error("Transition is not ready.");
    if (transition.decision === "CONTINUE") {
      if (state.procedure.completed_steps.indexOf(step) === -1) state.procedure.completed_steps.push(step);
      state.procedure.current_step = transition.to_step;
    } else if (transition.decision === "REPEAT") {
      state.procedure.current_step = step;
    } else {
      throw new Error("Unknown transition decision: " + transition.decision);
    }
    reset(state.procedure.current_step);
  } else {
    throw new Error("Unknown machine phase: " + phase);
  }

  state.updated_at = new Date().toISOString();
  return { state: state, messages: messages, completed_substep: phase };
}

async function main() {
  if (!webAppUrl) throw new Error("APPS_SCRIPT_WEB_APP_URL is missing.");

  const messages = appendNextMessage(readJson(messagesPath), readJson(nextPath).nextmessage);
  const stateWrapper = readJson(statePath);
  if (!stateWrapper.current_state) throw new Error("current_state.json must contain current_state.");

  const payload = {
    sourcecode: `(${supervisorMachine.toString()})`,
    arguments: {
      state: stateWrapper.current_state,
      messages: messages,
      system_instruction: [readText(testsPath), readText(definitionsPath), readText(agentsPath)].join("\n\n")
    }
  };

  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
    signal: AbortSignal.timeout(180000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}: ${text}`);

  let result;
  try { result = JSON.parse(text); }
  catch (_) { throw new Error(`Apps Script returned non-JSON: ${text}`); }
  if (!result || !result.state || !result.messages) throw new Error("Apps Script result must contain state and messages.");

  writeJson(statePath, { current_state: result.state });
  writeJson(messagesPath, result.messages);
  console.log(`Completed ${result.completed_substep}; returned state persisted.`);
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
