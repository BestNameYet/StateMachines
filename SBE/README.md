# SBE — Sealed Branch Eval

SBE is the repository's end-of-task containment and verification method.

## Contract

1. The authoritative task specification exists on `main` at `SBE/requests/<request-id>.json` before the processing PR is opened.
2. The processing branch is named exactly `processing/<request-id>`.
3. Relative to the PR base, the processing branch contains exactly one changed submission file and that file is an added or modified `.gz` file.
4. A pull request targets `main` from the same repository.
5. `SBE Seal Submission` reads trusted SBE code from `main`, treats the PR head only as untrusted data, and performs **no Gemini evaluation before sealing**.
6. The workflow immediately wraps the submitted `.gz` in a header-encrypted 7z archive using the user-controlled `GZ_PASSWORD` repository secret.
7. The encrypted artifact plus a non-content manifest are persisted to `main` at `SBE/sealed/<request-id>/<source-head-sha>/`.
8. The workflow removes the submitted `.gz` from the processing branch and replaces it with `.delete-processing-branch`.
9. `SBE Delete Processing Branch` runs after successful sealing. It verifies the marker, verifies that the marker commit is directly descended from the submitted commit and contains only the expected submission deletion plus marker addition, and verifies the sealed artifact exists on `main`.
10. After those checks, it closes the pull request without merge and deletes the processing branch.
11. **Only after the processing branch has been deleted** does the workflow create a fresh cryptographic evaluation nonce, decrypt the password-protected artifact in ephemeral runner storage, and send the decompressed submission plus the authoritative request and nonce to Gemini.
12. Gemini is permitted to return only an exact two-field object: `{"result":"PASS|FAIL","nonce":"<exact supplied nonce>"}`. No reasoning, evidence, explanation, or other field is accepted.
13. The controller rejects a response whose nonce does not exactly match the nonce generated for that evaluation run. The nonce therefore binds the Gemini verdict to that specific evaluation/test run.
14. The controller encrypts the nonce-bound evaluation record with `GZ_PASSWORD` and stores it as `evaluation.7z` beside the submission archive. The manifest records only non-content metadata: `evaluation_status`, `evaluation_nonce`, and the encrypted evaluation archive path.
15. A successful SBE completion claim requires the sealed artifact to exist on `main`, the PR to be closed without merge, the processing branch to be deleted, and the post-delete Gemini evaluation to return `PASS` with the exact expected nonce.

## Authoritative request schema

```json
{
  "request_id": "example-id",
  "request": "Verbatim task/request to be evaluated.",
  "completion_criteria": [
    "Optional explicit completion criterion"
  ]
}
```

`request_id` must match the branch suffix in `processing/<request-id>`.

## Gemini return schema

The Gemini evaluator has exactly one allowed response shape:

```json
{
  "result": "PASS",
  "nonce": "<exact nonce supplied for this evaluation>"
}
```

or, when the submitted work does not satisfy the request:

```json
{
  "result": "FAIL",
  "nonce": "<exact nonce supplied for this evaluation>"
}
```

Any additional field, altered nonce, malformed response, or other result is rejected by the controller.

## Security boundary

The plaintext submission may exist in the temporary processing branch and ephemeral runner only until it is sealed. It is never merged into `main`. The durable submission artifact on `main` is password-encrypted. Branch deletion is lifecycle cleanup; the cryptographic protection comes from the user-controlled `GZ_PASSWORD` encryption.

Gemini evaluation occurs only after sealing and branch deletion. Gemini's accepted output contains no explanatory answer content: only the verdict and the evaluation nonce that identifies which test/evaluation the verdict belongs to. Privileged repository writes remain under deterministic workflow control rather than model control.
