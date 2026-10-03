# GeminiEvaluation routing and nextmessage devices

This directory contains several GitHub-driven conversation/evaluation runtimes. The repository uses **nextmessage devices** as isolated commit-trigger inputs: a nextmessage folder contains a single mutable message file, and committing a change to that message file triggers the workflow bound to that path.

## Nextmessage routing chart

| Nextmessage device folder | Mutable message file | Triggering workflow | Runtime / primary program | Primary persisted output | Purpose |
|---|---|---|---|---|---|
| `ChatMachines/GeminiSupervisor/nextmessage/` | `nextmessage.json` | `.github/workflows/gemini-chat.yml` — **Gemini Supervisor state machine** | `ChatMachines/GeminiSupervisor/send-to-gemini.js` (with Step 0 preparation through `scripts/generate-step-0-form.js`) | `ChatMachines/GeminiSupervisor/runs/<run_nonce>/...` | Advances the main Gemini Supervisor state machine for the message/run encoded in the device. |
| `ChatMachines/GeminiEvaluation/evaluator-nextmessage/` | `nextmessage.json` | `.github/workflows/gemini-supervisor-evaluator.yml` — **Gemini Supervisor evaluator** | `ChatMachines/GeminiEvaluation/evaluate-supervisor.js` | `ChatMachines/GeminiEvaluation/evaluations/<run_nonce>/evaluation.json`, `messages.json`, and configured output files | Runs the configurable evaluator/reviser. The message is only one input; `GeminiEvaluation/config.json` controls evaluation mode, generic inputs, heuristic, output schema, history policy, and output locations. |
| `ChatMachines/GeminiEvaluation/historical-audit-nextmessage/` | `nextmessage.json` | `.github/workflows/gemini-supervisor-historical-audit.yml` — **GeminiSupervisor historical audit** | `historical-audit-archive-builder.js` → `historical-audit-segmenter.js` → `historical-audit-flat-evaluator.js` | `ChatMachines/GeminiEvaluation/evaluations/<run_nonce>/` including `evidence/`, `live-view/`, batch state/results, synthesis, evaluation, metadata, and process log | Starts the isolated historical-audit pipeline over the evidence archive described by `GeminiSupervisor/historical-audit-data.json`. |

## Isolation convention

A nextmessage device is treated as a one-message transaction surface.

1. Mutate the device's `nextmessage.json` for the intended conversation/runtime.
2. Prefer a commit containing **only that nextmessage mutation** when using the device as a transaction trigger.
3. The matching workflow consumes the message and writes resulting state/output somewhere else; the nextmessage file remains the input device rather than the output store.
4. `run_nonce` identifies the isolated run/output directory where the runtime supports nonce-scoped runs.
5. Do not assume two nextmessage devices share context, configuration, schemas, or history merely because they both send prompts to Gemini.

## Important evaluator distinction

`evaluator-nextmessage/nextmessage.json` is **not by itself a generic fresh Gemini conversation**.

The workflow always executes `evaluate-supervisor.js`, which reads `ChatMachines/GeminiEvaluation/config.json`. That config can inject its own `generic_inputs`, `evaluation_heuristic`, `evaluation_output_schema`, message-history settings, and output paths. Therefore a new message can be semantically overridden or constrained by the current evaluator configuration even when `generic_reuse_message_history` is false.

Before using `evaluator-nextmessage` for a substantially different evaluator task, inspect the current `config.json` and ensure its mode, inputs, heuristic, and output schema match the intended transaction. If a task needs a permanently independent evaluator personality/contract, give it its own nextmessage device/workflow rather than repeatedly repurposing a shared config.

## Workflow path bindings

The current path filters are:

```text
ChatMachines/GeminiSupervisor/nextmessage/nextmessage.json
    -> .github/workflows/gemini-chat.yml

ChatMachines/GeminiEvaluation/evaluator-nextmessage/**
    -> .github/workflows/gemini-supervisor-evaluator.yml

ChatMachines/GeminiEvaluation/historical-audit-nextmessage/nextmessage.json
    -> .github/workflows/gemini-supervisor-historical-audit.yml
```

These bindings are the first place to check when determining which runtime a committed message will invoke.
