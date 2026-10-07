import tempfile
import unittest
from pathlib import Path

from controller import Controller


class ControllerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.controller = Controller(Path(self.temp.name))

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_complete_interaction(self) -> None:
        started = self.controller.start("Produce a deterministic solver")
        transaction_id = started["transaction_id"]
        self.assertEqual(set(started["return_schema"]), {"selected_architecture", "rationale"})
        self.assertIn("candidate_architectures", started["solver_architecture"])
        self.assertNotEqual(started["architecture_source"], "embedded-fallback")
        candidate = started["solver_architecture"]["candidate_architectures"][0]["name"]
        domain_request = self.controller.respond(transaction_id, {
            "selected_architecture": candidate,
            "rationale": "Best evidence and validation fit",
        })
        self.assertEqual(domain_request["return_schema"], {"q1": ["<question a model would explore when applying X to Y>"]})
        question = self.controller.respond(transaction_id, {"q1": ["Which problem state must the selected solver represent, and how will it observe that state?"]})
        self.assertEqual(question["return_schema"], {"answer": "<answer>"})
        script_request = self.controller.respond(transaction_id, {"answer": "Schema and runtime tests"})
        self.assertEqual(script_request["return_schema"], {"script": "<script>"})
        complete = self.controller.respond(transaction_id, {"script": "print('ok')"})
        self.assertEqual(complete["status"], "complete")
        self.assertEqual(complete["execution"], "not_run")

    def test_invalid_response_repeats_without_advancing(self) -> None:
        started = self.controller.start("Test validation")
        transaction_id = started["transaction_id"]
        rejected = self.controller.respond(transaction_id, {"wrong": []})
        self.assertIn("error", rejected)
        self.assertEqual(self.controller.status(transaction_id)["phase"], "architecture_choice")

    def test_architecture_interrogation_precedes_domain_interrogation(self) -> None:
        started = self.controller.start("Diagnose an intermittent controller failure")
        self.assertNotIn("q1", started["return_schema"])
        self.assertIn("evidence", started["solver_architecture"])
        self.assertIn("coverage_gaps", started["solver_architecture"])
        candidate = started["solver_architecture"]["candidate_architectures"][0]["name"]
        domain = self.controller.respond(started["transaction_id"], {
            "selected_architecture": candidate,
            "rationale": "Matches a causal diagnosis task",
        })
        self.assertIn("q1", domain["return_schema"])
        self.assertIn("selected_architecture", domain)

    def test_non_candidate_architecture_is_rejected(self) -> None:
        started = self.controller.start("Design a workflow")
        rejected = self.controller.respond(started["transaction_id"], {
            "selected_architecture": "invented architecture",
            "rationale": "unsupported",
        })
        self.assertIn("error", rejected)
        self.assertEqual(self.controller.status(started["transaction_id"])["phase"], "architecture_choice")


if __name__ == "__main__":
    unittest.main()
