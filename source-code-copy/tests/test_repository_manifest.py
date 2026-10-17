import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('indexer', Path(__file__).parents[1] / 'scripts/update_repository_manifest.py')
indexer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(indexer)


class ManifestTests(unittest.TestCase):
    def test_recursive_inventory_preserves_semantic_content_and_updates_links(self):
        old = {'schema_version': 1, 'entries': [
            {'path': 'a', 'description': 'Semantic Operator description', 'annotation': 'keep'},
            {'path': 'removed.txt', 'description': 'removed'},
        ]}
        paths = ['README.md', '.github/workflows/index.yml', 'a/README.md', 'a/nested space/ReadMe_BUILD.md', 'a/file.txt']
        manifest, readmes = indexer.build_manifest(paths, old)
        entries = {e['path']: e for e in manifest['entries']}
        self.assertEqual(set(entries), set(paths) | {'.', '.github', '.github/workflows', 'a', 'a/nested space'})
        self.assertEqual(entries['a']['description'], 'Semantic Operator description')
        self.assertEqual(entries['a']['annotation'], 'keep')
        self.assertEqual(entries['a']['readmes'][0]['path'], 'a/README.md')
        self.assertEqual(entries['a/nested space']['readmes'][0]['href'], './a/nested%20space/ReadMe_BUILD.md')
        self.assertEqual(entries['a/file.txt']['description'], '')
        self.assertEqual(indexer.build_manifest(paths, manifest)[0], manifest)
        source = 'Keep intro\n' + indexer.START + '\nold\n' + indexer.END + '\nKeep footer\n'
        rendered = indexer.update_readme(source, readmes)
        self.assertTrue(rendered.startswith('Keep intro\n'))
        self.assertTrue(rendered.endswith('\nKeep footer\n'))
        self.assertNotIn('[README.md]', rendered)
        self.assertIn('./a/nested%20space/ReadMe_BUILD.md', rendered)
        self.assertEqual(indexer.update_readme(rendered, readmes), rendered)

    def test_invalid_inputs_fail_instead_of_erasing_descriptions(self):
        with self.assertRaises(ValueError):
            indexer.build_manifest([], {'schema_version': 1, 'entries': [{'path': 'a', 'description': None}]})
        with self.assertRaises(ValueError):
            indexer.update_readme('No generated region', [])


if __name__ == '__main__':
    unittest.main()
