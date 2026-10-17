const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const triggerPath = path.resolve(process.env.HISTORICAL_AUDIT_TRIGGER || path.join(root, 'historical-audit-nextmessage', 'nextmessage.json'));
const packetRoot = path.resolve(process.env.HISTORICAL_AUDIT_PACKET_ROOT || path.join(root, '.historical-audit-packet'));
const segmentManifestPath = path.resolve(process.env.HISTORICAL_AUDIT_SEGMENT_MANIFEST || path.join(packetRoot, 'segment-manifest.json'));
const policyPath = path.resolve(process.env.HISTORICAL_AUDIT_SEGMENTATION_POLICY || path.join(root, 'historical-audit-segmentation-policy.json'));
const workerPath = path.join(root, 'historical-audit-fresh-worker.js');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function sanitizeId(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '_');
}

function safePacketPath(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (normalized.startsWith('/') || normalized.includes('../')) throw new Error(`Unsafe packet path: ${relativePath}`);
  const absolute = path.resolve(packetRoot, normalized);
  const relative = path.relative(packetRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Packet path escapes root: ${relativePath}`);
  return absolute;
}

function runFreshWorker(mode, inputObject, inputPath, outputPath) {
  writeJson(inputPath, inputObject);
  const child = spawnSync(process.execPath, [workerPath, mode, inputPath, outputPath], {
    cwd: root,
    env: { ...process.env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.status !== 0) throw new Error(`Fresh ${mode} evaluator process failed with exit ${child.status}.`);
  return readJson(outputPath);
}

function batchBytes(batch, segmentById) {
  return batch.segment_ids.reduce((sum, id) => sum + Number(segmentById.get(id).size_bytes || 0), 0);
}

function validatePlan(plan, segmentManifest, policy) {
  if (plan.response_type !== 'historical_audit_batch_plan') throw new Error('Planner returned wrong response_type.');
  if (!Array.isArray(plan.primary_batches) || plan.primary_batches.length === 0) throw new Error('Planner must return primary_batches.');
  if (!Array.isArray(plan.crosscheck_batches)) throw new Error('Planner must return crosscheck_batches array.');

  const segments = segmentManifest.segments;
  const segmentById = new Map(segments.map(segment => [segment.segment_id, segment]));
  const expected = new Set(segmentById.keys());
  const counts = new Map([...expected].map(id => [id, 0]));
  const batchIds = new Set();

  const targetPrimary = Number(policy.heuristic.target_primary_batch_bytes);
  const hardPrimary = Number(policy.heuristic.hard_max_primary_batch_bytes);
  const hardCrosscheck = Number(policy.heuristic.hard_max_crosscheck_batch_bytes);
  const corpusBytes = Number(segmentManifest.corpus_bytes);
  const minPrimaryCount = Math.ceil(corpusBytes / targetPrimary);

  if (plan.primary_batches.length < minPrimaryCount) {
    throw new Error(`Planner produced ${plan.primary_batches.length} primary batches; heuristic requires at least ${minPrimaryCount}.`);
  }

  for (const batch of plan.primary_batches) {
    if (!batch || typeof batch !== 'object') throw new Error('Every primary batch must be an object.');
    if (typeof batch.batch_id !== 'string' || !batch.batch_id.trim()) throw new Error('Every primary batch requires batch_id.');
    if (batchIds.has(batch.batch_id)) throw new Error(`Duplicate batch_id ${batch.batch_id}.`);
    batchIds.add(batch.batch_id);
    if (!Array.isArray(batch.segment_ids) || batch.segment_ids.length === 0) throw new Error(`${batch.batch_id} requires segment_ids.`);
    const local = new Set();
    for (const id of batch.segment_ids) {
      if (!expected.has(id)) throw new Error(`${batch.batch_id} references unknown segment ${id}.`);
      if (local.has(id)) throw new Error(`${batch.batch_id} duplicates segment ${id} within the batch.`);
      local.add(id);
      counts.set(id, counts.get(id) + 1);
    }
    batch.context_bytes = batchBytes(batch, segmentById);
    if (batch.context_bytes > hardPrimary) throw new Error(`${batch.batch_id} is ${batch.context_bytes} bytes; hard primary limit is ${hardPrimary}.`);
    if (typeof batch.grouping_rationale !== 'string' || !batch.grouping_rationale.trim()) throw new Error(`${batch.batch_id} requires grouping_rationale.`);
  }

  const missing = [];
  const duplicated = [];
  for (const [id, count] of counts.entries()) {
    if (count === 0) missing.push(id);
    if (count > 1) duplicated.push(id);
  }
  if (missing.length) throw new Error(`Primary batches omitted segments: ${missing.join(', ')}`);
  if (duplicated.length) throw new Error(`Primary batches duplicated segments: ${duplicated.join(', ')}`);

  if (policy.batch_constraints.at_least_one_crosscheck_batch && plan.crosscheck_batches.length === 0) {
    throw new Error('At least one crosscheck batch is required by policy.');
  }

  let crosscheckBytes = 0;
  for (const batch of plan.crosscheck_batches) {
    if (!batch || typeof batch !== 'object') throw new Error('Every crosscheck batch must be an object.');
    if (typeof batch.batch_id !== 'string' || !batch.batch_id.trim()) throw new Error('Every crosscheck batch requires batch_id.');
    if (batchIds.has(batch.batch_id)) throw new Error(`Duplicate batch_id ${batch.batch_id}.`);
    batchIds.add(batch.batch_id);
    if (!Array.isArray(batch.segment_ids) || batch.segment_ids.length === 0) throw new Error(`${batch.batch_id} requires segment_ids.`);
    const local = new Set();
    for (const id of batch.segment_ids) {
      if (!expected.has(id)) throw new Error(`${batch.batch_id} references unknown segment ${id}.`);
      if (local.has(id)) throw new Error(`${batch.batch_id} duplicates segment ${id} within the batch.`);
      local.add(id);
    }
    batch.context_bytes = batchBytes(batch, segmentById);
    if (batch.context_bytes > hardCrosscheck) throw new Error(`${batch.batch_id} is ${batch.context_bytes} bytes; hard crosscheck limit is ${hardCrosscheck}.`);
    crosscheckBytes += batch.context_bytes;
    if (typeof batch.crosscheck_rationale !== 'string' || !batch.crosscheck_rationale.trim()) throw new Error(`${batch.batch_id} requires crosscheck_rationale.`);
    if (batch.selection_method === 'stochastic' && (typeof batch.seed !== 'string' || !batch.seed.trim())) {
      throw new Error(`${batch.batch_id} uses stochastic selection but has no seed.`);
    }
  }

  const maxCrosscheckBytes = Math.floor(corpusBytes * Number(policy.batch_constraints.maximum_crosscheck_raw_fraction));
  const totalAssignedBytes = corpusBytes + crosscheckBytes;
  const maxAssignedBytes = Math.floor(corpusBytes * Number(policy.batch_constraints.maximum_total_raw_assignment_multiplier));
  if (crosscheckBytes > maxCrosscheckBytes) throw new Error(`Crosscheck raw bytes ${crosscheckBytes} exceed budget ${maxCrosscheckBytes}.`);
  if (totalAssignedBytes > maxAssignedBytes) throw new Error(`Total raw assignment ${totalAssignedBytes} exceeds 1.5x corpus budget ${maxAssignedBytes}.`);

  return {
    corpus_bytes: corpusBytes,
    primary_batch_count: plan.primary_batches.length,
    minimum_primary_batch_count: minPrimaryCount,
    primary_raw_bytes: corpusBytes,
    crosscheck_batch_count: plan.crosscheck_batches.length,
    crosscheck_raw_bytes: crosscheckBytes,
    total_assigned_raw_bytes: totalAssignedBytes,
    maximum_total_raw_assignment_bytes: maxAssignedBytes,
    raw_assignment_multiplier: totalAssignedBytes / corpusBytes,
    complete_primary_coverage: true,
    primary_duplication: false
  };
}

function materializeBatch(batch, batchType, taskText, segmentById) {
  return {
    audit_task: taskText,
    batch: {
      batch_id: batch.batch_id,
      batch_type: batchType,
      purpose: batch.purpose || '',
      grouping_rationale: batch.grouping_rationale || null,
      crosscheck_rationale: batch.crosscheck_rationale || null,
      selection_method: batch.selection_method || null,
      seed: batch.seed || null,
      context_bytes: batch.context_bytes
    },
    segments: batch.segment_ids.map(id => {
      const metadata = segmentById.get(id);
      return {
        metadata,
        content: fs.readFileSync(safePacketPath(metadata.segment_path), 'utf8')
      };
    })
  };
}

function balanceResultsIntoFour(items) {
  const groups = [0, 1, 2, 3].map(index => ({ quarter: index + 1, total_bytes: 0, items: [] }));
  const sorted = [...items].sort((a, b) => b.result_bytes - a.result_bytes || a.batch_id.localeCompare(b.batch_id));
  for (const item of sorted) {
    groups.sort((a, b) => a.total_bytes - b.total_bytes || a.quarter - b.quarter);
    groups[0].items.push(item);
    groups[0].total_bytes += item.result_bytes;
  }
  return groups.sort((a, b) => a.quarter - b.quarter);
}

function updateProcessView(runRoot, patch) {
  const viewPath = path.join(runRoot, 'live-view', 'process-view.json');
  let current = {};
  try { current = readJson(viewPath); } catch (_) {}
  writeJson(viewPath, {
    ...current,
    observer: 'flat_batch_audit_orchestrator',
    execution_host: 'GitHub Actions Node',
    recursive_model_calling: false,
    fresh_process_per_evaluator: true,
    ...patch,
    updated_at: new Date().toISOString()
  });
}

function main() {
  const trigger = readJson(triggerPath);
  const segmentManifest = readJson(segmentManifestPath);
  const policy = readJson(policyPath);
  const runNonce = String(trigger.run_nonce || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runNonce)) throw new Error(`Invalid run_nonce: ${runNonce}`);
  const taskText = trigger.nextmessage?.parts?.map(part => part.text || '').join('\n').trim();
  if (!taskText) throw new Error('Audit task text is missing.');

  const runRoot = path.join(root, 'evaluations', runNonce);
  const workRoot = path.join(runRoot, 'flat-work');
  const batchResultRoot = path.join(runRoot, 'batch-results');
  const synthesisRoot = path.join(runRoot, 'synthesis');
  fs.mkdirSync(workRoot, { recursive: true });
  fs.mkdirSync(batchResultRoot, { recursive: true });
  fs.mkdirSync(synthesisRoot, { recursive: true });

  updateProcessView(runRoot, { phase: 'planner', status: 'running' });

  const plannerInput = {
    audit_task: taskText,
    segmentation_policy: policy,
    segment_manifest: {
      corpus_bytes: segmentManifest.corpus_bytes,
      segment_count: segmentManifest.segment_count,
      maximum_total_raw_assignment_bytes: segmentManifest.maximum_total_raw_assignment_bytes,
      maximum_crosscheck_raw_bytes: segmentManifest.maximum_crosscheck_raw_bytes,
      segments: segmentManifest.segments.map(segment => ({
        segment_id: segment.segment_id,
        source_archive_path: segment.source_archive_path,
        source_path: segment.source_path,
        entry_id: segment.entry_id,
        category: segment.category,
        authority: segment.authority,
        description: segment.description,
        start_line: segment.start_line,
        end_line: segment.end_line,
        size_bytes: segment.size_bytes,
        boundary_after: segment.boundary_after
      }))
    }
  };

  const plannerPath = path.join(runRoot, 'batch-plan.json');
  const plan = runFreshWorker('planner', plannerInput, path.join(workRoot, 'planner-input.json'), plannerPath);
  const validation = validatePlan(plan, segmentManifest, policy);
  writeJson(path.join(runRoot, 'batch-plan-validation.json'), validation);

  const segmentById = new Map(segmentManifest.segments.map(segment => [segment.segment_id, segment]));
  const allBatches = [
    ...plan.primary_batches.map(batch => ({ ...batch, batch_type: 'primary' })),
    ...plan.crosscheck_batches.map(batch => ({ ...batch, batch_type: 'crosscheck' }))
  ];

  const compactResults = [];
  let completed = 0;
  for (const batch of allBatches) {
    updateProcessView(runRoot, {
      phase: batch.batch_type === 'primary' ? 'primary_batches' : 'crosscheck_batches',
      current_batch_id: batch.batch_id,
      completed_batch_count: completed,
      total_batch_count: allBatches.length,
      status: 'running'
    });
    const safeId = sanitizeId(batch.batch_id);
    const inputPath = path.join(workRoot, `batch-${safeId}-input.json`);
    const outputPath = path.join(batchResultRoot, `${safeId}.json`);
    const batchInput = materializeBatch(batch, batch.batch_type, taskText, segmentById);
    const result = runFreshWorker('batch', batchInput, inputPath, outputPath);
    if (result.batch_id !== batch.batch_id) result.batch_id = batch.batch_id;
    if (!result.batch_type) result.batch_type = batch.batch_type;
    compactResults.push({
      batch_id: batch.batch_id,
      batch_type: batch.batch_type,
      result_path: path.relative(runRoot, outputPath).replace(/\\/g, '/'),
      result_bytes: byteSize(result),
      result
    });
    completed += 1;
  }

  const quarters = balanceResultsIntoFour(compactResults);
  const synthesisTree = {
    version: 1,
    balancing_method: 'greedy_largest_result_first_into_current_smallest_of_four_bins',
    total_batch_result_bytes: compactResults.reduce((sum, item) => sum + item.result_bytes, 0),
    quarters: quarters.map(group => ({
      synthesis_id: `Q${group.quarter}`,
      source_batch_ids: group.items.map(item => item.batch_id),
      source_result_bytes: group.total_bytes
    })),
    dyads: [
      { synthesis_id: 'D1', source_synthesis_ids: ['Q1', 'Q2'] },
      { synthesis_id: 'D2', source_synthesis_ids: ['Q3', 'Q4'] }
    ],
    final: { synthesis_id: 'FINAL', source_synthesis_ids: ['D1', 'D2'] }
  };
  writeJson(path.join(runRoot, 'synthesis-tree.json'), synthesisTree);

  const quarterOutputs = [];
  for (const group of quarters) {
    const synthesisId = `Q${group.quarter}`;
    updateProcessView(runRoot, { phase: 'quarter_synthesis', current_synthesis_id: synthesisId, status: 'running' });
    const input = {
      audit_task: taskText,
      synthesis_id: synthesisId,
      source_batch_ids: group.items.map(item => item.batch_id),
      source_result_bytes: group.total_bytes,
      batch_results: group.items.map(item => item.result)
    };
    const outputPath = path.join(synthesisRoot, `${synthesisId}.json`);
    const output = runFreshWorker('synth_quarter', input, path.join(workRoot, `${synthesisId}-input.json`), outputPath);
    if (!output.synthesis_id) output.synthesis_id = synthesisId;
    quarterOutputs.push(output);
  }

  const dyadSpecs = [
    { id: 'D1', indexes: [0, 1] },
    { id: 'D2', indexes: [2, 3] }
  ];
  const dyadOutputs = [];
  for (const spec of dyadSpecs) {
    updateProcessView(runRoot, { phase: 'dyad_synthesis', current_synthesis_id: spec.id, status: 'running' });
    const source = spec.indexes.map(index => quarterOutputs[index]);
    const input = {
      audit_task: taskText,
      synthesis_id: spec.id,
      source_synthesis_ids: source.map(item => item.synthesis_id),
      quarter_syntheses: source
    };
    const outputPath = path.join(synthesisRoot, `${spec.id}.json`);
    const output = runFreshWorker('synth_dyad', input, path.join(workRoot, `${spec.id}-input.json`), outputPath);
    if (!output.synthesis_id) output.synthesis_id = spec.id;
    dyadOutputs.push(output);
  }

  updateProcessView(runRoot, { phase: 'final_synthesis', current_synthesis_id: 'FINAL', status: 'running' });
  const finalInput = {
    audit_task: taskText,
    synthesis_id: 'FINAL',
    validated_raw_context_budget: validation,
    synthesis_tree: synthesisTree,
    dyad_syntheses: dyadOutputs
  };
  const finalPath = path.join(runRoot, 'evaluation.json');
  const finalResult = runFreshWorker('synth_final', finalInput, path.join(workRoot, 'FINAL-input.json'), finalPath);

  writeJson(path.join(runRoot, 'run-metadata.json'), {
    run_nonce: runNonce,
    execution_architecture: 'flat batches -> four quarter syntheses -> two dyad syntheses -> final synthesis',
    recursive_model_calling: false,
    fresh_process_per_evaluator: true,
    primary_batch_count: plan.primary_batches.length,
    crosscheck_batch_count: plan.crosscheck_batches.length,
    raw_context_budget: validation,
    synthesis_tree_path: 'synthesis-tree.json',
    completed_at: new Date().toISOString()
  });

  updateProcessView(runRoot, {
    phase: 'complete',
    status: 'complete',
    current_batch_id: null,
    current_synthesis_id: null,
    completed_batch_count: allBatches.length,
    total_batch_count: allBatches.length,
    final_evaluation_available: true
  });

  console.log(JSON.stringify({
    run_nonce: runNonce,
    primary_batches: plan.primary_batches.length,
    crosscheck_batches: plan.crosscheck_batches.length,
    raw_assignment_multiplier: validation.raw_assignment_multiplier,
    quarter_syntheses: 4,
    dyad_syntheses: 2,
    final_output: finalPath,
    response_type: finalResult.response_type
  }, null, 2));
}

try {
  main();
} catch (error) {
  try {
    const trigger = readJson(triggerPath);
    const runNonce = String(trigger.run_nonce || '').trim();
    if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runNonce)) {
      updateProcessView(path.join(root, 'evaluations', runNonce), { phase: 'failed', status: 'failed', error: error.message });
    }
  } catch (_) {}
  console.error(error);
  process.exitCode = 1;
}
