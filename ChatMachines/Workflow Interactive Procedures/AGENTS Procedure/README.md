# AGENTS Procedure

## Create a procedure run

Create a new issue in the BestNameYet/StateMachines repository for each run of this procedure. GitHub issues belong to the repository rather than a folder. Associate the issue with this procedure using the title and the procedure folder recorded in its body.

Use this issue title format:

AGENTS Procedure — <UTC timestamp in YYYY-MM-DDTHH:mm:ssZ format>

Include these fields in the issue body:

- Procedure: AGENTS Procedure
- Procedure folder: ChatMachines/Workflow Interactive Procedures/AGENTS Procedure
- Started at: <same UTC timestamp used in the title>
- User request: <original user request>

The timestamp distinguishes runs. The issue number identifies the run and its separate persisted state.

## Interactive execution

The intended workflow starts when a qualifying procedure issue is opened. It initializes that issue's state, reads the state-to-instruction mapping, and posts the current instruction to the issue. The complete procedure remains in its source file and is not posted to the issue.

On receipt of an agent return, validate it against the current instruction's expected return. If valid, record the returned value, update the persisted state, and render the instruction associated with the resulting state. If invalid, retain the current state and post the validation error for correction. A waiting-return status is unnecessary.

Keep state updates, instruction rendering, and return validation separate. Each issue has its own state. Serialize processing for the same issue to prevent overlapping updates.

## Preserve run history

Use a fresh issue for every run. Append instructions, agent returns, and validation results as comments in that issue. Preserve the comments and the final persisted state. Close the issue when its run finishes; do not delete it or reuse it for a later run.

## Implementation status

The procedure, state template, transition executor, render positions, lookup, HTML interface, and structural validator are implemented. The issue-trigger workflow is implemented; the Gemini–Selenium harness is not yet connected.

## Run the HTML interface

From this directory, run:

```sh
node interface-server.js
```

Open http://127.0.0.1:3000. Each page load starts a separate in-memory run from the state template. Submit or Enter sends the expected values through the existing transition(state, valuesJson) contract; Shift+Enter inserts a newline. The interface does not change transitions.js or add interface fields to its state. Server restart discards these interface sessions.

Instruction keys and values are resolved using Instruction-render.json and Instruction-lookup.json. Input controls and JSON return schemas are derived from the explicit types already present in the instruction text. Structural checks include strings, integers, Booleans, arrays, required object fields, byte ranges, and relative file references. They do not judge whether a response is semantically correct.

The new-file designation is explicit: list names in the form's New files field, or use newFile: true on a file record. Existing file references must resolve inside the fixture workspace; designated new files do not need to exist. The fixture manifest lists three existing files and one new-file requirement. The interface validates file references; it does not itself execute the requested file edits.

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

Start a run using the AGENTS Procedure issue template. The workflow always enforces AGENTS Procedure — <UTC creation timestamp>, including after title edits, initializes a separate state, and posts the current instruction, captured values, and return schema as a comment. The full procedure is not posted.

Reply with a JSON comment, optionally inside a JSON code fence. Use the request number shown in the instruction comment:

```json
{
  "request": 1,
  "values": {
    "$verbatimUserPrompt": "The original user request"
  }
}
```

Each valid return updates that issue's state through transition(state, valuesJson). Hidden decisions execute immediately; the next visible instruction is posted. Steps with no captured return accept an empty values object. Validation errors are posted without advancing the state. The request number rejects replies to old instructions, including earlier loop iterations. File references are checked relative to the repository root; include an optional newFiles array or newFile: true on a record when creating files.

Each run is saved as issue-runs/<issue-number>.json with the state, current request number, input history, and state snapshots. The state itself retains its existing input fields, render number, and loop counter. Workflow runs for the same issue are serialized, and the runner reads pending JSON comments in order. Bot comments do not trigger another processing cycle. Terminal runs post completion and close the issue while preserving its history. No Gemini calls or Selenium runs are made by this workflow.

Run the local issue adapter checks with node issue-workflow.test.js. They verify the adapter without creating an actual GitHub issue.

The issue form includes a Procedure identifier so a run is recognized even when its initial title is changed. Existing runs are also identified by their saved run record. The canonical title uses the issue creation timestamp, so correcting a title never changes the run's timestamp. Title-edit events only enforce the title and do not advance the procedure.

## Behavioral requirements

The required issue-form acknowledgement refers to [Behavioral-requirements.md](Behavioral-requirements.md). Read those requirements before starting a run.
