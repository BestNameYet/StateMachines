# Matching image comparison

## Purpose and current behavior

This directory implements an ONNX-based image comparison pipeline. GitHub Actions starts it when a **new repository issue** is opened with the **exact title** `matching-trigger`. No branch, pull request, JSON toggle, or commit is needed to request a comparison.

The program compares each image in `datasets/telemetry_batch/` against **one** anchor image selected from `datasets/anchor/`. It does **not** perform all-pairs matching, identify people by name, or automatically create an anchor. Its numeric threshold is a configured heuristic, not a validated identity probability.

## Entry points

- `../.github/workflows/signal_alignment.yml` — **active execution workflow**. Trigger: `issues: [opened]`; the comparison job is gated on the exact issue title `matching-trigger`. It uses the current default-branch checkout.
- `state_machine.py` — **active Python comparison program**, called by the workflow inside Docker.
- `Dockerfile.runtime` — Python 3.10 container definition, offline dependency installation, and model verification.
- `obsolete/bootstrap.py` — previous initialization-only script; not invoked by the active workflow.

## How to request an execution

1. Ensure the desired images are committed to `matching/datasets/anchor/` and `matching/datasets/telemetry_batch/` on the repository default branch (`main`).
2. Open a **new issue** in this repository titled exactly `matching-trigger` (case-sensitive). Issue body is not parsed for arguments.
3. The GitHub Actions workflow starts. It posts the outcome and any generated report to that issue and then closes it. Each issue has its own issue number and Actions run.

Opening any differently titled issue does not execute the comparison job. Editing or reopening an existing issue does not trigger this workflow, because the configured event is `opened` only. A workflow run may still appear with a skipped job for other issue titles.

## Data layout

```text
matching/
  README.md
  state_machine.py
  Dockerfile.runtime
  requirements.txt
  models/
    spatial_detector.onnx
    feature_encoder.onnx
  wheels/                      # archived dependency wheels used to build image
  datasets/
    anchor/                   # reference images; program chooses first glob match
    telemetry_batch/          # candidate images scanned on every run
  obsolete/
    bootstrap.py
```

The currently committed telemetry batch contains `signal_001.jpg` through `signal_028.jpg`. The anchor directory currently contains only `.gitkeep`, **not a reference image**. An execution with no anchor image fails in the `LOAD_ANCHOR` state. The code currently selects the first non-`.gitkeep` file returned by `glob` in the anchor directory; selection is not deterministic if multiple anchors exist. Keep exactly one valid anchor image until selection is made explicit. The scanner attempts every non-`.gitkeep` file in the telemetry directory, including unsupported files; image decode failures are recorded as faults.

## Execution details

1. GitHub receives an `issues.opened` event. The workflow job runs only when `github.event.issue.title == 'matching-trigger'`.
2. `actions/checkout@v4` checks out repository files with Git LFS downloads disabled.
3. Git LFS retrieves the committed ONNX models and offline dependency wheels. The workflow computes a SHA-256 fingerprint of the Dockerfile, requirements, models, and wheel files.
4. Docker authenticates to GHCR, attempts to pull the stable `:py310` image, and compares its embedded build-input fingerprint. If the image is absent or its fingerprint differs, the workflow builds from the repository and pushes a replacement under the same tag. Concurrent comparison runs are serialized to prevent competing builds.
5. `docker run` starts the resolved image digest and bind-mounts the checked-out repository at `/repo`. It copies the two **already packaged** ONNX models from `/workspace/matching/models/` into `/repo/matching/models/`, replacing any Git LFS pointers in the checkout. Normal runs do not reinstall dependencies; rebuilds install exclusively from the committed wheel archive. Fresh runners pull the image when available.
6. The container executes `python matching/state_machine.py` from `/repo`. The program loads both ONNX sessions, reads an anchor image, scans the telemetry directory, extracts vectors, computes Euclidean distances, sorts results, and emits a Markdown report.
7. The workflow copies `matching/metrics.md` to the Actions step summary if it exists, uploads it as artifact `matching-comparison-report`, posts the job result and report to the triggering issue, and closes the issue even when the comparison step fails. The report is **not committed** to the repository.

The runtime is published under the stable tag `ghcr.io/bestnameyet/statemachines-matching-runtime:py310`. Each run resolves and records its immutable digest and the build-input fingerprint. The workflow is the sole owner of building and executing the runtime; there is no separate container-build workflow.

## Comparison semantics and outputs

`state_machine.py` uses `spatial_detector.onnx` to attempt region localization and `feature_encoder.onnx` to compute normalized embeddings. If no detector region passes its internal confidence threshold, it embeds the whole frame. It compares the anchor vector with each candidate using Euclidean distance and marks candidates `PASSED` when distance is **strictly less than 0.65**, otherwise `DIVERGENT`. Per-image processing exceptions are marked `Fault` and do not stop the remainder of the batch. Output is sorted by ascending distance.

The program writes `matching/metrics.md` by default, or the path in `GITHUB_STEP_SUMMARY` if set. The workflow sets that environment variable inside Docker to `/repo/matching/metrics.md` and then publishes the report separately to the real GitHub Actions summary. The report contains anchor basename, number of batch files, threshold, and a ranked result table. This is similarity scoring, not a verified face-identity conclusion.

## Failure and maintenance notes

- Missing anchor: comparison fails; the workflow comments on and closes the trigger issue with the failure status and a link to logs.
- Empty telemetry directory: the program produces a report with zero batch entities if an anchor exists.
- Missing or invalid model: comparison fails during initialization.
- The `matching/trigger.json` file is **legacy/inert**. The previous JSON, push, and pull-request trigger mechanisms are not used.
- `matching/Signal_matching_dataset.zip` is a retained source archive; the one-time extraction workflow is retired. The 28 extracted JPEGs remain in `datasets/telemetry_batch/`.
- `wheels/` and `models/` are retained as build inputs for `Dockerfile.runtime`; do not remove them merely because the comparison job reads them from the published container.
- To rebuild the image, update the committed Dockerfile, requirements, models, or wheels, or remove the published image. The next `matching-trigger` issue automatically rebuilds it. Rebuilds require GHCR package write access.
- The old dependency persistence and dataset extraction workflows have been removed; their outputs remain in the repository.
