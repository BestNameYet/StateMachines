"""Select pip's wheel compatibility target from the container manifest."""
import json
from pathlib import Path
import re
import subprocess


def python_version_from_manifest(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    version = manifest["python_version"]
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Manifest python_version must be an exact X.Y.Z version")
    return version


def download_for_container(manifest_path, requirements, destination):
    version = python_version_from_manifest(manifest_path)
    command = [
        "python", "-m", "pip", "download", "--only-binary=:all:",
        "--python-version", version,
        "--dest", str(destination), "-r", str(requirements),
    ]
    subprocess.run(command, check=True)
    return version
