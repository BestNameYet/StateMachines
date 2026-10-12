#!/usr/bin/env python3
"""Isolated dependency archive and container verification."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parent
TEST = ROOT / "matching_test"
SOURCE = ROOT / "matching"

def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)

def sha(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for block in iter(lambda: f.read(1048576), b""):
            h.update(block)
    return h.hexdigest()

def main():
    assert not TEST.exists(), "Test directory already exists"
    TEST.mkdir()
    checks = []
    report = ROOT / "matching-test-checklist.json"
    try:
        acquired = TEST / "acquired"
        run(sys.executable, "matching/recover_runtime.py", "--destination", str(acquired), "--no-git-persist")
        src = acquired / "matching"
        inventory = json.loads((src / "recovery-inventory.json").read_text())
        for kind in ("models", "wheels"):
            assert inventory[kind], "No " + kind
            for item in inventory[kind]:
                p = src / kind / item["filename"]
                assert p.is_file() and sha(p) == item["sha256"]
                checks.append({"name": kind + "/" + item["filename"], "location": str(p), "sha256": sha(p), "pass": True})
        archive = TEST / "runtime-build-inputs.tar.gz"
        with tarfile.open(archive, "w:gz") as t:
            t.add(src, arcname="matching")
        checks.append({"name": "archive", "location": str(archive), "sha256": sha(archive), "pass": True})
        restored = TEST / "restored"
        restored.mkdir()
        with tarfile.open(archive, "r:gz") as t:
            t.extractall(restored, filter="data")
        for kind in ("models", "wheels"):
            for item in inventory[kind]:
                p = restored / "matching" / kind / item["filename"]
                assert sha(p) == item["sha256"]
                checks.append({"name": "restored " + kind + "/" + item["filename"], "location": str(p), "pass": True})
        run("docker", "build", "-f", "matching/Dockerfile.runtime", "-t", "matching-test-runtime", ".", cwd=restored)
        run("docker", "run", "--rm", "--entrypoint", "python", "matching-test-runtime",
            "-c", "import onnxruntime,numpy,PIL")
        checks.append({"name": "container build and imports", "pass": True})
        report.write_text(json.dumps({"result": "PASS", "commit": os.getenv("GITHUB_SHA"), "checks": checks}, indent=2))
    finally:
        shutil.rmtree(TEST)
        data = json.loads(report.read_text()) if report.exists() else {"result": "FAIL", "checks": checks}
        data["test_directory_removed"] = not TEST.exists()
        report.write_text(json.dumps(data, indent=2) + "\n")

if __name__ == "__main__":
    main()
