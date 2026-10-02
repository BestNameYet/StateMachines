const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const evaluationRoot = path.resolve(__dirname);
const triggerPath = path.join(evaluationRoot, 'historical-audit-nextmessage', 'nextmessage.json');
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const requestTimeoutMs = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 180000);
const packetRoot = path.resolve(process.env.HISTORICAL_AUDIT_PACKET_ROOT || path.join(evaluationRoot, '.historical-audit-packet'));
const manifestPath = path.resolve(process.env.HISTORICAL_AUDIT_MANIFEST || path.join(packetRoot, 'archive-manifest.json'));
const computeTimeoutMs = Number(process.env.HISTORICAL_AUDIT_COMPUTE_TIMEOUT_MS || 2000);
const maxComputeRounds = Number(process.env.HISTORICAL_AUDIT_MAX_COMPUTE_ROUNDS || 8);
const maxComputeCodeBytes = Number(process.env.HISTORICAL_AUDIT_MAX_COMPUTE_CODE_BYTES || 200000);
const maxComputeResultBytes = Number(process.env.HISTORICAL_AUDIT_MAX_COMPUTE_RESULT_BYTES || 1000000);

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function readJson(p) {
  return JSON.parse(readText(p));
}

function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch (directError) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!fenced) throw directError;
    return JSON.parse(fenced[1].trim());
  }
}

async function callGeminiRaw({ system, contents }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents
      }),
      signal: AbortSignal.timeout(requestTimeoutMs)
    }
  );

  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    throw new Error(`Gemini returned non-JSON HTTP ${response.status}: ${raw}`);
  }
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  const reply = body.candidates?.[0]?.content;
  if (reply?.role !== 'model' || !Array.isArray(reply.parts) || !reply.parts.length) {
    throw new Error(`Gemini returned no evaluator content: ${JSON.stringify(body)}`);
  }
  const text = reply.parts.map(part => part.text || '').join('\n').trim();
  return { reply, text, payload: extractJson(text) };
}

function jsonSafe(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return null;
  return JSON.parse(serialized);
}

function executeModelComputation({ code, context }) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('Computation request requires non-empty JavaScript code.');
  if (Buffer.byteLength(code, 'utf8') > maxComputeCodeBytes) {
    throw new Error(`Computation code exceeds ${maxComputeCodeBytes} bytes.`);
  }

  // Only a serialized copy of the evaluator's already-assigned context crosses into
  // the VM. process, require, fetch, filesystem objects, credentials, repository
  // handles, timers, and host functions are not exposed. String/wasm code generation
  // is disabled inside the context to block constructor/eval-style escapes.
  const sandbox = Object.create(null);
  sandbox.__context_json = JSON.stringify(jsonSafe(context));
  const contextified = vm.createContext(sandbox, {
    name: 'historical-audit-model-compute',
    codeGeneration: { strings: false, wasm: false }
  });

  const source = [
    "'use strict';",
    '(function () {',
    '  const context = JSON.parse(__context_json);',
    code,
    '})()'
  ].join('\n');

  const script = new vm.Script(source, {
    filename: 'model-computation.js',
    displayErrors: true
  });
  const value = script.runInContext(contextified, { timeout: computeTimeoutMs, displayErrors: true });
  const safeValue = jsonSafe(value);
  const resultText = JSON.stringify(safeValue);
  if (Buffer.byteLength(resultText, 'utf8') > maxComputeResultBytes) {
    throw new Error(`Computation result exceeds ${maxComputeResultBytes} bytes.`);
  }
  return safeValue;
}

async function callGeminiWithCompute({ system, user, responseType, computationContext, computationLog }) {
  const computeProtocol = [
    'MODEL-DIRECTED COMPUTATION IS AVAILABLE.',
    'At any point before your final answer, you may request arbitrary synchronous JavaScript computation over exactly the context assigned to this evaluator call.',
    'To compute, return ONLY JSON in this form:',
    JSON.stringify({
      response_type: 'historical_audit_compute_request',
      computation_id: 'string',
      purpose: 'string',
      code: 'JavaScript function body. Read the assigned data from variable context and RETURN a JSON-serializable value.'
    }, null, 2),
    'The runtime will execute your JavaScript and return the JSON result to you, after which you may request another computation or return the required final response_type.',
    'You choose the algorithm, data transformations, searches, grouping, joins, reductions, graph operations, comparisons, parsing, scoring, or other computation. There is no predefined helper-function menu.',
    'The computation receives no information beyond the context already assigned to this evaluator call.',
    'Computation is synchronous. Use return to return the result. Do not rely on process, require, fetch, filesystem, network, environment variables, timers, or dynamic code generation; they are intentionally unavailable.',
    `You may request at most ${maxComputeRounds} computation rounds in this evaluator call.`
  ].join('\n\n');

  const contents = [{ role: 'user', parts: [{ text: user }] }];
  const fullSystem = `${system}\n\n${computeProtocol}`;
  let rounds = 0;

  while (true) {
    const response = await callGeminiRaw({ system: fullSystem, contents });
    const payload = response.payload;

    if (payload.response_type !== 'historical_audit_compute_request') {
      if (responseType && payload.response_type !== responseType) {
        throw new Error(`Expected response_type ${responseType}; received ${payload.response_type ?? 'missing'}.`);
      }
      return { payload, raw_text: response.text, computation_rounds: rounds };
    }

    rounds += 1;
    if (rounds > maxComputeRounds) {
      throw new Error(`Evaluator exceeded maximum computation rounds (${maxComputeRounds}).`);
    }

    const computationId = typeof payload.computation_id === 'string' && payload.computation_id.trim()
      ? payload.computation_id.trim()
      : `compute_${rounds}`;
    const purpose = typeof payload.purpose === 'string' ? payload.purpose : '';
    let computationResponse;
    try {
      computationResponse = {
        response_type: 'historical_audit_compute_result',
        computation_id: computationId,
        ok: true,
        result: executeModelComputation({ code: payload.code, context: computationContext })
      };
    } catch (error) {
      computationResponse = {
        response_type: 'historical_audit_compute_result',
        computation_id: computationId,
        ok: false,
        error: error.message
      };
    }

    if (Array.isArray(computationLog)) {
      computationLog.push({
        round: rounds,
        computation_id: computationId,
        purpose,
        code: payload.code,
        result: computationResponse,
        timestamp: new Date().toISOString()
      });
    }

    contents.push(response.reply);
    contents.push({ role: 'user', parts: [{ text: JSON.stringify(computationResponse, null, 2) }] });
  }
}

function safeArchivePath(archivePath) {
  if (typeof archivePath !== 'string' || !archivePath.trim()) throw new Error('archive_path must be non-empty.');
  const normalized = archivePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (normalized.startsWith('/') || normalized.includes('../')) throw new Error(`Unsafe archive_path: ${archivePath}`);
  const absolute = path.resolve(packetRoot, normalized);
  const relative = path.relative(packetRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`archive_path escapes packet root: ${archivePath}`);
  return absolute;
}

function manifestSummary(manifest) {
  return {
    archive_version: manifest.archive_version,
    generated_at: manifest.generated_at,
    source_commit_sha: manifest.source_commit_sha,
    source_map_path: manifest.source_map_path,
    files: manifest.files.map(file => ({
      archive_path: file.archive_path,
      source_path: file.source_path,
      entry_id: file.entry_id,
      category: file.category,
      description: file.description,
      authority: file.authority,
      size_bytes: file.size_bytes,
      sha256: file.sha256,
      generated: file.generated === true
    }))
  };
}

function validatePlan(plan, manifest, maxContextBytes) {
  if (!Array.isArray(plan.subquestions) || plan.subquestions.length === 0) {
    throw new Error('Planner must return a non-empty subquestions array.');
  }
  const available = new Map(manifest.files.map(file => [file.archive_path, file]));
  const ids = new Set();
  for (const sub of plan.subquestions) {
    if (!sub || typeof sub !== 'object') throw new Error('Every subquestion must be an object.');
    if (typeof sub.subquestion_id !== 'string' || !sub.subquestion_id.trim()) throw new Error('Every subquestion requires subquestion_id.');
    if (ids.has(sub.subquestion_id)) throw new Error(`Duplicate subquestion_id ${sub.subquestion_id}.`);
    ids.add(sub.subquestion_id);
    if (typeof sub.question !== 'string' || !sub.question.trim()) throw new Error(`${sub.subquestion_id} requires question.`);
    if (!Array.isArray(sub.context_files) || sub.context_files.length === 0) throw new Error(`${sub.subquestion_id} requires context_files.`);
    let bytes = 0;
    for (const archivePath of sub.context_files) {
      const file = available.get(archivePath);
      if (!file) throw new Error(`${sub.subquestion_id} selected unknown archive_path ${archivePath}.`);
      bytes += Number(file.size_bytes || 0);
    }
    if (bytes > maxContextBytes) {
      throw new Error(`${sub.subquestion_id} context is ${bytes} bytes, exceeding max ${maxContextBytes}. Planner must divide the question further.`);
    }
    sub.context_bytes = bytes;
  }
}

function assignedContextObject(subquestion, manifest) {
  const index = new Map(manifest.files.map(file => [file.archive_path, file]));
  return {
    subquestion: jsonSafe(subquestion),
    files: subquestion.context_files.map(archivePath => {
      const file = index.get(archivePath);
      return {
        metadata: jsonSafe(file),
        content: readText(safeArchivePath(archivePath))
      };
    })
  };
}

function renderAssignedContext(contextObject) {
  return contextObject.files.map(file => [
    `===== ASSIGNED CONTEXT: ${file.metadata.archive_path} =====`,
    `source_path: ${file.metadata.source_path}`,
    `entry_id: ${file.metadata.entry_id}`,
    `category: ${file.metadata.category}`,
    `authority: ${file.metadata.authority}`,
    `description: ${file.metadata.description}`,
    `sha256: ${file.metadata.sha256}`,
    '----- CONTENT -----',
    file.content,
    `===== END ASSIGNED CONTEXT: ${file.metadata.archive_path} =====`
  ].join('\n')).join('\n\n');
}

async function main() {
  const trigger = readJson(triggerPath);
  const runNonce = String(trigger.run_nonce || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runNonce)) throw new Error(`Invalid run_nonce: ${runNonce}`);
  const manifest = readJson(manifestPath);
  const manifestView = manifestSummary(manifest);
  const outputRoot = path.join(evaluationRoot, 'evaluations', runNonce);
  const plannerOut = path.join(outputRoot, 'planner.json');
  const subRoot = path.join(outputRoot, 'subevaluations');
  const computeRoot = path.join(outputRoot, 'computations');
  const finalOut = path.join(outputRoot, 'evaluation.json');
  const maxContextBytes = Number(trigger.archive_selection?.max_subquestion_context_bytes || 1400000);
  const taskText = trigger.nextmessage?.parts?.map(part => part.text || '').join('\n').trim();
  if (!taskText) throw new Error('historical audit trigger requires nextmessage.parts[].text.');

  const plannerSystem = [
    'You are the lead historical-audit evaluator and context planner.',
    'Your immediate task is not to answer the audit question. Decompose it into subquestions for independent evaluator calls using the same model/API.',
    'You are given only the archive manifest and source descriptions, not the full archive contents.',
    'Assign each subquestion an explicit set of archive_path values. Each assigned sub-evaluator will receive only those files, plus your subquestion-specific instructions.',
    `Keep each subquestion context at or below ${maxContextBytes} bytes according to manifest size_bytes.`,
    'Divide context rather than asking one sub-evaluator to inspect everything.',
    'Historical truth decisions about intent, requirement lineage, supersession, or historical implementation must be grounded through an explicit interpretation layer: raw facts -> interpretations -> truth decisions.',
    'Use separate subquestions when different evidence domains can be evaluated independently, such as current-machine behavior, requirement lineage, nonce evidence, supersession, and completeness/reconciliation.',
    'Do not invent archive paths.',
    'Return only JSON with response_type historical_audit_subquestion_plan and this shape:',
    JSON.stringify({
      response_type: 'historical_audit_subquestion_plan',
      heuristic_statement: 'string',
      decomposition_rationale: 'string',
      subquestions: [{
        subquestion_id: 'string',
        question: 'string',
        purpose: 'string',
        context_files: ['archive/path'],
        interpretation_requirements: ['string'],
        expected_findings: ['string'],
        synthesis_dependencies: ['subquestion_id']
      }],
      completeness_strategy: ['string']
    }, null, 2)
  ].join('\n\n');

  const plannerUser = [
    'Audit-design/task request:',
    taskText,
    'Archive manifest/descriptions:',
    JSON.stringify(manifestView, null, 2)
  ].join('\n\n');

  const plannerCompute = [];
  const planner = await callGeminiWithCompute({
    system: plannerSystem,
    user: plannerUser,
    responseType: 'historical_audit_subquestion_plan',
    computationContext: { task: taskText, archive_manifest: manifestView },
    computationLog: plannerCompute
  });
  validatePlan(planner.payload, manifest, maxContextBytes);
  writeJson(plannerOut, planner.payload);
  if (plannerCompute.length) writeJson(path.join(computeRoot, 'planner.json'), plannerCompute);

  const subResults = [];
  let totalComputeRounds = planner.computation_rounds;
  for (const sub of planner.payload.subquestions) {
    const contextObject = assignedContextObject(sub, manifest);
    const assignedContext = renderAssignedContext(contextObject);
    const subSystem = [
      'You are an independent historical-audit sub-evaluator.',
      'Answer only the assigned subquestion using only the assigned context files and instructions supplied by the lead evaluator.',
      'Do not assume omitted archive files support or refute a claim.',
      'Separate mechanically observable facts from semantic interpretations.',
      'Any truth decision that depends on historical meaning, intent, supersession, requirement survival, or implementation significance must list the interpretation records it depends on.',
      'When evidence is insufficient, return INDETERMINATE rather than guessing.',
      'Return only JSON with response_type historical_audit_subresult and this shape:',
      JSON.stringify({
        response_type: 'historical_audit_subresult',
        subquestion_id: sub.subquestion_id,
        answer_summary: 'string',
        historical_facts: [{ fact_id: 'string', statement: 'string', source_archive_path: 'string', evidence_locator: 'string' }],
        interpretations: [{ interpretation_id: 'string', statement: 'string', depends_on_fact_ids: ['string'], confidence: 'HIGH | MEDIUM | LOW | INDETERMINATE' }],
        truth_decisions: [{ decision_id: 'string', statement: 'string', truth_value: 'TRUE | FALSE | PARTIAL | INDETERMINATE', depends_on_interpretation_ids: ['string'], current_fact_evidence: ['string'] }],
        unresolved_questions: ['string'],
        context_files_used: ['string']
      }, null, 2)
    ].join('\n\n');
    const subUser = [
      `Lead-assigned subquestion ID: ${sub.subquestion_id}`,
      `Question: ${sub.question}`,
      `Purpose: ${sub.purpose || ''}`,
      `Interpretation requirements: ${JSON.stringify(sub.interpretation_requirements || [])}`,
      `Expected findings: ${JSON.stringify(sub.expected_findings || [])}`,
      'Assigned context follows:',
      assignedContext
    ].join('\n\n');

    const subCompute = [];
    const result = await callGeminiWithCompute({
      system: subSystem,
      user: subUser,
      responseType: 'historical_audit_subresult',
      computationContext: contextObject,
      computationLog: subCompute
    });
    if (result.payload.subquestion_id !== sub.subquestion_id) {
      throw new Error(`Sub-evaluator returned mismatched subquestion_id ${result.payload.subquestion_id}; expected ${sub.subquestion_id}.`);
    }
    const fileName = `${sub.subquestion_id.replace(/[^A-Za-z0-9._-]+/g, '_')}.json`;
    writeJson(path.join(subRoot, fileName), result.payload);
    if (subCompute.length) writeJson(path.join(computeRoot, fileName), subCompute);
    totalComputeRounds += result.computation_rounds;
    subResults.push(result.payload);
  }

  const synthesisSystem = [
    'You are the lead evaluator performing final synthesis from independently scoped sub-evaluator results.',
    'The sub-evaluators were deliberately context-isolated. Respect their stated unresolved questions and do not manufacture cross-context facts.',
    'Reconcile facts, interpretations, and truth decisions across subresults.',
    'Historical truth decisions concerning intent, requirement lineage, supersession, requirement survival, or historical implementation must expose interpretation dependencies.',
    'A historical fact is not itself a semantic conclusion. A truth decision may cite raw current-machine facts directly, but when it relies on historical meaning it must cite one or more interpretation IDs.',
    'Detect contradictions between subresults and mark unresolved conclusions INDETERMINATE unless the supplied evidence resolves them.',
    'Return only JSON with response_type historical_audit_result.'
  ].join('\n\n');

  const synthesisContext = {
    original_task: taskText,
    lead_plan: planner.payload,
    subresults: subResults,
    archive_manifest_summary: manifestView
  };
  const synthesisUser = [
    'Original audit task:',
    taskText,
    'Lead heuristic/decomposition:',
    JSON.stringify(planner.payload, null, 2),
    'Sub-evaluator results:',
    JSON.stringify(subResults, null, 2),
    'Archive manifest summary:',
    JSON.stringify(manifestView, null, 2),
    'Required final shape:',
    JSON.stringify({
      response_type: 'historical_audit_result',
      heuristic_used: 'string',
      machine_today: { summary: 'string', components: [] },
      surviving_requirements: [],
      superseded_requirements: [],
      outstanding_gaps: [],
      historical_facts: [],
      interpretations: [],
      truth_decisions: [],
      subquestion_reconciliation: [],
      completeness_checks: [],
      unresolved_ambiguities: []
    }, null, 2)
  ].join('\n\n');

  const synthesisCompute = [];
  const synthesis = await callGeminiWithCompute({
    system: synthesisSystem,
    user: synthesisUser,
    responseType: 'historical_audit_result',
    computationContext: synthesisContext,
    computationLog: synthesisCompute
  });
  if (synthesisCompute.length) writeJson(path.join(computeRoot, 'synthesis.json'), synthesisCompute);
  totalComputeRounds += synthesis.computation_rounds;

  writeJson(finalOut, synthesis.payload);
  writeJson(path.join(outputRoot, 'run-metadata.json'), {
    run_nonce: runNonce,
    model,
    trigger_path: path.relative(process.cwd(), triggerPath).replace(/\\/g, '/'),
    archive_manifest: path.relative(process.cwd(), manifestPath).replace(/\\/g, '/'),
    planner_sha256: sha256(JSON.stringify(planner.payload)),
    subquestion_count: subResults.length,
    model_directed_computation_enabled: true,
    total_computation_rounds: totalComputeRounds,
    computation_timeout_ms: computeTimeoutMs,
    computation_isolation: 'node:vm context; assigned context only; no process/require/fetch/fs/network/env/timers; dynamic code generation disabled',
    completed_at: new Date().toISOString()
  });

  console.log(JSON.stringify({
    run_nonce: runNonce,
    model,
    planner_output: plannerOut,
    subevaluations: subResults.length,
    model_directed_computation_enabled: true,
    total_computation_rounds: totalComputeRounds,
    final_output: finalOut
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
