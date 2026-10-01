/**
 * Config-driven evaluator runtime. In generic mode it loads arbitrary labeled
 * inputs, an evaluation heuristic, and an output schema from config.json.
 * Supervisor-specific Agents/source evaluation remains available in non-generic mode.
 */
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const runtimeRoot = path.resolve(__dirname, config.runtime_root || '.');
const evaluationRoot = runtimeRoot;
const isGenericMode = config.evaluation_mode === 'generic';

function optionalPath(base, configuredPath) {
  return typeof configuredPath === 'string' && configuredPath.trim() ? path.resolve(base, configuredPath) : null;
}

const supervisorRoot = !isGenericMode ? optionalPath(evaluationRoot, config.supervisor_root) : null;
const agentsPath = !isGenericMode && supervisorRoot ? optionalPath(supervisorRoot, config.agents_file) : null;
const programPath = !isGenericMode && supervisorRoot ? optionalPath(supervisorRoot, config.program_file) : null;
const step3EvaluationPath = !isGenericMode && supervisorRoot ? optionalPath(supervisorRoot, config.artifact_target_file) : null;
const nextPath = path.join(evaluationRoot, config.new_message_folder, config.new_message_file);
const supervisorMessagesPath = path.join(evaluationRoot, config.messages_file);
const genericMessagesPath = optionalPath(evaluationRoot, config.generic_messages_file);
const messagesPath = isGenericMode ? (genericMessagesPath || supervisorMessagesPath) : supervisorMessagesPath;
const evaluationOutputPath = path.join(evaluationRoot, config.evaluation_output_file);
const revisionDeliverablesOutputPath = optionalPath(evaluationRoot, config.revision_deliverables_output_path);
const revisionAgentsOutputPath = revisionDeliverablesOutputPath ? optionalPath(revisionDeliverablesOutputPath, config.revision_agents_output_file) : null;
const revisionProgramOutputPath = revisionDeliverablesOutputPath ? optionalPath(revisionDeliverablesOutputPath, config.revision_program_output_file) : null;
const sourceRevisionEnabled = !isGenericMode && config.source_revision_enabled === true;
const sourceRevisionConfigOutputPath = !isGenericMode ? optionalPath(evaluationRoot, config.source_revision_config_output_path) : null;
const artifactRevisionEnabled = !isGenericMode && config.artifact_revision_enabled === true;
const artifactRevisionOutputPath = !isGenericMode ? optionalPath(evaluationRoot, config.artifact_revision_output_path) : null;
const artifactRevisionPreservePointers = Array.isArray(config.artifact_revision_preserve_json_pointers)
  ? config.artifact_revision_preserve_json_pointers
  : [];

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || config.default_model;
const requestTimeoutMs = Number(config.request_timeout_ms || 180000);

const readText = filePath => fs.readFileSync(filePath, 'utf8');
const readJson = filePath => JSON.parse(readText(filePath));

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, value) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
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
  if (!Array.isArray(messages.contents)) {
    throw new Error('evaluator-messages.json must contain contents[].');
  }
  if (
    !nextmessage ||
    nextmessage.role !== 'user' ||
    !Array.isArray(nextmessage.parts) ||
    !nextmessage.parts.some(part => typeof part.text === 'string')
  ) {
    throw new Error('The configured next-message file must contain a Gemini user content object with text.');
  }
  const last = messages.contents[messages.contents.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(nextmessage)) messages.contents.push(nextmessage);
  return messages;
}

function loadGenericInputs() {
  const descriptors = Array.isArray(config.generic_inputs) ? config.generic_inputs : [];
  return descriptors.map((input, index) => {
    if (!input || typeof input !== 'object') {
      throw new Error(`generic_inputs[${index}] must be an object.`);
    }
    const key = typeof input.key === 'string' && input.key.trim() ? input.key.trim() : `input_${index + 1}`;
    const type = input.type || 'file';
    if (type === 'literal') {
      return { key, type, source: 'config.literal', content: String(input.value ?? '') };
    }
    if (type === 'file') {
      if (typeof input.path !== 'string' || input.path.trim() === '') {
        throw new Error(`generic_inputs[${index}] file input requires path.`);
      }
      const absolutePath = path.resolve(evaluationRoot, input.path);
      return { key, type, source: absolutePath, content: readText(absolutePath) };
    }
    throw new Error(`Unsupported generic input type: ${type}`);
  });
}

function buildGenericEvaluationInstruction(genericInputs) {
  if (typeof config.evaluation_heuristic !== 'string' || config.evaluation_heuristic.trim() === '') {
    throw new Error('Generic evaluation requires non-empty config.evaluation_heuristic.');
  }

  if (!config.evaluation_output_schema || Array.isArray(config.evaluation_output_schema) || typeof config.evaluation_output_schema !== 'object') {
    throw new Error('Generic evaluation requires config.evaluation_output_schema object.');
  }

  const sections = [
    'You are an independent generic evaluator. The runtime supplies labeled inputs without assigning semantics to them.',
    'The evaluation heuristic is supplied by config and is authoritative for how the inputs are interpreted.',
    'Use only the supplied inputs and the configured heuristic. Do not silently import assumptions from the normal GeminiSupervisor Agents/source evaluation mode.',
    'Return one JSON object matching this schema:',
    JSON.stringify(config.evaluation_output_schema, null, 2),
    'Configured evaluation heuristic:',
    config.evaluation_heuristic,
    'Configured inputs:'
  ];

  for (const input of genericInputs) {
    sections.push(`===== INPUT: ${input.key} | source: ${input.source} =====`, input.content);
  }

  return sections.join('\n\n');
}

function decodePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function valueAtJsonPointer(value, pointer) {
  if (pointer === '') return value;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw new Error(`Invalid JSON pointer: ${pointer}`);
  }
  return pointer
    .slice(1)
    .split('/')
    .map(decodePointerToken)
    .reduce((current, token) => {
      if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(Object(current), token)) {
        throw new Error(`JSON pointer does not resolve: ${pointer}`);
      }
      return current[token];
    }, value);
}

function assertPreservedPointers(original, revised) {
  for (const pointer of artifactRevisionPreservePointers) {
    const before = valueAtJsonPointer(original, pointer);
    const after = valueAtJsonPointer(revised, pointer);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`Artifact revision changed preserved JSON pointer ${pointer}.`);
    }
  }
}

function buildSystemInstruction(agents, program, step3Evaluation) {
  const evaluationSchema = {
    response_type: 'evaluation',
    evaluation_basis: {
      agents_md: 'authoritative',
      program: 'implementation_under_test',
      step3_evaluation: 'merged_heuristic_and_question_corpus'
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
      current_program: 'implementation_being_revised',
      source_config: 'shared_external_reference_configuration',
      step3_evaluation: 'merged_heuristic_and_question_corpus'
    },
    corrections_applied: [
      {
        issue: 'string',
        agents_change: 'string',
        program_change: 'string',
        source_config_change: 'string',
        rationale: 'string'
      }
    ],
    unresolved_requirements: ['string'],
    revised_agents_md: '<complete, non-truncated contents of Agents.md>',
    revised_program: '<complete, non-truncated contents of send-to-gemini.js>',
    revised_source_config: '<complete JSON object for ChatMachines/GeminiSupervisor/config.json>'
  };

  const artifactRevisionSchema = {
    response_type: 'artifact_revision',
    revision_basis: {
      target_file: config.artifact_target_file,
      output_path: config.artifact_revision_output_path,
      preserve_json_pointers: artifactRevisionPreservePointers
    },
    corrections_applied: [
      {
        issue: 'string',
        change: 'string',
        rationale: 'string'
      }
    ],
    unresolved_requirements: ['string'],
    revised_artifact: '<complete, non-truncated JSON value for the configured artifact>'
  };

  const sections = [
    'You are the independent Gemini Supervisor evaluator/reviser.',
    'Agents.md is the authoritative and self-contained source for procedure rules, evaluation definitions, and pass/fail criteria.',
    'The merged Step 3 evaluation JSON supplied below is the single Step3_TSR evaluation source. Use its evaluation_heuristic object as the U/P or expectation-vs-outcome evaluation method and use step3_tsr.tests as the complete Step 3 question corpus.',
    'Do not require evaluator-definitions.md or evaluation-tests.md. Do not require, invent, or restore evaluation_documents_read or any equivalent field whose purpose is tracking evaluation-definition reads.',
    'The latest user message in the evaluator conversation controls whether you evaluate, produce a paired revision, or revise the configured artifact.',
    'Agents.md and send-to-gemini.js are a paired specification/runtime surface. When the latest request changes their shared behavior or dependencies, revise both together in one paired_revision response.',
    'When a paired revision introduces or changes references to files outside Agents.md and send-to-gemini.js, create one shared Supervisor source config and make both revised files point to that same config/key rather than independently hardcoding divergent external paths.',
    'Use prior evaluator conversation messages as historical context, but re-check them against CURRENT configured inputs. Historical requirements superseded by the current canonical contract must not be reintroduced.',
    'Evaluate or revise actual content, not comments about content.',
    'Preserve the intended procedure, per-step return schemas, branches, loops, supervisory gates, run isolation, persistence, and user-request semantics. Do not invent substitute control logic.',
    'The per-step return schema is the central communication/control surface for that step. A step does not communicate completion, advancement, or a valid execution result outside its required return schema.',
    'return_schema_completed refers only to completion of the governing step return schema, never completion of the whole multi-step procedure.',
    'Transitions are driven by supervisory_gate.gate_result. FAIL repeats the same execution step; PASS advances exactly one step after persistence/checkpoint; missing or malformed supervisory transition data is repaired only on the supervisory side.',
    'If the latest user message asks for an evaluation, return only one JSON object matching this evaluation schema:',
    JSON.stringify(evaluationSchema, null, 2),
    'If the latest user message asks to revise Agents.md and source code together, return only one JSON object matching this paired revision schema:',
    JSON.stringify(pairedRevisionSchema, null, 2),
    'For a paired revision, revised_agents_md MUST contain the entire replacement Agents.md, revised_program MUST contain the entire replacement send-to-gemini.js, and revised_source_config MUST contain the complete shared Supervisor config JSON object. Do not truncate, use ellipses, omit unchanged sections, or provide patches.',
    'For a paired revision, Agents.md and send-to-gemini.js must agree on the shared config contract. Any external file dependency represented in that config must use the same config key and resolved path semantics in both revised files.'
  ];

  if (artifactRevisionEnabled) {
    sections.push(
      `Artifact revision is enabled. The source artifact is ${step3EvaluationPath}.`,
      `Write the revised file deliverable to the configured output path ${artifactRevisionOutputPath}.`,
      `These JSON pointers are immutable and must be reproduced exactly: ${JSON.stringify(artifactRevisionPreservePointers)}.`,
      'If the latest user message asks to revise the configured artifact, return only one JSON object matching this artifact revision schema:',
      JSON.stringify(artifactRevisionSchema, null, 2),
      'For artifact_revision, revised_artifact MUST contain the entire revised JSON artifact. Do not return a patch, Markdown fence, ellipsis, omitted unchanged content, or commentary outside the JSON object.'
    );
  }

  sections.push(
    'Apply every correction required by the latest user message. If anything remains impossible without inventing an unspecified external interface, list it in unresolved_requirements.',
    'Use the provided line numbers when citing source evidence in evaluation/correction metadata.',
    '',
    '===== CURRENT AGENTS.MD =====',
    numbered(agents),
    '',
    '===== CURRENT SEND-TO-GEMINI.JS =====',
    numbered(program),
    '',
    '===== MERGED STEP 3 EVALUATION JSON =====',
    JSON.stringify(step3Evaluation, null, 2)
  );

  return sections.join('\n\n');
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
      signal: AbortSignal.timeout(requestTimeoutMs)
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
  if (reply?.role !== 'model' || !Array.isArray(reply.parts) || reply.parts.length === 0) {
    throw new Error(`Gemini returned no evaluator content: ${JSON.stringify(body)}`);
  }

  const replyText = reply.parts.map(part => part.text || '').join('\n').trim();
  return { reply, payload: extractJson(replyText) };
}

async function main() {
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing from the GitHub Actions environment.');

  const useGenericEvaluation = isGenericMode;
  const nextMessage = readJson(nextPath).nextmessage;
  const reuseGenericHistory = config.generic_reuse_message_history === true;
  const initialMessages = useGenericEvaluation && !reuseGenericHistory
    ? { contents: [] }
    : (fs.existsSync(messagesPath) ? readJson(messagesPath) : { contents: [] });
  const messages = appendNextMessage(initialMessages, nextMessage);
  let agents = null;
  let program = null;
  let step3Evaluation = null;
  let genericInputs = [];
  let systemInstruction;

  if (useGenericEvaluation) {
    genericInputs = loadGenericInputs();
    systemInstruction = buildGenericEvaluationInstruction(genericInputs);
  } else {
    agents = readText(agentsPath);
    program = readText(programPath);
    step3Evaluation = readJson(step3EvaluationPath);
    systemInstruction = buildSystemInstruction(agents, program, step3Evaluation);
  }

  const result = await callGemini(messages, systemInstruction);

  if (useGenericEvaluation) {
    const expectedResponseType = config.evaluation_output_schema?.response_type;
    if (typeof expectedResponseType === 'string' && expectedResponseType && result.payload.response_type !== expectedResponseType) {
      throw new Error(`Generic evaluator returned response_type ${result.payload.response_type ?? 'missing'}; expected ${expectedResponseType}.`);
    }
  }

  messages.contents.push(result.reply);
  writeJson(messagesPath, messages);

  if (!useGenericEvaluation && result.payload.response_type === 'paired_revision') {
    if (!sourceRevisionEnabled) {
      throw new Error('Paired revision response received while source_revision_enabled is false.');
    }
    if (typeof result.payload.revised_agents_md !== 'string' || result.payload.revised_agents_md.trim() === '') {
      throw new Error('Paired revision did not contain complete revised_agents_md.');
    }
    if (typeof result.payload.revised_program !== 'string' || result.payload.revised_program.trim() === '') {
      throw new Error('Paired revision did not contain complete revised_program.');
    }
    if (!Object.prototype.hasOwnProperty.call(result.payload, 'revised_source_config')) {
      throw new Error('Paired revision did not contain complete revised_source_config.');
    }
    const revisedSourceConfig = typeof result.payload.revised_source_config === 'string'
      ? extractJson(result.payload.revised_source_config)
      : result.payload.revised_source_config;
    if (!revisedSourceConfig || Array.isArray(revisedSourceConfig) || typeof revisedSourceConfig !== 'object') {
      throw new Error('revised_source_config must be a JSON object.');
    }
    fs.mkdirSync(revisionDeliverablesOutputPath, { recursive: true });
    fs.writeFileSync(revisionAgentsOutputPath, normalizeRevisedAgents(result.payload.revised_agents_md));
    fs.writeFileSync(revisionProgramOutputPath, normalizeRevisedProgram(result.payload.revised_program));
    writeJson(sourceRevisionConfigOutputPath, revisedSourceConfig);
  }

  if (!useGenericEvaluation && result.payload.response_type === 'artifact_revision') {
    if (!artifactRevisionEnabled) {
      throw new Error('Artifact revision response received while artifact_revision_enabled is false.');
    }
    if (!Object.prototype.hasOwnProperty.call(result.payload, 'revised_artifact')) {
      throw new Error('Artifact revision did not contain complete revised_artifact.');
    }
    const revisedArtifact = typeof result.payload.revised_artifact === 'string'
      ? extractJson(result.payload.revised_artifact)
      : result.payload.revised_artifact;
    assertPreservedPointers(step3Evaluation, revisedArtifact);
    writeJson(artifactRevisionOutputPath, revisedArtifact);
  }

  writeJson(evaluationOutputPath, result.payload);

  console.log(JSON.stringify({
    runtime: 'Node.js',
    node_version: process.version,
    config: configPath,
    runtime_root: runtimeRoot,
    model,
    trigger: nextPath,
    message_stream: messagesPath,
    evaluated_program: useGenericEvaluation ? null : programPath,
    specification: useGenericEvaluation ? null : agentsPath,
    evaluation_mode: config.evaluation_mode || 'supervisor',
    generic_inputs: genericInputs.map(input => ({ key: input.key, source: input.source })),
    evaluation_heuristic_configured: typeof config.evaluation_heuristic === 'string' && config.evaluation_heuristic.trim() !== '',
    step3_evaluation: useGenericEvaluation ? null : step3EvaluationPath,
    output: evaluationOutputPath,
    revision_deliverables_output_path: revisionDeliverablesOutputPath,
    response_type: result.payload.response_type ?? null,
    revision_agents_output: result.payload.response_type === 'paired_revision' ? revisionAgentsOutputPath : null,
    revision_program_output: result.payload.response_type === 'paired_revision' ? revisionProgramOutputPath : null,
    revision_source_config_output: result.payload.response_type === 'paired_revision' ? sourceRevisionConfigOutputPath : null,
    artifact_revision_output: result.payload.response_type === 'artifact_revision' ? artifactRevisionOutputPath : null
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
