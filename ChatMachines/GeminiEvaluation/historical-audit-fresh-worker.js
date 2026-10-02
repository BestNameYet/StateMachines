const fs = require('node:fs');
const path = require('node:path');

const [mode, inputPathArg, outputPathArg] = process.argv.slice(2);
if (!mode || !inputPathArg || !outputPathArg) {
  throw new Error('Usage: node historical-audit-fresh-worker.js <planner|batch|synthesis> <input.json> <output.json>');
}

const inputPath = path.resolve(inputPathArg);
const outputPath = path.resolve(outputPathArg);
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const timeoutMs = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 180000);
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
      system: [
        'You are the lead planner for a historical requirements audit.',
        'You receive only a fixed segment manifest, source descriptions, a segmentation policy, and the audit task. You do not receive raw historical evidence.',
        'Choose how the already-created segments should be grouped into primary analysis batches and optional crosscheck batches.',
        'Every raw segment must appear in exactly one primary batch. Primary batches collectively cover 100% of the corpus without duplication.',
        'Crosscheck batches may intentionally repeat or redistribute segments, but repeated raw bytes are globally capped by the supplied crosscheck budget.',
        'Use the supplied heuristic and justify your batch grouping. If stochastic crosschecking is useful, provide a reproducible seed and explain why.',
        'Do not create new segment IDs and do not alter segment boundaries.',
        'Return only JSON with response_type historical_audit_batch_plan.'
      ].join('\n\n'),
      user: JSON.stringify(input, null, 2)
    };
  }

  if (mode === 'batch') {
    return {
      system: [
        'You are a freshly instantiated historical-audit evaluator.',
        'This process and model request are isolated to exactly one batch. You have no conversation history and no access to other batch raw evidence or prior batch results.',
        'Analyze only the supplied batch context.',
        'Separate mechanically observable historical facts from semantic interpretations and truth decisions.',
        'Truth decisions about historical meaning, intent, supersession, requirement survival, or implementation significance must depend on explicit interpretation IDs.',
        'For current-machine facts, distinguish executable behavior from specification-only claims.',
        'Do not infer from omitted context. Mark uncertainty INDETERMINATE.',
        'Return only JSON with response_type historical_audit_batch_result.'
      ].join('\n\n'),
      user: JSON.stringify(input, null, 2)
    };
  }

  if (mode === 'synthesis') {
    return {
      system: [
        'You are a freshly instantiated synthesis evaluator.',
        'You receive the audit task, the validated batch plan, and compact results from independently instantiated primary and crosscheck evaluators. You do not receive raw historical corpus text.',
        'Reconcile batch findings, preserve fact -> interpretation -> truth-decision dependencies, resolve crosschecks where evidence supports resolution, and leave unresolved contradictions INDETERMINATE.',
        'Determine the surviving current requirements and compare them with the machine that exists today.',
        'A superseded historical requirement is not present corrective work whether or not it was once implemented.',
        'Return only JSON with response_type historical_audit_result.'
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
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }]
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

  const expected = {
    planner: 'historical_audit_batch_plan',
    batch: 'historical_audit_batch_result',
    synthesis: 'historical_audit_result'
  }[mode];
  if (payload.response_type !== expected) {
    throw new Error(`Expected response_type ${expected}; received ${payload.response_type ?? 'missing'}.`);
  }

  writeJson(outputPath, payload);
  console.log(JSON.stringify({ mode, model, output: outputPath, response_type: payload.response_type }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
