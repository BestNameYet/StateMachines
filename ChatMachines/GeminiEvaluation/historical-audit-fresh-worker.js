const fs = require('node:fs');
const path = require('node:path');

const [mode, inputPathArg, outputPathArg] = process.argv.slice(2);
if (!mode || !inputPathArg || !outputPathArg) {
  throw new Error('Usage: node historical-audit-fresh-worker.js <planner|batch|synth_quarter|synth_dyad|synth_final> <input.json> <output.json>');
}

const inputPath = path.resolve(inputPathArg);
const outputPath = path.resolve(outputPathArg);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const timeoutMs = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 180000);
const maxOutputTokens = Number(process.env.HISTORICAL_AUDIT_MAX_OUTPUT_TOKENS || 32768);
if (!apiKey) throw new Error('GEMINI_API_KEY is missing.');

function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
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

function promptForMode() {
  if (mode === 'planner') {
    return {
      expected: 'historical_audit_batch_plan',
      system: [
        'You are a freshly instantiated lead planner for a historical requirements audit.',
        'You receive only fixed segment metadata, source descriptions, the segmentation/batching policy, and the audit task. You do not receive raw historical evidence.',
        'Choose how the already-created segment IDs should be grouped into primary analysis batches and additional crosscheck batches.',
        'Every raw segment must appear in exactly one primary batch. Primary batches collectively cover 100% of the corpus without duplication.',
        'Crosscheck batches may intentionally repeat or redistribute segments, but repeated raw bytes are globally capped by the supplied crosscheck budget.',
        'Respect all supplied hard batch byte ceilings and the minimum primary-batch count implied by the policy.',
        'Crosschecks should target ambiguity, boundary effects, high-authority evidence, requirement transitions, or other justified verification needs. Random/stochastic crosschecks are allowed only with a recorded reproducible seed and rationale.',
        'Do not create new segment IDs and do not alter segment boundaries.',
        'Return only JSON with response_type historical_audit_batch_plan and fields: heuristic_statement, primary_batches, crosscheck_batches, completeness_strategy.',
        'Each primary batch requires batch_id, segment_ids, purpose, grouping_rationale.',
        'Each crosscheck batch requires batch_id, segment_ids, purpose, crosscheck_rationale, selection_method, and seed when stochastic.'
      ].join('\n\n'),
      user: JSON.stringify(input, null, 2)
    };
  }

  if (mode === 'batch') {
    return {
      expected: 'historical_audit_batch_result',
      system: [
        'You are a freshly instantiated historical-audit batch evaluator.',
        'This process and model request are isolated to exactly one batch. You have no conversation history and no access to any other batch raw evidence or prior batch result.',
        'Analyze only the supplied batch context. Do not infer from omitted context.',
        'Separate mechanically observable facts from semantic interpretations and truth decisions.',
        'Truth decisions about historical meaning, intent, supersession, requirement survival, or implementation significance must depend on explicit interpretation IDs.',
        'For current-machine evidence distinguish executable behavior, deterministic enforcement, LLM-dependent enforcement, specification-only claims, and indeterminate behavior.',
        'Preserve exact segment IDs/source locators supporting each finding.',
        'Return compactly: avoid restating large source passages or duplicating the same finding in several fields.',
        'Return only JSON with response_type historical_audit_batch_result and fields: batch_id, batch_type, summary, facts, interpretations, truth_decisions, requirement_candidates, implementation_findings, contradictions, unresolved, segment_ids_used.'
      ].join('\n\n'),
      user: JSON.stringify(input, null, 2)
    };
  }

  if (mode === 'synth_quarter') {
    return {
      expected: 'historical_audit_synthesis_quarter',
      system: [
        'You are a freshly instantiated first-stage synthesis evaluator.',
        'You receive approximately one quarter of the compact independent batch results and no raw historical corpus.',
        'Merge duplicate findings, reconcile compatible findings, preserve contradictions, and retain provenance IDs back to source batch IDs, fact IDs, interpretation IDs, decision IDs, requirement IDs/candidates, and segment IDs.',
        'Do not invent evidence absent from the supplied results.',
        'Compress prose aggressively while preserving substantive conclusions and unresolved ambiguity.',
        'Return only JSON with response_type historical_audit_synthesis_quarter and fields: synthesis_id, source_batch_ids, summary, normalized_facts, normalized_interpretations, normalized_truth_decisions, requirement_findings, implementation_findings, contradictions, unresolved.'
      ].join('\n\n'),
      user: JSON.stringify(input, null, 2)
    };
  }

  if (mode === 'synth_dyad') {
    return {
      expected: 'historical_audit_synthesis_dyad',
      system: [
        'You are a freshly instantiated second-stage synthesis evaluator.',
        'You receive exactly two compact quarter-synthesis outputs and no raw historical corpus or batch conversations.',
        'Reconcile and compress them while preserving provenance chains and unresolved contradictions.',
        'Do not silently resolve disagreements unless the supplied quarter outputs contain enough evidence to do so.',
        'Return only JSON with response_type historical_audit_synthesis_dyad and fields: synthesis_id, source_synthesis_ids, summary, normalized_facts, normalized_interpretations, normalized_truth_decisions, surviving_requirement_candidates, superseded_requirement_candidates, implementation_findings, outstanding_gap_candidates, contradictions, unresolved.'
      ].join('\n\n'),
      user: JSON.stringify(input, null, 2)
    };
  }

  if (mode === 'synth_final') {
    return {
      expected: 'historical_audit_result',
      system: [
        'You are a freshly instantiated final historical-audit synthesis evaluator.',
        'You receive exactly two compact dyad-synthesis outputs, the audit objective, and provenance metadata. You do not receive raw historical corpus or prior model conversations.',
        'Produce the final answer to whether the GeminiSupervisor machine that exists today contains and enforces everything the user still wants today.',
        'Treat historical fact, interpretation, and truth decision as distinct layers. Historical truth decisions must expose interpretation dependencies.',
        'A superseded historical requirement is not current corrective work regardless of whether it was previously implemented.',
        'Current gaps exist only for requirements that survive into the desired machine and are missing, partial, or inadequately enforced today.',
        'Preserve unresolved contradictions as INDETERMINATE rather than manufacturing certainty.',
        'Return only JSON with response_type historical_audit_result and fields: heuristic_used, machine_today, surviving_requirements, superseded_requirements, outstanding_gaps, historical_facts, interpretations, truth_decisions, crosscheck_reconciliation, completeness_checks, unresolved_ambiguities, provenance.'
      ].join('\n\n'),
      user: JSON.stringify(input, null, 2)
    };
  }

  throw new Error(`Unsupported worker mode: ${mode}`);
}

async function main() {
  const prompt = promptForMode();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens
        }
      }),
      signal: AbortSignal.timeout(timeoutMs)
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
  const parts = body.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || !parts.length) throw new Error(`Gemini returned no content: ${JSON.stringify(body)}`);
  const text = parts.map(part => part.text || '').join('\n').trim();
  const payload = extractJson(text);
  if (payload.response_type !== prompt.expected) {
    throw new Error(`Expected response_type ${prompt.expected}; received ${payload.response_type ?? 'missing'}.`);
  }

  writeJson(outputPath, payload);
  console.log(JSON.stringify({ mode, model, output: outputPath, response_type: payload.response_type }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
