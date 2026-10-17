const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [packetRootArg, policyPathArg] = process.argv.slice(2);
if (!packetRootArg || !policyPathArg) {
  throw new Error('Usage: node historical-audit-segmenter.js <packet-root> <segmentation-policy>');
}

const packetRoot = path.resolve(packetRootArg);
const policyPath = path.resolve(policyPathArg);
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const archiveManifest = JSON.parse(fs.readFileSync(path.join(packetRoot, 'archive-manifest.json'), 'utf8'));
const targetBytes = Number(policy.heuristic.target_segment_bytes);
const hardMaxBytes = Number(policy.heuristic.hard_max_segment_bytes);
if (!(targetBytes > 0) || !(hardMaxBytes >= targetBytes)) throw new Error('Invalid segmentation byte policy.');

const segmentRoot = path.join(packetRoot, 'segments');
fs.rmSync(segmentRoot, { recursive: true, force: true });
fs.mkdirSync(segmentRoot, { recursive: true });

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function safeArchivePath(archivePath) {
  const normalized = String(archivePath).replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (normalized.startsWith('/') || normalized.includes('../')) throw new Error(`Unsafe archive path: ${archivePath}`);
  const absolute = path.resolve(packetRoot, normalized);
  const relative = path.relative(packetRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Archive path escapes packet root: ${archivePath}`);
  return absolute;
}

function charEndWithinBytes(text, start, maxBytes) {
  let low = start + 1;
  let high = text.length;
  let best = Math.min(text.length, start + 1);
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const bytes = Buffer.byteLength(text.slice(start, mid), 'utf8');
    if (bytes <= maxBytes) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function chooseBoundary(text, start) {
  if (start >= text.length) return { end: start, boundary: 'eof' };
  const targetEnd = charEndWithinBytes(text, start, targetBytes);
  if (targetEnd >= text.length) return { end: text.length, boundary: 'eof' };
  const hardEnd = charEndWithinBytes(text, start, hardMaxBytes);
  const minBytes = Math.floor(targetBytes * 0.55);
  const minEnd = charEndWithinBytes(text, start, minBytes);
  const window = text.slice(start, hardEnd);
  const targetRelative = Math.max(0, targetEnd - start);
  const minRelative = Math.max(0, minEnd - start);

  const candidates = [
    { token: '\ncommit ', name: 'git_commit_boundary' },
    { token: '\n## ', name: 'markdown_heading_boundary' },
    { token: '\n# ', name: 'markdown_heading_boundary' },
    { token: '\n\n', name: 'paragraph_boundary' },
    { token: '\n', name: 'line_boundary' }
  ];

  for (const candidate of candidates) {
    let idx = window.lastIndexOf(candidate.token, targetRelative);
    if (idx < minRelative) {
      idx = window.indexOf(candidate.token, targetRelative);
      if (idx < 0 || idx + candidate.token.length > hardEnd - start) idx = -1;
    }
    if (idx >= minRelative) {
      const end = start + idx + (candidate.token === '\n' ? 1 : 0);
      if (end > start) return { end, boundary: candidate.name };
    }
  }

  return { end: hardEnd, boundary: 'hard_utf8_byte_boundary' };
}

function lineNumberAt(text, charIndex) {
  let count = 1;
  for (let i = 0; i < charIndex; i += 1) if (text.charCodeAt(i) === 10) count += 1;
  return count;
}

const segments = [];
let sequence = 0;
for (const file of archiveManifest.files) {
  const sourcePath = safeArchivePath(file.archive_path);
  const content = fs.readFileSync(sourcePath, 'utf8');
  let start = 0;
  let byteOffset = 0;
  while (start < content.length) {
    const chosen = chooseBoundary(content, start);
    if (chosen.end <= start) throw new Error(`Segmenter made no progress on ${file.archive_path}.`);
    const slice = content.slice(start, chosen.end);
    const sizeBytes = Buffer.byteLength(slice, 'utf8');
    if (sizeBytes > hardMaxBytes) throw new Error(`Segment exceeds hard max: ${file.archive_path} ${sizeBytes}`);
    sequence += 1;
    const segmentId = `SEG-${String(sequence).padStart(5, '0')}`;
    const segmentRel = `segments/${segmentId}.txt`;
    fs.writeFileSync(path.join(packetRoot, segmentRel), slice);
    const startLine = lineNumberAt(content, start);
    const endLine = startLine + (slice.match(/\n/g) || []).length;
    segments.push({
      segment_id: segmentId,
      segment_path: segmentRel,
      source_archive_path: file.archive_path,
      source_path: file.source_path,
      entry_id: file.entry_id,
      category: file.category,
      authority: file.authority,
      description: file.description,
      start_line: startLine,
      end_line: endLine,
      source_byte_start: byteOffset,
      source_byte_end_exclusive: byteOffset + sizeBytes,
      size_bytes: sizeBytes,
      sha256: sha256(slice),
      boundary_after: chosen.boundary
    });
    byteOffset += sizeBytes;
    start = chosen.end;
  }
}

const corpusBytes = segments.reduce((sum, segment) => sum + segment.size_bytes, 0);
const expectedBytes = archiveManifest.files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
if (corpusBytes !== expectedBytes) throw new Error(`Segment byte coverage mismatch: ${corpusBytes} != ${expectedBytes}`);

const segmentManifest = {
  version: 1,
  generated_at: new Date().toISOString(),
  segmentation_policy: policy,
  archive_source_commit_sha: archiveManifest.source_commit_sha,
  corpus_bytes: corpusBytes,
  segment_count: segments.length,
  segment_target_bytes: targetBytes,
  segment_hard_max_bytes: hardMaxBytes,
  maximum_total_raw_assignment_bytes: Math.floor(corpusBytes * Number(policy.batch_constraints.maximum_total_raw_assignment_multiplier)),
  maximum_crosscheck_raw_bytes: Math.floor(corpusBytes * Number(policy.batch_constraints.maximum_crosscheck_raw_fraction)),
  segments
};

fs.writeFileSync(path.join(packetRoot, 'segment-manifest.json'), JSON.stringify(segmentManifest, null, 2) + '\n');
console.log(JSON.stringify({ corpus_bytes: corpusBytes, segment_count: segments.length, segment_manifest: path.join(packetRoot, 'segment-manifest.json') }, null, 2));
