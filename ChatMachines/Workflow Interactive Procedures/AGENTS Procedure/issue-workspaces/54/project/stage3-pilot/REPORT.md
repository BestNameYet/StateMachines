# Stage 3 topic-guided sampling pilot

## Goal and result

Use the completed TF-IDF/NMF run and merged catalog to inspect representative source windows, identify question/context types, and produce the initial analysis matrix and shared output conventions. This completes an initial, explicitly sampled inspection milestone, not the whole Stage 3 analysis design or the final label catalog.

Inputs: [four-partition run](https://github.com/BestNameYet/StateMachines/actions/runs/39028648832), [merger run](https://github.com/BestNameYet/StateMachines/actions/runs/39028957505), and the merger's 54-topic catalog / source-referenced assignments. The merger covered 134 files, 1,334 conversations and 27,283 prepared document windows; these are computational coverage counts, not counts of semantically read conversations.

## Sampling method

Judgment sample of eight candidate topics (0, 7, 11, 21, 37, 43, 49, 53), chosen for varied question/context types and to include the filler-dominated cluster. For each, select its first saved representative document, reopen the exact source bin/record/node, and inspect the target, up to three ancestor nodes and one direct child on that branch. Eight bounded windows from eight distinct conversations were read; the complete conversations were not read. This is neither random nor prevalence-estimating. Topic representatives can favor short, lexically concentrated messages and are not guaranteed semantically typical.

The [sampling record](sampling-record.json) preserves target references, inspected context node IDs, conversation titles, candidate descriptions, and evidence limitations. No raw source messages are copied here. Parent links establish ancestry; alternate branches are not concatenated.

## Observed question/context types

| Candidate topic | Source-window observation | Implication |
|---|---|---|
| 0 | User questions why generated space-force commanders are aliens rather than humans. | Filler words do not identify a substantive topic; do not label this relationship material. |
| 7 | User distinguishes two resonator/flow mechanisms after a compactness/noise request. | Technical clarification needs preceding design constraints. |
| 11 | User corrects a shopping-list assumption about mounted thermometers. | Track operational constraints and corrections separately from broad food topics. |
| 21 | Hardware/cart advice for a tarp enclosure follows a message with no text. | Missing image payload limits verification of the assistant's visual claims. |
| 37 | User requests another source for an assistant-cited birth-record rule. | Separate source-checking behavior from truth of the legal claims. |
| 43 | User asks for a constraint-bound sprint-plan artifact and clarifies inputs/outputs. | Distinguish procedural model design from claims about official Scrum. |
| 49 | User removes unsupported offerings from business-profile copy. | Same food business can have a distinct marketing/copy-editing purpose. |
| 53 | Application-letter revisions mix employment goals and interpersonal context. | Preserve user reports versus assistant-authored draft text; no hiring outcome is established. |

These observations concern the inspected source windows only. They do not validate the entire topic group, external facts, technical recommendations, legal statements, or practical outcomes.

## Concrete outputs

- [Candidate topic index](candidate-topic-index.json): all 54 merged groups with keywords, model provenance and original representative references. All are marked provisional; it is a retrieval aid.
- [Sampling record](sampling-record.json): eight reviewed windows with source references.
- [Analysis matrix](analysis-matrix.json): five proposed questions, material, subjects/perspectives, methods, evidence requirements, coverage, limitations, intended outputs and next prompts. Priority is proposed, not user-approved.
- [Output conventions](output-conventions.json): separate topic/purpose/perspective/outcome dimensions, attribution, source references, ambiguity, branch handling and overlap rules.

## Remaining work

Expand sampling across date/length/branch strata and diverse model-score levels; audit more merged-topic members and contradictory examples; validate necessary field paths and explicit retention decisions; prioritize questions with the user; define exchange-based targets/context; compare passage sizes on the same conversations; inspect topic stability and mixed subjects before final catalog consolidation. The current message-window model is a retrieval pilot, not a validated classification-passage design.

Source originals are unchanged. Nothing here authorizes dropping unlisted keys or treating repeated assistant assertions as independent evidence.
