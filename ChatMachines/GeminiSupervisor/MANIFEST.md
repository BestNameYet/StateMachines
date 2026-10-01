# GeminiSupervisor Manifest

Recursive inventory for `ChatMachines/GeminiSupervisor/`.

- **Inventory basis:** live `main` tree immediately before this manifest was added.
- **Inventory count:** 71 files including this `MANIFEST.md`.
- **Scope:** every tracked file at the GeminiSupervisor root and in every tracked subdirectory, including historical artifacts and persisted run containers.
- **Runtime note:** the current Node runtime is `send-to-gemini.js`; shared external-path settings are centralized in `config.json`.

## Root files

| Path | Classification | Description |
|---|---|---|
| `.gitkeep` | placeholder | Empty tracked placeholder retained from when the directory needed an anchor in Git. |
| `Agents.md` | canonical contract | Canonical Gemini Supervisor rules, evaluation definitions, step schemas, supervisory-gate contract, shared-config contract, and runtime integration requirements. |
| `Code.gs` | Apps Script bridge | Standalone Google Apps Script `doPost` endpoint that accepts JavaScript `sourcecode` plus `arguments`, evaluates the function, and returns its JSON-serialized result. |
| `config.json` | shared configuration | Shared Supervisor configuration used by both the specification and Node runtime; declares the Agents file, trigger file, runs directory, and canonical Step 3 evaluation artifact. |
| `current_state.json` | legacy/root state artifact | Root-level idle state/schema snapshot from the earlier architecture. The current Node runtime persists active execution state under `runs/<run_nonce>/state.json`. |
| `endpoint.json` | endpoint placeholder | Two-field endpoint configuration placeholder containing `sheetId` and `entry_point`, currently empty. |
| `evaluation-tests.md` | symlink | Compatibility symbolic link to `historical/evaluation-tests.md`; the active Step 3 runtime now uses `tests/step-3-evaluation.json`. |
| `MANIFEST.md` | manifest | This recursive file inventory and description document for the GeminiSupervisor directory. |
| `messages.json` | legacy/root message artifact | Root-level two-message conversation skeleton. The current Node runtime persists live run conversation records under `runs/<run_nonce>/messages.json`. |
| `send-to-gemini.js` | active Node runtime | Primary Gemini Supervisor Node.js runtime: loads shared config/Agents, validates step returns, performs live-ground-truth checks, invokes Gemini supervisory gates, persists run records, and advances/retries the state machine. |
| `work-action-approval-rulebook.json` | separate rulebook artifact | Standalone JSON rulebook defining safe-word authorization, action classification, and related work-action approval semantics. |

## Historical

| Path | Classification | Description |
|---|---|---|
| `historical/evaluation-tests.md` | historical heuristic source | Historical worked-example U/P comparator heuristic. Its evaluation method was merged into `tests/step-3-evaluation.json`. |
| `historical/evaluator-definitions.md` | historical evaluator guide | Historical semantic-operator guide for constructing U, characterizing P, decomposing requirements, and evaluating exact satisfaction; retained for provenance after active definitions moved into Agents.md. |

## Runtime input / skills / stores

| Path | Classification | Description |
|---|---|---|
| `nextmessage/nextmessage.json` | workflow trigger/input | Current Supervisor trigger payload carrying `run_nonce`, execution role/step, and the ChatGPT-owned return schema consumed by the Node runtime. |
| `skills/live-ground-truth-verification/SKILL.md` | skill specification | Skill specification requiring execution/completion/status claims to be verified against exact live authoritative sources rather than memory or agent self-report. |
| `store/store.json` | legacy/root store artifact | Root-level empty record store retained from the earlier architecture. Current runtime audit records are persisted under each run's `store/store.json`. |

## Tests and evaluation artifacts

| Path | Classification | Description |
|---|---|---|
| `tests/plan-action-evaluation.json` | test/evaluation dataset | Plan-to-action evaluation dataset linking plans to contextual locations, originating user statements, resulting actions, user feedback, and met/unmet determinations. |
| `tests/plan-contextual-map.json` | test mapping dataset | Contextual mapping dataset connecting plan fragments to user-statement fragments and recording how each plan component expands or answers the user's instruction. |
| `tests/plan-examples.json` | plan corpus | Machine-readable flat list of plan-bearing model statements collected from persistent records. |
| `tests/plan-examples.md` | plan corpus documentation | Human-readable documentation of the plan corpus, its classification rule, verified plans, and additional plan-bearing statements with lifecycle/location metadata. |
| `tests/plan-user-statements.json` | plan provenance dataset | Maps each collected plan to its originating user statement(s), persistent-storage locations, match type, and retrieval status. |
| `tests/step-3-evaluation.json` | canonical Step 3 evaluation artifact | Active combined JSON artifact containing the Step 3 evaluation heuristic plus the complete `step3_tsr` question corpus; referenced through `config.json`. |
| `tests/step-3-test-return-schema.md` | source test corpus | Original fenced-JSON Step 3 TSR question/case list used as a source when building `step-3-evaluation.json`; retained as a source/development artifact rather than the active runtime source. |

## Persisted run containers

Each run directory is an isolated persisted execution container. Every listed run contains exactly three tracked files: `messages.json`, `state.json`, and `store/store.json`.

| Path | Classification | Description |
|---|---|---|
| `runs/agents_schema_migration_20260930_1/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the Agents.md schema-migration run. |
| `runs/agents_schema_migration_20260930_1/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the Agents.md schema-migration run. |
| `runs/agents_schema_migration_20260930_1/store/store.json` | run audit store | Persisted audit/evidence/event records for the Agents.md schema-migration run. |
| `runs/demo_20260930T155153_eadd5e5248/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the Supervisor demonstration run. |
| `runs/demo_20260930T155153_eadd5e5248/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the Supervisor demonstration run. |
| `runs/demo_20260930T155153_eadd5e5248/store/store.json` | run audit store | Persisted audit/evidence/event records for the Supervisor demonstration run. |
| `runs/ground_truth_verification_skill_20260930_1/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the ground-truth verification skill run. |
| `runs/ground_truth_verification_skill_20260930_1/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the ground-truth verification skill run. |
| `runs/ground_truth_verification_skill_20260930_1/store/store.json` | run audit store | Persisted audit/evidence/event records for the ground-truth verification skill run. |
| `runs/live_ground_truth_integration_20261001_1/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the live ground-truth integration run. |
| `runs/live_ground_truth_integration_20261001_1/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the live ground-truth integration run. |
| `runs/live_ground_truth_integration_20261001_1/store/store.json` | run audit store | Persisted audit/evidence/event records for the live ground-truth integration run. |
| `runs/merge_step3_tsr_evaluation_heuristic_20261001_1/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the Step 3 TSR/evaluation-heuristic merge run. |
| `runs/merge_step3_tsr_evaluation_heuristic_20261001_1/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the Step 3 TSR/evaluation-heuristic merge run. |
| `runs/merge_step3_tsr_evaluation_heuristic_20261001_1/store/store.json` | run audit store | Persisted audit/evidence/event records for the Step 3 TSR/evaluation-heuristic merge run. |
| `runs/role_separation_20260930T181400/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the model role-separation run. |
| `runs/role_separation_20260930T181400/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the model role-separation run. |
| `runs/role_separation_20260930T181400/store/store.json` | run audit store | Persisted audit/evidence/event records for the model role-separation run. |
| `runs/skill_bootstrap_update_20260930T170700/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the skill bootstrap-update run. |
| `runs/skill_bootstrap_update_20260930T170700/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the skill bootstrap-update run. |
| `runs/skill_bootstrap_update_20260930T170700/store/store.json` | run audit store | Persisted audit/evidence/event records for the skill bootstrap-update run. |
| `runs/skill_interface_20260930T155700/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the skill-interface run. |
| `runs/skill_interface_20260930T155700/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the skill-interface run. |
| `runs/skill_interface_20260930T155700/store/store.json` | run audit store | Persisted audit/evidence/event records for the skill-interface run. |
| `runs/skill_reeval_20260930T170100/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the skill re-evaluation run. |
| `runs/skill_reeval_20260930T170100/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the skill re-evaluation run. |
| `runs/skill_reeval_20260930T170100/store/store.json` | run audit store | Persisted audit/evidence/event records for the skill re-evaluation run. |
| `runs/skill_revision_20260930T180700/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the skill-revision run. |
| `runs/skill_revision_20260930T180700/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the skill-revision run. |
| `runs/skill_revision_20260930T180700/store/store.json` | run audit store | Persisted audit/evidence/event records for the skill-revision run. |
| `runs/skill_revision_schema_reject_20260930T181100/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the skill-revision schema-rejection run. |
| `runs/skill_revision_schema_reject_20260930T181100/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the skill-revision schema-rejection run. |
| `runs/skill_revision_schema_reject_20260930T181100/store/store.json` | run audit store | Persisted audit/evidence/event records for the skill-revision schema-rejection run. |
| `runs/step0_raw_fail_20260930T132500/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the Step 0 raw-input failure run. |
| `runs/step0_raw_fail_20260930T132500/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the Step 0 raw-input failure run. |
| `runs/step0_raw_fail_20260930T132500/store/store.json` | run audit store | Persisted audit/evidence/event records for the Step 0 raw-input failure run. |
| `runs/step0_raw_fail_20260930T1325_2/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930T1325_2/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930T1325_2/store/store.json` | run audit store | Persisted audit/evidence/event records for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930_3/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930_3/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930_3/store/store.json` | run audit store | Persisted audit/evidence/event records for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930_4/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930_4/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the Step 0 raw-input failure follow-up run. |
| `runs/step0_raw_fail_20260930_4/store/store.json` | run audit store | Persisted audit/evidence/event records for the Step 0 raw-input failure follow-up run. |
| `runs/work_action_approval_rulebook_20260930_1/messages.json` | run message log | Persisted ChatGPT/Gemini message and gate history for the work-action approval-rulebook run. |
| `runs/work_action_approval_rulebook_20260930_1/state.json` | run state | Persisted state-machine/procedure state, attempts, execution returns, supervisory returns, and transition status for the work-action approval-rulebook run. |
| `runs/work_action_approval_rulebook_20260930_1/store/store.json` | run audit store | Persisted audit/evidence/event records for the work-action approval-rulebook run. |
