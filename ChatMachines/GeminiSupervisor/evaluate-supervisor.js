/**
 * Evaluates the current Gemini Supervisor implementation against Agents.md.
 *
 * Runs directly in GitHub Actions / Node.js 22.
 * This evaluator has its own trigger message and its own conversation stream,
 * separate from the Gemini Supervisor runtime conversation.
 *
 * Trigger:
 *   ChatMachines/GeminiSupervisor/evaluator-nextmessage/nextmessage.json
 * Conversation:
 *   ChatMachines/GeminiSupervisor/evaluator-messages.json
 * Output:
 *   ChatMachines/GeminiSupervisor/program-evaluation.json
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiSupervisor";
const agentsPath = `${root}/Agents.md`;
const programPath = `${root}/send-to-gemini.js`;
const nextPath = `${root}/evaluator-nextmessage/nextmessage.json`;
const messagesPath = `${root}/evaluator-messages.json`;
const outputPath = `${root}/program-evaluation.json`;

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function numbered(text) {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(5, " ")} | ${line}`)
    .join("\n");
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  return JSON.parse(candidate);
}

function appendNextMessage(messages, nextmessage) {
  if (!Array.isArray(messages.contents)) {
    throw new Error("evaluator-messages.json must contain contents[].");
  }
  if (
    !nextmessage ||
    nextmessage.role !== "user" ||
    !Array.isArray(nextmessage.parts) ||
    !nextmessage.parts.some(part => typeof part.text === "string")
  ) {
    throw new Error("evaluator-nextmessage/nextmessage.json must contain a Gemini user content object with text.");
  }

  const last = messages.contents[messages.contents.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(nextmessage)) {
    messages.contents.push(nextmessage);
  }
  return messages;
}

function buildSystemInstruction(agents, program) {
  return [
    "You are evaluating the supplied Gemini Supervisor JavaScript implementation against the supplied Agents.md procedure.",
    "Agents.md is the authoritative specification for this evaluation. Do not replace, normalize, reinterpret, or supplement its requirements with general best practices unless you explicitly label that material as non-authoritative commentary.",
    "Evaluate what the program actually does, not what its comments claim it does.",
    "Inspect control flow, procedure sequencing, semantic-operator inputs, semantic-operator returns, supervisory-gate handoff, transition-key handling, PASS/FAIL branching, restart behavior, missing-key repair behavior, persistence/state updates, conversation/context handling, and termination behavior.",
    "For every material Agents.md requirement relevant to this runtime, identify whether the program implements it. Do not stop after finding the first failure.",
    "Pay particular attention to whether transitions are driven by the exact key:value returned by the semantic operators and whether every step's supervisory PASS/FAIL result correctly determines restart versus advance.",
    "When the required transition key:value is absent, evaluate whether the program correctly echoes the relevant context and the responder's preceding response back to that responder and appends a system instruction identifying the missing key:value and requesting a corrected response.",
    "Use the provided line numbers when citing evidence from either source.",
    "Return only one JSON object with this exact top-level structure:",
    JSON.stringify({
      evaluation_basis: {
        agents_md: "authoritative",
        program: "implementation_under_test"
      },
      overall_result: "PASS | FAIL | INDETERMINATE",
      executive_summary: "string",
      requirement_evaluations: [
        {
          requirement_id: "string",
          agents_md_reference: {
            lines: "string",
            requirement: "string"
          },
          program_reference: {
            lines: "string | null",
            behavior: "string"
          },
          result: "PASS | FAIL | PARTIAL | NOT_APPLICABLE | INDETERMINATE",
          explanation: "string",
          required_change: "string | null"
        }
      ],
      transition_evaluation: {
        exact_transition_key: "string",
        expected_values: ["PASS", "FAIL"],
        execution_to_supervisor_handoff: "PASS | FAIL | PARTIAL | INDETERMINATE",
        missing_key_repair_branch: "PASS | FAIL | PARTIAL | INDETERMINATE",
        fail_restarts_same_execution_step: "PASS | FAIL | PARTIAL | INDETERMINATE",
        pass_advances_procedure: "PASS | FAIL | PARTIAL | INDETERMINATE",
        explanation: "string"
      },
      unauthorized_or_invented_control_logic: [
        {
          program_lines: "string",
          behavior: "string",
          conflict_with_agents_md: "string"
        }
      ],
      omissions: [
        {
          agents_md_lines: "string",
          missing_behavior: "string",
          consequence: "string"
        }
      ],
      recommended_changes: [
        {
          priority: "REQUIRED | OPTIONAL",
          change: "string",
          reason: "string"
        }
      ]
    }, null, 2),
    "",
    "===== AGENTS.MD (AUTHORITATIVE) =====",
    numbered(agents),
    "",
    "===== SEND-TO-GEMINI.JS (IMPLEMENTATION UNDER TEST) =====",
    numbered(program)
  ].join("\n\n");
}

async function callGemini(messages, systemInstruction) {
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
          parts: [{ text: systemInstruction }]
        },
        contents: messages.contents,
        generationConfig: {
          responseMimeType: "application/json"
        }
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
    throw new Error(`Gemini returned no evaluation content: ${JSON.stringify(body)}`);
  }

  const replyText = reply.parts.map(part => part.text || "").join("\n").trim();
  return {
    reply,
    evaluation: extractJson(replyText)
  };
}

async function main() {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the GitHub Actions environment.");
  }

  const agents = readText(agentsPath);
  const program = readText(programPath);
  const messages = appendNextMessage(
    readJson(messagesPath),
    readJson(nextPath).nextmessage
  );

  const result = await callGemini(
    messages,
    buildSystemInstruction(agents, program)
  );

  messages.contents.push(result.reply);
  writeJson(messagesPath, messages);
  writeJson(outputPath, result.evaluation);

  console.log(JSON.stringify({
    runtime: "Node.js",
    node_version: process.version,
    model,
    trigger: nextPath,
    message_stream: messagesPath,
    evaluated_program: programPath,
    authoritative_specification: agentsPath,
    output: outputPath,
    overall_result: result.evaluation.overall_result ?? null
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
