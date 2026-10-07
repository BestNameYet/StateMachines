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
        question = self.controller.respond(transaction_id, {"q1": ["What is the constraint?"]})
        self.assertEqual(question["return_schema"], {"answer": "<answer>"})
        script_request = self.controller.respond(transaction_id, {"answer": "Exact JSON only"})
        self.assertEqual(script_request["return_schema"], {"script": "<script>"})
        complete = self.controller.respond(transaction_id, {"script": "print('ok')"})
        self.assertEqual(complete["status"], "complete")
        self.assertEqual(complete["execution"], "not_run")

    def test_invalid_response_repeats_without_advancing(self) -> None:
        started = self.controller.start("Test validation")
        transaction_id = started["transaction_id"]
        rejected = self.controller.respond(transaction_id, {"wrong": []})
        self.assertIn("error", rejected)
        self.assertEqual(self.controller.status(transaction_id)["phase"], "questions")


if __name__ == "__main__":
    unittest.main()
