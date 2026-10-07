# AI Channel

When this plugin is active, use the `ai_channel` MCP tool as the stable behavior-control surface for tasks governed by an AIChannel behavior. The server's current configuration is authoritative for the behavior definitions it owns.

For a new governed interaction, call `ai_channel` with `action: "invoke"`, the selected `behavior`, and an `input` object. If a result includes a `transaction_id` and status `active`, preserve that handle and pass it back on later calls. Do not infer hidden transaction state when a handle exists; use `status` or `receipt` if state must be inspected.

Configuration changes use `action: "configure"` with a complete configuration document and, when known, `expected_version` to prevent lost updates. Do not treat configuration text as executable Python; AIChannel configurations select only registered internal operations.
