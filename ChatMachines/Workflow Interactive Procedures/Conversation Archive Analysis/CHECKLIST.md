# Analysis execution checklist

This is the execution order for the archive-analysis project. Use the existing [AGENTS Procedure](../AGENTS%20Procedure/README.md) to carry out the work. Check items only after verifying their stated outputs. An uploaded result or completed API call is not proof of a valid analysis.

## 0. Execution substrate — complete

- [x] Build the Gemini parallelizer (parallel-gemini/ and Conversation Parallel Gemini workflow).
- [x] Accept an array of repository paths and a shared assignment instruction.
- [x] Run independent assignments concurrently with bounded parallelism.
- [x] Preserve separate responses, source manifests, hashes, and task outcomes.
- [x] Collect results and identify failed or missing assignments without cancelling successful jobs.
- [x] Verify two real Gemini jobs running in parallel and successful result collection.
- [x] Return the commit trigger to disabled after the smoke test.

Evidence: [AGENTS build run #13](https://github.com/BestNameYet/StateMachines/issues/13) and [successful live parallel test](https://github.com/BestNameYet/StateMachines/actions/runs/38817942348). The two analysis jobs both started at 22:34:04 UTC on October 15, 2026 and completed successfully. This verifies the substrate, not analysis of the conversation archive.

The parallelizer is already built. Do not include rebuilding it as an outstanding prerequisite.

## 1. Retrieve and establish the source — sequential foundation

- [ ] Retrieve the linked Library archive and record its current identity, version, filename, size, and hash.
- [ ] Inspect its actual format, contents, date coverage, branches, attachments, and any parsing problems.
- [ ] Preserve an unchanged source and document where source and derived data will be held.
- [ ] Determine how the workers will access the material. The current substrate accepts repository paths; Library access/import is not built into it. Resolve this before launching archive jobs, without automatically committing private conversations.
- [ ] Establish whether 2024–2025 and present-day material are both available; identify missing comparison sources.

Output: source manifest, format/coverage report, and an explicit worker-access arrangement.

Do not subdivide based only on the file's apparent size or assume the archive contains the complete account.

## 2. Extract and index — establish reliable work units

- [ ] Parse conversations and messages while preserving original text, identifiers, dates, authors, branch relationships, and attachment references.
- [ ] Give every conversation and message a stable reference back to the original.
- [ ] Build the inventory: dates, titles, message counts, lengths, and metadata availability.
- [ ] Verify extraction counts and account for omitted, duplicate, empty, malformed, or unsupported records.
- [ ] Create the coverage ledger, distinguishing inventoried, searched, read, analyzed for a named question, synthesized, and verified.
- [ ] Establish attribution conventions for user statements, quoted third-party messages, assistant output, reports, and interpretations.

Output: indexed source records, inventory, reference scheme, parsing exceptions, and initial coverage ledger.

Parallel opportunity: after the format and reference scheme are fixed, independent conversations can be extracted in separate jobs. Combine and validate counts centrally before interpretation.

## 3. Design the analysis and subdivision — inspect, then decide

- [ ] Inspect representative conversations to identify the kinds of questions and contexts present. Mark this as sampling.
- [ ] Define and prioritize the user's analysis questions and intended practical outputs.
- [ ] Populate the analysis matrix: question, subject, perspective, source material, method, evidence requirements, coverage standard, limitations, output, and next prompt.
- [ ] Distinguish the user, people discussed, interactions, and ChatGPT as analytical subjects.
- [ ] Define comparison periods from available dates rather than assumed eras.
- [ ] Choose chunk boundaries, model input budgets, overlap, branch handling, and context needed for each question.
- [ ] Keep conversations intact where feasible; link oversized conversation parts and related conversations.
- [ ] Specify how overlap is tracked so repeated passages do not become independent evidence.
- [ ] Generate chunk manifests and verify every source message is accounted for.
- [ ] Define common output conventions for findings, citations, contradictions, uncertainty, and unanswered questions.

Output: analysis matrix, chunking decision, chunk manifest, and shared analytical conventions.

Parallel opportunity: candidate approaches and independent question/perspective designs can be proposed concurrently from the same source inventory. Consolidate them before launching the full analytical pass. The final subdivision depends on those decisions.

## 4. Prepare parallel assignments — before model calls

- [ ] For each assignment, name its source path, question, perspective, relevant period, expected output, and dependencies.
- [ ] Include the original message references and sufficient contextual material in every assignment.
- [ ] Include shared definitions and attribution/evidence conventions consistently.
- [ ] Build one paths array per group of independent assignments sharing the same instruction.
- [ ] Set the concurrency and establish a workload/cost estimate from measured source sizes.
- [ ] Check each assignment against both the substrate's byte limit and the selected model's token limits.
- [ ] Define what constitutes failed, incomplete, or missing output and how it will be retried.
- [ ] Run a small pilot, inspect its actual results against source passages, and revise assignment design before scaling.

Output: assignment manifest, prompts, pilot findings, and batches ready for execution.

Current substrate boundary: one batch uses one shared instruction. Different analytical lenses should initially use separate batches/instructions over the relevant paths. Arbitrary per-path instructions, context assembly, and automated dependencies are not existing features; build them only if the chosen plan needs them.

## 5. Execute independent analytical passes — parallel

### Broad topic discovery

- [ ] Analyze independent chunks for topics, recurring concerns, questions, projects, and unfinished investigations.
- [ ] Return source-linked topic candidates and context needed to revisit them.
- [ ] Preserve topics outside relationship material rather than allowing that material to dominate every assignment.

### The user

- [ ] Examine expressed concerns, assumptions, emotions, decisions, and changes in interpretation.
- [ ] Distinguish explicit statements from inferred motives.
- [ ] Identify questions the user was trying to resolve and evidence of whether conversations helped.

### People discussed

- [ ] Separate their direct words from user reports and ChatGPT interpretations.
- [ ] Assess reported behavior with contradictory evidence and alternative explanations.
- [ ] Establish the provenance of diagnostic labels without treating labels as independent explanations or diagnosing from the archive.

### Relationships and interactions

- [ ] Identify recurring interaction sequences, conflict, boundaries, repair, and decisions.
- [ ] Link patterns across relevant conversations without erasing context or treating repetition as corroboration.

### ChatGPT's contribution

- [ ] Identify advice, interpretations, assumptions, contradictions, corrections, and possible influence on later discussion.
- [ ] Track when an assistant-introduced interpretation is later repeated as if independently established.

### Evolution of use

- [ ] Analyze available periods for purpose, user role, instruction specificity, interaction style, trust/verification, tools/artifacts, and outcomes.
- [ ] Collect dated examples of both changes and continuities.
- [ ] Identify uncertainty about model capabilities, available features, and circumstances.

For every pass:

- [ ] Save original inputs, output, source manifests, task outcome, and coverage updates.
- [ ] Identify failed/missing jobs and retry only the affected assignments.
- [ ] Inspect output quality; successful API completion alone does not satisfy an analysis question.

Parallel opportunity: independent chunks within each pass can run simultaneously. Different perspectives can also run concurrently when they have the required context and no dependency on another pass. Not every chunk needs every lens.

Output: evidence-linked findings, topic candidates, exceptions, and per-question coverage records.

## 6. Combine findings — after their inputs are ready

- [ ] Consolidate topic candidates and link related discussions across chunks.
- [ ] Build the revisit catalog: significance, original question, where it stopped, unresolved work, source references, and next useful prompt.
- [ ] Assemble event/discussion timelines; distinguish event dates from dates of discussion.
- [ ] Synthesize each analytical perspective while preserving provenance and disagreement.
- [ ] Compare usage periods using dated examples, continuities, exceptions, and missing data.
- [ ] Separate changes in user behavior from changes in models/features/circumstances where the evidence permits.
- [ ] Reconcile contradictions without silently selecting the most convenient result.
- [ ] Connect perspectives without collapsing the user, other people, interactions, and ChatGPT into one explanation.
- [ ] Return to original passages whenever synthesis depends on context not carried by the individual findings.

Parallel opportunity: topic catalog, chronological reconstruction, perspective syntheses, and usage comparisons may proceed concurrently once each one's source findings are complete. Cross-perspective synthesis follows those outputs.

Output: topic catalog, timelines, perspective analyses, usage comparison, and cross-perspective findings.

## 7. Verify coverage and conclusions — independent checks

- [ ] Verify source citations and quotations against original messages.
- [ ] Check whether extraction/chunking accounted for the complete intended source.
- [ ] Check whether each question received its declared level of coverage; distinguish sampling from exhaustive review.
- [ ] Search for and inspect contradictory passages and plausible alternative explanations.
- [ ] Identify claims based on repeated assertions or repeated model interpretations rather than independent evidence.
- [ ] Check that original references survive synthesis and that conclusions are not merely summaries of summaries.
- [ ] Check that diagnostic labels and inferred motives are represented according to their evidence.
- [ ] Verify the actual saved outputs and classify every outstanding analysis question.
- [ ] Route missing evidence or failed assignments back to the relevant stage.

Parallel opportunity: citation checks can be partitioned; coverage accounting and independent reviews can run concurrently. Final conclusions must incorporate their results.

Output: verification report, corrected findings, coverage ledger, and unresolved limitations.

## 8. Deliver and preserve

- [ ] Deliver a navigable topic/revisit catalog.
- [ ] Deliver the requested perspective analyses and relevant timelines.
- [ ] Deliver the dated comparison of ChatGPT use from 2024–2025 to the present, or state exactly what comparison data is missing.
- [ ] Provide remaining questions, practical next steps, and prompts for continuing investigations.
- [ ] Preserve stable links to evidence, analysis outputs, coverage, and verification results.
- [ ] Preserve long-term deliverables outside expiring Actions artifacts as appropriate.
- [ ] Save a continuation record stating what is complete, what remains, and where to resume.
- [ ] Update this checklist from verified results and complete the AGENTS Procedure run.

## Dependency and parallelization map

| Stage | Must wait for | Parallel work available |
| --- | --- | --- |
| Source inspection | Source retrieval | Limited; first establish the format and available periods. |
| Extraction/index | Format and reference conventions | Independent conversations or partitions. |
| Analysis/chunk design | Inventory and representative inspection | Candidate lenses and methods; consolidate decisions. |
| Assignment pilot | Chunk manifest and common conventions | Small independent assignments; inspect before scaling. |
| Analytical passes | Validated assignment design | Independent chunks and context-complete perspectives. |
| Synthesis | Relevant analytical outputs | Independent topic, timeline, perspective, and usage syntheses. |
| Verification | Source references and findings | Citation partitions, coverage checks, and independent reviews. |
| Final delivery | Verified/corrected outputs | Preparation can overlap; completion waits for checks. |

Do not parallelize a downstream task before its required evidence or design decisions exist. The parallelizer schedules independent calls; this plan specifies which calls should be independent and when they are ready.
