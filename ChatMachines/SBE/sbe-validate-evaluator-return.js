const fs = require('node:fs');
const path = require('node:path');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function fail(rawResponse, nonce, failure, validationPath) {
  writeJson(validationPath, {
    validation_status: 'INVALID',
    response: rawResponse,
    validation_check_failure: failure,
    exact_return_schema_example: {
      result: 'PASS',
      nonce
    }
  });
  process.exitCode = 3;
}

function main() {
  const [answerPath, nonce, validationPath] = process.argv.slice(2);
  if (!answerPath || !nonce || !validationPath) {
    throw new Error('Usage: node sbe-validate-evaluator-return.js <answer.json> <nonce> <validation.json>');
  }
  if (!/^[0-9a-f]{64}$/i.test(nonce)) {
    throw new Error('Expected nonce must be exactly 64 hexadecimal characters.');
  }

  const rawResponse = fs.readFileSync(answerPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(rawResponse);
  } catch (error) {
    fail(rawResponse, nonce, `Response is not exactly valid JSON: ${error.message}`, validationPath);
    return;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(rawResponse, nonce, 'Response must be exactly one JSON object.', validationPath);
    return;
  }

  const keys = Object.keys(parsed).sort();
  if (keys.length !== 2 || keys[0] !== 'nonce' || keys[1] !== 'result') {
    fail(rawResponse, nonce, `Response must contain exactly the keys result and nonce; received keys ${JSON.stringify(keys)}.`, validationPath);
    return;
  }

  if (parsed.result !== 'PASS' && parsed.result !== 'FAIL') {
    fail(rawResponse, nonce, `result must be exactly PASS or FAIL; received ${JSON.stringify(parsed.result)}.`, validationPath);
    return;
  }

  if (parsed.nonce !== nonce) {
    fail(rawResponse, nonce, `nonce mismatch; expected ${nonce} and received ${JSON.stringify(parsed.nonce)}.`, validationPath);
    return;
  }

  writeJson(validationPath, {
    validation_status: 'VALID',
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
