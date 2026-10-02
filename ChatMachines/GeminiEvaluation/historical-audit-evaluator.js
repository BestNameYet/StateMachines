const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const evaluationRoot = path.resolve(__dirname);
const triggerPath = path.join(evaluationRoot, 'historical-audit-nextmessage', 'nextmessage.json');
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const requestTimeoutMs = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 180000);
const packetRoot = path.resolve(process.env.HISTORICAL_AUDIT_PACKET_ROOT || path.join(evaluationRoot, '.historical-audit-packet'));
const manifestPath = path.resolve(process.env.HISTORICAL_AUDIT_MANIFEST || path.join(packetRoot, 'archive-manifest.json'));
const appScriptEndpoint = process.env.HISTORICAL_AUDIT_APPS_SCRIPT_ENDPOINT || 'https://script.google.com/macros/s/AKfycbxz7tkba4wl-wWzDn90iuh0us2l2EUD3AYV9HyVJckETKGjhPKFthnqPyYmcOPOk_g5FA/exec';
const maxApiAttempts = Number(process.env.HISTORICAL_AUDIT_API_ATTEMPTS || 6);
const baseBackoffMs = Number(process.env.HISTORICAL_AUDIT_API_BACKOFF_MS || 5000);
const maxComputeRounds = Number(process.env.HISTORICAL_AUDIT_MAX_COMPUTE_ROUNDS || 8);

function readText(p) { return fs.readFileSync(p, 'utf8'); }
function readJson(p) { return JSON.parse(readText(p)); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function extractJson(text) {
  const trimmed = String(text || '').trim();
  try { return JSON.parse(trimmed); } catch (directError) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!fenced) throw directError;
    return JSON.parse(fenced[1].trim());
  }
}

function retryableError(error) {
  return /Gemini HTTP (429|500|502|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|temporarily unavailable|Unexpected end of JSON input|unterminated|non-JSON/i.test(String(error?.message || error));
}

async function callGeminiRaw({ system, contents }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');
  let lastError;
  for (let attempt = 1; attempt <= maxApiAttempts; attempt += 1) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents }),
          signal: AbortSignal.timeout(requestTimeoutMs)
        }
      );
      const raw = await response.text();
      let body;
      try { body = JSON.parse(raw); }
      catch (_) { throw new Error(`Gemini returned non-JSON HTTP ${response.status}: ${raw}`); }
      if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
      const reply = body.candidates?.[0]?.content;
      if (reply?.role !== 'model' || !Array.isArray(reply.parts) || !reply.parts.length) {
        throw new Error(`Gemini returned no evaluator content: ${JSON.stringify(body)}`);
      }
      const text = reply.parts.map(part => part.text || '').join('\n').trim();
      return { reply, text, payload: extractJson(text) };
    } catch (error) {
      lastError = error;
      if (!retryableError(error) || attempt === maxApiAttempts) throw error;
      console.error(`Gemini request attempt ${attempt} failed transiently: ${error.message}`);
      await sleep(baseBackoffMs * attempt);
    }
  }
  throw lastError;
}

function executeLocalComputation(code, context) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('compute code is empty');
  const fn = eval(`(function(context){${code}\n})`);
  return fn(JSON.parse(JSON.stringify(context)));
}

async function callGeminiWithCompute({ system, user, responseType, computationContext, computationLog }) {
  const computeProtocol = [
    'MODEL-DIRECTED COMPUTATION IS AVAILABLE.',
    'To compute before the final answer, return ONLY JSON with response_type historical_audit_compute_request, computation_id, purpose, and code.',
    'The code is an arbitrary JavaScript function body with variable context available and must return a JSON-serializable value.',
    `At most ${maxComputeRounds} computation rounds are allowed.`
  ].join('\n\n');
  const contents = [{ role: 'user', parts: [{ text: user }] }];
  let rounds = 0;
  while (true) {
    const response = await callGeminiRaw({ system: `${system}\n\n${computeProtocol}`, contents });
    const payload = response.payload;
    if (payload.response_type !== 'historical_audit_compute_request') {
      if (responseType && payload.response_type !== responseType) throw new Error(`Expected ${responseType}; received ${payload.response_type ?? 'missing'}.`);
      return { payload, computation_rounds: rounds };
    }
    rounds += 1;
    if (rounds > maxComputeRounds) throw new Error(`Exceeded ${maxComputeRounds} compute rounds.`);
    let computeResult;
    try {
      computeResult = { response_type: 'historical_audit_compute_result', computation_id: payload.computation_id || `compute_${rounds}`, ok: true, result: executeLocalComputation(payload.code, computationContext) };
    } catch (error) {
      computeResult = { response_type: 'historical_audit_compute_result', computation_id: payload.computation_id || `compute_${rounds}`, ok: false, error: error.message };
    }
    computationLog.push({ round: rounds, request: payload, result: computeResult, timestamp: new Date().toISOString() });
    contents.push(response.reply);
    contents.push({ role: 'user', parts: [{ text: JSON.stringify(computeResult) }] });
  }
}

function safeArchivePath(archivePath) {
  const normalized = String(archivePath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('../')) throw new Error(`Unsafe archive_path: ${archivePath}`);
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
    selected_supervisor_run_nonces: manifest.selected_supervisor_run_nonces,
    evidence_precedence_guidance: manifest.evidence_precedence_guidance,
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
  if (!Array.isArray(plan.subquestions) || !plan.subquestions.length) throw new Error('Planner returned no subquestions.');
  const available = new Map(manifest.files.map(file => [file.archive_path, file]));
  const ids = new Set();
  for (const sub of plan.subquestions) {
    if (!sub || typeof sub !== 'object' || !String(sub.subquestion_id || '').trim()) throw new Error('Invalid subquestion.');
    if (ids.has(sub.subquestion_id)) throw new Error(`Duplicate subquestion_id ${sub.subquestion_id}`);
    ids.add(sub.subquestion_id);
    if (!String(sub.question || '').trim()) throw new Error(`${sub.subquestion_id} has no question.`);
    if (!Array.isArray(sub.context_files) || !sub.context_files.length) throw new Error(`${sub.subquestion_id} has no context_files.`);
    let bytes = 0;
    for (const archivePath of sub.context_files) {
      const file = available.get(archivePath);
      if (!file) throw new Error(`${sub.subquestion_id} selected unknown ${archivePath}`);
      bytes += Number(file.size_bytes || 0);
    }
    if (bytes > maxContextBytes) throw new Error(`${sub.subquestion_id} context ${bytes} exceeds ${maxContextBytes}.`);
    sub.context_bytes = bytes;
  }
}

function assignedContextObject(subquestion, manifest) {
  const index = new Map(manifest.files.map(file => [file.archive_path, file]));
  return {
    subquestion: JSON.parse(JSON.stringify(subquestion)),
    files: subquestion.context_files.map(archivePath => ({
      metadata: JSON.parse(JSON.stringify(index.get(archivePath))),
      content: readText(safeArchivePath(archivePath))
    }))
  };
}

function appsScriptSubEvaluatorSource() {
  return String.raw`function(args) {
    function extractJson(text) {
      var trimmed = String(text || '').trim();
      try { return JSON.parse(trimmed); } catch (e) {
        var m = trimmed.match(/^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i);
        if (!m) throw e;
        return JSON.parse(m[1].trim());
      }
    }
    function callGemini(system, contents) {
      var lastError = null;
      for (var attempt = 1; attempt <= args.maxApiAttempts; attempt++) {
        var response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(args.model) + ':generateContent', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-goog-api-key': args.apiKey },
          payload: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: contents }),
          muteHttpExceptions: true
        });
        var status = response.getResponseCode();
        var raw = response.getContentText();
        if (status >= 200 && status < 300) {
          var body = JSON.parse(raw);
          var reply = body.candidates && body.candidates[0] && body.candidates[0].content;
          if (!reply || reply.role !== 'model' || !reply.parts || !reply.parts.length) throw new Error('Gemini returned no evaluator content: ' + raw);
          var text = reply.parts.map(function(p){ return p.text || ''; }).join('\n').trim();
          return { reply: reply, payload: extractJson(text) };
        }
        lastError = new Error('Gemini HTTP ' + status + ': ' + raw);
        if ([429,500,502,503,504].indexOf(status) < 0 || attempt === args.maxApiAttempts) throw lastError;
        Utilities.sleep(args.baseBackoffMs * attempt);
      }
      throw lastError;
    }
    var computeProtocol = [
      'MODEL-DIRECTED COMPUTATION IS AVAILABLE IN THIS APPS SCRIPT EXECUTION HOST.',
      'To compute, return ONLY JSON with response_type historical_audit_compute_request, computation_id, purpose, and code.',
      'code is a JavaScript function body with variable context available. Return a JSON-serializable value.',
      'Your code is executed with eval in this Apps Script function before the next Gemini turn.'
    ].join('\n\n');
    var contents = [{ role: 'user', parts: [{ text: args.user }] }];
    var rounds = 0;
    var computationLog = [];
    while (true) {
      var response = callGemini(args.system + '\n\n' + computeProtocol, contents);
      var payload = response.payload;
      if (payload.response_type !== 'historical_audit_compute_request') {
        if (payload.response_type !== args.responseType) throw new Error('Expected ' + args.responseType + '; received ' + payload.response_type);
        return { payload: payload, computation_rounds: rounds, computation_log: computationLog };
      }
      rounds++;
      if (rounds > args.maxComputeRounds) throw new Error('Exceeded max compute rounds.');
      var computationResult;
      try {
        var context = args.context;
        var value = eval('(function(context){' + payload.code + '\n})(context)');
        computationResult = { response_type: 'historical_audit_compute_result', computation_id: payload.computation_id || ('compute_' + rounds), ok: true, result: value };
      } catch (e) {
        computationResult = { response_type: 'historical_audit_compute_result', computation_id: payload.computation_id || ('compute_' + rounds), ok: false, error: String(e && e.message || e) };
      }
      computationLog.push({ round: rounds, request: payload, result: computationResult, timestamp: new Date().toISOString() });
      contents.push(response.reply);
      contents.push({ role: 'user', parts: [{ text: JSON.stringify(computationResult) }] });
    }
  }`;
}

async function runSubEvaluatorOnAppsScript({ sub, contextObject, subSystem, subUser }) {
  const request = {
    sourcecode: appsScriptSubEvaluatorSource(),
    arguments: {
      apiKey,
      model,
      system: subSystem,
      user: subUser,
      responseType: 'historical_audit_subresult',
      context: contextObject,
      maxApiAttempts,
      baseBackoffMs,
      maxComputeRounds
    }
  };
  const response = await fetch(appScriptEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    redirect: 'follow',
    signal: AbortSignal.timeout(requestTimeoutMs * maxApiAttempts)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}: ${raw}`);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (_) { throw new Error(`Apps Script returned non-JSON: ${raw}`); }
  if (!parsed || parsed.payload?.response_type !== 'historical_audit_subresult') throw new Error(`Apps Script sub-evaluator returned invalid payload: ${raw}`);
  if (parsed.payload.subquestion_id !== sub.subquestion_id) throw new Error(`Apps Script sub-evaluator returned ${parsed.payload.subquestion_id}; expected ${sub.subquestion_id}.`);
  return parsed;
}

async function main() {
  const trigger = readJson(triggerPath);
  const runNonce = String(trigger.run_nonce || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runNonce)) throw new Error(`Invalid run_nonce: ${runNonce}`);
  const manifest = readJson(manifestPath);
  const manifestView = manifestSummary(manifest);
  const outputRoot = path.join(evaluationRoot, 'evaluations', runNonce);
  const subRoot = path.join(outputRoot, 'subevaluations');
  const computeRoot = path.join(outputRoot, 'computations');
  const progressPath = path.join(outputRoot, 'subevaluation-progress.json');
  const maxContextBytes = Number(trigger.archive_selection?.max_subquestion_context_bytes || 1400000);
  const taskText = trigger.nextmessage?.parts?.map(part => part.text || '').join('\n').trim();
  if (!taskText) throw new Error('historical audit task is empty.');

  const plannerSystem = [
    'You are the lead historical-audit evaluator and context planner.',
    'Do not answer the audit yet. Choose your own heuristic and decompose the audit into context-bounded subquestions.',
    'You receive only the archive manifest/descriptions. Assign exact archive_path values to each subquestion.',
    'Sub-evaluators will execute strictly sequentially in an external Apps Script eval host.',
    'Historical semantic conclusions must preserve raw facts -> interpretations -> truth decisions.',
    'Return only JSON response_type historical_audit_subquestion_plan.'
  ].join('\n\n');
  const plannerUser = `${taskText}\n\nARCHIVE MANIFEST:\n${JSON.stringify(manifestView, null, 2)}\n\nReturn JSON with heuristic_statement, decomposition_rationale, subquestions[{subquestion_id,question,purpose,context_files,interpretation_requirements,expected_findings,synthesis_dependencies}], completeness_strategy.`;
  const plannerCompute = [];
  const planner = await callGeminiWithCompute({ system: plannerSystem, user: plannerUser, responseType: 'historical_audit_subquestion_plan', computationContext: { task: taskText, archive_manifest: manifestView }, computationLog: plannerCompute });
  validatePlan(planner.payload, manifest, maxContextBytes);
  writeJson(path.join(outputRoot, 'planner.json'), planner.payload);
  if (plannerCompute.length) writeJson(path.join(computeRoot, 'planner.json'), plannerCompute);

  const subResults = [];
  writeJson(progressPath, { execution_mode: 'strictly_sequential_apps_script', total: planner.payload.subquestions.length, completed: 0, current: null });
  for (let index = 0; index < planner.payload.subquestions.length; index += 1) {
    const sub = planner.payload.subquestions[index];
    writeJson(progressPath, { execution_mode: 'strictly_sequential_apps_script', total: planner.payload.subquestions.length, completed: index, current: sub.subquestion_id, ordinal: index + 1 });
    const contextObject = assignedContextObject(sub, manifest);
    const assignedText = contextObject.files.map(file => `===== ${file.metadata.archive_path} =====\n${file.content}\n===== END ${file.metadata.archive_path} =====`).join('\n\n');
    const subSystem = [
      'You are an independent historical-audit sub-evaluator executing inside Google Apps Script.',
      'Answer only the assigned subquestion using only assigned context.',
      'Separate mechanically observable facts from interpretations.',
      'Historical truth decisions about intent, supersession, survival, or historical implementation must list interpretation dependencies.',
      'Return only JSON response_type historical_audit_subresult.'
    ].join('\n\n');
    const subUser = [
      `subquestion_id: ${sub.subquestion_id}`,
      `question: ${sub.question}`,
      `purpose: ${sub.purpose || ''}`,
      `interpretation_requirements: ${JSON.stringify(sub.interpretation_requirements || [])}`,
      `expected_findings: ${JSON.stringify(sub.expected_findings || [])}`,
      'Required fields: response_type, subquestion_id, answer_summary, historical_facts, interpretations, truth_decisions, unresolved_questions, context_files_used.',
      'ASSIGNED CONTEXT:', assignedText
    ].join('\n\n');
    const result = await runSubEvaluatorOnAppsScript({ sub, contextObject, subSystem, subUser });
    const fileName = `${String(index + 1).padStart(3, '0')}-${sub.subquestion_id.replace(/[^A-Za-z0-9._-]+/g, '_')}.json`;
    writeJson(path.join(subRoot, fileName), result.payload);
    if (Array.isArray(result.computation_log) && result.computation_log.length) writeJson(path.join(computeRoot, fileName), result.computation_log);
    subResults.push(result.payload);
    writeJson(progressPath, { execution_mode: 'strictly_sequential_apps_script', total: planner.payload.subquestions.length, completed: index + 1, current: null, last_completed: sub.subquestion_id });
  }

  const synthesisSystem = [
    'You are the lead evaluator performing final synthesis from sequential Apps Script sub-evaluator results.',
    'Reconcile facts, interpretations, and truth decisions across all subresults.',
    'Do not manufacture evidence beyond the supplied subresults and manifest.',
    'Historical semantic truth decisions must expose interpretation dependencies.',
    'Return only JSON response_type historical_audit_result.'
  ].join('\n\n');
  const synthesisContext = { original_task: taskText, lead_plan: planner.payload, subresults: subResults, archive_manifest_summary: manifestView };
  const synthesisUser = [
    'ORIGINAL TASK:', taskText,
    'LEAD PLAN:', JSON.stringify(planner.payload, null, 2),
    'SEQUENTIAL SUBRESULTS:', JSON.stringify(subResults, null, 2),
    'MANIFEST:', JSON.stringify(manifestView, null, 2),
    'Required fields: response_type, heuristic_used, machine_today, surviving_requirements, superseded_requirements, outstanding_gaps, historical_facts, interpretations, truth_decisions, subquestion_reconciliation, completeness_checks, unresolved_ambiguities.'
  ].join('\n\n');
  const synthesisCompute = [];
  const synthesis = await callGeminiWithCompute({ system: synthesisSystem, user: synthesisUser, responseType: 'historical_audit_result', computationContext: synthesisContext, computationLog: synthesisCompute });
  if (synthesisCompute.length) writeJson(path.join(computeRoot, 'synthesis.json'), synthesisCompute);
  writeJson(path.join(outputRoot, 'evaluation.json'), synthesis.payload);
  writeJson(path.join(outputRoot, 'run-metadata.json'), {
    run_nonce: runNonce,
    model,
    subevaluation_execution: 'strictly_sequential_apps_script',
    apps_script_endpoint: appScriptEndpoint,
    planner_sha256: sha256(JSON.stringify(planner.payload)),
    subquestion_count: subResults.length,
    completed_at: new Date().toISOString()
  });
  console.log(JSON.stringify({ run_nonce: runNonce, subevaluations: subResults.length, execution: 'strictly_sequential_apps_script', final_output: path.join(outputRoot, 'evaluation.json') }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
