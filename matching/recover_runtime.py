#!/usr/bin/env python3
"""Reconstruct the current matching runtime from upstream sources.

Recovery-only entry point. Requires Python 3.10, pip, Docker, and network access.
Does not change the active workflow, repository models, or repository wheels.
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
    parser.add_argument("--image", default="ghcr.io/bestnameyet/statemachines-matching-runtime:py310")
    parser.add_argument("--output-archive", type=Path, help="Optional tar.gz of verified build inputs")
    parser.add_argument("--no-build", action="store_true", help="Download and verify only")
    args = parser.parse_args()

    if sys.version_info[:2] != (3, 10):
        raise SystemExit("Recovery requires Python 3.10 to download compatible wheels")

    with tempfile.TemporaryDirectory(prefix="matching-recovery-") as tmp:
        context = Path(tmp)
        matching = context / "matching"
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
        (matching / "recovery-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")

        if args.output_archive:
            import tarfile
            archive = args.output_archive.resolve()
            archive.parent.mkdir(parents=True, exist_ok=True)
            with tarfile.open(archive, "w:gz") as tar:
                tar.add(matching, arcname="matching")
            print(f"Created recovery archive: {archive}", flush=True)

        if not args.no_build:
            # The current Dockerfile performs offline installation and ONNX session validation.
            run(["docker", "build", "--file", str(matching / "Dockerfile.runtime"),
                 "--tag", args.image, str(context)])
            print(f"Built verified runtime: {args.image}", flush=True)
        print(json.dumps(inventory, indent=2))


if __name__ == "__main__":
    main()
