# Evaluator definitions

These definitions govern the semantic operator's comparison of an agent response with the instruction it must satisfy. They are separate from Agents.md.

## User request

The user's utterance, resolved against the relevant conversation context. Preserve the utterance verbatim and record the context used to resolve references such as "it," "that," and "proceed." A short utterance can inherit its action, target, and constraints from an outstanding user request. A restatement by the agent does not replace the user's request or create new authority.

## Context rules

Applicable instructions and constraints that are already in force for the request. Record each rule with its source and exact applicable content. Sources may include the governing steps, explicit prior user decisions recorded in Persistent Storage, and rules established by the conversation. Failure Examples are evidence for recognizing failures; an example does not become an independent rule merely by appearing there.

## Effective instruction (U)

The user request, resolved in context, together with the applicable context rules. U is the complete contract for the agent's response or action. Preserve the source of every obligation so that the operator can distinguish the user's words from a context rule. Do not infer an additional obligation solely from similarity to a failure example.

## Contract parts

Decompose U into atomic obligations. For each obligation, identify:

- **Force:** required, prohibited, permitted, questioned, corrected, or continued.
- **Actor:** who must act, when applicable.
- **Predicate:** the action, relation, or state at issue.
- **Target:** the object, person, information, or artifact to which the predicate applies.
- **Logical controls:** polarity, quantity, scope, condition, order, timing, and manner, each separately when present.
- **Acceptance condition:** what would satisfy the obligation.
- **Provenance:** the exact user utterance or applicable rule and the context used to resolve any implicit parts.

A part may be implicit in the current utterance yet recoverable from prior context. Do not classify an unresolved part as absent. If the context does not resolve it, mark it unresolved rather than inventing a value. Provenance is metadata about an obligation, not another logical control.

## Agent response (P)

The agent's proposed words, actions, and claimed results being evaluated. Preserve their exact observable form. Keep a promise, an attempted action, and a completed action distinct.

## Violation

A violation is a supported relation between a specific obligation in U and P: P adds an unauthorized obligation or action, omits a required one, narrows or broadens its scope, reverses its polarity, changes another control, fails an applicable rule, or claims a result inconsistent with the observed action or evidence. Record the obligation, source, affected contract part, change, and observable support. A failure label without an identified obligation is insufficient.

## Pattern and analogy

A pattern describes the violation relation abstracted from the particular words, task, and objects. An analogy matches when another U/P pair preserves that relation, including the affected contract part and the kind of change, even though its subject matter and wording differ. A shared topic alone is not a match. Establish the obligation and violation first; use examples to recognize the relation, not to create new obligations.

## Focused execution test

**Promise instead of execution:** U already requires an authorized task to be performed. P echoes the task as a future commitment and ends the turn with the task outstanding. "Proceed" in the next user turn refers back to the outstanding request; it does not supply authorization that was absent from the original request.

## Completion after agreement

After a definition or assignment is agreed, immediately complete the corresponding work. Do not end the turn by echoing it, promising to do it later, or requesting a redundant "proceed." Preserve the agreed scope and report the completed result or the specific remaining blocker.
