"""Unit tests for BERTopic input validation and safe output formatting."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

from run import load_documents, membership_strength, write_results


class FakeTopicInfo:
    def to_dict(self, orient="records"):
        assert orient == "records"
        return [{"Topic": 0, "Name": "0_topic_terms", "Count": 2}]


class FakeModel:
    def get_topic(self, topic_id):
        assert topic_id == 0
        return [("topic", 0.75), ("example", 0.25)]


class InputTests(unittest.TestCase):
    def test_reads_document_and_preserves_reference_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "documents.jsonl"
            source.write_text(
                json.dumps({
                    "document_id": "doc-1",
                    "text": "prepared passage",
                    "source_ref": "conversation-1/message-2",
                    "metadata": {"period": "2025"},
                }) + "\n" +
                json.dumps({"document_id": "doc-2", "text": "another passage"}) + "\n",
                encoding="utf-8",
            )
            records = load_documents(source)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["source_ref"], "conversation-1/message-2")
        self.assertEqual(records[0]["metadata"], {"period": "2025"})
        self.assertIsNone(records[1]["source_ref"])

    def test_rejects_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "documents.jsonl"
            line = json.dumps({"document_id": "same", "text": "a passage"})
            source.write_text(line + "\n" + line + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate document_id"):
                load_documents(source)

    def test_rejects_fewer_than_two_documents(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "documents.jsonl"
            source.write_text(json.dumps({"document_id": "one", "text": "only one"}) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "at least two"):
                load_documents(source)


class OutputTests(unittest.TestCase):
    def test_writes_assignments_without_text_and_records_outliers(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            docs = [
                {"document_id": "a", "text": "private text", "source_ref": "ref-a", "metadata": {"kind": "passage"}},
                {"document_id": "b", "text": "other private text", "source_ref": None, "metadata": {}},
            ]
            report = write_results(
                output,
                docs,
                [0, -1],
                [0.84, 0.0],
                topic_info=FakeTopicInfo(),
                model=FakeModel(),
            )
            jsonl = (output / "assignments.jsonl").read_text(encoding="utf-8")
            records = [json.loads(line) for line in jsonl.splitlines()]
            csv_rows = list(csv.DictReader((output / "assignments.csv").open(encoding="utf-8")))
            topics = json.loads((output / "topics.json").read_text(encoding="utf-8"))

        self.assertEqual([row["topic_id"] for row in records], [0, -1])
        self.assertEqual(records[0]["membership_strength"], 0.84)
        self.assertNotIn("private text", jsonl)
        self.assertEqual(csv_rows[0]["source_ref"], "ref-a")
        self.assertEqual(topics[0]["top_terms"][0]["term"], "topic")
        self.assertEqual(report["assigned_to_outlier_topic"], 1)
        self.assertFalse(report["text_saved_in_outputs"])

    def test_membership_strength_supports_none_scalar_and_topic_matrix(self):
        self.assertIsNone(membership_strength(None, 0))
        self.assertEqual(membership_strength([0.4, 0.8], 1), 0.8)
        self.assertEqual(membership_strength([[0.1, 0.9]], 0), 0.9)


if __name__ == "__main__":
    unittest.main()
