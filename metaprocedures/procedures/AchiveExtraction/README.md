# AchiveExtraction

Configurable archive operations in Google Drive. The directory spelling matches the requested path.

## Existing execution chain

GitHub Actions Node.js -> `untrusted AI/meta-procedure/Procedures/JS Runner/js-runner.js` -> this directory's `procedure.json` `script` -> HTTP POST containing `sourcecode` and `arguments` -> existing Google Apps Script `doPost` -> Google Drive.

No new workflow or Gemini API client is defined here. The procedure is not automatically triggered by merely committing the files. To execute it, an existing authorized GitHub Actions workflow must invoke:

```sh
node 'untrusted AI/meta-procedure/Procedures/JS Runner/js-runner.js' 'metaprocedures/procedures/AchiveExtraction/procedure.json'
```

## Configure

Edit `config.json`. Each `archives` item specifies a Drive `id` and unique `alias`. An `actions` array executes **in the provided order**; each action has a unique `id`, a registered `type`, and an `archive` alias. For `extract_selected`, specify exact ZIP entry paths in `entries`. Set `destination.folder_id` to a Drive folder ID or `null` to write to the Apps Script executing account's root Drive. Generate a fresh `run_id` per execution.

Available actions:

- `inspect`: return source file metadata.
- `list_entries`: attempt `Utilities.unzip`, list exact paths and sizes.
- `extract_selected`: attempt `Utilities.unzip` and save the named entries individually.
- `copy_archive`: save a copy of the original archive.

Each action may specify `on_error: "stop" | "continue"`. A source archive is not intentionally edited. `Utilities.unzip` operates on the complete blob and can fail under Google Apps Script resource limits; no ZIP streaming capability is claimed.

## Result contract

Apps Script writes `<report_prefix>-<run_id>.json` into the designated Drive folder. The report records each action, error, output file IDs, run ID, and source metadata. A GitHub POST receipt is **not** final verification. Independently retrieve the current run's report through Drive, confirm the run ID and action order, inspect all expected output files, and compare source metadata.

## Important limits

- No direct production workflow has been wired or executed in this change.
- Reusing a run ID may create ambiguous duplicate reports; use a new ID for each run.
- Files in ZIPs with colliding basenames can yield separate Drive objects with the same display name; identify output files by returned file IDs.
- The Apps Script endpoint's `eval` function executes with its configured permissions. Restrict deployment access and do not run configurations from untrusted sources.
- Automated recovery is specified in `procedure.json` but has not been proven by an end-to-end execution.
