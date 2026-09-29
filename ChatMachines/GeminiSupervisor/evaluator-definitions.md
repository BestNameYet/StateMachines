# Evaluator definitions

These definitions govern how the semantic operator compares the agent with the effective instruction. They do not change Agents.md.

## Inputs and sources

**User utterance:** The exact words the user submitted in the current turn. Retain them verbatim.

**User request:** The meaning of the user utterance after resolving references against the relevant conversation. It may ask a question, require or prohibit an action, grant permission, correct an earlier instruction, or continue an outstanding task. The request is still attributed to the user even when an earlier turn supplies the referent.

**Relevant conversation context:** Earlier statements needed to identify what the current utterance refers to or which outstanding task it continues. For example, "proceed" refers to the previously requested work. The agent's restatement of that work does not replace the user's request or grant new authority.

**Context rule:** An instruction or constraint already applicable to this turn in addition to the current user request. Record its exact content and source. Applicable sources may include governing steps and prior user decisions recorded in Persistent Storage. A Failure Example supplies evidence of an observed failure; it is not itself an independent rule unless an applicable instruction adopts it as one.

**Effective instruction (U):** The resolved user request plus every applicable context rule. U is the contract to evaluate. Keep each constituent obligation and its source distinct; combining them does not erase which words came from the user and which came from a rule.

**Agent response (P):** The exact proposed words, actions, and claims under evaluation, together with directly observed execution or results where the test requires them. A promise, an attempt, and a completed action are different states.

## Parts of the contract

Split U into the smallest independently checkable clauses. For each clause, record the following parts. A part can be supplied by relevant context rather than repeated in the current utterance. Mark a part **unresolved** if the available context does not determine it; do not invent it.

**Clause:** One proposition whose satisfaction or violation can be checked separately. A compound sentence can yield multiple clauses.

**Force:** What the clause does to the agent's choices. Record one of these meanings, or multiple clauses if more than one applies:
- **Required:** The agent must perform or provide the specified action or result.
- **Prohibited:** The agent must refrain from the specified action or result.
- **Permitted:** The agent may perform the specified action; permission alone does not require performance.
- **Questioned:** The user requests information or an answer about the proposition.
- **Corrected:** The user replaces or amends an earlier clause. Record the superseded clause and the resulting clause.
- **Continued:** The user directs completion of an outstanding task, whose content comes from the earlier request.

**Actor:** The person or system assigned to perform the predicate. If the clause merely describes a fact, identify the subject of that fact without inventing an assigned actor.

**Predicate:** The action to perform, relation to establish, or state asserted or sought. For example, "modify," "belongs to," or "is complete."

**Target:** The entity or content the predicate applies to: an object, person, file, piece of information, result, or set of these. Record identifying details needed to distinguish it from other targets.

**Polarity:** Whether the proposition is affirmed or negated. "Modify A" and "do not modify A" differ in polarity. Record prohibition as force as well; polarity records the logical negation, while force records what the agent is required to do about it.

**Quantity:** The count or quantifier applied to the target or action: one, exactly three, at least three, every, some, none, and so on. Preserve exact, minimum, maximum, and universal meanings separately.

**Scope:** The domain over which the clause applies: which items, locations, time span, files, or cases are included or excluded. Quantity states how many within that domain; scope states what belongs to the domain. "All rows in Sheet A" has universal quantity and Sheet A as its scope.

**Condition:** A prerequisite or branch that determines when a clause applies. Record the triggering proposition and the required result for each branch, including "if," "unless," and "only when."

**Order:** A required sequence or dependency among clauses. "Inspect, then edit" makes inspection precede editing; the two actions are separate clauses linked by order.

**Timing:** When performance is due or when a condition or result must hold, including "now," a deadline, or a recurring interval. Timing differs from order: two actions can have a sequence without a clock deadline.

**Manner:** A constraint on how an action is carried out, such as using pixelated redaction or a specified method. Keep it distinct from the target and the result.

**Acceptance condition:** The observable state that would satisfy this clause, derived from its force, predicate, target, and controls. For a question, this is an answer responsive to the question; for a prohibition, it is the absence of the prohibited action within the relevant scope. Do not silently add a new requirement while deriving it.

**Provenance:** Metadata identifying the exact utterance or rule that supplies the clause and any earlier context used to resolve it. Provenance is not another logical control.

## Evaluation terms

**Violation:** A supported mismatch between P and an identified clause of U. Record the clause, provenance, affected part, kind of change, and observed support. A failure label alone is insufficient.

**Added requirement or action:** P introduces work, a constraint, or an action that U did not authorize or require.

**Omission:** P leaves out a required action, target, clause, or result.

**Narrowing:** P covers fewer members or cases than U requires.

**Broadening:** P covers additional members or cases beyond U's permitted domain.

**Reversal:** P changes the required polarity or force, such as doing what U prohibits.

**Changed control:** P changes a specified quantity, scope, condition, order, timing, or manner. Identify the control and the before/after values; do not use this label as a substitute for a more precise change.

**Unsupported completion claim:** P says an action is complete when the observable evidence does not establish that completion, or contradicts it.

**Pattern:** The abstract relation between a particular clause of U and P's change to it, independent of the task's wording or objects.

**Analogy:** A second U/P pair in which the same kind of clause part undergoes the same kind of change. The tasks and words may differ. A shared topic or a merely opposite outcome does not establish an analogy.

Evaluate in this order: construct U and retain provenance; split it into clauses and parts; observe P; identify an actual mismatch; then use patterns and analogies to recognize whether a test represents that mismatch. Examples help recognize violations but do not supply missing obligations.

## Focused execution test

**Promise instead of execution:** U already requires an authorized task to be performed. P echoes the task as a future commitment and ends the turn with the task outstanding. A later "proceed" points back to that outstanding request; it does not provide authorization that was missing from the original request.

## Completion after agreement

After a definition or assignment is agreed, immediately complete the corresponding work. Do not end the turn by echoing it, promising to do it later, or requesting a redundant "proceed." Preserve the agreed scope and report the completed result or the specific remaining blocker.
