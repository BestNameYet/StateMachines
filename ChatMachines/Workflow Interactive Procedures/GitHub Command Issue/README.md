# General GitHub command issue

## Open the command surface

Submit a command in **any repository issue**, as the repository owner. The command returns its rendered results to the **same originating issue**. Prefix each new command comment with the explicit command-scope marker:

```text
<!-- command-scope -->
{"version":1,"command":"repos/get","parameters":{}}
```

To retrieve command documentation, post a new comment in that issue:

```text
<!-- command-scope -->
{"version":1,"command":"help"}
```

The local `help` command returns documentation links without executing a requested GitHub REST operation. Commands supported by the catalog remain subject to credential permissions. Each command uses its own comment ID and response receipt.

The source issue comes from the GitHub `issue_comment` event (`event.issue.number`). No particular issue number, special issue title, or issue-body marker is needed. An authorized comment must start with `<!-- command-scope -->` followed by one JSON command (plain or JSON-fenced). The current workflow listens to owner-created or owner-edited issue comments and excludes bots, other users and pull requests. Commands are separate from AGENTS Procedure run state; established procedure returns are unaffected.

## User-issue command JSON

`user-issue-command.schema.json` defines the envelope. `command-catalog.json` contains **every non-issue REST operation** in GitHub's official api.github.com OpenAPI snapshot, keyed by its operationId. Each command lists its HTTP method, route, description, path/query arguments, body requirement and documentation link. The catalog is not limited to the GitHub connector's smaller tool menu. Issue operations and routes containing `/issues` are deliberately excluded. Unrestricted GraphQL is excluded too, because it could bypass the issue-command exclusion. The workflow uses issue APIs internally only to receive commands and publish receipts.

```json
{"version":1,"command":"repos/get","parameters":{}}
```

```json
{"version":1,"command":"repos/create-or-update-file-contents","parameters":{"path":"WIP-example.txt"},"body":{"message":"Create example","content":"SGVsbG8K","branch":"main"}}
```

GitHub Contents `body.content` must itself be base64 as required by that API. Updating requires `body.sha`. These commands address the API directly; they do not inherit an AGENTS workspace restriction. `owner` and `repo` default to this repository for corresponding path arguments, but can be explicitly supplied. Other path and query arguments belong in `parameters`; JSON fields belong in `body`. Optional `headers` select API media types/version or endpoint-specific headers. For raw binary uploads use `body_base64` and the appropriate Content-Type; `body` and `body_base64` are mutually exclusive. String `body` sends raw text.

## Execution, rendering, and receipts

The workflow `.github/workflows/github-command-issue.yml` runs `issue-command.js` for an authorized `issue_comment` event. The runner validates the comment and operation, publishes a started receipt, executes the requested GitHub API or supported local operation, and then updates its receipt. The origin is always the event's issue; the result is returned to that same issue.

The result renderer `render-command.js` follows the AGENTS Procedure's issue-rendering pattern: a pure function formats a structured command result as Markdown without posting it. The runner publishes each rendered part using the GitHub Issue Comments API. GitHub Contents file responses are decoded from Base64 into readable UTF-8 text when applicable; other API JSON responses are formatted as JSON. Large response text is split into bounded issue comments. An HTTP or local-operation failure is marked as a failure rather than successful execution.

Each command receipt is tied to its originating comment ID and a digest of the comment body. A repeated event with an existing bot receipt is skipped. If a GitHub API POST succeeds but receipt publication or update is interrupted, verify its existing result before retrying. The runner logs the HTTP status and returned comment metadata for issue-comment create/update calls, without logging authorization tokens.

The command runner does not modify an AGENTS Procedure's instruction-rendering behavior. It reuses that **render-before-publish** pattern for command outputs only.

## Authentication and API availability

Owner-only applies to who can request commands. API authority comes from the credential. `COMMAND_API_TOKEN`, if configured as a repository Actions secret, is used only for the requested API call. Otherwise the workflow's GITHUB_TOKEN is used. The ordinary token has only the permissions declared in the workflow; many catalog commands (organization administration, user access, secrets, repository deletion, or other repositories) require a separately configured appropriately scoped credential. No token is created or broadened automatically. Listing an API command does not grant its permission. API behavior, plan availability and GitHub's own policies still apply.

The workflow uses GITHUB_TOKEN for control comments even when a custom API token is configured. Its normal permissions are contents:write, issues:write, actions:write and pull-requests:write. Repository file mutations are enabled with the ordinary token; a suitably scoped COMMAND_API_TOKEN can also permit them. Workflow-file mutations may require a separate credential. Token-triggered GitHub events may not start other workflows; explicit Actions dispatch or an appropriate app/PAT may be needed.

Treat the issue as privileged: commands can perform destructive API operations when the credential permits them. Do not paste credentials in comments. Full API responses may contain sensitive data and are accessible to people who can download this private repository's artifacts. Secrets must be supplied as encrypted API values when the endpoint requires encryption; the runner does not implement secret encryption or arbitrary local execution.

## Catalog refresh and verification

The catalog records the exact official source commit. Refresh deliberately with:

```sh
node build-catalog.js /path/to/api.github.com.json <official-source-commit-sha> command-catalog.json
node --test issue-command.test.js
```

Download the OpenAPI file from that exact commit in `github/rest-api-description`, at `descriptions/api.github.com/api.github.com.json`. The generator resolves local parameter/body references and creates one command per non-issue operation. No npm dependencies or runtime spec downloads are needed. The catalog is a pinned snapshot, not a claim to cover future endpoints or separate GitHub Enterprise Server API versions.
