import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import gemini


class FakeDriver:
    def __init__(self):
        self.screenshots = []

    def save_screenshot(self, path):
        Path(path).write_bytes(b"png")
        self.screenshots.append(path)
        return True


class GeminiAdapterTests(unittest.TestCase):
    def test_parse_plain_and_fenced_json(self):
        self.assertEqual(gemini.parse_json_response("```json\n{\"$answer\":\"ok\"}\n```"), {"$answer": "ok"})

    def test_rejects_non_object_and_malformed_json(self):
        with self.assertRaisesRegex(ValueError, "JSON object"):
            gemini.parse_json_response('[1, 2]')
        with self.assertRaisesRegex(ValueError, "valid JSON"):
            gemini.parse_json_response('{"$answer":')

    def test_exact_variable_names_and_types(self):
        screen = {
            "inputs": [{"name": "answer", "schema": {"type": "string"}}],
            "returnSchema": {
                "type": "object", "properties": {"$answer": {"type": "string"}},
                "required": ["$answer"], "additionalProperties": False,
            },
        }
        self.assertEqual(gemini.validate_response(screen, {"$answer": "ok"}), {"$answer": "ok"})
        with self.assertRaisesRegex(ValueError, "variable names"):
            gemini.validate_response(screen, {"$answer": "ok", "$extra": 1})
        with self.assertRaisesRegex(ValueError, "string"):
            gemini.validate_response(screen, {"$answer": 1})

    def test_anyof_and_nested_types(self):
        schema = {
            "type": "object",
            "properties": {
                "mode": {"anyOf": [{"const": "fidelity"}, {"const": "minimal"}]},
                "items": {"type": "array", "items": {"type": "object", "required": ["newFile"], "properties": {"newFile": {"type": "boolean"}}}},
            },
            "required": ["mode", "items"],
        }
        gemini._validate_value({"mode": "fidelity", "items": [{"newFile": True}]}, schema, "$value")
        with self.assertRaisesRegex(ValueError, "allowed"):
            gemini._validate_value({"mode": "other", "items": []}, schema, "$value")

    def test_gemini_api_uses_header_and_does_not_put_key_in_url(self):
        seen = {}

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps({"candidates": [{"content": {"parts": [{"text": '{"$answer":"ok"}'}]}}]}).encode()

        def opener(request, timeout):
            seen["url"] = request.full_url
            seen["key"] = request.get_header("X-goog-api-key")
            seen["timeout"] = timeout
            return Response()

        text = gemini.call_gemini("prompt", api_key="test-key", model="model-x", opener=opener)
        self.assertEqual(text, '{"$answer":"ok"}')
        self.assertNotIn("test-key", seen["url"])
        self.assertEqual(seen["key"], "test-key")

    def test_validation_error_is_sent_back_and_evidence_is_saved_through_halt(self):
        initial = {
            "id": "run", "render": 1, "done": False,
            "entries": [["instruction", "Answer the prompt."]],
            "inputs": [{"name": "verbatimUserPrompt", "schema": {"type": "string"}}],
            "returnSchema": {"type": "object", "properties": {"$verbatimUserPrompt": {"type": "string"}}, "required": ["$verbatimUserPrompt"], "additionalProperties": False},
            "state": {"render": 1}, "newFiles": [], "history": [],
        }
        terminal = {"id": "run", "render": 7, "done": True, "state": {"render": 7}, "history": [{"render": 1}]}
        driver = FakeDriver()
        calls = []

        def model(prompt):
            calls.append(prompt)
            return '{"$wrong":"first"}' if len(calls) == 1 else '{"$verbatimUserPrompt":"prompt"}'

        with tempfile.TemporaryDirectory() as directory, patch.object(gemini, "read_screen", return_value=initial), patch.object(gemini, "submit_values", return_value=terminal):
            result = gemini.run_loop(driver, "prompt", "minimal", directory, request_fn=model)
            self.assertEqual(result["status"], "halted")
            self.assertEqual(len(calls), 2)
            self.assertIn("unexpected $wrong", calls[1])
            events = [json.loads(line) for line in (Path(directory) / "events.jsonl").read_text().splitlines()]
            attempts = [event for event in events if event["event"] == "model_attempt"]
            self.assertEqual(attempts[0]["validation_error"], "Returned variable names must match the current inputs (missing $verbatimUserPrompt; unexpected $wrong).")
            self.assertEqual(attempts[1]["submitted_values"], {"$verbatimUserPrompt": "prompt"})
            self.assertTrue(any(event["event"] == "terminal" for event in events))
            self.assertTrue(any(Path(directory, name).exists() for name in ("screen-001-render-1-attempt-01.png", "screen-001-render-1-attempt-02.png")))
            self.assertTrue(any(Path(directory, name).exists() for name in ("terminal-001.png",)))

    def test_execution_instruction_blocks_without_claiming_completion(self):
        screen = {
            "render": 13,
            "done": False,
            "entries": [["steptext", "Execute each requirement in the requirements array."]],
            "inputs": [{"name": "toolInvocations", "schema": {"type": "array"}}],
            "state": {"render": 13},
        }
        self.assertIn("do not write files", gemini.execution_blocker(screen).lower())

    def test_terminal_screen_does_not_call_gemini(self):
        terminal = {"render": 23, "done": True, "state": {"render": 23}, "history": []}
        driver = FakeDriver()
        with tempfile.TemporaryDirectory() as directory, patch.object(gemini, "read_screen", return_value=terminal):
            result = gemini.run_loop(driver, "prompt", "minimal", directory, request_fn=lambda _: self.fail("must not call Gemini"))
        self.assertEqual(result["status"], "halted")
        self.assertEqual(result["submissions"], 0)


if __name__ == "__main__":
    unittest.main()
