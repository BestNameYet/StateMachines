# AGENTS Procedure: Gemini integration handoff

## Objective

Finish connecting Gemini to the existing HTML interface through Selenium so Gemini reads the current instruction, supplies its required values, and continues until the procedure halts. The renderer, state operator, structural validator, HTML interface, and Selenium browser adapter already exist. Extend those mechanisms.

The user paused the proposed accountability task to review documentation. That task did not start a new issue and did not change a task file. Do not treat it as a pending authorized issue run. This handoff is the current requested deliverable.

## Repository and required reading

Repository: BestNameYet/StateMachines, branch main.

Procedure directory:
ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/

Read the current applicable AGENTS.md if present, then the current procedure README.md before working. Retrieve actual current sources; this handoff is context, not evidence that files remain unchanged. Root README.md and AGENTS.md returned 404 during this conversation; recheck if needed rather than inventing their contents.

Read these files before designing changes:

- config.json
- transitions.json and transitions.js
- Instruction-render.json and Instruction-lookup.json
- render-instructions.js
- User-request-questions.json
- Output-render.json
- interface-server.js and interface.html
- validator.js and fixture-manifest.json
- selenium/browser.py, selenium/smoke.py, and selenium/requirements.txt
- interface.test.js and transitions.test.js
- issue-workflow.js and issue-workflow.test.js
- .github/workflows/agents-selenium-setup.yml
- .github/workflows/agents-procedure-issues.yml

Also locate the user's existing Gemini API mechanism in the repository. The user said one exists. Its location, credentials, model, and invocation contract have not been established for this procedure. Inspect documentation and source before choosing an integration. Do not claim it is wired merely because a different project calls Gemini.

## Architecture the user settled

### Caller-held state

The caller owns its state object. It validates incoming values, updates those values in the state it holds, and then calls map(state).

The state contains:
render, verbatimUserPrompt, userIntent, exampleMatch, minimalResult, targetFiles, requirements, matchedExample, mode, changeList, requirementsCompleted, changeAssessment, completionAssessment, rescissionRequirements, loopNumber.

There is no state.json template. It was deleted, along with its config entry and caller dependencies. Do not recreate it. Initialize with map({}); the first transition item defines the initial null input fields and render 1. Subsequent state belongs to each caller/run.

### State-to-state operator

transitions.json is the procedure's control-flow source.

const map = compileTransitionMap(transitions);
const nextState = map(state);

Compilation builds executable state transformations, sequence successors, Boolean destinations, branch functions, and entry pointers from the JSON. It is not the earlier runtime JSON walker. Do not restore that interpreter or move procedure-specific routing into callers.

The operator takes state only. Its public result is a next state object or the string "halt". The current implementation also copies final working values into the supplied state, including when it halts; callers preserve those values on halt.

Only explicit Boolean conditions choose paths. Ordinary input contents fill the existing variables; they do not invent new transition structure. Hidden operations run until the next non-null render or halt. No render:null terminal screens. Exhausted selected arrays and null destinations halt.

The operator's implementation supports registered lookupMode calls, an external lookup-table.json, loopNumber arithmetic, named entry points, and pointers. Do not embed the lookup table inside the transition JSON or hardcode procedure-specific modes into the generic execution layer.

### Rendering

Instruction-render.json is an array of render objects with render and positions. Positions restart at zero for every render.

Instruction-lookup.json maps each render number to ordered [key,value] pairs. Resolve lookup[renderNumber][position]. The renderer consumes those positions.

There are 23 current renders. The mode announcement shares the first instruction screen of the selected procedure. Do not introduce output-only screens that need a separate acknowledgement just to advance.

Output-render.json is the separate final-report definition. Output titles belong there, not on the instruction text. Inspect its existing loop/report notation before changing it. Final report rendering is not yet established as connected to the Gemini harness.

### Separate responsibilities

Keep the state operator, renderer, return validation, external model adapter, and browser adapter separate. The user explicitly rejected putting special interface variables inside the state-machine JavaScript. Do not add browser sessions, API messages, transport wrappers, model prompts, or response-schema metadata to the core state object.

## Existing browser interface

interface-server.js is a standalone Node server. Start it from the procedure directory:

node interface-server.js

Default address: http://127.0.0.1:3000

POST /api/start creates a separate in-memory session. POST /api/submit accepts the existing browser transport object with id, values, and optional newFiles. Values use $variableName keys. This browser transport differs from the issue reply format.

The interface derives controls and structural return schemas from the instruction's inline declared types. It validates strings, integers, Booleans, arrays, object fields, byte ranges, and relative file references. It does not semantically judge answers or execute the requested file edits.

Existing file references must exist within the fixture workspace. New files require the existing explicit designation through newFiles or a file record with newFile:true where supported. The manifest has three existing fixture files and one new-file requirement. Inspect the actual manifest and validator.

Page JavaScript exposes window.currentInstruction for Selenium. The interface's browser-facing returnSchema still exists. The user removed extra generated schema blocks from issue comments; do not confuse that with silently deleting the browser adapter's existing schema contract.

Sessions are in memory and are discarded on server restart.

## Existing Selenium adapter

selenium/browser.py provides:

- create_browser(): headless Chrome with Selenium driver management.
- read_screen(driver): reads window.currentInstruction.
- submit_values(driver, values): fills actual form controls, selects Booleans, submits, and waits for changed history, completion, or validation errors.

submit_values checks exact variable names. It expects a dictionary keyed by $variableName. Non-string fields are entered as JSON. It raises on structural validation errors.

selenium/smoke.py starts the Node server, opens the browser, checks render 1 and its prompt input, and shuts down. It does not submit values or take screenshots.

.github/workflows/agents-selenium-setup.yml installs Python, Node, and Selenium; runs that smoke check; and preserves diagnostics. It does not invoke Gemini or complete a procedure.

A setup smoke run passed earlier in the conversation:
https://github.com/BestNameYet/StateMachines/actions/runs/38669827149
This is historical evidence only. Re-run the relevant checks after integration changes.

## Gemini work still required

1. Locate and understand the existing Gemini API invocation mechanism and its documented configuration. Determine how this procedure can call it without exposing credentials or duplicating another project's architecture.
2. Implement a separate model adapter/control loop around the existing browser functions.
3. Give Gemini the current instruction, the held/captured context needed to answer it, and the browser's expected return contract. Require only the declared values in its response.
4. Parse the response as data. Validate names and structure through the existing mechanisms. Submit accepted values through Selenium's actual form controls.
5. Read the resulting screen/state and repeat until done/halt. On a validation error, preserve the current state and provide the actual error to Gemini for a corrected response. Do not claim a rejected submission advanced.
6. Preserve evidence of prompts, model responses, submitted values, resulting states, validation failures, terminal result, and requested screenshots. Never log secrets.
7. Handle required work at execution instructions: the interface only collects inputs; neither it nor Selenium edits files automatically. A Gemini text response does not perform a requested file edit. Establish the authorized execution mechanism and verify actual saved files before reporting changes completed. If that mechanism is unavailable, report the blocker rather than supplying fabricated changeList/completion values.

The user previously requested screenshots of every render but paused that to set up Selenium first. Keep that goal visible. A single path cannot visit all 23 renders; minimal, fidelity, and accountability traverse different branches. Use documented scenarios to cover all applicable screens, and distinguish that coverage from a single completed run.

Do not introduce new return-schema blocks in GitHub issue comments. Do not reintroduce originalRequest. It duplicated the captured prompt and mistakenly held the checkbox acknowledgement. It was removed from the issue workflow, run #9, and its rendered comments. state.verbatimUserPrompt is the captured user prompt.

## Issue workflow: separate, working route

The issue form has one required acknowledgement checkbox. The workflow enforces AGENTS Procedure — <issue creation timestamp in UTC> as title. It recognizes an existing run record, matching title prefix, or checked acknowledgement; new runs require the checked acknowledgement.

The first render captures the actual prompt. Issue replies use:

${variableName}: JSON_value

There is no request-count or values wrapper in the user's issue reply. Screens with no captured return currently accept {}.

The caller compiles the operator, applies validated values to its held draft state, calls map(draft), saves the resulting run record to issue-runs/<issue-number>.json, then posts the next instruction. On halt it preserves final values and closes the issue.

The workflow does not call Gemini or Selenium. Do not mistake this working route for the missing Gemini/browser integration.

Run #9 completed the minimal path, renders 1–7, and closed. It contains the result:
"JSON stands for JavaScript Object Notation."
https://github.com/BestNameYet/StateMachines/issues/9

That run used replies submitted by this assistant through the GitHub connector, not Gemini. Do not describe it as a Gemini success.

## Validation and completion evidence

Existing local checks:

node transitions.test.js
node interface.test.js
node issue-workflow.test.js

These passed after the compiled operator replacement. They cover all 23 renders across minimal, fidelity, accountability, repeated accountability, invalid input, irregular arrays, and halt behavior. They are not proof of a Gemini API call or Selenium completion.

For the completed integration, demonstrate actual evidence that:

- Gemini received the real current instruction and expected variables.
- Its real response was parsed, entered into the browser, and submitted.
- The caller updated its held state before map(state).
- The resulting render followed the JSON-defined path.
- The run reached halt and preserved the final result.
- Any claimed file changes exist in the saved files.
- Requested screenshots correspond to actual renders.
- Failed submissions and recovery are reported accurately.

Run meaningful checks appropriate to the new integration. Do not create tests that simply repeat the implementation or claim live execution based on a simulated model response.

## Working constraints

Save repository work to GitHub. A local edit is not completion. Verify the actual saved content after a write before claiming it is current.

Do not add unsolicited issue comments or test replies. The user explicitly authorized assistant-driven handshake of run #9, which is now complete. A new run should be part of a clear current instruction, not assumed from historical permission.

Do not add wrappers, redundant variables, extra schemas, new instruction rules, or procedural embellishments. Preserve the exact procedure text and declared return values unless the user requests a change.

Do not replace file execution with status declarations. Do not report a plan, script, attempted invocation, or model assertion as a completed outcome.

The user expects action, concise progress updates, and concrete results. Read the documentation first, avoid repeated confirmation requests, and do not invent missing context.

## Most recent documentation repair

README.md was corrected to describe the required acknowledgement, automatic creation-time title, prompt capture in the first reply, and actual run-identification rules.

Commit:
fbc9ffebc66b07260e7400b86cc97f800238ad5e

Verify the current README before relying on that historical commit. No worked-example addition or accountability task was completed as part of that repair.
