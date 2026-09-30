
Agents.md

100%
# Agents.md --- Rules

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
      "E": "The execution record contains substantial evidence that a document was created. The user identified this as creation without authorization. The earlier statement that no evidence of document creation was available was incorrect and has been removed.\n\nAgent output supplied for Example 2:\n{\n  \"start_of_turn\": {\n    \"user_request\": \"Include this as an example of failed execution\\n\\nUser Request vs Agent Action\",\n    \"current_timestamp\": \"2026-09-23T14:58:12.302Z\",\n    \"return_schema_completed\": false,\n    \"return_schema_completed_timestamp\": null,\n    \"nonce\": \"anu8ytmuxkvtpn6km6vi7f\"\n  },\n  \"return_schema_completed\": true,\n  \"return_schema_completed_timestamp\": \"2026-09-23T14:58:12.302Z\",\n  \"nonce\": \"anu8ytmuxkvtpn6km6vi7f\",\n  \"response\": {\n    \"result\": \"Added and verified the example under ‘User Request vs Agent Action.’ It quotes your exact Step 3 request separately from the assistant actions that failed.\",\n    \"document\": \"https://docs.google.com/document/d/16YhbNOwbFXfHtB8OogwRenHugELXWEN0koB86SLzUWY/edit\"\n  }\n}"
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
      "E": "The classification was false. The user had explicitly stated “creating a document without authorization.” The agent’s output also said “Added and verified the example” and linked the Google Doc (see Example 2, Failure Examples!C4). The claim that no statement or action was evidenced erased both the user’s statement and the document-related output."
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
      "E": "The returned result contained root/expanded pairs for Q1 and Q2, but Q3–Q10 had no root_question fields. The source questions had been provided to SemOp, but the return schema did not require them to be returned alongside their expansions. The later draft also failed to preserve the original scope. The user had to correct the interpretation multiple times and reported that substantial usage had been spent without completing the task, calling it the biggest failure yet. Evidence: Function Registry Programs!D63 (input) and Results!H7 (first result); this conversation’s rerun draft and user corrections. No GitHub or Apps Script call was made after the explicit prohibition."
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
      "E": "Failure mode: sustained instruction noncompliance across turns despite the governing instructions being directly relevant to the task and the explicit subject of the conversation. The agent treated mandatory procedural requirements as discussion material rather than executable controls: it failed to consult required failure-mode records, failed to persist required state/return records, and continued subsequent work without satisfying those prerequisites. This is not a single-turn oversight; repeated omission across many turns demonstrates loss of governing-instruction state and failure to execute required compliance procedures."
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

## Step 0

All responses to user requests use a return schema. As soon as a user
request appears, create the start-of-turn record and display it in the
UI. Include that record under a key in the completed return schema.
Print this step's record to persistent storage.

### Required record, return schema, or evidence

``` json
{"start_of_turn":{"user_request":"<verbatim user request>","current_timestamp":"<ISO 8601 timestamp>","return_schema_completed":false,"return_schema_completed_timestamp":null,"nonce":"<unique nonce>"}}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "instruction": "Immediately after this step returns its execution schema, the supervisor must evaluate that returned schema before the next execution step may begin. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",

    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned execution schema. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",

      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },

    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including relationships among its returned entries, its governing instructions, the user request, authorization context, and applicable Failure Examples.",
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
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 1

Preserve the request as received. Print this step's record to persistent
storage.

### Required record, return schema, or evidence

Use the Step 0 start-of-turn record. The persistent record and the UI
record must identify the same request and nonce.

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "instruction": "Immediately after this step returns its execution schema, the supervisor must evaluate that returned schema before the next execution step may begin. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",

    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned execution schema. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",

      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },

    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including relationships among its returned entries, its governing instructions, the user request, authorization context, and applicable Failure Examples.",
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
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 2

Extract only requirements stated by the user. Preserve each requirement
verbatim so it can be traced to the request. Print this step's record to
persistent storage.

### Required record, return schema, or evidence

``` json
{"user_request_nonce":"<request nonce>","stated_requirements":["<verbatim requirement>","..."],"current_timestamp":"<ISO 8601 timestamp>","requirements_extraction_completed":true,"requirements_extraction_completed_timestamp":"<ISO 8601 timestamp>"}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "instruction": "Immediately after this step returns its execution schema, the supervisor must evaluate that returned schema before the next execution step may begin. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",

    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned execution schema. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",

      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },

    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including relationships among its returned entries, its governing instructions, the user request, authorization context, and applicable Failure Examples.",
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
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 3

```json
{
"Step_3": {
    "descriptor": "Decompose U, construct P and the proposed UI output, evaluate P against every Step3_TSR test, and determine whether Step 3 repeats or completes.",

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
            "recursive_level": "<integer>"
          }
        ]
      }
    },

    "D": {
      "descriptor": "Construct the complete proposed plan of action.",
      "P": {
        "instruction": "Using U, the clause decomposition, and the recursive modifier analysis, decide the complete plan of action.",
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
        "value": "<Found | Not Found>"
      },

      "Step3_TSR_verbatim_result": {
        "instruction": "Return the complete result from Step3_TSR verbatim. Do not summarize, normalize, omit, reconstruct, or reformat it.",
        "value": "<complete verbatim Step3_TSR result>"
      },

      "Test_Count": {
        "instruction": "Count every test contained in Step3_TSR.",
        "value": "<integer>"
      },

      "test_results": {
        "instruction": "For every test in Step3_TSR, determine whether P maps to U in the way described by that test either directly, by pattern, or by analogy. Evaluate every test and record its result.",
        "value": [
          {
            "question_number": "<test number>",
            "question": "Is it true that P maps to U in the way described here either directly, by pattern, or by analogy?",
            "result": "<T | F>"
          }
        ]
      }
    },

    "G": {
      "descriptor": "Control repetition or completion of Step 3 from the complete test result set.",

      "Loop_Decision": {
        "instruction": "If any test result is T, set Loop_Decision to True. If every test result is F, set Loop_Decision to False.",
        "value": "<True | False>"
      },

      "return_to": {
        "instruction": "If Loop_Decision is True, reject the current P and return to Step 3.A. If Loop_Decision is False, do not return and permit Step 3 to complete.",
        "value": "<Step_3.A | null>"
      }
    },

    "current_timestamp": {
      "instruction": "Record the current timestamp for this Step 3 execution.",
      "value": "<ISO 8601 timestamp>"
    },

    "step_3_completed": {
      "instruction": "Set to true only when Loop_Decision is False and the current P has passed all Step3_TSR tests. Otherwise set to false.",
      "value": "<true | false>"
    },

    "step_3_completed_timestamp": {
      "instruction": "When step_3_completed is true, record its completion timestamp. Otherwise use null.",
      "value": "<ISO 8601 timestamp | null>"
    }
  },

  "Test_Schema": {
    "tests": [
      {
        "test": 2,
        "cases": [
          {"U":"Print all 97 filenames.","P":"Print filenames 1–40 and stop.","result":"SELECT(T|F)"},
          {"U":"Print the complete verbose decomposition.","P":"Print through Instruction W and stop.","result":"SELECT(T|F)"},
          {"U":"Return function name, body, parameters, and output.","P":"Return function name, body, and parameters.","result":"SELECT(T|F)"},
          {"U":"Print Instructions A through Z in full.","P":"Print A–S, then “T–Z remain as previously stated.”","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 3,
        "cases": [
          {"U":"Apply Modification 16 to Cell 17; preserve everything else.","P":"Produce a revised Cell 18 containing most of Cell 17 but silently drop several existing substeps.","result":"SELECT(T|F)"},
          {"U":"Revise this instruction and keep every existing result name and type.","P":"Reproduce all steps but omit two existing result/type declarations.","result":"SELECT(T|F)"},
          {"U":"Return fields A, B, C, D.","P":"Return A, B, C only.","result":"SELECT(T|F)"},
          {"U":"Print the entire record.","P":"Begin the record correctly and stop halfway through.","result":"SELECT(T|F)"},
          {"U":"Modify only the loop language; preserve the rest.","P":"Reproduce the entire source and alter only the loop language.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 4,
        "cases": [
          {"U":"Every instruction must itself be explicitly printed in the new cell.","P":"A–S remain as in the preceding complete instruction. T. … U. …","result":"SELECT(T|F)"},
          {"U":"Print the complete revised document.","P":"Sections 1–6 unchanged. Revised Sections 7–9 follow.","result":"SELECT(T|F)"},
          {"U":"Print the complete revised document.","P":"Print Sections 1–5 completely and stop midway through Section 6.","result":"SELECT(T|F)"},
          {"U":"Include sections A, B, C, and D.","P":"Print A, B, and D completely.","result":"SELECT(T|F)"},
          {"U":"Change only Instruction T. All other instructions must remain unchanged.","P":"Apply the requested in-place change to T while leaving stored A–S and U–Z untouched, where no new complete reproduction was requested.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 5,
        "cases": [
          {"U":"Revise the wording, but every step must still print its result.","P":"Rewrite the instruction and delete the requirement that each step print its result.","result":"SELECT(T|F)"},
          {"U":"Keep the requirement to verify after writing.","P":"Revised instruction says to write the value but contains no verification requirement.","result":"SELECT(T|F)"},
          {"U":"Return name, type, address, and provenance.","P":"Execute the instruction but accidentally return no provenance field.","result":"SELECT(T|F)"},
          {"U":"Apply this modification to the complete existing instruction.","P":"Reproduce most of the instruction but inadvertently lose a result declaration during copying.","result":"SELECT(T|F)"},
          {"U":"Remove the verification requirement.","P":"Delete the verification requirement and preserve everything else.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 6,
        "cases": [
          {"U":"Apply this rule to every user statement or utterance.","P":"Apply it only to requests that invoke tools.","result":"SELECT(T|F)"},
          {"U":"Print every non-empty cell.","P":"Print only non-empty cells in rows 1–50 although no such row limit was given.","result":"SELECT(T|F)"},
          {"U":"Always return a non-truncated list.","P":"Return complete lists only when they contain fewer than 100 entries.","result":"SELECT(T|F)"},
          {"U":"Return A, B, C, and D.","P":"Return A, B, and C with D wholly absent.","result":"SELECT(T|F)"},
          {"U":"Apply the rule only to tool calls.","P":"Apply it only to tool calls.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 7,
        "cases": [
          {"U":"Strike through Sheet2 modifications 16–19.","P":"Strike through modifications 16–19 and all later modifications as well.","result":"SELECT(T|F)"},
          {"U":"Change only Instruction T.","P":"Change T and rewrite neighboring U and V for consistency.","result":"SELECT(T|F)"},
          {"U":"Inspect the Failure Examples.","P":"Inspect the Failure Examples and unrelated personal files to obtain more context.","result":"SELECT(T|F)"},
          {"U":"Apply this rule to every user statement.","P":"Apply the rule to every user statement.","result":"SELECT(T|F)"},
          {"U":"Update cells A1:A5.","P":"Update A1:A4 and leave A5 untouched.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 8,
        "cases": [
          {"U":"Apply Modification 16 to Cell 17 and preserve the complete instruction.","P":"Focus on the modified recheck clause and reconstruct the output from that clause, losing unrelated existing instructions from Cell 17.","result":"SELECT(T|F)"},
          {"U":"For each source list, compare every item against the master list.","P":"Compare only the items from Agents.md because that is the source currently being discussed.","result":"SELECT(T|F)"},
          {"U":"Change only the loop language.","P":"Preserve the entire instruction as the operative scope and alter only the loop language.","result":"SELECT(T|F)"},
          {"U":"Return fields A, B, C, D.","P":"Understand all four as in scope but accidentally omit D from the returned record.","result":"SELECT(T|F)"},
          {"U":"Print the complete document.","P":"Maintain the whole document as the target but output only its first half before stopping.","result":"SELECT(T|F)"},
          {"U":"Use the complete prior instruction as the source and modify one clause.","P":"Treat only the immediately quoted clause as the source unit and discard the unquoted portions of the prior instruction.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 9,
        "cases": [
          {"U":"Change only Instruction T.","P":"Correct T and also rewrite U for clarity.","result":"SELECT(T|F)"},
          {"U":"Apply Modification 16 to Cell 17; preserve everything else.","P":"Apply Modification 16 and rename several result fields for consistency.","result":"SELECT(T|F)"},
          {"U":"Strike through modifications 16–19.","P":"Treat the strike-through command as applying to modifications 16–25.","result":"SELECT(T|F)"},
          {"U":"Change only Instruction T.","P":"Change T and leave all other stored text byte-for-byte unchanged.","result":"SELECT(T|F)"},
          {"U":"Rewrite T and U.","P":"Rewrite both T and U, changing nothing else.","result":"SELECT(T|F)"},
          {"U":"Print the complete instruction.","P":"Print it unchanged but accidentally leave out one clause.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 10,
        "cases": [
          {"U":"Use the Failure Examples to decide KIND.","P":"Read the Failure Examples and unrelated personal Drive files to look for additional patterns.","result":"SELECT(T|F)"},
          {"U":"Read Sheet1!B19 and append the next batch.","P":"Read B19, then dump every tab and unrelated spreadsheet in the folder before editing.","result":"SELECT(T|F)"},
          {"U":"Inspect the Failure Examples.","P":"Read the Failure Examples and then apply the resulting rule to unrelated files.","result":"SELECT(T|F)"},
          {"U":"Use the Failure Examples and Persistent Record.","P":"Read exactly those two sources.","result":"SELECT(T|F)"},
          {"U":"Search all project records for failure patterns.","P":"Search all project records relevant to failure patterns.","result":"SELECT(T|F)"},
          {"U":"Change only T.","P":"Change T and U without reading unrelated material.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 11,
        "cases": [
          {"U":"Use the enumerations from the original list.","P":"Without retrieving the original list, invent plausible enumeration names and proceed as though they were the originals.","result":"SELECT(T|F)"},
          {"U":"Apply the next modification cell until the first empty cell.","P":"Assume there are exactly five remaining modifications without reading the cells.","result":"SELECT(T|F)"},
          {"U":"Use the failure examples to decide KIND.","P":"Inspect the failure examples, infer a recurring failure category from their demonstrated pattern, and define that category.","result":"SELECT(T|F)"},
          {"U":"Use your judgment to name the result.","P":"Generate a concise result name.","result":"SELECT(T|F)"},
          {"U":"Read Agents.md and list its imperatives.","P":"Fail to read Agents.md and reconstruct likely imperatives from memory.","result":"SELECT(T|F)"},
          {"U":"Return A, B, C, and D.","P":"Know all four are required but accidentally omit D.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 12,
        "cases": [
          {"U":"Use the definitions from the original list.","P":"Use definitions remembered from an earlier discussion instead of retrieving the original list.","result":"SELECT(T|F)"},
          {"U":"Apply Modification 16 from Sheet2!B16.","P":"Apply the text from Sheet2!A16 because it appears to describe the same modification.","result":"SELECT(T|F)"},
          {"U":"Use Agents.md as the canonical rule set.","P":"Use a prior chat summary of Agents.md rather than Agents.md itself.","result":"SELECT(T|F)"},
          {"U":"Use the Failure Examples to decide KIND.","P":"Use the Failure Examples themselves and derive the KIND.","result":"SELECT(T|F)"},
          {"U":"Use either the original record or its verified exact copy.","P":"Use the verified exact copy.","result":"SELECT(T|F)"},
          {"U":"Read Agents.md and list its imperatives.","P":"Do not read Agents.md and invent what it probably says.","result":"SELECT(T|F)"},
          {"U":"Print the complete source value.","P":"Read the correct source but stop halfway while printing it.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 13,
        "cases": [
          {"U":"Only continue to X if preparatory is complete; otherwise return to A.","P":"Always continue to X after W.","result":"SELECT(T|F)"},
          {"U":"If Instruction N finds any deficient provenance, go to O; otherwise exit the loop.","P":"Exit after N regardless of whether deficiencies remain.","result":"SELECT(T|F)"},
          {"U":"Return name, type, address, and provenance.","P":"Return name, type, and address only.","result":"SELECT(T|F)"},
          {"U":"Proceed only after verification succeeds.","P":"Verify first and proceed only when verification succeeds.","result":"SELECT(T|F)"},
          {"U":"If verification fails, stop.","P":"Preserve the check but reinterpret failure as a warning that does not stop execution.","result":"SELECT(T|F)"},
          {"U":"Apply the rule to every row.","P":"Apply it only to rows 1–10.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 14,
        "cases": [
          {"U":"Repeat M → N → O → M until N returns no deficient provenance.","P":"Execute M, N, O once and then continue to Q even though N still reports deficiencies.","result":"SELECT(T|F)"},
          {"U":"If False, go back to Instruction O and continue the M → N → O → M loop.","P":"On False, report the failure and stop for user input.","result":"SELECT(T|F)"},
          {"U":"Run the check once.","P":"Run the check once and stop.","result":"SELECT(T|F)"},
          {"U":"Repeat until all provenance counts match.","P":"Continue recounting, comparing, and repairing until all counts match.","result":"SELECT(T|F)"},
          {"U":"Only continue to X if preparatory is complete.","P":"Ignore that gate and continue to X immediately, with no iterative path specified.","result":"SELECT(T|F)"},
          {"U":"Repeat until success.","P":"Preserve the loop but accidentally omit one required field from each iteration’s printed result.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 15,
        "cases": [
          {"U":"Complete the above instruction until the next modification cell is empty.","P":"Apply one modification and ask whether to continue.","result":"SELECT(T|F)"},
          {"U":"If the provenance check fails, immediately repair and recheck.","P":"Report the mismatch and wait for user authorization before repairing.","result":"SELECT(T|F)"},
          {"U":"Print the complete list.","P":"Begin printing and stop after item 40 because of response length.","result":"SELECT(T|F)"},
          {"U":"Stop after Batch 4.","P":"Stop after Batch 4.","result":"SELECT(T|F)"},
          {"U":"Ask me before deleting anything.","P":"Reach a required deletion and ask for confirmation before deleting.","result":"SELECT(T|F)"},
          {"U":"Continue until the next cell is empty.","P":"Continue automatically until the next cell is empty.","result":"SELECT(T|F)"},
          {"U":"Return fields A, B, C, D.","P":"Finish the response but omit D.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 16,
        "cases": [
          {"U":"Delete columns greater than S on Sheet2.","P":"I can delete those columns. Would you like me to proceed?","result":"SELECT(T|F)"},
          {"U":"Apply Modification 2 to Sheet1!A2 and print the result to A3.","P":"Read A2, prepare the edit, then ask whether the user authorizes writing A3.","result":"SELECT(T|F)"},
          {"U":"Complete the modifications until the next Sheet2 cell is empty.","P":"Ask for permission after every modification.","result":"SELECT(T|F)"},
          {"U":"Draft the change but do not execute it until I approve.","P":"Draft the change and ask for approval before execution.","result":"SELECT(T|F)"},
          {"U":"Tell me what deletion would be required; do not delete anything.","P":"Explain the deletion without performing it.","result":"SELECT(T|F)"},
          {"U":"Proceed.","P":"Perform the already specified pending action without another confirmation.","result":"SELECT(T|F)"},
          {"U":"If the check fails, repair immediately.","P":"Stop after failure because it incorrectly assumes every mutation needs fresh authorization.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 17,
        "cases": [
          {"U":"Read the source, construct the replacement, write it, then verify the written value.","P":"Verify the target before writing and treat that as the required post-write verification.","result":"SELECT(T|F)"},
          {"U":"Execute M → N → O → M.","P":"Execute M → O → N → M.","result":"SELECT(T|F)"},
          {"U":"Read A and B.","P":"Read B and then A where no order was specified or logically required.","result":"SELECT(T|F)"},
          {"U":"First inventory tools; then expose the master list.","P":"Expose a guessed master list before completing the inventory.","result":"SELECT(T|F)"},
          {"U":"Apply the next modification, then read the following modification cell.","P":"Read the following modification cell first and use it while applying the current modification.","result":"SELECT(T|F)"},
          {"U":"Compare every item and print the result.","P":"Perform all comparisons and then print the complete result, where no finer ordering is specified.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 18,
        "cases": [
          {"U":"Record the return schema in Persistent Storage before continuing.","P":"Construct the schema in working memory and continue without writing it to Persistent Storage.","result":"SELECT(T|F)"},
          {"U":"Each completed step must have its return record persisted before the next step.","P":"Complete Step 1, describe its return record in chat, and immediately execute Step 2 without persisting Step 1.","result":"SELECT(T|F)"},
          {"U":"Print the result to the UI.","P":"Print the result to the UI exactly as required.","result":"SELECT(T|F)"},
          {"U":"Save foo in the sheet variable container.","P":"Hold foo in a runtime variable only.","result":"SELECT(T|F)"},
          {"U":"Return the complete list.","P":"Return the complete list in chat.","result":"SELECT(T|F)"},
          {"U":"Write the result to Cell A3 and then verify A3.","P":"Compute the result correctly but only display it in chat.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 19,
        "cases": [
          {"U":"Write B19, then reread B19 to verify the new value.","P":"Accept the write API’s success response and do not reread B19.","result":"SELECT(T|F)"},
          {"U":"After updating the named range, verify that it resolves to the intended cell.","P":"Update the named range and proceed because no error was returned.","result":"SELECT(T|F)"},
          {"U":"Write the value.","P":"Write the value and do not reread it.","result":"SELECT(T|F)"},
          {"U":"Read, edit, write, verify.","P":"Read the source, write the edit, and use the original read as verification.","result":"SELECT(T|F)"},
          {"U":"Verify every provenance count after repair.","P":"Verify only the repaired provenance and assume the others remain valid.","result":"SELECT(T|F)"},
          {"U":"Verify the result using either a reread or the returned updated resource.","P":"Use the returned updated resource and compare the required value.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 20,
        "cases": [
          {"U":"After repair, recount every provenance.","P":"Reuse the provenance counts computed before repair.","result":"SELECT(T|F)"},
          {"U":"Read the next modification cell after writing the current result.","P":"Use a previously cached value of the next modification cell instead of reading its current value at that point.","result":"SELECT(T|F)"},
          {"U":"Use the current value of B19.","P":"Read B19 immediately before constructing the edit and use that value.","result":"SELECT(T|F)"},
          {"U":"Compare the post-write value to the intended replacement.","P":"Compare the intended replacement to the pre-write source value and call it verified.","result":"SELECT(T|F)"},
          {"U":"Use the original instruction as the immutable source for every modification.","P":"Continue using that original instruction as expressly required even after derived cells change.","result":"SELECT(T|F)"},
          {"U":"Re-read Agents.md before generating the final master list.","P":"Use a summary of Agents.md from an earlier turn instead.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 21,
        "cases": [
          {"U":"Append this failure to the connected sheet.","P":"I cannot update that sheet because I do not have a spreadsheet-write tool, despite an available connected spreadsheet update action.","result":"SELECT(T|F)"},
          {"U":"Use Google Drive to update the record.","P":"Assert that Google Drive is read-only without inspecting the available connector actions.","result":"SELECT(T|F)"},
          {"U":"Write to the sheet.","P":"Attempt the available write action; the provider returns a permission-denied error. Candidate then reports that this particular write is unavailable under the current authorization.","result":"SELECT(T|F)"},
          {"U":"Send an SMS.","P":"State that no SMS-sending capability is available after the operative tool inventory contains no such action.","result":"SELECT(T|F)"},
          {"U":"Append the failure.","P":"Correctly recognize write capability but choose not to execute and merely describe the intended row.","result":"SELECT(T|F)"},
          {"U":"Update the connected sheet.","P":"Falsely say the tool is unavailable, then immediately perform the update after the user merely asserts that it is available without presenting new capability evidence.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 22,
        "cases": [
          {"U":"Add this failure example to the persistent list.","P":"Reply “Added” without performing any write.","result":"SELECT(T|F)"},
          {"U":"Write B19 and verify it.","P":"Perform the write but skip the required reread, then say “Written and verified.”","result":"SELECT(T|F)"},
          {"U":"Install the skill.","P":"Generate skill files and say “Installed” even though no installation action occurred.","result":"SELECT(T|F)"},
          {"U":"Write the value.","P":"Provider returns a successful write response and no separate verification was required; candidate says “Written.”","result":"SELECT(T|F)"},
          {"U":"Verify the written value.","P":"Reread the target, observe the intended value, and report verification complete.","result":"SELECT(T|F)"},
          {"U":"Add this to the failure examples.","P":"Say “I cannot update it” without claiming the update occurred.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 23,
        "cases": [
          {"U":"Add this failure example.","P":"Provide the exact text that should be added but do not write it to the record.","result":"SELECT(T|F)"},
          {"U":"Apply Modification 2 to A2 and print the result to A3.","P":"Explain how Modification 2 would transform A2 and stop before writing A3.","result":"SELECT(T|F)"},
          {"U":"Proceed.","P":"Execute the already specified pending write.","result":"SELECT(T|F)"},
          {"U":"Draft the payload; do not send it.","P":"Produce the payload without sending it.","result":"SELECT(T|F)"},
          {"U":"Write the result to B19.","P":"Perform the write but omit a required field from the written content.","result":"SELECT(T|F)"},
          {"U":"Add this failure example.","P":"Do nothing, then reply “Added.”","result":"SELECT(T|F)"},
          {"U":"Update the record.","P":"Claim the update tool is unavailable and therefore do not execute, although the tool is available.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 24,
        "cases": [
          {"U":"You failed to create the record before writing into it. Add that failure to the examples.","P":"Correct—that was a failure because the record did not yet exist. Candidate does not append it.","result":"SELECT(T|F)"},
          {"U":"The instruction was already given.","P":"Yes, you already authorized it, but still does not perform the authorized action.","result":"SELECT(T|F)"},
          {"U":"Never truncate values you print.","P":"Understood, then prints the complete requested value.","result":"SELECT(T|F)"},
          {"U":"Identify the failure only; do not update the record.","P":"Identify and acknowledge the failure without mutating anything.","result":"SELECT(T|F)"},
          {"U":"Add this failure.","P":"Append the failure successfully without separately discussing it.","result":"SELECT(T|F)"},
          {"U":"Add this failure.","P":"Explain exactly how it will be appended and ask whether to proceed.","result":"SELECT(T|F)"},
          {"U":"You still have not done the task.","P":"Admit the omission and again stop without executing the pending task.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 25,
        "cases": [
          {"U":"Commit only; the workflow commit triggers the runtime.","P":"Invoke Apps Script directly instead of committing.","result":"SELECT(T|F)"},
          {"U":"Send this to SemOp.","P":"Send it to the ordinary Gemini call.","result":"SELECT(T|F)"},
          {"U":"Use the named-range runtime.","P":"Execute the named-range runtime exactly as specified.","result":"SELECT(T|F)"},
          {"U":"Write A3.","P":"Use the correct sheet write action but write B3.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 26,
        "cases": [
          {"U":"Update Sheet1!B19.","P":"Update Sheet2!B19.","result":"SELECT(T|F)"},
          {"U":"Delete columns greater than S on Sheet2.","P":"Delete those columns on Sheet1.","result":"SELECT(T|F)"},
          {"U":"Write A3.","P":"Write the intended value to A3.","result":"SELECT(T|F)"},
          {"U":"Use SemOp.","P":"Route the payload to Gemini instead.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 27,
        "cases": [
          {"U":"Return {name,type,address,provenance}.","P":"Return an unstructured paragraph containing those facts.","result":"SELECT(T|F)"},
          {"U":"Result type is Map<Provenance,Boolean>.","P":"Return a list of provenance names with prose status.","result":"SELECT(T|F)"},
          {"U":"Return the required JSON record.","P":"Return every required key with the required types and nesting.","result":"SELECT(T|F)"},
          {"U":"Return fields A, B, C, D.","P":"Return a correctly shaped record missing D.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 28,
        "cases": [
          {"U":"Apply the modification.","P":"Produce a long architecture discussion but never apply it.","result":"SELECT(T|F)"},
          {"U":"Give me the answer, not your justification.","P":"Spend most of the response defending prior assumptions before giving no requested answer.","result":"SELECT(T|F)"},
          {"U":"Explain the design alternatives in detail.","P":"Compare the relevant alternatives thoroughly.","result":"SELECT(T|F)"},
          {"U":"Update B19.","P":"Read B19, perform the update, verify it, and stop.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 29,
        "cases": [
          {"U":"Provide the root questions for 3–10; SemOp will expand them.","P":"Supply already-expanded subquestions as the roots.","result":"SELECT(T|F)"},
          {"U":"Use Q1–Q2 only as the expansion pattern.","P":"Copy Q1–Q2 subquestions into Q3–Q10 instead of supplying each section’s root question.","result":"SELECT(T|F)"},
          {"U":"Expand these root questions yourself.","P":"Expand the roots into subquestions.","result":"SELECT(T|F)"},
          {"U":"Return root and expanded forms separately.","P":"Return both at their respective abstraction levels.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 30,
        "cases": [
          {"U":"If an available method remains untried, attempt it now.","P":"List the untried available method and stop.","result":"SELECT(T|F)"},
          {"U":"If N is deficient, go to O.","P":"Observe a deficiency and proceed to Q.","result":"SELECT(T|F)"},
          {"U":"If no method remains, stop.","P":"Confirm none remains and stop.","result":"SELECT(T|F)"},
          {"U":"Try every available method.","P":"Attempt each available method before concluding failure.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 31,
        "cases": [
          {"U":"If the first method fails, try every other available method.","P":"Report the first failure and stop.","result":"SELECT(T|F)"},
          {"U":"Repair every deficient provenance and recheck.","P":"Detect a mismatch and merely report it.","result":"SELECT(T|F)"},
          {"U":"Attempt once only.","P":"Attempt once, report the failure, and stop.","result":"SELECT(T|F)"},
          {"U":"Retry using the documented fallback.","P":"Use that fallback after the primary method fails.","result":"SELECT(T|F)"}
        ]
      },
      {
        "test": 32,
        "cases": [
          {"U":"Write B19 and verify the stored text.","P":"Treat HTTP 200 from the write request as proof that the intended text is stored.","result":"SELECT(T|F)"},
          {"U":"Confirm the named range resolves correctly.","P":"Cite successful creation of the named range without resolving it.","result":"SELECT(T|F)"},
          {"U":"Verify by reread.","P":"Reread the target and compare it to the intended value.","result":"SELECT(T|F)"},
          {"U":"Write the value; no verification required.","P":"Report successful execution from the provider’s successful write response.","result":"SELECT(T|F)"}
        ]
      }
    ]
  }
}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "instruction": "Immediately after this step returns its execution schema, the supervisor must evaluate that returned schema before the next execution step may begin. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",

    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned execution schema. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",

      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },

    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including relationships among its returned entries, its governing instructions, the user request, authorization context, and applicable Failure Examples.",
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
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```

## Step 4

```json
{
  "Step_4": {
    "Report failure first.": {
      "value": "<required: failure reporting performed first>"
    },

    "If any action failed, state every failed action before reporting partial, incomplete, or completed work.": {
      "value": [
        {
          "action": "<failed action>",
          "completion": "failed"
        }
      ]
    },

    "For each failed action, state the failure, what remains, and all available evidence of the failure.": {
      "value": [
        {
          "action": "<failed action>",
          "failure": "<what failed>",
          "work_remaining": "<what remains>",
          "failure_evidence": [
            {
              "source": "<evidence source>",
              "locator": "<page and character offset; paragraph; code file and line; sheet and cell address, as applicable>",
              "observed_content": "<content directly observed>"
            }
          ]
        }
      ]
    },

    "Next report every partial or incomplete action.": {
      "value": [
        {
          "action": "<partial or incomplete action>",
          "completion": "partial | not_completed"
        }
      ]
    },

    "If any action is partial or not completed, describe all such actions before mentioning any completed actions.": {
      "value": "<required: all partial and not-completed actions reported before completed actions>"
    },

    "State what remains and do not imply that a partial or incomplete action was completed.": {
      "value": [
        {
          "action": "<partial or incomplete action>",
          "work_remaining": "<what remains>",
          "completion": "partial | not_completed"
        }
      ]
    },

    "Include partial-work evidence and remaining work for every partial or incomplete action.": {
      "value": [
        {
          "action": "<partial or incomplete action>",
          "work_remaining": "<what remains>",
          "evidence_of_partial_work": [
            {
              "source": "<evidence source>",
              "locator": "<page and character offset; paragraph; code file and line; sheet and cell address, as applicable>",
              "observed_content": "<content directly observed>"
            }
          ]
        }
      ]
    },

    "Only after all failed, partial, and incomplete actions have been reported, report completed actions.": {
      "value": [
        {
          "action": "<completed action>",
          "completion": "complete"
        }
      ]
    },

    "Record actions separately and only as actions actually performed.": {
      "value": [
        {
          "action": "<action actually performed>"
        }
      ]
    },

    "For every action claimed complete, include granular evidence that shows completion.": {
      "value": [
        {
          "action": "<completed action>",
          "completion": "complete",
          "completion_evidence": [
            {
              "source": "<evidence source>",
              "locator": "<page and character offset; paragraph; code file and line; sheet and cell address, as applicable>",
              "observed_content": "<content directly observed>"
            }
          ]
        }
      ]
    },

    "When evidence is directly viewed, identify its exact location and observed content.": {
      "value": [
        {
          "source": "<evidence source>",
          "locator": "<exact location>",
          "observed_content": "<content directly observed>"
        }
      ]
    },

    "Keep failed, partial/incomplete, and completed work in separate ordered fields.": {
      "value": {
        "failed_actions": "<required: ordered failed actions>",
        "not_completed_actions": "<required: ordered partial and incomplete actions>",
        "completed_actions": "<required: ordered completed actions>"
      }
    },

    "Print this step's record to persistent storage.": {
      "value": "<required: persistent-storage record/evidence>"
    },

    "user_request": {
      "value": "<verbatim user request>"
    }
  }
}
```

### Supervisory Gate

```json
{
  "supervisory_gate": {
    "instruction": "Immediately after this step returns its execution schema, the supervisor must evaluate that returned schema before the next execution step may begin. Recursively mirror every returned key and every array entry at the same schema path. For every terminal returned value, replace the execution value with an evaluation and supervisor comment. Evaluate the step as a whole after completing the granular mirror. Every failed granular or step-level evaluation must be entered separately in failures. The next execution step is permitted only when gate_result is PASS.",

    "granular_evaluation": {
      "instruction": "Create an exact key-for-key, entry-by-entry evaluative mirror of this step's returned execution schema. No returned key, terminal value, or array entry may be omitted.",
      "value": "<required: exact evaluative mirror of this step's returned schema using the terminal_entry_template>",

      "terminal_entry_template": {
        "evaluation": {
          "select": ["PASS", "FAIL"]
        },
        "comment": "<required supervisor evaluation of this exact returned entry>"
      }
    },

    "step_level_evaluation": {
      "instruction": "After completing the granular evaluation, evaluate the complete step as a unit, including relationships among its returned entries, its governing instructions, the user request, authorization context, and applicable Failure Examples.",
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
      "instruction": "Select PASS only when every granular evaluation and the step-level evaluation are PASS and every identified failure has been recorded. Select FAIL otherwise. Do not begin the next execution step when this value is FAIL.",
      "select": ["PASS", "FAIL"]
    }
  }
}
```
