# AGENTS Procedure

## Create a procedure run

Create a new issue in BestNameYet/StateMachines using the AGENTS Procedure issue template for each run. Check the required Procedure acknowledgement checkbox before submitting. The template contains that acknowledgement; it does not collect the user prompt. The first rendered instruction captures the verbatim user prompt in the issue replies.

The workflow replaces the issue title with AGENTS Procedure — <issue creation timestamp in UTC>, including after title edits. The timestamp comes from GitHub's issue creation time and remains unchanged throughout the run. The issue number identifies the run and its separate persisted state.

GitHub issues belong to the repository rather than a folder. The runner stores this procedure's run records under ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-runs/.

## Interactive execution

The intended workflow starts when a qualifying procedure issue is opened. It initializes that issue's state, reads the state-to-instruction mapping, and posts the current instruction to the issue. The complete procedure remains in its source file and is not posted to the issue.

On receipt of an agent return, validate it against the current instruction's expected return. If valid, record the returned value, update the persisted state, and render the instruction associated with the resulting state. If invalid, retain the current state and post the validation error for correction. A waiting-return status is unnecessary.

Keep state updates, instruction rendering, and return validation separate. Each issue has its own state. Serialize processing for the same issue to prevent overlapping updates.

## Preserve run history

Use a fresh issue for every run. Append instructions, agent returns, and validation results as comments in that issue. Preserve the comments and the final persisted state. Close the issue when its run finishes; do not delete it or reuse it for a later run.

## Implementation status

The procedure, transition map, transition executor, render positions, lookup, HTML interface, and structural validator are implemented. The issue-trigger workflow is implemented; the Gemini–Selenium harness is not yet connected.

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

The tests cover minimal, fidelity, accountability, and repeated accountability through all 23 renders. They also check rejected types, nested integer fields, nonexistent files, and the new-file exception. These are HTTP/application tests; they are not Selenium browser tests.

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

Start a run using the AGENTS Procedure issue template. The workflow always enforces AGENTS Procedure — <UTC creation timestamp>, including after title edits, initializes a separate state, and posts the current instruction and captured values as a comment. The full procedure is not posted.

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

Each run is saved as issue-runs/<issue-number>.json with the state, current request number, input history, and state snapshots. The state itself retains its existing input fields, render number, and loop counter. Workflow runs for the same issue are serialized, and the runner reads pending JSON comments in order. Bot comments do not trigger another processing cycle. Terminal runs post completion and close the issue while preserving its history. No Gemini calls or Selenium runs are made by this workflow.

Run the local issue adapter checks with node issue-workflow.test.js. They verify the adapter without creating an actual GitHub issue.

The runner recognizes a procedure issue by an existing saved run record, an AGENTS Procedure title prefix, or the checked Procedure acknowledgement in its body. A new run requires the checked acknowledgement even when its title matches. Title-edit events enforce the canonical title only; they do not initialize or advance the procedure.

The caller loads transitions.json and compiles it once: const map = compileTransitionMap(transitions). The result is a state-to-state operator. Initialize with map({}); for subsequent returns, apply validated inputs to the previous state and call map(state). There is no separate state.json or state config entry.

The transition CLI accepts a JSON state as its first argument (default {}), with optional values JSON as its second argument, and prints the next state or halt. The renderer CLI accepts the JSON state as its first argument. Neither CLI reads or writes a shared state template.

## Transition result contract

compileTransitionMap(transitions) returns a function map(state). Compilation builds executable state transformations and connects sequence successors, Boolean destinations, branches, and entry pointers from the JSON. The resulting operator returns the next state object, or the string halt at a terminal destination. It does not render or walk JSON items during invocation. Nested sequence arrays are resolved during compilation. Exhausted selected arrays, null items, and null return destinations resolve to halt. The transition map omits null render fields; only a non-null render value returns a renderable state. Missing or malformed addresses remain errors rather than being silently treated as completion.

The GitHub workflow runner is the caller. It writes the returned state into the issue's run file before posting its instruction. At halt it preserves the final updated state, records completion, and does not render another instruction. The HTML adapter consumes the same result contract. Initialization calls map({}). The first map item defines the initial input fields and render; no separate state template is loaded. The workflow persists each resulting run state.

Issue comments render the procedure's instruction directly. Its declared return variable and type define the response; no additional generated return-schema block or reply envelope is posted. Replies use ${variableName}: value. Structural validation remains based on the procedure's declared types.
