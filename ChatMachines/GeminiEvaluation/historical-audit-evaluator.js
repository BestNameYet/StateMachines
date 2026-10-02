const path = require('node:path');
const { spawnSync } = require('node:child_process');

const corePath = path.join(__dirname, 'historical-audit-evaluator-core.js');
const maxAttempts = Number(process.env.HISTORICAL_AUDIT_API_ATTEMPTS || 6);
const baseBackoffMs = Number(process.env.HISTORICAL_AUDIT_API_BACKOFF_MS || 5000);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isRetryable(text) {
  return /Gemini HTTP (429|500|502|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|temporarily unavailable|Unexpected end of JSON input|unterminated|malformed\/truncated/i.test(text);
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
  if (!isRetryable(diagnostic) || attempt === maxAttempts) {
    process.exit(child.status || 1);
  }

  console.error(`Historical audit evaluator attempt ${attempt} failed with a retryable transport/JSON error; retrying sequentially.`);
  sleepSync(baseBackoffMs * attempt);
}

process.exit(1);
