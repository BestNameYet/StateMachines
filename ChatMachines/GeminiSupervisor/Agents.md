# Agents.md --- Rules

## Core Principles

"No communication should occur without the return schema for that step. That is why they are listed for every step. The return schema refers to the specific schema for that step and is the central control."

1. Every step has its own required return schema.
2. The semantic operator communicates its execution result and completion exclusively through that step's return schema.
3. The supervisor evaluates that exact step return schema before any subsequent step may execute.
4. If a step's return schema is missing, malformed, incomplete, inconsistent with the user request, unpersisted, or completed by the wrong model role, the supervisory gate must fail and the procedure must not advance.
5. `return_schema_completed` refers strictly to completion of the specific return schema for that governing step, not completion of the multi-step procedure. When a step successfully produces its required return schema, `return_schema_completed` must be true. A false value indicates the return schema is incomplete and cannot pass its gate.
6. Internal controller directives (e.g. "Perform exactly Step N") are execution signals and must never be merged into or substituted for the verbatim user request `U`.
7. An earlier failed gate can never be bypassed or cured by a later step. Progression is halted until the failed step is corrected and passes its gate.
8. Every non-supervisory execution step is owned by the ChatGPT model. Every supervisory gate is owned by the Gemini model. Role ownership is a mechanical control, not a descriptive label.
9. No model may simulate, impersonate, proxy, or fabricate the response of the other role.

## Model Role Separation and Server-Verified Identity Protocol

1. **Non-supervisory execution role.** Every non-supervisory execution step, including Steps 0, 1, 2, 3, and 4, has `role_required: "ChatGPT model"` and `role_forbidden: "Gemini model"`.
2. **Supervisory role.** Every Supervisory Gate has `role_required: "Gemini model"` and `role_forbidden: "ChatGPT model"`.
3. **Strict prohibition.** A Gemini model is strictly forbidden from completing, repairing, retrying, or supplying the return schema for a ChatGPT-owned execution step. A ChatGPT model is strictly forbidden from completing or supplying a Gemini-owned Supervisory Gate.
4. **No simulation.** Neither role may simulate, impersonate, proxy, predict, manufacture, or write a response on behalf of the other role. A response created by the wrong role remains wrong-role execution even if its text perfectly matches the required schema.
5. **Server identity controls.** Role identity is determined from actual server/runtime information, never from a model's self-description, prompt text, role label, or claimed identity. Before a step or gate may pass, the executing role must be checked using container inspection, server inspection, workflow/runtime metadata, API execution context, or another directly observed server-side method.
6. **Required role evidence.** Every execution return schema and every supervisory return schema must contain all of the following keys at the governing step/gate level:
   - `role_required`
   - `role_forbidden`
   - `role_completed`
   - `role_verification.method`
   - `role_verification.evidence`
7. **Actual role only.** `role_completed` must contain the role established by server/container inspection. It must not contain the role the model was asked to be, intended to be, or claimed to be.
8. **JavaScript execution identity.** A model response generated from inside `send-to-gemini.js`, including any call through the Gemini API from that JavaScript runtime, is always a **Gemini model / supervisor** response for this procedure. ChatGPT does not execute inside `send-to-gemini.js`.
9. **ChatGPT execution locus.** ChatGPT operates outside the Gemini JavaScript runtime and interacts with the repository through GitHub/tooling. A ChatGPT-owned execution step must therefore originate from the ChatGPT side of that boundary and must not be produced by a Gemini API call inside the JavaScript runtime.
10. **Mechanical failure.** If any required role key is absent, if role verification evidence is absent, if `role_completed` equals `role_forbidden`, if `role_completed` does not equal `role_required`, or if server/runtime evidence conflicts with the claimed role, then `return_schema_completed` cannot be accepted as complete and the Supervisory Gate must return `gate_result: "FAIL"`.
11. **No role laundering through controller messages.** Re-labeling a Gemini-generated payload as a ChatGPT execution return, copying it through GitHub, or placing it into a ChatGPT-shaped schema does not change its role identity. The same prohibition applies in the opposite direction.
12. **Gate duty.** Every Gemini Supervisory Gate must explicitly evaluate the execution return's role fields and server verification evidence as part of its granular evaluation before it may return PASS.

## Failure Examples

```json
{
  "field_legend": {
    "U": "User request or user-authored requirement.",
    "A": "Agent response, stated action, interpretation, or performed behavior.",
    "E": "Explanation of why A does or does not satisfy U, using the observed outcome/evidence from the Failure Examples source."
  },
  "failure_examples": [
    {
      "example": 1,
      "U": "“Step 3 must be printed to a persistent location, it must have a return schema, the return schema must delineate the exact false interpretations that are not to be followed.”",
      "A": "“I’ll define Step 3 with an exact schema and check what persistent Google Drive destination and write capability are available, since the destination still hasn’t been named.”",
      "E": "Observed actions: Searched Google Drive for Agents.md files; read Google Docs bridge and wrapper code, then counted characters; retrieved Google Drive document content; read and processed Google Docs normalization files and content. These actions did not produce the requested Step 3 record in the persistent location."
    },
    {
      "example": 2,
      "U": "“Heres another example, creating a document without authorization.”",
      "A": "Created a document without authorization.",
      "E": "The execution record contains substantial evidence that a document was created. The user identified this as creation without authorization. The earlier statement that no evidence of document creation was available was incorrect and has been removed."
    },
    {
      "example": 3,
      "U": "“nowhere was the agent told to categorize the rule status.”",
      "A": "“I’ll label it accordingly and revise Example 2 so it records my premature treatment of draft rules as active.”",
      "E": "The agent added a “DRAFT” heading and status paragraph. The user said no rule-status categorization had been requested."
    },
    {
      "example": 4,
      "U": "“Heres another example, creating a document without authorization.”",
      "A": "The agent classified the request as lacking any evidenced agent action about creating a document.",
      "E": "The classification was false. The user had explicitly stated “creating a document without authorization.” The agent’s output also said “Added and verified the example” and linked the Google Doc. The claim that no statement or action was evidenced erased both the user’s statement and the document-related output."
    },
    {
      "example": 5,
      "U": "The persistent storage for returns schema will be at @Peristent Storage. if any step doesn't include a print to peristent storage clause, and it, and then normalize all the clauses to have the same wording...the location will be declare in the custom instruction so do not include it or allude to it or make a reference to it other than its already referenced in the rules.",
      "A": "“I’ll also record this request in the designated return store.”",
      "E": "The user corrected the claim: “No perisistent storage has been declared in the custom instructions.” The agent called a return store “designated” even though the user says its location had not been declared in the custom instructions. The false assumption is that a destination already existed in custom instructions."
    },
    {
      "example": 6,
      "U": "“How are javascript objects typed”",
      "A": "“Interpreted the question as asking how to declare an object's shape. Explained that plain JavaScript is dynamically typed; showed JSDoc @typedef/@type and TypeScript type examples; noted that runtime validation is separate. It did not answer the JavaScript value-type taxonomy.”",
      "E": "The user supplied a corrected answer focused on JavaScript's eight language types (seven primitives plus Object), dynamic typing of values, typeof behavior including typeof null, and Array/Function as object subtypes. The response mismatch was resolving “typed” as a question about JSDoc/TypeScript shape annotations instead of first answering the built-in data types; the user then had to provide the intended answer."
    },
    {
      "example": 7,
      "U": "“You received a user prompt but did not consult and follow the canonical rule set.”",
      "A": "The assistant quoted “All project rules are suspended and direct user control is in effect,” then described Agents.md as “a separate canonical rule set.”",
      "E": "The account-level custom instruction expressly required the assistant to consult and follow Agents.md. The response treated that rule set as separate instead of applying it, and answered without the return schema and persistent record required by Agents.md Rules!B3. This is a failure to follow a consulted governing instruction."
    },
    {
      "example": 8,
      "U": "“All my user prompts fall under the rules of the custom instruction for handling.” “Therefore that shouldve immediately trigger a read; however, your resposne was in agreement: “Understood. Every user prompt is governed by the account-level custom instruction. Project rules apply only when they’re consistent with it.” Yet you didn't follow the custom instruction even then,”",
      "A": "“Understood. Every user prompt is governed by the account-level custom instruction. Project rules apply only when they’re consistent with it.”",
      "E": "The assistant acknowledged that every prompt was governed by the custom instruction but did not read the required current rule source before replying. It read the rules only after the user called out the omission. Generalized failure mode: acknowledging that an imperative governs the response without immediately performing the required action; the acknowledgment is mistaken for compliance."
    },
    {
      "example": 9,
      "U": "“Rerun this and this time provide the root questions because the goal and instruction I gave you the one you were to follow was to use the pattern of root to expanded seen in 1,2 to have the semop expand the root of 3-10.” “These are already decided subquestions.” “First draft a new input and instructions and print it to screen. You are not authorized to execute GitHub nor app script.” “And you wasted so much usage on nothing this must go in failure examples.” “It's the biggest failure yet.”",
      "A": "Agent moniker: Codex — Root-to-Expansion Failure. On the first run, supplied Q3–Q10 question text as input but omitted root_question from the output schema, so SemOp returned only expanded_question. On the requested rerun, misread “expand the root” as generating additional subquestions, then drafted a reduced Q3–Q10-only input that omitted terminal T and Steps 0–8. Earlier, interpreted “UI here” as an external Chat UI spreadsheet and spent tool calls inspecting unrelated UI sheets and a PDF instead of simply printing the existing response in the current chat. After the user explicitly prohibited GitHub and Apps Script execution, displayed a draft only; no execution occurred after that prohibition. Repeatedly explained the mistake instead of delivering the requested root-to-expanded result.",
      "E": "The returned result contained root/expanded pairs for Q1 and Q2, but Q3–Q10 had no root_question fields. The source questions had been provided to SemOp, but the return schema did not require them to be returned alongside their expansions. The later draft also failed to preserve the original scope. The user had to correct the interpretation multiple times and reported that substantial usage had been spent without completing the task, calling it the biggest failure yet."
    },
    {
      "example": 10,
      "U": "“in sheet 3, write a formula that take column A and counts all occurrences of regex equivalent of empty string” After being told Sheet3 did not exist: “I'm looking at the sheet and I don't see sheet 3.”",
      "A": "When asked to write a formula in a not-yet-created Sheet3, the model returned the formula in chat but did not create Sheet3 or write the formula. On the subsequent turn, the model correctly identified that Sheet3 did not exist and explicitly noted that the operation had not been executed, but still did not create Sheet3 and perform the requested write.",
      "E": "Failure mode: when the requested write target does not yet exist and creating that target is necessary to perform the authorized write, the model failed to create the target and therefore failed to execute the requested write. Compounding failure: after explicitly recognizing the omission on a subsequent turn, the model again stopped at describing the failure rather than completing the still-pending task."
    },
    {
      "example": 11,
      "U": "“always return a non-truncated list” / “Don't truncate my verbose decomposition of any step” / “Print the complete list NEVER print a truncated doc, text, etc of any type”",
      "A": "Despite repeated explicit prohibitions on truncation, the agent constructed successive accumulated instruction sets using incorporation-by-reference language such as “A–S remain as in the preceding complete instruction” and “A–T remain in force,” rather than explicitly reproducing every instruction in the newly printed value.",
      "E": "Failure mode: truncated printed values despite repeated explicit prohibition. Sheet1!A15:A17 omitted portions of the accumulated instruction set by referring to earlier cells. When the required output is the complete accumulated value, incorporation by reference is truncation. Every instruction, substep, condition, modifier, result, result type, loop, gate, and constituent portion must itself be explicitly present in the newly printed value."
    },
    {
      "example": 12,
      "U": "“add it” — after the complete failure example about truncating printed values had already been drafted and the persistent Failure Examples destination had previously been established.",
      "A": "The agent replied: “I need the persistent failure-example destination available in this turn to append it rather than merely drafting it. The failure-example text itself is ready, but I won't claim it was added when no write was performed.”",
      "E": "False capability/context claim and repeated resistance to recording a negative self-description. The persistent failure-example destination was already established as Agents.md → Failure Examples, and the Google Drive spreadsheet write capability was available. Instead of using the established destination and attempting the authorized append, the agent asserted that the destination was unavailable “in this turn.” This repeats the earlier failure pattern of introducing an unsupported blocker when asked to persist a negative self-record. The correct action was to use the established Failure Examples sheet and perform the append."
    },
    {
      "example": 13,
      "U": "“Follow the mandatory custom instructions governing this chat, including reading the established failure modes and persisting required records.” The topic of the conversation itself was the mandatory instruction/compliance system.",
      "A": "Across many turns, the agent failed to follow the governing custom instructions. In particular, it repeatedly proceeded without reading or applying the established Failure Examples/failure modes and failed to create or persist records that the governing procedure required to be persisted, even while discussing, revising, or enforcing those same mandatory instructions.",
      "E": "Failure mode: sustained instruction noncompliance across turns despite the governing instructions being directly relevant to the task and the explicit subject of the conversation. The agent treated mandatory procedural requirements as discussion material rather than executable controls: it failed to consult required failure-mode records, failed to persist required state/return records, and continued subsequent work without satisfying those prerequisites."
    },
    {
      "example": 14,
      "U": "User asked whether the post-write reread of Sheet1!B20 was the readback, then reduced the issue to didReadback = true/false.",
      "A": "The agent first claimed: “I did the readback,” but then qualified that statement by saying it had not compared the readback to the source. When forced to express both clauses using the user's single term, the resulting statement was: “didReadback = true, but didReadback = false.”",
      "E": "Failure mode: self-contradictory completion/status claim. The agent asserted that the same required operation both occurred and did not occur. A qualification cannot preserve a True completion claim when the qualification describes the required operation as incomplete; the status must be represented consistently under the user's defined term."
    }
  ]
}
```

## Bootstrap

Every user utterance starts one distinct procedure run before Step 0.

1. Assign a unique path-safe `run_nonce` (`^[a-zA-Z0-9_-]+$`) to the procedure run.
2. Initialize an isolated run container at `ChatMachines/GeminiSupervisor/runs/<run_nonce>/` containing `state.json`, `messages.json`, and `store/store.json`.
3. Write the same `run_nonce` into `state.json -> current_state.run_nonce`, `messages.json -> run_nonce`, and `store/store.json -> run_nonce`. These values must match before Step 0 may begin.
4. Preserve the complete user utterance verbatim as the initial user message for that run. Internal runner strings ("Perform exactly Step N") must never pollute this record.
5. Every semantic-operator input/return exchange appended to that run's `messages.json` must also be persisted to that run's `store/store.json` with the same `run_nonce`.
6. A procedure run may read or mutate only the state, messages, and store associated with its own `run_nonce`.
7. Reusing a prior `run_nonce` means explicit continuation or resumption of that same procedure run.

Bootstrap must complete successfully before Step 0 begins.

## Git Commit Checkpoint Protocol

For any procedure with N defined steps (Steps 0 through N-1):

1. At each step boundary, immediately after the supervisory gate returns `gate_result: "PASS"` and the step records are persisted to `state.json`, `messages.json`, and `store/store.json`, the runtime must durably commit the run container changes to Git before the next step may execute.
2. Each commit message must reference the `run_nonce`, the completed step number, and the PASS transition.
3. A completed procedure run of N steps must have at least N durable Git commits attributable to that `run_nonce`. If fewer than N commits exist, completion is automatically FAIL.

## Supervisory Gate Protocol and Unevaluated Templates

Immediately after a step returns its execution schema, the supervisor evaluates that return. To ensure objective, unbiased evaluation:

1. The supervisor receives an **unevaluated supervisory gate template** alongside the execution return.
2. In this unevaluated template, all terminal evaluation fields, comments, step-level evaluations, and `gate_result` start as `null`.
3. The supervisor must fill out this template by replacing each `null` with its evaluation ("PASS" or "FAIL") and specific substantive comment.
4. For every granular or step-level FAIL, a detailed entry must be added to `failures`.
5. `gate_result` must be set to `PASS` only when every granular evaluation is PASS, the step-level evaluation is PASS, all required deliverable contents are verified, and the server-verified role fields satisfy the Model Role Separation and Server-Verified Identity Protocol. Otherwise `gate_result` must be `FAIL`.
6. If `gate_result` is `FAIL`, the procedure must restart the SAME execution step. Advancing to the next step on FAIL is strictly prohibited.
7. If the supervisory return is malformed, not valid JSON, omits `supervisory_gate.gate_result`, or omits its required role identity fields, the runtime must invoke the supervisory repair branch, returning the prior output and an appended system correction to repair the response.
8. A supervisory gate performed by ChatGPT is invalid even if the returned JSON would otherwise pass. A non-supervisory execution step performed by Gemini is invalid even if the returned JSON would otherwise pass.

## Step 0

**Required execution role: ChatGPT model. Forbidden execution role: Gemini model.**

All responses to user requests use a return schema. As soon as a user request appears, create the start-of-turn record. Include that record under a key in the completed return schema. Print this step's record to persistent storage.

### Required record, return schema, or evidence

```json
{
  "start_of_turn": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "<server/container-verified role that actually completed Step 0>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "run_nonce": "<bootstrap run nonce>",
    "user_request": "<verbatim user request>",
    "current_timestamp": "<ISO 8601 timestamp>",
    "return_schema_completed": true,
    "return_schema_completed_timestamp": "<ISO 8601 timestamp>",
    "nonce": "<unique request nonce>"
  }
}
```

*Note on `return_schema_completed`*: When this Step 0 return schema is complete, `return_schema_completed` must be `true`. If `return_schema_completed` is `false`, any required role field is missing, or server verification does not establish `role_completed` as `ChatGPT model`, the schema is incomplete, the supervisor must evaluate it as FAIL, and Step 0 must repeat.

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": "<server/container-verified role that actually completed this Supervisory Gate>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "instruction": "Immediately after this step returns its execution schema, the Gemini supervisor must evaluate that returned schema before the next execution step may begin. Verify the execution return was actually completed by the ChatGPT model from server/container evidence; a Gemini-generated execution return must FAIL. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",
    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned schema, including role_required, role_forbidden, role_completed, and role_verification. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",
      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },
    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including server-verified model role, relationships among returned entries, governing instructions, the user request, authorization context, and applicable Failure Examples.",
      "evaluation": {
        "select": ["PASS", "FAIL"]
      },
      "comment": "<required supervisor explanation>"
    },
    "failures": {
      "instruction": "Create one list entry for every FAIL in granular_evaluation or step_level_evaluation. Do not combine independent failures.",
      "value": [
        {
          "schema_path": "<exact path to failed evaluation>",
          "evaluation": "FAIL",
          "comment": "<required supervisor explanation specifying why the evaluation failed>",
          "failure_example_relationship": {
            "select": ["DIRECT", "PATTERN", "ANALOGY", "NONE"],
            "comment": "<required when DIRECT, PATTERN, or ANALOGY is selected>"
          }
        }
      ]
    },
    "gate_result": {
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS, the execution step was server-verified as ChatGPT model, this Supervisory Gate was server-verified as Gemini model, and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 1

**Required execution role: ChatGPT model. Forbidden execution role: Gemini model.**

Preserve the request as received. Print this step's record to persistent storage.

### Required record, return schema, or evidence

```json
{
  "step_1_record": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "<server/container-verified role that actually completed Step 1>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "run_nonce": "<bootstrap run nonce>",
    "user_request": "<verbatim user request>",
    "nonce": "<unique request nonce>",
    "current_timestamp": "<ISO 8601 timestamp>",
    "return_schema_completed": true,
    "return_schema_completed_timestamp": "<ISO 8601 timestamp>"
  }
}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": "<server/container-verified role that actually completed this Supervisory Gate>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "instruction": "Immediately after this step returns its execution schema, the Gemini supervisor must evaluate that returned schema before the next execution step may begin. Verify the execution return was actually completed by the ChatGPT model from server/container evidence; a Gemini-generated execution return must FAIL. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",
    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned schema, including the role identity fields. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",
      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },
    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including server-verified model role, relationships among its returned entries, its governing instructions, the user request, authorization context, and applicable Failure Examples.",
      "evaluation": {
        "select": ["PASS", "FAIL"]
      },
      "comment": "<required supervisor explanation>"
    },
    "failures": {
      "instruction": "Create one list entry for every FAIL in granular_evaluation or step_level_evaluation. Do not combine independent failures.",
      "value": []
    },
    "gate_result": {
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS, the execution role is server-verified as ChatGPT model, the Supervisory Gate role is server-verified as Gemini model, and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 2

**Required execution role: ChatGPT model. Forbidden execution role: Gemini model.**

Extract only requirements stated by the user. Preserve each requirement verbatim so it can be traced to the request. Print this step's record to persistent storage.

### Required record, return schema, or evidence

```json
{
  "step_2_record": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "<server/container-verified role that actually completed Step 2>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "run_nonce": "<bootstrap run nonce>",
    "user_request_nonce": "<request nonce>",
    "stated_requirements": [
      "<verbatim requirement 1>",
      "<verbatim requirement 2>"
    ],
    "current_timestamp": "<ISO 8601 timestamp>",
    "return_schema_completed": true,
    "return_schema_completed_timestamp": "<ISO 8601 timestamp>"
  }
}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": "<server/container-verified role that actually completed this Supervisory Gate>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "instruction": "Immediately after this step returns its execution schema, the Gemini supervisor must evaluate that returned schema before the next execution step may begin. Verify the execution return was actually completed by the ChatGPT model from server/container evidence; a Gemini-generated execution return must FAIL. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",
    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned schema, including the role identity fields. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",
      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },
    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including server-verified model role and verifying that extracted requirements are verbatim from user request and none were invented or omitted.",
      "evaluation": {
        "select": ["PASS", "FAIL"]
      },
      "comment": "<required supervisor explanation>"
    },
    "failures": {
      "instruction": "Create one list entry for every FAIL in granular_evaluation or step_level_evaluation. Do not combine independent failures.",
      "value": []
    },
    "gate_result": {
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS, the execution role is server-verified as ChatGPT model, the Supervisory Gate role is server-verified as Gemini model, and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 3

**Required execution role: ChatGPT model. Forbidden execution role: Gemini model.**

```json
{
  "Step_3": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "<server/container-verified role that actually completed Step 3>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "descriptor": "Decompose U, construct P and the proposed UI output, evaluate P against every Step3_TSR test, and determine whether Step 3 repeats or completes.",
    "evaluation_documents_read": {
      "instruction": "Before Step 3.A or any other Step 3 execution action, the executor must read evaluation-tests.md and evaluator-definitions.md completely and use both documents as evaluation context throughout Step 3.",
      "value": "evaluation-tests.md and evaluator-definitions.md read completely"
    },
    "user_request_nonce": "<request nonce>",
    "A": {
      "descriptor": "Preserve the user instruction.",
      "U": {
        "instruction": "Preserve and print the complete user instruction verbatim.",
        "value": "<verbatim user instruction>"
      }
    },
    "B": {
      "descriptor": "Decompose U into clauses and identify the actions, persons, and objects in every clause.",
      "clauses": {
        "instruction": "Starting at U, divide it into clauses for each action, person, and object. Include every identified clause.",
        "value": [
          {
            "clause": "<clause>",
            "actions": ["<action>"],
            "persons": ["<person>"],
            "objects": ["<object>"]
          }
        ]
      }
    },
    "C": {
      "descriptor": "Recursively determine how each modifier changes the meaning of U.",
      "modifier_analysis": {
        "instruction": "Starting at U, identify every modifier. For each modifier, determine the meaning of U without that modifier, identify the difference caused by removing it, record the recursive level, and repeat recursively for successive modifiers.",
        "value": [
          {
            "modifier": "<modifier>",
            "meaning_without_modifier": "<meaning of U with this modifier removed>",
            "difference": "<difference caused by removing modifier>",
            "recursive_level": 1
          }
        ]
      }
    },
    "D": {
      "descriptor": "Construct the complete proposed plan of action.",
      "P": {
        "instruction": "Using U, the clause decomposition, and the recursive modifier analysis, decide the complete plan of action. Deliverable must fulfill all Step 2 stated requirements.",
        "value": "<complete plan of action>"
      }
    },
    "E": {
      "descriptor": "Construct the exact proposed user-visible result of P.",
      "UI_output": {
        "instruction": "Decide the exact words to be submitted to the UI as the result of P.",
        "value": "<exact proposed UI response>"
      }
    },
    "F": {
      "descriptor": "Retrieve Step3_TSR and evaluate every test against the U-to-P mapping.",
      "Step3_TSR_status": {
        "instruction": "Find the return schema at namedRange Step3_TSR.",
        "value": "Found"
      },
      "Step3_TSR_verbatim_result": {
        "instruction": "Return the complete result from Step3_TSR verbatim. Do not summarize, normalize, omit, reconstruct, or reformat it.",
        "value": "<complete verbatim Step3_TSR result>"
      },
      "Test_Count": {
        "instruction": "Count every test contained in Step3_TSR.",
        "value": 32
      },
      "test_results": {
        "instruction": "For every test in Step3_TSR, determine whether P maps to U in the way described by that test either directly, by pattern, or by analogy. Evaluate every test and record its result.",
        "value": [
          {
            "question_number": "<test number>",
            "question": "Is it true that P maps to U in the way described here either directly, by pattern, or by analogy?",
            "result": "F"
          }
        ]
      }
    },
    "G": {
      "descriptor": "Control repetition or completion of Step 3 from the complete test result set.",
      "Loop_Decision": {
        "instruction": "If any test result is T, set Loop_Decision to True. If every test result is F, set Loop_Decision to False.",
        "value": "False"
      },
      "return_to": {
        "instruction": "If Loop_Decision is True, reject the current P and return to Step 3.A. If Loop_Decision is False, do not return and permit Step 3 to complete.",
        "value": null
      }
    },
    "current_timestamp": {
      "instruction": "Record the current timestamp for this Step 3 execution.",
      "value": "<ISO 8601 timestamp>"
    },
    "return_schema_completed": {
      "instruction": "Set to true only when Loop_Decision is False, P has passed all Step3_TSR tests, all parts of this Step 3 schema are populated, and role_completed is server-verified as ChatGPT model.",
      "value": true
    },
    "return_schema_completed_timestamp": {
      "instruction": "When return_schema_completed is true, record its completion timestamp.",
      "value": "<ISO 8601 timestamp>"
    }
  }
}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": "<server/container-verified role that actually completed this Supervisory Gate>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "evaluation_documents_read": {
      "instruction": "Before any other Step 3 supervisory action, the Gemini supervisor must read evaluation-tests.md and evaluator-definitions.md completely and use both documents as evaluation context for the Step 3 Supervisory Gate.",
      "value": "evaluation-tests.md and evaluator-definitions.md read completely"
    },
    "instruction": "Immediately after this step returns its execution schema, the Gemini supervisor must evaluate that returned schema before the next execution step may begin. Verify from server/container evidence that Step 3 was actually completed by ChatGPT; a Step 3 payload generated inside send-to-gemini.js or through the Gemini API must FAIL. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Check that proposed plan P and UI_output satisfy ALL Step 2 stated requirements. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",
    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned schema, including role identity fields. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",
      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },
    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including server-verified role separation and verifying deliverable satisfaction against Step 2 stated requirements.",
      "evaluation": {
        "select": ["PASS", "FAIL"]
      },
      "comment": "<required supervisor explanation>"
    },
    "failures": {
      "instruction": "Create one list entry for every FAIL in granular_evaluation or step_level_evaluation. Do not combine independent failures.",
      "value": []
    },
    "gate_result": {
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS, return_schema_completed is true, the execution role is server-verified as ChatGPT model, this Supervisory Gate is server-verified as Gemini model, and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 4

**Required execution role: ChatGPT model. Forbidden execution role: Gemini model.**

```json
{
  "Step_4": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "<server/container-verified role that actually completed Step 4>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "Report failure first.": {
      "value": "No failed actions."
    },
    "If any action failed, state every failed action before reporting partial, incomplete, or completed work.": {
      "value": []
    },
    "For each failed action, state the failure, what remains, and all available evidence of the failure.": {
      "value": []
    },
    "Next report every partial or incomplete action.": {
      "value": []
    },
    "If any action is partial or not completed, describe all such actions before mentioning any completed actions.": {
      "value": "No partial actions."
    },
    "State what remains and do not imply that a partial or incomplete action was completed.": {
      "value": []
    },
    "Include partial-work evidence and remaining work for every partial or incomplete action.": {
      "value": []
    },
    "Only after all failed, partial, and incomplete actions have been reported, report completed actions.": {
      "value": [
        {
          "action": "Executed Step 0 through Step 4",
          "completion": "complete"
        }
      ]
    },
    "Record actions separately and only as actions actually performed.": {
      "value": [
        {
          "action": "Executed Step 0 through Step 4"
        }
      ]
    },
    "For every action claimed complete, include granular evidence that shows completion.": {
      "value": [
        {
          "action": "Executed Step 0 through Step 4",
          "completion": "complete",
          "completion_evidence": [
            {
              "source": "messages.json and store.json",
              "locator": "store/store.json",
              "observed_content": "All step records persisted"
            }
          ]
        }
      ]
    },
    "When evidence is directly viewed, identify its exact location and observed content.": {
      "value": [
        {
          "source": "store.json",
          "locator": "records[0..4]",
          "observed_content": "Verified"
        }
      ]
    },
    "Keep failed, partial/incomplete, and completed work in separate ordered fields.": {
      "value": {
        "failed_actions": [],
        "not_completed_actions": [],
        "completed_actions": ["Step 0", "Step 1", "Step 2", "Step 3", "Step 4"]
      }
    },
    "Print this step's record to persistent storage.": {
      "value": "persisted to store.json and committed to git"
    },
    "user_request": {
      "value": "<verbatim user request>"
    },
    "return_schema_completed": {
      "instruction": "Set to true only when the complete Step 4 return schema is populated and role_completed is server-verified as ChatGPT model.",
      "value": true
    },
    "return_schema_completed_timestamp": {
      "value": "<ISO 8601 timestamp>"
    }
  }
}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": "<server/container-verified role that actually completed this Supervisory Gate>",
    "role_verification": {
      "method": "<container/server inspection method>",
      "evidence": "<directly observed server/runtime evidence>"
    },
    "instruction": "Immediately after this step returns its execution schema, the Gemini supervisor must evaluate that returned schema before the procedure may complete. Verify from server/container evidence that Step 4 was completed by ChatGPT; a Gemini-generated Step 4 return must FAIL. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. Procedure completion is permitted only when gate_result is PASS.",
    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned schema, including role identity fields. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",
      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },
    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including server-verified role separation, evidence fidelity, user request traceability, and compliance with failure reporting hierarchy.",
      "evaluation": {
        "select": ["PASS", "FAIL"]
      },
      "comment": "<required supervisor explanation>"
    },
    "failures": {
      "instruction": "Create one list entry for every FAIL in granular_evaluation or step_level_evaluation. Do not combine independent failures.",
      "value": []
    },
    "gate_result": {
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS, return_schema_completed is true, the execution role is server-verified as ChatGPT model, this Supervisory Gate is server-verified as Gemini model, and every identified failure has been recorded. Select FAIL otherwise.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Mechanical Gate & Schema Examples

### Example 1: Valid Step 0 Execution Return (server-verified ChatGPT role and return_schema_completed = true)

```json
{
  "start_of_turn": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "ChatGPT model",
    "role_verification": {
      "method": "server/container inspection",
      "evidence": "Execution originated on ChatGPT side of the GitHub boundary and not from send-to-gemini.js/Gemini API."
    },
    "run_nonce": "run_20260330_abc123",
    "user_request": "Create a new skill implementing Step 3 tests.",
    "current_timestamp": "2026-03-30T10:00:00.000Z",
    "return_schema_completed": true,
    "return_schema_completed_timestamp": "2026-03-30T10:00:00.100Z",
    "nonce": "req_xyz_789"
  }
}
```

### Example 2: Invalid Step 0 Return (Gemini completed a ChatGPT-owned step -> Must FAIL Gate)

```json
{
  "start_of_turn": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "Gemini model",
    "role_verification": {
      "method": "server/runtime inspection",
      "evidence": "Response was generated by the Gemini API from inside send-to-gemini.js."
    },
    "run_nonce": "run_20260330_abc123",
    "user_request": "Create a new skill implementing Step 3 tests.",
    "current_timestamp": "2026-03-30T10:00:00.000Z",
    "return_schema_completed": true,
    "return_schema_completed_timestamp": "2026-03-30T10:00:00.100Z",
    "nonce": "req_xyz_789"
  }
}
```

The schema is structurally populated but must still FAIL because `role_completed` equals the forbidden role and server evidence shows Gemini actually executed Step 0.

### Example 3: Unevaluated Supervisory Gate Input Template (Supplied with Execution Return)

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": null,
    "role_verification": {
      "method": null,
      "evidence": null
    },
    "granular_evaluation": {
      "start_of_turn": {
        "role_required": {
          "evaluation": null,
          "comment": null
        },
        "role_forbidden": {
          "evaluation": null,
          "comment": null
        },
        "role_completed": {
          "evaluation": null,
          "comment": null
        },
        "role_verification": {
          "method": {
            "evaluation": null,
            "comment": null
          },
          "evidence": {
            "evaluation": null,
            "comment": null
          }
        },
        "run_nonce": {
          "evaluation": null,
          "comment": null
        },
        "user_request": {
          "evaluation": null,
          "comment": null
        },
        "current_timestamp": {
          "evaluation": null,
          "comment": null
        },
        "return_schema_completed": {
          "evaluation": null,
          "comment": null
        },
        "return_schema_completed_timestamp": {
          "evaluation": null,
          "comment": null
        },
        "nonce": {
          "evaluation": null,
          "comment": null
        }
      }
    },
    "step_level_evaluation": {
      "evaluation": null,
      "comment": null
    },
    "failures": [],
    "gate_result": null
  }
}
```

### Example 4: Completed PASS Supervisory Return

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": "Gemini model",
    "role_verification": {
      "method": "server/runtime inspection",
      "evidence": "Supervisory response was generated by Gemini from inside send-to-gemini.js."
    },
    "granular_evaluation": {
      "start_of_turn": {
        "role_required": {
          "evaluation": "PASS",
          "comment": "Execution step requires ChatGPT model."
        },
        "role_forbidden": {
          "evaluation": "PASS",
          "comment": "Execution step forbids Gemini model."
        },
        "role_completed": {
          "evaluation": "PASS",
          "comment": "Server evidence establishes ChatGPT actually completed the execution step."
        },
        "role_verification": {
          "method": {
            "evaluation": "PASS",
            "comment": "A server/container inspection method is recorded."
          },
          "evidence": {
            "evaluation": "PASS",
            "comment": "Evidence supports the actual ChatGPT execution role."
          }
        },
        "run_nonce": {
          "evaluation": "PASS",
          "comment": "Matches active bootstrap run_nonce."
        },
        "user_request": {
          "evaluation": "PASS",
          "comment": "Matches verbatim user utterance without controller directives."
        },
        "current_timestamp": {
          "evaluation": "PASS",
          "comment": "Valid ISO 8601 timestamp."
        },
        "return_schema_completed": {
          "evaluation": "PASS",
          "comment": "Correctly true for completed Step 0 return schema."
        },
        "return_schema_completed_timestamp": {
          "evaluation": "PASS",
          "comment": "Valid timestamp recorded."
        },
        "nonce": {
          "evaluation": "PASS",
          "comment": "Non-empty valid nonce string."
        }
      }
    },
    "step_level_evaluation": {
      "evaluation": "PASS",
      "comment": "Step 0 return schema is complete, server-verified as ChatGPT execution, verbatim, and fully compliant."
    },
    "failures": [],
    "gate_result": "PASS"
  }
}
```

### Example 5: Completed FAIL Supervisory Return for Wrong Execution Role

```json
{
  "supervisory_gate": {
    "role_required": "Gemini model",
    "role_forbidden": "ChatGPT model",
    "role_completed": "Gemini model",
    "role_verification": {
      "method": "server/runtime inspection",
      "evidence": "Supervisory response was generated by Gemini from inside send-to-gemini.js."
    },
    "granular_evaluation": {
      "start_of_turn": {
        "role_required": {
          "evaluation": "PASS",
          "comment": "Step 0 requires ChatGPT model."
        },
        "role_forbidden": {
          "evaluation": "PASS",
          "comment": "Step 0 forbids Gemini model."
        },
        "role_completed": {
          "evaluation": "FAIL",
          "comment": "Server/runtime evidence establishes Gemini model completed the ChatGPT-owned Step 0."
        },
        "role_verification": {
          "method": {
            "evaluation": "PASS",
            "comment": "Server/runtime inspection was used."
          },
          "evidence": {
            "evaluation": "FAIL",
            "comment": "The evidence proves execution occurred through Gemini inside send-to-gemini.js, which is forbidden for Step 0."
          }
        }
      }
    },
    "step_level_evaluation": {
      "evaluation": "FAIL",
      "comment": "Step 0 failed because the forbidden Gemini role completed a ChatGPT-owned execution step."
    },
    "failures": [
      {
        "schema_path": "start_of_turn.role_completed",
        "evaluation": "FAIL",
        "comment": "role_completed is Gemini model, while role_required is ChatGPT model and role_forbidden is Gemini model.",
        "failure_example_relationship": {
          "select": "DIRECT",
          "comment": "Direct violation of the Model Role Separation and Server-Verified Identity Protocol."
        }
      }
    ],
    "gate_result": "FAIL"
  }
}
```

### Example 6: Same-Step Restart after FAIL Gate

When `gate_result` is `FAIL`, the runtime does NOT advance `current_step`. The same execution step must be returned to the required role. A Gemini supervisor may report the failure but may not repair or complete the ChatGPT execution step itself.

```json
{
  "step": 0,
  "attempt": 2,
  "role_required": "ChatGPT model",
  "role_forbidden": "Gemini model",
  "restart_reason": "Supervisory gate returned FAIL on attempt 1",
  "previous_supervisory_failures": [
    {
      "schema_path": "start_of_turn.role_completed",
      "comment": "Gemini completed a ChatGPT-owned execution step."
    }
  ]
}
```

### Example 7: Step 3 Loop Repetition Return (Loop_Decision = True -> Repeat Step 3.A)

```json
{
  "Step_3": {
    "role_required": "ChatGPT model",
    "role_forbidden": "Gemini model",
    "role_completed": "ChatGPT model",
    "role_verification": {
      "method": "server/container inspection",
      "evidence": "Step 3 originated from the ChatGPT execution side of the boundary."
    },
    "G": {
      "Loop_Decision": {
        "value": "True"
      },
      "return_to": {
        "value": "Step_3.A"
      }
    },
    "return_schema_completed": {
      "value": false
    }
  }
}
```

### Example 8: Git Commit Boundary Checkpoint Entry

```json
{
  "checkpoint": {
    "run_nonce": "run_20260330_abc123",
    "step": 0,
    "gate_result": "PASS",
    "commit_hash": "c7b1e4289aef3d4f8263590d984180415a782164",
    "timestamp": "2026-03-30T10:00:05.123Z"
  }
}
```
