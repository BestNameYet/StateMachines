# AGENTS Procedure

Unified-package revision: new runtime paths are documented in **Unified WIP packages and command runtime** below. Legacy path descriptions remain as compatibility guidance; canonical package paths supersede them when `AGENTS_PACKAGE_LAYOUT` is not `legacy`.

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

Gemini returns `control` on every call. Continue responses may include commands, an `{instruction, expectedInputs}` screen, or worker assignments; completion responses contain only `control`. `gemini-workflow.js` fills this template with the saved state, serializes it into a user-role message, and calls generateContent. A malformed response is sent back with its validation error for correction, up to three response attempts. Only validated responses are saved; continue screens require nonempty expected inputs and supported schemas.

### Stored Gemini screens

`screenFromGeminiResponse()` returns a JSON-serializable `{instruction, expectedInputs}` object. `saveGeminiScreen(record, response, saveRecord)` appends that object to `record.state.renderedScreens`, sets `state.render` to its zero-based array index, and invokes the caller's existing run-record saver. It returns the same stored object. A failed save restores the previous in-memory state and throws. Publication remains separate; the helper does not post a comment or record publication success.

`render-gemini.js` provides `renderGeminiScreen(screen)`, which returns the instruction text verbatim, and `lastGeminiScreen(state)`, which retrieves the final array entry. The Gemini issue path uses that last object directly, not positional field mappings. Its expected-input definitions remain stored for the workflow validator; they are not printed as instruction JSON. Normal mode retains its predefined renderer and numbering. After an API or format failure, accepted variables and the last screen remain saved. Type `retry` to request the next screen without repeating the substantive work.

### Screen navigation and returns

Every active issue screen links to [communication instructions and the command menu](comment-boilerplate.md). Type `state` to have the workflow post the saved-state screen; type `back` to post the current instruction again. These commands preserve the current request and expected inputs, do not advance the procedure, and do not call Gemini. Inputs can be submitted from either view. Captured values are no longer embedded in the instruction screen. The HTML interface exposes the same typed commands.

Gemini instructions use `{$variableName}`. Submit a single return as `{$variableName}: JSON value`, or submit multiple returns as a JSON object with bare names as keys, for example `{"total":60,"confirmed":true}`. The existing `${variableName}: value` spelling remains accepted. The workflow checks exactly the requested keys and validates their types, object fields, array contents, and allowed values. It rejects unsupported schema keywords rather than pretending to enforce them. An invalid submission does not update variables, advance the request, or call Gemini. Accepted values are appended to the variables array before the next API call. A repeated name preserves the earlier entry and appends its latest value.

The screen array stores the mode-choice and prompt-capture instructions followed by valid generated screen or assignment-broadcast objects. Command-only exchanges do not append screens. The last object supplies the active instruction and expected inputs. Publication tracking continues to use the existing request receipts; saving a generated object does not claim that its comment was published successfully. `state`/`back` display posts do not append a new Gemini instruction to that array.

Run `node gemini-screen.test.js` and `node gemini-workflow.test.js` for object storage and the mocked end-to-end issue/API cycle. Source pushes also run a live API check when Gemini generation sources change and the secret is available. That check generates, validates, saves, and renders one screen, submits the computed integer product, then requires a completion assessment with no additional screen; its log distinguishes live calls from a skipped check. The live check does not create issues or perform user file tasks.

### Semantic control loop and completion

Every Gemini call receives the updated state and independently materializes a new `control` object. It contains `target` and `current` (each with outcome and process description strings), `gap` (outcome and process arrays), `progress` (`reduced` Boolean and a description of the observed change), and `mode` (`continue` or `completion`). The target is derived from the original user request, decomposed into outcomes, tasks, required methods, and constraints. Current status is assessed from the rendered screens, recorded returns, and supported changes. The gap compares both the final state against the desired state and the actions/state changes against the requested process. Missing or contradictory evidence remains a gap.

The workflow appends every valid assessment to `state.controls` in chronological order and includes that history in later requests. There is no separate current-control field. Gemini recalculates rather than reusing the last assessment. Controls are not included in instruction comments; they are visible through the explicit state view.

A continue response must have an identified gap and commands or a screen aimed at reducing it. A completion response must have both gap arrays empty and contains only `control`: no instruction, expected inputs, or extra screen. The workflow persists the assessment, marks the run done, posts the existing completion notice, and closes the issue while preserving its records. Format validation enforces structure and consistency of mode/gaps; Gemini makes the semantic judgment about whether outcome and process are satisfied. A failed response or save does not append a control or discard earlier history.

### Three-turn stall limit

The workflow counts consecutive accepted operator turns for which Gemini reports `control.progress.reduced: false`. The initial assessment is a baseline and does not count. Actual reduction resets `state.noProgressTurns` to zero. Three consecutive turns without reduction stop the run as **stalled/incomplete**, preserve its remaining gaps and control history, and close the issue without another instruction. This is distinct from successful completion. Gemini reports observed progress; the workflow enforces the count. Navigation, format-correction retries, and failed API calls do not count as additional operator turns.

Necessary preparatory work reduces the gap: finishing a required prerequisite, obtaining necessary information, resolving uncertainty, or completing required setup changes the supported state and reduces remaining work, even before the final output changes. One of five equally weighted prerequisite steps completes one fifth of that section. Rewording the gap, weakening the target, unrelated activity, and repeating completed work do not count. Each progress description identifies the relevant state change. Closeness alone or a prediction that the gap is impossible does not halt the loop.

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

Every active issue screen links to the shared [comment boilerplate](comment-boilerplate.md) from `renderIssue()`, instead of repeating it. After a confirmed submission, check after 10, 20, and 30 additional seconds (60 seconds total). If no response appears, resubmit the identical return once, without repeating the substantive work, then use the same bounded checks. Stop and report pending if the response still does not appear. New requests, completion, validation errors, and rate limits end the ordinary waiting path. Communication calls are excluded from execution reports to avoid self-referential reporting. Completion comments do not instruct the agent to submit or poll again.

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




## Supervisor workspace and commands

Each procedure issue gets a persistent repository folder at `issue-workspaces/<issue-number>/` beneath this directory, initialized with `manifest.json`. The issue number binds the workspace; the workflow uses authenticated GitHub Contents operations rather than depending on its checkout staying current. The supervisor can read and write that folder and every subfolder. Workers place full created or modified files there. Changes to original source paths outside the workspace are not implicitly applied.

Every supervisor request contains the entire instruction template, original objective, complete current state, and `commandMenu`. Each menu entry describes its arguments and returned information. State includes workspace location, chronological command requests/results, saved variables, screen history, controls, and assignment returns. File paths in commands are relative to the issue workspace. Absolute paths, traversal, symlinks in the local adapter, and direct replacement of the managed manifest are rejected.

Commands are JSON objects in the optional `commands` array:

- `{"name":"view_inventory"}` recursively returns file paths and manifest descriptions. Files created outside the write command appear with a blank description until their manifest entry is supplied.
- `{"name":"read_files","paths":["rules.md","src/task.js"]}` returns contents or per-file not-found errors.
- `{"name":"write_files","files":[{"path":"rules.md","description":"Worker rules","content":"Full contents"}]}` creates or replaces UTF-8 files and updates their descriptions. JavaScript source can be saved; writing it does not execute it.
- `{"name":"set_standing_instructions","instruction":"Full shared rules"}` replaces the rules that accompany every subsequent rendered instruction or assignment broadcast.

A continue response can contain **commands only**. Omit all screen fields; do not supply a blank instruction. The workflow saves command intent, executes commands, records their results, and calls Gemini again with the full updated package and menu. The last screen remains unchanged. Commands may also accompany a screen: commands execute first, then the supplied screen is saved and published. To make a screen decision using command results, request commands without a screen first. Failed commands return an error in the command result. Interrupted command batches can resume using saved command receipts. Supervisor and worker command exchanges have no fixed count limit. Gemini API calls have no workflow-imposed 60-second abort timeout. Execution errors and hosting runtime limits can still interrupt a call; saved state remains available for recovery. Internal exchanges do not add operator turns to the three-turn stall counter.

## Worker broadcasts

Instead of a single instruction/expectedInputs pair, the supervisor can return:

```json
{
  "control": "the same required control object, not this placeholder",
  "assignments": [
    {
      "id": "worker-one",
      "worker": "chatgpt",
      "instruction": "Calculate twelve times five. Return the product as {$total}.",
      "expectedInputs": [{"name":"total","schema":{"type":"integer"}}]
    }
  ]
}
```

Assign ready work to each available worker immediately. Do not wait for the full worker pool to register or assemble. Registration identifies workers; it is not a scheduling barrier. Only task dependencies and required returns justify waiting.

Use one to four assignments, at most one `chatgpt` and three `gemini`. IDs are unique within the broadcast. Every assignment has its own nonempty expected inputs and uses the same description-first return instructions and supported schema vocabulary. Variable names may repeat between workers; assignment IDs keep their returns separate.

The workflow saves the broadcast as one serializable screen object containing assignments and the standing-instruction snapshot. Its comment renderer publishes task-specific standing instructions on screen A and all worker work instructions in pairs on screens B and C. Gemini assignment instructions are visible as API worker echoes. Supervisor meta-instructions and response-format guidance remain in API messages; the comment wrapper links to shared worker communication guidance instead of repeating it.

Each complete comment, including the communication wrapper, must fit within 65,000 characters. Oversized comments fail before any part is posted; content is never silently truncated. Each part has its own saved publication receipt, so retrying a partially published broadcast resumes the remaining parts. The broadcast's inputs become available only after all parts are published. As with existing comment receipts, a post that succeeds before its receipt save fails can be duplicated on recovery.

Workers choose a nonce at the beginning and keep using it. Return `{"nonce":"my-worker-nonce","assignmentId":"worker-one","values":{"total":60}}`. The first valid return can register the nonce, or the worker can first type `register my-worker-nonce chatgpt`. Later returns must use that same nonce, bound to the same worker nonce. The workflow validates only that assignment's expected keys and schemas. Accepted returns are stored independently, and variables carry their assignment ID. Duplicate accepted returns are rejected. The supervisor is called again after all assignments return, with the full updated state. No worker edits the issue screen directly and no separate screen-write queue is needed.

`gemini-workers.js` dispatches up to three Gemini assignments concurrently after publication. Each receives the loaded worker-instructions.md, current project README when present, standing instructions, its assignment/expected inputs, complete saved state, and current workspace files. It can request workspace operations as `{nonce, commands}` before returning exactly `{nonce, values, files}`; files is an array of `{path, description, content}`, or empty. The coordinator validates results, saves response receipts, writes files through the workspace command implementation, and applies returns serially. Failed workers can be retried without repeating accepted workers. Workers generate text/source; no arbitrary JavaScript execution tool is provided. The ChatGPT assignment is performed by the connected operator using the issue instructions and submitted through the ordinary issue reply. The runner processes up to four successive all-Gemini broadcasts in one event, then requests `retry` to continue. A mixed broadcast waits for its ChatGPT return.

The HTML adapter displays standing rules and the ChatGPT instruction and exposes assignmentId/values inputs. Its workspace and session behavior remain local; automatic Gemini worker dispatch is implemented in the issue runner.

Run `node supervisor-tools.test.js` for command-only full-state replay, inventory/descriptions, workspace isolation, concurrent Gemini worker dispatch, independent returns, unchanged-screen behavior, and recovery after partial three-comment publication. These tests use mocked model calls; they do not prove an external issue run or execution of generated source.

### Request another worker instruction

Workers choose a nonce on first registration or valid return. The nonce is their sole identity throughout the run; `state.workers` stores `{nonce,type}` and assignments can target a registered worker using `nonce`. There are no numbered worker IDs or slots. Each worker can hold only one active assignment, and assignment IDs must be unique across a run.

The worker menu includes `next <nonce>`, for example `next my-worker-nonce`. The workflow rejects this command if that worker has pending expected returns, if a supervisor call is already pending, or if the nonce is unknown. Otherwise it records the identified worker’s request in `state.workerInstructionRequests` and sends Gemini the complete current package. Other workers’ unfinished assignments are carried forward into the next broadcast with their expected inputs intact. A worker request does not fabricate an empty return or complete an assignment.

The worker nonce is an input chosen by the worker and retained across all of its responses in that issue. `register <nonce> <chatgpt|gemini>` explicitly registers before work; registration also occurs on the first valid assignment return. A nonce cannot be reused for a different worker or type, and a registered worker cannot silently change its nonce. Gemini workers choose a nonce on their first API response and receive that identity on subsequent assignments. Use `next <nonce>` for the next-instruction command. Nonces associate returns; they are not authentication credentials.

## Worker delivery and context

Prepare assignments before worker registration. `register <nonce> <chatgpt|gemini>` binds a worker to prepared work and immediately delivers it without waiting for other workers. Registration records identity/binding only; it does not advance the request/render, change captured values, call the supervisor, or generate a new screen. A Gemini worker first chooses a nonce in an API registration response; its prepared instruction is sent as soon as that registration is saved, independently of slower registrations.

`worker-instructions.md` contains worker behavior, a general solution heuristic, response envelopes, and complete JavaScript, Markdown and JSON formatting examples. The workflow loads this file on every Gemini worker API invocation. Every substantive call also includes the current project README from `project/README.md` when available, full standing rules, assignment/expected inputs, objective, complete saved state, input history, worker-specific prior instructions/returns/results, and `reconstructionQueue`. This queue begins with a baseline snapshot and has ordered set/delete/append changes between that worker's messages. It reconstructs observed workflow state; it is not an invented Git commit history. The workflow persists the context ledger and rebuilds the package on every call, including after workspace operations and retries.

ChatGPT retains its conversation context and receives instructions through issue comments. It does not receive an automatically forwarded API state package. Use `state` to inspect saved state through comments and `back` to return; large state views are split into bounded comments. Gemini assignment instructions are delivered through the API and echoed verbatim in the worker-assignment comment screens for visibility. These echoes are labeled as API worker instructions; other workers must not submit their returns. All assignments remain saved for workflow validation and supervisor context.

Workers have the same workspace operation instructions as the supervisor, including inventory, reads, writes and standing-rule updates, within the same issue folder/subfolders. Submit `{"nonce":"your-worker-nonce","commands":[{"name":"read_files","paths":["project/README.md"]}]}` to the issue, or as a Gemini worker API response. The workflow validates the nonce and request, performs the operation using its own GitHub access, records attributed results, and returns them without treating the operation request as an assignment return. Workers receive no GitHub credentials and make no GitHub API calls. The instructions and operation menu accompany each worker message. File writes update manifest descriptions; writing JavaScript does not execute it.

Tests cover an early worker starting while another registration is still pending, immediate prepared-assignment delivery without task-state advancement, credential-free workspace requests, file guide loading, echoing Gemini instructions in comments, and reconstruction of current state from the worker's baseline/change queue. Live API checks still do not establish full archive-analysis completion.

## Legacy repository-root workspace

This legacy option is disabled for unified packages. Production unified issue processing rejects repository-root mode; the legacy environment setting exists for compatibility tests.

An issue with `### Workspace access` followed by `repository-root` uses the repository root (`state.workspace.path: "."`) for both supervisor and worker operations. This is an explicit per-issue access choice; normal issues retain their isolated issue folder. The workflow keeps that run's metadata manifest at `issue-workspaces/<issue-number>/manifest.json` and does not overwrite the repository's root manifest.

`copy_files` accepts `{name:"copy_files",files:[{source:"src/main.js",path:"source-code-copy/src/main.js",description:"Preserved JavaScript source"}]}`. The GitHub-backed root storage references original Git blobs directly in a new tree/commit, preserving bytes and executable modes. It refuses missing/symlink sources and conflicting existing destinations, and identical existing copies are a no-op. A concurrent branch change causes a normal Git ref failure rather than a force push; saved operation errors can be retried. Root-mode workers receive the full workflow context and inventory/read access but not an automatic read of every repository file. They still receive no GitHub credentials.

## Supervisor file-content visibility

The supervisor API payload includes file contents only from `read_files` results explicitly attributed to the supervisor. Worker reads, file-write request bodies, and cached worker response files carry metadata with `contentOmitted: true` instead. Paths, descriptions, operation results, and accepted task returns remain visible. Persisted state remains complete; filtering applies only when building the supervisor API request. Final worker file writes are attributed to the worker nonce.



## File commands through issue comments

Only the repository owner (the owner login in `GITHUB_REPOSITORY`) may control the procedure through issue comments. Other users and bots are ignored, including file operations, worker commands, registration, navigation, and task returns that could trigger writes. Pending file operations are reauthorized against their original owner-authored comment before execution. This restriction applies to comment inputs; workflow-owned Gemini API operations retain their existing execution path.

For an active procedure issue, submit one JSON operation per comment (plain JSON or a fenced JSON block). These commands work in normal and Gemini modes, without selecting a new mode or submitting a task return.

```json
{"operation":"create","path":"src/example.js","value":"module.exports = 60;\n"}
```

`create` requires the file to be absent. `mutate` uses the same fields and requires an existing file; `value` is its complete replacement UTF-8 contents. Delete with `{"operation":"delete","path":"src/example.js"}`. Paths use the issue workspace by default; issues explicitly configured for repository-root access use repository-relative paths.

Route agent repository changes through these comments rather than direct writes during a procedure. The workflow validates the request, saves an operation intent, executes GitHub Contents operations, and stores attributed results in `state.fileOperations`, including before/after blob IDs and the commit receipt when available. It posts a result without advancing the current instruction or satisfying expected returns. Failures are recorded as failures. Reprocessing a comment reuses its receipt; after interruption, an already-achieved target state is recorded as recovered with no invented commit. Concurrent target changes are rejected. A new comment is a new operation.

Requests cannot traverse outside the configured workspace or directly replace its managed manifest. These operations save source; they do not execute it. The supervisor API receives operation metadata without replacement file bodies.


## Unified WIP packages and command runtime

The default layout (`AGENTS_PACKAGE_LAYOUT` other than `legacy`) colocates each issue's persistent data under `ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/procedures/<issue-number>/`:

- `trigger.json`: trigger identity, issue binding and receipt history, or an issue-created descriptor.
- `records/state.json`: workflow-owned canonical state, command intents, operation results, accepted returns and publication receipts.
- `records/tool-invocations.json`: the complete validated execution report.
- `files/`: work products and their managed manifest.
- `runtime/tasks.json`, `runtime/scripts/`, `runtime/results/`: registered tasks, scripts and durable execution results.

File-trigger intake still uses `issue-run-triggers/<name><nonce>.json` so an issue can be allocated before its numeric package exists. After initialization, that intake file is a compact binding/pointer, while trigger history and all subsequent events live in the issue package. Issue-created runs initialize their own descriptor. Existing trigger histories, workspaces and run records remain untouched as compatibility sources; copying is not deletion or rewriting of historical paths inside receipts.

`run-package.js` supplies canonical paths and enforces the WIP boundary. New issue processing reads canonical state first and falls back to legacy state. Before a legacy run switches storage, its package is copied. Large state and trigger records load through Git blobs. Report submission, publication, expected inputs and owner-only authorization continue through the existing procedure validator and handler. Existing source implementations outside WIP are not writable through the package workspace. Package records and runtime results are workflow-managed; use their commands rather than replacing state directly.

### Migration

Owner comment: `{"operation":"migrate_packages"}`. The workflow scans a non-truncated Git tree, resolves trigger issue bindings and references the existing Git blobs in a new tree. File bytes and executable modes are preserved. Each package gets an empty task registry and missing issue descriptor/empty-workspace placeholder as needed. Already identical destinations are no-ops; newer canonical state/report/trigger files are preserved. Conflicting work-product destinations and symlink sources fail before any branch update. The branch update is an ordinary non-forced fast-forward, so concurrent changes are not overwritten. Original legacy paths are retained. A command receipt includes the commit and full source/destination plan; long comment output links to the record instead of dropping the plan.

The reviewed migration dry run used a live WIP subtree inventory: 184 tree entries, 17 bound triggers, 102 files mapped across 50 issue packages, and zero destinations outside WIP. This was a plan-only check; it did not migrate live repository data. Recompute the plan at execution time because the repository can change.

### Commands beyond file creation

All commands below are owner-authored issue comments and do not require a worker nonce:

| Command | JSON fields | Result |
| --- | --- | --- |
| `submit_report` | `operation`, `records` (new invocation records only) | Existing schema validation, append-only report save and normal procedure advancement |
| `migrate_packages` | `operation` only | Byte-preserving package colocation with a commit/plan receipt |
| `run_script` | `operation`, `task`, `args` (string array) | Registered task execution, exit status, bounded output and saved runtime result |

`submit_report` supplies a new batch, not a rewritten history. Invalid records leave task state unchanged. A completed report advances only through the existing report-step validation. Direct report-file push handling remains available for old and canonical paths. File `create`/`mutate`/`delete` commands use `files/` by default; names beginning `runtime/` address that package's runtime inputs. Direct writes to `records/` and `runtime/results/` are rejected. Normal saved-state navigation and read-only record access remain available. The inventory includes file, runtime and record paths. Command identifiers, actors, requests and actual outcomes remain in the canonical state.

See [runtime/README.md](runtime/README.md) for task registration, Docker isolation, limits and output semantics. No general shell execution is exposed. Docker is required for live execution; missing Docker or an unsuccessful task is recorded as failure. The runtime tests mock Docker and do not claim live container execution.

### Wiring, review and remaining controls

`workflow-update.patch` is staged within WIP because this procedure's authorization does not include `.github/`. After review, that patch adds package report discovery and tests/source filters to the existing workflow. It runs the ten legacy suites with `AGENTS_PACKAGE_LAYOUT=legacy` and the unified-package/runtime suites with their own configuration. Do not promote an incomplete subset of the source files: the handler imports the new path, command and runtime modules.

This revision prepares review copies; it does not itself deploy those copies or migrate the actual records. Mirror Mode from issue #56 remains a separate review package; this work starts from the currently deployed normal/Gemini implementation and must be merged with #56 during promotion rather than overwriting its changes.

Still outside the command system: GitHub job scheduling, initial workflow wiring/review promotion, container image provisioning, host Docker availability, and the connector calls that deliver comments. They are infrastructure prerequisites. File mutations, report submission, deterministic package migration and registered task execution have explicit command interfaces and persistent receipts.

Verification: ten legacy suites plus `node run-package.test.js` and `node runtime/runner.test.js`. Tests cover migration planning, idempotency, collisions, canonical-state preservation, WIP boundaries, legacy reopening, rejected and accepted report commands, owner authorization, runtime snapshot/cleanup and Docker isolation arguments. Live migration and live Docker execution require separate execution evidence.
