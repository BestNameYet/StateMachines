# StateMachines

Repository for state machines, agent workflows, runtimes, and supporting projects.

## Repository manifest

[manifest.json](./manifest.json) inventories every Git-tracked file and its parent directories, recursively, including hidden directories. Untracked/ignored files and Git internals are excluded. Submodule paths are listed without traversing external repositories.

The **Update repository manifest** workflow refreshes the manifest and the README table of contents on pushes to `main`, on manual runs, and daily (to reconcile changes committed by other workflows). It commits only when those generated files change.

Each manifest entry has a repository-relative `path`, a `type` (`file` or `directory`), a `description`, and a `readmes` array containing README paths and URL-encoded relative links. Directory entries link to their immediate READMEs; README file entries link to themselves. README names are matched case-insensitively: `README`, `README.md`, and names starting with `README.`, `README_`, or `README-`.

### Semantic Operator descriptions

Semantic Operator can populate the `description` field for each path in `manifest.json` later. New entries start with an empty string. Refreshes preserve descriptions and extra entry fields by exact path, add new paths, and remove paths no longer tracked. A rename is treated as removal plus addition; transfer its description when renaming if needed. Malformed manifests fail validation rather than silently resetting descriptions.

The workflow performs the first inventory automatically. To refresh locally after staging new files:

```sh
python -m unittest discover -s tests -p 'test_repository_manifest.py'
python scripts/update_repository_manifest.py
```

Only the region between the index markers below is generated; other README content is preserved.

## README table of contents

<!-- repository-readmes:start -->

The workflow will populate this index on its first run.

<!-- repository-readmes:end -->
