from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from aichannel.runtime import AIChannelRuntime

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "config" / "default.json"


class AIChannelTests(unittest.TestCase):
    def runtime(self, directory: str) -> AIChannelRuntime:
        return AIChannelRuntime(Path(directory) / "state.sqlite3", DEFAULT)

    def test_echo(self):
        with tempfile.TemporaryDirectory() as d:
            runtime = self.runtime(d)
            value = {"message": "same message", "nested": {"n": 1}}
            out = runtime.call({"action": "invoke", "behavior": "echo", "input": value})
            self.assertEqual(out["output"], value)

    def test_live_reconfigure_without_restart(self):
        with tempfile.TemporaryDirectory() as d:
            runtime = self.runtime(d)
            current = runtime.get_config()
            config = current["config"]
            config["behaviors"]["constant"] = {
                "kind": "pipeline",
                "description": "runtime-added behavior",
                "steps": [{"op": "emit", "value": {"configured": True}}]
            }
            configured = runtime.configure(config, expected_version=current["config_version"])
            out = runtime.invoke("constant", {})
            self.assertEqual(configured["config_version"], 2)
            self.assertEqual(out["output"], {"configured": True})

    def test_state_machine_persists_across_runtime_restart(self):
        with tempfile.TemporaryDirectory() as d:
            first = self.runtime(d)
            started = first.invoke("two_step_controller", {})
            self.assertEqual(started["status"], "active")
            txid = started["transaction_id"]

            second = self.runtime(d)
            completed = second.invoke(
                "two_step_controller",
                {"event": "respond", "answer": "persisted"},
                transaction_id=txid,
            )
            self.assertEqual(completed["status"], "complete")
            self.assertEqual(completed["output"], {"answer": "persisted"})
            receipt = second.store.receipt(txid)
            self.assertGreaterEqual(len(receipt["events"]), 3)

    def test_config_compare_and_swap(self):
        with tempfile.TemporaryDirectory() as d:
            runtime = self.runtime(d)
            current = runtime.get_config()
            with self.assertRaisesRegex(ValueError, "config version conflict"):
                runtime.configure(current["config"], expected_version=999)

    def test_existing_transaction_remains_pinned_after_reconfigure(self):
        with tempfile.TemporaryDirectory() as d:
            runtime = self.runtime(d)
            started = runtime.invoke("two_step_controller", {})
            txid = started["transaction_id"]
            current = runtime.get_config()
            config = current["config"]
            config["behaviors"]["new_behavior"] = {
                "kind": "pipeline",
                "description": "added later",
                "steps": [{"op": "emit", "value": {"new": True}}]
            }
            runtime.configure(config, expected_version=current["config_version"])
            completed = runtime.invoke(
                "two_step_controller",
                {"event": "respond", "answer": "old-config-still-works"},
                transaction_id=txid,
            )
            self.assertEqual(completed["config_version"], 1)
            self.assertEqual(completed["output"], {"answer": "old-config-still-works"})

    def test_retrieval_is_deterministic(self):
        with tempfile.TemporaryDirectory() as d:
            runtime = self.runtime(d)
            a = runtime.invoke("rank_knowledge", {"query": "persistent state receipt"})
            b = runtime.invoke("rank_knowledge", {"query": "persistent state receipt"})
            self.assertEqual(a["output"], b["output"])
            self.assertEqual(a["output"][0]["item"]["id"], "delivery")


if __name__ == "__main__":
    unittest.main()
