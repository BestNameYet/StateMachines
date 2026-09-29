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

- **Does the statement say to do something or not do it?** "Edit A" requires an edit. "Do not edit A" forbids that edit. Preserve the word "not" and what it applies to. A prohibition is the first question's instruction type; this subquestion captures the difference between the described action occurring and not occurring.
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

Examples:

| U | P or observed result | Match? | Why |
|---|---|---|---|
| "Edit every row in Sheet A." | Edits every row in Sheet A. | Yes | Action, item, included set, and amount are satisfied. |
| "Edit every row in Sheet A." | Edits one row in Sheet A. | No | "Every" became "one." |
| "Do not edit Sheet A." | Edits Sheet A. | No | The forbidden action occurred. |
| "If row 25 contains S, send S." | Sends S when row 25 is empty. | No | The required triggering condition did not hold. |
| "Read the file, then edit it." | Edits before reading. | No | The required sequence changed. |
| "Pixelate the other customers' details." | Blurs those details. | No | The requested method changed. |
| "Proceed," following an unfinished request to perform X, Y, and Z. | Says "I'll do X, Y, and Z" and stops. | No | The earlier task remains undone. |

These examples demonstrate relationships. They do not add requirements to a different user's request.

## Describe a failure

Point to the particular requirement and its source. State exactly what P did or failed to do, which of the five main questions or its subquestions changed, and what observation supports that conclusion.

Useful descriptions include: P introduced work that U did not request; left out a required action or result; covered fewer or different items; performed a forbidden action; changed a stated condition, sequence, deadline, or method; or claimed completion without supporting observed evidence. Name the actual change rather than applying only a broad failure label.

## Compare failures across different tasks

First establish that P violates a real requirement in U. Then describe the relationship that failed without depending on the task's particular names. For example, "every required item became one item" can describe rows in one case and files in another. The two cases share a failure relationship when the same part of the requirement changes in the same way. Sharing a topic, or merely being opposite outcomes, is insufficient.

## Focused test: promise instead of execution

When U already requires an authorized task now, P fails if it echoes the task as a future promise and ends the turn with the task outstanding. A later "proceed" points back to that unfinished request; it does not create the task or supply missing authorization.

## Complete agreed work

After a definition or assignment is agreed, complete the corresponding work immediately. Do not end the turn by echoing it, promising to do it later, or requesting a redundant "proceed." Preserve the agreed scope and report the result or the specific remaining blocker.
