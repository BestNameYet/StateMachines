"""Select pip's wheel compatibility target from the runtime Dockerfile."""
from pathlib import Path
import re
import subprocess


def python_version_from_dockerfile(dockerfile):
    lines = Path(dockerfile).read_text(encoding="utf-8").splitlines()
    bases = [line.strip() for line in lines if re.match(r"^FROM\s+", line, re.I)]
    if len(bases) != 1:
        raise ValueError("Expected exactly one Dockerfile FROM line")
    match = re.fullmatch(r"FROM\s+python:(\d+\.\d+\.\d+)(?:-[\w.-]+)?", bases[0], re.I)
    if not match:
        raise ValueError("Expected an exact python:X.Y.Z Docker base image")
    return match.group(1)


def download_for_container(dockerfile, requirements, destination):
    version = python_version_from_dockerfile(dockerfile)
    command = [
        "python", "-m", "pip", "download", "--only-binary=:all:",
        "--python-version", version,
        "--dest", str(destination), "-r", str(requirements),
    ]
    subprocess.run(command, check=True)
    return version
