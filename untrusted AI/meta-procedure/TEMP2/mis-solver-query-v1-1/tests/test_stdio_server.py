from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StdioServerTests(unittest.TestCase):
    def exchange(self, requests: list[dict]) -> list[dict]:
        payload = "".join(json.dumps(request) + "\n" for request in requests)
        completed = subprocess.run(
            [sys.executable, "stdio_server.py"], cwd=ROOT, input=payload,
            text=True, capture_output=True, check=False, timeout=20,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stderr, "")
        return [json.loads(line) for line in completed.stdout.splitlines() if line.strip()]

    def test_initialize_list_and_retrieve(self) -> None:
        responses = self.exchange([
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
                "name": "retrieve_context",
                "arguments": {"query": "solver architecture", "limit": 3},
            }},
        ])
        self.assertEqual([response["id"] for response in responses], [1, 2, 3])
        tool_names = {tool["name"] for tool in responses[1]["result"]["tools"]}
        self.assertEqual(tool_names, {
            "retrieve_context", "controller_start", "controller_respond",
            "controller_status", "controller_receipt", "controller_finalize",
        })
        structured = responses[2]["result"]["structuredContent"]
        self.assertEqual(structured["status"], "ok")
        self.assertLessEqual(len(structured["matches"]), 3)

    def test_controller_start(self) -> None:
        responses = self.exchange([{
            "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
                "name": "controller_start",
                "arguments": {"desired_state": "Design a robust solver procedure"},
            },
        }])
        structured = responses[0]["result"]["structuredContent"]
        self.assertIn("transaction_id", structured)
        self.assertEqual(structured["return_schema"], {"q1": ["<question>"]})


if __name__ == "__main__":
    unittest.main()
