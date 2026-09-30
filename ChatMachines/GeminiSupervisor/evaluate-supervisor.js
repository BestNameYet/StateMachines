/**
 * Evaluates or revises the current Gemini Supervisor implementation against
 * Agents.md using a separate evaluator conversation.
 *
 * Trigger:
 *   ChatMachines/GeminiSupervisor/evaluator-nextmessage/nextmessage.json
 * Conversation:
 *   ChatMachines/GeminiSupervisor/evaluator-messages.json
 * Evaluation output:
 *   ChatMachines/GeminiSupervisor/program-evaluation.json
 * Revision output:
 *   ChatMachines/GeminiSupervisor/revised-send-to-gemini.js
 */
const fs = require("node:fs");

const root = "ChatMachines/GeminiSupervisor";
const agentsPath = `${root}/Agents.md`;
const programPath = `${root}/send-to-gemini.js`;
const nextPath = `${root}/evaluator-nextmessage/nextmessage.json`;
const messagesPath = `${root}/evaluator-messages.json`;
const evaluationOutputPath = `${root}/program-evaluation.json`;
const revisionOutputPath = `${root}/revised-send-to-gemini.js`;

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
  const evaluationSchema = {
    response_type: "evaluation",
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
  };

  const revisionSchema = {
    response_type: "revision",
    revision_basis: {
      agents_md: "authoritative",
      prior_evaluator_context: "used",
      current_program: "implementation_being_revised"
    },
    corrections_applied: [
      {
        issue: "string",
        change: "string",
        agents_md_basis: "string"
      }
    ],
    unresolved_requirements: ["string"],
    revised_program: "<complete, non-truncated contents of send-to-gemini.js>"
  };

  return [
    "You are the independent Gemini Supervisor evaluator/reviser.",
    "The latest user message in the evaluator conversation controls whether you evaluate the program or produce a corrected revision.",
    "Agents.md is the authoritative specification. Preserve its actual procedure, return schemas, branches, loops, and supervisory gates. Do not invent substitute control logic.",
    "Use prior evaluator conversation messages as context, including previously identified failures and corrections, but re-check them against the CURRENT Agents.md because Agents.md may have changed since the prior evaluation.",
    "Evaluate or revise what the JavaScript actually does, not what comments claim it does.",
    "For Step 3, honor the current Agents.md requirements for the executor and the supervisor to read evaluation-tests.md and evaluator-definitions.md at the beginning of their respective Step 3 work. Do not inject those documents into unrelated steps unless Agents.md requires it.",
    "Transitions must be driven by the exact semantic-operator return key:value required by Agents.md. Missing required transition keys must follow the repair branch defined by the runtime contract and user instructions.",
    "If the latest user message asks for an evaluation, return only one JSON object matching this evaluation schema:",
    JSON.stringify(evaluationSchema, null, 2),
    "If the latest user message asks for a revised/corrected JavaScript program, return only one JSON object matching this revision schema:",
    JSON.stringify(revisionSchema, null, 2),
    "For a revision request, revised_program MUST contain the entire replacement send-to-gemini.js file. Do not truncate it, use ellipses, omit unchanged sections, or provide a patch. Apply every correction supported by current Agents.md and the prior evaluator findings. If a requirement cannot be implemented from the available repository/runtime context without inventing an unspecified external interface, list it in unresolved_requirements instead of fabricating one.",
    "Use the provided line numbers when citing source evidence in evaluation or correction metadata.",
    "",
    "===== CURRENT AGENTS.MD (AUTHORITATIVE) =====",
    numbered(agents),
    "",
    "===== CURRENT SEND-TO-GEMINI.JS =====",
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
    throw new Error(`Gemini returned no evaluator content: ${JSON.stringify(body)}`);
  }

  const replyText = reply.parts.map(part => part.text || "").join("\n").trim();
  return {
    reply,
    payload: extractJson(replyText)
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

  if (result.payload.response_type === "revision") {
    if (typeof result.payload.revised_program !== "string" || result.payload.revised_program.trim() === "") {
      throw new Error("Revision response did not contain a complete revised_program string.");
    }
    fs.writeFileSync(revisionOutputPath, result.payload.revised_program.endsWith("\n")
      ? result.payload.revised_program
      : result.payload.revised_program + "\n");
    writeJson(evaluationOutputPath, result.payload);
  } else {
    writeJson(evaluationOutputPath, result.payload);
  }

  console.log(JSON.stringify({
    runtime: "Node.js",
    node_version: process.version,
    model,
    trigger: nextPath,
    message_stream: messagesPath,
    evaluated_program: programPath,
    authoritative_specification: agentsPath,
    output: evaluationOutputPath,
    response_type: result.payload.response_type ?? null,
    revision_output: result.payload.response_type === "revision" ? revisionOutputPath : null
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
