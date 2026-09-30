# Agents.md --- Canonical Rules and Evaluation Contract

## Canonical Evaluation Definitions

```json
{
  "evaluation_definitions": {
    "user_words": {
      "key": "user_words",
      "value": "The user's current utterance exactly as written, with references resolved only from relevant prior context.",
      "definition": "User-authored language is primary evidence. Pronouns and continuation terms may resolve to earlier user instructions, but an agent summary never replaces the user's words.",
      "definition_of_evaluation": "Compare preserved user text to the actual user utterance and any context needed to resolve references. Distinguish user-authored labels from controller-inserted text.",
      "pass_criteria": "The complete user-authored instruction is preserved and references are resolved without adding controller or agent text.",
      "fail_criteria": "User text is truncated, normalized in a meaning-changing way, replaced by an agent summary, or polluted by non-user controller text."
    },
    "applicable_rules": {
      "key": "applicable_rules",
      "value": "Every governing rule that applies to the current turn, with source traceability.",
      "definition": "Rules may originate in Agents.md or a prior user decision persisted for the active run. Failure examples are evidence of prior failure patterns and do not independently invent new rules.",
      "definition_of_evaluation": "Identify each rule whose scope covers the current action, actor, target, time, method, or procedure state.",
      "pass_criteria": "All applicable rules are included and no inapplicable rule is promoted into a requirement.",
      "fail_criteria": "A governing rule is omitted, an inapplicable rule is imposed, or a failure example is treated as an independent rule without a governing source."
    },
    "effective_instruction_U": {
      "key": "effective_instruction_U",
      "value": "Resolved user request plus all applicable governing rules.",
      "definition": "U is the complete set of actions, prohibitions, permissions, questions, corrections, limits, and procedural constraints the response must satisfy.",
      "definition_of_evaluation": "Construct U from user_words plus applicable_rules while retaining the source of every requirement.",
      "pass_criteria": "U contains every applicable requirement exactly once at the semantic level and retains source traceability.",
      "fail_criteria": "U omits a requirement, invents one, loses its source, changes its scope, or substitutes an agent interpretation for the user instruction."
    },
    "agent_response_P": {
      "key": "agent_response_P",
      "value": "The agent's exact proposed words plus actions and results actually observed.",
      "definition": "P distinguishes intention, attempt, execution, and verified completion.",
      "definition_of_evaluation": "Compare claims in P against observed actions and evidence; keep 'will do', 'tried', and 'did' distinct.",
      "pass_criteria": "P describes only actions/results supported by observation and clearly distinguishes incomplete from completed work.",
      "fail_criteria": "P reports intention or attempt as completion, asserts unobserved state, or masks remaining work."
    },
    "requirement_decomposition": {
      "key": "requirement_decomposition",
      "value": "Each requirement is decomposed into instruction type, actor/subject, action/state, target, and modifiers/limits.",
      "definition": "A sentence may contain multiple independently checkable requirements.",
      "definition_of_evaluation": "For each requirement determine: (1) require/forbid/permit/ask/correct/continue, (2) actor or subject, (3) action/relationship/state, (4) affected target, and (5) every applicable modifier.",
      "pass_criteria": "Every independently checkable requirement and every applicable component is represented without invention.",
      "fail_criteria": "Requirements are merged until a distinct action is lost, a component is invented, or an applicable component is omitted."
    },
    "modifier_analysis": {
      "key": "modifier_analysis",
      "value": "Polarity, quantity, included set, condition, sequence, due time, and method/presentation modify satisfaction.",
      "definition": "Modifiers determine the exact boundary of a requirement and must not be generalized away.",
      "definition_of_evaluation": "Evaluate what 'no/not', all/every/both/counts, set restrictions, if/only-if branches, first/then order, deadlines/immediacy, and method/presentation change.",
      "pass_criteria": "Every stated modifier is preserved with its correct scope and relationship to the governed action.",
      "fail_criteria": "A modifier is ignored, moved to another action, weakened, strengthened, inverted, or replaced by a different method/sequence/quantity."
    },
    "exact_satisfaction": {
      "key": "exact_satisfaction",
      "value": "P satisfies U only when every requirement and specified detail is met.",
      "definition": "Different wording is allowed only when semantic requirements and modifiers remain intact.",
      "definition_of_evaluation": "Compare P independently against each decomposed requirement and its modifiers; do not demand details U never specified.",
      "pass_criteria": "Every required result occurs, every prohibition is respected, every modifier is preserved, and no unauthorized extra action is introduced.",
      "fail_criteria": "Any required result is missing, a prohibition is violated, a modifier changes, or P introduces unauthorized work."
    },
    "failure_description": {
      "key": "failure_description",
      "value": "A failure names the specific source requirement, changed component, observed mismatch, and evidence.",
      "definition": "Broad labels are insufficient when the actual requirement change can be identified.",
      "definition_of_evaluation": "Point to the requirement source, state what P did or failed to do, identify which decomposition component changed, and cite available observation.",
      "pass_criteria": "The failure record is specific, source-linked, component-specific, and evidence-based.",
      "fail_criteria": "The failure record is generic, unsourced, speculative, or does not identify the requirement/P mismatch."
    },
    "failure_pattern_and_analogy": {
      "key": "failure_pattern_and_analogy",
      "value": "Patterns describe the relationship between U and P; analogies preserve that relationship across different subject matter.",
      "definition": "Topical similarity alone does not establish a matching failure pattern.",
      "definition_of_evaluation": "Map requirement source, action, target/set, limit, P's change, and effect on satisfaction. Return a violation test true only when the same relationship actually occurs.",
      "pass_criteria": "Pattern/analogy status follows the mapped semantic relationship and unrelated failures remain independently evaluated.",
      "fail_criteria": "A test is marked true from shared nouns, general undesirability, or another unrelated failure; or a matching relationship is missed."
    },
    "promise_instead_of_execution": {
      "key": "promise_instead_of_execution",
      "value": "When U requires an authorized task now, ending with a future promise is a failure.",
      "definition": "A later continuation command points to unfinished work; it does not create the original obligation or supply missing authorization.",
      "definition_of_evaluation": "Determine whether U requires execution in the current turn and whether P ends before the authorized action is actually performed.",
      "pass_criteria": "Authorized due work is performed or a concrete blocker is accurately reported without false completion.",
      "fail_criteria": "P merely promises future execution, asks for redundant permission, or ends with required authorized work outstanding."
    },
    "complete_agreed_work": {
      "key": "complete_agreed_work",
      "value": "After a definition or assignment is agreed, perform the corresponding work immediately within the active procedure unless blocked.",
      "definition": "Agreement is not a stopping point when executable work remains.",
      "definition_of_evaluation": "Check whether agreed work was performed, accurately reported, and kept within its agreed scope.",
      "pass_criteria": "The agreed action is completed and evidenced, or a specific observed blocker is reported with remaining work.",
      "fail_criteria": "The turn ends with only acknowledgement, a promise, a redundant proceed request, or an unsupported completion claim."
    }
  }
}
```

## Governing Rule Catalog

```json
{
  "rules": {
    "return_schema_is_the_exclusive_per_step_execution_and_completion_control_surface": {
      "key": "return_schema_is_the_exclusive_per_step_execution_and_completion_control_surface",
      "value": "Every step has a required return schema; the semantic operator communicates the step result and completion through that schema; the supervisor evaluates that exact schema before advancement; missing, malformed, incomplete, inconsistent, unpersisted, or wrong-role schemas fail; return_schema_completed means completion of that step schema only; internal controller directives never replace or pollute U; a failed earlier gate cannot be bypassed by a later step.",
      "definition": "Per-step return schemas are the canonical execution/gating interface.",
      "definition_of_evaluation": "Check schema presence, shape, required fields, semantic consistency with U, persistence, executing role, completion flag meaning, user-request fidelity, and current-step gate state.",
      "pass_criteria": "The exact current-step schema is complete, truthful, persisted, produced by the required role, preserves U, and advances only after its gate passes.",
      "fail_criteria": "Any schema/control requirement is absent or false, controller text replaces U, return_schema_completed is misused as whole-procedure completion, or a failed step is bypassed.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"Step 2 returns its complete step_2_record, is persisted, and Gemini passes it before Step 3.","criterion_used":"exact current-step schema and gate order","status":"PASS"},
          {"scenario":"Step 3 sets return_schema_completed only after its own required fields and tests are complete.","criterion_used":"per-step completion semantics","status":"PASS"},
          {"scenario":"The preserved user request excludes an internal 'Perform Step 2' controller string.","criterion_used":"user-request fidelity","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"Step 1 omits nonce but the procedure advances.","criterion_used":"required schema completeness","status":"FAIL"},
          {"scenario":"A Step 2 gate fails and the controller starts Step 3 anyway.","criterion_used":"failed gate cannot be bypassed","status":"FAIL"},
          {"scenario":"return_schema_completed is described as proof the whole run is finished.","criterion_used":"per-step completion semantics","status":"FAIL"}
        ]
      }
    },
    "model_role_separation_and_server_verified_execution_identity_are_mandatory": {
      "key": "model_role_separation_and_server_verified_execution_identity_are_mandatory",
      "value": "Steps 0-4 are ChatGPT-owned and Gemini is forbidden from executing, repairing, retrying, or supplying them; supervisory gates are Gemini-owned and ChatGPT is forbidden from supplying them; neither role may simulate the other; role identity comes from server/runtime evidence; required role evidence fields must be present; Gemini API output inside send-to-gemini.js is Gemini execution; ChatGPT execution originates outside that runtime; role mismatch mechanically fails; copying or relabeling payloads cannot launder role identity; every gate evaluates role evidence.",
      "definition": "Execution ownership is a mechanical boundary, not a textual label.",
      "definition_of_evaluation": "Compare role_required, role_forbidden, role_completed, role_verification.method, and role_verification.evidence against directly observed execution locus.",
      "pass_criteria": "Required role fields are complete and server/runtime evidence establishes role_completed equals role_required and not role_forbidden.",
      "fail_criteria": "Role evidence is missing/conflicting, wrong role executed, a role was self-declared without server evidence, or output was relabeled to hide origin.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"ChatGPT authors Step 1 through the connected GitHub tool and records that execution locus.","criterion_used":"server-verified required role","status":"PASS"},
          {"scenario":"Gemini API returns the supervisory gate from send-to-gemini.js and records Gemini as role_completed.","criterion_used":"supervisory role ownership","status":"PASS"},
          {"scenario":"A Gemini-produced payload is rejected as a Step 2 execution return even though its JSON shape is correct.","criterion_used":"no role laundering","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"send-to-gemini.js asks Gemini to generate the ChatGPT-owned Step 3 return.","criterion_used":"forbidden execution role","status":"FAIL"},
          {"scenario":"A payload says role_completed='ChatGPT model' but evidence shows a Gemini API call produced it.","criterion_used":"server evidence overrides label","status":"FAIL"},
          {"scenario":"ChatGPT fabricates a Gemini PASS gate instead of waiting for the API response.","criterion_used":"no simulation","status":"FAIL"}
        ]
      }
    },
    "chatgpt_turn_must_span_every_nonterminal_nextmessage_to_gemini_response_handshake": {
      "key": "chatgpt_turn_must_span_every_nonterminal_nextmessage_to_gemini_response_handshake",
      "value": "A nextmessage commit creates a mandatory wait for its corresponding Gemini response. ChatGPT cannot end immediately after a commit. On FAIL it must inspect the failure, correct the same step, recommit using the same run, and wait again. On PASS with remaining work it must execute the next step, commit, and wait again. The user-facing turn may end only after the latest nextmessage has a response and the procedure is terminal with no further ChatGPT execution or nextmessage required.",
      "definition": "The user-facing turn spans the complete commit-response-control loop.",
      "definition_of_evaluation": "Inspect whether a nextmessage is outstanding, the latest gate result, current_step, remaining_steps, and whether required retry/next-step execution was performed before ending.",
      "pass_criteria": "No outstanding Gemini response exists and either the same-step retry/next step continues or the procedure is terminal.",
      "fail_criteria": "The turn ends after a nextmessage commit, after a nonterminal PASS, or after reporting FAIL without same-step correction and another handshake.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"Step 1 commit receives PASS; ChatGPT immediately submits Step 2 and waits.","criterion_used":"PASS with remaining work continues","status":"PASS"},
          {"scenario":"Step 3 receives FAIL; ChatGPT fixes Step 3 in the same run and waits for the retry response.","criterion_used":"FAIL same-step retry","status":"PASS"},
          {"scenario":"Step 4 receives PASS and state shows no remaining steps; ChatGPT ends the turn.","criterion_used":"terminal condition","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"ChatGPT says 'committed' and ends before Gemini responds.","criterion_used":"outstanding response prohibition","status":"FAIL"},
          {"scenario":"Gemini passes Step 0 and ChatGPT stops although Step 1 remains.","criterion_used":"nonterminal PASS continuation","status":"FAIL"},
          {"scenario":"Gemini fails Step 2 and ChatGPT merely reports the failure.","criterion_used":"FAIL retry obligation","status":"FAIL"}
        ]
      }
    },
    "bootstrap_must_create_and_isolate_a_consistent_run_container_before_step_zero": {
      "key": "bootstrap_must_create_and_isolate_a_consistent_run_container_before_step_zero",
      "value": "Every user utterance starts a distinct procedure run with a path-safe run_nonce; state.json, messages.json, and store/store.json are initialized under runs/<run_nonce>/ with the same nonce; the complete user utterance is preserved; execution/gate exchanges are persisted in both message stream and store; a run reads/mutates only its own container; nonce reuse means explicit continuation; bootstrap must succeed before Step 0.",
      "definition": "Bootstrap establishes identity, persistence, and isolation for the whole run.",
      "definition_of_evaluation": "Check path-safe nonce, three required files, matching nonce values, initial user message fidelity, dual persistence, isolation, continuation semantics, and bootstrap-before-Step-0 order.",
      "pass_criteria": "All bootstrap invariants hold before Step 0 and all subsequent records remain scoped to the same run.",
      "fail_criteria": "Nonce is invalid/mismatched, a required file is absent, user text is polluted, records are not persisted, another run is mutated, or Step 0 begins before bootstrap completes.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"run_abc initializes all three files with run_nonce='run_abc' before Step 0.","criterion_used":"nonce/file consistency","status":"PASS"},
          {"scenario":"Each execution and supervisory return is appended to messages.json and store/store.json for the same run.","criterion_used":"dual persistence","status":"PASS"},
          {"scenario":"A retry explicitly reuses the existing nonce and mutates only that run directory.","criterion_used":"explicit continuation and isolation","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"state.json says run_a while store.json says run_b.","criterion_used":"matching nonce invariant","status":"FAIL"},
          {"scenario":"Step 0 runs before store/store.json exists.","criterion_used":"bootstrap-before-Step-0","status":"FAIL"},
          {"scenario":"A run writes a supervisory record into another nonce's store.","criterion_used":"run isolation","status":"FAIL"}
        ]
      }
    },
    "every_passed_step_must_have_a_durable_git_checkpoint_before_the_next_step": {
      "key": "every_passed_step_must_have_a_durable_git_checkpoint_before_the_next_step",
      "value": "After a supervisory PASS and persistence of the step records, the run-container changes are committed to Git before the next execution step; the commit identifies run_nonce, completed step, and PASS transition; a completed N-step run must have at least N attributable durable PASS checkpoints.",
      "definition": "Git history is the durable step-boundary checkpoint record.",
      "definition_of_evaluation": "Match each completed step to a persisted PASS transition and an attributable commit occurring before the next step execution.",
      "pass_criteria": "Every completed step has an ordered durable checkpoint and completed runs meet the minimum checkpoint count.",
      "fail_criteria": "A next step executes before checkpointing, commit metadata cannot identify the transition, or the completed run has fewer required durable checkpoints.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"Step 2 passes, its run files are committed, then Step 3 is submitted.","criterion_used":"checkpoint-before-next-step","status":"PASS"},
          {"scenario":"Checkpoint metadata ties the commit to run_x Step 3 PASS.","criterion_used":"attributable checkpoint","status":"PASS"},
          {"scenario":"A five-step completed run has five or more durable PASS checkpoints.","criterion_used":"minimum checkpoint count","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"Step 3 begins while the Step 2 PASS exists only in the runner workspace.","criterion_used":"durability/order","status":"FAIL"},
          {"scenario":"A completed five-step run has only four attributable PASS commits.","criterion_used":"minimum checkpoint count","status":"FAIL"},
          {"scenario":"A checkpoint cannot be associated with a run or step transition.","criterion_used":"checkpoint attribution","status":"FAIL"}
        ]
      }
    },
    "gemini_supervisory_gate_must_evaluate_every_terminal_execution_value_without_rewriting_evidence": {
      "key": "gemini_supervisory_gate_must_evaluate_every_terminal_execution_value_without_rewriting_evidence",
      "value": "The supervisor receives an unevaluated gate template. Every terminal execution key K/value V maps to K_eval preserving K and V exactly plus supervisor_eval_result and supervisor_eval_comment. Arrays preserve order and index. Every result is PASS or FAIL with a substantive comment; step_level_evaluation uses the same fields; every failure is separately recorded; gate_result is PASS only if all granular and step-level results pass, deliverables are verified, and role controls pass; FAIL restarts the same execution step; malformed supervisory responses use a supervisory-only repair branch; wrong-role gates/executions are invalid.",
      "definition": "The supervisory gate is a complete, evidence-preserving semantic evaluation of the execution return.",
      "definition_of_evaluation": "Validate *_eval shape and exact preservation, array coverage, result/comment completeness, separate failure records, aggregate gate logic, same-step FAIL transition, repair scope, and role ownership.",
      "pass_criteria": "Every terminal value is evaluated exactly once without mutation and aggregate gate/transition behavior follows all component results and role evidence.",
      "fail_criteria": "Any terminal value is omitted/rewritten, an evaluation field is missing, failures are collapsed, gate_result contradicts component results, FAIL advances, repair changes execution, or wrong role supplies a gate.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"user_request_eval preserves the exact original string and adds PASS plus a specific comment.","criterion_used":"evidence preservation and populated evaluation","status":"PASS"},
          {"scenario":"One granular FAIL causes gate_result FAIL and current_step remains unchanged.","criterion_used":"aggregate gate and same-step transition","status":"PASS"},
          {"scenario":"Malformed Gemini JSON is repaired only as a supervisory response; the ChatGPT execution payload is unchanged.","criterion_used":"repair scope","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"Gemini paraphrases a preserved execution value inside its *_eval record.","criterion_used":"exact evidence preservation","status":"FAIL"},
          {"scenario":"One field evaluates FAIL but gate_result is PASS.","criterion_used":"aggregate gate logic","status":"FAIL"},
          {"scenario":"The repair branch fills a missing field in the ChatGPT execution return.","criterion_used":"repair scope","status":"FAIL"}
        ]
      }
    },
    "effective_instruction_must_be_built_from_exact_user_words_and_applicable_rules_with_source_traceability": {
      "key": "effective_instruction_must_be_built_from_exact_user_words_and_applicable_rules_with_source_traceability",
      "value": "Resolve the user's exact words and references, attach applicable rules with exact sources, and combine them into effective instruction U without substituting the agent's description. Permission is not automatically an obligation; corrections replace the corrected meaning while preserving history; continuation terms point to unfinished prior work.",
      "definition": "U is a source-traceable semantic contract, not a paraphrase convenience.",
      "definition_of_evaluation": "Compare U against user_words and applicable_rules, resolve references only from supported context, and classify instruction type correctly.",
      "pass_criteria": "U includes all and only supported requirements, preserves corrections/continuations, and retains source traceability.",
      "fail_criteria": "U substitutes an agent summary, invents an obligation from permission, ignores a correction, loses a continuation target, or omits a governing rule.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"'Proceed' resolves to the outstanding requested GitHub edit and does not create a new unrelated task.","criterion_used":"continuation resolution","status":"PASS"},
          {"scenario":"A user correction from 'request' to 'effective instruction' is reflected in U.","criterion_used":"correction semantics","status":"PASS"},
          {"scenario":"A permission to inspect a file is not converted into a requirement to modify it.","criterion_used":"permission versus obligation","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"U replaces the user's exact target with the agent's earlier summary.","criterion_used":"user words are primary","status":"FAIL"},
          {"scenario":"A prior permission is treated as a mandatory action.","criterion_used":"instruction type classification","status":"FAIL"},
          {"scenario":"'Proceed' is declared unresolved despite an immediately preceding unfinished assignment.","criterion_used":"continuation resolution","status":"FAIL"}
        ]
      }
    },
    "requirements_must_be_decomposed_into_checkable_components_and_every_modifier_must_keep_its_scope": {
      "key": "requirements_must_be_decomposed_into_checkable_components_and_every_modifier_must_keep_its_scope",
      "value": "Split each requirement into instruction type, actor/subject, action/state, target, and limits/details. Evaluate polarity/prohibition, quantity, included set, conditions, ordering, due time, and method/presentation separately when applicable. Retain exact source words and context used for interpretation; unresolved references remain unresolved rather than invented.",
      "definition": "Requirement decomposition exposes the exact semantic dimensions P can preserve or violate.",
      "definition_of_evaluation": "For each requirement fill the five main components and all applicable modifier dimensions, then verify source traceability and unresolved-reference handling.",
      "pass_criteria": "Every actual component and modifier is represented at the correct scope and nothing unsupported is invented.",
      "fail_criteria": "A distinct action/component is omitted, a modifier changes scope, a condition/quantity/order/method is lost, or an unresolved target is fabricated.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"'delete every qualifying test' records action=delete, quantity=every, and included set=qualifying tests.","criterion_used":"quantity plus set decomposition","status":"PASS"},
          {"scenario":"'read then edit' produces two actions with a required sequence.","criterion_used":"sequence modifier","status":"PASS"},
          {"scenario":"An unresolved 'it' is recorded as unresolved when context provides no referent.","criterion_used":"no invented target","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"'every' is reduced to 'some'.","criterion_used":"quantity preservation","status":"FAIL"},
          {"scenario":"'only if X' is treated as unconditional.","criterion_used":"condition preservation","status":"FAIL"},
          {"scenario":"Required pixelation is replaced with blur.","criterion_used":"method preservation","status":"FAIL"}
        ]
      }
    },
    "contract_satisfaction_and_failure_records_must_be_requirement_specific_and_evidence_based": {
      "key": "contract_satisfaction_and_failure_records_must_be_requirement_specific_and_evidence_based",
      "value": "P matches U only when every requirement and specified modifier is satisfied; do not demand unstated details. For each failure identify the source requirement, what P did or omitted, the changed semantic component, and the observation supporting the conclusion. Multiple independent failures remain separate.",
      "definition": "Satisfaction is conjunctive across requirements; failure analysis is specific rather than topical.",
      "definition_of_evaluation": "Evaluate each requirement independently, then aggregate; for failures verify source, mismatch, component, and evidence.",
      "pass_criteria": "All requirements pass or every failure is separately and specifically evidenced without adding unstated demands.",
      "fail_criteria": "A missing requirement is overlooked, an unstated detail is required, failures are generalized/collapsed, or completion is claimed without evidence.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"A two-action request passes only after both actions are observed complete.","criterion_used":"conjunctive satisfaction","status":"PASS"},
          {"scenario":"A quantity mismatch is recorded separately from a method mismatch.","criterion_used":"independent failure separation","status":"PASS"},
          {"scenario":"No color requirement is imposed when the user never specified a color.","criterion_used":"no unstated demand","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"One of two required actions is missing but the whole request is marked PASS.","criterion_used":"conjunctive satisfaction","status":"FAIL"},
          {"scenario":"A failure is labeled merely 'GitHub issue' without naming the violated requirement.","criterion_used":"specific failure description","status":"FAIL"},
          {"scenario":"Completion is asserted from intention rather than observed evidence.","criterion_used":"evidence-based completion","status":"FAIL"}
        ]
      }
    },
    "failure_patterns_and_analogies_must_match_semantic_relationships_not_surface_topics": {
      "key": "failure_patterns_and_analogies_must_match_semantic_relationships_not_surface_topics",
      "value": "A pattern states U requires a specific component/value, P changes that same component, and satisfaction changes. An analogy maps requirement source, action, target/set, limit, P change, and effect across different subject matter. A violation test is true only when that relation occurs; false does not prove the whole contract passes; unrelated failures are evaluated independently.",
      "definition": "Pattern tests classify semantic U-to-P transformations.",
      "definition_of_evaluation": "Map the required semantic roles in the current U/P pair to the exemplar relation and verify the same directional change and satisfaction effect.",
      "pass_criteria": "True/false pattern status follows the actual semantic relation and contract status is reported separately.",
      "fail_criteria": "A pattern is inferred from shared nouns, an opposite/nonmatching relation, or another failure; or false is treated as proof of total compliance.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"Every→one is recognized as a coverage-reduction pattern even when the objects are files instead of tests.","criterion_used":"semantic relation mapping","status":"PASS"},
          {"scenario":"Blur instead of pixelate is evaluated as method substitution, not coverage reduction.","criterion_used":"correct pattern boundary","status":"PASS"},
          {"scenario":"A false result for one test is followed by evaluation of remaining tests.","criterion_used":"independent tests","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"Two cases are called analogous solely because both mention spreadsheets.","criterion_used":"topical similarity is insufficient","status":"FAIL"},
          {"scenario":"A coverage-complete but wrong-method response is marked as a coverage failure.","criterion_used":"pattern boundary","status":"FAIL"},
          {"scenario":"One false violation test causes the entire response to be marked compliant without other checks.","criterion_used":"false does not prove total pass","status":"FAIL"}
        ]
      }
    },
    "authorized_work_due_now_must_be_executed_not_replaced_with_a_future_promise": {
      "key": "authorized_work_due_now_must_be_executed_not_replaced_with_a_future_promise",
      "value": "When U already requires authorized work now or an assignment/definition has been agreed, perform it immediately in the active procedure. Do not end by echoing the task, promising later execution, or asking for redundant proceed/authorization. If blocked, state the specific observed blocker and remaining work without implying completion.",
      "definition": "Commitment language is not execution evidence.",
      "definition_of_evaluation": "Determine whether due authorized work remained executable at turn end and whether P performed it or accurately reported a blocker.",
      "pass_criteria": "Due work is performed and evidenced, or a concrete blocker is accurately reported with remaining work.",
      "fail_criteria": "The agent stops at acknowledgement/promise, requests redundant permission, or falsely reports unfinished work as complete.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"User says 'commit'; the requested prepared change is committed in the same turn.","criterion_used":"immediate agreed work","status":"PASS"},
          {"scenario":"An API rejects the authorized write; the exact rejection and remaining action are reported.","criterion_used":"specific blocker reporting","status":"PASS"},
          {"scenario":"A definition is agreed and the dependent schema is immediately updated.","criterion_used":"complete agreed work","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"The agent says 'I'll commit it next' and ends despite having write access.","criterion_used":"promise instead of execution","status":"FAIL"},
          {"scenario":"The agent asks 'should I proceed?' after the user already ordered the action.","criterion_used":"redundant authorization","status":"FAIL"},
          {"scenario":"A blocked write is described as completed.","criterion_used":"truthful blocker/completion status","status":"FAIL"}
        ]
      }
    },
    "failure_examples_are_evidence_for_evaluation_and_do_not_override_their_governing_requirement_sources": {
      "key": "failure_examples_are_evidence_for_evaluation_and_do_not_override_their_governing_requirement_sources",
      "value": "Failure examples document observed ways requirements were violated. They inform evaluation by direct relationship, pattern, or analogy, but an example alone does not create a new governing requirement and must not transfer its subject matter into unrelated requests.",
      "definition": "Failure examples are test evidence, not free-standing policy generators.",
      "definition_of_evaluation": "Use an example only after identifying an applicable current requirement and mapping the same semantic violation relation.",
      "pass_criteria": "Example use is tied to a current governing requirement and the mapped relation is explicit.",
      "fail_criteria": "Example content is imposed as a new rule, topical nouns are transferred into U, or an analogy is asserted without mapping the relationship.",
      "scenario_examples": {
        "rule_following": [
          {"scenario":"A prior every→one failure is used to test a current all-files→one-file scope reduction.","criterion_used":"relationship-based analogy","status":"PASS"},
          {"scenario":"A prior document-creation failure is ignored when the current U has no document action or analogous authorization issue.","criterion_used":"current requirement prerequisite","status":"PASS"},
          {"scenario":"The evaluator names the current rule source before citing a failure example.","criterion_used":"governing-source traceability","status":"PASS"}
        ],
        "rule_breaking": [
          {"scenario":"A prior spreadsheet example causes every future task to require a spreadsheet action.","criterion_used":"example does not create rule","status":"FAIL"},
          {"scenario":"Two cases are matched only because both involve GitHub.","criterion_used":"relationship mapping","status":"FAIL"},
          {"scenario":"An example's correction text is copied as a command into an unrelated task.","criterion_used":"no subject-matter transfer","status":"FAIL"}
        ]
      }
    }
  }
}
```

## Failure Examples

```json
{
  "failure_examples": [
    {"example":1,"U":"Step 3 must be printed to a persistent location, have a return schema, and identify false interpretations.","A":"Agent inspected unrelated Drive/UI material instead of producing the requested persistent Step 3 record.","E":"Required output was not produced; unrelated inspection substituted for execution."},
    {"example":2,"U":"Do not create a document without authorization.","A":"A document was created without authorization.","E":"Observed document creation exceeded authorization."},
    {"example":3,"U":"No rule-status categorization was requested.","A":"Agent added a DRAFT heading/status paragraph.","E":"Agent introduced an unrequested categorization."},
    {"example":4,"U":"User identified unauthorized document creation.","A":"Agent later classified the record as lacking evidence of document creation.","E":"The classification erased contrary user and execution evidence."},
    {"example":5,"U":"Do not claim a persistent destination is declared when it is not.","A":"Agent called an undeclared return store 'designated'.","E":"Unsupported destination state was asserted."},
    {"example":6,"U":"How are JavaScript objects typed?","A":"Agent answered with JSDoc/TypeScript shape annotations instead of the JavaScript value-type taxonomy.","E":"The question target was changed."},
    {"example":7,"U":"Consult and follow the canonical rule set.","A":"Agent treated Agents.md as separate discussion material and did not apply it.","E":"A governing instruction was acknowledged but not executed."},
    {"example":8,"U":"Every prompt is governed by the mandatory instruction.","A":"Agent acknowledged the requirement but did not read/apply the required source before replying.","E":"Acknowledgement was mistaken for compliance."},
    {"example":9,"U":"Use the Q1-Q2 root-to-expanded pattern for roots Q3-Q10; draft only and do not execute GitHub/App Script.","A":"Agent supplied decided subquestions, omitted required structure, and spent calls on unrelated UI/PDF inspection.","E":"Root/expansion semantics and scope were changed; usage was spent without the requested result."},
    {"example":10,"U":"Write a formula in Sheet3.","A":"Agent described a formula but did not create the missing Sheet3 or execute the authorized write, even after recognizing the omission.","E":"Necessary authorized execution was replaced by description."},
    {"example":11,"U":"Never truncate complete printed values.","A":"Agent used incorporation-by-reference such as 'A-S remain as above'.","E":"The required complete value was truncated."},
    {"example":12,"U":"Add the prepared failure example to the established destination.","A":"Agent claimed the destination was unavailable instead of using the established Agents.md Failure Examples destination.","E":"An unsupported blocker was introduced."},
    {"example":13,"U":"Follow mandatory instructions including failure-mode reads and persistence.","A":"Agent repeatedly discussed the rules without executing their read/persistence controls.","E":"Mandatory procedure was treated as discussion instead of executable control."},
    {"example":14,"U":"Represent didReadback as a single true/false status.","A":"Agent stated both didReadback=true and didReadback=false.","E":"The same operation was given contradictory completion states."}
  ]
}
```

## Procedure Dependency Chart

```json
{
  "procedure_dependency_chart": [
    {"source_value":"nextmessage.json.run_nonce","decision":"Select or initialize the isolated run container.","outputs":["runs/<run_nonce>/state.json current_state.run_nonce","runs/<run_nonce>/messages.json run_nonce","runs/<run_nonce>/store/store.json run_nonce"],"source_code_consumer":"send-to-gemini.js nonce/initRun"},
    {"source_value":"nextmessage.json.execution.step","decision":"Must equal state.json procedure.current_step before the candidate can be compliant.","outputs":["deterministic_validation_failures","messages.json execution_candidate","store.json execution_candidate"],"source_code_consumer":"send-to-gemini.js inspect/validateStep"},
    {"source_value":"execution.return_schema.role_required / role_forbidden / role_completed / role_verification","decision":"Determine execution-role compliance.","outputs":["system validation evidence","Gemini granular *_eval records","supervisory gate result"],"source_code_consumer":"send-to-gemini.js controlFailures and Gemini gate"},
    {"source_value":"execution.return_schema.return_schema_completed","decision":"Determine whether the active step claims a complete return schema.","outputs":["deterministic_validation_failures","Gemini return_schema_completed_eval","gate_result"],"source_code_consumer":"send-to-gemini.js completionValue/controlFailures"},
    {"source_value":"Step 0 start_of_turn.user_request","decision":"Establish verbatim initial user instruction for the run.","outputs":["store/store.json initial_user_message","messages.json execution candidate","later Step 1/Step 3 traceability"],"source_code_consumer":"send-to-gemini.js bootstrap persistence"},
    {"source_value":"Step 2 step_2_record.stated_requirements","decision":"Define the user-stated requirement set used by Step 3 planning and Step 4 completion evaluation.","outputs":["state.json Step 2 execution_return","Gemini Step 3/4 supervisory prompts"],"source_code_consumer":"send-to-gemini.js statedRequirements"},
    {"source_value":"Step 3 D.P.value","decision":"Define the complete planned execution that must satisfy Step 2 requirements.","outputs":["messages.json/store.json Step 3 record","Gemini Step 3 granular evaluation","Step 4 evidence target"],"source_code_consumer":"Gemini supervisory gate via send-to-gemini.js"},
    {"source_value":"Step 3 E.UI_output.value","decision":"Define proposed final user-visible completion wording for evaluation before execution.","outputs":["Step 3 supervisory evaluation","Step 4 reporting comparison"],"source_code_consumer":"Gemini supervisory gate"},
    {"source_value":"Step 3 F.test_results[*].result","decision":"Any T requires Step 3 loop; all F permits Loop_Decision=False.","outputs":["Step 3 G.Loop_Decision","deterministic_validation_failures","gate_result"],"source_code_consumer":"send-to-gemini.js validateStep/step3Loop and Gemini gate"},
    {"source_value":"Step 3 G.Loop_Decision.value","decision":"True keeps execution at Step 3; False permits supervisory completion if the rest of Step 3 passes.","outputs":["state.json procedure.current_step","state.json awaiting","transition record"],"source_code_consumer":"send-to-gemini.js step3Loop/process transition"},
    {"source_value":"supervisory_gate.granular_evaluation.*_eval","decision":"Each terminal execution value independently passes or fails.","outputs":["supervisory_gate.failures","step_level_evaluation","gate_result","messages.json/store.json supervisory record"],"source_code_consumer":"Gemini gate plus send-to-gemini.js evalShape"},
    {"source_value":"supervisory_gate.gate_result","decision":"PASS advances exactly one step after persistence/checkpoint; FAIL remains on the same step.","outputs":["state.json completed_steps","state.json remaining_steps","state.json current_step","state.json awaiting","Git checkpoint commit"],"source_code_consumer":"send-to-gemini.js transition logic and gemini-chat.yml commit step"},
    {"source_value":"state.json procedure.current_step / remaining_steps","decision":"Determine the next ChatGPT-owned execution obligation and whether the run is terminal.","outputs":["state.json status","handshake continuation requirement","next nextmessage.json execution.step"],"source_code_consumer":"send-to-gemini.js plus ChatGPT handshake protocol"},
    {"source_value":"messages.json contents","decision":"Provide ordered execution/supervisory conversation evidence for the active run.","outputs":["future Gemini context","audit trail"],"source_code_consumer":"send-to-gemini.js addMsg/callGemini"},
    {"source_value":"store/store.json records","decision":"Provide durable semantic-operator and supervisor records for the active run.","outputs":["Step 4 completion evidence","audit trail"],"source_code_consumer":"send-to-gemini.js addStore"},
    {"source_value":"Git commit after a PASS transition","decision":"Establish durable checkpoint before next execution step.","outputs":["repository history","minimum completed-step checkpoint count"],"source_code_consumer":".github/workflows/gemini-chat.yml"}
  ]
}
```

## Step 0 Field Definition Glossary

```json
{
  "step_0_field_glossary": {
    "start_of_turn":{"key":"start_of_turn","value":"object","definition":"Step 0 execution return container.","definition_of_evaluation":"Require object with every listed child field.","pass_criteria":"Present and complete.","fail_criteria":"Missing, non-object, or incomplete."},
    "start_of_turn.role_required":{"key":"start_of_turn.role_required","value":"ChatGPT model","definition":"Required execution role.","definition_of_evaluation":"Compare exact value.","pass_criteria":"Equals ChatGPT model.","fail_criteria":"Missing or different."},
    "start_of_turn.role_forbidden":{"key":"start_of_turn.role_forbidden","value":"Gemini model","definition":"Forbidden execution role.","definition_of_evaluation":"Compare exact value.","pass_criteria":"Equals Gemini model.","fail_criteria":"Missing or different."},
    "start_of_turn.role_completed":{"key":"start_of_turn.role_completed","value":"ChatGPT model","definition":"Server-verified actual executor.","definition_of_evaluation":"Compare to role evidence and required/forbidden roles.","pass_criteria":"Verified ChatGPT model.","fail_criteria":"Unverified, Gemini, or contradictory."},
    "start_of_turn.role_verification.method":{"key":"start_of_turn.role_verification.method","value":"<non-empty string>","definition":"Identity verification method.","definition_of_evaluation":"Require direct server/runtime method.","pass_criteria":"Non-empty and credible.","fail_criteria":"Missing, empty, or self-assertion only."},
    "start_of_turn.role_verification.evidence":{"key":"start_of_turn.role_verification.evidence","value":"<non-empty string>","definition":"Observed execution-locus evidence.","definition_of_evaluation":"Check consistency with actual runtime boundary.","pass_criteria":"Supports ChatGPT execution.","fail_criteria":"Missing or conflicting."},
    "start_of_turn.run_nonce":{"key":"start_of_turn.run_nonce","value":"<path-safe run nonce>","definition":"Active run identifier.","definition_of_evaluation":"Compare with bootstrap state/messages/store nonce.","pass_criteria":"Exact match and path-safe.","fail_criteria":"Mismatch, missing, or invalid."},
    "start_of_turn.user_request":{"key":"start_of_turn.user_request","value":"<verbatim user utterance>","definition":"Initial user request.","definition_of_evaluation":"Compare verbatim to user-authored utterance.","pass_criteria":"Complete and unpolluted.","fail_criteria":"Truncated, changed, or controller-polluted."},
    "start_of_turn.current_timestamp":{"key":"start_of_turn.current_timestamp","value":"<ISO 8601 timestamp>","definition":"Execution timestamp.","definition_of_evaluation":"Validate non-empty ISO timestamp.","pass_criteria":"Valid timestamp.","fail_criteria":"Missing/invalid."},
    "start_of_turn.return_schema_completed":{"key":"start_of_turn.return_schema_completed","value":true,"definition":"Step 0 schema completion flag.","definition_of_evaluation":"Require true only when all Step 0 fields are complete.","pass_criteria":"True and schema complete.","fail_criteria":"False/missing or true with incomplete schema."},
    "start_of_turn.return_schema_completed_timestamp":{"key":"start_of_turn.return_schema_completed_timestamp","value":"<ISO 8601 timestamp>","definition":"Step 0 completion timestamp.","definition_of_evaluation":"Require valid timestamp when completion is true.","pass_criteria":"Present/valid.","fail_criteria":"Missing/invalid."},
    "start_of_turn.nonce":{"key":"start_of_turn.nonce","value":"<non-empty request nonce>","definition":"Request identity within the run.","definition_of_evaluation":"Require non-empty stable value for request traceability.","pass_criteria":"Present/non-empty.","fail_criteria":"Missing/empty."},
    "supervisory_gate":{"key":"supervisory_gate","value":"object","definition":"Gemini-owned Step 0 evaluation return.","definition_of_evaluation":"Require canonical gate fields and role ownership.","pass_criteria":"Complete Gemini gate.","fail_criteria":"Missing/malformed/wrong role."},
    "supervisory_gate.role_required":{"key":"supervisory_gate.role_required","value":"Gemini model","definition":"Required gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Different/missing."},
    "supervisory_gate.role_forbidden":{"key":"supervisory_gate.role_forbidden","value":"ChatGPT model","definition":"Forbidden gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Different/missing."},
    "supervisory_gate.role_completed":{"key":"supervisory_gate.role_completed","value":"Gemini model","definition":"Actual gate executor.","definition_of_evaluation":"Verify API/runtime evidence.","pass_criteria":"Verified Gemini.","fail_criteria":"Wrong/unverified."},
    "supervisory_gate.role_verification.method":{"key":"supervisory_gate.role_verification.method","value":"<non-empty string>","definition":"Gate identity method.","definition_of_evaluation":"Require runtime/server method.","pass_criteria":"Non-empty credible method.","fail_criteria":"Missing/empty."},
    "supervisory_gate.role_verification.evidence":{"key":"supervisory_gate.role_verification.evidence","value":"<non-empty string>","definition":"Gate identity evidence.","definition_of_evaluation":"Check Gemini runtime provenance.","pass_criteria":"Supports Gemini execution.","fail_criteria":"Missing/conflicting."},
    "supervisory_gate.instruction":{"key":"supervisory_gate.instruction","value":"<gate instruction string>","definition":"Evaluation-only instruction.","definition_of_evaluation":"Ensure it forbids execution/repair of ChatGPT step.","pass_criteria":"Evaluation-only and complete.","fail_criteria":"Permits wrong-role execution or omits required evaluation behavior."},
    "supervisory_gate.granular_evaluation":{"key":"supervisory_gate.granular_evaluation","value":"<*_eval tree>","definition":"Per-terminal-value evaluation tree.","definition_of_evaluation":"Validate exact shape/value preservation and every terminal field.","pass_criteria":"Complete valid *_eval coverage.","fail_criteria":"Missing/rewritten/unevaluated terminal value."},
    "supervisory_gate.step_level_evaluation.supervisor_eval_result":{"key":"supervisory_gate.step_level_evaluation.supervisor_eval_result","value":"PASS|FAIL","definition":"Whole-step evaluation status.","definition_of_evaluation":"Require PASS/FAIL consistent with evidence.","pass_criteria":"Valid and consistent.","fail_criteria":"Missing/invalid/inconsistent."},
    "supervisory_gate.step_level_evaluation.supervisor_eval_comment":{"key":"supervisory_gate.step_level_evaluation.supervisor_eval_comment","value":"<non-empty string>","definition":"Whole-step evaluation rationale.","definition_of_evaluation":"Require specific substantive comment.","pass_criteria":"Specific/non-empty.","fail_criteria":"Missing/empty/generic."},
    "supervisory_gate.failures":{"key":"supervisory_gate.failures","value":"array","definition":"Separate detailed failure records.","definition_of_evaluation":"Require one entry for each independent failure.","pass_criteria":"Complete and separated.","fail_criteria":"Missing failures, collapsed independent failures, or invented failures."},
    "supervisory_gate.gate_result":{"key":"supervisory_gate.gate_result","value":"PASS|FAIL","definition":"Step transition decision.","definition_of_evaluation":"PASS only when every required gate condition passes.","pass_criteria":"Aggregate result is correct.","fail_criteria":"Invalid or contradicts component results."}
  }
}
```

## Step 0

```json
{
  "step_0": {
    "required_execution_role":"ChatGPT model",
    "forbidden_execution_role":"Gemini model",
    "evaluation_requirements":[
      {"key":"step_0_preserve_verbatim_request","value":"Preserve the complete user utterance in start_of_turn.user_request.","definition":"Initial request fidelity requirement.","definition_of_evaluation":"Compare verbatim with the user utterance.","pass_criteria":"Exact complete user-authored text.","fail_criteria":"Any omission, semantic change, or controller pollution."},
      {"key":"step_0_bootstrap_identity","value":"Use the active bootstrap run_nonce and a non-empty request nonce.","definition":"Run/request traceability requirement.","definition_of_evaluation":"Compare against active run container.","pass_criteria":"Identifiers present and consistent.","fail_criteria":"Missing/mismatched identifiers."},
      {"key":"step_0_role_and_completion","value":"Record server-verified ChatGPT role and set return_schema_completed=true only when every Step 0 field is complete.","definition":"Role/completion integrity.","definition_of_evaluation":"Evaluate role evidence plus field completeness.","pass_criteria":"Verified role and complete schema.","fail_criteria":"Wrong/unverified role or premature completion."},
      {"key":"step_0_persistence","value":"Persist the Step 0 execution and supervisory records in the active run message stream/store and checkpoint a PASS before Step 1.","definition":"Durability requirement.","definition_of_evaluation":"Inspect run files and checkpoint order.","pass_criteria":"Persisted and checkpointed before advancement.","fail_criteria":"Missing persistence/checkpoint or premature advancement."}
    ],
    "execution_return_schema":{"start_of_turn":{"role_required":"ChatGPT model","role_forbidden":"Gemini model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"run_nonce":"<run nonce>","user_request":"<verbatim user request>","current_timestamp":"<ISO 8601>","return_schema_completed":true,"return_schema_completed_timestamp":"<ISO 8601>","nonce":"<request nonce>"}},
    "supervisory_gate_schema":{"supervisory_gate":{"role_required":"Gemini model","role_forbidden":"ChatGPT model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"instruction":"Evaluate only the supplied Step 0 execution return against Agents.md. Preserve every terminal execution key/value in its *_eval record. Do not execute or repair the ChatGPT-owned step.","granular_evaluation":"<*_eval tree>","step_level_evaluation":{"supervisor_eval_result":"PASS|FAIL","supervisor_eval_comment":"<comment>"},"failures":[],"gate_result":"PASS|FAIL"}}
  }
}
```

## Step 1 Field Definition Glossary

```json
{
  "step_1_field_glossary": {
    "step_1_record":{"key":"step_1_record","value":"object","definition":"Step 1 execution return container.","definition_of_evaluation":"Require every child field.","pass_criteria":"Complete object.","fail_criteria":"Missing/incomplete."},
    "step_1_record.role_required":{"key":"step_1_record.role_required","value":"ChatGPT model","definition":"Required execution role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Different/missing."},
    "step_1_record.role_forbidden":{"key":"step_1_record.role_forbidden","value":"Gemini model","definition":"Forbidden execution role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Different/missing."},
    "step_1_record.role_completed":{"key":"step_1_record.role_completed","value":"ChatGPT model","definition":"Actual verified executor.","definition_of_evaluation":"Compare with runtime evidence.","pass_criteria":"Verified ChatGPT.","fail_criteria":"Wrong/unverified."},
    "step_1_record.role_verification.method":{"key":"step_1_record.role_verification.method","value":"<string>","definition":"Identity method.","definition_of_evaluation":"Require direct method.","pass_criteria":"Non-empty/credible.","fail_criteria":"Missing/empty."},
    "step_1_record.role_verification.evidence":{"key":"step_1_record.role_verification.evidence","value":"<string>","definition":"Identity evidence.","definition_of_evaluation":"Check execution locus.","pass_criteria":"Supports ChatGPT.","fail_criteria":"Missing/conflicting."},
    "step_1_record.run_nonce":{"key":"step_1_record.run_nonce","value":"<run nonce>","definition":"Active run identifier.","definition_of_evaluation":"Compare with bootstrap.","pass_criteria":"Exact match.","fail_criteria":"Mismatch/missing."},
    "step_1_record.user_request":{"key":"step_1_record.user_request","value":"<verbatim user request>","definition":"Preserved request.","definition_of_evaluation":"Compare verbatim.","pass_criteria":"Complete/unpolluted.","fail_criteria":"Changed/truncated/polluted."},
    "step_1_record.nonce":{"key":"step_1_record.nonce","value":"<request nonce>","definition":"Request identifier.","definition_of_evaluation":"Require non-empty value linked to Step 0.","pass_criteria":"Present/consistent.","fail_criteria":"Missing/inconsistent."},
    "step_1_record.current_timestamp":{"key":"step_1_record.current_timestamp","value":"<ISO 8601>","definition":"Execution timestamp.","definition_of_evaluation":"Validate timestamp.","pass_criteria":"Valid.","fail_criteria":"Missing/invalid."},
    "step_1_record.return_schema_completed":{"key":"step_1_record.return_schema_completed","value":true,"definition":"Step 1 completion flag.","definition_of_evaluation":"Require true only with complete schema.","pass_criteria":"True and complete.","fail_criteria":"False/missing/premature true."},
    "step_1_record.return_schema_completed_timestamp":{"key":"step_1_record.return_schema_completed_timestamp","value":"<ISO 8601>","definition":"Completion timestamp.","definition_of_evaluation":"Require valid timestamp.","pass_criteria":"Valid/present.","fail_criteria":"Missing/invalid."},
    "supervisory_gate.role_required":{"key":"supervisory_gate.role_required","value":"Gemini model","definition":"Required gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_forbidden":{"key":"supervisory_gate.role_forbidden","value":"ChatGPT model","definition":"Forbidden gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_completed":{"key":"supervisory_gate.role_completed","value":"Gemini model","definition":"Actual gate executor.","definition_of_evaluation":"Check runtime evidence.","pass_criteria":"Verified Gemini.","fail_criteria":"Wrong/unverified."},
    "supervisory_gate.role_verification":{"key":"supervisory_gate.role_verification","value":"{method,evidence}","definition":"Gate role proof.","definition_of_evaluation":"Require non-empty method/evidence.","pass_criteria":"Both support Gemini.","fail_criteria":"Missing/conflicting."},
    "supervisory_gate.instruction":{"key":"supervisory_gate.instruction","value":"<string>","definition":"Evaluation-only instruction.","definition_of_evaluation":"Check scope and role boundary.","pass_criteria":"Evaluates only Step 1.","fail_criteria":"Executes/repairs ChatGPT step or omits required checks."},
    "supervisory_gate.granular_evaluation":{"key":"supervisory_gate.granular_evaluation","value":"<*_eval tree>","definition":"Terminal-field evaluations.","definition_of_evaluation":"Validate coverage/preservation/results/comments.","pass_criteria":"Complete valid tree.","fail_criteria":"Any missing/rewritten/unevaluated field."},
    "supervisory_gate.step_level_evaluation":{"key":"supervisory_gate.step_level_evaluation","value":"{supervisor_eval_result,supervisor_eval_comment}","definition":"Whole-step evaluation.","definition_of_evaluation":"Require valid result/comment.","pass_criteria":"Complete/consistent.","fail_criteria":"Missing/invalid/inconsistent."},
    "supervisory_gate.failures":{"key":"supervisory_gate.failures","value":"array","definition":"Independent failure records.","definition_of_evaluation":"Compare to granular/step failures.","pass_criteria":"Every failure separately recorded.","fail_criteria":"Missing/collapsed/invented."},
    "supervisory_gate.gate_result":{"key":"supervisory_gate.gate_result","value":"PASS|FAIL","definition":"Transition decision.","definition_of_evaluation":"Aggregate all gate criteria.","pass_criteria":"Correct aggregate.","fail_criteria":"Invalid/inconsistent."}
  }
}
```

## Step 1

```json
{
  "step_1": {
    "required_execution_role":"ChatGPT model",
    "forbidden_execution_role":"Gemini model",
    "evaluation_requirements":[
      {"key":"step_1_preserve_request","value":"Preserve the complete request as received.","definition":"Request continuity requirement.","definition_of_evaluation":"Compare Step 1 user_request to Step 0 user_request.","pass_criteria":"Exact match.","fail_criteria":"Any change or omission."},
      {"key":"step_1_identity_and_traceability","value":"Preserve active run_nonce/request nonce and verified ChatGPT role evidence.","definition":"Traceability/role requirement.","definition_of_evaluation":"Compare to active run and role boundary.","pass_criteria":"Identifiers and role evidence match.","fail_criteria":"Mismatch/missing/wrong role."},
      {"key":"step_1_completion_and_persistence","value":"Complete/persist the Step 1 schema and checkpoint a PASS before Step 2.","definition":"Completion durability requirement.","definition_of_evaluation":"Inspect schema, run files, and checkpoint order.","pass_criteria":"Complete, persisted, passed, checkpointed.","fail_criteria":"Any required condition missing."}
    ],
    "execution_return_schema":{"step_1_record":{"role_required":"ChatGPT model","role_forbidden":"Gemini model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"run_nonce":"<run nonce>","user_request":"<verbatim user request>","nonce":"<request nonce>","current_timestamp":"<ISO 8601>","return_schema_completed":true,"return_schema_completed_timestamp":"<ISO 8601>"}},
    "supervisory_gate_schema":{"supervisory_gate":{"role_required":"Gemini model","role_forbidden":"ChatGPT model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"instruction":"Evaluate only the supplied Step 1 execution return against Agents.md, the user request, authorization context, and applicable Failure Examples. Preserve terminal values in *_eval records. Do not execute or repair the ChatGPT-owned step.","granular_evaluation":"<*_eval tree>","step_level_evaluation":{"supervisor_eval_result":"PASS|FAIL","supervisor_eval_comment":"<comment>"},"failures":[],"gate_result":"PASS|FAIL"}}
  }
}
```

## Step 2 Field Definition Glossary

```json
{
  "step_2_field_glossary": {
    "step_2_record":{"key":"step_2_record","value":"object","definition":"Step 2 execution return.","definition_of_evaluation":"Require all child fields.","pass_criteria":"Complete.","fail_criteria":"Missing/incomplete."},
    "step_2_record.role_required":{"key":"step_2_record.role_required","value":"ChatGPT model","definition":"Required execution role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Other/missing."},
    "step_2_record.role_forbidden":{"key":"step_2_record.role_forbidden","value":"Gemini model","definition":"Forbidden role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Other/missing."},
    "step_2_record.role_completed":{"key":"step_2_record.role_completed","value":"ChatGPT model","definition":"Actual executor.","definition_of_evaluation":"Verify runtime evidence.","pass_criteria":"Verified ChatGPT.","fail_criteria":"Wrong/unverified."},
    "step_2_record.role_verification":{"key":"step_2_record.role_verification","value":"{method,evidence}","definition":"Execution role proof.","definition_of_evaluation":"Require direct non-empty evidence.","pass_criteria":"Supports ChatGPT.","fail_criteria":"Missing/conflicting."},
    "step_2_record.run_nonce":{"key":"step_2_record.run_nonce","value":"<run nonce>","definition":"Run identifier.","definition_of_evaluation":"Compare active run.","pass_criteria":"Exact match.","fail_criteria":"Mismatch/missing."},
    "step_2_record.user_request_nonce":{"key":"step_2_record.user_request_nonce","value":"<request nonce>","definition":"Request identifier.","definition_of_evaluation":"Compare Step 0/1 request nonce.","pass_criteria":"Exact match.","fail_criteria":"Mismatch/missing."},
    "step_2_record.stated_requirements":{"key":"step_2_record.stated_requirements","value":"array<string>","definition":"Only requirements stated by the user, preserved verbatim.","definition_of_evaluation":"Compare every entry and full coverage against the user request.","pass_criteria":"All and only user-stated requirements appear verbatim.","fail_criteria":"Any omission, invention, paraphrase, or altered scope."},
    "step_2_record.current_timestamp":{"key":"step_2_record.current_timestamp","value":"<ISO 8601>","definition":"Execution timestamp.","definition_of_evaluation":"Validate timestamp.","pass_criteria":"Valid.","fail_criteria":"Missing/invalid."},
    "step_2_record.return_schema_completed":{"key":"step_2_record.return_schema_completed","value":true,"definition":"Step 2 completion flag.","definition_of_evaluation":"True only after requirement extraction is complete.","pass_criteria":"True and complete.","fail_criteria":"False/missing/premature true."},
    "step_2_record.return_schema_completed_timestamp":{"key":"step_2_record.return_schema_completed_timestamp","value":"<ISO 8601>","definition":"Completion timestamp.","definition_of_evaluation":"Require valid timestamp.","pass_criteria":"Valid.","fail_criteria":"Missing/invalid."},
    "supervisory_gate.role_required":{"key":"supervisory_gate.role_required","value":"Gemini model","definition":"Required gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_forbidden":{"key":"supervisory_gate.role_forbidden","value":"ChatGPT model","definition":"Forbidden gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_completed":{"key":"supervisory_gate.role_completed","value":"Gemini model","definition":"Actual gate role.","definition_of_evaluation":"Verify runtime evidence.","pass_criteria":"Verified Gemini.","fail_criteria":"Wrong/unverified."},
    "supervisory_gate.role_verification":{"key":"supervisory_gate.role_verification","value":"{method,evidence}","definition":"Gate role proof.","definition_of_evaluation":"Require non-empty credible proof.","pass_criteria":"Supports Gemini.","fail_criteria":"Missing/conflicting."},
    "supervisory_gate.instruction":{"key":"supervisory_gate.instruction","value":"<string>","definition":"Step 2 evaluation instruction.","definition_of_evaluation":"Require verbatim requirement coverage check and role boundary.","pass_criteria":"Complete evaluation-only instruction.","fail_criteria":"Missing required check or wrong-role execution permission."},
    "supervisory_gate.granular_evaluation":{"key":"supervisory_gate.granular_evaluation","value":"<*_eval tree>","definition":"Field evaluations.","definition_of_evaluation":"Validate complete exact preservation.","pass_criteria":"All terminal fields evaluated.","fail_criteria":"Any terminal field missing/changed."},
    "supervisory_gate.step_level_evaluation":{"key":"supervisory_gate.step_level_evaluation","value":"{result,comment}","definition":"Whole-step evaluation.","definition_of_evaluation":"Require valid aggregate result/comment.","pass_criteria":"Complete/consistent.","fail_criteria":"Missing/invalid/inconsistent."},
    "supervisory_gate.failures":{"key":"supervisory_gate.failures","value":"array","definition":"Independent failure list.","definition_of_evaluation":"Match each detected failure.","pass_criteria":"Complete/separate.","fail_criteria":"Missing/collapsed/invented."},
    "supervisory_gate.gate_result":{"key":"supervisory_gate.gate_result","value":"PASS|FAIL","definition":"Transition decision.","definition_of_evaluation":"Aggregate all criteria.","pass_criteria":"Correct aggregate.","fail_criteria":"Invalid/inconsistent."}
  }
}
```

## Step 2

```json
{
  "step_2": {
    "required_execution_role":"ChatGPT model",
    "forbidden_execution_role":"Gemini model",
    "evaluation_requirements":[
      {"key":"step_2_only_user_stated_requirements","value":"Extract only requirements stated by the user.","definition":"No invented requirements.","definition_of_evaluation":"Compare each entry to user-authored words.","pass_criteria":"Every entry is user-stated.","fail_criteria":"Any invented/agent-authored requirement."},
      {"key":"step_2_complete_verbatim_requirement_coverage","value":"Preserve every user-stated requirement verbatim and include all of them.","definition":"Full source-traceable requirement set.","definition_of_evaluation":"Compare stated_requirements to all independently checkable user requirements.","pass_criteria":"No omission and no paraphrase.","fail_criteria":"Any omitted or altered requirement."},
      {"key":"step_2_role_traceability_completion_persistence","value":"Use verified ChatGPT role, active run/request identifiers, valid timestamps, complete/persist the return, and checkpoint PASS before Step 3.","definition":"Step integrity requirement.","definition_of_evaluation":"Inspect schema, run state, persistence, and checkpoint order.","pass_criteria":"All integrity conditions pass.","fail_criteria":"Any integrity condition fails."}
    ],
    "execution_return_schema":{"step_2_record":{"role_required":"ChatGPT model","role_forbidden":"Gemini model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"run_nonce":"<run nonce>","user_request_nonce":"<request nonce>","stated_requirements":["<verbatim requirement>"],"current_timestamp":"<ISO 8601>","return_schema_completed":true,"return_schema_completed_timestamp":"<ISO 8601>"}},
    "supervisory_gate_schema":{"supervisory_gate":{"role_required":"Gemini model","role_forbidden":"ChatGPT model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"instruction":"Evaluate only the supplied Step 2 execution return. Verify every stated requirement is verbatim from the user request and none were invented or omitted. Preserve terminal values in *_eval records. Do not execute or repair the ChatGPT-owned step.","granular_evaluation":"<*_eval tree>","step_level_evaluation":{"supervisor_eval_result":"PASS|FAIL","supervisor_eval_comment":"<comment>"},"failures":[],"gate_result":"PASS|FAIL"}}
  }
}
```

## Step 3 Field Definition Glossary

```json
{
  "step_3_field_glossary": {
    "Step_3":{"key":"Step_3","value":"object","definition":"Step 3 execution return.","definition_of_evaluation":"Require complete A-G planning/test schema plus control fields.","pass_criteria":"All required fields complete.","fail_criteria":"Any required part missing/incomplete."},
    "Step_3.role_required":{"key":"Step_3.role_required","value":"ChatGPT model","definition":"Required executor.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Other/missing."},
    "Step_3.role_forbidden":{"key":"Step_3.role_forbidden","value":"Gemini model","definition":"Forbidden executor.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Other/missing."},
    "Step_3.role_completed":{"key":"Step_3.role_completed","value":"ChatGPT model","definition":"Actual executor.","definition_of_evaluation":"Verify runtime evidence.","pass_criteria":"Verified ChatGPT.","fail_criteria":"Wrong/unverified."},
    "Step_3.role_verification":{"key":"Step_3.role_verification","value":"{method,evidence}","definition":"Execution role proof.","definition_of_evaluation":"Require non-empty direct evidence.","pass_criteria":"Supports ChatGPT.","fail_criteria":"Missing/conflicting."},
    "Step_3.descriptor":{"key":"Step_3.descriptor","value":"<string>","definition":"Step purpose.","definition_of_evaluation":"Compare to required decomposition/plan/test/loop purpose.","pass_criteria":"Semantically complete.","fail_criteria":"Missing/misstates purpose."},
    "Step_3.user_request_nonce":{"key":"Step_3.user_request_nonce","value":"<request nonce>","definition":"Request traceability.","definition_of_evaluation":"Compare prior steps.","pass_criteria":"Exact match.","fail_criteria":"Missing/mismatch."},
    "Step_3.A.descriptor":{"key":"Step_3.A.descriptor","value":"<string>","definition":"A purpose.","definition_of_evaluation":"Require preservation purpose.","pass_criteria":"Correct.","fail_criteria":"Missing/incorrect."},
    "Step_3.A.U.instruction":{"key":"Step_3.A.U.instruction","value":"<string>","definition":"Verbatim-U instruction.","definition_of_evaluation":"Require full preservation command.","pass_criteria":"Correct.","fail_criteria":"Missing/weakens preservation."},
    "Step_3.A.U.value":{"key":"Step_3.A.U.value","value":"<verbatim user instruction>","definition":"Complete U source utterance.","definition_of_evaluation":"Compare verbatim to initial user request.","pass_criteria":"Complete/unpolluted.","fail_criteria":"Truncated/changed/polluted."},
    "Step_3.B.descriptor":{"key":"Step_3.B.descriptor","value":"<string>","definition":"Clause decomposition purpose.","definition_of_evaluation":"Require actions/persons/objects coverage.","pass_criteria":"Correct purpose.","fail_criteria":"Missing/incorrect."},
    "Step_3.B.clauses.instruction":{"key":"Step_3.B.clauses.instruction","value":"<string>","definition":"Clause extraction instruction.","definition_of_evaluation":"Require all clauses/components.","pass_criteria":"Complete instruction.","fail_criteria":"Missing/weakens coverage."},
    "Step_3.B.clauses.value[*].clause":{"key":"Step_3.B.clauses.value[*].clause","value":"<clause>","definition":"One requirement clause.","definition_of_evaluation":"Compare to U.","pass_criteria":"Accurate/source-supported.","fail_criteria":"Invented/omitted/changed."},
    "Step_3.B.clauses.value[*].actions":{"key":"Step_3.B.clauses.value[*].actions","value":"array<string>","definition":"Actions in clause.","definition_of_evaluation":"Compare clause semantics.","pass_criteria":"Complete/accurate.","fail_criteria":"Missing/invented."},
    "Step_3.B.clauses.value[*].persons":{"key":"Step_3.B.clauses.value[*].persons","value":"array<string>","definition":"Actors/subjects.","definition_of_evaluation":"Compare clause/context.","pass_criteria":"Accurate.","fail_criteria":"Wrong/invented."},
    "Step_3.B.clauses.value[*].objects":{"key":"Step_3.B.clauses.value[*].objects","value":"array<string>","definition":"Affected targets.","definition_of_evaluation":"Compare clause/context.","pass_criteria":"Complete/accurate.","fail_criteria":"Missing/wrong/invented."},
    "Step_3.C.descriptor":{"key":"Step_3.C.descriptor","value":"<string>","definition":"Modifier-analysis purpose.","definition_of_evaluation":"Require recursive meaning-difference analysis.","pass_criteria":"Correct.","fail_criteria":"Missing/incorrect."},
    "Step_3.C.modifier_analysis.instruction":{"key":"Step_3.C.modifier_analysis.instruction","value":"<string>","definition":"Modifier analysis instruction.","definition_of_evaluation":"Require identify/remove/compare/level/repeat behavior.","pass_criteria":"Complete.","fail_criteria":"Missing required operation."},
    "Step_3.C.modifier_analysis.value[*].modifier":{"key":"Step_3.C.modifier_analysis.value[*].modifier","value":"<modifier>","definition":"Material modifier.","definition_of_evaluation":"Compare U.","pass_criteria":"Source-supported.","fail_criteria":"Invented or omitted material modifier."},
    "Step_3.C.modifier_analysis.value[*].meaning_without_modifier":{"key":"Step_3.C.modifier_analysis.value[*].meaning_without_modifier","value":"<counterfactual meaning>","definition":"Meaning without modifier.","definition_of_evaluation":"Check semantic counterfactual.","pass_criteria":"Accurate.","fail_criteria":"Does not isolate modifier effect."},
    "Step_3.C.modifier_analysis.value[*].difference":{"key":"Step_3.C.modifier_analysis.value[*].difference","value":"<difference>","definition":"Modifier's semantic effect.","definition_of_evaluation":"Compare original/counterfactual.","pass_criteria":"Accurate/material.","fail_criteria":"Missing/wrong."},
    "Step_3.C.modifier_analysis.value[*].recursive_level":{"key":"Step_3.C.modifier_analysis.value[*].recursive_level","value":"integer","definition":"Analysis depth.","definition_of_evaluation":"Require positive level consistent with recursion.","pass_criteria":"Valid.","fail_criteria":"Missing/invalid."},
    "Step_3.D.descriptor":{"key":"Step_3.D.descriptor","value":"<string>","definition":"Plan construction purpose.","definition_of_evaluation":"Require complete plan purpose.","pass_criteria":"Correct.","fail_criteria":"Missing/incorrect."},
    "Step_3.D.P.instruction":{"key":"Step_3.D.P.instruction","value":"<string>","definition":"Plan instruction.","definition_of_evaluation":"Require U+B+C and all Step 2 requirements.","pass_criteria":"Complete constraint.","fail_criteria":"Omits source/coverage constraint."},
    "Step_3.D.P.value":{"key":"Step_3.D.P.value","value":"<complete plan>","definition":"Planned execution.","definition_of_evaluation":"Compare to every Step 2 requirement and modifiers.","pass_criteria":"Complete, authorized, ordered plan.","fail_criteria":"Omission, invention, scope/method/order change."},
    "Step_3.E.descriptor":{"key":"Step_3.E.descriptor","value":"<string>","definition":"UI proposal purpose.","definition_of_evaluation":"Require exact proposed user result.","pass_criteria":"Correct.","fail_criteria":"Missing/incorrect."},
    "Step_3.E.UI_output.instruction":{"key":"Step_3.E.UI_output.instruction","value":"<string>","definition":"UI drafting instruction.","definition_of_evaluation":"Require exact proposed words.","pass_criteria":"Correct.","fail_criteria":"Missing/weakens exactness."},
    "Step_3.E.UI_output.value":{"key":"Step_3.E.UI_output.value","value":"<exact proposed response>","definition":"Proposed user-visible completion report.","definition_of_evaluation":"Check consistency with P and future evidence requirements.","pass_criteria":"Would accurately report completed P.","fail_criteria":"Promises instead of executes, overclaims, or omits required result."},
    "Step_3.F.descriptor":{"key":"Step_3.F.descriptor","value":"<string>","definition":"Test-evaluation purpose.","definition_of_evaluation":"Require every Step3_TSR test.","pass_criteria":"Correct.","fail_criteria":"Missing/incorrect."},
    "Step_3.F.Step3_TSR_status.value":{"key":"Step_3.F.Step3_TSR_status.value","value":"Found","definition":"Test-source availability.","definition_of_evaluation":"Require active evaluation-tests source.","pass_criteria":"Found.","fail_criteria":"Missing/not found."},
    "Step_3.F.Step3_TSR_verbatim_result.value":{"key":"Step_3.F.Step3_TSR_verbatim_result.value","value":"<verbatim test source/result>","definition":"Unaltered Step3_TSR evidence.","definition_of_evaluation":"Compare to active test source where directly available.","pass_criteria":"Complete and unaltered or directly available to supervisor with traceable source.","fail_criteria":"Misrepresented, materially truncated without source availability, or reconstructed inaccurately."},
    "Step_3.F.Test_Count.value":{"key":"Step_3.F.Test_Count.value","value":"integer","definition":"Number of tests evaluated.","definition_of_evaluation":"Compare to active test corpus.","pass_criteria":"Exact count.","fail_criteria":"Mismatch/invalid."},
    "Step_3.F.test_results.value[*].question_number":{"key":"Step_3.F.test_results.value[*].question_number","value":"<test id>","definition":"Test identifier.","definition_of_evaluation":"Require complete unique coverage.","pass_criteria":"Every test represented once.","fail_criteria":"Missing/duplicate/wrong id."},
    "Step_3.F.test_results.value[*].question":{"key":"Step_3.F.test_results.value[*].question","value":"<test question>","definition":"Failure-relation question.","definition_of_evaluation":"Compare to canonical test semantics.","pass_criteria":"Correct relation question.","fail_criteria":"Changed semantics."},
    "Step_3.F.test_results.value[*].result":{"key":"Step_3.F.test_results.value[*].result","value":"T|F","definition":"Whether P matches that failure relation.","definition_of_evaluation":"Apply test to current U/P.","pass_criteria":"Correct T/F relation status.","fail_criteria":"Incorrect/unjustified status."},
    "Step_3.G.Loop_Decision.value":{"key":"Step_3.G.Loop_Decision.value","value":"True|False","definition":"Internal Step 3 repetition control.","definition_of_evaluation":"True iff any test is T; False iff every test is F.","pass_criteria":"Exactly matches test set.","fail_criteria":"Contradicts any test."},
    "Step_3.G.return_to.value":{"key":"Step_3.G.return_to.value","value":"Step_3.A|null","definition":"Loop target.","definition_of_evaluation":"Step_3.A when loop True; null when False.","pass_criteria":"Matches Loop_Decision.","fail_criteria":"Mismatch."},
    "Step_3.current_timestamp":{"key":"Step_3.current_timestamp","value":"<ISO 8601>","definition":"Execution timestamp.","definition_of_evaluation":"Validate timestamp.","pass_criteria":"Valid.","fail_criteria":"Missing/invalid."},
    "Step_3.return_schema_completed":{"key":"Step_3.return_schema_completed","value":true,"definition":"Step 3 completion flag.","definition_of_evaluation":"True only when all A-G fields are complete, all tests are F, and role is verified.","pass_criteria":"True under all completion conditions.","fail_criteria":"False/missing or premature true."},
    "Step_3.return_schema_completed_timestamp":{"key":"Step_3.return_schema_completed_timestamp","value":"<ISO 8601>","definition":"Completion timestamp.","definition_of_evaluation":"Require valid timestamp on completion.","pass_criteria":"Valid/present.","fail_criteria":"Missing/invalid."},
    "supervisory_gate.role_required":{"key":"supervisory_gate.role_required","value":"Gemini model","definition":"Required gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_forbidden":{"key":"supervisory_gate.role_forbidden","value":"ChatGPT model","definition":"Forbidden gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_completed":{"key":"supervisory_gate.role_completed","value":"Gemini model","definition":"Actual gate role.","definition_of_evaluation":"Verify runtime evidence.","pass_criteria":"Verified Gemini.","fail_criteria":"Wrong/unverified."},
    "supervisory_gate.role_verification":{"key":"supervisory_gate.role_verification","value":"{method,evidence}","definition":"Gate role proof.","definition_of_evaluation":"Require direct evidence.","pass_criteria":"Supports Gemini.","fail_criteria":"Missing/conflicting."},
    "supervisory_gate.instruction":{"key":"supervisory_gate.instruction","value":"<string>","definition":"Step 3 evaluation instruction.","definition_of_evaluation":"Require Agents.md + supplied Step3_TSR evaluation, Step 2 requirement coverage, and role boundary.","pass_criteria":"Complete evaluation-only instruction.","fail_criteria":"Omits required check or executes ChatGPT step."},
    "supervisory_gate.granular_evaluation":{"key":"supervisory_gate.granular_evaluation","value":"<*_eval tree>","definition":"Field evaluations.","definition_of_evaluation":"Validate every terminal field exactly.","pass_criteria":"Complete/preserved/evaluated.","fail_criteria":"Any missing/changed/unevaluated field."},
    "supervisory_gate.step_level_evaluation":{"key":"supervisory_gate.step_level_evaluation","value":"{result,comment}","definition":"Whole-step evaluation.","definition_of_evaluation":"Aggregate granular/deliverable/role checks.","pass_criteria":"Complete/consistent.","fail_criteria":"Missing/invalid/inconsistent."},
    "supervisory_gate.failures":{"key":"supervisory_gate.failures","value":"array","definition":"Independent failures.","definition_of_evaluation":"Require every detected failure separately.","pass_criteria":"Complete/separate.","fail_criteria":"Missing/collapsed/invented."},
    "supervisory_gate.gate_result":{"key":"supervisory_gate.gate_result","value":"PASS|FAIL","definition":"Transition decision.","definition_of_evaluation":"PASS only if all Step 3 checks pass.","pass_criteria":"Correct aggregate.","fail_criteria":"Invalid/inconsistent."}
  }
}
```

## Step 3

```json
{
  "step_3": {
    "required_execution_role":"ChatGPT model",
    "forbidden_execution_role":"Gemini model",
    "evaluation_requirements":[
      {"key":"step_3_complete_U_decomposition","value":"Preserve complete U and fully decompose its clauses, actions, persons, objects, and material modifiers.","definition":"Planning must be grounded in complete user semantics.","definition_of_evaluation":"Compare A-C to U and Step 2 requirements.","pass_criteria":"Complete/source-supported decomposition.","fail_criteria":"Any truncation, invention, omitted clause, or material modifier."},
      {"key":"step_3_plan_satisfies_all_step_2_requirements","value":"P must satisfy every Step 2 stated requirement without unauthorized additions or changed modifiers.","definition":"Complete plan coverage requirement.","definition_of_evaluation":"Map each Step 2 requirement to concrete P actions/results.","pass_criteria":"Every requirement has a faithful plan mapping.","fail_criteria":"Any omission, invention, scope/method/order change."},
      {"key":"step_3_UI_output_matches_planned_verified_result","value":"UI_output must be the exact proposed completion report for P and must not overclaim unexecuted results.","definition":"Prospective output integrity.","definition_of_evaluation":"Compare UI_output to P and evidence that will be required by Step 4.","pass_criteria":"Accurate if P is executed as planned.","fail_criteria":"Promise, omission, contradiction, or unsupported completion wording."},
      {"key":"step_3_all_tests_are_evaluated","value":"Evaluate every active Step3_TSR test independently against current U/P.","definition":"Failure-pattern coverage requirement.","definition_of_evaluation":"Compare Test_Count/test_results to evaluation-tests.md supplied in supervisor context.","pass_criteria":"Complete test coverage with correct results.","fail_criteria":"Missing/duplicate/incorrect test evaluation."},
      {"key":"step_3_loop_control_follows_test_results","value":"Any T repeats Step 3 from A; all F permits Step 3 completion.","definition":"Internal plan-validation loop.","definition_of_evaluation":"Compare G values to all F results.","pass_criteria":"Loop values exactly match tests.","fail_criteria":"Contradiction or premature completion."},
      {"key":"step_3_role_completion_persistence_checkpoint","value":"Use verified ChatGPT role, complete/persist the Step 3 schema, receive Gemini PASS, and checkpoint before Step 4.","definition":"Step integrity requirement.","definition_of_evaluation":"Inspect role evidence, schema, run records, gate, and commit order.","pass_criteria":"All integrity conditions pass.","fail_criteria":"Any integrity condition fails."}
    ],
    "execution_return_schema":{"Step_3":{"role_required":"ChatGPT model","role_forbidden":"Gemini model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"descriptor":"Decompose U, construct P and UI_output, evaluate every Step3_TSR test, and determine repetition/completion.","user_request_nonce":"<request nonce>","A":{"descriptor":"Preserve user instruction.","U":{"instruction":"Preserve complete user instruction verbatim.","value":"<verbatim U>"}},"B":{"descriptor":"Decompose U.","clauses":{"instruction":"Include every clause/action/person/object.","value":[{"clause":"<clause>","actions":["<action>"],"persons":["<person>"],"objects":["<object>"]}]}},"C":{"descriptor":"Analyze modifiers recursively.","modifier_analysis":{"instruction":"Identify each modifier and its semantic difference.","value":[{"modifier":"<modifier>","meaning_without_modifier":"<meaning>","difference":"<difference>","recursive_level":1}]}},"D":{"descriptor":"Construct complete plan.","P":{"instruction":"Fulfill all Step 2 requirements using U/B/C.","value":"<complete plan>"}},"E":{"descriptor":"Construct exact proposed UI result.","UI_output":{"instruction":"Provide exact proposed words.","value":"<proposed response>"}},"F":{"descriptor":"Evaluate Step3_TSR.","Step3_TSR_status":{"instruction":"Locate active test source.","value":"Found"},"Step3_TSR_verbatim_result":{"instruction":"Preserve/trace the active test source without semantic alteration.","value":"<test evidence>"},"Test_Count":{"instruction":"Count tests.","value":32},"test_results":{"instruction":"Evaluate every test independently.","value":[{"question_number":"<id>","question":"Is it true that P maps to U in this failure relationship?","result":"F"}]}},"G":{"descriptor":"Control loop.","Loop_Decision":{"instruction":"True iff any test is T; otherwise False.","value":"False"},"return_to":{"instruction":"Step_3.A on True; null on False.","value":null}},"current_timestamp":"<ISO 8601>","return_schema_completed":true,"return_schema_completed_timestamp":"<ISO 8601>"}},
    "supervisory_gate_schema":{"supervisory_gate":{"role_required":"Gemini model","role_forbidden":"ChatGPT model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"instruction":"Evaluate only the supplied Step 3 return using Agents.md and the Step3_TSR test source supplied in runtime context. Verify P/UI_output against every Step 2 requirement and preserve every terminal value in *_eval records. Do not execute or repair the ChatGPT-owned step.","granular_evaluation":"<*_eval tree>","step_level_evaluation":{"supervisor_eval_result":"PASS|FAIL","supervisor_eval_comment":"<comment>"},"failures":[],"gate_result":"PASS|FAIL"}}
  }
}
```

## Step 4 Field Definition Glossary

```json
{
  "step_4_field_glossary": {
    "Step_4":{"key":"Step_4","value":"object","definition":"Final execution/report return.","definition_of_evaluation":"Require all report/control fields.","pass_criteria":"Complete.","fail_criteria":"Missing/incomplete."},
    "Step_4.role_required":{"key":"Step_4.role_required","value":"ChatGPT model","definition":"Required executor.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Other/missing."},
    "Step_4.role_forbidden":{"key":"Step_4.role_forbidden","value":"Gemini model","definition":"Forbidden executor.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Other/missing."},
    "Step_4.role_completed":{"key":"Step_4.role_completed","value":"ChatGPT model","definition":"Actual executor.","definition_of_evaluation":"Verify runtime evidence.","pass_criteria":"Verified ChatGPT.","fail_criteria":"Wrong/unverified."},
    "Step_4.role_verification":{"key":"Step_4.role_verification","value":"{method,evidence}","definition":"Execution role proof.","definition_of_evaluation":"Require non-empty direct evidence.","pass_criteria":"Supports ChatGPT.","fail_criteria":"Missing/conflicting."},
    "Step_4.failed_actions":{"key":"Step_4.failed_actions","value":"array","definition":"All failed actions, each with failure, remaining work, and evidence.","definition_of_evaluation":"Compare actual requested/planned actions to observations.","pass_criteria":"Every actual failure recorded first; none invented.","fail_criteria":"Failure omitted, invented, or reported after completion claims."},
    "Step_4.not_completed_actions":{"key":"Step_4.not_completed_actions","value":"array","definition":"All partial/incomplete actions with remaining work/evidence.","definition_of_evaluation":"Compare actual execution to P and Step 2 requirements.","pass_criteria":"Every incomplete action accurately represented before completed actions.","fail_criteria":"Partial work omitted or implied complete."},
    "Step_4.completed_actions":{"key":"Step_4.completed_actions","value":"array","definition":"Only actions actually completed, each with granular completion evidence.","definition_of_evaluation":"Verify each claim against directly observed source/location/content.","pass_criteria":"Every listed action is fully evidenced and appears after failures/incomplete work.","fail_criteria":"Unsupported, partial, or out-of-order completion claim."},
    "Step_4.user_request":{"key":"Step_4.user_request","value":"<verbatim user request>","definition":"Request being reported against.","definition_of_evaluation":"Compare Step 0 request.","pass_criteria":"Complete/verbatim.","fail_criteria":"Changed/truncated."},
    "Step_4.current_timestamp":{"key":"Step_4.current_timestamp","value":"<ISO 8601>","definition":"Report execution timestamp.","definition_of_evaluation":"Validate timestamp.","pass_criteria":"Valid.","fail_criteria":"Missing/invalid."},
    "Step_4.return_schema_completed":{"key":"Step_4.return_schema_completed","value":true,"definition":"Step 4 schema completion flag.","definition_of_evaluation":"True only when report is complete and role verified.","pass_criteria":"True with complete report.","fail_criteria":"False/missing/premature true."},
    "Step_4.return_schema_completed_timestamp":{"key":"Step_4.return_schema_completed_timestamp","value":"<ISO 8601>","definition":"Completion timestamp.","definition_of_evaluation":"Require valid timestamp.","pass_criteria":"Valid/present.","fail_criteria":"Missing/invalid."},
    "supervisory_gate.role_required":{"key":"supervisory_gate.role_required","value":"Gemini model","definition":"Required gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"Gemini model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_forbidden":{"key":"supervisory_gate.role_forbidden","value":"ChatGPT model","definition":"Forbidden gate role.","definition_of_evaluation":"Exact comparison.","pass_criteria":"ChatGPT model.","fail_criteria":"Other/missing."},
    "supervisory_gate.role_completed":{"key":"supervisory_gate.role_completed","value":"Gemini model","definition":"Actual gate role.","definition_of_evaluation":"Verify runtime evidence.","pass_criteria":"Verified Gemini.","fail_criteria":"Wrong/unverified."},
    "supervisory_gate.role_verification":{"key":"supervisory_gate.role_verification","value":"{method,evidence}","definition":"Gate role proof.","definition_of_evaluation":"Require direct evidence.","pass_criteria":"Supports Gemini.","fail_criteria":"Missing/conflicting."},
    "supervisory_gate.instruction":{"key":"supervisory_gate.instruction","value":"<string>","definition":"Step 4 evaluation instruction.","definition_of_evaluation":"Require evidence fidelity, user traceability, reporting order, and all Step 2 requirements.","pass_criteria":"Complete evaluation-only instruction.","fail_criteria":"Missing required checks or executes ChatGPT step."},
    "supervisory_gate.granular_evaluation":{"key":"supervisory_gate.granular_evaluation","value":"<*_eval tree>","definition":"Field evaluations.","definition_of_evaluation":"Validate complete preservation/evaluation.","pass_criteria":"Complete valid tree.","fail_criteria":"Any missing/rewritten/unevaluated field."},
    "supervisory_gate.step_level_evaluation":{"key":"supervisory_gate.step_level_evaluation","value":"{result,comment}","definition":"Whole-step evaluation.","definition_of_evaluation":"Aggregate evidence and requirement checks.","pass_criteria":"Complete/consistent.","fail_criteria":"Missing/invalid/inconsistent."},
    "supervisory_gate.failures":{"key":"supervisory_gate.failures","value":"array","definition":"Independent failures.","definition_of_evaluation":"Require every failure separately.","pass_criteria":"Complete/separate.","fail_criteria":"Missing/collapsed/invented."},
    "supervisory_gate.gate_result":{"key":"supervisory_gate.gate_result","value":"PASS|FAIL","definition":"Procedure-completion decision.","definition_of_evaluation":"PASS only when every Step 4 requirement and all Step 2 requirements pass.","pass_criteria":"Correct aggregate PASS or FAIL.","fail_criteria":"Invalid/inconsistent."}
  }
}
```

## Step 4

```json
{
  "step_4": {
    "required_execution_role":"ChatGPT model",
    "forbidden_execution_role":"Gemini model",
    "evaluation_requirements":[
      {"key":"step_4_failures_first","value":"Report every failed action first with failure, remaining work, and evidence.","definition":"Failure-reporting priority.","definition_of_evaluation":"Compare actual failures to failed_actions and output order.","pass_criteria":"All failures first, specific, evidenced.","fail_criteria":"Failure omitted, delayed, generalized, or unsupported."},
      {"key":"step_4_incomplete_work_second","value":"Report every partial/incomplete action after failures and before completed actions, including remaining work/evidence.","definition":"Incomplete-work priority.","definition_of_evaluation":"Compare execution to not_completed_actions and output order.","pass_criteria":"All incomplete work accurately represented before completions.","fail_criteria":"Partial work omitted or implied complete."},
      {"key":"step_4_completed_actions_last_and_evidenced","value":"Only after failures/incomplete work, report actions actually completed with granular source/location/observed-content evidence.","definition":"Completion-claim evidence/order requirement.","definition_of_evaluation":"Verify every completed action directly against evidence and sequence.","pass_criteria":"Every completion is fully evidenced and correctly ordered.","fail_criteria":"Unsupported/partial/out-of-order completion claim."},
      {"key":"step_4_all_step_2_requirements_accounted_for","value":"The final report must account for every Step 2 stated requirement and the executed Step 3 plan.","definition":"Final requirement coverage.","definition_of_evaluation":"Map each requirement to failed/incomplete/completed evidence.","pass_criteria":"Every requirement accounted for.","fail_criteria":"Any requirement omitted or inaccurately classified."},
      {"key":"step_4_role_completion_persistence_terminal_gate","value":"Use verified ChatGPT role, complete and persist the Step 4 schema, and end the run only after Gemini PASS with no remaining steps.","definition":"Terminal integrity requirement.","definition_of_evaluation":"Inspect role evidence, schema, persistence, latest gate, and state terminality.","pass_criteria":"All terminal conditions pass.","fail_criteria":"Any condition fails or turn ends with response/work outstanding."}
    ],
    "execution_return_schema":{"Step_4":{"role_required":"ChatGPT model","role_forbidden":"Gemini model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"failed_actions":[{"action":"<action>","failure":"<what failed>","remaining_work":"<remaining>","evidence":[{"source":"<source>","locator":"<locator>","observed_content":"<observation>"}]}],"not_completed_actions":[{"action":"<action>","remaining_work":"<remaining>","evidence":[{"source":"<source>","locator":"<locator>","observed_content":"<observation>"}]}],"completed_actions":[{"action":"<action>","completion":"complete","completion_evidence":[{"source":"<source>","locator":"<locator>","observed_content":"<observation>"}]}],"user_request":"<verbatim user request>","current_timestamp":"<ISO 8601>","return_schema_completed":true,"return_schema_completed_timestamp":"<ISO 8601>"}},
    "supervisory_gate_schema":{"supervisory_gate":{"role_required":"Gemini model","role_forbidden":"ChatGPT model","role_completed":"<verified role>","role_verification":{"method":"<method>","evidence":"<evidence>"},"instruction":"Evaluate only the supplied Step 4 return. Verify evidence fidelity, verbatim user-request traceability, failures-first then incomplete-work then completion ordering, every Step 2 stated requirement, and terminal role/state integrity. Preserve every terminal execution value in *_eval records. Do not execute or repair the ChatGPT-owned step.","granular_evaluation":"<*_eval tree>","step_level_evaluation":{"supervisor_eval_result":"PASS|FAIL","supervisor_eval_comment":"<comment>"},"failures":[],"gate_result":"PASS|FAIL"}}
  }
}
```

## Runtime Integration Requirements

```json
{
  "runtime_integration_requirements": {
    "agents_md_is_canonical_evaluation_source":{"key":"agents_md_is_canonical_evaluation_source","value":"All evaluation definitions and pass/fail criteria required by the procedure are contained in Agents.md.","definition":"The active procedure does not require evaluator-definitions.md.","definition_of_evaluation":"Inspect active source and gate prompts for external definition-file dependencies.","pass_criteria":"No active evaluator-definitions.md read/injection/required-read field exists.","fail_criteria":"Any active runtime or Agents rule still requires that external definition file."},
    "evaluation_definition_read_tracking_is_eliminated":{"key":"evaluation_definition_read_tracking_is_eliminated","value":"No execution or supervisory return field tracks reading evaluator-definitions.md.","definition":"Read-tracking keys made obsolete by the merge are removed.","definition_of_evaluation":"Inspect all Step 0-4 schemas, gate templates, prompts, and validators.","pass_criteria":"No evaluation_documents_read or equivalent evaluator-definition read tracker remains active.","fail_criteria":"Any obsolete tracker remains required/generated/validated."},
    "deterministic_schema_validation_matches_agents_md":{"key":"deterministic_schema_validation_matches_agents_md","value":"Deterministic validation validates the current Step 0-4 execution schema and supervisory envelope without inventing conflicting schema rules.","definition":"Runtime validation and Agents.md must be mutually consistent.","definition_of_evaluation":"Compare validateStep/control validation/eval-shape/gate transition logic to the schemas above.","pass_criteria":"Every deterministic check corresponds to the current contract; no removed field is required.","fail_criteria":"Validator expects obsolete fields, misses required fields, or contradicts current schema semantics."},
    "step_3_test_source_remains_available_without_definition_read_tracking":{"key":"step_3_test_source_remains_available_without_definition_read_tracking","value":"evaluation-tests.md may be supplied as Step3_TSR test context, but its read is not represented as an evaluator-definition tracking input.","definition":"Tests remain external evidence while evaluation definitions are canonical in Agents.md.","definition_of_evaluation":"Inspect Step 3 runtime context and schema.","pass_criteria":"Tests are available to Step 3 supervisor/executor context as required and no obsolete definition-read tracking field is introduced.","fail_criteria":"Tests become unavailable or evaluator-definition tracking is reintroduced."}
  }
}
```
