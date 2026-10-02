'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const readmePath = path.join(root, 'ChatMachines/GeminiSupervisor/README.md');
const marker = '## 19. Deterministic truth-reader verification';

const section = `

---

## 19. Deterministic truth-reader verification

GeminiSupervisor uses deterministic reading verification for repository documents that a worker must acquire as fresh context. Gemini does **not** decide this PASS/FAIL result. Stable-reader construction, provenance checks, randomized damage, exact repair verification, FAIL restoration, and PASS cleanup are performed by Node.js and GitHub Actions.

### Stable canonical projections

Truth-readable documents are registered under \`truth_readable_registry\` in \`ChatMachines/GeminiSupervisor/dependency-map.json\`. Each entry records the native canonical source, its stable reader, and per-document provenance: \`canonical_path\`, \`format\`, \`stable_reader_path\`, \`source_blob_sha\`, \`source_commit_sha\`, \`reader_blob_sha\`, \`item_count\`, and \`last_synced_at\`.

Stable readers live under \`ChatMachines/GeminiSupervisor/stable-readers/\`. They are deterministic ordered JSON projections mechanically derived from the canonical files. The canonical source does not need to use the same representation as the projection; the stable projection is the normalized reading surface used by the verification gate.

Reader synchronization is implemented by \`ChatMachines/GeminiSupervisor/scripts/sync-stable-readers.js\` and \`.github/workflows/gemini-supervisor-reader-sync.yml\`. A stable reader is regenerated only when its own canonical source/provenance changes.

### Step 0 generated form

A new Step 0 run uses a system-generated form rather than requiring the worker to manufacture the entire return schema from scratch:

\`\`\`text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/step-0-form.json
ChatMachines/GeminiSupervisor/runs/<run_nonce>/.step-0-form.lock.json
\`\`\`

The generator is \`ChatMachines/GeminiSupervisor/scripts/generate-step-0-form.js\`. The system pre-populates and locks the run nonce, verbatim user request, required and forbidden roles, generation timestamp, Step 0 identity, and selectable truth-readable document universe. The worker fills the execution fields and document-selection booleans.

On the first Step 0 trigger, the state-machine workflow creates the form and stops. After the completed form is committed, the truth-reader workflow creates the challenge for that same run nonce. Once the nonce has a durable truth-reader PASS receipt, the state-machine workflow uses the completed form as Step 0's return schema and resumes the existing Supervisor gate.

### Nonce-scoped full and repair projections

Truth challenges are isolated under:

\`\`\`text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/truth-reader/
\`\`\`

For each selected document, the challenge generator copies the current stable reader into an intact worker-visible \`<doc_id>.full.json\` and creates an editable damaged \`<doc_id>.repair.json\`. Both are bound to the run nonce and carry document/source/reader provenance.

A machine-owned baseline is retained while the challenge is active:

\`\`\`text
truth-reader/.baseline/<doc_id>.full.json
truth-reader/.baseline/<doc_id>.repair.json
\`\`\`

This prevents a worker from changing both visible files to manufacture a match.

### Random distributed damage

The repair copy damages approximately 10% of eligible projection records using cryptographically secure randomness. Eligible records are divided into multiple regions and random removals are selected across those regions, preventing all damage from clustering in one document area and avoiding a predictable every-Nth pattern.

Substantial content records are preferred over empty or punctuation-only records. Every selected record is replaced by the same generic placeholder:

\`\`\`json
{
  "^MISSING_KEY^": "^MISSING_VALUE^"
}
\`\`\`

There are no seed values, numbered gaps, answer arrays, or worker-visible gap maps. The worker compares the repair projection with the supplied full projection and restores the repair projection completely.

### Deterministic verification

The verifier is \`ChatMachines/GeminiSupervisor/scripts/truth-challenge-engine.js\`; the workflow is \`.github/workflows/truth-challenge.yml\`.

PASS requires: the run binding to match; the visible full projection to remain exactly equal to its trusted full baseline; no missing placeholders to remain; the repaired projection to be deeply and structurally equal to the intact full projection; and every selected document to pass. Partial repair is FAIL. Gemini cannot override this result.

On FAIL, the exact original damaged repair copy is restored from the trusted baseline, so retry uses the same damage pattern. On PASS, a durable \`truth-reader/PASS.json\` receipt remains under the run nonce while the transient full files, repair files, baseline, manifest, and FAIL status are removed.

The earlier global seed/proof selector/status model is retired. Runtime settings are recorded under \`truth_reader_runtime\` in \`dependency-map.json\`.

### Historical run cutoff

All Supervisor nonces that existed before this nonce-scoped repair design were physically moved out of the active runs directory into:

\`\`\`text
ChatMachines/GeminiSupervisor/historical/runs/
\`\`\`

Their original Git subtrees were preserved. The active \`ChatMachines/GeminiSupervisor/runs/\` path is reserved for runs created under the new architecture. The cutoff inventory is recorded in \`ChatMachines/GeminiSupervisor/historical-runs.json\`.
`;

const original = fs.readFileSync(readmePath, 'utf8');
if (original.includes(marker)) {
  console.log('README verification section already present; no change.');
  process.exit(0);
}

fs.writeFileSync(readmePath, original.replace(/\s*$/, '') + section + '\n', 'utf8');
console.log('Appended README deterministic truth-reader verification section.');
