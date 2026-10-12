#!/usr/bin/env python3
"""Partially completed not fully realized container image creation test under construction.

Create an isolated branch, acquire manifest inputs, build and verify the image.
The disposable test branch is left in place for inspection/cleanup.
"""
import json
import os
import subprocess
import tempfile
from pathlib import Path

from matching_branch_cleanup import delete_test_branch
from matching.build_context import prepare_manifest_context


def api(endpoint, method="GET", fields=()):
    command = ["gh", "api", "-X", method, endpoint]
    for name, value in fields:
        command.extend(["-f", f"{name}={value}"])
    result = subprocess.run(command, text=True, capture_output=True)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def require(endpoint, method="GET", fields=()):
    code, output, error = api(endpoint, method, fields)
    if code:
        raise RuntimeError(f"GitHub {method} {endpoint} failed: {error or output}")
    return json.loads(output) if output else {}


def prepare_test_environment(settings, repo):
    test = settings["test"]
    cleanup = delete_test_branch(test, repo)
    if cleanup["outcome"] not in ("DELETED", "NO_ACTION_REQUIRED"):
        raise RuntimeError(f"Cleanup failed: {cleanup}")
    branch = test["branch"]
    base = require(f"repos/{repo}/git/ref/heads/{test['base_branch']}")
    require(f"repos/{repo}/git/refs", "POST",
            (("ref", f"refs/heads/{branch}"), ("sha", base["object"]["sha"])))
    context = Path(tempfile.mkdtemp(prefix="matching-build-"))
    env = os.environ.copy()
    env["GIT_LFS_SKIP_SMUDGE"] = "1"
    env["GIT_LFS_SKIP_PUSH"] = "1"
    subprocess.run(["gh", "repo", "clone", repo, str(context), "--",
                    "--branch", branch, "--single-branch"], env=env, check=True)
    subprocess.run(["git", "-C", str(context), "mv", settings["build"]["primary_folder"],
                    test["primary_folder"]], env=env, check=True)
    subprocess.run(["git", "-C", str(context), "-c", "user.name=github-actions[bot]",
                    "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                    "commit", "-m", "Use matching_test as isolated build primary folder"], env=env, check=True)
    subprocess.run(["gh", "auth", "setup-git"], env=env, check=True)
    subprocess.run(["git", "-C", str(context), "push", "origin", "HEAD:" + branch], env=env, check=True)
    commit = subprocess.check_output(["git", "-C", str(context), "rev-parse", "HEAD"], text=True).strip()
    if require(f"repos/{repo}/git/ref/heads/{branch}")["object"]["sha"] != commit:
        raise RuntimeError("Test branch persistence differs from checkout")
    return {"checkout": str(context), "branch": branch, "primary_folder": test["primary_folder"],
            "commit": commit, "cleanup": cleanup}


def prepare_environment(settings, repo):
    if settings["mode"] == "test":
        return prepare_test_environment(settings, repo)
    return {"checkout": str(Path.cwd()), "primary_folder": settings["build"]["primary_folder"],
            "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()}


def create_container(prepared, image):
    """Build the image; verification is a separate operation."""
    subprocess.run([
        "docker", "build", "--file", prepared["dockerfile"],
        "--build-arg", "PYTHON_VERSION=" + prepared["python_version"],
        "--tag", image, prepared["build_context"],
    ], check=True)
    image_id = subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", image], text=True
    ).strip()
    return {"image": image, "image_id": image_id}


def verify_container(prepared, container):
    image_id = container["image_id"]
    verification = """
import json, sys
from pathlib import Path
import numpy, PIL, onnxruntime as ort
spec = json.loads(sys.argv[1])
actual = ".".join(map(str, sys.version_info[:3]))
if actual != spec["python_version"]:
    raise RuntimeError(f"Container interpreter {actual} differs from manifest")
models = []
for entry in spec["models"]:
    path = Path("/workspace") / entry["path"]
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    if not session.get_inputs() or not session.get_outputs():
        raise RuntimeError(f"Model lacks inputs/outputs: {path}")
    models.append({"path": entry["path"], "providers": session.get_providers()})
print(json.dumps({"python_version": actual, "packages": {
    "numpy": numpy.__version__, "Pillow": PIL.__version__,
    "onnxruntime": ort.__version__}, "models": models}))
"""
    result = subprocess.run([
        "docker", "run", "--rm", "--network", "none", "--entrypoint", "python",
        image_id, "-c", verification,
        json.dumps({"python_version": prepared["python_version"], "models": prepared["models"]}),
    ], check=True, capture_output=True, text=True)
    print(result.stdout, flush=True)
    if result.stderr:
        print(result.stderr, flush=True)
    return {**container, "verification": json.loads(result.stdout)}


def create_and_verify_container(prepared, image):
    return verify_container(prepared, create_container(prepared, image))


def run_pipeline(settings, repo):
    """The same acquisition, build, verification and reporting functions for both modes."""
    record = {"mode": settings["mode"], "outcome": "FAILED", "pending_stages":
              ["environment", "manifest_context", "image_build_and_verification"]}
    folder = settings["test"]["primary_folder"] if settings["mode"] == "test" else settings["build"]["primary_folder"]
    try:
        record["environment"] = prepare_environment(settings, repo)
        record["pending_stages"].remove("environment")
        record["manifest_context"] = prepare_manifest_context(
            record["environment"]["checkout"],
            str(Path(folder) / settings["build"]["manifest"]), primary_folder=folder)
        record["pending_stages"].remove("manifest_context")
        record["container"] = create_and_verify_container(record["manifest_context"], settings["build"]["image"])
        record["pending_stages"] = []
        record["outcome"] = "COMPLETE"
    except Exception as exc:
        record["error"] = str(exc)
        print(f"Controlled failure: {exc}", flush=True)
    report = Path(folder) / settings["build"]["report"]
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2), flush=True)
    return 0 if record["outcome"] == "COMPLETE" else 1


def run_mode(settings, repo):
    if settings.get("mode") not in ("test", "normal"):
        print("Invalid mode: allowed values are test and normal.", flush=True)
        print(json.dumps(settings, indent=2), flush=True)
        print("Example corrected configuration:", flush=True)
        print(json.dumps({**settings, "mode": "test"}, indent=2), flush=True)
        return 1
    return run_pipeline(settings, repo)


def main():
    settings = json.loads(Path("matching/operation_config.json").read_text())
    return run_mode(settings, os.environ["GITHUB_REPOSITORY"])


if __name__ == "__main__":
    raise SystemExit(main())
