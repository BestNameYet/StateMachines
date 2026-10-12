#!/usr/bin/env python3
"""Acquire and persist verified matching image build inputs.

Stage 1 only: downloads correct models and wheels into a durable filesystem
location. Docker build/push must run separately, after persistence is verified.
Requires Python 3.10, pip, and network access.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
MODELS = {
    "spatial_detector.onnx": {
        "url": "https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/master/models/onnx/version-RFB-320.onnx",
        "sha256": "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017",
        "size": 1270727,
    },
    "feature_encoder.onnx": {
        "url": "https://huggingface.co/onnx-community/arcface-onnx/resolve/main/arcface.onnx?download=true",
        "sha256": "ffe014a45c9488506719d37fd578ece6661bb385535b36e8039975fa5d4683db",
        "size": 136619444,
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_model(name: str, spec: dict, directory: Path) -> dict:
    destination = directory / name
    temporary = directory / (name + ".part")
    request = Request(spec["url"], headers={"User-Agent": "StateMachines-runtime-recovery/1.0"})
    try:
        with urlopen(request, timeout=120) as response, temporary.open("wb") as out:
            shutil.copyfileobj(response, out, length=1024 * 1024)
        actual_hash = sha256(temporary)
        actual_size = temporary.stat().st_size
        if actual_hash != spec["sha256"] or actual_size != spec["size"]:
            raise RuntimeError(
                f"Wrong model {name}: sha256={actual_hash}, bytes={actual_size}; "
                f"expected sha256={spec['sha256']}, bytes={spec['size']}"
            )
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {"filename": name, "sha256": spec["sha256"], "size_bytes": spec["size"], "source": spec["url"]}


def run(args: list[str]) -> None:
    subprocess.run(args, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, required=True,
                        help="Filesystem staging directory; must not exist")
    parser.add_argument("--persist-git-lfs", action="store_true",
                        help="Commit verified models and wheels to origin/main using original Git LFS procedure")
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 10):
        raise SystemExit("Acquisition requires Python 3.10 to download compatible wheels")

    destination = args.destination.resolve()
    if destination.exists():
        raise SystemExit(f"Destination already exists; refusing overwrite: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)

    # Stage on the SAME filesystem so final publication is an atomic rename.
    staging = Path(tempfile.mkdtemp(prefix=".matching-acquire-", dir=destination.parent))
    try:
        matching = staging / "matching"
        models = matching / "models"
        wheels = matching / "wheels"
        models.mkdir(parents=True)
        wheels.mkdir(parents=True)
        shutil.copy2(ROOT / "Dockerfile.runtime", matching / "Dockerfile.runtime")
        shutil.copy2(ROOT / "requirements.txt", matching / "requirements.txt")

        model_inventory = [download_model(name, spec, models) for name, spec in MODELS.items()]
        run([sys.executable, "-m", "pip", "download", "--only-binary=:all:",
             "--dest", str(wheels), "-r", str(matching / "requirements.txt")])
        wheel_files = sorted(wheels.glob("*.whl"))
        if not wheel_files:
            raise RuntimeError("pip returned no wheel files")
        wheel_inventory = [
            {"filename": file.name, "sha256": sha256(file), "size_bytes": file.stat().st_size}
            for file in wheel_files
        ]
        inventory = {
            "schema": 1,
            "models": model_inventory,
            "wheels": wheel_inventory,
            "dockerfile_sha256": sha256(matching / "Dockerfile.runtime"),
            "requirements_sha256": sha256(matching / "requirements.txt"),
        }
        (matching / "recovery-inventory.json").write_text(json.dumps(inventory, indent=2) + "\\n")
        for record in model_inventory:
            file = models / record["filename"]
            if sha256(file) != record["sha256"] or file.stat().st_size != record["size_bytes"]:
                raise RuntimeError(f"Model changed during acquisition: {file}")
        for record in wheel_inventory:
            file = wheels / record["filename"]
            if sha256(file) != record["sha256"] or file.stat().st_size != record["size_bytes"]:
                raise RuntimeError(f"Wheel changed during acquisition: {file}")
        staging.rename(destination)
        print(f"Acquired verified build inputs: {destination}", flush=True)
        if args.persist_git_lfs:
            persist_git_lfs(destination)
        print(json.dumps(inventory, indent=2))
    finally:
        if staging.exists():
            shutil.rmtree(staging)



def persist_git_lfs(destination: Path) -> None:
    """Use the original Actions persistence method: git lfs, git add, commit, push."""
    # Verify on-disk files before staging anything for Git.
    verify_persisted(destination)
    repo = ROOT.parent
    run(["git", "-C", str(repo), "lfs", "install", "--local"])
    # Explicitly track binary outputs as LFS objects, as in the original workflow.
    run(["git", "-C", str(repo), "lfs", "track", "matching/models/*.onnx"])
    run(["git", "-C", str(repo), "lfs", "track", "matching/wheels/*.whl"])
    source = destination / "matching"
    for subdir, pattern in (("models", "*.onnx"), ("wheels", "*.whl")):
        target = ROOT / subdir
        target.mkdir(parents=True, exist_ok=True)
        for file in (source / subdir).glob(pattern):
            shutil.copy2(file, target / file.name)
    shutil.copy2(source / "recovery-inventory.json", ROOT / "recovery-inventory.json")
    run(["git", "-C", str(repo), "add", "--",
         "matching/models", "matching/wheels",
         "matching/recovery-inventory.json", ".gitattributes"])
    # No unrelated changes are staged by this procedure.
    staged = subprocess.run(["git", "-C", str(repo), "diff", "--cached", "--quiet"],
                            check=False)
    if staged.returncode == 0:
        print("Verified LFS build inputs already committed; no push required")
        return
    if staged.returncode != 1:
        raise RuntimeError("Cannot inspect staged Git changes")
    run(["git", "-C", str(repo), "-c", "user.name=github-actions[bot]",
         "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
         "commit", "-m", "Persist verified matching models and wheels via Git LFS"])
    run(["git", "-C", str(repo), "push", "origin", "HEAD:main"])
    print("Persisted verified model and wheel files via Git LFS to origin/main")


def verify_persisted(destination: Path) -> None:
    """Reopen persisted files in a separate process to verify disk-backed inputs."""
    matching = destination / "matching"
    inventory = json.loads((matching / "recovery-inventory.json").read_text())
    for item in inventory["models"]:
        file = matching / "models" / item["filename"]
        if sha256(file) != item["sha256"] or file.stat().st_size != item["size_bytes"]:
            raise RuntimeError(f"Persisted model failed verification: {file}")
    for item in inventory["wheels"]:
        file = matching / "wheels" / item["filename"]
        if sha256(file) != item["sha256"] or file.stat().st_size != item["size_bytes"]:
            raise RuntimeError(f"Persisted wheel failed verification: {file}")
    for name, key in (("Dockerfile.runtime", "dockerfile_sha256"),
                      ("requirements.txt", "requirements_sha256")):
        if sha256(matching / name) != inventory[key]:
            raise RuntimeError(f"Persisted build file failed verification: {name}")
    print(f"Verified persisted files: {destination}")


def cli() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "--verify":
        verify_persisted(Path(sys.argv[2]).resolve())
    else:
        main()


if __name__ == "__main__":
    cli()
