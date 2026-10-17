from __future__ import annotations

import json
import sys
from typing import Any

from scripts.server import TOOLS, call_tool


def send(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def result(request_id: Any, value: Any) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "result": value})


def error(request_id: Any, code: int, message: str) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def handle(request: dict[str, Any]) -> None:
    method = request.get("method")
    request_id = request.get("id")
    if method == "notifications/initialized":
        return
    if method == "initialize":
        result(request_id, {
            "protocolVersion": "2025-03-26",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "mis-solver-query", "version": "1.0.0"},
        })
        return
    if method == "tools/list":
        result(request_id, {"tools": TOOLS})
        return
    if method == "tools/call":
        params = request.get("params") or {}
        output = call_tool(params["name"], params.get("arguments", {}))
        result(request_id, {
            "content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False, indent=2)}],
            "structuredContent": output,
        })
        return
    if method == "ping":
        result(request_id, {})
        return
    error(request_id, -32601, f"Unsupported method: {method}")


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        request_id: Any = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("request must be a JSON object")
            request_id = request.get("id")
            handle(request)
        except json.JSONDecodeError as exc:
            error(None, -32700, f"Parse error: {exc}")
        except Exception as exc:
            error(request_id, -32603, f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
