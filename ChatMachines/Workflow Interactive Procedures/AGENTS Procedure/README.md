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

This README records the agreed convention. The workflow, persisted state file, mapping, renderer, and validator have not yet been implemented in this folder.

## Rendering instructions and the final report

Use two separate render objects. The instruction render object presents what the agent must do and return. The final-report render object presents the instruction number, the approved output title, and contextual labels followed by their corresponding ${variableName} values. Output titles belong in the final report, not in the instruction set.

For each loop iteration, append a new section headed "Loop ${loopNumber}". Render a new instance of the applicable instruction report using that iteration's values. Include only instructions and values actually used in that loop iteration; do not repeat unrelated instructions or values. Preserve prior loop sections so the report records each iteration in order.
