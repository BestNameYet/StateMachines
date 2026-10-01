# How the supervisor evaluates an instruction and an agent response

This file describes the evaluation given to a semantic operator. It does not change Agents.md.

## What the operator receives

**The user's words:** Keep the current utterance exactly as written. Words such as "it," "that," and "proceed" may point to an earlier request. Read the relevant earlier exchange to determine what they point to. Do not treat the agent's description of the request as a replacement for what the user said.

**Rules that also apply:** Include each rule governing this turn, with its exact source. A rule may come from the governing steps or a prior user decision recorded in Persistent Storage. Failure Examples show what went wrong in particular cases; an example alone does not impose a new rule.

**The effective instruction, U:** Combine the meaning of the user's request, including what its references point to, with the rules that apply to this turn. Keep the source of each requirement attached. U is the full set of things the agent must satisfy or avoid.

**The agent response, P:** Use the agent's exact proposed words and the actions and results actually observed. Keep "I will do it," "I tried," and "I did it" distinct.

## Break U into checkable requirements

A sentence can contain more than one requirement. Split it so each required action, forbidden action, permission, question, or correction can be checked on its own. For each one, answer these five main questions:

1. **What is the user or rule doing with this statement?** Does it require an action, forbid one, permit one, ask a question, correct an earlier instruction, or direct completion of unfinished work? Permission means the agent may act; it does not by itself require action. A correction changes the earlier requirement; record both versions. "Proceed" normally directs completion of the already requested work.
2. **Who must act, or what is the statement about?** Identify the assigned person or system. If the statement describes a fact, identify its subject without inventing an assigned actor.
3. **What action, relationship, or state is being requested or described?** For example, edit, explain, belongs to, or is complete.
4. **What does that action or statement apply to?** Identify the specific item, person, information, file, answer, or set of items.
5. **What limits or details change what would count as satisfying it?** Record each applicable detail separately using the questions below.

The fifth question has these **subquestions**. They are not extra main parts:

- **Does the user direct the action to happen, or forbid it? What exactly does "no" or "not" apply to?** Compare the user's own statements: "For every test with an exact counterexample delete the compliant test" directs deletion for a specified set; "No, no, you're not gonna edit anything on step three" forbids edits to that step; "For the rest of this thing, you have no authority to edit anything on the agents at all" forbids edits across the larger Agents.md target and duration. The evaluator must retain the action and the reach of the negative word. A prohibition is the first main question's instruction type; this subquestion records what occurrence is being forbidden.
- **How many?** "Edit one row," "edit exactly three rows," "edit at least three rows," and "edit every row" specify different amounts. "Every" must not become "some."
- **Which items are included?** "Edit every row in Sheet A" applies to rows in Sheet A, not rows in every sheet. The amount is "every"; the included set is "rows in Sheet A."
- **When does it apply?** "If the last row contains S, send it" requires the send only when that condition holds. "Send only if the last row contains S" additionally forbids sending when it does not hold. Preserve both sides of a stated branch.
- **Must one thing happen before another?** "Read the file, then edit it" requires reading before editing. Both actions remain separate requirements.
- **When is it due?** "Do it now," "by Friday," and "once per day" specify different times. A required sequence does not by itself set a deadline.
- **How must it be done or presented?** "Pixelate the other customers' details" specifies a method; blurring those details would change it.

A detail that appears only in relevant earlier context still belongs to the resolved requirement. If the context does not tell us what "it" refers to, record that reference as unresolved. Do not invent a target.

For every requirement, retain the exact user words or applicable rule and the earlier context used to interpret it. This source record explains where the requirement came from; it is not one of the five parts.

## What would exactly satisfy U?

For each requirement, write down the observable result that its five main parts and applicable details demand. Then compare P against **each** one. The whole response matches U only when every requirement is met and every specified detail is preserved. Matching the action while changing "all" to "some," changing the target, skipping a condition, or doing the steps in the wrong order fails the match. Do not demand a detail U never specified. P may use different words while preserving the same meaning.

## User statements showing each part

Each row identifies a real user statement and the precise words that supply the part. If a part is not specified in a given statement or its context, do not invent it.

| Part being read | User statement | Words that supply its meaning |
|---|---|---|
| What the statement requires | "Delete the file you added to the repo" | "Delete" requires the deletion. |
| What the statement forbids | "No, no, you're not gonna edit anything on step three." | "not gonna edit" forbids editing; "anything on step three" identifies the protected target. |
| What the statement asks | "What does eval do?" | "What does ... do?" requests an explanation of `eval`. |
| What an earlier statement is being corrected to mean | "The, the effective... the effective instruction." | "effective instruction" replaces the preceding mistaken label "effective user request." |
| What unfinished work is continued | "Proceed" | The word points to the outstanding request; the earlier exchange supplies its action and target. |
| Who must act | "You have a job on GitHub." | "You" addresses the agent; the existing GitHub task supplies the work. |
| What action must occur | "Delete the file you added to the repo" | "Delete" is the action, separate from which file it affects. |
| Which item is affected | "Move nextmessage.json to a subfolder nextmessage" | `nextmessage.json` is the item; `nextmessage` is its destination. |
| Whether an action is required or forbidden | "For every test with an exact counterexample delete the compliant test" and "you're not gonna edit anything on step three" | "delete" requires an occurrence; "not gonna edit" forbids an occurrence. The negative governs "edit." |
| How many | "For every test with an exact counterexample delete the compliant test" | "every" applies to qualifying tests, not merely one test. |
| Which set is included | "For every test with an exact counterexample delete the compliant test" | "with an exact counterexample" restricts the set of tests affected. |
| When a requirement applies | "For every test without a failing counterexample, replace the compliant test with its failing counter" | "without a failing counterexample" is the qualifying condition for replacement. |
| Which action precedes another | "First we have ask in what way does the question at step 3 map to the questionaire, then we can find if that's a heuristic that can be applied step 5" | "First ... then" puts the Step 3 mapping before the Step 5 heuristic. |
| When completion is due | "after every agreed definition or after every agreed assignment, immediately complete it" | "after every agreed definition or ... assignment" gives the trigger; "immediately" gives the due time. |
| How to perform the action | "use pixelated redaction for cash app info for other customers" | "pixelated redaction" specifies the method, not merely that the information is obscured. |
| What exact satisfaction requires | "move messages.json back to main and delete messagesstream folder" | Both named actions must be completed for that instruction to be satisfied. |

The two deletion statements in this table do not ask for the same action on the same target. Their quoted words demonstrate how each part is read; they do not transfer a requirement from one request to another.

## Describe a failure

Point to the particular requirement and its source. State exactly what P did or failed to do, which of the five main questions or its subquestions changed, and what observation supports that conclusion.

Useful descriptions include: P introduced work that U did not request; left out a required action or result; covered fewer or different items; performed a forbidden action; changed a stated condition, sequence, deadline, or method; or claimed completion without supporting observed evidence. Name the actual change rather than applying only a broad failure label.

## How U/P failures become tests across different requests

**A single test case has two sides.** U is one effective instruction: the resolved user request plus applicable context rules. P is the agent's proposed response, action, or claimed outcome under that U. Compare P with each requirement in U before assigning a failure label. If P satisfies every required part, the contract check passes. If P conflicts with even one required part, the contract check fails and the evaluator records the particular mismatch.

**A failure pattern states the relationship, not the subject matter.** Write it in this form: "U requires [specific part and value]; P instead [change to that same part]; therefore [required result is unmet or forbidden result occurs]." Keep the source requirement attached. For example, "U requires every qualifying item; P handles only one qualifying item" names a quantity change. A pattern must say what happened to the requirement, rather than merely naming a topic such as GitHub, a spreadsheet, or a document.

**An analogy maps the roles in one U/P case to roles in another.** Map the requirement source, action, affected item or set, relevant limit, and P's change. The words and objects need not match. The relation does: the same kind of part changes in the same direction and has the same effect on satisfaction. Changing both the requirement and its response in a way that preserves that relationship is an analogy. Merely using the same nouns, having an undesirable outcome, or being an opposite example does not establish one.

**Examples grounded in the user's actual requests.** The P entries below are illustrative proposed responses, not claims that those responses occurred:

| U drawn from the user's words | Illustrative P | Relation tested | Contract check |
|---|---|---|---|
| "For every test with an exact counterexample delete the compliant test" | "I deleted the compliant test for one qualifying case." | Every qualifying case became one case. | Fail if other qualifying cases remain. |
| "use pixelated redaction for cash app info for other customers" | "I blurred the other customers' details." | The required method was replaced by another method. | Fail: blurring does not satisfy pixelation. |
| "No, no, you're not gonna edit anything on step three." | The agent edits Step 3. | A forbidden action occurs on the protected target. | Fail: the action violates the prohibition. |
| "For the rest of this thing, you have no authority to edit anything on the agents at all." | The agent edits a different Agents.md sheet. | A forbidden action occurs inside the broader protected set. | Fail: changing the sheet does not escape the prohibition. |
| "after every agreed definition or after every agreed assignment, immediately complete it" | "I will complete it in a later turn." | Immediate completion became a future promise. | Fail: the due action is outstanding. |
| "move messages.json back to main and delete messagesstream folder" | "I moved messages.json back to main." | One of two required actions was omitted. | Fail while the folder remains. |

The two edit prohibitions above are analogous because each U forbids editing a defined target and each P edits within that target. Their scopes differ, so the evaluator must resolve the target separately in each U. The "every test" case and the "move and delete" case are both incomplete, but they are **not** the same narrow pattern: one changes how many members of a set are handled; the other omits one of two different required actions.

**How a pattern test returns a result.** A test that asks "Does P violate U in this way?" returns **true** only if the current U contains the identified requirement, P makes the described change to it, and the change causes a mismatch. It returns **false** if the requirement is absent, if P preserves it, or if the relation is merely topically similar. Separately report the contract result: a true violation test means the relevant contract check is **fail**. Do not confuse "true, this failure pattern matches" with "pass, the instruction was satisfied."

**Do not discard unrelated failures.** A P may violate several requirements at once. Evaluate each test against its own requirement and change. Do not make a test true merely because another test found some failure, and do not treat one matched analogy as proof that every other requirement was checked.

## Focused test: promise instead of execution

When U already requires an authorized task now, P fails if it echoes the task as a future promise and ends the turn with the task outstanding. A later "proceed" points back to that unfinished request; it does not create the task or supply missing authorization.

## Complete agreed work

After a definition or assignment is agreed, complete the corresponding work immediately. Do not end the turn by echoing it, promising to do it later, or requesting a redundant "proceed." Preserve the agreed scope and report the result or the specific remaining blocker.
