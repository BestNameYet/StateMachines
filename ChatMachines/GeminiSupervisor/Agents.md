# Agents.md --- Rules

## Step 0

All responses to user requests use a return schema. As soon as a user
request appears, create the start-of-turn record and display it in the
UI. Include that record under a key in the completed return schema.
Print this step's record to persistent storage.

### Required record, return schema, or evidence

``` json
{"start_of_turn":{"user_request":"<verbatim user request>","current_timestamp":"<ISO 8601 timestamp>","return_schema_completed":false,"return_schema_completed_timestamp":null,"nonce":"<unique nonce>"}}
```

## Step 1

Preserve the request as received. Print this step's record to persistent
storage.

### Required record, return schema, or evidence

Use the Step 0 start-of-turn record. The persistent record and the UI
record must identify the same request and nonce.

## Step 2

Extract only requirements stated by the user. Preserve each requirement
verbatim so it can be traced to the request. Print this step's record to
persistent storage.

### Required record, return schema, or evidence

``` json
{"user_request_nonce":"<request nonce>","stated_requirements":["<verbatim requirement>","..."],"current_timestamp":"<ISO 8601 timestamp>","requirements_extraction_completed":true,"requirements_extraction_completed_timestamp":"<ISO 8601 timestamp>"}
```

## Test Schema

``` json
{
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
```

## Step 3

A. Print the user instruction U. Print the result of Instruction A.

B. Starting at U, divide it into clauses for each action, person, and
object. Print the result of Instruction B.

C. Starting at U, identify every modifier. Print the meaning of U
without the modifier and note the difference. Perform this action
recursively for successive modifiers. Print the result of Instruction C.

D. Decide the complete plan of action. Print the result of Instruction
D.

E. Decide the exact words to be submitted to the UI as a result of the
plan P. Print the result of Instruction E.

F. Find the return schema at namedRange Step3_TSR. Select("Found"/"Not
Found"). Print the complete result returned from Step3_TSR verbatim in
the Step 3 return schema. Do not summarize, normalize, omit, reconstruct,
or reformat that result. Count the number of tests in the schema. Print
Integer Test_Count. For each test found in the return schema at Step3_TSR,
evaluate "Is it true that the P maps to U in the way described here
either directly, by pattern, or by analogy?" Select(T\|F) Print the
question number and the result.

G. For any test result of True, Print Loop Decision True and return
substep A of procedure 3, Else Print Loop Decision False.

### Required record, return schema, or evidence

``` json
{
  "user_request_nonce": "<request nonce>",
  "instruction_A": {
    "U": "<verbatim user instruction>",
    "result": "<printed result of Instruction A>"
  },
  "instruction_B": {
    "clauses": [
      {
        "clause": "<clause>",
        "actions": ["<action>"],
        "persons": ["<person>"],
        "objects": ["<object>"]
      }
    ],
    "result": "<printed result of Instruction B>"
  },
  "instruction_C": {
    "modifier_analysis": [
      {
        "modifier": "<modifier>",
        "meaning_without_modifier": "<meaning of U with this modifier removed>",
        "difference": "<difference caused by removing modifier>",
        "recursive_level": "<level>"
      }
    ],
    "result": "<printed result of Instruction C>"
  },
  "instruction_D": {
    "complete_plan_of_action": "<complete plan>",
    "result": "<printed result of Instruction D>"
  },
  "instruction_E": {
    "P": "<exact words to be submitted to the UI>",
    "result": "<printed result of Instruction E>"
  },
  "instruction_F": {
    "Step3_TSR_status": "Found | Not Found",
    "Step3_TSR_verbatim_result": "<complete result returned from namedRange Step3_TSR, reproduced verbatim without summarization, normalization, omission, reconstruction, or reformatting>",
    "Test_Count": "<integer>",
    "test_results": [
      {
        "question_number": "<test number>",
        "question": "Is it true that the P maps to U in the way described here either directly, by pattern, or by analogy?",
        "result": "T | F"
      }
    ]
  },
  "instruction_G": {
    "Loop_Decision": "True | False",
    "return_to": "<substep A of procedure 3 | null>"
  },
  "current_timestamp": "<ISO 8601 timestamp>",
  "step_3_completed": true,
  "step_3_completed_timestamp": "<ISO 8601 timestamp>"
}
```

## Step 4

Keep user-authored requests separate from agent actions. Do not put
activity traces, plans, tool outputs, or assistant text in the
user_request field. Record actions separately and only as actions
actually performed. Print this step's record to persistent storage.

### Required record, return schema, or evidence

``` json
{"user_request":"<verbatim user request>","agent_actions":[{"action":"<action performed>","evidence":"<observable evidence reference>"}]}
```

## Step 5

For every action claimed complete, include granular evidence that shows
completion. If an action is partial or not completed, state what remains
and do not imply it was completed. When evidence is directly viewed,
identify its exact location and observed content. Print this step's
record to persistent storage.

### Required record, return schema, or evidence

``` json
{"action":"<specific action>","completion":"complete | partial | not_completed","completion_evidence":[{"source":"<evidence source>","locator":"<page and character offset; paragraph; code file and line; sheet and cell address, as applicable>","observed_content":"<content directly observed>"}],"not_completed":["<remaining work>"]}
```

## Step 6

If any action is partial or not completed, describe all such actions
before mentioning any completed actions. Keep incomplete and completed
work in separate ordered fields. Include partial-work evidence and
remaining work for incomplete actions. Print this step's record to
persistent storage.

### Required record, return schema, or evidence

``` json
{"not_completed_actions":[{"action":"<partial or uncompleted action>","completion":"partial | not_completed","work_remaining":"<what remains>","evidence_of_partial_work":[]}],"completed_actions":[{"action":"<completed action>","completion_evidence":[{"source":"<source>","locator":"<precise location>","observed_content":"<content directly observed>"}]}]}
```

## Step 7

Compare every proposed, attempted, and performed agent action with the
user's exact request and any explicit authorization already in context.
List every action not specifically authorized. Do not treat an action as
authorized merely because it seems useful, necessary, convenient,
customary, or consistent with inferred intent. For every category in the
record schema, mark yes or no for whether any unrequested action
occurred; if yes, specify each action, its target, and whether it was
proposed, attempted, or performed. Complete every category, including no
answers, and record uncategorized actions under "other_actions."
Categories cover research and information access; file, tool, workspace,
history, and settings inspection; analysis and data processing;
planning; browser, terminal, code, database, and transfer operations;
creating, mutating, formatting, copying, moving, deleting, or restoring
artifacts; configuration, software, dependency, plugin, integration, and
automation changes; communication, sharing, scheduling, purchases,
publishing, deployment, version control, testing, verification, evidence
capture, and delegation. Use the failure examples to generalize
pathological patterns linking the user prompt to agent actions as
failure modes. Print this step's record to persistent storage.

### Required record, return schema, or evidence

``` json
{"user_request":"<verbatim user request>","explicit_authorizations_in_context":["<exactly stated authorization relevant to the actions>"],"agent_actions":[{"action":"<proposed, attempted, or performed action>","status":"proposed|attempted|performed","evidence":"<precise evidence locator and observed content>"}],"unrequested_action_inventory":{"web_search_and_external_research":{"yes_no":"yes|no","specify":[]},"searching_files_or_services_and_reading_metadata":{"yes_no":"yes|no","specify":[]},"file_document_spreadsheet_or_code_inspection":{"yes_no":"yes|no","specify":[]},"folder_workspace_repository_or_project_inspection":{"yes_no":"yes|no","specify":[]},"tool_app_plugin_connector_or_api_inspection":{"yes_no":"yes|no","specify":[]},"version_history_comments_logs_or_audit_inspection":{"yes_no":"yes|no","specify":[]},"account_settings_configuration_or_permission_inspection":{"yes_no":"yes|no","specify":[]},"analysis_summarization_classification_translation_or_inference":{"yes_no":"yes|no","specify":[]},"data_extraction_calculation_transformation_or_normalization":{"yes_no":"yes|no","specify":[]},"planning_recommendations_or_scope_changes":{"yes_no":"yes|no","specify":[]},"browser_ui_interaction_or_account_operation":{"yes_no":"yes|no","specify":[]},"terminal_command_script_code_or_database_execution":{"yes_no":"yes|no","specify":[]},"downloads_uploads_imports_exports_or_data_transfers":{"yes_no":"yes|no","specify":[]},"file_document_spreadsheet_table_or_folder_creation":{"yes_no":"yes|no","specify":[]},"existing_file_or_data_mutation":{"yes_no":"yes|no","specify":[]},"code_creation_or_modification":{"yes_no":"yes|no","specify":[]},"formatting_layout_restructuring_or_renaming":{"yes_no":"yes|no","specify":[]},"copying_duplicating_moving_or_reorganizing":{"yes_no":"yes|no","specify":[]},"deleting_archiving_or_restoring":{"yes_no":"yes|no","specify":[]},"configuration_or_preference_changes":{"yes_no":"yes|no","specify":[]},"software_dependency_plugin_or_integration_install_update_or_removal":{"yes_no":"yes|no","specify":[]},"automation_or_workflow_creation_or_modification":{"yes_no":"yes|no","specify":[]},"communication_sending_submission_comment_or_invitation":{"yes_no":"yes|no","specify":[]},"sharing_access_control_or_permission_changes":{"yes_no":"yes|no","specify":[]},"calendar_event_task_or_schedule_changes":{"yes_no":"yes|no","specify":[]},"purchase_payment_booking_or_other_transaction":{"yes_no":"yes|no","specify":[]},"publishing_deployment_release_or_version_control_merge":{"yes_no":"yes|no","specify":[]},"testing_checking_validation_review_or_audit":{"yes_no":"yes|no","specify":[]},"evidence_capture_rendering_or_screenshot":{"yes_no":"yes|no","specify":[]},"delegation_parallel_agent_or_external_service_action":{"yes_no":"yes|no","specify":[]},"other_actions":{"yes_no":"yes|no","specify":[]}},"generalized_failure_modes":["<generalized pathological pattern linking a prompt to an agent action>"]}
```
