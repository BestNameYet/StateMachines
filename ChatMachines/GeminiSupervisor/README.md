# Gemini Supervisor Bootstrap and Operations Guide

This document is the operator/bootstrap guide for the current Gemini Supervisor implementation in `BestNameYet/StateMachines`.

The active Supervisor lives at:

```text
ChatMachines/GeminiSupervisor/
```

The active execution engine is **Node.js**, not Apps Script. The runtime entry point is:

```text
ChatMachines/GeminiSupervisor/send-to-gemini.js
```

The normal Supervisor workflow runs on GitHub Actions with Node 22 and is triggered by a commit to the configured `nextmessage` trigger file on `main`.

---

## 1. Mental model

A Supervisor session is a persisted state-machine run identified by a unique `run_nonce`.

The controller side is ChatGPT. ChatGPT executes the current step and writes that step's required return schema into:

```text
ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json
```

A commit of that file to `main` starts the GitHub Actions workflow. The workflow runs `send-to-gemini.js`, which:

1. Loads `config.json`.
2. Loads the configured `Agents.md` contract.
3. Reads `nextmessage/nextmessage.json`.
4. Creates or resumes `runs/<run_nonce>/`.
5. Determines the current required step.
6. Validates the ChatGPT execution payload deterministically.
7. Performs live-ground-truth checks for execution/completion claims.
8. Sends the current step, execution result, validation findings, and relevant context to Gemini for the supervisory gate.
9. Persists the execution, validation, Gemini response, and transition state.
10. Returns either `PASS` or `FAIL` for the current step.
11. On `PASS`, advances to the next step.
12. On `FAIL`, remains on the same step for correction.
13. Commits the updated run container back to `main`.

The current contract defines ChatGPT-owned procedure Steps **0 through 4** and Gemini-owned supervisory gates between them.

A commit is therefore not the end of the controller turn. The operational loop is:

```text
ChatGPT executes current step
        |
        v
commit nextmessage.json
        |
        v
GitHub Actions runs send-to-gemini.js
        |
        v
Gemini supervisory gate
        |
        +---- FAIL ----> correct SAME step and recommit
        |
        +---- PASS ----> execute NEXT step and recommit
                              |
                              v
                    repeat until terminal
```

The session is terminal when the last required step passes and the run state reports:

```text
status = "complete"
procedure.current_step = null
procedure.awaiting = null
```

---

## 2. Important files

| File | Purpose |
|---|---|
| `Agents.md` | Canonical Supervisor contract: rules, step definitions, return schemas, and Gemini supervisory-gate requirements. |
| `send-to-gemini.js` | Active Node runtime. Loads the contract/config, validates execution returns, performs live-ground-truth checks, invokes Gemini, persists state, and transitions the machine. |
| `config.json` | Shared runtime/specification path configuration. |
| `nextmessage/nextmessage.json` | Normal Supervisor input/trigger file. A push changing this file on `main` starts the Supervisor workflow. |
| `runs/<run_nonce>/state.json` | State-machine state for one session. |
| `runs/<run_nonce>/messages.json` | Persisted ChatGPT execution/Gemini supervision history for one session. |
| `runs/<run_nonce>/store/store.json` | Persisted audit/evidence/event records for one session. |
| `tests/step-3-evaluation.json` | Active Step 3 evaluation artifact containing both the evaluation heuristic and Step3 TSR question corpus. |
| `dependency-map.json` | Defines dependency-sync relationships for `Agents.md` and `send-to-gemini.js`. |
| `dependency-sync-sentinel.json` | Prevents recursive dependency-sync loops. Normally `enabled: true`. |
| `MANIFEST.md` | Inventory and classification of Supervisor files. |
| `current_state.json` | Legacy root-level state artifact. Do not use this as the live state of a current run. |
| `messages.json` | Legacy root-level message artifact. Current sessions use `runs/<run_nonce>/messages.json`. |
| `store/store.json` | Legacy root-level store artifact. Current sessions use `runs/<run_nonce>/store/store.json`. |
| `Code.gs` | Apps Script bridge retained in the folder; it is not the normal current Supervisor execution engine. |

---

## 3. GitHub repository variables

The normal Supervisor workflow injects these GitHub Actions repository variables:

```text
GEMINI_API_KEY
GEMINI_MODEL
```

### `GEMINI_API_KEY`

Required by `send-to-gemini.js`. If it is absent, the runtime stops with:

```text
GEMINI_API_KEY is missing from the GitHub Actions environment.
```

The current workflow reads it from:

```yaml
${{ vars.GEMINI_API_KEY }}
```

### `GEMINI_MODEL`

Optional for the normal Supervisor runtime. `send-to-gemini.js` currently falls back to:

```text
gemini-3.8-flash
```

when `GEMINI_MODEL` is missing or empty.

### How to change repository variables

In GitHub:

1. Open the `BestNameYet/StateMachines` repository.
2. Open **Settings**.
3. Open **Secrets and variables**.
4. Open **Actions**.
5. Select the **Variables** tab.
6. Add or update `GEMINI_API_KEY`.
7. Add or update `GEMINI_MODEL` if a non-default model is desired.
8. Save the variable.
9. No code commit is required merely to change a repository variable.
10. The new value is used by the next workflow run.

### Credential note

The current workflows intentionally reference GitHub Actions **Variables**, not **Secrets**. If `GEMINI_API_KEY` is migrated to GitHub Secrets, the workflow expressions must also be changed from:

```yaml
${{ vars.GEMINI_API_KEY }}
```

to:

```yaml
${{ secrets.GEMINI_API_KEY }}
```

in every workflow that invokes Gemini.

---

## 4. `config.json`

Current configuration:

```json
{
  "version": 1,
  "description": "Shared configuration for Gemini Supervisor runtime and specification dependencies.",
  "agents_file": "ChatMachines/GeminiSupervisor/Agents.md",
  "trigger_file": "ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json",
  "runs_directory": "ChatMachines/GeminiSupervisor/runs",
  "external_files": {
    "step3_evaluation_artifact": {
      "path": "ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json",
      "description": "Consolidated single source of truth for Step 3 evaluation method heuristic and Step3_TSR question corpus.",
      "keys": [
        "evaluation_heuristic",
        "step3_tsr"
      ]
    }
  }
}
```

### `agents_file`

Controls which rules/specification file the Node runtime loads.

Default:

```text
ChatMachines/GeminiSupervisor/Agents.md
```

If this path is changed, the target file must exist and must contain parseable headings in this form:

```text
## Step N
```

The runtime discovers procedure steps from those headings.

### `trigger_file`

Controls which JSON file `send-to-gemini.js` reads as the current execution submission.

Default:

```text
ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json
```

**Important:** changing this config value alone is not sufficient. The GitHub Actions workflow currently has this trigger path hardcoded in `.github/workflows/gemini-chat.yml`. If `trigger_file` moves, update the workflow `on.push.paths` entry at the same time or commits to the new trigger file will not start the workflow.

### `runs_directory`

Controls where the Node runtime creates per-session run containers.

Default:

```text
ChatMachines/GeminiSupervisor/runs
```

**Important:** the workflow currently stages and reads `ChatMachines/GeminiSupervisor/runs` directly when it creates the checkpoint commit. If `runs_directory` changes, update `.github/workflows/gemini-chat.yml` as well or the runtime may write state that the workflow does not commit correctly.

### `external_files.step3_evaluation_artifact.path`

Controls the active JSON artifact used for Step 3 evaluation.

Default:

```text
ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json
```

The runtime requires this JSON file to contain both:

```text
evaluation_heuristic
step3_tsr
```

A Step 3 run fails if the configured file is missing or either key is missing.

### `description`, `version`, and `keys`

These provide configuration metadata/documentation. The operational runtime path resolution is driven by the path fields above. The runtime itself directly verifies that the Step 3 artifact contains `evaluation_heuristic` and `step3_tsr`.

---

## 5. How to change Supervisor configuration safely

### Changing only `config.json`

1. Edit `ChatMachines/GeminiSupervisor/config.json`.
2. Ensure every new path points to an existing file/directory contract.
3. If changing `trigger_file`, also update `.github/workflows/gemini-chat.yml`.
4. If changing `runs_directory`, also update `.github/workflows/gemini-chat.yml` checkpoint/staging logic.
5. If changing the Step 3 artifact path, also inspect `dependency-map.json` because it currently names the Step 3 artifact as dependency-sync context.
6. Commit the change to `main`.
7. A `config.json` commit **does not by itself trigger the normal Supervisor workflow**.
8. The new config is consumed the next time `nextmessage.json` triggers the state machine.

### Changing `Agents.md`

`Agents.md` is a dependency-sync trigger.

1. Change `ChatMachines/GeminiSupervisor/Agents.md`.
2. Do **not** include a simultaneous manual change to `send-to-gemini.js` in the same dependency-sync push.
3. Commit to `main`.
4. `gemini-supervisor-dependency-sync.yml` starts automatically.
5. The workflow treats `Agents.md` as the authoritative base for that run.
6. The dependency evaluator compares the mapped dependents against the changed base.
7. Mapped dependents currently include:
   - `ChatMachines/GeminiSupervisor/send-to-gemini.js`
   - `ChatMachines/GeminiSupervisor/config.json`
8. If changes are required, the workflow writes complete replacement dependent files.
9. It commits those changes with the dependency-sync sentinel set to `false`.
10. Any recursive sync run caused by the dependent rewrite sees the false sentinel and suppresses itself.
11. The workflow then restores the sentinel to `true` in a sentinel-only commit.

### Changing `send-to-gemini.js`

The same process applies in the opposite direction.

1. Change `ChatMachines/GeminiSupervisor/send-to-gemini.js`.
2. Do **not** also manually change `Agents.md` in that same dependency-sync push.
3. Commit to `main`.
4. Dependency sync treats `send-to-gemini.js` as the authoritative base.
5. Mapped dependents currently include:
   - `ChatMachines/GeminiSupervisor/Agents.md`
   - `ChatMachines/GeminiSupervisor/config.json`
6. The evaluator may return `NO_CHANGE` or a complete `REPLACE` for each dependent.
7. The sentinel sequence suppresses recursion as described above.

### Why only one of the two base files should change

The dependency-sync workflow explicitly counts changed mapped base files and requires **exactly one** of:

```text
ChatMachines/GeminiSupervisor/Agents.md
ChatMachines/GeminiSupervisor/send-to-gemini.js
```

in a dependency-sync push.

If both are changed in the same push, the workflow intentionally fails because it cannot determine which one is authoritative.

### Changing `tests/step-3-evaluation.json`

A commit to the Step 3 evaluation artifact does not currently trigger the normal Supervisor workflow or dependency sync by itself.

The updated artifact is consumed when a future session reaches Step 3.

---

## 6. Workflow trigger map

All Supervisor operational workflows below run from GitHub Actions. The normal Supervisor/evaluator workflows are restricted to `main` unless otherwise noted.

| Workflow | Triggering commit path | What it does |
|---|---|---|
| `.github/workflows/gemini-chat.yml` | `ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json` | Runs the normal Gemini Supervisor state machine using Node 22, then commits changes under `ChatMachines/GeminiSupervisor/runs`. |
| `.github/workflows/gemini-supervisor-dependency-sync.yml` | `ChatMachines/GeminiSupervisor/Agents.md` **or** `ChatMachines/GeminiSupervisor/send-to-gemini.js` | Aligns mapped dependent Supervisor files using the Gemini evaluator. Requires exactly one mapped base file to have changed while sentinel is enabled. |
| `.github/workflows/gemini-supervisor-evaluator.yml` | Anything under `ChatMachines/GeminiEvaluation/evaluator-nextmessage/**` | Runs the standalone Supervisor evaluator/revision system in `ChatMachines/GeminiEvaluation`. This is not the ordinary user-request session workflow. |
| `.github/workflows/gemini-supervisor-historical-audit.yml` | `ChatMachines/GeminiEvaluation/historical-audit-nextmessage/nextmessage.json` | Builds and evaluates historical audit evidence. This is not the ordinary user-request session workflow. |
| `.github/workflows/github-node-test.yml` | `ChatMachines/GitHubNodeTest/run.js` | Runs the independent GitHub Node demonstration/test. |
| `.github/workflows/test-appscript-endpoint.yml` | `.github/workflows/test-appscript-endpoint.yml` itself | Tests the Apps Script endpoint by POSTing a JavaScript function and arguments. Unlike the other workflows above, its trigger does not specify `branches: [main]`. |

### Commits that do not currently trigger the normal Supervisor workflow by themselves

Examples include:

```text
ChatMachines/GeminiSupervisor/README.md
ChatMachines/GeminiSupervisor/config.json
ChatMachines/GeminiSupervisor/dependency-map.json
ChatMachines/GeminiSupervisor/dependency-sync-sentinel.json
ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json
ChatMachines/GeminiSupervisor/runs/**
```

The GitHub Actions bot's checkpoint commits change only `runs/**`, so those checkpoint commits do not recursively trigger another normal Supervisor run.

Editing `.github/workflows/gemini-chat.yml` alone also does not trigger `gemini-chat.yml`, because its `paths:` filter is the Supervisor `nextmessage.json` file rather than the workflow file itself.

---

## 7. Starting a new Supervisor session

A new session is started by submitting a valid **Step 0 ChatGPT execution return** under a new `run_nonce` and committing the trigger file to `main`.

### Step 1 — choose a `run_nonce`

The Node runtime accepts only path-safe values matching:

```text
[A-Za-z0-9_-]+
```

Use letters, digits, `_`, and `-` only.

Good examples:

```text
readme_bootstrap_20261001_1
fix_supervisor_config_20261001_1
user_request_0042
```

Do not use spaces, slashes, or periods.

The `run_nonce` becomes the directory name:

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/
```

Use a new nonce for a new user request/session. Reusing an existing nonce resumes that existing run rather than creating a new isolated run.

### Step 2 — preserve the user request verbatim

Step 0 requires the actual user request text in:

```text
start_of_turn.user_request
```

Do not replace the user's words with an assistant summary.

### Step 3 — create the Step 0 trigger payload

The top-level trigger format is:

```json
{
  "run_nonce": "readme_bootstrap_20261001_1",
  "execution": {
    "source_role": "ChatGPT model",
    "step": 0,
    "return_schema": {
      "start_of_turn": {
        "role_required": "ChatGPT model",
        "role_forbidden": "Gemini model",
        "role_completed": "ChatGPT model",
        "role_verification": {
          "method": "ChatGPT execution locus via connected GitHub tool",
          "evidence": "ChatGPT authored and submitted this Step 0 execution return through the connected repository tool; runtime ground-truth checks independently verify execution-dependent claims."
        },
        "run_nonce": "readme_bootstrap_20261001_1",
        "user_request": "<VERBATIM USER REQUEST>",
        "current_timestamp": "<ISO 8601 timestamp>",
        "return_schema_completed": true,
        "return_schema_completed_timestamp": "<ISO 8601 timestamp>",
        "nonce": "<non-empty request identifier>"
      }
    }
  }
}
```

Write it to:

```text
ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json
```

The exact Step 0 return schema is governed by `Agents.md`. If `Agents.md` changes, follow the current live schema there rather than copying an old run.

### Step 4 — commit the trigger to `main`

Commit the changed trigger file.

Example conceptual commit:

```text
Start Gemini Supervisor run readme_bootstrap_20261001_1
```

A push changing the trigger on `main` starts:

```text
Gemini Supervisor state machine
```

from `.github/workflows/gemini-chat.yml`.

### Step 5 — what the first workflow does

For a previously unseen `run_nonce`, the runtime creates:

```text
runs/<run_nonce>/state.json
runs/<run_nonce>/messages.json
runs/<run_nonce>/store/store.json
```

The initial state is created before Step 0 is evaluated.

The initial machine state is conceptually:

```text
status: awaiting_chatgpt_execution
current_step: first step defined in Agents.md
completed_steps: []
remaining_steps: all discovered steps
awaiting: chatgpt_execution for current step
```

The runtime then validates the submitted Step 0 result, runs live-ground-truth verification, and asks Gemini to supervise Step 0.

### Step 6 — inspect the result

The workflow writes the result into the run container and commits it to `main`.

Inspect:

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/state.json
```

The most important fields are:

```text
current_state.status
current_state.procedure.current_step
current_state.procedure.completed_steps
current_state.procedure.remaining_steps
current_state.procedure.awaiting
current_state.procedure.step_records
current_state.last_supervisory_failure
```

The GitHub Actions runtime also prints a JSON summary containing values including:

```text
runtime
node_version
model
run_nonce
evaluated_step
deterministic_validation_failures
ground_truth_aggregate_status
ground_truth_blocking_findings
gate_result
next_step
```

The workflow checkpoint commit message is built in this form:

```text
Gemini Supervisor checkpoint: <run_nonce> Step <step> <gate>
```

---

## 8. Continuing a session after `PASS`

If Step 0 passes, the state machine advances to Step 1.

The workflow does **not** itself author the next ChatGPT execution return. The controller must submit the next required step.

1. Read `runs/<run_nonce>/state.json`.
2. Confirm the previous step has `PASS`.
3. Read `procedure.current_step`.
4. Read the matching current step section in `Agents.md`.
5. Execute that step as ChatGPT.
6. Construct that step's exact required return schema.
7. Keep the same `run_nonce`.
8. Replace `nextmessage/nextmessage.json` with the next execution submission.
9. Set `execution.source_role` to `ChatGPT model`.
10. Set `execution.step` to the current step number.
11. Put the exact required step return object in `execution.return_schema`.
12. Commit `nextmessage/nextmessage.json` to `main`.
13. Wait for the new checkpoint state.
14. Repeat until terminal.

Generic continuation envelope:

```json
{
  "run_nonce": "same_run_nonce",
  "execution": {
    "source_role": "ChatGPT model",
    "step": 1,
    "return_schema": {
      "<exact schema required by current Agents.md Step 1>": "..."
    }
  }
}
```

Do not advance by guessing the next step. `runs/<run_nonce>/state.json` is the live machine authority for the current step.

---

## 9. What happens on `FAIL`

A failed supervisory gate does not advance the procedure.

The runtime keeps:

```text
procedure.current_step = failed step
procedure.awaiting.type = "chatgpt_execution"
procedure.awaiting.reason = "supervisory_gate_fail"
status = "awaiting_chatgpt_execution"
```

and records `last_supervisory_failure`.

Correction procedure:

1. Keep the **same `run_nonce`**.
2. Keep `execution.step` set to the failed step.
3. Inspect `state.json` for deterministic validation failures and the Gemini supervisory return.
4. Inspect `messages.json` and `store/store.json` when more evidence is needed.
5. Correct the actual failed requirement; do not skip ahead.
6. Replace the failed step's return schema with the corrected version.
7. Commit `nextmessage/nextmessage.json` again.
8. The normal Supervisor workflow runs again.
9. The new attempt is appended to the same run/step history.
10. Only a `PASS` can advance the machine.

A raw user prompt or a JSON object without the `execution` envelope is not a valid current-step execution submission. The runtime explicitly treats a missing `execution` object as a deterministic validation failure.

---

## 10. Step 3 special behavior

Step 3 additionally depends on the artifact configured at:

```text
external_files.step3_evaluation_artifact.path
```

Currently:

```text
ChatMachines/GeminiSupervisor/tests/step-3-evaluation.json
```

The file must contain:

```text
evaluation_heuristic
step3_tsr
```

The runtime includes that artifact in Step 3 context and validates the Step 3 return against the current contract.

If Step 3 suddenly fails after changes to the test/evaluation corpus, check all three of:

```text
config.json
Agents.md
send-to-gemini.js
```

plus the current `tests/step-3-evaluation.json` content.

---

## 11. Dependency synchronization

Dependency synchronization exists because `Agents.md`, the runtime, and shared config must stay aligned.

Current map:

```text
Agents.md
  -> send-to-gemini.js
  -> config.json

send-to-gemini.js
  -> Agents.md
  -> config.json
```

`tests/step-3-evaluation.json` is supplied as read-only context during this alignment.

The guard file is:

```text
ChatMachines/GeminiSupervisor/dependency-sync-sentinel.json
```

Normal state:

```json
{
  "enabled": true
}
```

When the sync workflow writes dependent changes it intentionally commits the sentinel as `false`, which causes any recursively triggered dependency-sync workflow to exit without doing another alignment. It then restores the sentinel to `true`.

### Do not casually leave the sentinel false

If it is false, a future `Agents.md` or `send-to-gemini.js` change will still trigger the workflow, but the alignment run will intentionally suppress itself.

---

## 12. Standalone evaluator versus normal Supervisor session

There are two different concepts that should not be confused.

### Normal Supervisor session

Trigger:

```text
ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json
```

Workflow:

```text
.github/workflows/gemini-chat.yml
```

Runtime:

```text
ChatMachines/GeminiSupervisor/send-to-gemini.js
```

State:

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/
```

### Standalone Gemini Evaluation system

Trigger:

```text
ChatMachines/GeminiEvaluation/evaluator-nextmessage/**
```

Workflow:

```text
.github/workflows/gemini-supervisor-evaluator.yml
```

Runtime:

```text
ChatMachines/GeminiEvaluation/evaluate-supervisor.js
```

This system evaluates or revises the Supervisor implementation/specification. It is not the normal per-user-request state-machine session.

### Historical audit system

Trigger:

```text
ChatMachines/GeminiEvaluation/historical-audit-nextmessage/nextmessage.json
```

Workflow:

```text
.github/workflows/gemini-supervisor-historical-audit.yml
```

This builds a historical evidence archive, segments it deterministically, runs the historical evaluator, and persists audit state under `ChatMachines/GeminiEvaluation/evaluations/<run_nonce>/`.

---

## 13. Observability: where to look when something goes wrong

Use this order.

### 1. GitHub Actions run

Open **Actions** and inspect the relevant workflow.

For the normal state machine, look for:

```text
Gemini Supervisor state machine
```

The run will show whether failure occurred during checkout, Node setup, Supervisor execution, or checkpoint commit/push.

### 2. `runs/<run_nonce>/state.json`

This is the best first source for machine status.

Look for:

```text
status
current_step
completed_steps
remaining_steps
awaiting
step_records
transition_value
last_supervisory_failure
```

### 3. `runs/<run_nonce>/messages.json`

Use this to inspect the persisted execution/supervision conversation and validation messages.

### 4. `runs/<run_nonce>/store/store.json`

Use this for audit/evidence records, including deterministic validation and live-ground-truth records.

### 5. `nextmessage/nextmessage.json`

Verify that:

```text
run_nonce matches the intended run
execution.source_role = "ChatGPT model"
execution.step matches state.json current_step
execution.return_schema is an object
```

### 6. `Agents.md`

Verify the exact schema required by the current step. Do not use a schema copied from an old run if the contract has changed.

### 7. `config.json`

Verify all configured paths still point at the intended live files.

---

## 14. Common failure modes

### Workflow did not start

Check:

1. Was the commit pushed to `main`?
2. Did the commit actually change `ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json`?
3. Was `trigger_file` moved in `config.json` without also updating `.github/workflows/gemini-chat.yml`?

### `GEMINI_API_KEY is missing`

The GitHub Actions repository variable is absent or unavailable to the workflow.

### Invalid `run_nonce`

Use only:

```text
A-Z a-z 0-9 _ -
```

### Incomplete run container

If any one of these exists without the other two:

```text
state.json
messages.json
store/store.json
```

`send-to-gemini.js` treats the run container as incomplete and stops instead of silently rebuilding it.

### Execution step mismatch

If state says Step 2 but the trigger submits Step 3, deterministic validation fails. Correct Step 2; do not jump forward.

### Missing `execution` object

The current runtime requires the ChatGPT execution envelope. Raw trigger input is not accepted as a valid current-step execution result.

### Step return schema incomplete

Each step has exact required fields. Read the current `Agents.md` section and its field glossary.

### Ground-truth blocking finding

A syntactically correct execution return can still fail if a material completion/execution claim cannot be verified against live authoritative evidence.

### Dependency-sync workflow fails immediately

Check whether both `Agents.md` and `send-to-gemini.js` changed in the same push. The workflow requires exactly one authoritative mapped base file per dependency-sync event.

### Dependency sync unexpectedly does nothing

Check:

```text
ChatMachines/GeminiSupervisor/dependency-sync-sentinel.json
```

If `enabled` is `false`, the run intentionally suppresses itself.

### Changed `runs_directory`, but state is not committed

The Node runtime reads `runs_directory` from `config.json`, but the current workflow checkpoint logic still stages the default `ChatMachines/GeminiSupervisor/runs` location directly. Update the workflow when moving the run root.

---

## 15. Minimal new-session checklist

Before starting:

- [ ] `GEMINI_API_KEY` is configured for GitHub Actions.
- [ ] `GEMINI_MODEL` is configured if the default model is not desired.
- [ ] `config.json` points to the intended `Agents.md`, trigger, run root, and Step 3 artifact.
- [ ] `dependency-sync-sentinel.json` is `enabled: true` unless suppression is intentional.
- [ ] The new `run_nonce` is unique and path-safe.
- [ ] The Step 0 `user_request` is verbatim.
- [ ] The Step 0 return object matches the current `Agents.md` schema.
- [ ] `execution.source_role` is `ChatGPT model`.
- [ ] `execution.step` is `0` for a new run.
- [ ] `nextmessage/nextmessage.json` is committed to `main`.

After each workflow run:

- [ ] Read the new checkpoint state.
- [ ] Confirm `gate_result` / transition value.
- [ ] On `FAIL`, correct the same step.
- [ ] On nonterminal `PASS`, execute the next step immediately.
- [ ] Keep the same `run_nonce` through the whole session.
- [ ] End only when state is terminal.

---

## 16. Recommended operator discipline

For predictable operation:

1. Treat `Agents.md` as the step/schema authority.
2. Treat `state.json` as the current-step authority.
3. Treat live repository/runtime evidence as the authority for execution/completion claims.
4. Use one `run_nonce` per user request/session.
5. Never skip a failed step.
6. Never use a new `run_nonce` merely to escape a failed gate.
7. Keep normal session triggering isolated to `nextmessage/nextmessage.json` commits.
8. When changing `Agents.md` or `send-to-gemini.js`, change only one authoritative base file per dependency-sync push.
9. Remember that `config.json` path changes may require corresponding workflow/dependency-map changes because GitHub trigger/staging paths exist outside the Node config loader.
10. Inspect the persisted run container before making claims about whether a session passed, failed, advanced, or completed.

---

## 17. Quick reference

### Start/resume normal Supervisor

```text
Edit:
ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json

Commit to:
main

Workflow:
.github/workflows/gemini-chat.yml

Runtime:
ChatMachines/GeminiSupervisor/send-to-gemini.js
```

### Read live session state

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/state.json
```

### Read session conversation/gates

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/messages.json
```

### Read session audit/evidence records

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/store/store.json
```

### Change canonical rules

```text
ChatMachines/GeminiSupervisor/Agents.md
```

This automatically invokes dependency synchronization on `main`.

### Change runtime

```text
ChatMachines/GeminiSupervisor/send-to-gemini.js
```

This automatically invokes dependency synchronization on `main`.

### Change shared runtime paths

```text
ChatMachines/GeminiSupervisor/config.json
```

No normal workflow is triggered by that commit alone.

### Trigger standalone evaluator

```text
ChatMachines/GeminiEvaluation/evaluator-nextmessage/**
```

### Trigger historical audit

```text
ChatMachines/GeminiEvaluation/historical-audit-nextmessage/nextmessage.json
```

---

## 18. Current architectural boundary

The present design separates responsibility as follows:

```text
ChatGPT
  owns step execution and execution return schemas

GitHub Actions / Node runtime
  owns deterministic validation, persistence, live-ground-truth collection,
  Gemini API invocation, and state transition mechanics

Gemini
  owns the supervisory PASS/FAIL gate

Git repository
  owns durable run state, messages, evidence, and configuration
```

That role separation is intentional. Do not replace a ChatGPT-owned step by asking Gemini to execute it, and do not replace the Gemini gate by having ChatGPT declare its own PASS.

---

## 19. Deterministic truth-reader verification

GeminiSupervisor uses deterministic reading verification for repository documents that a worker must acquire as fresh context. Gemini does **not** decide this PASS/FAIL result. Stable-reader construction, provenance checks, randomized damage, exact repair verification, FAIL restoration, and PASS cleanup are performed by Node.js and GitHub Actions.

### Stable canonical projections

Truth-readable documents are registered under `truth_readable_registry` in `ChatMachines/GeminiSupervisor/dependency-map.json`. Each entry records the native canonical source, its stable reader, and per-document provenance: `canonical_path`, `format`, `stable_reader_path`, `source_blob_sha`, `source_commit_sha`, `reader_blob_sha`, `item_count`, and `last_synced_at`.

Stable readers live under `ChatMachines/GeminiSupervisor/stable-readers/`. They are deterministic ordered JSON projections mechanically derived from the canonical files. The canonical source does not need to use the same representation as the projection; the stable projection is the normalized reading surface used by the verification gate.

#### Canonical JSON flattening and shuffle representation

`Agents.md` remains the authoritative canonical source; the projection is a deterministic derivative reading and shuffle representation and does not replace `Agents.md`. For `Agents.md`, the deterministic first-stage projection converts Markdown headings into JSON keys around the JSON content beneath them; the canonical projection used for the flattening and shuffle representation is 100% JSON.

The decomposition is atomic. Each top-level projection element contributes exactly one payload fact. Ancestor objects and arrays may appear inside that element only to preserve the complete route to that fact; they do not make the element non-atomic. Object siblings are never bundled into the same payload element, and multiple members of the same array are never bundled into the same payload element.

For objects, every terminal key-value property is one atomic projection element. A keyed object-valued property also has a separate object-literal atom before its descendants. The notation `$key_object_literal:{}` is an operator instruction: substitute the actual literal source key for `$key` and emit that key with the empty object literal `{}` at the same route. The suffix `_object_literal` is not part of the emitted JSON key. Thus, for source key `procedure`, `$key_object_literal:{}` produces `{"procedure":{}}`, wrapped in any required ancestors.

For arrays, a keyed array-valued property has a separate array-literal atom before its members, and every array member is then decomposed into its own atomic projection element. The notation `$key_array_literal:[]` is likewise an operator instruction: substitute the actual literal source key for `$key` and emit that key with the empty array literal `[]` at the same route. The suffix `_array_literal` is not part of the emitted JSON key. At the array boundary, a content atom contains exactly one member.

If the JSON value supplied to the decomposition method is itself an unkeyed root object or unkeyed root array, its container atom is the bare literal `{}` or `[]` respectively. Anonymous intermediate containers are not emitted as separate structural atoms when a deeper atom already necessarily expresses their existence and type. For example, `{"outer":[{}]}` is not added merely to announce the object member when `{"outer":[{"inner":[]}]}` already establishes that structure. An anonymous intermediate container is emitted separately only when it is itself empty and would otherwise disappear from the decomposition.

This yields the following atomic object decomposition.

Source:

```json
{
  "procedure": {
    "step_contract": {
      "step_0": {
        "key": "start_of_turn",
        "value": "ready"
      }
    }
  }
}
```

Projection:

```json
[
  {},
  {"procedure":{}},
  {"procedure":{"step_contract":{}}},
  {"procedure":{"step_contract":{"step_0":{}}}},
  {"procedure":{"step_contract":{"step_0":{"key":"start_of_turn"}}}},
  {"procedure":{"step_contract":{"step_0":{"value":"ready"}}}}
]
```

Each element adds exactly one fact: the root is an object; `procedure` is an object; `step_contract` is an object at that route; `step_0` is an object at that route; the terminal `key` property has its value; and the terminal `value` property has its value.

A keyed array is decomposed the same way, with one container-literal atom and one atom per member.

Source:

```json
{
  "rule_following": [
    "A",
    "B",
    "C"
  ]
}
```

Projection:

```json
[
  {},
  {"rule_following":[]},
  {"rule_following":["A"]},
  {"rule_following":["B"]},
  {"rule_following":["C"]}
]
```

The mixed object/array case is likewise atomic.

Source:

```json
{
  "outer": [
    {
      "inner": [
        "A",
        "B"
      ]
    }
  ]
}
```

Projection:

```json
[
  {},
  {"outer":[]},
  {"outer":[{"inner":[]}]},
  {"outer":[{"inner":["A"]}]},
  {"outer":[{"inner":["B"]}]}
]
```

There is deliberately no separate `{"outer":[{}]}` element in this nonempty case. It would add no information: the `inner` atoms already require the sole `outer` member to be an object. If the source were instead `{"outer":[{}]}`, the empty object member would itself be information and would therefore be retained as its own atom.

Provenance is the retained nested JSON structure itself. Do not add a separate provenance field, generic path array, normalized identifier, or array-index metadata. Original keys and terminal values are preserved exactly. The projection atoms answer what exists and where it belongs structurally.

For shuffle use cases, the original ordering is available separately. Therefore array order is not duplicated inside projection atoms and no index metadata is added merely to survive the shuffle. Reconstruction uses the separately available original order when sequence matters.

Reconstruction recursively merges atomic projection elements at matching nesting signatures, combines container-literal atoms with their descendant atoms, and uses the separately available original order for arrays. No semantic inference is required: `$key_object_literal:{}` and `$key_array_literal:[]` are decomposition operators that preserve the two container-literal flavors that would otherwise disappear when the structure is split into atoms.

Shuffle semantics operate as follows: construct the deterministic atomic projection first, place its atoms in the top-level projection array, minify the JSON, and shuffle only the indices/elements of that outermost projection array. Shuffle semantics do not shuffle raw Markdown, characters, keys, terminal values, or content inside an individual atom. Pretty-printed JSON in README examples is explanatory only; the machine representation may be minified after construction.

Reader synchronization is implemented by `ChatMachines/GeminiSupervisor/scripts/sync-stable-readers.js` and `.github/workflows/gemini-supervisor-reader-sync.yml`. A stable reader is regenerated only when its own canonical source/provenance changes.

### Step 0 generated form

A new Step 0 run uses a system-generated form rather than requiring the worker to manufacture the entire return schema from scratch:

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/step-0-form.json
ChatMachines/GeminiSupervisor/runs/<run_nonce>/.step-0-form.lock.json
```

The generator is `ChatMachines/GeminiSupervisor/scripts/generate-step-0-form.js`. The system pre-populates and locks the run nonce, verbatim user request, required and forbidden roles, generation timestamp, Step 0 identity, and selectable truth-readable document universe. The worker fills the execution fields and document-selection booleans.

On the first Step 0 trigger, the state-machine workflow creates the form and stops. After the completed form is committed, the truth-reader workflow creates the challenge for that same run nonce. Once the nonce has a durable truth-reader PASS receipt, the state-machine workflow uses the completed form as Step 0's return schema and resumes the existing Supervisor gate.

### Nonce-scoped full and repair projections

Truth challenges are isolated under:

```text
ChatMachines/GeminiSupervisor/runs/<run_nonce>/truth-reader/
```

For each selected document, the challenge generator copies the current stable reader into an intact worker-visible `<doc_id>.full.json` and creates an editable damaged `<doc_id>.repair.json`. Both are bound to the run nonce and carry document/source/reader provenance.

A machine-owned baseline is retained while the challenge is active:

```text
truth-reader/.baseline/<doc_id>.full.json
truth-reader/.baseline/<doc_id>.repair.json
```

This prevents a worker from changing both visible files to manufacture a match.

### Random distributed damage

The repair copy damages approximately 10% of eligible projection records using cryptographically secure randomness. Eligible records are divided into multiple regions and random removals are selected across those regions, preventing all damage from clustering in one document area and avoiding a predictable every-Nth pattern.

Substantial content records are preferred over empty or punctuation-only records. Every selected record is replaced by the same generic placeholder:

```json
{
  "^MISSING_KEY^": "^MISSING_VALUE^"
}
```

There are no seed values, numbered gaps, answer arrays, or worker-visible gap maps. The worker compares the repair projection with the supplied full projection and restores the repair projection completely.

### Deterministic verification

The verifier is `ChatMachines/GeminiSupervisor/scripts/truth-challenge-engine.js`; the workflow is `.github/workflows/truth-challenge.yml`.

PASS requires: the run binding to match; the visible full projection to remain exactly equal to its trusted full baseline; no missing placeholders to remain; the repaired projection to be deeply and structurally equal to the intact full projection; and every selected document to pass. Partial repair is FAIL. Gemini cannot override this result.

On FAIL, the exact original damaged repair copy is restored from the trusted baseline, so retry uses the same damage pattern. On PASS, a durable `truth-reader/PASS.json` receipt remains under the run nonce while the transient full files, repair files, baseline, manifest, and FAIL status are removed.

The earlier global seed/proof selector/status model is retired. Runtime settings are recorded under `truth_reader_runtime` in `dependency-map.json`.

### Historical run cutoff

All Supervisor nonces that existed before this nonce-scoped repair design were physically moved out of the active runs directory into:

```text
ChatMachines/GeminiSupervisor/historical/runs/
```

Their original Git subtrees were preserved. The active `ChatMachines/GeminiSupervisor/runs/` path is reserved for runs created under the new architecture. The cutoff inventory is recorded in `ChatMachines/GeminiSupervisor/historical-runs.json`.
