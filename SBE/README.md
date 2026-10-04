# SBE — Sealed Branch Eval

SBE is the repository's end-of-task containment and verification method.

## Contract

1. The authoritative task specification exists on `main` at `SBE/requests/<request-id>.json` before the processing PR is opened.
2. The processing branch is named exactly `processing/<request-id>`.
3. Relative to the PR base, the processing branch contains exactly one changed submission file and that file is an added or modified `.gz` file.
4. A pull request targets `main` from the same repository.
5. `SBE Seal Submission` reads trusted SBE code from `main`, treats the PR head only as untrusted data, and performs **no Gemini evaluation before sealing**.
6. The workflow immediately wraps the submitted `.gz` **and the authoritative request JSON** in a header-encrypted 7z archive using the user-controlled `GZ_PASSWORD` repository secret.
7. That encrypted payload archive plus a non-content manifest are persisted to `main` at `SBE/sealed/<request-id>/<source-head-sha>/` as `submission.7z` and `manifest.json`.
8. The workflow removes the submitted `.gz` from the processing branch and replaces it with `.delete-processing-branch`.
9. `SBE Delete Processing Branch` runs after successful sealing. It verifies the marker, verifies that the marker commit is directly descended from the submitted commit and contains only the expected submission deletion plus marker addition, and verifies the sealed payload exists on `main`.
10. After those checks, it closes the pull request without merge and deletes the processing branch.
11. **Only after the processing branch has been deleted** does the workflow generate a fresh 64-hex-character evaluation nonce and invoke the evaluator.
12. The evaluator receives `GZ_PASSWORD`, unlocks `submission.7z`, recovers the authoritative request and `.gz` submission, and sends the request, completion criteria, submission, and nonce to Gemini.
13. Gemini's answer is not returned to the workflow as plaintext. The evaluator writes Gemini's raw answer as the single file `answer.json`, encrypts that file in a header-encrypted 7z archive with the same `GZ_PASSWORD`, and returns the password-protected archive to the workflow.
14. The workflow unlocks the evaluator-return archive in ephemeral runner storage and requires it to contain exactly one file named `answer.json`.
15. `sbe-validate-evaluator-return.js` then mechanically validates the decrypted answer. It requires exactly one JSON object, exactly the keys `result` and `nonce`, `result` equal to `PASS` or `FAIL`, and an exact nonce match.
16. If mechanical validation fails, the validator records only the invalid response, the exact validation failure, and an exact valid return-schema example. The original evaluation payload is **not returned by the evaluator**; it is reconstructed when needed from the password-protected `submission.7z` already stored on `main`.
17. For a repair attempt, the evaluator unlocks the original `submission.7z` and its previous encrypted answer archive using `GZ_PASSWORD`, reconstructs the original evaluator payload, combines it with the invalid response, validation failure, and exact schema example, and asks Gemini for a corrected answer. The corrected answer is again returned only as a password-protected archive containing one `answer.json`.
18. The workflow mechanically validates each decrypted answer. A structurally valid `FAIL` is an evaluation verdict, not a schema failure.
19. Once a return is mechanically valid, the workflow persists the **evaluator-produced encrypted answer archive itself** as `evaluation.7z` on `main`; it does not persist the plaintext answer. The manifest records only non-content metadata, `evaluation_status`, `evaluation_nonce`, and the evaluation archive path.
20. A successful SBE completion claim requires the sealed input archive to exist on `main`, the PR to be closed without merge, the processing branch to be deleted, and the mechanically validated post-delete Gemini result to be `PASS` with the exact nonce for that evaluation run.

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

## Accepted evaluator answer

Inside the evaluator's encrypted return archive, `answer.json` must contain exactly:

```json
{"result":"PASS","nonce":"<exact supplied nonce>"}
```

or:

```json
{"result":"FAIL","nonce":"<exact supplied nonce>"}
```

No additional field, prose, markdown, or altered nonce is accepted.

## Invalid-answer correction data

If the decrypted `answer.json` fails deterministic validation, the ephemeral validation record contains:

```json
{
  "validation_status": "INVALID",
  "response": "<raw invalid answer.json contents>",
  "validation_check_failure": "<exact deterministic failure>",
  "exact_return_schema_example": {
    "result": "PASS",
    "nonce": "<exact current nonce>"
  }
}
```

The evaluator reconstructs the original request/submission payload from the encrypted `submission.7z` on `main`; the original payload does not need to be returned in the evaluator's answer archive.

## Security boundary

The plaintext submission may exist in the temporary processing branch and ephemeral runner only until it is sealed. It is never merged into `main`. The durable evaluation input on `main` is password-encrypted as `submission.7z` and contains both the authoritative request and the submitted `.gz`.

After branch deletion, the evaluator is allowed to receive `GZ_PASSWORD` so it can unlock the sealed input and lock its own response. The workflow receives only the evaluator's encrypted return archive, unlocks it ephemerally for deterministic validation, and persists that same encrypted archive as `evaluation.7z`. Plaintext Gemini answers and validation diagnostics remain ephemeral and are not committed to the repository.
