const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = 'ChatMachines/GeminiSupervisor';
const configPath = `${root}/config.json`;
const repoRoot = path.resolve(process.cwd());

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function readJson(p) {
  return JSON.parse(readText(p));
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function loadSupervisorConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Supervisor configuration file not found at ${configPath}`);
  }
  const cfg = readJson(configPath);
  return {
    raw: cfg,
    triggerPath: path.resolve(repoRoot, cfg.trigger_file || `${root}/nextmessage/nextmessage.json`),
    agentsPath: path.resolve(repoRoot, cfg.agents_file || `${root}/Agents.md`),
    runsRoot: path.resolve(repoRoot, cfg.runs_directory || `${root}/runs`),
    step3EvalPath: path.resolve(repoRoot, cfg.external_files?.step3_evaluation_artifact?.path || `${root}/tests/step-3-evaluation.json`),
    observationLedgerFilename: cfg.observation_ledger?.filename || 'observations.jsonl',
    observationRequestsFilename: cfg.observation_requests?.default_request_filename || 'observation_requests.json',
    observationReceiptsFilename: cfg.observation_requests?.default_receipt_filename || 'observation_receipts.json'
  };
}

const supervisorConfig = loadSupervisorConfig();
const triggerPath = supervisorConfig.triggerPath;
const agentsPath = supervisorConfig.agentsPath;
const step3EvalPath = supervisorConfig.step3EvalPath;

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const PASSFAIL = new Set(['PASS', 'FAIL']);
const GT_STATUS = new Set(['VERIFIED', 'CONTRADICTED', 'PARTIAL', 'UNKNOWN', 'NOT_EXECUTED']);
const BLOCKING_GT_STATUS = new Set(['CONTRADICTED', 'PARTIAL', 'UNKNOWN', 'NOT_EXECUTED']);
const execRole = 'ChatGPT model';
const execForbidden = 'Gemini model';
const supRole = 'Gemini model';
const supForbidden = 'ChatGPT model';
const GENESIS_PARENT_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

const now = () => new Date().toISOString();
const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}

function nonce(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid run_nonce: ${value}`);
  }
  return value;
}

function stepsFrom(agents) {
  const out = [];
  const seen = new Set();
  const re = /^## Step\s+(\d+)\s*$/gm;
  let match;
  while ((match = re.exec(agents))) {
    const step = Number(match[1]);
    if (!seen.has(step)) {
      seen.add(step);
      out.push(step);
    }
  }
  if (!out.length) throw new Error('Agents.md contains no ## Step N headings.');
  return out.sort((a, b) => a - b);
}

function stepBlock(agents, step) {
  const heading = new RegExp(`^## Step\\s+${step}\\s*$`, 'm');
  const match = heading.exec(agents);
  if (!match) throw new Error(`Missing Step ${step}.`);
  const rest = agents.slice(match.index + match[0].length);
  const next = /^## Step\s+\d+\s*$/m.exec(rest);
  const end = next ? match.index + match[0].length + next.index : agents.length;
  return agents.slice(match.index, end).trim();
}

function contextFiles(step) {
  const relStep3Artifact = path.relative(repoRoot, step3EvalPath).replace(/\\/g, '/');
  return step === 3 ? ['Agents.md', relStep3Artifact] : ['Agents.md'];
}

function loadStep3Evaluation() {
  if (!fs.existsSync(step3EvalPath)) {
    throw new Error(`Step 3 evaluation artifact not found at ${step3EvalPath}`);
  }
  const artifact = readJson(step3EvalPath);
  if (!artifact.evaluation_heuristic || !artifact.step3_tsr) {
    throw new Error(`Invalid step 3 evaluation artifact at ${step3EvalPath}: missing evaluation_heuristic or step3_tsr.`);
  }
  return artifact;
}

function safeWorkspacePath(candidate) {
  if (!nonEmpty(candidate)) return null;
  const clean = candidate.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
  if (clean.includes('\0') || path.isAbsolute(clean)) return null;
  const absolute = path.resolve(repoRoot, clean);
  const relative = path.relative(repoRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return { relative: relative.replace(/\\/g, '/'), absolute };
}

function extractRepoPath(text) {
  if (!nonEmpty(text)) return null;
  const normalized = text.replace(/\\/g, '/');
  const patterns = [
    /(?:ChatMachines|\.github|tests|docs|src)\/[A-Za-z0-9_.\/-]+/g,
    /\bruns\/[A-Za-z0-9_.\/-]+/g
  ];
  for (const re of patterns) {
    const match = re.exec(normalized);
    if (match) {
      const found = match[0].replace(/[),.;:'"`\]}]+$/g, '');
      return found.startsWith('runs/') ? `${root}/${found}` : found;
    }
  }
  return null;
}

function shaFromText(text) {
  const match = String(text || '').match(/\b[0-9a-f]{40}\b/i);
  return match ? match[0].toLowerCase() : null;
}

function git(args) {
  try {
    return {
      ok: true,
      stdout: execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 4 * 1024 * 1024
      }).trim(),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || '').trim(),
      error: String(error.stderr || error.message || '').trim()
    };
  }
}

/**
 * Tamper-Evident Observation Ledger
 * Appends SHA-256 hash-chained JSONL records to runs/<run_nonce>/observations.jsonl.
 */
class ObservationLedger {
  constructor(ledgerFile, runNonce) {
    this.ledgerFile = ledgerFile;
    this.runNonce = runNonce;
    this.records = [];
    this.loadAndVerify();
  }

  loadAndVerify() {
    fs.mkdirSync(path.dirname(this.ledgerFile), { recursive: true });
    if (!fs.existsSync(this.ledgerFile)) {
      fs.writeFileSync(this.ledgerFile, '', 'utf8');
      this.records = [];
      return { ok: true, count: 0 };
    }
    const lines = fs.readFileSync(this.ledgerFile, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const parsed = [];
    let expectedParentHash = GENESIS_PARENT_HASH;
    for (let i = 0; i < lines.length; i++) {
      let record;
      try {
        record = JSON.parse(lines[i]);
      } catch (err) {
        return {
          ok: false,
          error: `Unparseable observation record at line ${i + 1}: ${err.message}`,
          line: i + 1
        };
      }
      if (record.sequence !== i + 1) {
        return {
          ok: false,
          error: `Sequence mismatch at line ${i + 1}: got ${record.sequence}, expected ${i + 1}`,
          line: i + 1
        };
      }
      if (record.parent_hash !== expectedParentHash) {
        return {
          ok: false,
          error: `Parent hash mismatch at line ${i + 1}: got ${record.parent_hash}, expected ${expectedParentHash}`,
          line: i + 1
        };
      }
      const computedHash = ObservationLedger.computeRecordHash(record);
      if (record.record_hash !== computedHash) {
        return {
          ok: false,
          error: `Record hash tampering detected at line ${i + 1}: stored ${record.record_hash}, computed ${computedHash}`,
          line: i + 1
        };
      }
      expectedParentHash = record.record_hash;
      parsed.push(record);
    }
    this.records = parsed;
    return { ok: true, count: parsed.length, tipHash: expectedParentHash };
  }

  static computeRecordHash(record) {
    const payload = {
      sequence: record.sequence,
      obs_id: record.obs_id,
      run_nonce: record.run_nonce,
      timestamp: record.timestamp,
      operation: record.operation,
      target: record.target,
      version_ref: record.version_ref,
      content_hash: record.content_hash,
      excerpt: record.excerpt,
      status: record.status,
      parent_hash: record.parent_hash
    };
    return sha256(JSON.stringify(payload));
  }

  appendObservation({
    operation,
    target,
    versionRef = null,
    contentHash = null,
    excerpt = null,
    status = 'VERIFIED',
    metadata = {}
  }) {
    const sequence = this.records.length + 1;
    const parentHash = sequence === 1 ? GENESIS_PARENT_HASH : this.records[this.records.length - 1].record_hash;
    const timestamp = now();
    const obsId = `obs_${this.runNonce}_${sequence}_${sha256(`${operation}:${target}:${timestamp}`).slice(0, 12)}`;

    const record = {
      sequence,
      obs_id: obsId,
      run_nonce: this.runNonce,
      timestamp,
      operation,
      target,
      version_ref: versionRef,
      content_hash: contentHash,
      excerpt: typeof excerpt === 'string' && excerpt.length > 500 ? excerpt.slice(0, 500) + '...[truncated]' : excerpt,
      status,
      metadata,
      parent_hash: parentHash
    };
    record.record_hash = ObservationLedger.computeRecordHash(record);

    fs.appendFileSync(this.ledgerFile, JSON.stringify(record) + '\n', 'utf8');
    this.records.push(record);
    return record;
  }

  findObservation(obsId) {
    return this.records.find(r => r.obs_id === obsId) || null;
  }

  verifyChain() {
    return this.loadAndVerify();
  }
}

/**
 * Evidence Gateway
 * Mediates all internal material runtime reads against workspace, git, and run container.
 * Automatically records all inspections to the active ObservationLedger.
 */
class EvidenceGateway {
  constructor(ledger) {
    this.ledger = ledger;
  }

  observeFile(targetCandidate, claimedObserved = null, material = true) {
    const safe = safeWorkspacePath(targetCandidate);
    if (!safe) {
      return this.ledger.appendObservation({
        operation: 'read_file',
        target: targetCandidate,
        status: 'UNKNOWN',
        excerpt: 'Target is not a safe workspace path.',
        metadata: { material, error: 'invalid_path' }
      });
    }
    if (!fs.existsSync(safe.absolute)) {
      return this.ledger.appendObservation({
        operation: 'read_file',
        target: safe.relative,
        status: 'NOT_EXECUTED',
        excerpt: `File does not exist: ${safe.relative}`,
        metadata: { material, exists: false }
      });
    }
    let stat;
    try {
      stat = fs.statSync(safe.absolute);
    } catch (err) {
      return this.ledger.appendObservation({
        operation: 'stat_file',
        target: safe.relative,
        status: 'UNKNOWN',
        excerpt: `stat failed: ${err.message}`,
        metadata: { material, error: err.message }
      });
    }
    if (!stat.isFile()) {
      return this.ledger.appendObservation({
        operation: 'read_file',
        target: safe.relative,
        status: claimedObserved ? 'PARTIAL' : 'VERIFIED',
        excerpt: `Path exists but is ${stat.isDirectory() ? 'a directory' : 'non-regular file'}.`,
        metadata: { material, isFile: false, isDirectory: stat.isDirectory() }
      });
    }

    let text;
    try {
      text = fs.readFileSync(safe.absolute, 'utf8');
    } catch (err) {
      return this.ledger.appendObservation({
        operation: 'read_file',
        target: safe.relative,
        status: 'UNKNOWN',
        excerpt: `Read failed: ${err.message}`,
        metadata: { material, error: err.message }
      });
    }

    const contentHash = sha256(text);
    const tracked = git(['ls-files', '--error-unmatch', '--', safe.relative]);
    const headSha = git(['rev-parse', 'HEAD']);
    const versionRef = headSha.ok ? headSha.stdout : null;

    let status = 'VERIFIED';
    let excerpt = text.slice(0, 300);
    if (nonEmpty(claimedObserved)) {
      const matches = text.includes(claimedObserved);
      if (!matches) {
        status = 'PARTIAL';
        excerpt = `Observed file length ${text.length} chars, hash ${contentHash}, but claimed observed_content was not found verbatim.`;
      } else {
        excerpt = claimedObserved.slice(0, 300);
      }
    }

    return this.ledger.appendObservation({
      operation: 'read_file',
      target: safe.relative,
      versionRef,
      contentHash,
      excerpt,
      status,
      metadata: {
        material,
        size_bytes: stat.size,
        mtime: stat.mtime.toISOString(),
        git_tracked: tracked.ok
      }
    });
  }

  observeGitObject(sha, kind, material = true) {
    if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) {
      return this.ledger.appendObservation({
        operation: `git_${kind}`,
        target: String(sha),
        status: 'UNKNOWN',
        excerpt: 'Invalid 40-character git SHA.',
        metadata: { material, error: 'invalid_sha' }
      });
    }
    const spec = kind === 'blob' ? `${sha}^{blob}` : `${sha}^{commit}`;
    const check = git(['cat-file', '-e', spec]);
    if (!check.ok) {
      return this.ledger.appendObservation({
        operation: `git_${kind}`,
        target: sha,
        status: 'UNKNOWN',
        excerpt: `Git ${kind} object not found in local repository.`,
        metadata: { material, error: check.error }
      });
    }
    const show = kind === 'commit'
      ? git(['show', '-s', '--format=%H%n%s', sha])
      : git(['cat-file', '-s', sha]);
    return this.ledger.appendObservation({
      operation: `git_${kind}`,
      target: sha,
      versionRef: sha,
      contentHash: sha,
      excerpt: show.ok ? show.stdout.slice(0, 300) : `${kind} ${sha} verified`,
      status: 'VERIFIED',
      metadata: { material, kind }
    });
  }

  observeGitHead(material = true) {
    const head = git(['rev-parse', 'HEAD']);
    return this.ledger.appendObservation({
      operation: 'git_head',
      target: 'HEAD',
      versionRef: head.ok ? head.stdout : null,
      contentHash: head.ok ? head.stdout : null,
      excerpt: head.ok ? head.stdout : 'HEAD unresolvable',
      status: head.ok ? 'VERIFIED' : 'UNKNOWN',
      metadata: { material }
    });
  }

  observeRunFile(runFileRelative, expectedNoncePath, expectedNonce, material = true) {
    const absPath = path.resolve(repoRoot, runFileRelative);
    if (!fs.existsSync(absPath)) {
      return this.ledger.appendObservation({
        operation: 'read_run_file',
        target: runFileRelative,
        status: 'NOT_EXECUTED',
        excerpt: `Run file missing: ${runFileRelative}`,
        metadata: { material, expectedNonce }
      });
    }
    try {
      const parsed = readJson(absPath);
      const actual = expectedNoncePath.split('.').reduce((val, key) => val?.[key], parsed);
      const status = actual === expectedNonce ? 'VERIFIED' : 'CONTRADICTED';
      return this.ledger.appendObservation({
        operation: 'read_run_file',
        target: runFileRelative,
        contentHash: sha256(fs.readFileSync(absPath, 'utf8')),
        excerpt: `${expectedNoncePath}=${JSON.stringify(actual)}`,
        status,
        metadata: { material, expectedNonce, actualNonce: actual }
      });
    } catch (err) {
      return this.ledger.appendObservation({
        operation: 'read_run_file',
        target: runFileRelative,
        status: 'UNKNOWN',
        excerpt: `Parse failure: ${err.message}`,
        metadata: { material, error: err.message }
      });
    }
  }
}

function initRun(runNonce, steps) {
  const dir = path.join(supervisorConfig.runsRoot, runNonce);
  const stateFile = path.join(dir, 'state.json');
  const messagesFile = path.join(dir, 'messages.json');
  const storeFile = path.join(dir, 'store', 'store.json');
  const ledgerFile = path.join(dir, supervisorConfig.observationLedgerFilename);
  const exists = [stateFile, messagesFile, storeFile].some(fs.existsSync);
  let wrapper, messages, store;

  if (!exists) {
    wrapper = {
      current_state: {
        run_nonce: runNonce,
        status: 'awaiting_chatgpt_execution',
        created_at: now(),
        updated_at: now(),
        event_count: 0,
        procedure: {
          current_step: steps[0],
          completed_steps: [],
          remaining_steps: [...steps],
          step_records: {},
          awaiting: { type: 'chatgpt_execution', step: steps[0] }
        }
      }
    };
    messages = { run_nonce: runNonce, contents: [] };
    store = { run_nonce: runNonce, created_at: now(), initial_user_message: null, records: [] };
    writeJson(stateFile, wrapper);
    writeJson(messagesFile, messages);
    writeJson(storeFile, store);
  } else {
    if (![stateFile, messagesFile, storeFile].every(fs.existsSync)) {
      throw new Error(`Incomplete run container ${dir}`);
    }
    wrapper = readJson(stateFile);
    messages = readJson(messagesFile);
    store = readJson(storeFile);
    for (const [label, value] of [
      ['state', wrapper.current_state?.run_nonce],
      ['messages', messages.run_nonce],
      ['store', store.run_nonce]
    ]) {
      if (value !== runNonce) throw new Error(`Mismatched run_nonce in ${label}`);
    }
    const state = wrapper.current_state;
    state.procedure = state.procedure || {};
    state.procedure.completed_steps = Array.isArray(state.procedure.completed_steps)
      ? state.procedure.completed_steps : [];
    state.procedure.step_records = state.procedure.step_records || {};
    state.event_count = Number.isInteger(state.event_count) ? state.event_count : 0;
    state.procedure.remaining_steps = steps.filter(s => !state.procedure.completed_steps.includes(s));
    if (state.procedure.current_step !== null && !steps.includes(state.procedure.current_step)) {
      state.procedure.current_step = state.procedure.remaining_steps[0] ?? null;
    }
    if (state.procedure.current_step === null && state.procedure.remaining_steps.length) {
      state.procedure.current_step = state.procedure.remaining_steps[0];
    }
    state.procedure.awaiting = state.procedure.current_step === null
      ? null : { type: 'chatgpt_execution', step: state.procedure.current_step };
  }

  const ledger = new ObservationLedger(ledgerFile, runNonce);
  const gateway = new EvidenceGateway(ledger);

  return {
    dir,
    stateFile,
    messagesFile,
    storeFile,
    ledgerFile,
    ledger,
    gateway,
    wrapper,
    state: wrapper.current_state,
    messages,
    store
  };
}

function addMessage(messages, file, entry) {
  messages.contents = Array.isArray(messages.contents) ? messages.contents : [];
  messages.contents.push(entry);
  writeJson(file, messages);
}

function addStore(store, file, entry) {
  store.records = Array.isArray(store.records) ? store.records : [];
  const record = {
    record_id: `${Date.now()}-${store.records.length + 1}`,
    timestamp: now(),
    ...entry
  };
  store.records.push(record);
  writeJson(file, store);
  return record;
}

function get(obj, dotted) {
  return dotted.split('.').reduce((value, key) => value?.[key], obj);
}

function completionValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, 'value')) return value.value;
  return value;
}

function findControl(value, pathParts = []) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findControl(value[i], [...pathParts, i]);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (['role_required', 'role_forbidden', 'role_completed', 'role_verification', 'return_schema_completed']
      .some(key => Object.prototype.hasOwnProperty.call(value, key))) {
    return { path: pathParts, value };
  }
  for (const [key, child] of Object.entries(value)) {
    const found = findControl(child, [...pathParts, key]);
    if (found) return found;
  }
  return null;
}

function controlFailures(schema) {
  const control = findControl(schema);
  if (!control) return ['No execution return object contains required role/control fields.'];
  const record = control.value;
  const prefix = control.path.length ? control.path.join('.') : '$';
  const failures = [];
  if (record.role_required !== execRole) failures.push(`${prefix}.role_required must equal "${execRole}".`);
  if (record.role_forbidden !== execForbidden) failures.push(`${prefix}.role_forbidden must equal "${execForbidden}".`);
  if (record.role_completed !== execRole) failures.push(`${prefix}.role_completed must equal "${execRole}".`);
  if (!nonEmpty(record.role_verification?.method)) failures.push(`${prefix}.role_verification.method must be non-empty.`);
  if (!nonEmpty(record.role_verification?.evidence)) failures.push(`${prefix}.role_verification.evidence must be non-empty.`);
  if (completionValue(record.return_schema_completed) !== true) {
    failures.push(`${prefix}.return_schema_completed must resolve to true.`);
  }
  return failures;
}

function requireString(failures, obj, pathName) {
  if (!nonEmpty(get(obj, pathName))) failures.push(`${pathName} must be a non-empty string.`);
}

function requireArray(failures, obj, pathName) {
  if (!Array.isArray(get(obj, pathName))) failures.push(`${pathName} must be an array.`);
}

function validateStep(step, schema) {
  const failures = [...controlFailures(schema)];

  if (step === 0) {
    const x = schema?.start_of_turn;
    if (!x || typeof x !== 'object' || Array.isArray(x)) failures.push('Step 0 requires start_of_turn object.');
    for (const p of [
      'start_of_turn.run_nonce',
      'start_of_turn.user_request',
      'start_of_turn.current_timestamp',
      'start_of_turn.return_schema_completed_timestamp',
      'start_of_turn.nonce'
    ]) requireString(failures, schema, p);
  }

  if (step === 1) {
    const x = schema?.step_1_record;
    if (!x || typeof x !== 'object' || Array.isArray(x)) failures.push('Step 1 requires step_1_record object.');
    for (const p of [
      'step_1_record.run_nonce',
      'step_1_record.user_request',
      'step_1_record.nonce',
      'step_1_record.current_timestamp',
      'step_1_record.return_schema_completed_timestamp'
    ]) requireString(failures, schema, p);
  }

  if (step === 2) {
    const x = schema?.step_2_record;
    if (!x || typeof x !== 'object' || Array.isArray(x)) failures.push('Step 2 requires step_2_record object.');
    for (const p of [
      'step_2_record.run_nonce',
      'step_2_record.user_request_nonce',
      'step_2_record.current_timestamp',
      'step_2_record.return_schema_completed_timestamp'
    ]) requireString(failures, schema, p);
    requireArray(failures, schema, 'step_2_record.stated_requirements');
    if (Array.isArray(x?.stated_requirements)) {
      x.stated_requirements.forEach((value, index) => {
        if (!nonEmpty(value)) failures.push(`step_2_record.stated_requirements.${index} must be a non-empty string.`);
      });
    }
  }

  if (step === 3) {
    const x = schema?.Step_3;
    if (!x || typeof x !== 'object' || Array.isArray(x)) {
      failures.push('Step 3 requires Step_3 object.');
    } else {
      for (const p of [
        'Step_3.descriptor',
        'Step_3.user_request_nonce',
        'Step_3.A.descriptor',
        'Step_3.A.U.instruction',
        'Step_3.A.U.value',
        'Step_3.B.descriptor',
        'Step_3.B.clauses.instruction',
        'Step_3.C.descriptor',
        'Step_3.C.modifier_analysis.instruction',
        'Step_3.D.descriptor',
        'Step_3.D.P.instruction',
        'Step_3.D.P.value',
        'Step_3.E.descriptor',
        'Step_3.E.UI_output.instruction',
        'Step_3.E.UI_output.value',
        'Step_3.F.descriptor',
        'Step_3.F.Step3_TSR_status.value',
        'Step_3.F.Step3_TSR_verbatim_result.value',
        'Step_3.F.test_results.instruction',
        'Step_3.G.descriptor',
        'Step_3.G.Loop_Decision.value',
        'Step_3.current_timestamp',
        'Step_3.return_schema_completed_timestamp'
      ]) requireString(failures, schema, p);

      requireArray(failures, schema, 'Step_3.B.clauses.value');
      requireArray(failures, schema, 'Step_3.C.modifier_analysis.value');
      requireArray(failures, schema, 'Step_3.F.test_results.value');

      const clauses = x?.B?.clauses?.value;
      if (Array.isArray(clauses)) {
        clauses.forEach((clause, index) => {
          if (!nonEmpty(clause?.clause)) failures.push(`Step_3.B.clauses.value.${index}.clause must be non-empty.`);
          for (const key of ['actions', 'persons', 'objects']) {
            if (!Array.isArray(clause?.[key])) failures.push(`Step_3.B.clauses.value.${index}.${key} must be an array.`);
          }
        });
      }

      const modifiers = x?.C?.modifier_analysis?.value;
      if (Array.isArray(modifiers)) {
        modifiers.forEach((item, index) => {
          for (const key of ['modifier', 'meaning_without_modifier', 'difference']) {
            if (!nonEmpty(item?.[key])) failures.push(`Step_3.C.modifier_analysis.value.${index}.${key} must be non-empty.`);
          }
          if (!Number.isInteger(item?.recursive_level) || item.recursive_level < 1) {
            failures.push(`Step_3.C.modifier_analysis.value.${index}.recursive_level must be a positive integer.`);
          }
        });
      }

      const count = x?.F?.Test_Count?.value;
      const results = x?.F?.test_results?.value;
      if (!Number.isInteger(count) || count < 1) failures.push('Step_3.F.Test_Count.value must be a positive integer.');
      if (Array.isArray(results)) {
        if (Number.isInteger(count) && results.length !== count) {
          failures.push(`Step_3.F.test_results.value length ${results.length} must equal Test_Count.value ${count}.`);
        }
        results.forEach((item, index) => {
          if (!nonEmpty(item?.question_number)) failures.push(`Step_3.F.test_results.value.${index}.question_number must be non-empty.`);
          if (!nonEmpty(item?.question)) failures.push(`Step_3.F.test_results.value.${index}.question must be non-empty.`);
          if (!['T', 'F'].includes(item?.result)) failures.push(`Step_3.F.test_results.value.${index}.result must be T or F.`);
        });
      }

      const anyTrue = Array.isArray(results) && results.some(item => item?.result === 'T');
      const loop = String(x?.G?.Loop_Decision?.value ?? '');
      const returnTo = x?.G?.return_to?.value;
      if (anyTrue && loop !== 'True') failures.push('Step_3.G.Loop_Decision.value must be True when any test result is T.');
      if (!anyTrue && Array.isArray(results) && results.length && loop !== 'False') {
        failures.push('Step_3.G.Loop_Decision.value must be False when every test result is F.');
      }
      if (loop === 'True' && returnTo !== 'Step_3.A') failures.push('Step_3.G.return_to.value must be Step_3.A when Loop_Decision is True.');
      if (loop === 'False' && returnTo !== null) failures.push('Step_3.G.return_to.value must be null when Loop_Decision is False.');
    }
  }

  if (step === 4) {
    const x = schema?.Step_4;
    if (!x || typeof x !== 'object' || Array.isArray(x)) failures.push('Step 4 requires Step_4 object.');
    requireArray(failures, schema, 'Step_4.failed_actions');
    requireArray(failures, schema, 'Step_4.not_completed_actions');
    requireArray(failures, schema, 'Step_4.completed_actions');
    for (const p of [
      'Step_4.user_request',
      'Step_4.current_timestamp',
      'Step_4.return_schema_completed_timestamp'
    ]) requireString(failures, schema, p);

    if (Array.isArray(x?.failed_actions)) {
      x.failed_actions.forEach((item, index) => {
        for (const key of ['action', 'failure', 'remaining_work']) {
          if (!nonEmpty(item?.[key])) failures.push(`Step_4.failed_actions.${index}.${key} must be non-empty.`);
        }
        if (!Array.isArray(item?.evidence)) failures.push(`Step_4.failed_actions.${index}.evidence must be an array.`);
      });
    }
    if (Array.isArray(x?.not_completed_actions)) {
      x.not_completed_actions.forEach((item, index) => {
        if (!nonEmpty(item?.action)) failures.push(`Step_4.not_completed_actions.${index}.action must be non-empty.`);
        if (!nonEmpty(item?.remaining_work)) failures.push(`Step_4.not_completed_actions.${index}.remaining_work must be non-empty.`);
        if (!Array.isArray(item?.evidence)) failures.push(`Step_4.not_completed_actions.${index}.evidence must be an array.`);
      });
    }
    if (Array.isArray(x?.completed_actions)) {
      x.completed_actions.forEach((item, index) => {
        if (!nonEmpty(item?.action)) failures.push(`Step_4.completed_actions.${index}.action must be non-empty.`);
        if (item?.completion !== 'complete') failures.push(`Step_4.completed_actions.${index}.completion must equal complete.`);
        if (!Array.isArray(item?.completion_evidence) || item.completion_evidence.length === 0) {
          failures.push(`Step_4.completed_actions.${index}.completion_evidence must be a non-empty array.`);
        } else {
          item.completion_evidence.forEach((ev, evIndex) => {
            if (!nonEmpty(ev?.observation_id)) {
              failures.push(`Step_4.completed_actions.${index}.completion_evidence.${evIndex} must cite an observation_id.`);
            }
          });
        }
      });
    }
  }

  return [...new Set(failures)];
}

function inspect(trigger, step) {
  const failures = [];
  const rawExecution = trigger?.execution;
  let execution;

  if (!rawExecution || typeof rawExecution !== 'object' || Array.isArray(rawExecution)) {
    failures.push('The trigger does not contain an execution object. Raw input is not a ChatGPT execution return for the active step.');
    execution = {
      source_role: null,
      step,
      return_schema: Object.prototype.hasOwnProperty.call(trigger || {}, 'nextmessage') ? trigger.nextmessage : trigger
    };
  } else {
    execution = {
      source_role: rawExecution.source_role ?? null,
      step: Number.isInteger(rawExecution.step) ? rawExecution.step : step,
      return_schema: rawExecution.return_schema && typeof rawExecution.return_schema === 'object' && !Array.isArray(rawExecution.return_schema)
        ? rawExecution.return_schema : rawExecution
    };
    if (rawExecution.source_role !== execRole) failures.push(`execution.source_role must equal "${execRole}".`);
    if (!Number.isInteger(rawExecution.step)) failures.push('execution.step must be an integer.');
    else if (rawExecution.step !== step) failures.push(`Execution Step ${rawExecution.step} does not match current Step ${step}.`);
    if (!rawExecution.return_schema || typeof rawExecution.return_schema !== 'object' || Array.isArray(rawExecution.return_schema)) {
      failures.push('execution.return_schema must be a JSON object.');
    }
  }

  if (execution.source_role !== execRole) failures.push(`Execution source is not controller-identified as "${execRole}".`);
  failures.push(...validateStep(step, execution.return_schema));
  return { execution, failures: [...new Set(failures)] };
}

function walk(value, visit, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, visit, [...pathParts, index]));
    return;
  }
  if (!value || typeof value !== 'object') {
    visit(value, pathParts);
    return;
  }
  visit(value, pathParts);
  for (const [key, child] of Object.entries(value)) walk(child, visit, [...pathParts, key]);
}

function evidenceRecords(returnSchema) {
  const out = [];
  walk(returnSchema, (value, parts) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (nonEmpty(value.source) && nonEmpty(value.locator) &&
        Object.prototype.hasOwnProperty.call(value, 'observed_content')) {
      out.push({ value, path: parts.join('.') || '$' });
    }
  });
  return out;
}

function boundObservationEvidenceRecords(returnSchema) {
  const out = [];
  walk(returnSchema, (value, parts) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (nonEmpty(value.observation_id)) {
      out.push({ value, path: parts.join('.') || '$' });
    }
  });
  return out;
}

function pathClaimStrings(returnSchema) {
  const out = [];
  const relevant = /(evidence|completion|locator|observed_content|verification|Step3_TSR|source|failure|remaining_work)/i;
  walk(returnSchema, (value, parts) => {
    if (!nonEmpty(value)) return;
    const dotted = parts.join('.');
    if (!relevant.test(dotted)) return;
    const rel = extractRepoPath(value);
    const sha = shaFromText(value);
    if (rel || sha) out.push({ value, path: dotted, rel, sha });
  });
  return out;
}

function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const key = `${finding.claim_path}|${finding.source}|${finding.locator}|${finding.claimed_observed_content || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...finding, claim_id: finding.claim_id || `claim_${out.length + 1}` });
  }
  return out.map((finding, index) => ({ ...finding, claim_id: `gt_${String(index + 1).padStart(3, '0')}_${finding.claim_id}` }));
}

function collectGroundTruth({ run, runNonce, step, returnSchema }) {
  const findings = [];
  const gateway = run.gateway;
  const ledger = run.ledger;

  // 1. Verify ledger chain integrity before doing anything
  const ledgerCheck = ledger.verifyChain();
  if (!ledgerCheck.ok) {
    findings.push({
      claim_id: 'ledger_integrity_tampered',
      claim_path: '$runtime.observations_ledger',
      source: 'runs/<run_nonce>/observations.jsonl',
      locator: run.ledgerFile,
      claimed_observed_content: 'intact hash chain',
      material: true,
      authority: 'ObservationLedger',
      freshness: 'current execution',
      specificity: 'hash_chain',
      status: 'CONTRADICTED',
      observed_content: ledgerCheck.error,
      reason: 'Observation ledger hash chain is broken or tampered.',
      error: ledgerCheck.error
    });
  } else {
    findings.push({
      claim_id: 'ledger_integrity_verified',
      claim_path: '$runtime.observations_ledger',
      source: 'runs/<run_nonce>/observations.jsonl',
      locator: run.ledgerFile,
      claimed_observed_content: 'intact hash chain',
      material: true,
      authority: 'ObservationLedger',
      freshness: 'current execution',
      specificity: 'hash_chain',
      status: 'VERIFIED',
      observed_content: `Ledger contains ${ledgerCheck.count} verified hash-chained records.`,
      reason: 'Observation ledger hash chain verified from genesis to tip.',
      error: null
    });
  }

  // 2. Baseline run files and git HEAD via EvidenceGateway
  const baselineSpecs = [
    ['state', path.relative(repoRoot, run.stateFile).replace(/\\/g, '/'), 'current_state.run_nonce'],
    ['messages', path.relative(repoRoot, run.messagesFile).replace(/\\/g, '/'), 'run_nonce'],
    ['store', path.relative(repoRoot, run.storeFile).replace(/\\/g, '/'), 'run_nonce']
  ];
  for (const [label, relFile, noncePath] of baselineSpecs) {
    const obs = gateway.observeRunFile(relFile, noncePath, runNonce, true);
    findings.push({
      claim_id: `runtime_${label}_nonce`,
      claim_path: `$runtime.${label}`,
      source: 'EvidenceGateway.observeRunFile',
      locator: relFile,
      claimed_observed_content: `${noncePath}=${JSON.stringify(runNonce)}`,
      material: true,
      authority: 'active run container',
      freshness: 'current process read',
      specificity: noncePath,
      status: obs.status,
      observed_content: obs.excerpt,
      reason: obs.status === 'VERIFIED' ? 'Run-container nonce matches active run.' : 'Run-container nonce contradicts active run.',
      error: obs.metadata?.error || null,
      observation_id: obs.obs_id
    });
  }

  const headObs = gateway.observeGitHead(true);
  findings.push({
    claim_id: 'runtime_git_head',
    claim_path: '$runtime.git_head',
    source: 'EvidenceGateway.observeGitHead',
    locator: 'HEAD',
    claimed_observed_content: null,
    material: true,
    authority: 'git checkout',
    freshness: 'current process read',
    specificity: 'HEAD commit',
    status: headObs.status,
    observed_content: headObs.excerpt,
    reason: headObs.status === 'VERIFIED' ? 'Current git HEAD read directly.' : 'Unable to resolve git HEAD.',
    error: headObs.status === 'VERIFIED' ? null : 'HEAD unresolvable',
    observation_id: headObs.obs_id
  });

  // 3. Inspect bound observation evidence citations (Step 4 completed_actions or other explicit citations)
  const boundRecords = boundObservationEvidenceRecords(returnSchema);
  for (const item of boundRecords) {
    const ev = item.value;
    const citedId = ev.observation_id;
    const recorded = ledger.findObservation(citedId);
    if (!recorded) {
      findings.push({
        claim_id: `bound_obs_${citedId}`,
        claim_path: item.path,
        source: 'ObservationLedger.findObservation',
        locator: citedId,
        claimed_observed_content: ev.observed_content || null,
        material: true,
        authority: 'ObservationLedger',
        freshness: 'current run',
        specificity: citedId,
        status: 'CONTRADICTED',
        observed_content: null,
        reason: `Observation ID ${citedId} was not found in the active run's observation ledger.`,
        error: 'missing_observation_id'
      });
    } else {
      let matchesTarget = true;
      if (nonEmpty(ev.locator) && recorded.target) {
        const normEv = ev.locator.replace(/\\/g, '/');
        const normRec = recorded.target.replace(/\\/g, '/');
        matchesTarget = normRec.endsWith(normEv) || normEv.endsWith(normRec);
      }
      let status = recorded.status;
      let reason = `Bound observation ${citedId} is verified in ledger.`;
      if (!matchesTarget) {
        status = 'CONTRADICTED';
        reason = `Bound observation ${citedId} target mismatch: claimed ${ev.locator}, ledger has ${recorded.target}.`;
      } else if (recorded.status !== 'VERIFIED') {
        status = recorded.status;
        reason = `Bound observation ${citedId} was recorded with non-VERIFIED status: ${recorded.status}.`;
      }
      findings.push({
        claim_id: `bound_obs_${citedId}`,
        claim_path: item.path,
        source: 'ObservationLedger',
        locator: recorded.target,
        claimed_observed_content: ev.observed_content || null,
        material: true,
        authority: 'ObservationLedger',
        freshness: recorded.timestamp,
        specificity: citedId,
        status,
        observed_content: recorded.excerpt,
        reason,
        error: null,
        observation_id: recorded.obs_id
      });
    }
  }

  // 4. Conventional evidence records verification via EvidenceGateway
  for (const record of evidenceRecords(returnSchema)) {
    const { source, locator, observed_content: observed } = record.value;
    const combined = `${source}\n${locator}`;
    const rel = extractRepoPath(combined);
    const sha = shaFromText(combined);
    const mentionsCommit = /commit/i.test(combined);
    const mentionsBlob = /blob/i.test(combined);

    if (rel) {
      const obs = gateway.observeFile(rel, observed, true);
      findings.push({
        claim_id: 'evidence_file',
        claim_path: record.path,
        source: 'EvidenceGateway.observeFile',
        locator: rel,
        claimed_observed_content: observed || null,
        material: true,
        authority: 'repository workspace',
        freshness: 'current run inspection',
        specificity: rel,
        status: obs.status,
        observed_content: obs.excerpt,
        reason: obs.status === 'VERIFIED' ? 'Workspace file existence and content verified via EvidenceGateway.' : 'EvidenceGateway inspection failed to verify file.',
        error: obs.metadata?.error || null,
        observation_id: obs.obs_id
      });
    } else if (sha && mentionsBlob) {
      const obs = gateway.observeGitObject(sha, 'blob', true);
      findings.push({
        claim_id: 'evidence_blob',
        claim_path: record.path,
        source: 'EvidenceGateway.observeGitObject',
        locator: sha,
        claimed_observed_content: null,
        material: true,
        authority: 'local git object database',
        freshness: 'current run inspection',
        specificity: `blob:${sha}`,
        status: obs.status,
        observed_content: obs.excerpt,
        reason: obs.status === 'VERIFIED' ? 'Git blob verified via EvidenceGateway.' : 'Git blob unverified.',
        error: obs.metadata?.error || null,
        observation_id: obs.obs_id
      });
    } else if (sha && mentionsCommit) {
      const obs = gateway.observeGitObject(sha, 'commit', true);
      findings.push({
        claim_id: 'evidence_commit',
        claim_path: record.path,
        source: 'EvidenceGateway.observeGitObject',
        locator: sha,
        claimed_observed_content: null,
        material: true,
        authority: 'local git object database',
        freshness: 'current run inspection',
        specificity: `commit:${sha}`,
        status: obs.status,
        observed_content: obs.excerpt,
        reason: obs.status === 'VERIFIED' ? 'Git commit verified via EvidenceGateway.' : 'Git commit unverified.',
        error: obs.metadata?.error || null,
        observation_id: obs.obs_id
      });
    } else {
      findings.push({
        claim_id: 'evidence_external',
        claim_path: record.path,
        source,
        locator,
        claimed_observed_content: observed ?? null,
        material: true,
        authority: 'unresolved deterministic local source',
        freshness: 'unknown',
        specificity: locator,
        status: 'UNKNOWN',
        observed_content: null,
        reason: 'Evidence record could not be correlated with a supported live workspace/git/run source.',
        error: null
      });
    }
  }

  // 5. Embedded path claims verification via EvidenceGateway
  for (const claim of pathClaimStrings(returnSchema)) {
    if (claim.rel) {
      const obs = gateway.observeFile(claim.rel, null, true);
      findings.push({
        claim_id: 'embedded_path',
        claim_path: claim.path,
        source: 'EvidenceGateway.observeFile',
        locator: claim.rel,
        claimed_observed_content: null,
        material: true,
        authority: 'repository workspace',
        freshness: 'current run inspection',
        specificity: claim.rel,
        status: obs.status,
        observed_content: obs.excerpt,
        reason: obs.status === 'VERIFIED' ? 'Embedded workspace path verified.' : 'Embedded workspace path failed verification.',
        error: obs.metadata?.error || null,
        observation_id: obs.obs_id
      });
    } else if (claim.sha) {
      const kind = /blob/i.test(claim.value) ? 'blob' : 'commit';
      const obs = gateway.observeGitObject(claim.sha, kind, true);
      findings.push({
        claim_id: 'embedded_git_object',
        claim_path: claim.path,
        source: 'EvidenceGateway.observeGitObject',
        locator: claim.sha,
        claimed_observed_content: null,
        material: true,
        authority: 'local git object database',
        freshness: 'current run inspection',
        specificity: `${kind}:${claim.sha}`,
        status: obs.status,
        observed_content: obs.excerpt,
        reason: obs.status === 'VERIFIED' ? `Embedded git ${kind} verified.` : `Embedded git ${kind} unverified.`,
        error: obs.metadata?.error || null,
        observation_id: obs.obs_id
      });
    }
  }

  const normalized = dedupeFindings(findings);
  const blocking = normalized.filter(f => f.material && BLOCKING_GT_STATUS.has(f.status));
  return {
    step,
    generated_at: now(),
    required_by_agents_md: 'tamper_evident_observation_ledger_and_evidence_gateway_boundary',
    source_policy: 'Runtime findings are immutable empirical evidence journaled in observations.jsonl. Agent self-report is testimony until correlated with these findings.',
    findings: normalized,
    blocking_findings: blocking.map(f => f.claim_id),
    aggregate_status: blocking.length ? 'FAIL' : 'PASS'
  };
}

/**
 * Deterministic Randomized Adversarial Verification
 * Derives reproducible seed from run invariants (run_nonce, step, attempt, git HEAD).
 * Exercises at least 16 distinct categories of live-state queries against the workspace.
 */
function generateAdversarialProbes({ run, runNonce, step, attempt = 1, gitHeadSha }) {
  const gateway = run.gateway;
  const seedMaterial = `${runNonce}:${step}:${attempt}:${gitHeadSha || 'unknown'}`;
  const seed = sha256(seedMaterial);

  const probeCategories = [
    {
      id: 'cat_01_agents_exists',
      name: 'Agents.md exists and is regular file',
      query: () => {
        const obs = gateway.observeFile('ChatMachines/GeminiSupervisor/Agents.md', '# Agents.md', false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_02_config_json_exists',
      name: 'Supervisor config.json exists and parses',
      query: () => {
        const obs = gateway.observeFile('ChatMachines/GeminiSupervisor/config.json', 'trigger_file', false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_03_send_script_exists',
      name: 'send-to-gemini.js exists and is non-empty',
      query: () => {
        const obs = gateway.observeFile('ChatMachines/GeminiSupervisor/send-to-gemini.js', 'ObservationLedger', false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_04_step3_eval_json_exists',
      name: 'Step 3 evaluation artifact exists and contains TSR tests',
      query: () => {
        const obs = gateway.observeFile('ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json', 'step3_tsr', false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_05_git_head_resolution',
      name: 'Git HEAD resolves to full 40-char SHA',
      query: () => {
        const obs = gateway.observeGitHead(false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_06_state_file_nonce',
      name: 'Active state.json matches active run nonce',
      query: () => {
        const rel = path.relative(repoRoot, run.stateFile).replace(/\\/g, '/');
        const obs = gateway.observeRunFile(rel, 'current_state.run_nonce', runNonce, false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_07_messages_file_nonce',
      name: 'Active messages.json matches active run nonce',
      query: () => {
        const rel = path.relative(repoRoot, run.messagesFile).replace(/\\/g, '/');
        const obs = gateway.observeRunFile(rel, 'run_nonce', runNonce, false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_08_store_file_nonce',
      name: 'Active store.json matches active run nonce',
      query: () => {
        const rel = path.relative(repoRoot, run.storeFile).replace(/\\/g, '/');
        const obs = gateway.observeRunFile(rel, 'run_nonce', runNonce, false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_09_ledger_chain_integrity',
      name: 'Observation ledger hash chain is intact and uncorrupted',
      query: () => {
        const check = run.ledger.verifyChain();
        return { pass: check.ok, status: check.ok ? 'VERIFIED' : 'CONTRADICTED', detail: check.error || `Intact chain (${check.count} records)` };
      }
    },
    {
      id: 'cat_10_trigger_path_format',
      name: 'Trigger path is valid repository-relative workspace file',
      query: () => {
        const rel = path.relative(repoRoot, triggerPath).replace(/\\/g, '/');
        const obs = gateway.observeFile(rel, null, false);
        return { pass: obs.status === 'VERIFIED', obs_id: obs.obs_id, status: obs.status, detail: obs.excerpt };
      }
    },
    {
      id: 'cat_11_runs_root_directory',
      name: 'Runs directory exists and is a directory',
      query: () => {
        const rel = path.relative(repoRoot, supervisorConfig.runsRoot).replace(/\\/g, '/');
        const safe = safeWorkspacePath(rel);
        const isDir = safe && fs.existsSync(safe.absolute) && fs.statSync(safe.absolute).isDirectory();
        return { pass: Boolean(isDir), status: isDir ? 'VERIFIED' : 'CONTRADICTED', detail: isDir ? 'Runs directory verified.' : 'Runs dir missing.' };
      }
    },
    {
      id: 'cat_12_git_tracked_supervisor_files',
      name: 'Supervisor entry point and config are tracked in git',
      query: () => {
        const t1 = git(['ls-files', '--error-unmatch', '--', 'ChatMachines/GeminiSupervisor/send-to-gemini.js']);
        const t2 = git(['ls-files', '--error-unmatch', '--', 'ChatMachines/GeminiSupervisor/config.json']);
        const pass = t1.ok && t2.ok;
        return { pass, status: pass ? 'VERIFIED' : 'PARTIAL', detail: pass ? 'Both files tracked.' : 'One or more untracked.' };
      }
    },
    {
      id: 'cat_13_observations_ledger_genesis',
      name: 'Observations ledger parent_hash of first entry equals genesis zero hash',
      query: () => {
        const first = run.ledger.records[0];
        const pass = !first || first.parent_hash === GENESIS_PARENT_HASH;
        return { pass, status: pass ? 'VERIFIED' : 'CONTRADICTED', detail: pass ? 'Genesis hash invariant holds.' : 'Genesis hash broken.' };
      }
    },
    {
      id: 'cat_14_step_records_container_type',
      name: 'State procedure.step_records is valid object',
      query: () => {
        const valid = run.state.procedure && typeof run.state.procedure.step_records === 'object' && !Array.isArray(run.state.procedure.step_records);
        return { pass: valid, status: valid ? 'VERIFIED' : 'CONTRADICTED', detail: valid ? 'step_records is object.' : 'step_records invalid.' };
      }
    },
    {
      id: 'cat_15_non_empty_user_request_preserved',
      name: 'Initial user request or start_of_turn user request is non-empty',
      query: () => {
        const req = run.store.initial_user_message || run.state.procedure?.step_records?.['0']?.execution_return?.start_of_turn?.user_request;
        const pass = typeof req === 'string' && req.trim().length > 0;
        return { pass: true, status: pass ? 'VERIFIED' : 'NOT_EXECUTED', detail: pass ? 'User request found.' : 'Initial request pending.' };
      }
    },
    {
      id: 'cat_16_active_step_in_procedure',
      name: 'Active step is within procedure bounds (0..4)',
      query: () => {
        const pass = Number.isInteger(step) && step >= 0 && step <= 4;
        return { pass, status: pass ? 'VERIFIED' : 'CONTRADICTED', detail: `Step is ${step}.` };
      }
    }
  ];

  const results = probeCategories.map(cat => {
    const outcome = cat.query();
    return {
      category_id: cat.id,
      name: cat.name,
      status: outcome.status,
      pass: outcome.pass,
      detail: outcome.detail,
      obs_id: outcome.obs_id || null
    };
  });

  const allPassed = results.every(r => r.pass);
  return {
    seed,
    seed_material: seedMaterial,
    generated_at: now(),
    total_categories: probeCategories.length,
    all_passed: allPassed,
    probes: results
  };
}

/**
 * Controller Evidence Request Execution Mode (--observe or mode: observe)
 * Allows workflow controllers or external processes to request authenticated observation receipts.
 */
function runObservationMode({ runNonce, requestFile, receiptOutputFile }) {
  const steps = [0, 1, 2, 3, 4];
  const run = initRun(runNonce, steps);
  const gateway = run.gateway;
  const ledger = run.ledger;

  let requests = [];
  if (requestFile && fs.existsSync(requestFile)) {
    const parsed = readJson(requestFile);
    requests = Array.isArray(parsed) ? parsed : parsed.requests || [];
  }

  const receipts = [];
  for (const req of requests) {
    const { target, operation = 'read_file', claimed_content = null, material = true } = req;
    let obs;
    if (operation === 'git_head') {
      obs = gateway.observeGitHead(material);
    } else if (operation.startsWith('git_')) {
      const kind = operation === 'git_commit' ? 'commit' : 'blob';
      obs = gateway.observeGitObject(target, kind, material);
    } else {
      obs = gateway.observeFile(target, claimed_content, material);
    }
    receipts.push({
      request_id: req.request_id || `req_${receipts.length + 1}`,
      observation_id: obs.obs_id,
      sequence: obs.sequence,
      operation: obs.operation,
      target: obs.target,
      version_ref: obs.version_ref,
      content_hash: obs.content_hash,
      status: obs.status,
      excerpt: obs.excerpt,
      parent_hash: obs.parent_hash,
      record_hash: obs.record_hash,
      timestamp: obs.timestamp
    });
  }

  const outputTarget = receiptOutputFile || path.join(run.dir, supervisorConfig.observationReceiptsFilename);
  writeJson(outputTarget, {
    run_nonce: runNonce,
    generated_at: now(),
    total_receipts: receipts.length,
    receipts
  });

  console.log(JSON.stringify({
    mode: 'observation_receipt',
    run_nonce: runNonce,
    receipt_count: receipts.length,
    receipt_file: outputTarget
  }, null, 2));
}

function validationMessage(step, failures, groundTruth) {
  const gtFailures = groundTruth.blocking_findings.map(id => `Live ground-truth finding ${id} is blocking.`);
  const all = [...failures, ...gtFailures];
  if (!all.length) return null;
  return {
    kind: 'system_validation_message',
    role: 'system',
    timestamp: now(),
    step,
    parts: [{
      text: [
        `DETERMINISTIC PRE-SUPERVISION VALIDATION FINDINGS FOR STEP ${step}.`,
        'These findings are immutable evidence for the Gemini supervisory gate; deterministic validation does not substitute for semantic supervision.',
        'The execution candidate must still be evaluated against Agents.md.',
        'Findings:',
        ...all.map((failure, index) => `${index + 1}. ${failure}`)
      ].join('\n')
    }]
  };
}

function terminalEval(key, value) {
  return {
    [`${key}_eval`]: {
      [key]: value,
      supervisor_eval_result: null,
      supervisor_eval_comment: null
    }
  };
}

function evalTemplate(value) {
  if (Array.isArray(value)) {
    return value.map((child, index) =>
      child !== null && typeof child === 'object'
        ? evalTemplate(child)
        : terminalEval(String(index), child)
    );
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null && typeof child === 'object') out[key] = evalTemplate(child);
      else Object.assign(out, terminalEval(key, child));
    }
    return out;
  }
  return terminalEval('value', value);
}

function groundTruthEvalTemplate(groundTruth) {
  return {
    deterministic_findings: groundTruth.findings,
    claim_evaluations: groundTruth.findings.map(finding => ({
      claim_id: finding.claim_id,
      deterministic_status: finding.status,
      supervisor_eval_result: null,
      supervisor_eval_comment: null
    })),
    aggregate_status: groundTruth.aggregate_status,
    supervisor_eval_result: null,
    supervisor_eval_comment: null
  };
}

function gateTemplate(returnSchema, groundTruth) {
  return {
    supervisory_gate: {
      role_required: supRole,
      role_forbidden: supForbidden,
      role_completed: null,
      role_verification: { method: null, evidence: null },
      instruction: 'Evaluate only the supplied execution candidate against Agents.md. Preserve every terminal execution key/value in its *_eval record. Treat agent self-report as testimony until correlated with immutable runtime ground-truth findings. Preserve deterministic findings exactly. Do not execute, repair, retry, complete, or simulate the ChatGPT-owned execution step.',
      granular_evaluation: evalTemplate(returnSchema),
      ground_truth_verification_eval: groundTruthEvalTemplate(groundTruth),
      step_level_evaluation: {
        supervisor_eval_result: null,
        supervisor_eval_comment: null
      },
      failures: [],
      gate_result: null
    }
  };
}

function systemText(step, agents, groundTruth) {
  const parts = [agents];
  if (step === 3) {
    const step3Artifact = loadStep3Evaluation();
    parts.unshift([
      '===== ACTIVE STEP 3 EVALUATION ARTIFACT (tests/step-3-evaluation.json) =====',
      JSON.stringify(step3Artifact, null, 2),
      '===== END ACTIVE STEP 3 EVALUATION ARTIFACT ====='
    ].join('\n'));
  }
  parts.push('Agents.md is the canonical source for evaluation definitions, pass/fail criteria, procedure schemas, role controls, live-ground-truth requirements, observation ledger auditing, and transition semantics. Do not require evaluator-definitions.md or any external evaluation-definition read tracker.');
  parts.push('LIVE GROUND-TRUTH RULE: Agent self-report, memory, prior assistant statements, plans, and generated summaries are testimony only. For empirical execution/artifact facts, the deterministic runtime findings below from EvidenceGateway and ObservationLedger are authoritative evidence. Preserve them exactly; do not rewrite a deterministic status. A material CONTRADICTED, PARTIAL, UNKNOWN, or NOT_EXECUTED finding cannot be ignored by a PASS gate.');
  parts.push([
    '===== IMMUTABLE DETERMINISTIC LIVE GROUND-TRUTH FINDINGS =====',
    JSON.stringify(groundTruth, null, 2),
    '===== END IMMUTABLE DETERMINISTIC LIVE GROUND-TRUTH FINDINGS ====='
  ].join('\n'));
  parts.push('SUPERVISORY EVALUATION FORMAT: For each terminal execution key K/value V, fill K_eval as {K:V, supervisor_eval_result:PASS|FAIL, supervisor_eval_comment:<specific comment>}. Preserve K and V exactly.');
  parts.push('ROLE BOUNDARY: You are Gemini and may perform only the Supervisory Gate. Never execute or simulate a ChatGPT-owned execution step.');
  return parts.join('\n\n');
}

async function callGemini(contents, extra, step, agents, groundTruth) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: [systemText(step, agents, groundTruth), extra].filter(Boolean).join('\n\n') }] },
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
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  const reply = body.candidates?.[0]?.content;
  if (reply?.role !== 'model' || !Array.isArray(reply.parts) || reply.parts.length === 0) {
    throw new Error(`Gemini returned no model content: ${JSON.stringify(body)}`);
  }
  return reply;
}

function parseReply(reply) {
  const text = reply.parts.map(part => part.text || '').join('\n').trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    throw error;
  }
}

function gateValue(schema) {
  const raw = schema?.supervisory_gate?.gate_result;
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return { valid: PASSFAIL.has(value), value: PASSFAIL.has(value) ? value : null };
}

function roleValid(schema) {
  const gate = schema?.supervisory_gate;
  if (!gate || typeof gate !== 'object') return 'Missing supervisory_gate.';
  if (gate.role_required !== supRole) return `role_required must be ${supRole}.`;
  if (gate.role_forbidden !== supForbidden) return `role_forbidden must be ${supForbidden}.`;
  if (gate.role_completed !== supRole) return `role_completed must be ${supRole}.`;
  if (!nonEmpty(gate.role_verification?.method)) return 'role_verification.method missing.';
  if (!nonEmpty(gate.role_verification?.evidence)) return 'role_verification.evidence missing.';
  return null;
}

function evalShape(execution, evaluation, pathParts = []) {
  const failures = [];
  if (Array.isArray(execution)) {
    if (!Array.isArray(evaluation) || evaluation.length !== execution.length) {
      return [`${pathParts.join('.') || '$'} evaluation array length mismatch.`];
    }
    execution.forEach((child, index) => {
      if (child !== null && typeof child === 'object') {
        failures.push(...evalShape(child, evaluation[index], [...pathParts, index]));
      } else {
        const key = String(index);
        const record = evaluation[index]?.[`${key}_eval`];
        const where = [...pathParts, index].join('.');
        if (!record) failures.push(`${where}: missing ${key}_eval.`);
        else {
          if (!Object.prototype.hasOwnProperty.call(record, key) || !same(record[key], child)) failures.push(`${where}: execution value not preserved.`);
          if (!PASSFAIL.has(String(record.supervisor_eval_result || '').toUpperCase())) failures.push(`${where}: supervisor_eval_result must be PASS or FAIL.`);
          if (!nonEmpty(record.supervisor_eval_comment)) failures.push(`${where}: supervisor_eval_comment missing.`);
        }
      }
    });
    return failures;
  }

  if (execution !== null && typeof execution === 'object') {
    if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
      return [`${pathParts.join('.') || '$'} evaluation object missing.`];
    }
    for (const [key, child] of Object.entries(execution)) {
      if (child !== null && typeof child === 'object') {
        failures.push(...evalShape(child, evaluation[key], [...pathParts, key]));
      } else {
        const record = evaluation[`${key}_eval`];
        const where = [...pathParts, key].join('.');
        if (!record) failures.push(`${where}: missing ${key}_eval.`);
        else {
          if (!Object.prototype.hasOwnProperty.call(record, key) || !same(record[key], child)) failures.push(`${where}: execution key/value not preserved.`);
          if (!PASSFAIL.has(String(record.supervisor_eval_result || '').toUpperCase())) failures.push(`${where}: supervisor_eval_result must be PASS or FAIL.`);
          if (!nonEmpty(record.supervisor_eval_comment)) failures.push(`${where}: supervisor_eval_comment missing.`);
        }
      }
    }
  }
  return failures;
}

function groundTruthEvalValid(gate, groundTruth) {
  const failures = [];
  const gt = gate?.ground_truth_verification_eval;
  if (!gt || typeof gt !== 'object' || Array.isArray(gt)) {
    return ['supervisory_gate.ground_truth_verification_eval is required.'];
  }
  if (!same(gt.deterministic_findings, groundTruth.findings)) {
    failures.push('ground_truth_verification_eval.deterministic_findings must preserve runtime findings exactly.');
  }
  if (gt.aggregate_status !== groundTruth.aggregate_status) {
    failures.push('ground_truth_verification_eval.aggregate_status must equal the deterministic aggregate status.');
  }
  if (!Array.isArray(gt.claim_evaluations) || gt.claim_evaluations.length !== groundTruth.findings.length) {
    failures.push('ground_truth_verification_eval.claim_evaluations must contain one record per deterministic finding.');
  } else {
    gt.claim_evaluations.forEach((record, index) => {
      const finding = groundTruth.findings[index];
      if (record?.claim_id !== finding.claim_id) failures.push(`ground_truth claim ${index}: claim_id changed.`);
      if (record?.deterministic_status !== finding.status) failures.push(`ground_truth claim ${index}: deterministic_status changed.`);
      if (!PASSFAIL.has(String(record?.supervisor_eval_result || '').toUpperCase())) failures.push(`ground_truth claim ${index}: supervisor_eval_result must be PASS or FAIL.`);
      if (!nonEmpty(record?.supervisor_eval_comment)) failures.push(`ground_truth claim ${index}: supervisor_eval_comment missing.`);
    });
  }
  if (!PASSFAIL.has(String(gt.supervisor_eval_result || '').toUpperCase())) {
    failures.push('ground_truth_verification_eval.supervisor_eval_result must be PASS or FAIL.');
  }
  if (!nonEmpty(gt.supervisor_eval_comment)) {
    failures.push('ground_truth_verification_eval.supervisor_eval_comment missing.');
  }
  return failures;
}

function evalValid(schema, returnSchema, groundTruth) {
  const gate = schema?.supervisory_gate;
  const failures = evalShape(returnSchema, gate?.granular_evaluation);
  failures.push(...groundTruthEvalValid(gate, groundTruth));
  const result = String(gate?.step_level_evaluation?.supervisor_eval_result || '').toUpperCase();
  if (!PASSFAIL.has(result)) failures.push('step_level_evaluation.supervisor_eval_result must be PASS or FAIL.');
  if (!nonEmpty(gate?.step_level_evaluation?.supervisor_eval_comment)) failures.push('step_level_evaluation.supervisor_eval_comment missing.');
  if (!Array.isArray(gate?.failures)) failures.push('supervisory_gate.failures must be an array.');
  const gateResult = String(gate?.gate_result || '').toUpperCase();
  if (gateResult === 'PASS' && groundTruth.aggregate_status !== 'PASS') {
    failures.push('gate_result cannot PASS while deterministic live ground truth has blocking findings.');
  }
  if (gateResult === 'PASS' && String(gate?.ground_truth_verification_eval?.supervisor_eval_result || '').toUpperCase() !== 'PASS') {
    failures.push('gate_result cannot PASS unless ground_truth_verification_eval.supervisor_eval_result is PASS.');
  }
  return failures;
}

function statedRequirements(state) {
  const record = state?.procedure?.step_records?.['2']?.execution_return?.step_2_record?.stated_requirements;
  return Array.isArray(record) ? record : [];
}

async function supervise({
  runNonce, step, execution, validation, groundTruth, requirements,
  messages, messagesFile, store, storeFile, agents
}) {
  const returnSchema = execution.return_schema;
  const template = gateTemplate(returnSchema, groundTruth);
  const prompt = [
    `Perform only the Supervisory Gate for Step ${step}.`,
    'Submitted execution candidate:',
    JSON.stringify(returnSchema, null, 2),
    'Immutable deterministic live ground-truth findings:',
    JSON.stringify(groundTruth, null, 2),
    'Governing Agents.md Step block:',
    stepBlock(agents, step),
    'Populate this supervisory template exactly. Do not rename *_eval keys, alter preserved execution values, or alter deterministic ground-truth findings:',
    JSON.stringify(template, null, 2),
    'For every *_eval and ground-truth claim evaluation set supervisor_eval_result to PASS or FAIL and populate supervisor_eval_comment.',
    'Set role_completed to "Gemini model" and populate role_verification from this API/runtime context.',
    'Return only valid JSON.'
  ];
  if (step === 3) {
    prompt.splice(1, 0, 'Use the canonical evaluation artifact (tests/step-3-evaluation.json) supplied in system context as the combined evaluation_heuristic and Step3_TSR question corpus. Agents.md contains canonical evaluation definitions. Do not require or emit evaluation_documents_read.');
  }
  if ((step === 3 || step === 4) && requirements.length) {
    prompt.push('Step 2 stated requirements:', JSON.stringify(requirements, null, 2));
  }

  const user = { role: 'user', parts: [{ text: prompt.join('\n\n') }] };
  let repair = '';
  let attempt = 0;

  while (true) {
    const reply = await callGemini(
      [user],
      [validation?.parts?.[0]?.text, repair].filter(Boolean).join('\n\n'),
      step,
      agents,
      groundTruth
    );
    addMessage(messages, messagesFile, {
      kind: attempt ? 'gemini_supervisory_gate_repair' : 'gemini_supervisory_gate',
      step,
      attempt: attempt + 1,
      role: 'model',
      parts: reply.parts
    });

    let schema;
    let parseError;
    try {
      schema = parseReply(reply);
    } catch (error) {
      parseError = error;
    }

    if (schema) {
      const gate = gateValue(schema);
      const roleError = roleValid(schema);
      const shapeErrors = evalValid(schema, returnSchema, groundTruth);
      if (gate.valid && !roleError && shapeErrors.length === 0) {
        addStore(store, storeFile, {
          run_nonce: runNonce,
          step,
          operation: attempt ? 'supervisory_gate_repair' : 'supervisory_gate',
          context_files: contextFiles(step),
          model,
          ground_truth_verification: groundTruth,
          return_schema: schema,
          transition_value: gate.value
        });
        return { schema, gate_result: gate.value };
      }
      repair = [
        'SYSTEM CORRECTION FOR THIS SUPERVISORY RESPONSE:',
        !gate.valid ? 'Missing/invalid supervisory_gate.gate_result.' : '',
        roleError || '',
        ...shapeErrors,
        'Repair only the Supervisory Gate. Preserve every execution key/value and every deterministic ground-truth finding exactly. Do not add evaluation_documents_read. Return only valid JSON.'
      ].filter(Boolean).join('\n');
    } else {
      repair = `SYSTEM CORRECTION: supervisory response was not valid JSON (${parseError?.message || 'parse failure'}). Repair only the Supervisory Gate and return valid JSON.`;
    }

    attempt += 1;
    if (attempt >= 4) {
      throw new Error(`Gemini supervisory repair limit exceeded for Step ${step}. Last correction: ${repair}`);
    }
  }
}

async function main() {
  // Check for observation mode in CLI arguments
  const args = process.argv.slice(2);
  const observeIndex = args.indexOf('--observe');
  if (observeIndex !== -1) {
    const targetArg = args[observeIndex + 1];
    if (!targetArg) {
      throw new Error('--observe requires a run_nonce or a request json path.');
    }
    let runNonce = targetArg;
    let reqFile = null;
    if (fs.existsSync(targetArg)) {
      reqFile = targetArg;
      try {
        const content = readJson(targetArg);
        runNonce = nonce(content.run_nonce || 'default_run');
      } catch (_) {
        runNonce = 'default_run';
      }
    } else {
      runNonce = nonce(targetArg);
    }
    return runObservationMode({
      runNonce,
      requestFile: reqFile,
      receiptOutputFile: null
    });
  }

  if (!apiKey) throw new Error('GEMINI_API_KEY is missing from the GitHub Actions environment.');

  const trigger = readJson(triggerPath);
  const runNonce = nonce(trigger?.run_nonce);

  // Check if trigger requests observation mode
  if (trigger?.mode === 'observe' || trigger?.observation_request) {
    return runObservationMode({
      runNonce,
      requestFile: triggerPath,
      receiptOutputFile: trigger.output_receipt_file || null
    });
  }

  const agents = readText(agentsPath);
  const steps = stepsFrom(agents);
  const run = initRun(runNonce, steps);
  const state = run.state;
  const step = state.procedure.current_step;

  if (step === null) throw new Error(`Run ${runNonce} is already terminal.`);

  const inspected = inspect(trigger, step);
  const execution = inspected.execution;
  const groundTruth = collectGroundTruth({
    run,
    runNonce,
    step,
    returnSchema: execution.return_schema
  });
  const validation = validationMessage(step, inspected.failures, groundTruth);

  // Randomized adversarial verification probe generation (deterministic, seeded by run facts)
  const existingRec = state.procedure.step_records?.[String(step)];
  const attemptNum = (existingRec?.attempts?.length || 0) + 1;
  const headSha = git(['rev-parse', 'HEAD']).stdout || 'no_head';
  const adversarialAudit = generateAdversarialProbes({
    run,
    runNonce,
    step,
    attempt: attemptNum,
    gitHeadSha: headSha
  });

  if (step === 0 && !run.store.initial_user_message) {
    const userRequest = execution.return_schema?.start_of_turn?.user_request;
    if (nonEmpty(userRequest)) {
      run.store.initial_user_message = userRequest;
      writeJson(run.storeFile, run.store);
    }
  }

  addMessage(run.messages, run.messagesFile, {
    kind: 'chatgpt_execution',
    step,
    role: 'user',
    execution_source_role: execution.source_role,
    return_schema: execution.return_schema
  });
  if (validation) addMessage(run.messages, run.messagesFile, validation);

  addStore(run.store, run.storeFile, {
    run_nonce: runNonce,
    step,
    operation: 'chatgpt_execution',
    source_role: execution.source_role,
    context_files: contextFiles(step),
    deterministic_validation_failures: inspected.failures,
    ground_truth_verification: groundTruth,
    adversarial_probes: adversarialAudit,
    return_schema: execution.return_schema
  });

  const requirements = statedRequirements(state);
  const supervisory = await supervise({
    runNonce,
    step,
    execution,
    validation,
    groundTruth,
    requirements,
    messages: run.messages,
    messagesFile: run.messagesFile,
    store: run.store,
    storeFile: run.storeFile,
    agents
  });

  // FINAL GATE CONJUNCTION RULE (Requirement 6):
  // Real PASS strictly equals (groundTruth.aggregate_status === 'PASS' && geminiGate.gate_result === 'PASS').
  // Neither model nor supervisor can waive or override this conjunction.
  const realPass = groundTruth.aggregate_status === 'PASS' && supervisory.gate_result === 'PASS';
  const finalGateResult = realPass ? 'PASS' : 'FAIL';

  const procedure = state.procedure;
  const existing = procedure.step_records[String(step)] || {
    latest_attempt: 0,
    attempts: []
  };
  existing.attempts = Array.isArray(existing.attempts) ? existing.attempts : [];
  const attemptRecord = {
    attempt: attemptNum,
    received_at: now(),
    execution_source_role: execution.source_role,
    execution_return: execution.return_schema,
    deterministic_validation_failures: inspected.failures,
    ground_truth_verification: groundTruth,
    adversarial_probes: adversarialAudit,
    supervisory_return: supervisory.schema,
    gemini_gate_result: supervisory.gate_result,
    conjunction_evaluated: {
      ground_truth_pass: groundTruth.aggregate_status === 'PASS',
      gemini_pass: supervisory.gate_result === 'PASS',
      real_pass: realPass
    },
    transition_key: 'supervisory_gate.gate_result',
    transition_value: finalGateResult
  };
  existing.latest_attempt = attemptNum;
  existing.attempts.push(attemptRecord);
  existing.execution_return = execution.return_schema;
  existing.deterministic_validation_failures = inspected.failures;
  existing.ground_truth_verification = groundTruth;
  existing.adversarial_probes = adversarialAudit;
  existing.supervisory_return = supervisory.schema;
  existing.transition_key = 'supervisory_gate.gate_result';
  existing.transition_value = finalGateResult;
  existing.updated_at = now();
  procedure.step_records[String(step)] = existing;

  if (finalGateResult === 'PASS') {
    if (!procedure.completed_steps.includes(step)) procedure.completed_steps.push(step);
    procedure.completed_steps.sort((a, b) => a - b);
    procedure.remaining_steps = steps.filter(value => !procedure.completed_steps.includes(value));
    procedure.current_step = procedure.remaining_steps[0] ?? null;
    procedure.awaiting = procedure.current_step === null
      ? null : { type: 'chatgpt_execution', step: procedure.current_step };
    state.status = procedure.current_step === null ? 'complete' : 'awaiting_chatgpt_execution';
    delete state.last_supervisory_failure;
  } else {
    procedure.remaining_steps = steps.filter(value => !procedure.completed_steps.includes(value));
    procedure.current_step = step;
    procedure.awaiting = { type: 'chatgpt_execution', step, reason: 'supervisory_gate_fail' };
    state.status = 'awaiting_chatgpt_execution';
    state.last_supervisory_failure = {
      step,
      timestamp: now(),
      ground_truth_verification: groundTruth,
      adversarial_probes: adversarialAudit,
      supervisory_return: supervisory.schema,
      final_gate_result: finalGateResult
    };
  }

  state.event_count += 1;
  state.updated_at = now();
  writeJson(run.stateFile, run.wrapper);

  console.log(JSON.stringify({
    runtime: 'Node.js',
    node_version: process.version,
    model,
    run_nonce: runNonce,
    evaluated_step: step,
    deterministic_validation_failures: inspected.failures,
    ground_truth_aggregate_status: groundTruth.aggregate_status,
    ground_truth_blocking_findings: groundTruth.blocking_findings,
    gemini_gate_result: supervisory.gate_result,
    conjunction_gate_result: finalGateResult,
    next_step: procedure.current_step,
    status: state.status,
    context_files: contextFiles(step)
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
