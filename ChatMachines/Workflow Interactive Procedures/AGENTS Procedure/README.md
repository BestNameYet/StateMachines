# AGENTS Procedure

## Create a procedure run

Create a new issue in BestNameYet/StateMachines using either the AGENTS Procedure issue template or a committed trigger file under issue-run-triggers/. The issue template contains the required Procedure acknowledgement; it does not collect the user prompt. The first rendered instruction selects `procedureMode` (`normal` or `gemini`); the next instruction captures the verbatim user prompt in the issue replies.

The workflow replaces the issue title with AGENTS Procedure — <issue creation timestamp in UTC>, including after title edits. The timestamp comes from GitHub's issue creation time and remains unchanged throughout the run. The issue number identifies the run and its separate persisted state.

GitHub issues belong to the repository rather than a folder. The runner stores this procedure's run records under ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-runs/.

### Commit a procedure issue trigger

Create a new JSON file directly in `issue-run-triggers/` named `<procedureName><nonce>.json`, for example `buildProcedure12.json`. Its complete initial body must be:

```json
{
  "startProcedure": true,
  "nonce": 12
}
```

The nonce must be a non-negative integer and match the numeric suffix of the filename. Commit the trigger file to `main`. The workflow validates it, creates one issue with the checked Procedure acknowledgement, runs the existing issue initializer directly by issue number in that same push workflow, and changes `startProcedure` to `false` after the issue record and first instruction are persisted. It then adds `procedureName`, `procedureIdentifier`, `procedureIssueNumber`, `procedureIssueUrl`, `procedureTitle`, and `procedureReceiptPath` to the trigger JSON. The issue body and saved run record carry the trigger identifier so the issue remains bound to the filename even after the issue runner changes its title to the canonical UTC timestamp. The issue is the persistent communication port for later returns. Each non-bot reply creates an `issue_comment` event and retriggers this GitHub Actions workflow for that issue; the runner loads its receipt and advances the conversation.

The workflow reuses an issue carrying the exact trigger marker if a run is retried. Once the push job initializes the issue, `procedureSavedHere` stores the initial JSON receipt and `procedureReceipts` starts with that snapshot. `procedureReceiptPath` points to the live mutable receipt at `issue-runs/<issue-number>.json`. Later workflow updates append receipt snapshots to the trigger JSON named by its `procedureIdentifier` (`<procedureName><nonce>.json`), after verifying the issue binding; the live per-issue receipt remains canonical for current state. The first rendered instruction selects `procedureMode` (`normal` or `gemini`); the next instruction captures the verbatim user prompt in the issue replies.

## Procedure mode selection

Every new run starts with the same mode-selection screen, regardless of how it was initiated. Reply `${procedureMode}: "normal"` or `${procedureMode}: "gemini"`. The existing declared-type validator accepts only those two values, and the selection is retained in state and history. Both choices then show the existing verbatim-prompt screen. `procedureMode` is separate from the existing `mode` field used for fidelity/accountability selection.

Normal mode follows the predefined transition map. Gemini mode captures the verbatim prompt, then calls the Gemini API to generate each subsequent screen. The workflow owns all state, validation, persistence, publication, and navigation; each API request contains the full saved state. Gemini does not retain the state between calls. Configure the existing `GEMINI_API_KEY` repository secret; `GEMINI_MODEL` is optional and defaults to the model used by the existing Gemini integration.

The new initial screen uses render address 24, followed by existing render 1, so existing screen addresses and saved runs remain valid. Active runs are not restarted or asked to choose retroactively.

## Gemini request template

`gemini-request-template.json` defines the JSON content to serialize into the Gemini request's `contents[0].parts[0].text`. It contains the screen-writing instructions (including the six description-first examples) and a `state` object with `verbatimUserPrompt`, `renderedScreens`, and `variables`.

Before sending, populate `verbatimUserPrompt` with the exact captured prompt, `renderedScreens` with every previously published screen in chronological order and its expected-input definitions, and `variables` with an array of `{name, value}` entries appended in submission order, including the latest accepted submission. Variables are not predefined. The last entry for a repeated name contains its latest accepted value. Preserve the screens verbatim rather than substituting values into their text. The null prompt and empty containers are template placeholders. There is no separate expected-variable list or duplicated latest-submission envelope.

Gemini returns `control` on every call. Continue responses also include the `{instruction, expectedInputs}` screen pair handled by `gemini-screen.js`; completion responses contain only `control`. `gemini-workflow.js` fills this template with the saved state, serializes it into a user-role message, and calls generateContent. A malformed response is sent back with its validation error for correction, up to three response attempts. Only validated responses are saved; continue screens require nonempty expected inputs and supported schemas.

### Stored Gemini screens

`screenFromGeminiResponse()` returns a JSON-serializable `{instruction, expectedInputs}` object. `saveGeminiScreen(record, response, saveRecord)` appends that object to `record.state.renderedScreens`, sets `state.render` to its zero-based array index, and invokes the caller's existing run-record saver. It returns the same stored object. A failed save restores the previous in-memory state and throws. Publication remains separate; the helper does not post a comment or record publication success.

`render-gemini.js` provides `renderGeminiScreen(screen)`, which returns the instruction text verbatim, and `lastGeminiScreen(state)`, which retrieves the final array entry. The Gemini issue path uses that last object directly, not positional field mappings. Its expected-input definitions remain stored for the workflow validator; they are not printed as instruction JSON. Normal mode retains its predefined renderer and numbering. After an API or format failure, accepted variables and the last screen remain saved. Type `retry` to request the next screen without repeating the substantive work.

### Screen navigation and returns

Every active issue screen includes a command menu. Type `state` to have the workflow post the saved-state screen; type `back` to post the current instruction again. These commands preserve the current request and expected inputs, do not advance the procedure, and do not call Gemini. Inputs can be submitted from either view. Captured values are no longer embedded in the instruction screen. The HTML interface exposes the same typed commands.

Gemini instructions use `{$variableName}`. Submit a single return as `{$variableName}: JSON value`, or submit multiple returns as a JSON object with bare names as keys, for example `{"total":60,"confirmed":true}`. The existing `${variableName}: value` spelling remains accepted. The workflow checks exactly the requested keys and validates their types, object fields, array contents, and allowed values. It rejects unsupported schema keywords rather than pretending to enforce them. An invalid submission does not update variables, advance the request, or call Gemini. Accepted values are appended to the variables array before the next API call. A repeated name preserves the earlier entry and appends its latest value.

The screen array stores the mode-choice and prompt-capture instructions followed by valid generated objects. The last object supplies the active instruction and expected inputs. Publication tracking continues to use the existing request receipts; saving a generated object does not claim that its comment was published successfully. `state`/`back` display posts do not append a new Gemini instruction to that array.

Run `node gemini-screen.test.js` and `node gemini-workflow.test.js` for object storage and the mocked end-to-end issue/API cycle. Source pushes also run a live API check when Gemini generation sources change and the secret is available. That check generates, validates, saves, and renders one screen, submits the computed integer product, then requires a completion assessment with no additional screen; its log distinguishes live calls from a skipped check. The live check does not create issues or perform user file tasks.

### Semantic control loop and completion

Every Gemini call receives the updated state and independently materializes a new `control` object. It contains `target` and `current` (each with outcome and process description strings), `gap` (outcome and process arrays), and `mode` (`continue` or `completion`). The target is derived from the original user request, decomposed into outcomes, tasks, required methods, and constraints. Current status is assessed from the rendered screens, recorded returns, and supported changes. The gap compares both the final state against the desired state and the actions/state changes against the requested process. Missing or contradictory evidence remains a gap.

The workflow appends every valid assessment to `state.controls` in chronological order and includes that history in later requests. There is no separate current-control field. Gemini recalculates rather than reusing the last assessment. Controls are not included in instruction comments; they are visible through the explicit state view.

A continue response must have an identified gap and a screen aimed at reducing it. A completion response must have both gap arrays empty and contains only `control`: no instruction, expected inputs, or extra screen. The workflow persists the assessment, marks the run done, posts the existing completion notice, and closes the issue while preserving its records. Format validation enforces structure and consistency of mode/gaps; Gemini makes the semantic judgment about whether outcome and process are satisfied. A failed response or save does not append a control or discard earlier history.

## Interactive execution

The intended workflow starts when a qualifying procedure issue is opened or when the push workflow creates an issue from a committed trigger. It initializes that issue's state, reads the state-to-instruction mapping, and posts the current instruction to the issue. The complete procedure remains in its source file and is not posted to the issue.

On receipt of an agent return, validate it against the current instruction's expected return. If valid, record the returned value, update the persisted state, and render the instruction associated with the resulting state. If invalid, retain the current state and post the validation error for correction. A waiting-return status is unnecessary.

Keep state updates, instruction rendering, and return validation separate. Each issue has its own state. Serialize processing for the same issue to prevent overlapping updates.

## Preserve run history

Use a fresh issue for every run. Append instructions, agent returns, and validation results as comments in that issue. Preserve the comments and the final persisted state. Close the issue when its run finishes; do not delete it or reuse it for a later run.

## Implementation status

The procedure, transition map, transition executor, render positions, lookup, HTML interface, and structural validator are implemented. The issue-trigger workflow and Gemini–Selenium harness are implemented; a live Gemini run has not yet been verified.

## Run the HTML interface

From this directory, run:

```sh
node interface-server.js
```

Open http://127.0.0.1:3000. Each page load starts a separate in-memory run from an empty state object through the transition map. Submit or Enter sends the expected values through the compiled map(state) contract; Shift+Enter inserts a newline. The interface does not change transitions.js or add interface fields to its state. Server restart discards these interface sessions.

Instruction keys and values are resolved using Instruction-render.json and Instruction-lookup.json. Input controls and JSON return schemas are derived from the explicit types already present in the instruction text. Structural checks include strings, integers, Booleans, arrays, required object fields, byte ranges, and relative file references. They do not judge whether a response is semantically correct.

The targetFiles return uses records with filename and newFile. The caller retains targets marked newFile: true for later file-reference validation. The HTML form also has a New files field. Existing file references must resolve inside the fixture workspace; designated new files do not need to exist. The fixture manifest lists three existing files and one new-file requirement. The interface validates file references; it does not itself execute the requested file edits.

Run the HTTP adapter and validator checks with:

```sh
node interface.test.js
```

The tests cover minimal, fidelity, accountability, and repeated accountability through all 24 renders. They also check rejected types, nested integer fields, nonexistent files, and the new-file exception. These are HTTP/application tests; they are not Selenium browser tests.

The adapter exposes POST /api/start and POST /api/submit. A submission contains id, values (using $variableName keys), and optional newFiles. Responses contain the rendered entries, inputs, returnSchema, state, and submission history for the harness. Gemini and Selenium can consume this interface without changing the transition executor.

## Selenium setup

The Selenium browser adapter is in selenium/browser.py. create_browser() starts headless Chrome using Selenium's built-in driver management. read_screen(driver) reads the current instruction and return schema. submit_values(driver, values) fills the corresponding form controls and clicks Submit, then waits for the next screen, completion, or a validation error. It does not generate answers or modify the transition executor.

Install the browser dependency and verify the setup:

```sh
python -m pip install -r selenium/requirements.txt
python selenium/smoke.py
```

The smoke check starts the existing interface server, opens its first screen, verifies the prompt and input box, and shuts down. It submits no values and takes no screenshots. Setup diagnostics are written to selenium/artifacts, which is ignored by git.

The AGENTS Selenium setup GitHub Actions workflow installs Node and Python, installs Selenium, and runs this initial-form check. It can be started manually and also runs when its workflow or Selenium setup files change. The Gemini-driven procedure run and screenshots of every render remain separate work.

## Render the procedure to issues

Every active issue screen includes shared communication instructions from `renderIssue()`. After a confirmed submission, check after 10, 20, and 30 additional seconds (60 seconds total). If no response appears, resubmit the identical return once, without repeating the substantive work, then use the same bounded checks. Stop and report pending if the response still does not appear. New requests, completion, validation errors, and rate limits end the ordinary waiting path. Communication calls are excluded from execution reports to avoid self-referential reporting. Completion comments do not instruct the agent to submit or poll again.

Start a run using the AGENTS Procedure issue template or the commit trigger described above. The workflow always enforces AGENTS Procedure — <UTC creation timestamp>, including after title edits, initializes a separate state, and posts the current instruction with the shared communication and navigation wrapper. The full procedure is not posted.

Reply using ${variableName}: value, where value is JSON of the declared type. For example:

```text
${userIntent}: "The user wants to know what JSON stands for."
```

Do not add a request number or values wrapper. The workflow validates the supplied variable name and the value, then updates that state variable. Steps with no captured return accept {} after their instruction is completed.

Return targetFiles as an array of records, each with filename and newFile. Use repository-relative paths in issue replies. Set newFile to true for creation and false for changes to an existing file:

```text
${targetFiles}: [{"filename":"new-file.txt","newFile":true},{"filename":"README.md","newFile":false}]
```

Existing targets must resolve to files. New targets may be absent; their paths must still be valid within the workspace. The caller retains the designated filenames for subsequent requirement and change-record validation, so those records do not need to repeat newFile. A designation permits a planned file reference; it does not create the file or prove execution.

Each valid return updates the issue state through the transition function. Compiled hidden decisions execute immediately; the next visible instruction is posted. Validation errors do not advance the state. The workflow keeps comment-processing identifiers internally; they are not part of the submitted return schema.

The issue runner stores hidden communication metadata in the state object. `expectedInputs` is populated when the issue screen is rendered and associates its request number and render with the requested variable and value schema. Submission validation reads this stored association without recalculating it from the instruction. Returns must match before the state advances; an unrendered request cannot accept inputs. Hidden transitions do not update expected inputs. `renderedRequests` lists request numbers whose instruction comments were successfully published. The runner checks this list before publishing, skips recorded requests, and records a request only after GitHub accepts its comment. A failed post remains eligible for retry. Request numbers distinguish separate visits to the same render in a loop. Normal instruction comments do not embed captured state; the explicit state view exposes the saved state.

Existing run records without `renderedRequests` import their published request markers from bot comments once. Subsequent publication checks use the saved list. Comment reads still collect incoming returns and deduplicate validation-error messages. Publication and state persistence are separate GitHub operations: if a comment succeeds but saving its publication receipt fails, the stored list can lag behind the comment.

Each run is saved as issue-runs/<issue-number>.json with the state, current request number, input history, and state snapshots. For trigger-backed runs, the runner also appends each distinct updated receipt to the matching issue-run-triggers/<procedureIdentifier>.json, preserving the trigger’s initial receipt and metadata. The state itself retains its existing input fields, render number, and loop counter. Workflow runs for the same issue are serialized, and the runner reads pending JSON comments in order. Bot comments do not trigger another processing cycle. Terminal runs post completion and close the issue while preserving its history. Normal-mode issue processing makes no Gemini calls. Gemini mode calls generateContent after prompt capture and after each accepted return; it does not use Selenium. The separate Selenium harness remains available for testing.

Run the local issue adapter checks with node issue-workflow.test.js. They verify the adapter without creating an actual GitHub issue.

The runner recognizes a procedure issue by an existing saved run record, an AGENTS Procedure title prefix, or the checked Procedure acknowledgement in its body. A new run requires the checked acknowledgement even when its title matches. Title-edit events enforce the canonical title only; they do not initialize or advance the procedure.

The caller loads transitions.json and compiles it once: const map = compileTransitionMap(transitions). The result is a state-to-state operator. Initialize with map({}); for subsequent returns, apply validated inputs to the previous state and call map(state). There is no separate state.json or state config entry.

The transition CLI accepts a JSON state as its first argument (default {}), with optional values JSON as its second argument, and prints the next state or halt. The renderer CLI accepts the JSON state as its first argument. Neither CLI reads or writes a shared state template.

## Transition result contract

compileTransitionMap(transitions) returns a function map(state). Compilation builds executable state transformations and connects sequence successors, Boolean destinations, branches, and entry pointers from the JSON. The resulting operator returns the next state object, or the string halt at a terminal destination. It does not render or walk JSON items during invocation. Nested sequence arrays are resolved during compilation. Exhausted selected arrays, null items, and null return destinations resolve to halt. The transition map omits null render fields; only a non-null render value returns a renderable state. Missing or malformed addresses remain errors rather than being silently treated as completion.

The GitHub workflow runner is the caller. It writes the returned state into the issue's run file before posting its instruction. At halt it preserves the final updated state, records completion, and does not render another instruction. The HTML adapter consumes the same result contract. Initialization calls map({}). The first map item defines the initial input fields and render; no separate state template is loaded. The workflow persists each resulting run state.

Issue comments render the procedure's instruction directly. Its declared return variable and type define the response; no additional generated return-schema block or reply envelope is posted. Replies use ${variableName}: value. Structural validation remains based on the procedure's declared types.


## Run Gemini through Selenium

The Gemini adapter is in `selenium/gemini.py`. It reads each live browser screen, sends its instruction, held state, declared inputs, and return contract to the existing Gemini generateContent API, validates the returned JSON names and types, and submits accepted values through `selenium/browser.py`. Validation failures are sent back to Gemini with their actual error text. Prompts, responses, submitted values, state snapshots, failures, and screenshots are saved as run evidence; the API key is sent in an HTTP header and is not written to the evidence.

Configure the GitHub Actions repository secret `GEMINI_API_KEY`; optionally set `GEMINI_MODEL`. The model defaults to the value used by the existing Gemini integration. Open **Actions → AGENTS Gemini Selenium → Run workflow**, then select a scenario:

- `minimal` exercises the minimal answer path.
- `fidelity` selects the fidelity path.
- `accountability` selects the accountability path.
- `repeated-accountability` exercises the accountability loop.

The workflow first runs the existing Node tests and the focused Gemini adapter tests, then starts the local interface and headless browser for the selected live scenario. It uploads the run log and screenshots as a downloadable Actions artifact. Source pushes run the test checks without calling Gemini unless the commit changes workflows/gemini-selenium/trigger.json with enabled set to true.

The interface collects procedure returns; it does not edit repository files. If a live scenario reaches an instruction to execute file requirements, the harness records a screenshot and an execution-blocked result, then stops at that screen. It does not claim those changes or later completion values. The mocked adapter tests verify response parsing, declared-variable checks, validation-error recovery, terminal handling, and evidence capture; they do not prove a live Gemini run. The existing interface tests cover the procedure's 24 renders across its documented paths.

## Commit trigger for Gemini Selenium

The workflow trigger is workflows/gemini-selenium/trigger.json in this procedure directory. It contains timestamp (an ISO timestamp string) and enabled (a Boolean). Commit a fresh timestamp with enabled: true to main to start a live minimal scenario. Set enabled: false to disable live execution for a trigger update. Unrelated commits do not start live Gemini even if the stored Boolean remains true. Manual scenario selection remains available through workflow_dispatch.

## Execution tool-invocation report

When `exampleMatch` returns false, the issue runner creates `issue-runs/<issue-number>-tool-invocations.json` with the run's `procedureIssueNumber` and `toolInvocations: null`. Execution renders 13 and 17 point to that same file. At either render, append only the new invocation records to `toolInvocations`; if it is still null, replace it with an array. Preserve the issue-number header and previously accepted records. The on-screen example lists the record fields, and web-tool records also require `http_method` and `url`. Each record includes the operator selection, invocation fields, matching requirement fields, final tool output, and outcome. Use null for non-applicable nullable values. A file commit triggers validation of only the newly appended records. Invalid JSON or records leave the current render unchanged and produce a validation comment. Valid records are appended to the issue run, the workflow reports counts by tool and runtime (or working directory), and the next change-list render is posted. The workflow then writes the cumulative artifact to the same path with `submissionAccepted: true`; this marker prevents the report-writing commit from being processed as a second submission. The caller stores accepted records in its own toolInvocations array, outside the state passed to map(state), preserving earlier loop records. Renders 14 and 18 link to the cumulative JSON artifact instead of embedding the full array in the issue comment. The HTML runner holds the array in its session and renders it directly. The report is supplied by the executor and structurally validated; it is not an automatic interception of external tool calls or proof that a reported change occurred. The Gemini harness still stops where it lacks a file executor.



