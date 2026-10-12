#!/usr/bin/env python3
"""Retrieve manifest models from their recorded publisher, never Git LFS."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def retrieve_published_artifact(filename, manifest_path, build_context):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    entries = [entry for entry in manifest["models"]
               if Path(entry["path"]).name == filename]
    if len(entries) != 1:
        raise ValueError(f"Expected one manifest model named {filename!r}; found {len(entries)}")
    entry = entries[0]
    relative = Path(entry["path"])
    root = Path(build_context).resolve()
    target = (root / relative).resolve()
    if relative.is_absolute() or ".." in relative.parts or not target.is_relative_to(root):
        raise ValueError("Artifact target escapes build context")
    url = entry["published_source_url"]
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.username or parsed.password:
        raise ValueError("Publisher URL must use HTTPS without credentials")
    if parsed.hostname in ("github.com", "api.github.com"):
        raise ValueError("Repository and Git LFS sources are not publisher downloads")
    expected_size = entry["size_bytes"]
    expected_hash = entry["sha256"].lower()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as stream:
            temporary = stream.name
            digest = hashlib.sha256()
            count = 0
            with urlopen(Request(url, headers={"User-Agent": "StateMachines-build-test/1.0"}), timeout=120) as response:
                if urlparse(response.geturl()).scheme != "https":
                    raise ValueError("Publisher redirected outside HTTPS")
                while chunk := response.read(1024 * 1024):
                    count += len(chunk)
                    if count > expected_size:
                        raise ValueError("Model download exceeds manifest size")
                    stream.write(chunk)
                    digest.update(chunk)
        if count != expected_size or digest.hexdigest() != expected_hash:
            raise ValueError(f"Publisher bytes do not match manifest: {filename}")
        os.replace(temporary, target)
        temporary = None
    finally:
        if temporary is not None:
            os.unlink(temporary)
    return {"path": str(relative), "source": url, "sha256": expected_hash, "size_bytes": count}
