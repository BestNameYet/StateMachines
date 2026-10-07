# AIChannel

AIChannel is a single-tool MCP behavior runtime. The MCP surface stays stable (`ai_channel`) while behavior is changed by versioned JSON configuration. Application state is carried by explicit `transaction_id` handles and persisted in SQLite rather than hidden in MCP transport sessions.

The implementation intentionally separates five concerns: MCP framing (`server.py`), versioned configuration and transaction persistence (`aichannel/store.py`), fixed auditable behavior primitives (`aichannel/operations.py`), composition/state-machine execution (`aichannel/runtime.py`), and agent-facing routing instructions (`skills/ai-channel/SKILL.md`).

Configuration is data, not executable code. A live `configure` action replaces the active behavior configuration using optional compare-and-swap via `expected_version`. Existing state-machine transactions remain pinned to the configuration version under which they were created.

Run tests with:

```text
python -m unittest discover -s tests -v
```
