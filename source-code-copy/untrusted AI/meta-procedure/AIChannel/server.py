from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from aichannel import AIChannelRuntime

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("AICHANNEL_DB", ROOT / "state" / "aichannel.sqlite3"))
CONFIG_PATH = Path(os.environ.get("AICHANNEL_DEFAULT_CONFIG", ROOT / "config" / "default.json"))
RUNTIME = AIChannelRuntime(DB_PATH, CONFIG_PATH)

SERVER_INFO = {"name": "ai-channel", "version": "0.1.0"}
MODERN_PROTOCOL = "2026-07-28"
LEGACY_PROTOCOL = "2025-11-25"

TOOL = {
    "name": "ai_channel",
    "title": "AI Channel",
    "description": "Invoke or reconfigure persistent, data-defined agent behavior through one stable control surface.",
    "inputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["invoke", "configure", "get_config", "list_behaviors", "status", "receipt"]
            },
            "behavior": {"type": "string"},
            "transaction_id": {"type": "string"},
            "input": {"type": "object"},
            "config": {"type": "object"},
            "expected_version": {"type": "integer", "minimum": 0}
        },
        "additionalProperties": False
    },
    "outputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object"
    }
}


def send(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def send_result(request_id: Any, value: Any) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "result": value})


def send_error(request_id: Any, code: int, message: str) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def tool_result(structured: dict[str, Any]) -> dict[str, Any]:
    return {
        "resultType": "complete",
        "content": [{"type": "text", "text": json.dumps(structured, ensure_ascii=False)}],
        "structuredContent": structured,
        "isError": False
    }


def dispatch(message: dict[str, Any]) -> dict[str, Any] | None:
    method = message.get("method")
    params = message.get("params") or {}
    if method == "initialize":
        return {
            "protocolVersion": LEGACY_PROTOCOL,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO
        }
    if method == "server/discover":
        return {
            "resultType": "complete",
            "capabilities": {"tools": {"listChanged": False}},
            "_meta": {"io.modelcontextprotocol/serverInfo": SERVER_INFO}
        }
    if method == "ping":
        return {"resultType": "complete"}
    if method == "tools/list":
        return {"resultType": "complete", "tools": [TOOL], "ttlMs": 0, "cacheScope": "private"}
    if method == "tools/call":
        if params.get("name") != "ai_channel":
            raise ValueError(f"unknown tool: {params.get('name')}")
        return tool_result(RUNTIME.call(params.get("arguments") or {}))
    if method in {"notifications/initialized", "notifications/cancelled"}:
        return None
    raise LookupError(f"method not found: {method}")


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        request_id = None
        try:
            message = json.loads(line)
            if not isinstance(message, dict):
                raise ValueError("message must be an object")
            request_id = message.get("id")
            result = dispatch(message)
            if request_id is not None and result is not None:
                send_result(request_id, result)
        except json.JSONDecodeError as exc:
            send_error(request_id, -32700, str(exc))
        except LookupError as exc:
            send_error(request_id, -32601, str(exc))
        except (KeyError, TypeError, ValueError) as exc:
            send_error(request_id, -32602, str(exc))
        except Exception as exc:
            print(f"ai-channel server error: {exc}", file=sys.stderr, flush=True)
            send_error(request_id, -32603, "internal server error")


if __name__ == "__main__":
    main()
