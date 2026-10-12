#!/usr/bin/env python3
"""PR-triggered branch cleanup helper. Requires GH_TOKEN and verified PR context."""
import json
import os
import subprocess
import sys

def main():
    event = json.load(open(os.environ["GITHUB_EVENT_PATH"]))
    pr = event["pull_request"]
    branch = pr["head"]["ref"]
    if branch != "test/matching-runtime-archive":
        raise SystemExit("Refusing unexpected branch: " + branch)
    if pr["head"]["repo"]["full_name"] != os.environ["GITHUB_REPOSITORY"]:
        raise SystemExit("Refusing fork branch")
    if os.environ.get("GITHUB_EVENT_NAME") != "pull_request" or event.get("action") != "closed":
        raise SystemExit("Cleanup requires a closed pull request")
    if not pr["merged"]:
        raise SystemExit("Cleanup requires merged pull request")
    subprocess.run(["gh", "api", "-X", "DELETE", "repos/" + os.environ["GITHUB_REPOSITORY"]
                    + "/git/refs/heads/" + branch], check=True)

if __name__ == "__main__":
    main()
