const path = require('node:path');
const { spawnSync } = require('node:child_process');

const corePath = path.join(__dirname, 'historical-audit-evaluator-core.js');
const maxAttempts = Number(process.env.HISTORICAL_AUDIT_API_ATTEMPTS || 8);
const baseBackoffMs = Number(process.env.HISTORICAL_AUDIT_API_BACKOFF_MS || 5000);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isInputTokenQuota(text) {
  return /input_token_count|GenerateContentPaidTierInputTokensPerModelPerMinute|paid_tier_input_token_count/i.test(text);
}

function isRetryable(text) {
  if (isInputTokenQuota(text)) return false;
  return /Gemini HTTP (500|502|503|504)|UNAVAILABLE|high demand|temporarily unavailable|Unexpected end of JSON input|unterminated|malformed\/truncated/i.test(text);
}

function retryDelayMs(text, attempt) {
  const candidates = [];
  for (const match of text.matchAll(/retry(?:Delay| in)?[^0-9]{0,20}(\d+(?:\.\d+)?)s/gi)) {
    candidates.push(Number(match[1]));
  }
  const seconds = candidates.length ? Math.max(...candidates) : null;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000) + 2000;
  return baseBackoffMs * attempt;
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const child = spawnSync(process.execPath, [corePath], {
    cwd: __dirname,
    env: {
      ...process.env,
      HISTORICAL_AUDIT_SUBEVAL_EXECUTION: 'sequential',
      HISTORICAL_AUDIT_SUBEVAL_CONCURRENCY: '1'
    },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });

  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);

  if (child.status === 0) process.exit(0);

  const diagnostic = `${child.stdout || ''}\n${child.stderr || ''}`;

  if (isInputTokenQuota(diagnostic)) {
    console.error('Historical audit decomposition failure: Gemini input-token quota was reached. Do not retry the same subtask; reduce assigned context and split the work further.');
    process.exit(child.status || 1);
  }

  if (!isRetryable(diagnostic) || attempt === maxAttempts) {
    process.exit(child.status || 1);
  }

  const delayMs = retryDelayMs(diagnostic, attempt);
  console.error(`Historical audit evaluator attempt ${attempt} failed with a retryable transport/JSON error; retrying sequentially after ${delayMs} ms.`);
  sleepSync(delayMs);
}

process.exit(1);
