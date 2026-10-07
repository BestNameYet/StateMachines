"""Verify script discovery follows installed files, not a fixed menu."""
import json
from pathlib import Path
import tempfile
import unittest
from runtime.store import DefinitionStore


class CatalogTest(unittest.TestCase):
    def test_new_alias_appears_without_server_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'aliases').mkdir()
            store = DefinitionStore(root)
            self.assertEqual(store.catalog(), [])
            (root / 'scripts/new.v1.json').write_text(json.dumps(
                {'screens': {'START': {}}}))
            entry = {'script': 'new', 'version': 1, 'screen': 'START'}
            (root / 'aliases/new.json').write_text(json.dumps(entry))
            self.assertEqual(store.catalog(), [{'alias': 'new', 'entry': entry}])
            entry['screen'] = 'MISSING'
            (root / 'aliases/new.json').write_text(json.dumps(entry))
            with self.assertRaises(LookupError):
                store.catalog()
