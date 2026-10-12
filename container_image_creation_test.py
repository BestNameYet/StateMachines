#!/usr/bin/env python3
"""Container image creation test — UNDER CONSTRUCTION.

Implemented: clean and prepare an isolated test branch and workspace.
Not implemented: create a container image or verify the resulting image.
The disposable test branch is left in place for inspection/cleanup.
"""
import json
import os
import subprocess

from matching_branch_cleanup import delete_test_branch


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


def run_container_image_creation_test(test_config, repo):
    """Run the implemented preparation stage; image creation remains unimplemented."""
    branch = test_config["branch"]
    location = test_config["location"]
    base_branch = test_config.get("base_branch", "main")
    for value in (branch, location, base_branch):
        if not isinstance(value, str) or not value or value.startswith("/") or ".." in value.split("/"):
            raise ValueError("Invalid test branch or location")
    directory_marker = f"{location.rstrip('/')}/.gitkeep"
    record = {"branch": branch, "workspace": directory_marker,
              "initial_exists": None, "created": False, "verified": False,
              "outcome": "FAILED",
              "test_complete": False,
              "pending_stages": ["container_image_creation", "container_image_verification"]}
    try:
        cleanup_result = delete_test_branch(test_config, repo)
        record["cleanup"] = cleanup_result
        record["initial_exists"] = cleanup_result["initial_exists"]
        if cleanup_result["outcome"] not in ("DELETED", "NO_ACTION_REQUIRED"):
            raise RuntimeError(f"Cleanup failed: {cleanup_result}")

        base = require(f"repos/{repo}/git/ref/heads/{base_branch}")
        sha = base["object"]["sha"]
        require(f"repos/{repo}/git/refs", "POST",
                (("ref", f"refs/heads/{branch}"), ("sha", sha)))
        record["created"] = True
        print(f"Created branch {branch} from {base_branch} at {sha}", flush=True)

        require(f"repos/{repo}/contents/{directory_marker}", "PUT",
                (("message", "Initialize isolated matching test workspace"),
                 ("content", ""), ("branch", branch)))

        file = require(f"repos/{repo}/contents/{directory_marker}?ref={branch}")
        if file.get("type") != "file":
            raise RuntimeError("Created test workspace failed verification")

        record["verified"] = True
        record["outcome"] = "PARTIALLY_IMPLEMENTED"
        print("Workspace preparation verified; container image creation test remains UNDER CONSTRUCTION", flush=True)
    except Exception as exc:
        record["error"] = str(exc)
        print(f"Controlled failure: {exc}", flush=True)
    print(json.dumps(record, indent=2), flush=True)
    return 0 if record["outcome"] == "PARTIALLY_IMPLEMENTED" else 1


def main():
    from pathlib import Path
    settings = json.loads(Path("matching/operation_config.json").read_text())
    return run_container_image_creation_test(settings["container_image_creation_test"], os.environ["GITHUB_REPOSITORY"])


if __name__ == "__main__":
    raise SystemExit(main())
