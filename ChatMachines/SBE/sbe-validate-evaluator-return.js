const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function fail(exchange, nonce, failure, validationPath) {
  const diagnostic = {
    validation_status: 'INVALID',
    original_payload: exchange.original_payload,
    response: exchange.response,
    validation_check_failure: failure,
    exact_return_schema_example: {
      result: 'PASS',
      nonce
    }
  };
  writeJson(validationPath, diagnostic);
  process.exitCode = 3;
}

function main() {
  const [exchangePath, nonce, evaluationPath, validationPath] = process.argv.slice(2);
  if (!exchangePath || !nonce || !evaluationPath || !validationPath) {
    throw new Error('Usage: node sbe-validate-evaluator-return.js <exchange.json> <nonce> <evaluation.json> <validation.json>');
  }
  if (!/^[0-9a-f]{64}$/i.test(nonce)) {
    throw new Error('Expected nonce must be exactly 64 hexadecimal characters.');
  }

  const exchange = readJson(exchangePath);
  if (!exchange || typeof exchange !== 'object' || Array.isArray(exchange)) {
    throw new Error('Evaluator exchange must be an object.');
  }
  if (!exchange.original_payload || typeof exchange.response !== 'string') {
    throw new Error('Evaluator exchange is missing original_payload or response.');
  }

  let parsed;
  try {
    parsed = JSON.parse(exchange.response);
  } catch (error) {
    fail(exchange, nonce, `Response is not exactly valid JSON: ${error.message}`, validationPath);
    return;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(exchange, nonce, 'Response must be exactly one JSON object.', validationPath);
    return;
  }

  const keys = Object.keys(parsed).sort();
  if (keys.length !== 2 || keys[0] !== 'nonce' || keys[1] !== 'result') {
    fail(exchange, nonce, `Response must contain exactly the keys result and nonce; received keys ${JSON.stringify(keys)}.`, validationPath);
    return;
  }

  if (parsed.result !== 'PASS' && parsed.result !== 'FAIL') {
    fail(exchange, nonce, `result must be exactly PASS or FAIL; received ${JSON.stringify(parsed.result)}.`, validationPath);
    return;
  }

  if (parsed.nonce !== nonce) {
    fail(exchange, nonce, `nonce mismatch; expected ${nonce} and received ${JSON.stringify(parsed.nonce)}.`, validationPath);
    return;
  }

  writeJson(validationPath, {
    validation_status: 'VALID',
    result: parsed.result,
    nonce: parsed.nonce
  });

  writeJson(evaluationPath, {
    sbe_version: 1,
    request_id: exchange.request_id,
    submission_file: exchange.submission_file,
    model: exchange.model,
    result: parsed.result,
    nonce: parsed.nonce
  });

  process.exitCode = parsed.result === 'PASS' ? 0 : 2;
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
