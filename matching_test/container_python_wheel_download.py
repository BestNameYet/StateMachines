"""Resolve manifest wheel requirements for the manifest Python interpreter."""
import json
from pathlib import Path
import re
import subprocess
import sys


def python_version_from_manifest(manifest_path):
    version = json.loads(Path(manifest_path).read_text(encoding="utf-8"))["python_version"]
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Manifest python_version must be an exact X.Y.Z version")
    return version


def download_for_container(manifest_path, requirements, destination):
    version = python_version_from_manifest(manifest_path)
    actual = ".".join(map(str, sys.version_info[:3]))
    if actual != version:
        raise ValueError(f"Wheel acquisition requires manifest Python {version}; running {actual}")
    subprocess.run([
        sys.executable, "-m", "pip", "download", "--only-binary=:all:",
        "--python-version", version, "--dest", str(destination),
        "-r", str(requirements),
    ], check=True)
    return version
