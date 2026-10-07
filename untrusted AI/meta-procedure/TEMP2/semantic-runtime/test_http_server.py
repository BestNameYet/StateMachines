"""Integration tests for the shared HTTP MCP endpoint."""

import json
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from http_server import Handler
from runtime.address_codec import decode_request


class HttpServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.renderer = patch('server.push_delivery', return_value=False)
        cls.renderer.start()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.renderer.stop()

    def request(self, method, params=None):
        """Post one MCP request and decode its response."""
        payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).encode()
        request = urllib.request.Request(self.base_url + "/mcp", data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)

    def post_json(self, path, value):
        """Post JSON to one non-MCP route and decode its response."""
        request = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(value).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response)

    def test_health_and_tool_discovery(self):
        """Prove readiness and discovery through HTTP."""
        with urllib.request.urlopen(self.base_url + "/health", timeout=5) as response:
            health = json.load(response)
        self.assertEqual(health["mcp_path"], "/mcp")
        tools = self.request("tools/list")["result"]["tools"]
        self.assertEqual([tool["name"] for tool in tools], ["transaction"])

    def test_transaction_through_http(self):
        """Prove MCP output is hidden and routed to the terminal outbox."""
        response = self.request("tools/call", {"name": "transaction", "arguments": {"value": {"alias": "demo"}, "terminal": 1}})
        notice = response["result"]["structuredContent"]
        self.assertEqual(notice["status"], "PENDING_RENDER")
        self.assertNotIn("render", notice)
        with urllib.request.urlopen(self.base_url + "/terminal/1", timeout=5) as terminal:
            delivery = json.load(terminal)
        self.assertEqual(delivery["result"]["options"], ["CONTINUE"])
        self.assertTrue(delivery["result"]["out_token"])

    def test_address_replays_until_ack_then_is_consumed(self):
        """Prove two-phase delivery and idempotent acknowledgement."""
        notice = self.request(
            "tools/call",
            {
                "name": "transaction",
                "arguments": {"value": {"alias": "demo"}, "terminal": 2},
            },
        )["result"]["structuredContent"]
        self.assertEqual(notice["status"], "PENDING_RENDER")
        with urllib.request.urlopen(self.base_url + "/terminal/2", timeout=5) as terminal:
            started = json.load(terminal)["result"]
        path = started["addresses"][0]
        encoded = path.removeprefix("/resolve/")
        self.assertNotIn("response", decode_request(encoded))

        with urllib.request.urlopen(self.base_url + path, timeout=5) as response:
            first = json.load(response)
        with urllib.request.urlopen(self.base_url + path, timeout=5) as response:
            replay = json.load(response)

        self.assertEqual(first, replay)
        self.assertEqual(first["status"], "PENDING_ACK")
        self.assertEqual(first["terminal"], 2)
        self.assertIn("serialized address", first["result"]["render"])

        ack = self.post_json("/ack", {"delivery_id": first["delivery_id"]})
        replayed_ack = self.post_json("/ack", {"delivery_id": first["delivery_id"]})
        self.assertEqual(ack, replayed_ack)
        self.assertEqual(ack["status"], "ACKNOWLEDGED")

        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(self.base_url + path, timeout=5)
        self.assertEqual(caught.exception.code, 410)
        caught.exception.close()


if __name__ == "__main__":
    unittest.main()
