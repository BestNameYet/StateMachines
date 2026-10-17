"""Serve the Semantic Runtime MCP tool over loopback HTTP."""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

from runtime.delivery import AddressConsumed, DeliveryNotFound
from server import DELIVERIES, RUNNER, PROTOCOL_VERSION, SERVER_INFO, TRANSACTION_TOOL, call_transaction


def dispatch_http(message: dict) -> tuple[int, dict]:
    """Turn one MCP request into one HTTP status and JSON response."""
    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}
    if method == "notifications/initialized":
        return 202, {}
    if method == "initialize":
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
        }
    elif method == "ping":
        result = {}
    elif method == "tools/list":
        result = {"tools": [TRANSACTION_TOOL]}
    elif method == "tools/call" and params.get("name") == "transaction":
        result = call_transaction(params.get("arguments") or {})
    else:
        return 200, rpc_error(request_id, -32601, f"method not found: {method}")
    return 200, {"jsonrpc": "2.0", "id": request_id, "result": result}


def rpc_error(request_id, code: int, message: str) -> dict:
    """Build one JSON-RPC error object."""
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


class Handler(BaseHTTPRequestHandler):
    """Expose health and MCP routes without public network binding."""

    def do_GET(self) -> None:
        """Report readiness or resolve one encoded transaction address."""
        path = urlsplit(self.path).path
        if path == "/health":
            self.reply(200, {"status": "ok", "server": SERVER_INFO["name"], "version": SERVER_INFO["version"], "mcp_path": "/mcp"})
        elif path == "/scripts":
            self.reply(200, {"scripts": RUNNER.store.catalog()})
        elif path.startswith("/resolve/"):
            self.resolve_address(unquote(path.removeprefix("/resolve/")))
        elif path.startswith("/terminal/"):
            self.read_terminal(unquote(path.removeprefix("/terminal/")))
        else:
            self.reply(404, {"error": "not found"})

    def do_POST(self) -> None:
        """Execute one MCP request at the shared endpoint."""
        if self.path == "/ack":
            return self.acknowledge_delivery()
        if self.path != "/mcp":
            return self.reply(404, {"error": "not found"})
        request_id = None
        try:
            size = int(self.headers.get("Content-Length", "0"))
            message = json.loads(self.rfile.read(size) or b"{}")
            request_id = message.get("id")
            status, response = dispatch_http(message)
            self.reply(status, response)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            self.reply(200, rpc_error(request_id, -32602, str(exc)))
        except Exception as exc:
            self.reply(200, rpc_error(request_id, -32603, f"{type(exc).__name__}: {exc}"))

    def resolve_address(self, address: str) -> None:
        """Return a stable result without consuming its address."""
        try:
            self.reply(200, DELIVERIES.resolve(address))
        except AddressConsumed:
            self.reply(410, {"status": "CONSUMED"})
        except (KeyError, TypeError, ValueError) as exc:
            self.reply(400, {"status": "INVALID_ADDRESS", "error": str(exc)})

    def acknowledge_delivery(self) -> None:
        """Consume a resolved address after Apps Script confirms its write."""
        try:
            delivery_id = self.read_json()["delivery_id"]
            self.reply(200, DELIVERIES.acknowledge(str(delivery_id)))
        except DeliveryNotFound:
            self.reply(404, {"status": "DELIVERY_NOT_FOUND"})
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            self.reply(400, {"status": "INVALID_ACK", "error": str(exc)})

    def read_terminal(self, terminal: str) -> None:
        """Return one terminal's latest result to Apps Script."""
        try:
            self.reply(200, DELIVERIES.latest(terminal))
        except DeliveryNotFound:
            self.reply(404, {"status": "NO_PENDING_DELIVERY", "terminal": terminal})

    def read_json(self) -> dict:
        """Read one JSON request body."""
        size = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def reply(self, status: int, value: dict) -> None:
        """Write one JSON response."""
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args) -> None:
        """Keep the local terminal quiet."""


def serve(host: str = "127.0.0.1", port: int = 8790) -> None:
    """Run the shared MCP service until stopped."""
    ThreadingHTTPServer((host, port), Handler).serve_forever()


def main() -> None:
    """Read loopback server settings and start the service."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args()
    serve(args.host, args.port)


if __name__ == "__main__":
    main()
