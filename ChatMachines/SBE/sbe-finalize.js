const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [
  trustedDir,
  submissionDir,
  requestId,
  prNumber,
  headRef,
  headSha,
  submissionFile,
  sealedArchive,
  evaluationFile
] = process.argv.slice(2);

if ([trustedDir, submissionDir, requestId, prNumber, headRef, headSha, submissionFile, sealedArchive, evaluationFile].some(v => !v)) {
  throw new Error('Missing SBE finalize argument.');
}
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requestId)) throw new Error(`Invalid request id: ${requestId}`);
if (!/^processing\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(headRef)) throw new Error(`Invalid processing branch: ${headRef}`);
if (!/^[0-9a-f]{40}$/i.test(headSha)) throw new Error(`Invalid head SHA: ${headSha}`);

function run(cwd, args, allowFailure = false) {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function configure(cwd) {
  run(cwd, ['git', 'config', 'user.name', 'github-actions[bot]']);
  run(cwd, ['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
}

const destination = path.join('SBE', 'sealed', requestId, headSha);
const absoluteDestination = path.join(trustedDir, destination);
fs.mkdirSync(absoluteDestination, { recursive: true });
fs.copyFileSync(sealedArchive, path.join(absoluteDestination, 'submission.7z'));
fs.copyFileSync(evaluationFile, path.join(absoluteDestination, 'evaluation.json'));
fs.writeFileSync(path.join(absoluteDestination, 'manifest.json'), JSON.stringify({
  sbe_version: 1,
  request_id: requestId,
  pr_number: Number(prNumber),
  source_head_sha: headSha,
  source_file: submissionFile,
  sealed_archive: `${destination}/submission.7z`,
  evaluation: `${destination}/evaluation.json`,
  sealed_at: new Date().toISOString()
}, null, 2) + '\n');

configure(trustedDir);
run(trustedDir, ['git', 'add', destination]);
run(trustedDir, ['git', 'commit', '-m', `Seal SBE ${requestId} ${headSha}`]);
let pushed = false;
for (let attempt = 0; attempt < 3 && !pushed; attempt += 1) {
  const push = run(trustedDir, ['git', 'push', 'origin', 'HEAD:main'], true);
  if (push.status === 0) {
    pushed = true;
    break;
  }
  run(trustedDir, ['git', 'fetch', 'origin', 'main']);
  run(trustedDir, ['git', 'rebase', 'origin/main']);
}
if (!pushed) throw new Error('Unable to persist sealed SBE result to main.');

configure(submissionDir);
run(submissionDir, ['git', 'checkout', '-B', headRef, headSha]);
const fullSubmissionPath = path.resolve(submissionDir, submissionFile);
const submissionRoot = path.resolve(submissionDir) + path.sep;
if (!fullSubmissionPath.startsWith(submissionRoot)) throw new Error('Submission path escapes processing checkout.');
if (fs.existsSync(fullSubmissionPath)) fs.unlinkSync(fullSubmissionPath);
run(submissionDir, ['git', 'add', '-A', '--', submissionFile]);
fs.writeFileSync(path.join(submissionDir, '.delete-processing-branch'), JSON.stringify({
  sbe_version: 1,
  delete_branch: true,
  request_id: requestId,
  pr_number: Number(prNumber),
  evaluated_head_sha: headSha,
  sealed_path: destination,
  created_at: new Date().toISOString()
}, null, 2) + '\n');
run(submissionDir, ['git', 'add', '.delete-processing-branch']);
run(submissionDir, ['git', 'commit', '-m', 'Mark completed SBE branch for deletion']);
run(submissionDir, ['git', 'push', 'origin', `HEAD:${headRef}`]);
