"""Expose the Semantic Runtime runner as one MCP transaction tool."""
from __future__ import annotations
import json
import os
import sys
import urllib.request
from typing import Any
from runtime.address_codec import encode_request
from runtime.delivery import DeliveryLedger
from runtime.runner import Runner
from runtime.store import DefinitionStore
from runtime.sheet_push import push_delivery

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "semantic-runtime", "version": "0.1.0"}
RUNNER = Runner(DefinitionStore("definitions"))
DELIVERIES = DeliveryLedger(RUNNER)
TERMINAL_STATE = {}
TRANSACTION_TOOL = {
    "name": "transaction",
    "description": "Route one Semantic Runtime interaction to its assigned terminal. The tool response contains only the terminal location; rendered data remains in the terminal outbox for Apps Script.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "value": {"oneOf": [
                {"type": "string", "minLength": 1},
                {"type": "object", "properties": {"alias": {"type": "string", "minLength": 1}}, "required": ["alias"], "additionalProperties": False}
            ]},
            "response": {"type": ["string", "number", "boolean"]},
            "terminal": {"type": ["string", "integer"]}
        },
        "anyOf": [{"required": ["value"]}, {"required": ["terminal"]}],
        "additionalProperties": False
    }
}

def send(message: dict[str, Any]) -> None:
    """Write one JSON-RPC message to standard output."""
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()

def send_result(request_id: Any, value: Any) -> None:
    """Return one successful JSON-RPC response."""
    send({"jsonrpc": "2.0", "id": request_id, "result": value})

def send_error(request_id: Any, code: int, message: str) -> None:
    """Return one JSON-RPC error response."""
    send({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})

def call_transaction(arguments: dict[str, Any]) -> dict[str, Any]:
    """Route a runtime result to a terminal without exposing it to the agent."""
    if apps_script_mode():
        return forward_to_apps_script(arguments)
    value, terminal = terminal_request(arguments)
    result = RUNNER.transaction(
        value,
        arguments.get("response"),
        terminal,
    )
    result["addresses"] = [
        "/resolve/" + encode_request(command) for command in result["commands"]
    ]
    terminal = result.get("terminal")
    if terminal is None:
        raise ValueError("terminal is required for routed output")
    location = RUNNER.store.terminal(terminal)
    delivery = DELIVERIES.publish(terminal, result)
    try:
        rendered = push_delivery(delivery)
    except Exception:
        return {"content": [{"type": "text", "text": f"Terminal {terminal} update failed; retry the call."}],
                "structuredContent": {"status": "DELIVERY_FAILED", "terminal": terminal,
                                      "terminal_url": location["url"]}, "isError": True}
    TERMINAL_STATE[str(terminal)] = result["in_token"]
    if rendered:
        DELIVERIES.acknowledge(delivery["delivery_id"])
    # The terminal is the sole interaction surface by default. A deployment
    # may opt into a short configured reply without exposing screen data.
    return configured_reply(terminal, location["url"])


def configured_reply(terminal: Any, terminal_url: str) -> dict[str, Any]:
    """Build the MCP result from SEMANTIC_MCP_REPLY; empty means silent."""
    template = os.environ.get("SEMANTIC_MCP_REPLY", "")
    if not template:
        return {"content": [], "structuredContent": {}, "isError": False}
    text = template.replace("{terminal}", str(terminal)).replace("{terminal_url}", terminal_url)
    return {"content": [{"type": "text", "text": text}], "structuredContent": {}, "isError": False}


def apps_script_mode() -> bool:
    """Return whether MCP should delegate execution to Apps Script."""
    return os.environ.get("SEMANTIC_RUNTIME_MODE", "local") == "apps_script"


def forward_to_apps_script(arguments: dict[str, Any]) -> dict[str, Any]:
    """Forward one stateless transaction to Apps Script and hide its response."""
    url = os.environ.get("SEMANTIC_APPS_SCRIPT_URL", "").strip()
    if not url.startswith("https://script.google.com/macros/s/") or not url.endswith("/exec"):
        raise ValueError("SEMANTIC_APPS_SCRIPT_URL must be a deployed Apps Script /exec URL")
    terminal = arguments.get("terminal")
    if terminal is None:
        raise ValueError("terminal is required for Apps Script routing")
    payload = {"terminal": terminal, "value": arguments.get("value")}
    if "response" in arguments:
        payload["response"] = arguments["response"]
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        reply = json.load(response)
    if reply.get("status") not in ("RECEIVED", "ACCEPTED"):
        raise ValueError("Apps Script rejected the transaction")
    return {"content": [], "structuredContent": {}, "isError": False}


def terminal_request(arguments):
    """Resolve a terminal ID to its latest token, or accept an explicit start."""
    value = arguments.get('value')
    terminal = arguments.get('terminal')
    if isinstance(value, str) and value.isdecimal():
        if terminal is not None and str(terminal) != value:
            raise ValueError('Terminal identifiers disagree')
        terminal, value = value, None
    if terminal is not None:
        RUNNER.store.terminal(terminal)
    if value is None:
        try:
            value = TERMINAL_STATE[str(terminal)]
        except KeyError:
            raise ValueError('Start a script on this terminal first') from None
    return value, terminal

def dispatch(message: dict[str, Any]) -> None:
    """Route one supported MCP JSON-RPC request."""
    request_id = message.get("id")
    if request_id is None:
        return
    method = message.get("method")
    params = message.get("params") or {}
    if method == "initialize":
        send_result(request_id, {"protocolVersion": PROTOCOL_VERSION, "capabilities": {"tools": {"listChanged": False}}, "serverInfo": SERVER_INFO})
    elif method == "ping":
        send_result(request_id, {})
    elif method == "tools/list":
        send_result(request_id, {"tools": [TRANSACTION_TOOL]})
    elif method == "tools/call" and params.get("name") == "transaction":
        send_result(request_id, call_transaction(params.get("arguments") or {}))
    else:
        send_error(request_id, -32601, f"method not found: {method}")

def main() -> None:
    """Serve newline-delimited MCP messages until standard input closes."""
    for line in sys.stdin:
        try:
            message = json.loads(line)
            if not isinstance(message, dict):
                raise ValueError("message must be an object")
            dispatch(message)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            send_error(None, -32602, str(exc))
        except Exception as exc:
            print(f"semantic runtime server error: {exc}", file=sys.stderr, flush=True)
            send_error(None, -32603, "internal server error")

if __name__ == "__main__":
    main()
