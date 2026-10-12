#!/usr/bin/env python3
"""Test actual matching build inputs: disk -> durable LFS archive -> extraction -> Docker."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
MATCHING = ROOT / "matching"
CONFIG = json.loads((MATCHING / "runtime_config.json").read_text())
ARCHIVE = MATCHING / "runtime-build-inputs.tar.gz"
REQUIRED = ["Dockerfile.runtime", "requirements.txt",
            "models/spatial_detector.onnx", "models/feature_encoder.onnx"]
IMAGE = "statemachines-matching-archive-test:py310"

def run(*args, cwd=ROOT):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()

def inputs():
    wheels = sorted((MATCHING / "wheels").glob("*.whl"))
    if not wheels:
        raise RuntimeError("No persisted dependency wheels")
    paths = [MATCHING / name for name in REQUIRED] + wheels
    for path in paths:
        if not path.is_file() or path.stat().st_size < 10000:
            raise RuntimeError("Missing, empty or unresolved LFS build input: " + str(path))
    return paths

def main():
    if CONFIG["mode"] != "test":
        raise RuntimeError("Test mode not enabled")
    run("git", "lfs", "install", "--local")
    # Original persistence source: real models and wheels committed to Git LFS.
    run("git", "lfs", "pull", "--include=matching/models/*,matching/wheels/*")
    paths = inputs()
    manifest = {str(p.relative_to(MATCHING)): {"sha256": digest(p),
                "size_bytes": p.stat().st_size} for p in paths}
    with tempfile.TemporaryDirectory() as tmp:
        manifest_path = Path(tmp) / "archive-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        with tarfile.open(ARCHIVE, "w:gz") as tar:
            for path in paths:
                tar.add(path, arcname="matching/" + str(path.relative_to(MATCHING)))
            tar.add(manifest_path, arcname="matching/archive-manifest.json")
    # Persist archive using the same Git LFS commit-and-push method.
    attrs = MATCHING / ".gitattributes"
    rule = "runtime-build-inputs.tar.gz filter=lfs diff=lfs merge=lfs -text"
    lines = attrs.read_text().splitlines() if attrs.exists() else []
    if rule not in lines:
        attrs.write_text("\n".join(lines + [rule]) + "\n")
    run("git", "add", "--", "matching/.gitattributes", "matching/runtime-build-inputs.tar.gz")
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 1:
        run("git", "-c", "user.name=github-actions[bot]",
            "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit", "-m", "Persist matching runtime build-input archive via Git LFS")
    sha = run("git", "rev-parse", "HEAD")
    run("git", "push", "origin", "HEAD:main")
    assert run("git", "ls-remote", "origin", "refs/heads/main").split()[0] == sha
    pointer = run("git", "show", "HEAD:matching/runtime-build-inputs.tar.gz")
    assert "version https://git-lfs.github.com/spec/v1" in pointer
    assert "oid sha256:" + digest(ARCHIVE) in pointer
    # Extract persisted archive, not original directories, to supply Docker context.
    with tempfile.TemporaryDirectory() as tmp:
        destination = Path(tmp)
        with tarfile.open(ARCHIVE, "r:gz") as tar:
            tar.extractall(destination, filter="data")
        restored = destination / "matching"
        saved = json.loads((restored / "archive-manifest.json").read_text())
        assert saved == manifest
        for name, spec in saved.items():
            file = restored / name
            assert file.is_file() and digest(file) == spec["sha256"]
            assert file.stat().st_size == spec["size_bytes"]
        run("docker", "build", "--file", "matching/Dockerfile.runtime",
            "--tag", IMAGE, ".", cwd=destination)
    print(json.dumps({"result": "PASS", "commit": sha,
                      "archive": str(ARCHIVE.relative_to(ROOT)),
                      "files_verified": len(manifest), "image": IMAGE}))

if __name__ == "__main__":
    main()
