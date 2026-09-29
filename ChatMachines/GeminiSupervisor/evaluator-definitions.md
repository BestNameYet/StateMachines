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

Resolve the user utterance against relevant context, then split U into independently checkable clauses. An inherited part is still part of the resolved clause. Mark an unresolved reference rather than inventing it.

Each clause has these **main parts**:

1. **Force:** What the clause does to the agent's choices.
2. **Actor or subject:** Who must act, or what the proposition is about.
3. **Predicate:** The action to perform, relation to establish, or state asserted or sought.
4. **Target:** The entity or content to which the predicate applies.
5. **Controls:** Constraints on the predicate, target, or satisfaction of the clause.

**Force subtypes** are required (must perform or provide), prohibited (must refrain), permitted (may perform without an obligation to do so), questioned (asks for information), corrected (replaces or amends an earlier clause), and continued (calls for an outstanding task to be carried out). If a sentence does more than one of these, split it into clauses or record the linked changes explicitly.

**Control subparts** are present only when the clause constrains them:

- **Polarity:** Whether the proposition is affirmed or negated. Force describes the agent's obligation; polarity describes the proposition's sign.
- **Quantity:** The number or quantifier, such as exactly three, at least three, every, some, or none.
- **Scope:** The domain included or excluded, such as which files, items, locations, periods, or cases. Quantity applies within that domain.
- **Condition:** The prerequisite or branch that determines when the clause applies, including if, unless, and only when.
- **Order:** A required sequence or dependency among clauses.
- **Timing:** When an action is due or a result must hold, including a deadline or recurrence.
- **Manner:** How the action must be carried out, including a specified method or format.

**Clause** is the unit of analysis, not another main part: a proposition that can be checked separately. A compound sentence may produce multiple clauses linked by controls.

**Provenance** is metadata, not a main part: the exact utterance or rule supplying the clause and any earlier context used to resolve it.

**Acceptance condition** is derived from the clause, not another main part: the precise observable result required by its force, actor or subject, predicate, target, and applicable controls. For a question, specify the information needed for an answer. For a prohibition, specify the forbidden action and the domain in which it must remain absent. Do not add a requirement while deriving the condition.

**Exact contract match** is an evaluation result, not a main part. Every clause in U must have a corresponding observed response or action in P satisfying its acceptance condition. Compare each main part and each applicable control subpart. A matching predicate cannot compensate for a different quantity, scope, polarity, condition, order, timing, or manner. A part U does not constrain cannot become a new match requirement. Preserve provenance for traceability; P need not repeat the source wording. An unresolved reference cannot be marked matched until resolved. If any required clause or applicable subpart is unmatched, the whole U/P pair is not an exact contract match.

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
