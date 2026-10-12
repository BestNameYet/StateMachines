#!/usr/bin/env python3
"""Delete the disposable test branch, recording whether deletion was necessary."""
import json
import os
import subprocess
from pathlib import Path

def github_api(method, endpoint):
    result = subprocess.run(["gh", "api", "-X", method, endpoint], capture_output=True, text=True)
    return result.returncode, (result.stdout or "").strip(), (result.stderr or "").strip()

def delete_test_branch(config, repository, *, api=github_api, log=print):
    branch = config["branch"]
    if branch != "matching_test":
        raise ValueError("Only the disposable matching_test branch may be deleted")
    endpoint = f"repos/{repository}/git/ref/heads/{branch}"
    record = {"branch": branch, "initial_exists": None, "attempts": [], "final_exists": None, "outcome": None}

    def exists():
        code, stdout, stderr = api("GET", endpoint)
        if code == 0:
            return True
        detail = f"{stdout}\n{stderr}".lower()
        if "404" in detail or "not found" in detail:
            return False
        raise RuntimeError(f"Branch lookup failed: {stderr or stdout}")

    try:
        record["initial_exists"] = exists()
        log(f"Branch exists: {'YES' if record['initial_exists'] else 'NO'}")
        if not record["initial_exists"]:
            record.update(final_exists=False, outcome="NO_ACTION_REQUIRED")
            log("Branch already absent; nothing was deleted.")
            return record
        for number in (1, 2):
            code, stdout, stderr = api("DELETE", f"repos/{repository}/git/refs/heads/{branch}")
            record["attempts"].append({"number": number, "success": code == 0, "message": stderr or stdout})
            log(f"Deletion attempt {number}: {stderr or stdout or ('accepted' if code == 0 else 'failed')}")
            record["final_exists"] = exists()
            if not record["final_exists"]:
                record["outcome"] = "DELETED"
                log("Branch verified absent after deletion.")
                return record
        record["outcome"] = "FAILED"
        log("Branch remains after two deletion attempts.")
    except Exception as exc:
        record.update(outcome="FAILED", error=str(exc))
        log(f"Controlled failure: {exc}")
    return record

def main():
    settings = json.loads(Path("matching/operation_config.json").read_text())
    record = delete_test_branch(settings["cleanup"], os.environ["GITHUB_REPOSITORY"])
    print(json.dumps(record, indent=2))
    return 1 if record["outcome"] == "FAILED" else 0

if __name__ == "__main__":
    raise SystemExit(main())
