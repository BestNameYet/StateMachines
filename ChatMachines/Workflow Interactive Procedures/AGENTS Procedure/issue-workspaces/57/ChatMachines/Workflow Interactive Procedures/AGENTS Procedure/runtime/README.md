# WIP command runtime

Each unified procedure package has `runtime/tasks.json`, `runtime/scripts/` and workflow-owned `runtime/results/`. Docker must be available on the workflow host. The runner uses fixed `node:22-bookworm-slim` and `python:3.12-slim` images. Dependencies must be supplied with task inputs or through a reviewed runtime-image change. There is no shell-command or arbitrary-image parameter.

Create a script through the existing file command, for example `{"operation":"create","path":"runtime/scripts/test.js","value":"console.log(42);\n"}`. The workflow initializes an empty tasks registry, so register a task with `mutate`:

```json
{"operation":"mutate","path":"runtime/tasks.json","value":"{\"test\":{\"engine\":\"node\",\"script\":\"scripts/test.js\",\"timeoutSeconds\":60}}\n"}
```

Run `{"operation":"run_script","task":"test","args":[]}` as an owner-authored comment. Python registrations use engine `python` and a relative script under `scripts/`. Arguments are passed as an argument vector, without a shell. Only registered tasks can execute.

The workflow fetches a fresh disposable snapshot of package `files/` and runtime inputs before each run (maximum 2000 regular files and 64 MiB). It rejects symlinks and omits previous runtime results. The container mounts only that snapshot: work files are writable and runtime inputs are read-only. Canonical records, repository checkout, Git credentials and Docker socket are not mounted. Workflow credentials are not forwarded. Containers have no network, a read-only root, dropped capabilities, no privilege escalation, a non-root user, one CPU, 512 MiB memory, 64 processes, and bounded temporary storage. Timeout is 1–300 seconds; captured output is bounded to 1 MiB. Cleanup removes containers after timeout.

Exit code, stdout, stderr, timeouts and output-limit indicators are saved in package state and `runtime/results/<operation-id>.json`. Long comment output is explicitly shortened; the full bounded result remains in the artifact. Script failures are recorded as failures. An unavailable Docker daemon/image is a failed operation. Script writes occur only in the disposable snapshot and are not automatically promoted to repository files. Use explicit file commands for persistent work products.

Run `node runtime/runner.test.js` for registration, path checks, Docker argument boundaries, isolation settings, cleanup and result handling. That suite mocks Docker; it is not evidence of a live container run.
