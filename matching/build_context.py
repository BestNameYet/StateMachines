"""Prepare and verify the Docker context described by the build manifest."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

from matching.container_python_wheel_download import download_for_container
from matching.published_artifact_retrieval import retrieve_published_artifact


def safe_path(root, relative):
    path = Path(relative)
    target = (root / path).resolve()
    if path.is_absolute() or ".." in path.parts or not target.is_relative_to(root):
        raise ValueError(f"Unsafe manifest path: {relative}")
    return target


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_manifest_context(checkout, manifest_relative="matching/build_context_manifest.json"):
    checkout = Path(checkout).resolve()
    manifest_path = safe_path(checkout, manifest_relative)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = Path(tempfile.mkdtemp(prefix="matching-manifest-context-"))
    try:
        for directory in manifest["directories"]:
            safe_path(root, directory).mkdir(parents=True, exist_ok=True)

        def copy(entry):
            source = safe_path(checkout, entry["path"])
            if not source.is_file():
                if entry.get("required"):
                    raise ValueError(f"Missing required repository input: {entry['path']}")
                return
            target = safe_path(root, entry["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            if target.stat().st_size < entry.get("minimum_bytes", 0):
                raise ValueError(f"Repository input is too small: {entry['path']}")

        for entry in manifest["files"]:
            if entry["retrieval"] != "repository":
                raise ValueError(f"Unsupported file retrieval: {entry['retrieval']}")
            copy(entry)
        for template in manifest.get("directory_file_templates", []):
            if template["matching"] != "existing_files_only" or template["retrieval"] != "repository":
                raise ValueError("Unsupported directory template")
            for directory in manifest[template["directories_ref"]]:
                for name in template["filenames"]:
                    copy({"path": str(Path(directory) / name), "required": False})

        requirements = [entry["requirement"] for entry in manifest["wheels"]]
        if not requirements or any(not isinstance(item, str) or "\n" in item for item in requirements):
            raise ValueError("Invalid manifest wheel requirements")
        generated = safe_path(root, manifest["generated_requirements"])
        generated.parent.mkdir(parents=True, exist_ok=True)
        generated.write_text("\n".join(requirements) + "\n", encoding="utf-8")
        wheels = safe_path(root, manifest["wheel_directory"])
        wheels.mkdir(parents=True, exist_ok=True)
        version = download_for_container(manifest_path, generated, wheels)
        if not list(wheels.glob("*.whl")):
            raise ValueError("Wheel resolver produced no wheels")
        models = [retrieve_published_artifact(Path(entry["path"]).name, manifest_path, root)
                  for entry in manifest["models"]]
        context = safe_path(root, manifest["build_context_root"])
        dockerfile = safe_path(root, manifest["dockerfile"])
        if not context.is_dir() or not dockerfile.is_file():
            raise ValueError("Build context or Dockerfile missing")
        inventory = [
            {"path": str(path.relative_to(root)), "size_bytes": path.stat().st_size,
             "sha256": sha256(path)}
            for path in sorted(root.rglob("*")) if path.is_file()
        ]
        for entry in manifest["models"]:
            path = safe_path(root, entry["path"])
            if path.stat().st_size != entry["size_bytes"] or sha256(path) != entry["sha256"]:
                raise ValueError(f"Model failed readback verification: {entry['path']}")
        return {"build_context": str(context), "context_root": str(root),
                "dockerfile": str(dockerfile), "python_version": version,
                "manifest_sha256": sha256(manifest_path), "models": models,
                "inventory": inventory}
    except Exception:
        shutil.rmtree(root, ignore_errors=True)
        raise
