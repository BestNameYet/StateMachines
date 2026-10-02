const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const triggerPath = path.join(root, 'historical-audit-nextmessage', 'nextmessage.json');
const trigger = JSON.parse(fs.readFileSync(triggerPath, 'utf8'));
const runNonce = String(trigger.run_nonce || '').trim();
const runRoot = path.join(root, 'evaluations', runNonce);
const liveRoot = path.join(runRoot, 'live-view');
const status = process.argv[2] || 'running';
const attempt = process.argv[3] ? Number(process.argv[3]) : null;
const processLogPath = path.join(runRoot, 'process.log');

if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runNonce)) throw new Error(`Invalid run_nonce: ${runNonce}`);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, filePath);
}

function copyJsonSnapshot(source, destination) {
  const parsed = readJson(source);
  if (!parsed) return false;
  writeJsonAtomic(destination, parsed);
  return true;
}

function listJsonFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath).filter(name => name.endsWith('.json')).sort();
  } catch (_) {
    return [];
  }
}

function tailLines(filePath, count) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    return lines.slice(Math.max(0, lines.length - count)).join('\n');
  } catch (_) {
    return '';
  }
}

fs.mkdirSync(liveRoot, { recursive: true });

const plannerPath = path.join(runRoot, 'planner.json');
const planner = readJson(plannerPath);
if (planner) copyJsonSnapshot(plannerPath, path.join(liveRoot, 'planner.json'));

const subDir = path.join(runRoot, 'subevaluations');
const subFiles = listJsonFiles(subDir);
for (const name of subFiles) {
  copyJsonSnapshot(path.join(subDir, name), path.join(liveRoot, 'subevaluations', name));
}

const computationDir = path.join(runRoot, 'computations');
const computationFiles = listJsonFiles(computationDir);
for (const name of computationFiles) {
  copyJsonSnapshot(path.join(computationDir, name), path.join(liveRoot, 'computations', name));
}

const finalPath = path.join(runRoot, 'evaluation.json');
const metadataPath = path.join(runRoot, 'run-metadata.json');
const finalAvailable = copyJsonSnapshot(finalPath, path.join(liveRoot, 'evaluation.json'));
const metadataAvailable = copyJsonSnapshot(metadataPath, path.join(liveRoot, 'run-metadata.json'));

const planned = Array.isArray(planner?.subquestions) ? planner.subquestions : [];
const completedIds = new Set(subFiles.map(name => name.replace(/\.json$/, '')));
const normalizedPlanned = planned.map((sub, index) => ({
  sequence: index + 1,
  subquestion_id: String(sub.subquestion_id || ''),
  question: sub.question || '',
  purpose: sub.purpose || '',
  context_files: Array.isArray(sub.context_files) ? sub.context_files : [],
  context_bytes: sub.context_bytes ?? null,
  synthesis_dependencies: Array.isArray(sub.synthesis_dependencies) ? sub.synthesis_dependencies : [],
  completed: completedIds.has(String(sub.subquestion_id || '').replace(/[^A-Za-z0-9._-]+/g, '_'))
}));
const currentOrNext = normalizedPlanned.find(sub => !sub.completed) || null;

let inferredPhase = 'planner';
if (planner) inferredPhase = subFiles.length < normalizedPlanned.length ? 'subevaluation' : 'synthesis';
if (finalAvailable || metadataAvailable) inferredPhase = 'synthesis_complete';
if (status === 'failed') inferredPhase = 'failed';
if (status === 'complete') inferredPhase = 'complete';
if (status === 'retry_wait') inferredPhase = 'retry_wait';

const view = {
  run_nonce: runNonce,
  observer: 'workflow_supervisor_process_view',
  execution_host: 'GitHub Actions Node',
  subevaluation_mode: 'strictly_sequential',
  subevaluation_concurrency: 1,
  status,
  inferred_phase: inferredPhase,
  attempt,
  planner_available: Boolean(planner),
  planner_heuristic_statement: planner?.heuristic_statement || null,
  planned_subquestion_count: normalizedPlanned.length,
  planned_subquestions: normalizedPlanned,
  completed_subevaluation_count: subFiles.length,
  completed_subevaluation_files: subFiles,
  current_or_next_subquestion: currentOrNext,
  computation_files: computationFiles,
  final_evaluation_available: finalAvailable,
  run_metadata_available: metadataAvailable,
  process_log_tail_file: 'process-tail.txt',
  updated_at: new Date().toISOString()
};

writeJsonAtomic(path.join(liveRoot, 'process-view.json'), view);
fs.writeFileSync(path.join(liveRoot, 'process-tail.txt'), tailLines(processLogPath, 250) + '\n');
console.log(JSON.stringify(view, null, 2));
