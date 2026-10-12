# Matching runtime build bootstrap

This package contains the source and configuration needed to acquire the build
inputs, build a Docker runtime image, and verify that image. It does not run image
comparison. The comparison program has its own entry point and workflow.

Source snapshot: `BestNameYet/StateMachines`, commit
`8cc54b8fe6587c881a46bc394b0d8f26099dd52d`, captured October 12, 2026.

## Start here

1. Extract the package into a Git repository, preserving the relative paths.
2. Set `mode` in `matching/operation_config.json` to `normal` or `test`.
3. Run the entry script from the repository root, or use the included GitHub
   Actions workflow after committing the bootstrap files to the repository.

The packaged configuration selects `test`. Test mode deletes an existing
`matching_test` branch during pre-clean, then recreates it. Use `normal` when
you want to build from the current checkout without test-branch operations.

## Files required for the build

These eight files are the source/configuration minimum for direct execution.
The cleanup module must be present in both modes because the entry script imports it.

| Relative path | Responsibility |
| --- | --- |
| `partially_completed_not_fully_realized_container_image_creation_test_under_construction.py` | Entry point, environment preparation, shared pipeline, Docker build and verification, JSON report |
| `matching_branch_cleanup.py` | Check whether the disposable branch exists; delete and verify absence, with at most two deletion attempts |
| `matching/build_context.py` | Read the manifest, assemble a separate Docker context, relocate test paths, and calculate the file inventory |
| `matching/container_python_wheel_download.py` | Read the manifest's exact Python version and invoke pip to download compatible wheels |
| `matching/published_artifact_retrieval.py` | Download each model from its published URL and verify its size and SHA-256 |
| `matching/operation_config.json` | Choose the mode and configure the build and test environment |
| `matching/build_context_manifest.json` | Describe the Dockerfile, directories, wheel requirements, model sources and integrity values |
| `matching/Dockerfile.runtime` | Install offline wheels into the image and package and load the models |

The current GitHub Actions runner additionally requires:

| Relative path | Responsibility |
| --- | --- |
| `.github/workflows/matching_component_tests.yml` | Set up the manifest's Python version, execute the configured script, and upload its report |
| `matching/component_test_config.json` | Select the entry-script filename for the runner |

Preserve the `.github` directory when extracting or copying the package; some file
browsers hide it. Python helper imports require the `matching` directory to remain
alongside the root entry script.

Files under `comparison_reference/`, when included, are reference copies of the
separate comparison program. They are not imported or executed by this bootstrap.

## Prerequisites

- A Git checkout with a commit that `git rev-parse HEAD` can resolve.
- Python with pip. Its full `X.Y.Z` version must match `python_version` in the
  manifest. This snapshot specifies `3.10.22`.
- Docker CLI and a running Docker daemon, using Linux containers.
- Internet access to the package index, model publishers, and Docker base-image
  registry. Acquisition is online; dependency installation inside the Docker
  build uses the downloaded wheel directory without a package index.
- The `GITHUB_REPOSITORY` environment variable, in `owner/repository` form.
- For test mode: GitHub CLI (`gh`) and authenticated access with repository
  contents write permission for branch creation, deletion, and pushing the
  relocated test workspace. The configured base branch must contain the
  bootstrap files, including the `matching` source directory.

The Actions workflow runs on `ubuntu-latest`. Wheel resolution targets the
manifest's Python version on the acquisition host's platform and architecture;
it does not set a separate target platform. Use a compatible Linux host for the
Linux container build. The snapshot is not an offline binary archive.

## Configuration

The main entry point reads `matching/operation_config.json` from the current
working directory. Its configuration is:

```json
{
  "description": "One shared build pipeline; test changes only pre-clean, branch, and primary folder.",
  "mode": "test",
  "cleanup": { "branch": "matching_test" },
  "build": {
    "primary_folder": "matching",
    "manifest": "build_context_manifest.json",
    "image": "matching-runtime:creation",
    "report": "container-image-creation-result.json"
  },
  "test": {
    "branch": "matching_test",
    "primary_folder": "matching_test",
    "base_branch": "main"
  }
}
```

`mode` accepts exactly `normal` or `test`. Both enter the same `run_pipeline`
function and use the same acquisition, build, verification, and reporting
functions. The only test-specific changes are:

1. Run the pre-clean/existence check for the disposable branch.
2. Create and check out the `matching_test` branch from the configured base branch.
3. Rename the primary source folder to `matching_test` on that branch and use
   `matching_test` for the generated build context, container model paths, and report.

Normal mode uses the current checkout and the `matching` primary folder. Both
modes build **and verify** the image. Test mode is not a separate build implementation.

Shared build settings belong in `build`; test isolation settings belong in `test`.
The `cleanup` object is for running `matching_branch_cleanup.py` independently.
During the shared build, cleanup receives the `test` object, using its `branch` key.

The current cleanup implementation permits only the branch `matching_test`.
The context builder supports the primary folders `matching` and `matching_test`.
These fields are not unrestricted arbitrary-name settings.

## Build manifest and acquired inputs

The manifest provides three direct wheel requirements:

- `onnxruntime>=1.15.0`
- `numpy>=1.22.0`
- `Pillow>=9.0.0`

The context builder writes a new `requirements.txt` from the manifest's `wheels`
array. Pip resolves the direct requirements and their transitive dependencies
into `.whl` files. The repository's existing requirements file and wheel binaries
are not needed for this acquisition path.

The manifest's `models` array identifies `feature_encoder.onnx` and
`spatial_detector.onnx`, their published download URLs, exact byte sizes, and
SHA-256 hashes. Both downloads must match those integrity values before building.
The downloader uses the recorded publisher URLs rather than Git LFS retrieval.
Although the manifest retains `git_lfs` metadata, this pipeline does not use
that metadata to download model or wheel objects.

Directories come from the manifest. Its directory template includes `.gitkeep`
and `.gitattributes` where they already exist; absent optional metadata files
do not block the build. The inventory is calculated from acquired files and
contains their relative paths, sizes, and hashes. No fixed completeness count
is required.

The Dockerfile receives the manifest Python version through `--build-arg
PYTHON_VERSION=...`. It installs the downloaded wheels offline, imports the
dependencies, copies the models, and loads both ONNX sessions. After the image
is built, the shared verification function starts it with networking disabled,
checks the interpreter version, imports the dependencies, and loads both models.

Minimum-version requirements can resolve to different wheel releases on later
runs. Model byte identity is fixed by manifest hashes; dependency releases and
the Docker base image are not pinned by immutable digests in this snapshot.

## Run directly

Run these commands in a Bash shell from the Git repository root, after selecting
the mode in the operation config. Activate an interpreter matching the manifest
before invoking the entry script.

```bash
export GITHUB_REPOSITORY=BestNameYet/StateMachines
python partially_completed_not_fully_realized_container_image_creation_test_under_construction.py
```

Change `GITHUB_REPOSITORY` when using another repository. Normal mode does not
call GitHub APIs, but the current entry point still requires this environment
variable. Test mode clones its configured remote base branch: uncommitted local
edits are not the source of that test checkout. Commit and push the bootstrap
files to the configured base branch before testing them.

## Run through GitHub Actions

Commit the ten required files with their original paths on `main`. The workflow
runs when one of its listed source/configuration files changes on `main`, or
when manually dispatched from the Actions page. It reads the manifest and sets
up that exact Python version before launching the configured component.

The workflow serializes runs and grants its job `contents: write`. The GitHub
token is supplied as `GH_TOKEN`; credentials are not stored in the package.
Changing the operation config's mode is sufficient to select the shared path
on the next triggered execution.

## Results and persistence

| Result | Normal mode | Test mode |
| --- | --- | --- |
| Primary folder | `matching` | `matching_test` |
| Report, with packaged settings | `matching/container-image-creation-result.json` | `matching_test/container-image-creation-result.json` |
| Image tag | `matching-runtime:creation` | `matching-runtime:creation` |
| Remote branch changes | None from this script | Pre-clean, branch creation, folder relocation commit and push |

The JSON report records the selected mode, environment/source commit, manifest
hash, acquired-file inventory, image ID, dependency versions, model providers,
pending stages, and outcome. A successful pipeline exits `0`; a caught pipeline
failure writes an error report and exits `1`. Missing or invalid modes print
the current config and a corrected example, then exit `1`.

The Actions runner uploads the report as `matching-container-image-creation-result`.
The Docker image and acquired build files remain on the execution host for its
lifetime. They are not published to GHCR, committed as binaries, or added to this
bootstrap package. The test branch remains for inspection until the next pre-clean.

The general-purpose workflow prints `No script available` and exits successfully
when its runner config/script cannot be resolved. That is a skipped component,
not a successful image build. Python setup runs before that runner check, so a
missing or invalid build manifest can fail the job earlier.

## Relationship to image comparison

The bootstrap produces the runtime dependencies and models. It does not package
or execute `matching/state_machine.py`, read an anchor image, scan a candidate
batch, rank similarities, or generate comparison metrics.

The existing comparison workflow, `signal_alignment.yml`, has a separate
GHCR/LFS build-and-run path. It is not wired to automatically consume the local
image produced by this bootstrap. See the separate program README for the
comparison inputs, trigger, and behavior.
