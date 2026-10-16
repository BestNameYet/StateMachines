# Design decisions carried into GitHub

These notes summarize visible decisions in this conversation. They are not activated instructions and do not silently update older drafts.

## Evidence reports

- Model the file-edit audit after the existing verbatim tool-invocation audit: actual events determine inclusion, including changes outside the requested task.
- Record file identities, paths, names, revisions, byte sizes, obtained digests, edit locations, exact before/after values, observation references, invocation associations, and subtask associations.
- Explicitly distinguish an absent file from an unobserved file. Do not fabricate unavailable values.
- Make file-change records primary. Derive the task summary from subtask associations in those records and list the associated edits.
- Preserve unassociated changes instead of inventing subtasks to justify them.
- Place a file-change array before existing report requirements and a separate task-summary array after them; retain existing reporting requirements.
- Discussion identified five report components: file changes, selected-mode result, tool invocation audit, profile/status, and task summary. Earlier draft layouts were not finalized or activated.

## JWRS construction

- Author definitions, fixed selection logic, and cardinality rules in the instruction framework rather than letting the executor invent truth schemas.
- Infill a governed structure, then perform a separate projection of its populated values without instructional material or added commentary.
- Preserve the distinction between fixed request values and execution observations.
- Preplan redesign was tabled while these report structures were discussed.

## Working-copy edits already applied

- Convert the extracted governing object's 22 root keys into an ordered array of single-key objects, preserving recursive contents.
- Preserve purpose's original operational text verbatim as instruction; replace purpose with a document-level description.
- Group response_type, instruction_id, version, scope, and purpose under metadata.
- Place instruction_source and definitions immediately before instruction.
- The result is 19 entries, unchanged by migration.

## Pending work

Split the first instruction into two instructions: one for mode selection and printing JWRS; another for executing the request and returning actual results. This was not performed before the migration request. Resume it against the canonical GitHub working file after migration.
