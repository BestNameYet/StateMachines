const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const [sourceMapPath, triggerPath, packetDir] = process.argv.slice(2);
if (!sourceMapPath || !triggerPath || !packetDir) {
  throw new Error('Usage: node historical-audit-archive-builder.js <source-map> <trigger> <packet-dir>');
}

const sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
const trigger = JSON.parse(fs.readFileSync(triggerPath, 'utf8'));
const selectedIds = Array.isArray(trigger.archive_selection?.entry_ids)
  ? trigger.archive_selection.entry_ids
  : sourceMap.entries.filter(entry => entry.default_evaluator_input).map(entry => entry.id);
const entryById = new Map(sourceMap.entries.map(entry => [entry.id, entry]));
const runNonces = Array.isArray(trigger.archive_selection?.supervisor_run_nonces)
  ? trigger.archive_selection.supervisor_run_nonces
  : [];
const maxPacketBytes = Number(trigger.archive_selection?.max_evaluator_packet_bytes || 8000000);
const repoRoot = process.cwd();
const files = [];

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeRepoPath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function safeRepoPath(p) {
  const normalized = normalizeRepoPath(p);
  const absolute = path.resolve(repoRoot, normalized);
  const relative = path.relative(repoRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe repository path: ${p}`);
  return { normalized, absolute };
}

function addManifestFile({ archivePath, sourcePath, entry, generated = false, description, category, authority }) {
  const absolute = path.join(packetDir, archivePath);
  const stat = fs.statSync(absolute);
  files.push({
    archive_path: normalizeRepoPath(archivePath),
    source_path: sourcePath,
    entry_id: entry?.id || null,
    category: category || entry?.category || 'generated',
    description: description || entry?.description || '',
    authority: authority || entry?.authority || 'unspecified',
    size_bytes: stat.size,
    sha256: sha256File(absolute),
    generated
  });
}

function copyFile(sourceAbs, sourceRel, archiveRel, entry) {
  const dest = path.join(packetDir, archiveRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(sourceAbs, dest);
  addManifestFile({ archivePath: archiveRel, sourcePath: sourceRel, entry });
}

function copyEntry(entry) {
  const safe = safeRepoPath(entry.path);
  if (!fs.existsSync(safe.absolute)) throw new Error(`Configured historical-audit source does not exist: ${entry.path}`);
  const stat = fs.statSync(safe.absolute);
  if (entry.kind === 'file') {
    if (!stat.isFile()) throw new Error(`Expected file for ${entry.id}: ${entry.path}`);
    copyFile(safe.absolute, safe.normalized, `repo/${safe.normalized}`, entry);
    return;
  }
  if (entry.kind !== 'directory') throw new Error(`Unsupported entry kind ${entry.kind} for ${entry.id}`);
  if (!stat.isDirectory()) throw new Error(`Expected directory for ${entry.id}: ${entry.path}`);
  const stack = [safe.absolute];
  while (stack.length) {
    const dir = stack.pop();
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, dirent.name);
      if (dirent.isDirectory()) stack.push(absolute);
      else if (dirent.isFile()) {
        const sourceRel = normalizeRepoPath(path.relative(repoRoot, absolute));
        copyFile(absolute, sourceRel, `repo/${sourceRel}`, entry);
      }
    }
  }
}

function writeGenerated(archiveRel, content, metadata) {
  const dest = path.join(packetDir, archiveRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content.endsWith('\n') ? content : content + '\n');
  addManifestFile({ archivePath: archiveRel, sourcePath: metadata.sourcePath || null, generated: true, ...metadata });
}

fs.rmSync(packetDir, { recursive: true, force: true });
fs.mkdirSync(packetDir, { recursive: true });

for (const id of selectedIds) {
  const entry = entryById.get(id);
  if (!entry) throw new Error(`Unknown historical-audit entry_id: ${id}`);
  if (id === 'persisted_nonce_runs' && runNonces.length) continue;
  copyEntry(entry);
}

const runEntry = entryById.get('persisted_nonce_runs');
for (const runNonce of runNonces) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runNonce)) throw new Error(`Invalid Supervisor run nonce: ${runNonce}`);
  const runPath = `ChatMachines/GeminiSupervisor/runs/${runNonce}`;
  const synthetic = { ...runEntry, id: `persisted_nonce_run:${runNonce}`, path: runPath, kind: 'directory' };
  copyEntry(synthetic);
}

fs.mkdirSync(path.join(packetDir, 'metadata'), { recursive: true });
fs.copyFileSync(sourceMapPath, path.join(packetDir, 'metadata', 'historical-audit-data.json'));
addManifestFile({
  archivePath: 'metadata/historical-audit-data.json',
  sourcePath: sourceMapPath,
  generated: false,
  category: 'evidence_routing_metadata',
  description: 'Exact historical-audit source map used to construct this packet, including descriptions and authority guidance.',
  authority: 'routing_metadata'
});
fs.copyFileSync(triggerPath, path.join(packetDir, 'metadata', 'historical-audit-trigger.json'));
addManifestFile({
  archivePath: 'metadata/historical-audit-trigger.json',
  sourcePath: triggerPath,
  generated: false,
  category: 'audit_request_metadata',
  description: 'Exact trigger/request and archive selection used for this historical-audit run.',
  authority: 'run_request'
});

const lineagePaths = [sourceMap.archive_policy.include_predecessor_path, sourceMap.archive_policy.current_path].filter(Boolean);
const lineageLog = execFileSync('git', [
  'log', '--reverse', '--date=iso-strict', '--format=fuller', '--name-status', '-M', '-C', '--', ...lineagePaths
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeGenerated('generated/git/live-supervisor-lineage.log', lineageLog, {
  category: 'generated_raw_git_history',
  description: 'Fresh complete Git lineage for the Supervisor and predecessor paths at the workflow checkout, generated directly from Git with rename/copy detection.',
  authority: 'primary_git_history'
});

for (const id of selectedIds) {
  const entry = entryById.get(id);
  if (!entry?.include_git_history) continue;
  const safe = safeRepoPath(entry.path);
  const history = execFileSync('git', [
    'log', '--reverse', '--date=iso-strict', '--format=fuller', '--stat', '-p', '--', safe.normalized
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeGenerated(`generated/git/by-entry/${id}.patch.log`, history, {
    sourcePath: safe.normalized,
    category: 'generated_file_history',
    description: `Fresh path-scoped chronological Git history with patches for ${id}: ${entry.description}`,
    authority: 'primary_git_history'
  });
}

files.sort((a, b) => a.archive_path.localeCompare(b.archive_path));
const totalBytes = files.reduce((sum, file) => sum + file.size_bytes, 0);
if (totalBytes > maxPacketBytes) {
  throw new Error(`Historical audit packet is ${totalBytes} bytes, exceeding configured max_evaluator_packet_bytes ${maxPacketBytes}.`);
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifest = {
  archive_version: 1,
  generated_at: new Date().toISOString(),
  source_commit_sha: head,
  source_map_path: sourceMapPath,
  trigger_path: triggerPath,
  selected_entry_ids: selectedIds,
  selected_supervisor_run_nonces: runNonces,
  evidence_precedence_guidance: sourceMap.evidence_precedence_guidance,
  total_files: files.length,
  total_uncompressed_bytes: totalBytes,
  files
};
fs.writeFileSync(path.join(packetDir, 'archive-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ packet_dir: packetDir, total_files: files.length, total_uncompressed_bytes: totalBytes }, null, 2));
