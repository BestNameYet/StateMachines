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

| README |
| --- |
| [ChatMachines/AudioClipSelector/README.md](./ChatMachines/AudioClipSelector/README.md) |
| [ChatMachines/AudioEmotionAnalysis/README.md](./ChatMachines/AudioEmotionAnalysis/README.md) |
| [ChatMachines/GeminiEvaluation/README.md](./ChatMachines/GeminiEvaluation/README.md) |
| [ChatMachines/GeminiSupervisor/README.md](./ChatMachines/GeminiSupervisor/README.md) |
| [ChatMachines/GeminiSupervisor/stable-readers/README.reader.json](./ChatMachines/GeminiSupervisor/stable-readers/README.reader.json) |
| [ChatMachines/GeminiTokenCountCalibration/README.md](./ChatMachines/GeminiTokenCountCalibration/README.md) |
| [ChatMachines/Main Instructions/AGENTS Design/README.md](./ChatMachines/Main%20Instructions/AGENTS%20Design/README.md) |
| [ChatMachines/SeleniumServer/README.md](./ChatMachines/SeleniumServer/README.md) |
| [ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/AGENTS%20Procedure/README.md) |
| [ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/issue-workspaces/54/project/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/AGENTS%20Procedure/issue-workspaces/54/project/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/bertopic/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/bertopic/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/conversation-classifier-12/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/conversation-classifier-12/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/key-extraction/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/key-extraction/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/tfidf-nmf/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/tfidf-nmf/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/topic-clustering/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/topic-clustering/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/topic-distribution/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/topic-distribution/README.md) |
| [ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/topic-merge/README.md](./ChatMachines/Workflow%20Interactive%20Procedures/Conversation%20Archive%20Analysis/topic-merge/README.md) |
| [SBE/README.md](./SBE/README.md) |
| [matching/README.md](./matching/README.md) |
| [matching/README_BUILD.md](./matching/README_BUILD.md) |
| [metaprocedures/procedures/AchiveExtraction/README.md](./metaprocedures/procedures/AchiveExtraction/README.md) |
| [untrusted AI/README.md](./untrusted%20AI/README.md) |
| [untrusted AI/meta-procedure/AIChannel/README.md](./untrusted%20AI/meta-procedure/AIChannel/README.md) |

<!-- repository-readmes:end -->
