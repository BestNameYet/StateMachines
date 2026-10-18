# General GitHub command issue

An owner-created issue containing `<!-- github-command-surface:v1 -->` is a persistent general command surface. Add that marker to the issue body. The repository owner submits one JSON command per new comment, either plain or inside one JSON fence. Other commenters, bots, pull requests and edited-comment events are ignored. This surface is independent of AGENTS Procedure runs, screens and workspace limits. Existing procedure commands continue unchanged.

## User-issue command JSON

`user-issue-command.schema.json` defines the envelope. `command-catalog.json` contains **every non-issue REST operation** in GitHub's official api.github.com OpenAPI snapshot, keyed by its operationId. Each command lists its HTTP method, route, description, path/query arguments, body requirement and documentation link. The catalog is not limited to the GitHub connector's smaller tool menu. Issue operations and routes containing `/issues` are deliberately excluded. Unrestricted GraphQL is excluded too, because it could bypass the issue-command exclusion. The workflow uses issue APIs internally only to receive commands and publish receipts.

```json
{"version":1,"command":"repos/get","parameters":{}}
```

```json
{"version":1,"command":"repos/create-or-update-file-contents","parameters":{"path":"WIP-example.txt"},"body":{"message":"Create example","content":"SGVsbG8K","branch":"main"}}
```

GitHub Contents `body.content` must itself be base64 as required by that API. Updating requires `body.sha`. These commands address the API directly; they do not inherit an AGENTS workspace restriction. `owner` and `repo` default to this repository for corresponding path arguments, but can be explicitly supplied. Other path and query arguments belong in `parameters`; JSON fields belong in `body`. Optional `headers` select API media types/version or endpoint-specific headers. For raw binary uploads use `body_base64` and the appropriate Content-Type; `body` and `body_base64` are mutually exclusive. String `body` sends raw text.

## Execution and receipts

`.github/workflows/github-command-issue.yml` runs on new issue comments. It checks owner identity, fetches the current issue/comment, validates catalog arguments, posts a started receipt, performs one API request, then updates that receipt with HTTP status/request ID and an Actions run link. The full response bytes and metadata are uploaded as a seven-day Actions artifact. Responses are not dumped into issue comments or logs. Redirects are returned without forwarding credentials; pagination requires additional explicit commands. GitHub validates endpoint-specific body schemas and permissions and its error response is retained.

The receipt marker binds execution to the comment ID. A rerun skips a comment with an existing bot receipt, including a started receipt with uncertain outcome. There are no automatic API retries. After a network interruption or lost receipt update, inspect the artifact, run and target state before submitting a new comment. Deleted receipts or new comment IDs can permit repetition; this is not a transactional exactly-once guarantee. Jobs serialize per issue; keep all commands for one ordered sequence in that same issue.

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
