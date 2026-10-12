#!/usr/bin/env python3
"""Set up the isolated matching test branch and verify its root workspace.

This component prepares a test branch; it does not run production persistence.
The matching_test branch is deliberately left in place for inspection/cleanup.
"""
import json
import os
import subprocess

BRANCH = "matching_test"
DIRECTORY_MARKER = "matching_test/.gitkeep"


def api(endpoint, method="GET", fields=()):
    command = ["gh", "api", "-X", method, endpoint]
    for name, value in fields:
        command.extend(["-f", f"{name}={value}"])
    result = subprocess.run(command, text=True, capture_output=True)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def require(endpoint, method="GET", fields=()):
    code, output, error = api(endpoint, method, fields)
    if code:
        raise RuntimeError(f"GitHub {method} {endpoint} failed: {error or output}")
    return json.loads(output) if output else {}


def branch_exists(repo, branch):
    code, output, error = api(f"repos/{repo}/git/ref/heads/{branch}")
    if code == 0:
        return True
    if "404" in error or "Not Found" in error or "not found" in error.lower():
        return False
    raise RuntimeError(f"Cannot check branch {branch}: {error or output}")


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    record = {"branch": BRANCH, "workspace": DIRECTORY_MARKER,
              "initial_exists": None, "created": False, "verified": False,
              "outcome": "FAILED"}
    try:
        record["initial_exists"] = branch_exists(repo, BRANCH)
        print(f"Branch exists: {'YES' if record['initial_exists'] else 'NO'}", flush=True)
        if record["initial_exists"]:
            raise RuntimeError(
                f"Branch {BRANCH} already exists. Run the separate cleanup component first."
            )

        base = require(f"repos/{repo}/git/ref/heads/main")
        sha = base["object"]["sha"]
        require(f"repos/{repo}/git/refs", "POST",
                (("ref", f"refs/heads/{BRANCH}"), ("sha", sha)))
        record["created"] = True
        print(f"Created branch {BRANCH} from main at {sha}", flush=True)

        require(f"repos/{repo}/contents/{DIRECTORY_MARKER}", "PUT",
                (("message", "Initialize isolated matching test workspace"),
                 ("content", ""), ("branch", BRANCH)))

        file = require(f"repos/{repo}/contents/{DIRECTORY_MARKER}?ref={BRANCH}")
        if file.get("type") != "file" or not branch_exists(repo, BRANCH):
            raise RuntimeError("Created test branch or workspace failed verification")

        record["verified"] = True
        record["outcome"] = "READY"
        print("Verified matching_test branch and root-level workspace", flush=True)
    except Exception as exc:
        record["error"] = str(exc)
        print(f"Controlled failure: {exc}", flush=True)
    print(json.dumps(record, indent=2), flush=True)
    return 0 if record["outcome"] == "READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
