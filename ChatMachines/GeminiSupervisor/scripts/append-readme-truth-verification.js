'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const readmePath = path.join(root, 'ChatMachines/GeminiSupervisor/README.md');
const marker = '## 19. Deterministic truth-reader verification';

const section = String.raw`

---

## 19. Deterministic truth-reader verification

The truth-reader system provides deterministic evidence that a worker acquired fresh repository-derived reading context from required documents. Gemini does **not** decide this verification result. Reader construction, provenance checks, challenge generation, puzzle verification, FAIL restoration, and PASS cleanup are performed by Node.js/GitHub Actions.

### Canonical documents, stable readers, and provenance

Truth-readable documents are registered under `truth_readable_registry` in:

```text
ChatMachines/GeminiSupervisor/dependency-map.json
```

Each registry entry records:

```text
canonical_path
format
stable_reader_path
active_projection_path
source_blob_sha
source_commit_sha
reader_blob_sha
item_count
last_synced_at
```

Stable readers live under:

```text
ChatMachines/GeminiSupervisor/stable-readers/
```

They are deterministic ordered JSON projections of the complete canonical source. Text files are projected as ordered source-line elements; JSON documents are also preserved as complete ordered source content rather than summarized by a model.

Reader provenance is **per document**. The reader-sync mechanism compares the canonical document's current Git blob SHA and last source-changing commit SHA against that document's stored provenance. An unrelated repository commit does not rebuild the reader. A reader is regenerated only when its own canonical source/provenance no longer matches.

The deterministic sync implementation is:

```text
ChatMachines/GeminiSupervisor/scripts/sync-stable-readers.js
.github/workflows/gemini-supervisor-reader-sync.yml
```

### Selecting documents for a verification challenge

The current selector is:

```text
ChatMachines/GeminiSupervisor/truth-selector.json
```

Its keys must exactly match the registered truth-readable document IDs and every value must be boolean. A worker requests one or more documents by setting the corresponding values to `true` and committing the selector.

The truth-challenge workflow then verifies the selected stable readers against the dependency-map provenance before issuing a challenge. A missing reader or provenance mismatch blocks challenge generation rather than silently rebuilding the reader inside the challenge workflow.

### Seed/proof swap puzzle

For each selected reader, the workflow creates an ephemeral active projection and inserts fresh CSPRNG-generated seed elements at distributed locations across the ordered content.

A seed element is issued in this form:

```json
{
  "type": "truth_seed",
  "seed_id": "agents:seed:3",
  "seed_value": "8fa31c2d...",
  "proof_value": "00000000..."
}
```

`proof_value` is an all-zero string exactly the same length as `seed_value`.

The worker solves the puzzle **in place** by swapping those two values for every seed element:

```json
{
  "type": "truth_seed",
  "seed_id": "agents:seed:3",
  "seed_value": "00000000...",
  "proof_value": "8fa31c2d..."
}
```

The active projection itself is the evidence surface. There is no separate seed-answer array. Knowing the seeds alone is insufficient: the worker must perform the correct per-location transformation in the challenged projection.

The projection also carries this instruction:

```text
For every truth_seed item, swap seed_value and proof_value. Change nothing else.
```

### Trusted snapshot and exact verification

When a challenge is issued, the workflow stores an exact trusted snapshot of every original seeded projection. Verification computes the expected solved projection from that trusted snapshot and requires deep structural equality with the worker-committed projection.

PASS therefore requires all of the following simultaneously:

1. Every required active projection exists.
2. Every `truth_seed` remains at its original position with the same `seed_id`.
3. Each original random `seed_value` appears intact as the solved `proof_value`.
4. Each original all-zero `proof_value` appears intact as the solved `seed_value`.
5. Content elements, source provenance, challenge ID, document ID, item order, item count, and every other field remain unchanged.
6. Every seed puzzle is solved; partial completion is FAIL.

The deterministic verifier is:

```text
ChatMachines/GeminiSupervisor/scripts/truth-challenge-engine.js
```

The lifecycle workflow is:

```text
.github/workflows/truth-challenge.yml
```

### FAIL behavior

If verification fails, the challenge does **not** advance or reset. The workflow replaces every worker-edited active projection with its exact original seeded snapshot and commits the restoration:

```text
Restore GeminiSupervisor truth-reading puzzle after failed proof
```

The same challenge can then be attempted again from its original seeded state. The workflow itself exits failed after committing the restoration.

### PASS behavior and current reset point

If every projection exactly matches the expected seed/proof swap solution, verification returns PASS. The current implementation immediately performs cleanup in the same workflow run:

```text
worker commits solved projection
        ↓
deterministic verifier returns PASS
        ↓
selector booleans reset to false
active projections deleted
trusted challenge snapshots deleted
active challenge-state file deleted
truth-status.json records PASS
        ↓
workflow commits cleanup
```

The cleanup commit is:

```text
Complete GeminiSupervisor truth-reading puzzle
```

The solved projection remains available in Git history as the worker's solution commit, while the live branch returns to a clean challenge state. Workflow-generated commits do not recursively create another truth challenge because the challenge workflow excludes `github-actions[bot]`.

The compact current status surface is:

```text
ChatMachines/GeminiSupervisor/truth-status.json
```

### What the proof establishes

The puzzle is intended to establish three properties mechanically:

```text
freshness
  challenge seeds were generated after the triggering selection commit

coverage
  multiple challenge elements are distributed through the selected reading projection

interaction
  the worker must correctly transform each challenged location in the committed projection
```

The mechanism does not attempt to prove a philosophical notion of comprehension. It establishes that fresh challenged repository content crossed into the worker's working context sufficiently for the worker to perform the required distributed transformations.

### Trust boundary

```text
canonical documents
  authoritative source content

stable readers
  deterministic complete projections with per-document provenance

GitHub Actions / Node.js
  trusted reader construction, CSPRNG challenge generation, snapshot retention,
  exact verification, FAIL restoration, and PASS cleanup

worker agent
  untrusted claimant that must solve the committed projection puzzle

Gemini
  semantic Supervisor evaluator; not authoritative for truth-puzzle PASS/FAIL
```

Truth-puzzle findings are therefore deterministic evidence and must not be overridden by a semantic model result.

### Agreed Supervisor integration: nonce-scoped puzzles

The deployed truth challenge is currently repository-global. The agreed Supervisor integration is to scope challenge state to the Supervisor `run_nonce` while retaining the stable readers globally.

Target layout:

```text
ChatMachines/GeminiSupervisor/stable-readers/

ChatMachines/GeminiSupervisor/runs/<run_nonce>/truth-reader/
  selector.json
  status.json
  challenge-state.json
  active/
  snapshots/
```

Each nonce-scoped active projection should also carry its `run_nonce` explicitly. Validation will require equality across:

```text
projection.run_nonce
run-directory nonce
challenge-state nonce
Supervisor run_nonce
```

This prevents a proof produced for one Supervisor run from being transplanted into another run and allows concurrent Supervisor runs to hold independent truth-reading challenges.

Under the nonce-scoped design, the active solved projection and snapshots may still be cleaned after deterministic verification, but the compact PASS record should remain under the nonce as durable run evidence. Until that integration is implemented, the current global paths and lifecycle described above remain authoritative.
`;

const original = fs.readFileSync(readmePath, 'utf8');
if (original.includes(marker)) {
  console.log('README verification section already present; no change.');
  process.exit(0);
}

fs.writeFileSync(readmePath, original.replace(/\s*$/, '') + section + '\n', 'utf8');
console.log('Appended README deterministic truth-reader verification section.');
