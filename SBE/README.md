# SBE — Sealed Branch Eval

SBE is the repository's end-of-task containment and verification method.

## Contract

1. The authoritative task specification exists on `main` at `SBE/requests/<request-id>.json` before the processing PR is opened.
2. The processing branch is named exactly `processing/<request-id>`.
3. Relative to the PR base, the processing branch contains exactly one changed submission file and that file is an added or modified `.gz` file.
4. A pull request targets `main` from the same repository.
5. `SBE Seal Submission` reads trusted SBE code from `main`, treats the PR head only as untrusted data, and performs **no Gemini evaluation before sealing**.
6. The workflow immediately wraps the submitted `.gz` in a header-encrypted 7z archive using the user-controlled `GZ_PASSWORD` repository secret. The producing model never receives that password.
7. The encrypted artifact plus a non-content manifest are persisted to `main` at `SBE/sealed/<request-id>/<source-head-sha>/`.
8. The workflow removes the submitted `.gz` from the processing branch and replaces it with `.delete-processing-branch`.
9. `SBE Delete Processing Branch` runs after successful sealing. It verifies the marker, verifies that the marker commit is directly descended from the submitted commit and contains only the expected submission deletion plus marker addition, and verifies the sealed artifact exists on `main`.
10. After those checks, it closes the pull request without merge and deletes the processing branch.
11. **Only after the processing branch has been deleted** does the workflow decrypt the password-protected artifact in ephemeral runner storage and send the decompressed submission to Gemini for completion evaluation against the authoritative request.
12. The full Gemini evaluation is itself encrypted with `GZ_PASSWORD` and stored as `evaluation.7z` beside the submission archive. The manifest records only non-content evaluation metadata and `evaluation_status: PASS|FAIL`.
13. A successful SBE completion claim requires the sealed artifact to exist on `main`, the PR to be closed without merge, the processing branch to be deleted, and the post-delete Gemini evaluation to report `PASS`.

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

## Security boundary

The plaintext submission may exist in the temporary processing branch and ephemeral runner only until it is sealed. It is never merged into `main`. The durable submission artifact on `main` is password-encrypted. Branch deletion is lifecycle cleanup; the cryptographic protection comes from the user-controlled `GZ_PASSWORD` encryption. Gemini evaluation occurs only after sealing and branch deletion, and the full evaluation is also stored encrypted.
