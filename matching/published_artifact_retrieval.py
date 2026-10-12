#!/usr/bin/env python3
"""Retrieve exact manifest-listed wheel artifacts from their publisher, not GitHub/LFS."""

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class PublishedSourceUnavailable(RuntimeError):
    """No independently identified publisher is available for this artifact."""


def retrieve_published_artifact(filename, manifest_path, build_context):
    """Download an exact manifest-listed wheel from PyPI into the build context.

    The supplied filename must match exactly one Git-LFS-managed manifest entry.
    GitHub and Git LFS are never used as download sources. ONNX models fail closed
    until their independent published distribution and checksum are established.
    """
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    entries = [
        entry for entry in manifest["files"]
        if Path(entry["path"]).name == filename and entry.get("retrieval") == "git_lfs"
    ]
    if len(entries) != 1:
        raise ValueError(f"Expected exactly one LFS manifest entry named {filename!r}; found {len(entries)}")
    entry = entries[0]
    expected_hash = entry["sha256"].lower()
    expected_size = entry["size_bytes"]
    relative = Path(entry["path"])
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("Unsafe manifest file path")

    if not filename.endswith(".whl"):
        raise PublishedSourceUnavailable(
            f"No independent publisher is recorded for {filename!r}; "
            "GitHub and Git LFS retrieval are disabled"
        )

    # Distribution name is the first field in the PEP 427 wheel filename.
    parts = filename.split("-")
    if len(parts) < 5 or not re.fullmatch(r"[A-Za-z0-9_.]+", parts[0]):
        raise ValueError(f"Invalid wheel filename: {filename!r}")
    project = re.sub(r"[-_.]+", "-", parts[0]).lower()
    index_url = f"https://pypi.org/simple/{project}/"
    req = Request(index_url, headers={
        "Accept": "application/vnd.pypi.simple.v1+json",
        "User-Agent": "StateMachines-published-artifact-retrieval/1.0",
    })
    with urlopen(req, timeout=30) as response:
        index = json.load(response)

    candidates = [file for file in index.get("files", []) if file.get("filename") == filename]
    if len(candidates) != 1:
        raise PublishedSourceUnavailable(f"Exact wheel {filename!r} not found in PyPI project {project!r}")
    published = candidates[0]
    if published.get("hashes", {}).get("sha256", "").lower() != expected_hash:
        raise ValueError(f"PyPI hash differs from manifest for {filename}")
    if published.get("size") != expected_size:
        raise ValueError(f"PyPI file size differs from manifest for {filename}")
    url = published["url"]
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "files.pythonhosted.org" or parsed.username or parsed.password:
        raise ValueError("PyPI provided a download URL outside files.pythonhosted.org")

    root = Path(build_context).resolve()
    target = (root / relative).resolve()
    if not target.is_relative_to(root) or target.name != filename:
        raise ValueError("Artifact target escapes build context")
    target.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temp:
            temp_name = temp.name
            digest = hashlib.sha256()
            count = 0
            with urlopen(Request(url, headers={
                "User-Agent": "StateMachines-published-artifact-retrieval/1.0"
            }), timeout=90) as response:
                if urlparse(response.geturl()).hostname != "files.pythonhosted.org":
                    raise ValueError("Unexpected download redirect host")
                while chunk := response.read(1024 * 1024):
                    temp.write(chunk)
                    digest.update(chunk)
                    count += len(chunk)
                    if count > expected_size:
                        raise ValueError("Downloaded artifact exceeds expected size")
        if count != expected_size or digest.hexdigest() != expected_hash:
            raise ValueError(f"Downloaded file did not match manifest: {filename}")
        os.replace(temp_name, target)
        temp_name = None
    finally:
        if temp_name is not None:
            os.unlink(temp_name)

    return {"path": str(target), "source": "pypi", "sha256": expected_hash, "size_bytes": expected_size}
