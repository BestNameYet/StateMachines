from __future__ import annotations

import json
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

from scripts.server import Handler


class HttpServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def test_health_identifies_remote_build(self) -> None:
        with urllib.request.urlopen(self.base + "/health", timeout=5) as response:
            body = json.load(response)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["server"], "mis-solver-query-v1-2")
        self.assertEqual(body["mcp_path"], "/mcp")

    def test_http_query_returns_complete_sorted_kb(self) -> None:
        payload = json.dumps({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "retrieve_context", "arguments": {"query": "solver architecture"}},
        }).encode("utf-8")
        request = urllib.request.Request(
            self.base + "/mcp", data=payload,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.load(response)
        matches = body["result"]["structuredContent"]["matches"]
        self.assertEqual(len(matches), 52)
        self.assertEqual([item["rank"] for item in matches], list(range(1, 53)))
        self.assertEqual([item["k"] for item in matches], sorted((item["k"] for item in matches), reverse=True))


if __name__ == "__main__":
    unittest.main()
