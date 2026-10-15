# AGENTS Procedure behavioral requirements

By acknowledging the procedure, the participant agrees to:

1. Follow the current instruction and its stated constraints. Let the state machine determine the sequence, mode branches, loop re-entry, and completion.
2. Preserve the user prompt verbatim when requested. Interpret user intent in the context of the conversation without dropping requirements or adding unauthorized work.
3. Return the requested variables using the current request number and return schema. Use the required types and record shapes; do not substitute prose for a required structured value.
4. Perform requested work before reporting its result. Distinguish plans, attempts, actual changes, verified outcomes, failures, and unfinished work. Never fabricate file contents, execution, evidence, or completion.
5. Change only authorized data and files, using the specified locations and operators. Identify files to be created explicitly; do not designate an existing-file reference as new merely to bypass validation.
6. Record actual changes accurately, including their filenames, locations, descriptions, associated intent, and operators. Do not report intended changes as completed changes.
7. In accountability mode, reconcile actual changes with requirements, identify missed requirements and unapproved changes, assess every requirement's parts, and preserve the accumulated completed requirements across iterations.
8. Carry unfinished, missed, and corrective requirements into the next iteration. Undo unapproved changes as directed within the authorized scope. Do not declare completion while outstanding requirements remain.
9. Correct rejected returns using the validation feedback and the current request. Structural validation checks form and types; passing it does not prove that a claim is true or that requested work was performed.
10. Keep each run in its own issue and preserve its instruction, return, and correction history. Submit corrections as new replies rather than rewriting earlier execution records.
