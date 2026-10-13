# Rationalize the AGENTS working document

Review and rewrite the adjacent AGENTS-root-array.json comprehensively. The user is handing this task to Gemini because the previous assistant repeatedly failed to consolidate and normalize the procedure. Treat the current file as an unfinished working draft, not a validated specification.

## What the previous assistant kept getting wrong

The assistant patched whichever problem the user pointed out, then claimed broad consistency without evaluating the whole procedure in context. It confused mechanical checks—valid JSON, matching references, occurrence counts—with a coherent instruction design. Passing those checks did not establish that the sections made sense together.

It treated consolidation as spelling normalization and missed semantic duplication: differently named or differently worded definitions can describe the same concept, or one definition can already cover another. It accumulated overlapping definitions, rules, schemas, output wrappers, and examples instead of assigning each distinct requirement one authoritative location.

It conflated the selected mode value with the complete mode-selection process. The user wanted the full selector as its own object, distinct from state-change questions. The assistant initially added a mode question as though that were the entire process.

It introduced distinctions the user rejected. In this framework basis and source are the same concept. It renamed fixed to invariants and expanded a simple idea unnecessarily. It reused property/properties after the user had eliminated that terminology.

It added routing metadata, phase labels and output destinations that did not correspond cleanly to actual objects. It added rules to question sets when the user requested local input definitions followed by questions. It moved definitions between global and local containers repeatedly instead of establishing one consistent template.

It applied camelCase indiscriminately to instructions, semantic labels, prose and questions. It then added unwanted backticks, mangled question text into identifier-like keys, and corrected that with further patches. The result accumulated inconsistent conventions.

It classified captured variables as insufficiently used because no additional operation consumed them. That was the wrong criterion: asking for an input and returning its value is sufficient use. All 20 declared input variables were subsequently checked for a capture question and return. This does not prove that every other field or semantic definition is necessary.

It produced oversized inventories that mixed real duplicate concepts, possible overlaps, structural fields, literal values and status enums without a usable decision about consolidation. Its claimed comprehensive reviews missed non-variable camelCase fields and a dangling invocation-schema reference.

It deleted every example collection during deduplication. The user explicitly wants useful few-shot examples. The right correction is a consistent, purposeful example structure, not blanket removal or repeated copies of the same example.

It sometimes described a requested correction without applying it. Other edits were saved after incomplete validation, and later patches repaired consequences of earlier renames. Do not rely on the assistant's completion claims or old audit reports as evidence that the current file is sound.

## User's intended design

Produce a coherent natural-language executable procedure with symmetrical, templated instruction sections. Rationalize the whole document before making local naming changes.

Use a common template for question sets:
- A plain-language instruction or question-set object.
- An inputs object inside that owning object.
- Each input's definition and necessary type information, defined once and immediately before the questions that capture it.
- Actual questions referring to the input definition through a variable designator and returning the captured value.
- Consistently structured, useful few-shot examples.

Do not add a standalone rule to every question set. A mode-selection decision process can contain the distinct selection logic it actually needs; do not duplicate that logic in a second rule, a purpose statement, a definition and a separate instruction.

Use ordered arrays where order matters. Do not rely on object-member order to establish procedural sequencing. Preserve the user's decision that the selection process uses an array. The earlier priority and default fields were explicitly removed as redundant with the mode conditions.

Keep the user-request object separate from the state-change object. The user-request section owns the verbatim prompt, interpretation, goal and scope. State-change questions refer to those captured inputs and own the relevant state inputs.

Keep the mode selector separate from state change. Its input definitions belong inside the selector. The selection rationale must be requested and returned, and the profile question can directly use that rationale and the mode descriptions. A duplicate selectionRule was removed because its content was already covered.

Separate straight semantic definitions from captured variables. Semantic definitions are untyped and have ordinary readable names. Typed entries are variables to capture; each needs an actual capture question and return. Locality supplies their context: do not reintroduce capture-phase designations, destination metadata or a second global variable registry.

Use camelCase for variable identifiers. In prose, refer to variables using the existing ${name} designator and definitions using ${name.definition}. Instruction titles and semantic labels are ordinary language, not camelCase identifiers. Do not add backticks or a new naming-convention object. Structural fields should be assessed for their actual role, rather than assumed to be variables just because they are camelCase.

Define basis once. It is the authoritative information reference from which state and aspect values are established and verified; inspect that information to verify assertions. Do not invent a separate source concept or reuse basis as an unrelated selector label or source wrapper.

Use aspect for state features. Do not revive property/properties as a competing term. Fixed means exactly: "These aspects remain unchanged." Its records identify aspects and the values to preserve. Keep that concept simple.

Avoid a redundant provenance object. The existing questions capture the current backing file ID and persistent Library file ID directly from live retrieval metadata. Those IDs are distinct. They must not be fabricated, substituted or taken from stale examples. The original agentsMdProvenance wrapper was removed because it duplicated these captures.

A variable is used if a question requests it and returns the value. Evaluate other definitions and fields separately for real necessity. Do not remove a structural field merely because its name is not referenced in prose. Do remove duplicated meaning or dead abstractions after tracing their actual role.

## Behavior and constraints to preserve

Preserve the substantive requirements of the original procedure while eliminating repeated statements:
- Load the complete current applicable governing instruction and establish its actual identifiers.
- Preserve the exact user prompt and the user's operative objective, ordered operations, targets, quantities, limits, procedure, environment and required evidence.
- Select exactly one of accountability, fidelity or minimal according to the request.
- Print a complete JWRS projection before substantive task execution; include the exact prompt, actual identifiers and explicit return contract.
- Execute the requested work in the same turn. A projection, plan, script, attempted invocation or status claim is not the requested result.
- The original user request controls if the projection is wrong; publish a corrected projection before materially changed operations.
- Continue useful authorized work after failures. Obtain available prerequisites, recover within prescribed methods and environments, complete independent work, and stop only when obligations are fulfilled or no useful authorized continuation remains.
- Never substitute a different runtime, transport, browser, actor or verification method for an identity-specific request.
- Verify actual outcomes and artifacts from current evidence. Do not infer completion from a successful invocation, absence from one failed search, or exhaustive coverage from a sample.
- Capture actual tool invocations truthfully, chronologically and without exposing secrets.
- Inspect changed aspects and fixed aspects after execution; distinguish intended values from observed final values.
- Select final status from observed work: COMPLETE, INCOMPLETE, BLOCKED or FAILED.
- Return exactly three elements: the complete selected-profile result, the invocation-audit object, and the profile/status suffix.
- Respect user corrections and interruptions; do not add unrelated operations or require redundant authorization.
- Do not replace or activate the account-level /AGENTS.md. This is a working-document revision.

## Known defects requiring attention

The current working document uses custom schema descriptions with keys rather than standard JSON Schema properties. Do not silently claim these are directly valid standard JSON Schema. Resolve the tension explicitly: the user forbids reintroducing properties into this working document, while the execution contract requests a real expanded return schema. Design a clear rendering/translation step if needed, without scattering competing schema notations throughout the procedure.

A dangling itemSchemaRef points to #/$defs/invocation after the invocation definition was removed or relocated. Inspect the actual current file and fix or eliminate this reference through a single coherent audit-record definition.

The working document may still contain many non-variable camelCase fields, repeated profile-specific schemas, unused semantic labels, and instructions that describe the same obligation in several places. Do not assume this list is exhaustive. Inspect the entire file.

## Work to perform

1. Read the entire adjacent working document and applicable project instructions. Build a semantic model of its distinct obligations, questions, captured inputs, output contract and dependencies.
2. Identify duplicate concepts, subsumed definitions, inconsistent terms, orphan references, unnecessary wrappers, repeated examples and contradictory requirements. Decide what each section is for before editing it.
3. Choose one common template and apply it across every instruction/question set. Explain only necessary deviations, such as decision alternatives within the selector.
4. Consolidate each concept in one owning section; update all questions, examples, references and output descriptions together.
5. Restore purposeful few-shot examples using the same example template. Include a normal case and an edge or failure case where useful. Examples illustrate general principles; they are neither evidence of execution nor an exhaustive list of permitted cases.
6. Ensure every typed variable has a definition, capture question and return. Ensure references resolve and no variable is defined repeatedly. Ensure every retained semantic definition and non-variable field has a clear role.
7. Verify ordered execution, state repetition for multiple aspects, treatment of fixed values, no-state-change requests, truthful evidence, continuation and final status, and closure of the three-element output contract.
8. Save a revised document as a separate reviewable file, retaining the original working draft. Provide a concise change explanation and the actual checks performed.

The user has authorized the comprehensive correction. Do the work, not merely a proposal or explanation. Do not invent completion, invoke tools that were not actually called, or claim that mechanical validity proves semantic coherence.
