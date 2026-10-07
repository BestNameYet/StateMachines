"""End-to-end protocol test for the Semantic Runtime MCP server."""
import json
import os
import subprocess
import sys
import unittest

class ServerTest(unittest.TestCase):
    def call(self, messages):
        """Run the server once and decode every reply."""
        completed = subprocess.run([sys.executable, "server.py"], input="\n".join(json.dumps(item) for item in messages) + "\n", text=True, capture_output=True, check=True,
                                   env={**os.environ, 'SEMANTIC_RENDERER_URL': ''})
        return [json.loads(line) for line in completed.stdout.splitlines()]
    def test_initialize_list_start_and_continue(self):
        """Prove MCP discovery and a two-call serialized transition."""
        replies = self.call([
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "transaction", "arguments": {"value": {"alias": "demo"}, "terminal": 2}}}
        ])
        self.assertEqual(replies[0]["result"]["serverInfo"]["name"], "semantic-runtime")
        self.assertEqual(replies[1]["result"]["tools"][0]["name"], "transaction")
        notice = replies[2]["result"]["structuredContent"]
        self.assertEqual(notice["status"], "PENDING_RENDER")
        self.assertEqual(notice["terminal"], 2)
        self.assertNotIn("render", notice)
        self.assertNotIn("out_token", notice)

if __name__ == "__main__":
    unittest.main()
