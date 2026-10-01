/**
 * Evaluates or revises the current Gemini Supervisor implementation against
 * Agents.md using a separate evaluator conversation.
 *
 * Agents.md is the canonical source of evaluation definitions and pass/fail
 * criteria. This evaluator must not require evaluator-definitions.md or any
 * evaluation-definition read-tracking field.
 */
const fs = require('node:fs');

const supervisorRoot = 'ChatMachines/GeminiSupervisor';
const evaluationRoot = 'ChatMachines/GeminiEvaluation';
const agentsPath = `${supervisorRoot}/Agents.md`;
const programPath = `${supervisorRoot}/send-to-gemini.js`;
const nextPath = `${evaluationRoot}/evaluator-nextmessage/nextmessage.json`;
const messagesPath = `${evaluationRoot}/evaluator-messages.json`;
const evaluationOutputPath = `${evaluationRoot}/program-evaluation.json`;
const revisionAgentsOutputPath = `${evaluationRoot}/revised-Agents.md`;
const revisionProgramOutputPath = `${evaluationRoot}/revised-send-to-gemini.js`;

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const readText = path => fs.readFileSync(path, 'utf8');
const readJson = path => JSON.parse(readText(path));

function writeJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function numbered(text) {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(5, ' ')} | ${line}`)
    .join('\n');
}

function extractJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (directError) {
    const outerFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!outerFence) throw directError;
    return JSON.parse(outerFence[1].trim());
  }
}

function normalizeTextFile(text) {
  return text.trimEnd() + '\n';
}

function normalizeRevisedProgram(program) {
  const trimmed = program.trim();
  const fenced = trimmed.match(/^```(?:javascript|js)?\s*([\s\S]*?)\s*```$/i);
  return normalizeTextFile(fenced ? fenced[1] : program);
}

function normalizeRevisedAgents(agents) {
  const trimmed = agents.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return normalizeTextFile(fenced ? fenced[1] : agents);
}

function appendNextMessage(messages, nextmessage) {
  if (!Array.isArray(messages.contents)) throw new Error('evaluator-messages.json must contain contents[].');
  if (!nextmessage || nextmessage.role !== 'user' || !Array.isArray(nextmessage.parts) || !nextmessage.parts.some(part => typeof part.text === 'string')) {
    throw new Error('evaluator-nextmessage/nextmessage.json must contain a Gemini user content object with text.');
  }
  const last = messages.contents[messages.contents.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(nextmessage)) messages.contents.push(nextmessage);
  return messages;
}

function buildSystemInstruction(agents, program) {
  const evaluationSchema = {
    response_type: 'evaluation',
    evaluation_basis: {
      agents_md: 'authoritative',
      program: 'implementation_under_test'
    },
    overall_result: 'PASS | FAIL | INDETERMINATE',
    executive_summary: 'string',
    requirement_evaluations: [
      {
        requirement_id: 'string',
        agents_md_reference: { lines: 'string', requirement: 'string' },
        program_reference: { lines: 'string | null', behavior: 'string' },
        result: 'PASS | FAIL | PARTIAL | NOT_APPLICABLE | INDETERMINATE',
        explanation: 'string',
        required_change: 'string | null'
      }
    ],
    transition_evaluation: {
      exact_transition_key: 'string',
      expected_values: ['PASS', 'FAIL'],
      execution_to_supervisor_handoff: 'PASS | FAIL | PARTIAL | INDETERMINATE',
      missing_key_repair_branch: 'PASS | FAIL | PARTIAL | INDETERMINATE',
      fail_restarts_same_execution_step: 'PASS | FAIL | PARTIAL | INDETERMINATE',
      pass_advances_procedure: 'PASS | FAIL | PARTIAL | INDETERMINATE',
      explanation: 'string'
    },
    unauthorized_or_invented_control_logic: [
      { program_lines: 'string', behavior: 'string', conflict_with_agents_md: 'string' }
    ],
    omissions: [
      { agents_md_lines: 'string', missing_behavior: 'string', consequence: 'string' }
    ],
    recommended_changes: [
      { priority: 'REQUIRED | OPTIONAL', change: 'string', reason: 'string' }
    ]
  };

  const pairedRevisionSchema = {
    response_type: 'paired_revision',
    revision_basis: {
      agents_md: 'specification_being_revised',
      prior_evaluator_context: 'used',
      current_program: 'implementation_being_revised'
    },
    corrections_applied: [
      {
        issue: 'string',
        agents_change: 'string',
        program_change: 'string',
        rationale: 'string'
      }
    ],
    unresolved_requirements: ['string'],
    revised_agents_md: '<complete, non-truncated contents of Agents.md>',
    revised_program: '<complete, non-truncated contents of send-to-gemini.js>'
  };

  return [
    'You are the independent Gemini Supervisor evaluator/reviser.',
    'Agents.md is the authoritative and self-contained source for procedure rules, evaluation definitions, and pass/fail criteria.',
    'Do not require evaluator-definitions.md. Do not require, invent, or restore evaluation_documents_read or any equivalent field whose purpose is tracking evaluation-definition reads.',
    'The latest user message in the evaluator conversation controls whether you evaluate or produce a paired revision.',
    'When revising gating semantics, revise Agents.md and send-to-gemini.js together so the specification and runtime are mutually consistent. Do not revise only one side when the latest request requires a paired correction.',
    'Use prior evaluator conversation messages as historical context, but re-check them against the CURRENT Agents.md and CURRENT send-to-gemini.js. Historical requirements superseded by the current canonical contract must not be reintroduced.',
    'Evaluate or revise what the JavaScript actually does, not what comments claim it does.',
    'Preserve the intended procedure, per-step return schemas, branches, loops, supervisory gates, run isolation, persistence, and user-request semantics. Do not invent substitute control logic.',
    'The per-step return schema is the central communication/control surface for that step. A step does not communicate completion, advancement, or a valid execution result outside its required return schema.',
    'return_schema_completed refers only to completion of the governing step return schema, never completion of the whole multi-step procedure.',
    'For Step 3, ChatMachines/GeminiEvaluation/evaluation-tests.md may be supplied as the Step3_TSR test corpus. Evaluation definitions and pass/fail criteria are read from Agents.md itself, not an external evaluator-definitions.md file.',
    'Transitions are driven by supervisory_gate.gate_result. FAIL repeats the same execution step; PASS advances exactly one step after persistence/checkpoint; missing or malformed supervisory transition data is repaired only on the supervisory side.',
    'If the latest user message asks for an evaluation, return only one JSON object matching this evaluation schema:',
    JSON.stringify(evaluationSchema, null, 2),
    'If the latest user message asks to revise Agents.md and source code together, return only one JSON object matching this paired revision schema:',
    JSON.stringify(pairedRevisionSchema, null, 2),
    'For a paired revision, revised_agents_md MUST contain the entire replacement Agents.md and revised_program MUST contain the entire replacement send-to-gemini.js. Do not truncate, use ellipses, omit unchanged sections, or provide patches.',
    'Apply every correction required to make the specification and runtime mutually consistent. If anything remains impossible without inventing an unspecified external interface, list it in unresolved_requirements.',
    'Use the provided line numbers when citing source evidence in evaluation/correction metadata.',
    '',
    '===== CURRENT AGENTS.MD =====',
    numbered(agents),
    '',
    '===== CURRENT SEND-TO-GEMINI.JS =====',
    numbered(program)
  ].join('\n\n');
}

async function callGemini(messages, systemInstruction) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: messages.contents,
        generationConfig: { responseMimeType: 'application/json' }
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
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);

  const reply = body.candidates?.[0]?.content;
  if (reply?.role !== 'model' || !Array.isArray(reply.parts) || reply.parts.length === 0) {
    throw new Error(`Gemini returned no evaluator content: ${JSON.stringify(body)}`);
  }

  const replyText = reply.parts.map(part => part.text || '').join('\n').trim();
  return { reply, payload: extractJson(replyText) };
}

async function main() {
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing from the GitHub Actions environment.');

  const agents = readText(agentsPath);
  const program = readText(programPath);
  const messages = appendNextMessage(readJson(messagesPath), readJson(nextPath).nextmessage);
  const result = await callGemini(messages, buildSystemInstruction(agents, program));

  messages.contents.push(result.reply);
  writeJson(messagesPath, messages);

  if (result.payload.response_type === 'paired_revision') {
    if (typeof result.payload.revised_agents_md !== 'string' || result.payload.revised_agents_md.trim() === '') {
      throw new Error('Paired revision did not contain complete revised_agents_md.');
    }
    if (typeof result.payload.revised_program !== 'string' || result.payload.revised_program.trim() === '') {
      throw new Error('Paired revision did not contain complete revised_program.');
    }
    fs.writeFileSync(revisionAgentsOutputPath, normalizeRevisedAgents(result.payload.revised_agents_md));
    fs.writeFileSync(revisionProgramOutputPath, normalizeRevisedProgram(result.payload.revised_program));
  }

  writeJson(evaluationOutputPath, result.payload);

  console.log(JSON.stringify({
    runtime: 'Node.js',
    node_version: process.version,
    model,
    trigger: nextPath,
    message_stream: messagesPath,
    evaluated_program: programPath,
    specification: agentsPath,
    output: evaluationOutputPath,
    response_type: result.payload.response_type ?? null,
    revision_agents_output: result.payload.response_type === 'paired_revision' ? revisionAgentsOutputPath : null,
    revision_program_output: result.payload.response_type === 'paired_revision' ? revisionProgramOutputPath : null
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
