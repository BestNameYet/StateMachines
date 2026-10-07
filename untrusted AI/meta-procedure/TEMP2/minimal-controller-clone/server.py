from __future__ import annotations

import json
import sys
from typing import Any, Callable

from controller import Controller


SERVER_INFO = {"name": "minimal-controller-clone", "version": "0.1.0"}
PROTOCOL_VERSION = "2024-11-05"
controller = Controller()


TOOLS = [
    {
        "name": "controller_start",
        "description": "Start a deterministic execution-contract interrogation for a desired state.",
        "inputSchema": {
            "type": "object",
            "properties": {"desired_state": {"type": "string", "minLength": 1}},
            "required": ["desired_state"],
            "additionalProperties": False,
        },
    },
    {
        "name": "controller_respond",
        "description": "Submit one exact-schema JSON response to the active controller instruction.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "transaction_id": {"type": "string"},
                "response": {"type": "object"},
            },
            "required": ["transaction_id", "response"],
            "additionalProperties": False,
        },
    },
    {
        "name": "controller_status",
        "description": "Return the authoritative state of a controller transaction.",
        "inputSchema": {
            "type": "object",
            "properties": {"transaction_id": {"type": "string"}},
            "required": ["transaction_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "controller_receipt",
        "description": "Return the complete event receipt for a controller transaction.",
        "inputSchema": {
            "type": "object",
            "properties": {"transaction_id": {"type": "string"}},
            "required": ["transaction_id"],
            "additionalProperties": False,
        },
    },
]


def send(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def result(request_id: Any, value: Any) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "result": value})


def error(request_id: Any, code: int, message: str) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    handlers: dict[str, Callable[..., dict[str, Any]]] = {
        "controller_start": controller.start,
        "controller_respond": controller.respond,
        "controller_status": controller.status,
        "controller_receipt": controller.receipt,
    }
    if name not in handlers:
        raise ValueError(f"unknown tool: {name}")
    structured = handlers[name](**arguments)
    return {
        "content": [{"type": "text", "text": json.dumps(structured, ensure_ascii=False)}],
        "structuredContent": structured,
        "isError": False,
    }


def dispatch(message: dict[str, Any]) -> None:
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}
    if request_id is None:
        return
    try:
        if method == "initialize":
            result(
                request_id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": SERVER_INFO,
                },
            )
        elif method == "ping":
            result(request_id, {})
        elif method == "tools/list":
            result(request_id, {"tools": TOOLS})
        elif method == "tools/call":
            result(request_id, call_tool(params.get("name", ""), params.get("arguments") or {}))
        else:
            error(request_id, -32601, f"method not found: {method}")
    except (TypeError, ValueError) as exc:
        error(request_id, -32602, str(exc))
    except Exception as exc:
        print(f"controller server error: {exc}", file=sys.stderr, flush=True)
        error(request_id, -32603, "internal controller error")


def main() -> None:
    for line in sys.stdin:
        try:
            message = json.loads(line)
            if not isinstance(message, dict):
                raise ValueError("message must be an object")
            dispatch(message)
        except (json.JSONDecodeError, ValueError) as exc:
            error(None, -32700, str(exc))


if __name__ == "__main__":
    main()
