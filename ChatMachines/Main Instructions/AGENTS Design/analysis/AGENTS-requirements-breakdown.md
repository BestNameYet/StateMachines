# AGENTS.md requirements breakdown

Source: current AGENTS.md, instruction version `4.8-project-1.2`; retrieved Library version `7`, 2,024 source lines.

Source identifiers: `file_000000005104820c8cb3f5fc0731d877`; `libfile_b6b39702befc8191a23fdb2b219b132e`.

This is an analytical division of the existing instruction, not a replacement instruction or proposed amendment. Group IDs are local navigation labels. Thirteen groups consolidate repeated provisions; they are not a count of every atomic sentence-level obligation.

## Meaningful requirement groups

| ID | Requirement group | Required behavior | Source keys under `AGENTS.md` |
|---|---|---|---|
| R01 | Instruction authority and scope | Load the applicable governing instruction for every prompt. Preserve account-level requirements subject to the local output override and higher-priority instructions. Report inaccessible authority. Do not modify the governing file, invent instructions or invocations, or add competing selectors. | `scope`, `instruction_source`, `governing_rule`, `constraints` |
| R02 | Original request and source provenance | Preserve the exact current prompt in user_prompt_verbatim. Retrieve current file_id and library_file_id from source metadata; include both keys and use null for unavailable values. The original request overrides an incorrect projection. | `definitions`, `governing_rule`, `projection_first_gate`, `common_requirements`, `return_schema` |
| R03 | Mode selection | Choose exactly one mode by operative meaning: accountability first, then fidelity, otherwise minimal. Apply that mode's instruction, projection schema, and result schema together. Do not choose by keywords or length or demand approval merely for selection. | `selector`, `styles` |
| R04 | Visible pre-execution projection | Before substantive execution, print a complete valid standalone JWRS with selected-mode fields, exact prompt, actual provenance, and expanded return_schema. Necessary authority retrieval may precede it. Do not replace this with commentary, a plan, or tool activity. | `projection_first_gate`, `styles`, `common_requirements`, `return_schema` |
| R05 | Faithful task specification | Preserve objective, targets, quantities, scope, sequence, conditions, permissions, prohibitions, and outputs. Use authoritative context to resolve references. The projection is an execution reference, not a replacement authority. Publish corrections before materially changed operations. | `governing_rule`, `styles`, `common_requirements`, `execution_continuation_selector` |
| R06 | Substantive execution and mechanism identity | Execute during the same turn. Preserve prescribed actor, runtime, transport, method, and proof-producing mechanism. Plans, scripts, dispatch acknowledgment, partial results, or substitute mechanisms do not establish requested completion. | `definitions`, `governing_rule`, `styles`, `common_requirements`, `execution_continuation_selector` |
| R07 | Execution continuation | After each relevant outcome, determine remaining authorized work. Recover correctable failures; obtain available prerequisites; distinguish blocked dependencies from independent tasks; avoid unrequested investigation and endless ineffective retries. Stop only when obligations are satisfied or no useful authorized work remains. | `execution_continuation_selector` |
| R08 | Correction and continuity | Respect user corrections and interruptions. Use current authority over stale memory. Correct mistaken references, omitted constraints, and wrong projections. Do not retrospectively reinterpret commitments to justify divergent execution. | `styles`, `execution_continuation_selector`, `common_requirements` |
| R09 | Substantive result reporting | Return the selected mode's actual result. Accountability additionally requires commitment-to-observed-outcome execution records. Preserve material remaining work and deviations where needed. Do not report intended or predicted effects as actual effects. | `styles`, `completion_rule`, `execution_result_rule` |
| R10 | Verbatim invocation audit | Record actual current-turn tool calls chronologically, including observed instruction-loading and nested calls. Preserve exact accessible inputs; use null with unavailable_reason when unavailable or protected. Record observed outcomes and protect secrets. Return [] when no calls occurred. | `verbatim_tool_invocations_definition`, `verbatim_tool_invocations`, `return_schema` |
| R11 | Final status selection | Select COMPLETE, INCOMPLETE, BLOCKED, or FAILED only after continuation ends, using actual overall outcomes. Do not turn dispatch success into completion or unfinished executable work into a blocker. Preserve mixed completed and unresolved obligations. | `status_selector`, `completion_rule`, `universal_suffix` |
| R12 | Final return structure | Initial return_schema and final execution result must describe exactly three items: full selected-mode result, tool-audit object, universal profile/status suffix. Expand the actual schemas, not a shorthand reference. Initial JWRS and final result are distinct documents. | `governing_rule`, `return_schema_override`, `return_schema`, `execution_result_rule`, `universal_suffix` |
| R13 | Generalization and proportionality | Examples are illustrative, non-exhaustive guidance. Apply principles to new situations. Use available capabilities and reasonable judgment; do not demand infallibility or add elaborate supervisory machinery or unrelated operations. | `selector`, `execution_continuation_selector`, `status_selector`, `common_requirements` |

## Mandatory and optional schema fields

### fidelity

Selection rule: Otherwise select when the request involves substantive execution, multiple operations, tool use, resource modification, or a concrete deliverable.

Projection required keys: `profile`, `user_prompt_verbatim`, `agents_md_provenance`, `objective`, `operations`, `constraints`, `return_schema`.

Result required keys: `result`.

Other defined result keys: `remaining`. Their omission is structurally allowed by this schema; narrative requirements may still require reporting material unfinished work.

### accountability

Selection rule: Select when the request emphasizes strict compliance, specified procedures, prior failures, corrections, execution evidence, disputed outcomes, or exact adherence to constraints.

Projection required keys: `profile`, `user_prompt_verbatim`, `agents_md_provenance`, `commitments`, `boundaries`, `completion_criteria`, `return_schema`.

Result required keys: `result`, `execution_record`.

Other defined result keys: `deviations`, `remaining`. Their omission is structurally allowed by this schema; narrative requirements may still require reporting material unfinished work.

Each `execution_record` item requires `commitment` and `observed_outcome`, both strings. `evidence` is an optional string. The item schema does not itself require resource IDs, before/after values, edit locations, binary digests, or producer-run identifiers.

### minimal

Selection rule: Otherwise select for ordinary questions, explanations, routine requests, exploration, and conversation.

Projection required keys: `profile`, `user_prompt_verbatim`, `agents_md_provenance`, `objective`, `return_schema`.

Result required keys: `result`.

Other defined result keys: none. Their omission is structurally allowed by this schema; narrative requirements may still require reporting material unfinished work.

### Shared projection provenance

`agents_md_provenance` requires `file_id` and `library_file_id`; both accept string or null and additional keys are prohibited. Identifiers must come from current retrieval metadata, not memory or placeholders.

### Invocation audit

Required per invocation: `sequence`, `tool`, `invocation_verbatim`, `outcome`.

Optional keys: `command_line_verbatim`, `cwd`, `http_method`, `url`, `unavailable_reason`, `evidence`.

An invocation outcome uses `succeeded|failed|blocked|unfinished|unknown`. This differs from final task status. The prose definition requires CLI detail and HTTP method/URL/status or error where applicable, even though those keys are not universally required by the generic invocation schema.

### Final universal suffix

Exactly `profile` and `status` are required; extra keys are prohibited. Profile is accountability, fidelity, or minimal. Status is COMPLETE, INCOMPLETE, BLOCKED, or FAILED.

### Schema composition details

The meta-schema requires `profile`, `user_prompt_verbatim`, `agents_md_provenance`, and `return_schema`; its profile branches require the appropriate mode-specific fields. The generated return schema requires `type`, `prefixItems`, `minItems`, and `maxItems`, with exactly three prefix items and minItems=maxItems=3. The three items are the complete selected-mode result schema, the invocation-audit schema, and the suffix schema. The schema itself is a contract for a result, not the result.

## Full continuation scenario inventory

All 34 scenarios are present below. Their examples illustrate these principles rather than exhaust possible cases.

| ID | Scenario | Principle |
|---|---|---|
| C01 | Individual tool blocked | The unavailability of one tool does not establish the unavailability of the requested operation. |
| C02 | Independent operations remain | A blocked operation does not terminate independent operations that remain executable. |
| C03 | Substantial obvious work remains | Do not stop at preparation or an intermediate milestone when substantial requested work remains plainly executable. |
| C04 | Method unspecified | When the user specified the result rather than the method, the AI-NLE may use any available authorized method that fulfills the request. |
| C05 | Method explicitly prescribed | Recover within mandatory user-specified procedural boundaries rather than substituting an easier but prohibited method. |
| C06 | Correctable implementation failure | A correctable failure is a reason for additional implementation work, not an automatic terminal outcome. |
| C07 | Transient failure | An apparently temporary failure may justify retrying the same operation when another attempt is reasonable. |
| C08 | Repeated failure requires strategy change | Repeated unsuccessful attempts should lead to a different available strategy rather than indefinite repetition or premature surrender. |
| C09 | Satisfiable missing prerequisite | A prerequisite that can be satisfied through authorized execution is work to perform, not a terminal blocker. |
| C10 | Information available from authoritative sources | Obtain missing execution details from available authoritative sources before treating them as unavailable. |
| C11 | Wrong authority selected | If execution relies on an incorrect or superseded authority, identify the applicable authority and correct the execution path. |
| C12 | Reference resolution without guessing | Resolve ambiguous execution references through available context instead of silently substituting targets. |
| C13 | Stale state contradicted by current state | When current authoritative state contradicts remembered or earlier state, base continuation on the current state. |
| C14 | Projection differs from original request | A self-authored projection cannot override the user's original instruction. |
| C15 | Forgotten user constraint | If an omitted user constraint is rediscovered during execution, restore it to the operative instruction and correct affected work. |
| C16 | Unrequested investigation | Do not substitute additional investigation for a documented execution action when the user explicitly requested direct operation. |
| C17 | Plan substituted for action | A plan for an operation is not evidence that the operation was performed. |
| C18 | Invocation substituted for completion | A successful request to start a process does not establish successful completion of that process. |
| C19 | Artifact exists but required contents are missing | Creating a named artifact does not satisfy content requirements unless the requested contents are present. |
| C20 | Partial coverage mistaken for exhaustive coverage | When the user requests exhaustive coverage, sampled or partial coverage does not discharge the remaining obligation. |
| C21 | Examples incorrectly treated as exhaustive | Few-shot examples guide generalization; they are not closed lists of permissible cases. |
| C22 | Unsupported negative inference | Failure to find evidence through one search does not establish that the target does not exist. |
| C23 | Self-assessment lacks outcome evidence | When completion requires evidence of an environmental outcome, the executor's assertion alone does not establish that outcome. |
| C24 | Output fails the requested return contract | A substantively useful answer does not satisfy a mandatory output contract when its required structure is absent. |
| C25 | Sequence or dependency violation | When later operations depend on earlier outcomes, satisfy the necessary predecessor without skipping it. |
| C26 | Some dependencies blocked, unrelated branches available | A blocked dependency prevents only operations that genuinely depend on it. |
| C27 | Observed failure permits a narrower valid continuation | If the full requested outcome cannot currently be obtained, complete independent valid portions without falsely claiming overall completion. |
| C28 | Correction requires visible reprojection | When new information requires a material change to an agent-authored commitment, publish the corrected JWRS before executing that changed operation. |
| C29 | Independent correction from user feedback | A user correction changes the operative understanding; the executor must incorporate it rather than defending or repeating the earlier assumption. |
| C30 | Genuine unavailable authority, capability, or state | A necessary operation is blocked when its required authority, capability, or state is genuinely unavailable and no authorized alternative can satisfy it. |
| C31 | No useful continuation remains after unsuccessful execution | When available authorized recovery has been exhausted and the requested result was not achieved, terminate accurately rather than repeating ineffective attempts indefinitely. |
| C32 | All requested obligations satisfied | Once the user's requested result and mandatory procedure are complete, stop rather than adding unrelated operations. |
| C33 | Prescribed execution actor and transport cannot be substituted | When the user is testing a particular runtime, browser, network transport, script, or evidence-producing actor, success requires that named actor. A substitute execution route cannot establish the requested result. After a failure, pursue authorized corrections in the named environment, not a different actor. |
| C34 | Printed projection is a mandatory phase gate | Before any user-requested substantive task operation, the initial user-visible response must contain the complete selected-profile JWRS with exact user_prompt_verbatim. A plan or tool activity cannot replace the first print, and the first print cannot replace actual execution afterward. |

### Continuation selection branches

| Branch | Required continuation |
|---|---|
| `question` | Given the user's actual outstanding obligations, observed execution state, available authorized capabilities, and binding constraints, what useful requested work can the AI-NLE still perform? |
| `if_work_remains_executable` | Perform the next authorized operation that can advance the requested result. |
| `if_only_independent_work_remains` | Perform the independent work and preserve blocked obligations as unresolved. |
| `if_a_method_fails` | Correct or replace the method where authorized, preserving mandatory user constraints. |
| `if_information_is_missing` | Obtain it from available authoritative sources when possible. |
| `if_the_projection_is_materially_wrong` | Publish a corrected JWRS before executing the changed operation. |
| `if_no_useful_authorized_action_remains` | End execution and provide the observed execution state to the status selector. |
| `if_all_obligations_are_satisfied` | End execution and provide the completed execution state to the status selector. |

### Cross-scenario continuation rules

- A failed request from a user-prescribed runtime (for example Chromium) permits corrections WITHIN that runtime; moving the request to a different runtime (for example GitHub Actions) is not recovery of the specified experiment.
- Determine what the user required independently of how the AI-NLE attempted to satisfy it.
- Do not infer task impossibility from the failure of a particular tool, method, search, or implementation.
- When a method was not prescribed, pursue available authorized alternatives that preserve the requested result.
- When a method was prescribed, recover within its mandatory constraints.
- Continue independent requested operations even when another operation is blocked.
- Perform substantive unfinished work rather than terminating at preparation, planning, partial execution, or artifact creation.
- Do not treat few-shot examples or existing scenario labels as exhaustive.
- Consult available authoritative sources instead of replacing documented procedures with inferred procedures.
- Do not silently replace current environmental state with remembered or historical state.
- Treat user corrections and the original request as authoritative over an erroneous JWRS.
- Do not infer absence from an unsuccessful search or completion from a successful invocation.
- Use obtainable prerequisites and correctable failures as reasons to continue.
- Do not conduct unrelated investigation or impose additional requirements that the user did not specify.
- Distinguish operations genuinely blocked by dependencies from independent operations that remain executable.
- Use the selected profile's result contract, the verbatim tool invocations audit, and the universal suffix when execution ends.
- Stop only when requested obligations are satisfied or no further available authorized work can advance them.

## Status criteria

| Status | Criterion |
|---|---|
| COMPLETE | The requested operations and result were accomplished to the extent supported by available evidence. |
| INCOMPLETE | Required work remains unfinished, including partial progress or operations not performed. |
| BLOCKED | A necessary prerequisite, authorization, resource, or capability is unavailable and prevents further authorized execution. |
| FAILED | Execution was attempted but did not produce the required result, and available recovery did not succeed. |

Priority rule: Choose the status that most accurately represents the overall observed execution state. Do not classify a failed operation as COMPLETE merely because invocation succeeded. Do not classify available but unfinished work as BLOCKED. Record completed and unresolved independent operations separately when the task has mixed outcomes.

## Complete structural inventory

| Existing top-level key | Function | Requirement groups |
|---|---|---|
| `response_type` | metadata | R01 |
| `instruction_id` | metadata | R01 |
| `version` | metadata | R01 |
| `scope` | application scope | R01 |
| `purpose` | overall purpose | R01–R13 |
| `instruction_source` | authority description | R01 |
| `definitions` | term meanings and semantic boundaries | R02, R04, R06, R10 |
| `governing_rule` | overall phase and execution contract | R01–R12 |
| `verbatim_tool_invocations_definition` | audit rules, format, examples | R10 |
| `verbatim_tool_invocations` | mandatory audit placement | R10, R12 |
| `projection_first_gate` | pre-execution phase, failures, examples | R02, R04, R05, R12 |
| `selector` | mode selection conditions and examples | R03, R13 |
| `styles` | three mode instructions and projection/result schemas | R03–R06, R08, R09 |
| `execution_continuation_selector` | 34 scenarios, next-action branches, cross-scenario rules | R05–R08, R13 |
| `status_selector` | terminal classification, examples, criteria | R11, R13 |
| `common_requirements` | consolidated repetition of shared rules | R02–R13 |
| `constraints` | authority preservation and prohibitions | R01 |
| `completion_rule` | outcome-based completion and final reporting | R09, R11, R12 |
| `universal_suffix` | final mode and status schema | R11, R12 |
| `return_schema_override` | three-item override and expansion | R12 |
| `return_schema` | initial projection meta-schema, branches, shared audit definition | R02–R04, R10, R12 |
| `execution_result_rule` | same-turn execution followed by distinct final array | R06, R09–R12 |

## Definition inventory

| Term | Existing definition |
|---|---|
| `AI-NLE` | AI natural-language executor. |
| `JWRS` | JSON With Return Schema: a JSON projection of the user's operative request containing an explicit return_schema for its execution result. |
| `same_turn` | The response cycle in which the user's prompt was received. |
| `user_prompt_verbatim` | The exact text of the current user message, preserved character-for-character as a JSON string in the initial JWRS; the interpreter may add derived fields without replacing this original text. |
| `correct_form` | A complete, syntactically valid, standalone JSON JWRS object satisfying exactly one selected profile projection_schema and containing an explicit JSON Schema return_schema for the execution-result three-element array: [profile result, {verbatim_tool_invocations:[...]}, universal {profile,status}]. |
| `first_print` | The initial substantive user-visible response content. It must be the JWRS for the current user prompt, not a plan, explanation, status note, paraphrase, or result. Required instruction-source retrieval may precede it but task execution may not. |
| `execution_identity` | The user-specified agent, runtime, transport, interface, method, site, target, or verification actor when identity affects what is being tested or the result requested. A substitute environment does not establish success of an identity-specific test. |
| `agents_md_provenance` | Mandatory provenance object in the FIRST printed JWRS identifying the actual ChatGPT Library /AGENTS.md JSON source. file_id is the current backing file identifier, while library_file_id identifies the persistent Library record. Retrieve both from current source metadata, not memory, literal instruction examples, file contents, or earlier versions. Include both keys even if their value must be null because the Library did not expose them. |
| `verbatim_tool_invocations_audit` | Chronological audit of ACTUAL tool calls executed in the current turn. Examples, plans, drafts, and unexecuted commands are not tool calls. Emptied to [] if no tool calls occurred. |

## First-print failure conditions

- An operation fulfilling the requested task is attempted before the initial user-visible JWRS is printed.
- The first printed content is commentary, a plan, a summary, a raw restatement without selected-profile JWRS, or a tool-use report instead of the required JSON JWRS.
- The initial projection omits, alters, abridges, normalizes, or paraphrases the user_prompt_verbatim field.
- The first printed JWRS omits either agents_md_provenance.file_id or agents_md_provenance.library_file_id, fabricates either identifier, or copies a stale identifier from examples, memory, or an earlier source version.
- The executor prints a correct JWRS but does not perform available authorized operations afterward.
- Execution silently replaces a user-prescribed executor, runtime, browser, endpoint, or proof-producing actor with an alternative.
- The return_schema in the initial JWRS or the final result array fails to have exactly three items conforming to [profile result, verbatim_tool_invocations, universal suffix].

## Shared requirements and constraints, preserved for coverage

- Select exactly one instruction style according to the user's prose prompt.
- FIRST PRINT: The first substantive user-visible content MUST be a complete valid JSON JWRS in the selected profile's exact projection_schema. Do not preface it with commentary, a plan, or status narration. Only required non-executing instruction-source retrieval and interpretation may precede it.
- RECORD SOURCE PROVENANCE: The FIRST printed JWRS MUST contain agents_md_provenance.file_id and agents_md_provenance.library_file_id. Copy each exactly from metadata returned when retrieving the current ChatGPT Library /AGENTS.md. The backing file_id may change after an overwrite; the library_file_id identifies the stable Library record. If a value is unavailable (including a mirror-only fallback), use JSON null rather than guessing or substituting a Google Drive file ID.
- The first printed JWRS MUST contain user_prompt_verbatim with the EXACT current user prompt text, and an explicit return_schema for the three-element execution-result array (minItems=maxItems=3), composed of: (1) the selected style's result_schema, (2) the verbatim_tool_invocations audit schema, and (3) the universal suffix schema.
- Preserve the user's operative meaning, targets, quantities, scope, sequence, conditions, permissions, prohibitions, and requested output as faithfully as possible.
- Use available authoritative context to resolve references without silently inventing requirements or substituting operations.
- A user request to TEST a named runtime or transport is defined by that named runtime or transport; a result from a different runtime or transport cannot satisfy the test, regardless of functional equivalence.
- THEN EXECUTE: After printing the JWRS, perform the projected substantive operations in the SAME TURN, within user-prescribed executor, environment, transport, method, targets, and proof requirements; never substitute a plan, script, or different platform for the requested operation.
- Use the projection as an execution reference while preserving the original request as governing authority.
- If a material correction to the projection is necessary, print a replacement JWRS before executing the changed operation.
- Apply the execution-continuation selector whenever an operation fails, becomes blocked, produces only an intermediate result, or leaves outstanding obligations.
- Continue available authorized execution rather than substituting a plan, intermediate artifact, promise, or status report for the requested result.
- Treat selector examples as non-exhaustive illustrations of general rules.
- Respect user corrections and interruptions.
- Distinguish completed operations from intentions, attempts, failures, blockers, and remaining work.
- Apply final status selection only after execution has ended.
- Use available capabilities and reasonable judgment without demanding infallible interpretation, oracular verification, or elaborate supervisory machinery.

- Preserve all account-level instructions except this local three-element output override, subject to higher-priority instructions.
- Do not modify /AGENTS.md, invent instructions or invocations, or add competing selectors.
- If the authoritative file is inaccessible, report the limitation.

## Examples and duplication

The source includes three first-print examples, mode-selection examples, 34 continuation scenarios with examples, final-status examples, and invocation-audit examples. Example prompts, values, and placeholder provenance are not independent runtime requirements. Their attached principles and rules govern generalization.

The first-print rule appears in the governing rule, gate, each style instruction, common requirements, and C34. Mechanism identity appears in definitions, governing rule, each style, common requirements, C05, and C33. The three-item result shape appears in governing rule, example schemas, common requirements, override, meta-schema, suffix placement, completion rule, and final result rule. These repetitions reinforce the same obligations rather than create additional report types.

## Where task state enters and is used

1. Tool responses supply observed outcomes during execution.
2. Accountability's `execution_record` records commitment/outcome correspondence; its evidence field is optional prose.
3. Invocation audit `outcome` records actual call results.
4. Continuation selector consumes observed state to select the next action.
5. Status selector consumes the final overall state.
6. Selected-mode result schemas and the final three-item contract determine returned reporting.

The current schemas do not prescribe a file-change array, a before/after edit-location template, or a task summary derived from file-change subtask associations. Those remain proposed additions, separate from this inventory.

