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


## Required phase separation and long-form instruction design

Reorganize the document into an ordered set of verbal instructions that an agent can understand and perform. Do not produce only a schema, compressed field inventory, naming table or collection of placeholders. Each instruction must explain in full sentences what to do, why the requested input matters where needed, where its value comes from, how to capture it, what to return, and which subsequent instruction uses or verifies it. Keep this explanation in the owning instruction rather than repeat it in several sections. Its local input definitions and questions should make the explanation executable.

Use separate, visibly identifiable pre-execution and post-execution instruction groups. Place actual execution and recovery between them. These are instruction-group titles, not invented camelCase variables or per-variable phase metadata.

### Pre-execution: establish and publish the requested change

Pre-execution captures the request and the verified starting information before performing the substantive task. It records what is currently true and what the user wants to become true. It cannot contain an observed final value or a claim of completed execution.

Put the following owning objects in this group:
- Governing-instruction retrieval: define and capture governingInstructionFileId, governingInstructionLibraryFileId and instructionScope. Read the complete current applicable instruction; obtain identifiers from that retrieval, not memory. Do not add a duplicate provenance wrapper.
- User request: define and capture userPromptVerbatim, userPromptInterpretation, userGoal and scope. This is its own object, separate from state change. Preserve the exact prompt and all operative limits.
- State change: define and capture basis, aspect, currentValue, desiredValue, fixed, procedure and delivery. Use the already captured user goal and scope. Establish current values from inspected authoritative information; desired values come from the user's requirements. Keep each affected aspect paired with its current and desired values. Repeat the aspect questions for every affected aspect. Capture the aspects and values that remain fixed.
- Mode selection: define and capture selectionRationale and profile inside the separate selector object. Select a profile using the mode descriptions. Preserve the ordered selection array. Neither profile nor the selector is a state aspect.
- Projection publication: assemble and visibly print the complete JWRS from those captures, including the exact original prompt, actual instruction identifiers and an explicit return contract. Return captured inputs as required by their questions. Expand the required return schema for execution; a reference to an internal schema definition is not a substitute for the printed contract.

Define any genuinely necessary additional projection input locally and give it a capture question and return. Do not add a typed variable merely to name a container or phase. For a request with no state change, explain how its state questions are treated without inventing a target or pretending a change occurred.

### Execution: perform the requested work and collect evidence

After publishing the projection, perform the user's actual request in the prescribed environment. Use the pre-execution captures to guide the work. Keep exact user constraints and execution identity. Record actual invocation information as tools are called, including required instruction-retrieval calls. Recovery and continuation occur here while obligations remain executable.

An invocation audit is collected throughout the turn; it is finalized and returned after execution. It is not a pre-execution list of planned calls. Explain this timing rather than adding conflicting phase labels to its definition.

### Post-execution: observe and return what actually happened

Post-execution inspects resulting state, reports actual results, finalizes evidence and selects a truthful completion status. It must not overwrite the captured initial or desired values.

Put the following owning objects in this group:
- Observed state: define and capture finalValue for each affected aspect, reusing the aspect identifier. Inspect every fixed aspect as well. Compare observed changed values against desiredValue and preserved values against currentValue. An intended value, generated example or attempted command is not an observation.
- Execution result: define and capture result. Return the actual answer or deliverable, observed state information, evidence, deviations and remaining work as required by the selected profile. Reuse pre-execution captures where needed rather than redefine them.
- Invocation audit: define verbatimToolInvocations once at its collection-owning instruction and explain its post-execution finalization. Capture and return actual records, not plans or reconstructed equivalents. Avoid a second definition solely because collection begins earlier.
- Completion status: define and capture status using the final observed execution state after authorized continuation ends. Reuse profile; do not select or define it again.
- Final response assembly: return exactly three elements: the full selected-profile result; the invocation-audit object; and the profile/status suffix. Questions that capture and return a variable already constitute use; final assembly is an additional consumer when applicable, not a prerequisite for calling an input used.

### Define every concept the instructions require

The rewritten procedure must not rely on unexplained jargon, abbreviated concepts or unspoken links between sections. Inventory every operative concept in the long-form instructions and questions, then verify that it has one clear definition or an explicit reference to its owning definition. This includes authority, current versus persistent identifiers, user interpretation, goal, scope, basis, aspect, current value, desired value, fixed, procedure, delivery, selection rationale, profile, projection, return contract, actual execution, observation, evidence, continuation, result, invocation record and final status.

Use untyped plain-language semantic definitions for non-variable concepts. Place typed variable definitions inside the instruction object where the variable is first captured, immediately before its questions. Later phases refer to that definition and captured value rather than copy it. Do not introduce synonyms as new concepts, redefine basis as source, or repeat the same definition under different casing.

Make definitions complete enough to guide an agent without reproducing the same instruction in several places. Keep the deliberately simple fixed definition at four words: "These aspects remain unchanged." Explain preservation and verification in the relevant long-form instruction rather than expanding that definition.

Every instruction section must use the same local-input/question/few-shot template. Include representative pre-execution captures, actual execution, and post-execution observations in the examples so the phases cannot be confused. Examples must be explicitly illustrative; they are never evidence that the live task was performed.

Verify phase coverage, ownership, definition completeness, paired state values, distinct initial/desired/final values, actual execution between phases, and the final return contract across the entire rewritten procedure.


## Mandatory state-transition accounting and value verification

The state-transition design must cover every file edit made during execution. Do not account only for the initial requested artifact or the last saved file. Include files created, modified, renamed, moved or deleted, including scripts, configuration, documentation and other persistent files changed to achieve the request.

For each file edit, capture the exact file identity or locator, the affected aspect, its established initial value, the desired value or condition, and the purpose of that edit. Tie the purpose directly to the desired value and the user's overall goal. A list of filenames or a claim that an edit was made does not explain the transition. Preserve the association when several edits affect one file or when one desired outcome requires edits to multiple files.

Distinguish the basis establishing the initial state from the basis inspected to establish the final state. Both are uses of the same defined basis concept, not separate synonymous concepts. Preserve enough identity and version information to identify precisely which state was inspected. A pre-edit source, local staging file or old version cannot by itself establish the final saved state.

### Post-execution state comparison

After execution, revisit every tracked transition and present its values together in an easy-to-inspect table or equivalent clear representation. Include:
- Exact file or target.
- Named aspect and purpose of the edit.
- Initial value.
- Desired value or condition.
- Observed final value.
- Basis used to establish the initial value and basis used to verify the final value.
- The actual verification operation and supporting observed evidence.
- The comparison outcome and any discrepancy.

Reuse the pre-execution records rather than invent a second set of desired values after execution. Include fixed aspects and verify their preservation. Cover intermediate file edits as well as the final deliverable; where later edits supersede earlier states, identify the sequence and verify the final result against the obligations of the tracked edits.

### Verification must use the asserted values

Verification is the purpose of tracking the transitions. A question asking whether an action was done, an assistant's yes/no answer, a status label, a successful invocation, or a self-authored completion statement is insufficient.

Take the actual values asserted in each transition and submit them to the relevant inspection or check. Read the actual saved file and compare its contents against the required value; query the actual target state; run the prescribed behavior with the captured inputs and observe its outputs; or use the corresponding authoritative operation for that aspect. Use the user's required verification method and environment.

Compare observed evidence with the captured desired value or condition. For a fixed aspect, compare the final observed value with its established initial value. Report the observed value and comparison evidence even when they differ from the desired result. Do not fill the final-value column by copying the desired-value column.

Examples:
- An edit is intended to set a configuration timeout to 30 seconds. Read the resulting saved configuration, capture the actual timeout value, and compare that value with 30 seconds. The verification checks the asserted setting rather than asking whether the edit occurred.
- An edit is intended to change a function's output for a specified input. Execute the prescribed function in the required environment with that actual input, capture the output, and compare it with the captured desired output. File existence or a successful save is not evidence of the behavior.
- A rename is intended to move a specific file to a specified path without altering its contents. Inspect both the required path state and the preserved contents; verify both assertions.
- A fixed configuration value must stay unchanged while another aspect is edited. Read the final configuration and compare that fixed value with the established initial value.

If an assertion cannot be verified, mark that transition unverified and identify the missing evidence or blocker. Continue available authorized verification work. Never classify the whole task as verified merely because some rows passed.

The rewritten procedure must define any genuinely needed edit-purpose, identity, comparison or evidence variables locally, request and return them, and connect them to the state-transition records without adding duplicate definitions or unsupported routing metadata. Include few-shot examples demonstrating a successful value comparison, an observed mismatch, and unavailable verification evidence.


## No truncation, no brevity, and full explanatory detail

The user explicitly requires no truncation and no brevity-driven compression. The final revised procedure must be at least as verbose as the original authoritative AGENTS document, not merely as verbose as the shortened working draft. The complete original is provided alongside this handoff as AGENTS-original-reference.json.

Read that reference in full. It was copied from the current Library /AGENTS.md, version 7: persistent Library identifier libfile_b6b39702befc8191a23fdb2b219b132e, backing file identifier file_000000005104820c8cb3f5fc0731d877. The source retrieval covered all 2,024 lines and 99,817 characters. These identify this supplied reference snapshot; they are not identifiers to reuse as current provenance in future executions.

The original demonstrates the required level of explanatory detail. Its length is a floor, not a reason to restore duplicated requirements. Replace redundancy with clear, complete definitions, long-form instructions, explicit relationships between captured values and actions, and carefully developed few-shot examples. Do not pad the result with repetition to meet the verbosity requirement.

The purpose is to eliminate obscurity for the executing agent. Explain every operative concept and instruction sufficiently that an agent does not have to guess its meaning, ownership, timing, dependency, verification method or return placement. Do not omit necessary context because it seems obvious to the author.

Do not substitute summaries, ellipses, placeholders, abbreviated instructions, omitted sections, samples of the requested document, or statements that remaining content is unchanged. Return the complete revised document and complete required accompanying explanation. Internal variable-reference notation remains valid; it must resolve to actual complete definitions rather than conceal missing content.

If a single model response cannot contain the entire deliverable, use the available artifact/output mechanism or a clearly ordered continuation procedure that preserves all content. Do not silently truncate, declare partial output complete, or replace the requested full procedure with a shorter outline.

Verify before delivery that the revised procedure preserves all distinct original obligations, supplies all requested phase/state/verification/template requirements, contains useful few-shot examples for every instruction section, and meets or exceeds the original reference's verbosity. Report the actual comparison measures and any outstanding limitation. A size check alone is not proof of semantic completeness; review the substantive coverage as well.

## Two-pass execution: schema design before document generation

The first pass must read every configured source and design its own complete return schema for the second pass's output. It must not rewrite the final procedure in the first pass.

First-pass deliverable: a complete, self-contained, machine-readable return schema for the entire second-pass result, plus the explanation needed to apply and validate it. Decide the second-pass structure from the user's actual requirements, not from the previous assistant's inconsistent structure. Define the uniform instruction/input/question/few-shot template; ordered phases; local ownership of definitions; every required output artifact; the edit/state verification table; coverage and validation evidence; and truthful completion/limitation reporting. Ensure the complete revised document can be returned without truncation. Distinguish schema vocabulary from the procedure's terminology rather than conceal a nonstandard schema.

The second pass must receive the actual first-pass schema as an additional required input, together with all original configured files. It must produce the full revised procedure and accompanying deliverables conforming to that schema. It must not invent a replacement schema or treat a schema proposal as the revised procedure. The no-brevity and original-document verbosity floor applies to the full second-pass procedure, not padding the first-pass schema.

An earlier single-pass rewrite request may already be executing; it is superseded and must not be treated as either the approved first-pass schema or a schema-conforming second-pass result.


## Exact instruction-section template and acceptance criteria

The purpose of the template is to make the procedure executable and predictable: the agent reads the relevant definitions, performs the stated operation, supplies the requested values, and can compare its response with a useful example. Symmetry means those roles are represented in the same way in every instruction section, not merely that headings look similar.

The previous handoff left too much of this structure to inference. Treat poor output as evidence to examine the instruction and handoff, not an excuse to blame the downstream agent. Identify exactly which requirement was missing, ambiguous or conflicting, correct that requirement, and rerun against the same acceptance criteria.

### Canonical section structure

Use a plain-language instruction title whose value is an ordered array with exactly these three entries:

1. An object named inputs containing the local variable definitions first.
2. An object named questions containing the ordered question records that perform the instruction and capture its requested values.
3. An object named examples containing consistently structured few-shot records.

Each question record contains exactly:
- question: complete plain-language wording that tells the agent what operation to perform, where to obtain the values, and what to inspect or compare when relevant. Reference definitions with ${name.definition} and previously captured values with ${name}.
- return: the actual value binding or structured collection to capture from that question. This is a return specification, not a claim that the operation occurred.

Do not add a second rule, capture designation, destination map, variable registry, purpose wrapper or duplicate definition to the section. Necessary explanation belongs in the long-form question and its single owning definition. The questions should be operational enough that answering them requires the actual task operation rather than a yes/no completion assertion.

Each example record contains exactly:
- scenario: concrete illustrative circumstances.
- suppliedInputs: concrete values available before answering, with ordinary JSON types preserved.
- expectedReturn: the captured or returned values expected in those circumstances.
- explanation: why those values and that decision follow from the instruction, including the evidence required or the limitation.

Use at least two genuinely useful examples per section: a normal case and a materially different edge, failure or not-applicable case. Examples do not supply live evidence and do not constitute another authoritative definition. Avoid repeating the same example in multiple sections.

A section with no newly captured local variable has an empty inputs object; it refers to already defined values rather than define them again. A return-only section therefore follows the same template as a capture section. Semantic reference material is outside the instruction sequence and contains untyped plain-language definitions. General document metadata is not an instruction section and should stay minimal.

The phase groups are ordered arrays of those same instruction-section objects. Use plain-language names for the pre-execution, execution/recovery and post-execution groups. The mode selection instruction belongs before publication of the initial projection. Its mode alternatives are distinct semantics of that decision, not another competing section template; describe them once in the profile definition or a single referenced semantic definition and have the capture question use them.

This exact template supersedes inconsistent section layouts in the draft and earlier handoff. Preserve the substance of earlier requirements while removing their duplicate or conflicting representation.

### Acceptance tests for the output

Review the actual second-pass file, not its self-reported checklist:
- Every instruction section has the same ordered inputs/questions/examples structure.
- Every question has complete operational text and a return binding.
- Every typed variable is defined exactly once in its owning local inputs and has a capture question and return.
- Variables reused by later sections are references; their definitions are not copied.
- All variable and definition references resolve. There are no dangling invocation-schema references.
- Every concept needed to understand the procedure is defined, with no redundant synonyms or unexplained jargon.
- Non-variable instruction titles and semantics use plain language; variable references use the existing designator. No invented notation or routing metadata.
- Mode selection remains distinct from state change and uses the captured rationale.
- The user request has its own section, including verbatim prompt, interpretation, goal and scope.
- Initial, desired and observed final values remain distinct, paired with the correct aspect and basis. Multi-aspect and fixed-aspect cases are covered.
- Every persistent file edit has identity, purpose and desired-state linkage; the final comparison presentation includes actual inspected values and evidence.
- Verification acts on the asserted values and target state. No completion questionnaires or copied desired values masquerade as verification.
- Projection publication precedes substantive execution; actual execution/recovery sits between the capture and observation phases.
- The complete selected-profile result, invocation audit and profile/status suffix close the final three-element contract without lost inputs or hidden omissions.
- Each instruction section contains useful normal and edge/failure examples in the exact common example structure.
- The complete revised procedure satisfies the original verbosity floor through necessary definitions, explanation and examples rather than repeated content.
- The actual output matches the first-pass return schema as well as these substantive template requirements. Schema compliance alone cannot excuse missing template structure.

If a requirement fails, cite the exact output location and the missed requirement, then revise the handoff to remove the responsible ambiguity and perform an authorized corrective pass. Preserve each pass's output for comparison. Do not rename a deficient output as complete or change the acceptance criteria to fit it.


## Observed failed second-pass output: corrective requirements

Review previous_pass_output, the actual output of agents_revision_pass2_20261013_1. A successful GitHub workflow and the model's COMPLETE label did not establish acceptance.

Independent inspection of the actual returned revised_agents_procedure using JSON.stringify(document, null, 2) measured 58,340 characters and 1,202 lines, not the reported 104,230 characters and 2,185 lines. The supplied original reference is 99,817 characters and 2,024 lines. The response's reported floor_satisfied=true is therefore unsupported for the actual revised procedure. Define the exact serialization used for any metrics. Do not guess counts or represent estimated checks as executed verification.

The actual procedure array has 10 root entries; its value-verification record claims an inspected length of 9. This is another concrete contradiction between the returned values and its asserted evidence.

Its semantics defines Basis, Aspect and Fixed, while its state input definitions describe the same concepts again. Local typed definitions were not duplicated under identical keys, but semantic meaning was duplicated across semantic labels and inputs. Consolidate by concept, not just by identical variable name.

Its instruction/question sets use a body object with instruction/inputs/questions/fewShotExamples, while authority, mode selection, continuation, status, profiles and suffix use other layouts. Its examples commonly provide scenario/capturedInputs/explanation and omit an expected return. The exact canonical ordered section and example template added above was not in that run's input snapshot. It is now mandatory for this corrective pass.

The output's state-transition table labels proposed changes to the existing repository working document as observed final file states even though the Gemini response did not modify or reread that file. Its final basis locators and inspected counts also contain mismatches. Describe the generated revision as a proposed deliverable whose serialization can be inspected, not a saved replacement of the input file. Mark live filesystem/persistence claims UNVERIFIED unless genuine evidence is provided. Never turn an intended edit or internal assertion into verified environmental state.

Produce a corrected complete deliverable under the first-pass schema, with the updated exact template and all original requirements. Preserve the previous output as evidence. If you cannot establish a claimed check, say so accurately; do not fabricate metrics to satisfy a floor. The controlling measure for the verbosity floor is the full revised procedure's pretty-printed JSON serialization with two-space indentation, excluding its external coverage/validation wrapper and explanatory reports.


## Modular procedures instead of another monolithic revision

The user's latest instruction supersedes generating the entire procedure as one monolithic second-pass document. Divide the work into separate procedures, one for every distinct major evaluation or operation. First determine why each part exists: the obligation it protects, the question it answers, the evidence it requires, and the result it supplies to the next procedure. Separation is by responsibility, not by arbitrary page or token boundaries.

For this pass, produce a modular procedure design and a separate, complete specification for each module. Do not try to generate the full original-length implementation of every module in this single response. That previously caused unreliable size claims, truncation risk and inconsistent structure. The complete eventual procedure collection must preserve the original detail and verbosity requirement; it is not a requirement to pad this decomposition pass.

Required distinct procedures, subject to additional responsibilities discovered from the full sources:
1. Verify provenance: establish which governing instruction is authoritative and current; read it completely; inspect and capture actual identifiers. Its purpose is to prevent stale, substituted or invented authority.
2. Gather user instructions: preserve the original prompt and capture interpretation, goal, scope, ordering, limits, procedure and delivery requirements. Its purpose is faithful execution of the actual request rather than an assistant-invented task.
3. Specify state transitions: identify the authoritative basis, target/aspects, established current values, desired values, fixed values and purpose of every planned file edit. Its purpose is to make requested changes explicit and later verifiable.
4. Select execution mode: choose exactly one profile from the operative request. Its purpose is to select the appropriate projection and result requirements, independently of state tracking.
5. Construct and publish the projection: assemble captured inputs and expanded return contract before substantive execution. Its purpose is a complete visible execution specification.
6. Validate the pre-execution specification: check completeness, resolved references, source/current-value evidence, user constraints, phase order and return contract. Its purpose is to detect an incorrect or unexecutable projection before acting; the original request controls corrections. This must be separate from post-execution verification.
7. Execute the requested operations: perform actual authorized work using captured state and user requirements. Its purpose is achievement of the requested outcome, not another plan.
8. Record the invocation audit: collect actual calls and observed outcomes throughout the turn and finalize the audit afterward. Its purpose is truthful execution accountability; do not mistake planned calls for performed operations.
9. Select execution continuation: evaluate outstanding obligations after observed successes, failures or blockers and choose the next useful authorized action. Its purpose is to avoid premature termination or unauthorized method substitution.
10. Verify resulting state: inspect actual final values for every changed and fixed aspect, compare against desired or preserved values, and demonstrate every edit/purpose/value/basis/evidence association. Its purpose is outcome verification using actual asserted values, not completion questionnaires.
11. Evaluate completion status: decide COMPLETE, INCOMPLETE, BLOCKED or FAILED only after continuation ends and verification is evaluated. Its purpose is truthful overall outcome classification, distinct from a local tool result.
12. Assemble and validate the final response: return the full selected-profile result, audit and profile/status suffix under the exact three-element contract. Its purpose is complete, inspectable reporting with no lost values or unsupported claims.

Review the full sources for any additional major evaluation requiring its own procedure. Merge responsibilities only when they are genuinely the same evaluation; do not reintroduce conceptual duplicates.

For each separate procedure specify:
- Its plain-language name and proposed separate file path.
- Why it exists and which distinct obligation it satisfies.
- The question or decision it performs.
- Inputs it owns and captures, versus references to values already captured by another procedure.
- The required evidence and actual operation performed.
- Its returned values and the procedures that receive them.
- Preconditions, failure/recovery cases and completion conditions.
- The same local-input/operational-question/return/few-shot template established earlier.
- Useful example scenarios to implement later, including the normal and edge/failure case.

Return an ordered orchestration manifest explaining dependencies and when each procedure is called. Provenance precedes interpretation; interpretation and state specification precede mode/projection validation; publication precedes substantive execution; audit spans the turn; continuation runs as needed; final verification precedes completion classification and final response validation.

Define shared concepts once and reference them across procedure files. Defining each module independently does not authorize copying the same variable or semantic definition into every module. Make ownership and reference resolution explicit without per-variable invented routing metadata.

Deliver a modular design with individually named procedure specifications and an orchestration manifest. The follow-up implementation can generate and validate each procedure separately, then validate their composition. Do not claim that a module specification is its executed implementation or that this decomposition pass completed the full rewrite.

## Current task: metadata first, then proceed only when directed

The user's latest instruction supersedes the earlier full rewrite, module implementation and module-specification generation requests for the next pass. Work ONLY on metadata.

First inspect the supplied procedure documents and decide what metadata is actually needed for this instruction procedure. Explain each retained field's purpose and why it is metadata rather than a user input, state aspect, instruction, semantic definition or execution-result value. Use the existing definitions and sections as the specification; do not create another specification stage.

Then capture the actual metadata values supported by the supplied files. Produce the concrete metadata object, with the necessary capture questions/definitions only where a value must be obtained at runtime rather than taken from the document. Identify where each captured value comes from. Do not invent live provenance, current execution timestamps or other unsupported values; mark unavailable runtime values accurately.

Prefer the minimum meaningful metadata that describes or identifies the governing procedure. Do not add decorative fields, duplicate goal/scope/state inputs, another provenance wrapper, or repeat definitions. Distinguish the document's identifier/version/applicability/purpose from live user-request and state-change information where relevant. Choose fields on their actual role, not merely because they already exist.

Return the metadata decision and captured object now. Do not generate any of the remaining procedures, do not generate another whole-document schema, and do not claim that metadata capture completes the full procedure revision.
