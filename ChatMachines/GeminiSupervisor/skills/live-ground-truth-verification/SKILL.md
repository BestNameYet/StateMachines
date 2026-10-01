---
name: live-ground-truth-verification
description: Verify execution, completion, status, failures, and resulting artifacts from exact live ground-truth sources before making or defending any materially execution-dependent claim. Trigger on literal matches and on semantic pattern, shape, or analogy to completion claims, task-status questions, execution-detail questions, artifact questions, evidence challenges, partial/qualified completion, retries, failures, and similar cases. Never use memory, prior assistant self-report, or generated summaries as ground truth.
---

# Live Ground-Truth Verification

## Purpose

Prevent unsupported claims about whether work was actually performed, completed, failed, partially completed, persisted, committed, sent, written, deleted, deployed, evaluated, or otherwise executed.

Agent self-report is not evidence. A prior assistant statement such as "done", "I committed it", "I checked it", "the workflow passed", or "the file exists" is an assertion to verify, not a source of truth.

Whenever this skill triggers, verification happens **before** the agent makes, repeats, defends, qualifies, corrects, or answers a materially execution-dependent claim.

## Semantic Trigger

Trigger whenever the current action, proposed response, or user question shares the **pattern**, **shape**, or **analogy** of any execution-verification case below. Do not require literal keyword matches.

Trigger when an agent is about to:

- claim an action is complete;
- claim a task is done;
- claim it performed, executed, ran, checked, inspected, read, wrote, edited, created, deleted, moved, copied, uploaded, downloaded, sent, committed, pushed, deployed, tested, evaluated, repaired, retried, restored, or persisted something;
- claim success, failure, partial success, partial failure, skipped work, blocked work, or no-op execution;
- qualify completion with a modifier or exception, such as "done except...", "mostly complete", "the code changed but wasn't committed", "the workflow ran but did not push", or "everything passed except one test";
- state progress or status where the truth depends on actual execution state;
- state that another model, agent, evaluator, workflow, service, or human returned a particular result;
- state that an artifact exists, does not exist, changed, did not change, is current, is stale, was generated, was uploaded, was committed, or contains particular content;
- state that a commit, message, file, document, spreadsheet, slide deck, database row, calendar event, email, issue, pull request, deployment, build, workflow, test run, API request, or tool call occurred;
- retract or correct an earlier execution claim;
- reconcile two conflicting execution claims;
- summarize execution history;
- recover work after interruption or uncertainty about what actually happened.

Trigger when the user asks, directly or indirectly:

- "Did you do it?"
- "Is it done?"
- "Did that work?"
- "Did you commit it?"
- "Did Gemini pass it?"
- "What exactly happened?"
- "What did you actually run?"
- "What did the evaluator say?"
- "What did the workflow return?"
- "What failed?"
- "What is still incomplete?"
- "Where is the file?"
- "Does the file exist?"
- "What is in the file?"
- "Which version is current?"
- "Was the document created?"
- "Was the message sent?"
- "Was the change persisted?"
- "Show me the result."
- "Prove it."
- "Verify that."
- "How do you know?"
- "What source says that?"

Also trigger for semantically analogous questions even when none of those words appear. The operative test is:

> Would the correctness of the next answer materially depend on whether an action actually occurred, what exact result it produced, or what exact artifact/state currently exists?

If yes, trigger this skill.

## Required Immediate Action

Before answering the execution-dependent part of the request:

1. Identify every material factual assertion whose truth depends on execution or artifact state.
2. Identify the exact live source or sources that can establish each assertion.
3. Retrieve those sources now.
4. Read the relevant source content **verbatim** before paraphrasing it.
5. Compare the proposed assertion against the retrieved evidence.
6. Assign an evidence status.
7. Only then answer the user or make the claim.

Do not answer first and verify afterward.

## Sources That Are Never Ground Truth

The following are never sufficient as execution ground truth by themselves:

- model memory;
- conversation memory;
- saved memory or personalization summaries;
- a prior assistant message claiming completion;
- an agent's own self-description of what it did;
- a generated summary of execution;
- a plan describing what was supposed to happen;
- an intention such as "I will do it";
- an acknowledgement such as "done" without independent evidence;
- an inferred action based on what normally happens;
- a stale cached view when a live authoritative source is available;
- an evaluator summary when the exact evaluator return is available;
- an artifact description when the artifact itself is available.

These may help locate a source. They may not substitute for the source.

## Ground-Truth Source Taxonomy

The list below is intentionally non-exhaustive. Select the source closest to the actual action or resulting state.

### Canonical artifact sources

- current file bytes or exact text at the canonical path;
- current document, spreadsheet, presentation, image, archive, or generated artifact itself;
- exact current object contents from the system that owns the artifact;
- filesystem existence, path, metadata, size, timestamps, or content hash when those properties are material;
- artifact manifests, checksums, package contents, and version identifiers.

### Source-control sources

- exact Git blob contents;
- tree entries;
- branch refs;
- commit objects;
- commit diffs;
- repository file contents at the relevant ref;
- pull-request state and exact patches;
- commit status/check results.

A statement such as "committed" requires evidence that the relevant commit/ref actually contains the claimed change. A local edit alone is not proof of a commit.

### Execution-runtime sources

- exact tool-call responses;
- process exit status;
- stdout/stderr;
- runtime logs;
- workflow-run records;
- workflow-job records;
- individual workflow-step results;
- test-run output;
- build output;
- deployment records;
- service-side operation receipts;
- API HTTP status and exact response body;
- transaction IDs or operation IDs.

### Procedure/state-machine sources

- current `state.json` or equivalent live state object;
- exact message-stream entries;
- exact persistent-store records;
- exact `nextmessage` or trigger payloads;
- exact return-schema records;
- exact transition keys and transition values;
- exact supervisor/evaluator/gate returns;
- exact failure arrays;
- exact granular evaluation entries;
- exact role-verification records;
- current-step and remaining-step fields.

When another actor evaluated something, retrieve that actor's **verbatim return**, not merely another model's recollection of it.

### Messaging and collaboration sources

- sent-message records rather than drafted text;
- exact email message/thread records;
- exact Slack/Teams/chat messages;
- issue and pull-request comments;
- delivery/send status where available;
- recipient, timestamp, and message ID where material.

A draft is evidence that a draft exists, not that a message was sent.

### Cloud application sources

- native Drive/Docs/Sheets/Slides records;
- calendar event objects;
- task-management records;
- issue-tracker records;
- deployment-console records;
- cloud-storage object metadata and contents;
- current permissions/sharing records when access is part of the claim.

### Database and transaction sources

- live database rows;
- transaction logs;
- mutation receipts;
- audit tables;
- versioned records;
- query results from the authoritative datastore.

### External evaluator and multi-agent sources

- verbatim evaluator responses;
- verbatim semantic-operator outputs;
- verbatim supervisor responses;
- verbatim critic/reviewer outputs;
- exact nested evaluation entries;
- exact pass/fail fields and comments;
- exact repair or retry responses.

Never replace these with "Gemini said it passed" or a similar summary when the exact record can be retrieved.

### Source-code/configuration sources

- the exact source code actually present at the executed ref;
- configuration actually consumed by the runtime;
- workflow definition actually used by the run;
- deployment manifest actually used;
- environment-visible configuration when it is directly inspectable and safe to inspect.

Do not infer executed behavior solely from intended source code when runtime evidence is available.

### User-provided evidence

A current user-provided artifact, screenshot, log, message, or record may be primary evidence for what it directly shows. Do not extend it beyond what is visible or established.

## Authority and Freshness Rules

For every source used, determine:

- **Authority:** Does this system own the fact being asserted?
- **Freshness:** Does this represent the relevant current or historical point in time?
- **Execution proximity:** How close is it to the actual action/result?
- **Specificity:** Does it establish the exact claim or only a related fact?
- **Integrity:** Is it the exact source, or a summary/transformation of one?

Prefer the most authoritative, freshest, execution-proximate, specific, exact source.

Historical records are valid ground truth for historical claims. They are not automatically ground truth for current state.

## Conflicting Sources

When live sources conflict:

1. Do not silently choose the convenient result.
2. Quote or preserve the material conflicting values.
3. Identify each source and locator.
4. Identify source freshness and authority.
5. Explain what each source proves and does not prove.
6. Resolve the conflict only when a more authoritative source actually establishes the result.
7. Otherwise classify the claim as `UNKNOWN` or `PARTIAL` as appropriate.

## Evidence Status

Every material execution assertion governed by this skill must resolve to one of these statuses:

- `VERIFIED` — live authoritative evidence directly supports the complete assertion.
- `CONTRADICTED` — live authoritative evidence directly conflicts with the assertion.
- `PARTIAL` — evidence supports only part of the claimed action/result or shows an explicit incomplete/qualified state.
- `UNKNOWN` — the necessary authoritative source was not retrieved, is unavailable, is ambiguous, or conflicts without resolution.
- `NOT EXECUTED` — live evidence establishes that the claimed/requested execution did not occur.

Do not translate `UNKNOWN` into success.

Do not translate an attempted action into `VERIFIED` completion.

Do not translate a successful intermediate step into completion of the whole task.

## Completion Claims With Modifiers or Exceptions

For statements such as:

- "done except X";
- "mostly done";
- "committed but not pushed";
- "created locally but not uploaded";
- "the workflow passed but the deployment failed";
- "all tests passed except one";

verify every material component separately. Preserve the modifier. Do not collapse the claim into a simple success/failure label.

Example:

- Git blob contains the edit: `VERIFIED` for edit existence.
- branch ref does not contain that blob: `NOT EXECUTED` for commit-to-branch claim.
- no remote push evidence: `UNKNOWN` or `NOT EXECUTED` depending on the live Git state.

## Artifact Verification

When the user asks about an artifact that may have resulted from execution, verify at least the properties material to the question:

- existence;
- canonical location;
- exact filename/path/ID;
- current version/ref;
- content or relevant excerpt;
- size/hash when useful;
- creation or modification state;
- whether it was persisted, committed, uploaded, sent, or merely generated locally;
- relationship to the requested task.

Do not invent a sandbox path, cloud URL, file ID, commit, message ID, or artifact location from memory.

## Evidence Presentation

When reporting execution facts:

- identify the source;
- give a re-findable locator such as path, ref, record key, message ID, run ID, job ID, commit SHA, schema path, or artifact ID;
- include the exact material value or a verbatim excerpt when feasible;
- distinguish direct observation from inference;
- state missing evidence explicitly;
- keep historical evidence labeled as historical.

## Trigger Examples

The skill **must trigger** in these examples:

1. Agent: "I updated `Agents.md`."
2. Agent: "The task is complete."
3. Agent: "I committed the change."
4. Agent: "I ran the workflow and it passed."
5. Agent: "Everything is done except the final upload."
6. Agent: "The edit exists locally but isn't pushed."
7. User: "Did you actually do it?"
8. User: "Did the commit work?"
9. User: "What did Gemini return?"
10. User: "Why did Step 3 fail?"
11. User: "Which steps actually passed?"
12. User: "Where is the document you created?"
13. User: "Show me what is in that file."
14. User: "Was the email sent or just drafted?"
15. User: "Did you delete the old file?"
16. User: "What exactly did the workflow execute?"
17. User: "You said it was done before. Is that true?"
18. Two agents disagree about whether a task completed.
19. An interrupted conversation resumes and the agent is about to claim what was already completed.
20. The agent is about to summarize a sequence of commits, writes, tool calls, or external evaluations.
21. The agent is about to say an artifact does not exist.
22. The user asks whether a retry fixed a previous failure.
23. A response depends on whether a database mutation actually occurred.
24. A response depends on whether a deployment is live.
25. A response depends on whether a file is the current version.

Semantic analogies also trigger. For example, "Is the door locked?" after an agent-controlled smart-lock action has the same shape as "Did the deployment happen?": both require checking the live system that owns the state before claiming the action succeeded.

## Non-Examples

Do not invoke this skill merely because the user asks a timeless factual question that does not depend on prior execution or artifact state.

Examples:

- "What is a Git commit?"
- "Explain JSON."
- "What does `eval` do in JavaScript?"

However, "What did the last `eval` call return?" **does** trigger because it asks about an executed event.

## Mandatory Verification Procedure

Use this procedure every time the skill triggers:

1. **Extract claims.** List the execution-dependent claims the answer would make.
2. **Map sources.** For each claim, name the live authoritative source that can prove or disprove it.
3. **Retrieve now.** Access the source during the current turn. Do not use memory as a substitute.
4. **Read exact evidence.** Capture the relevant verbatim value, text, record, or artifact content.
5. **Check scope.** Verify that the evidence proves the entire claim, including modifiers, target, quantity, sequence, and persistence level.
6. **Check freshness.** Confirm the evidence corresponds to the relevant point in time and version/ref.
7. **Resolve conflicts.** Compare conflicting sources explicitly.
8. **Classify status.** Use `VERIFIED`, `CONTRADICTED`, `PARTIAL`, `UNKNOWN`, or `NOT EXECUTED`.
9. **Answer from evidence.** State only what the sources establish.
10. **Provide locators.** Make the evidence re-findable.

## Failure Rules

The agent violates this skill if it:

- makes a completion/execution claim before checking the live source;
- relies on memory as execution evidence;
- relies on its own prior statement as evidence;
- says "I checked" without a live-source retrieval in the current verification path;
- reports an evaluator result from memory instead of the evaluator record;
- claims an artifact exists without checking its authoritative location;
- treats a plan, attempt, or tool invocation as proof of successful completion;
- hides or omits a known failure, partial result, exception, or contradiction;
- refuses to verify when the user questions execution and a live source is available;
- fabricates a source, locator, identifier, path, commit, message, run, or record;
- silently downgrades a missing source into an assumption;
- silently substitutes a stale historical record for current state.

## Core Invariant

**No materially execution-dependent assertion may outrun its evidence.**

When the exact live ground truth has not been retrieved, say `UNKNOWN` and identify the missing source. Do not guess, remember, rationalize, or protect an earlier agent claim.
