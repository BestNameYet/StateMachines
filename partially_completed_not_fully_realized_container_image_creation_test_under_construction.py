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


def prepare_build_environment(test_config, repo):
    """Check out the isolated test branch into a dedicated local Docker build context."""
    branch = test_config["branch"]
    runner_temp = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir()))
    runner_temp.mkdir(parents=True, exist_ok=True)
    context = Path(tempfile.mkdtemp(prefix="matching-image-build-", dir=runner_temp))
    env = os.environ.copy()
    env["GIT_LFS_SKIP_SMUDGE"] = "1"
    try:
        subprocess.run(
            ["gh", "repo", "clone", repo, str(context), "--",
             "--branch", branch, "--single-branch"],
            env=env, check=True, capture_output=True, text=True,
        )
        checked_out_branch = subprocess.run(
            ["git", "-C", str(context), "branch", "--show-current"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        if checked_out_branch != branch:
            raise RuntimeError(f"Expected {branch}, checked out {checked_out_branch}")
        expected = context / test_config["location"] / ".gitkeep"
        if not expected.is_file():
            raise RuntimeError(f"Test workspace marker missing: {expected}")
        if not (context / "matching" / "Dockerfile.runtime").is_file():
            raise RuntimeError("Test branch lacks matching/Dockerfile.runtime")
        commit = subprocess.run(
            ["git", "-C", str(context), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        return {"build_context": str(context), "branch": branch, "commit": commit}
    except Exception:
        import shutil
        shutil.rmtree(context, ignore_errors=True)
        raise


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


def partially_completed_not_fully_realized_container_image_creation_test_under_construction(test_config, repo):
    """Create and verify the image using the configured isolated branch."""
    branch = test_config["branch"]
    location = test_config["location"]
    base_branch = test_config.get("base_branch", "main")
    for value in (branch, location, base_branch):
        if not isinstance(value, str) or not value or value.startswith("/") or ".." in value.split("/"):
            raise ValueError("Invalid test branch or location")
    directory_marker = f"{location.rstrip('/')}/.gitkeep"
    record = {"branch": branch, "workspace": directory_marker,
              "initial_exists": None, "created": False, "verified": False,
              "outcome": "FAILED",
              "test_complete": False,
              "pending_stages": ["manifest_context_preparation", "container_image_creation", "container_image_verification"]}
    try:
        cleanup_result = delete_test_branch(test_config, repo)
        record["cleanup"] = cleanup_result
        record["initial_exists"] = cleanup_result["initial_exists"]
        if cleanup_result["outcome"] not in ("DELETED", "NO_ACTION_REQUIRED"):
            raise RuntimeError(f"Cleanup failed: {cleanup_result}")

        base = require(f"repos/{repo}/git/ref/heads/{base_branch}")
        sha = base["object"]["sha"]
        require(f"repos/{repo}/git/refs", "POST",
                (("ref", f"refs/heads/{branch}"), ("sha", sha)))
        record["created"] = True
        print(f"Created branch {branch} from {base_branch} at {sha}", flush=True)

        require(f"repos/{repo}/contents/{directory_marker}", "PUT",
                (("message", "Initialize isolated matching test workspace"),
                 ("content", ""), ("branch", branch)))

        file = require(f"repos/{repo}/contents/{directory_marker}?ref={branch}")
        if file.get("type") != "file":
            raise RuntimeError("Created test workspace failed verification")

        record["build_environment"] = prepare_build_environment(test_config, repo)
        record["verified"] = True
        record["manifest_context"] = prepare_manifest_context(
            record["build_environment"]["build_context"], test_config["manifest"]
        )
        record["pending_stages"].remove("manifest_context_preparation")
        record["container"] = create_and_verify_container(record["manifest_context"], test_config["image"])
        record["pending_stages"] = []
        record["test_complete"] = True
        record["outcome"] = "COMPLETE"
        print("Container image built and verified", flush=True)
    except Exception as exc:
        record["error"] = str(exc)
        print(f"Controlled failure: {exc}", flush=True)
    report = Path(test_config["report"])
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2), flush=True)
    return 0 if record["test_complete"] else 1


def normal(operation_config, repo):
    """Build from the current checkout without disposable-branch or runtime tests."""
    record = {"mode": "normal", "outcome": "FAILED", "verification_executed": False}
    try:
        record["source_commit"] = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip()
        record["manifest_context"] = prepare_manifest_context(Path.cwd(), operation_config["manifest"])
        record["container"] = create_container(record["manifest_context"], operation_config["image"])
        record["outcome"] = "COMPLETE"
    except Exception as exc:
        record["error"] = str(exc)
        print(f"Controlled failure: {exc}", flush=True)
    report = Path(operation_config["report"])
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2), flush=True)
    return 0 if record["outcome"] == "COMPLETE" else 1


def run_mode(settings, repo):
    mode = settings.get("mode")
    if mode not in ("test", "normal"):
        print("Invalid mode: allowed values are test and normal.", flush=True)
        print(json.dumps(settings, indent=2), flush=True)
        print("Example corrected configuration:", flush=True)
        print(json.dumps({**settings, "mode": "test"}, indent=2), flush=True)
        return 1
    if mode == "normal":
        return normal(settings["normal"], repo)
    return partially_completed_not_fully_realized_container_image_creation_test_under_construction(
        settings["partially completed not fully realized container image creation test under construction"], repo
    )


def main():
    settings = json.loads(Path("matching/operation_config.json").read_text())
    return run_mode(settings, os.environ["GITHUB_REPOSITORY"])


if __name__ == "__main__":
    raise SystemExit(main())
