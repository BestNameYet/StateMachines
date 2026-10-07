'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function numberedLines(text) {
  return text
    .split(/\r?\n/)
    .map((line, idx) => `${String(idx + 1).padStart(5, ' ')} | ${line}`)
    .join('\n');
}

function extractJson(rawText, stripFence = true) {
  const trimmed = String(rawText || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    if (stripFence) {
      const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (match) return JSON.parse(match[1].trim());
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      }
    }
    throw err;
  }
}

function resolvePath(baseDir, candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string') return null;
  return path.isAbsolute(candidatePath) ? candidatePath : path.resolve(baseDir, candidatePath);
}

function loadGenericInputs(config, runtimeRoot) {
  const descriptors = Array.isArray(config.inputs) ? config.inputs : [];
  return descriptors.map((input, index) => {
    const key = typeof input.key === 'string' && input.key.trim() ? input.key.trim() : `input_${index + 1}`;
    const type = input.type || 'file';
    const isRequired = input.required !== false;
    const useNumbering = input.numbered === true;

    if (type === 'literal') {
      const raw = String(input.value ?? '');
      return {
        key,
        type,
        source: 'config.literal',
        content: useNumbering ? numberedLines(raw) : raw
      };
    }

    if (type === 'file') {
      const targetPath = resolvePath(runtimeRoot, input.path);
      if (!targetPath || !fs.existsSync(targetPath)) {
        if (isRequired) throw new Error(`Required input file not found: ${input.path} (resolved: ${targetPath})`);
        return { key, type, source: targetPath || 'missing', content: null, omitted: true };
      }
      const raw = readText(targetPath);
      return {
        key,
        type,
        source: targetPath,
        content: useNumbering ? numberedLines(raw) : raw
      };
    }

    throw new Error(`Unsupported input type: ${type} for input key: ${key}`);
  }).filter(item => !item.omitted);
}

function buildUserPrompt(config, genericInputs, trigger) {
  const sections = [];
  if (config.prompt?.template_prefix) sections.push(config.prompt.template_prefix);
  if (config.prompt?.heuristic) sections.push('### Evaluation Heuristic / Operative Guidance:', config.prompt.heuristic);
  if (config.prompt?.output_schema) {
    sections.push('### Expected Output Schema:', JSON.stringify(config.prompt.output_schema, null, 2));
  }
  if (trigger?.user_prompt) sections.push('### Direct Trigger Request:', trigger.user_prompt);

  if (genericInputs.length > 0) {
    sections.push('### Configured Input Artifacts:');
    for (const input of genericInputs) {
      sections.push(`===== INPUT: ${input.key} | source: ${input.source} =====`, input.content);
    }
  }
  if (config.prompt?.template_suffix) sections.push(config.prompt.template_suffix);
  return sections.join('\n\n');
}

async function dispatchWithRetry(endpoint, apiKey, payload, timeoutMs, maxRetries = 2, retryDelayMs = 1000) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });

      const rawText = await response.text();
      let body;
      try {
        body = JSON.parse(rawText);
      } catch (_) {
        throw new Error(`Gemini returned non-JSON HTTP ${response.status}: ${rawText}`);
      }

      if (!response.ok) {
        const isTransient = response.status === 429 || response.status >= 500;
        if (isTransient && attempt <= maxRetries) {
          console.warn(`[executor] Transient HTTP ${response.status}. Retrying attempt ${attempt}/${maxRetries} after ${retryDelayMs}ms...`);
          await new Promise(r => setTimeout(r, retryDelayMs * attempt));
          continue;
        }
        throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
      }

      const candidate = body.candidates?.[0]?.content;
      if (!candidate || !Array.isArray(candidate.parts) || candidate.parts.length === 0) {
        throw new Error(`Gemini response contains no candidate parts: ${JSON.stringify(body)}`);
      }
      return candidate;
    } catch (err) {
      if (attempt <= maxRetries && (err.name === 'TimeoutError' || err.code === 'ECONNRESET' || err.name === 'AbortError')) {
        console.warn(`[executor] Network/Timeout error (${err.message}). Retrying attempt ${attempt}/${maxRetries}...`);
        await new Promise(r => setTimeout(r, retryDelayMs * attempt));
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const configArg = process.argv[2] || 'config.json';
  const configPath = path.resolve(process.cwd(), configArg);
  if (!fs.existsSync(configPath)) throw new Error(`Config file does not exist: ${configPath}`);

  const config = readJson(configPath);
  const runtimeRoot = resolvePath(path.dirname(configPath), config.paths?.runtime_root || '.');
  const keyEnv = config.api?.key_env || 'GEMINI_API_KEY';
  const apiKey = process.env[keyEnv];
  if (!apiKey) throw new Error(`API key environment variable ${keyEnv} is not defined in runtime.`);

  const triggerFileRel = config.paths?.trigger_file || 'trigger.json';
  const triggerPath = resolvePath(runtimeRoot, triggerFileRel);
  let trigger = {};
  if (fs.existsSync(triggerPath)) {
    try { trigger = readJson(triggerPath); } catch (_) { trigger = {}; }
  }

  const nonceKey = config.run?.nonce_param || 'run_nonce';
  const rawNonce = trigger[nonceKey] || config.run?.default_nonce || `${config.run?.default_nonce_prefix || 'run'}_${Date.now()}`;
  const runNonce = String(rawNonce).trim();
  const nonceRegex = new RegExp(config.run?.nonce_regex || '^[A-Za-z0-9._-]+$');
  if (!nonceRegex.test(runNonce)) throw new Error(`Invalid run nonce: "${runNonce}". Must match pattern ${nonceRegex}`);

  const runsRoot = resolvePath(runtimeRoot, config.paths?.runs_root || 'runs');
  const runDir = path.join(runsRoot, runNonce);
  fs.mkdirSync(runDir, { recursive: true });

  const runMessagesPath = path.join(runDir, config.paths?.messages_file || 'messages.json');
  const runOutputPath = path.join(runDir, config.paths?.output_file || 'output.json');

  const genericInputs = loadGenericInputs(config, runtimeRoot);
  const userText = buildUserPrompt(config, genericInputs, trigger);

  let messages = { run_nonce: runNonce, contents: [] };
  if (config.run?.reuse_history === true && fs.existsSync(runMessagesPath)) {
    try { messages = readJson(runMessagesPath); } catch (_) { messages = { run_nonce: runNonce, contents: [] }; }
  }

  const nextMessage = { role: 'user', parts: [{ text: userText }] };
  messages.contents.push(nextMessage);

  const model = process.env.GEMINI_MODEL || config.api?.model || config.api?.default_model || 'gemini-2.5-flash';
  const endpoint = `${config.api?.endpoint || 'https://generativelanguage.googleapis.com/v1beta'}/models/${encodeURIComponent(model)}:generateContent`;
  const timeoutMs = Number(config.api?.timeout_ms || 180000);
  const maxRetries = Number(config.api?.max_retries || 2);
  const retryDelayMs = Number(config.api?.retry_delay_ms || 1000);

  const requestPayload = {
    contents: messages.contents,
    generationConfig: {
      temperature: config.generation?.temperature ?? 0,
      responseMimeType: config.generation?.response_mime_type || 'application/json',
      maxOutputTokens: Number(config.generation?.max_output_tokens || 8192)
    }
  };

  if (config.generation?.top_p !== undefined) requestPayload.generationConfig.topP = config.generation.topP;
  if (config.generation?.top_k !== undefined) requestPayload.generationConfig.topK = config.generation.topK;

  const systemInstruction = trigger.system_instruction || config.prompt?.system_instruction;
  if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
    requestPayload.system_instruction = {
      parts: [{ text: systemInstruction.trim() }]
    };
  }

  console.log(`[executor] Dispatching request to Gemini model=${model} run_nonce=${runNonce}...`);
  const candidate = await dispatchWithRetry(endpoint, apiKey, requestPayload, timeoutMs, maxRetries, retryDelayMs);

  const replyText = candidate.parts.map(p => p.text || '').join('\n').trim();

  console.log(`[executor] Raw API response (first 500 chars): ${replyText.substring(0, 500)}`);

  let parsed;
  try {
    parsed = extractJson(replyText, config.validation?.strip_markdown_fence !== false);
  } catch (parseErr) {
    console.error(`[executor] JSON parsing failed. Full response:\n${replyText}`);
    throw new Error(`Failed to parse Gemini response as JSON: ${parseErr.message}`);
  }

  if (config.validation?.expected_response_type) {
    if (parsed.response_type !== config.validation.expected_response_type) {
      throw new Error(`Output validation failed: expected response_type "${config.validation.expected_response_type}", received "${parsed.response_type}"`);
    }
  }

  messages.contents.push(candidate);
  writeJson(runMessagesPath, messages);
  writeJson(runOutputPath, parsed);

  if (config.paths?.write_latest_outputs !== false) {
    const latestOutput = resolvePath(runtimeRoot, config.paths?.latest_output_file || 'latest-output.json');
    if (latestOutput) writeJson(latestOutput, parsed);
  }

  console.log(JSON.stringify({
    status: 'COMPLETE',
    run_nonce: runNonce,
    model,
    output_file: runOutputPath,
    messages_file: runMessagesPath,
    inputs_loaded: genericInputs.length,
    response_type: parsed.response_type || null
  }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[executor-fatal] ${err.stack || err.message || String(err)}`);
    process.exit(1);
  });
}

module.exports = { main, extractJson, loadGenericInputs, buildUserPrompt };
