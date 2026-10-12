#!/usr/bin/env python3
"""Verify Git LFS persistence with two commits in an isolated test directory."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "matching/runtime_config.json").read_text())
assert CONFIG["mode"] == "test"
assert CONFIG["test"]["directory"] == "matching/persistence_test"
assert CONFIG["test"]["delete_after_verification"] is True
DIRECTORY = ROOT / "matching/persistence_test"

def run(*args, cwd=ROOT):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()

def commit(message):
    run("git", "add", "--", "matching/persistence_test")
    run("git", "-c", "user.name=github-actions[bot]",
        "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit", "-m", message)
    sha = run("git", "rev-parse", "HEAD")
    run("git", "push", "origin", "HEAD:main")
    assert run("git", "ls-remote", "origin", "refs/heads/main").split()[0] == sha
    return sha

def verify(sha, expected):
    with tempfile.TemporaryDirectory() as directory:
        header = run("git", "config", "--local", "--get",
                     "http.https://github.com/.extraheader")
        run("git", "-c", "http.https://github.com/.extraheader=" + header,
            "clone", "--quiet", "--no-checkout",
            "https://github.com/" + os.environ["GITHUB_REPOSITORY"] + ".git", directory)
        run("git", "config", "--local", "http.https://github.com/.extraheader", header,
            cwd=directory)
        run("git", "checkout", "--quiet", sha, cwd=directory)
        run("git", "lfs", "pull", "--include=matching/persistence_test/*", cwd=directory)
        candidate = Path(directory) / "matching/persistence_test/fixture.bin"
        if expected is None:
            assert not candidate.exists()
        else:
            assert candidate.exists() and hashlib.sha256(candidate.read_bytes()).hexdigest() == expected

def main():
    existing = DIRECTORY.exists()
    if existing and not (DIRECTORY / "fixture.bin").exists():
        raise RuntimeError("Unexpected pre-existing test directory")
    run("git", "lfs", "install", "--local")
    if not existing:
        DIRECTORY.mkdir()
        (DIRECTORY / ".gitattributes").write_text("*.bin filter=lfs diff=lfs merge=lfs -text\n")
        payload = b"StateMachines Git LFS persistence test fixture" * 30000
        (DIRECTORY / "fixture.bin").write_bytes(payload)
        saved = commit("test: persist isolated LFS fixture")
    else:
        saved = run("git", "rev-parse", "HEAD")
    digest = hashlib.sha256((DIRECTORY / "fixture.bin").read_bytes()).hexdigest()
    verify(saved, digest)
    (DIRECTORY / "fixture.bin").unlink()
    (DIRECTORY / ".gitattributes").unlink()
    DIRECTORY.rmdir()
    deleted = commit("test: delete isolated LFS fixture")
    verify(deleted, None)
    print(json.dumps({"result":"PASS","persist_commit":saved,"delete_commit":deleted}))

if __name__ == "__main__":
    main()
