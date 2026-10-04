# SBE — Sealed Branch Eval

SBE is the repository's end-of-task verification and containment method.

## Contract

1. The authoritative task specification exists on `main` at `SBE/requests/<request-id>.json` before the processing PR is opened.
2. The processing branch is named exactly `processing/<request-id>`.
3. Relative to the PR base, the processing branch contains exactly one changed submission file and that file is an added or modified `.gz` file.
4. A pull request targets `main` from the same repository.
5. `SBE Seal and Evaluate` reads trusted SBE code and the authoritative request from `main`. It checks out the PR head only as untrusted data and never executes code from it.
6. Gemini evaluates the decompressed submission against the authoritative request. A producer completion claim is not evidence. Missing, contradictory, unverifiable, or materially incomplete work is `FAIL`.
7. On `FAIL`, the PR and processing branch remain for correction. Nothing is sealed or deleted.
8. On `PASS`, the workflow wraps the `.gz` submission and the full Gemini evaluation in a header-encrypted 7z archive using the user-controlled `GZ_PASSWORD` repository secret. The producing model never receives that password.
9. Only the encrypted archive plus a non-content manifest are persisted to `main` at `SBE/sealed/<request-id>/<evaluated-head-sha>/`.
10. The workflow removes the submitted `.gz` from the processing branch and replaces it with `.delete-processing-branch`.
11. `SBE Delete Processing Branch` runs only after a successful SBE workflow. It verifies the marker, verifies that the marker commit is directly descended from the evaluated commit and contains only the expected submission deletion plus marker addition, verifies that the sealed archive exists on `main`, and verifies that the manifest records `PASS`.
12. Only after those checks does it close the pull request without merge and delete the processing branch.

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

The plaintext submission may exist in the temporary processing branch and ephemeral runner while evaluation is occurring. It is never merged into `main`. The durable result on `main` is password-encrypted. The full evaluator reasoning is stored inside that encrypted archive rather than as plaintext repository content.

Branch deletion is lifecycle cleanup, not the cryptographic protection. The cryptographic protection is that the durable artifact on `main` is encrypted using the user-controlled password.
