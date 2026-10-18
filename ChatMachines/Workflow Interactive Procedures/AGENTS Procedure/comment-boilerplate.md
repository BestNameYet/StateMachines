# Comment boilerplate

### Communication instructions

Submit the current instruction's return as {$variableName}: JSON value. For multiple Gemini inputs, submit one JSON object with their names as keys. Normal steps with no captured return accept {}.

After GitHub confirms your submission, check for a newer request, procedure completion, or a validation error after 10 seconds, then 20 more seconds, then 30 more seconds (60 seconds total). Do not poll continuously.

If a newer request or completion appears, stop waiting for this request and follow that result. If a validation error appears, read it and the current instruction before correcting your return; do not blindly repeat a rejected return.

If no response appears after 60 seconds, resubmit the exact same return once to this issue to retrigger processing. Do not redo the substantive work or change the submitted values. The runner validates against stored expected inputs and skips publishing request numbers already recorded as rendered.

After that single resubmission, use the same 10, 20, and 30 second checks. If no response appears, stop and report the issue URL, submission comment IDs, and last observed request number as pending. Do not create another procedure run or keep retrying.

If submission or reading returns a rate-limit error, honor any Retry-After instruction and stop automatic retries for this turn. If submission success is uncertain, check once whether your comment exists before resubmitting.

Procedure submission, polling, and recovery calls are communication operations; exclude them from the task-execution tool-invocation report so that submitting the report does not require reporting itself.

## Navigation and worker operations

Only the repository owner (the owner login in `GITHUB_REPOSITORY`) may control the procedure through issue comments. Other users and bots are ignored, including file operations, worker commands, registration, navigation, and task returns that could trigger writes. Pending file operations are reauthorized against their original owner-authored comment before execution. This restriction applies to comment inputs; workflow-owned Gemini API operations retain their existing execution path.

Type `state` to view saved state, `back` to return to the current instruction, or `retry` to resume a failed generation. Navigation does not advance the procedure; current expected inputs can be submitted from either view.

Register with `register <nonce> <chatgpt|gemini>`. Choose a nonce once and retain it. Assignment returns use `{"nonce":"your-nonce","assignmentId":"assignment-id","values":{}}`, with the requested values inside `values`. Type `next <nonce>` only when that worker has no pending expected returns.

For workspace operations submit `{"nonce":"your-nonce","commands":[{"name":"view_inventory"}]}`. Available operations are `view_inventory`, `read_files`, `write_files`, `copy_files` (repository-root storage), and `set_standing_instructions`. Use the operation definitions supplied with the assignment/API message. The workflow performs these operations using its own access. Workers receive no GitHub credentials.

Gemini assignments echoed in comments are visibility copies. The workflow delivers their instructions through the API and validates their API returns; other workers must not submit those returns on their behalf. Task-specific standing instructions still accompany each broadcast.

Shared worker behavior and formatting examples are in [worker instructions](worker-instructions.md). Supervisor API meta-instructions are not broadcast in issue comments.


## File change interface

During an active procedure, route changes through JSON issue comments: `{"operation":"create","path":"src/example.js","value":"Complete contents"}`, `{"operation":"mutate","path":"src/example.js","value":"Complete replacement"}`, or `{"operation":"delete","path":"src/example.js"}`. Use paths relative to the configured workspace. Inspect the posted operation result; a successful submission alone does not establish a successful file change. These commands do not submit the instruction’s expected return.
