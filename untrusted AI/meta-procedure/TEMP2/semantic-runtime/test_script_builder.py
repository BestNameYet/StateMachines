"""Exercise creator inputs, verification, publication, and resulting runtime."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from runtime.runner import Runner
from runtime.store import DefinitionStore
from runtime.token_codec import decode
from runtime.script_validation import validate_script


class BuilderTest(unittest.TestCase):
    """Use an isolated definition store; never publish test scripts live."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'definitions'
        shutil.copytree('definitions', self.root)
        self.store = DefinitionStore(self.root)
        self.runner = Runner(self.store)
        self.result = self.runner.transaction({'alias':'script-builder'})

    def send(self, response):
        """Submit one creator response and retain the latest state."""
        self.result = self.runner.transaction(self.result['in_token'], response)
        return self.result

    def field(self, value):
        """Enter a value, require verification, and approve it."""
        self.send(value)
        self.assertEqual(decode(self.result['in_token'])['screen'], 'VERIFY')
        self.send('APPROVE')

    def configure(self):
        """Walk from entry selection through all screen configurations."""
        self.send('BEGIN')
        self.field('created-test')
        self.field('1')
        self.field('Test storyboard')
        self.field('["FIRST","SECOND"]')
        self.field('SECOND')
        self.field(json.dumps({'text':'Hello {name}', 'bindings':{'name':'Ada'}, 'blurb':'Screen two'}))
        self.field(json.dumps({'text':'Screen one', 'bindings':{}}))
        self.field(json.dumps({'text':'All done', 'bindings':{}}))
        self.assertEqual(decode(self.result['in_token'])['screen'], 'REVIEW')

    def test_publish_and_run(self):
        self.configure()
        path = self.root / 'scripts' / 'created-test.v1.json'
        self.assertFalse(path.exists(), 'Rendering SAVE must not publish a preview')
        self.send('SAVE')
        self.assertEqual(self.result['status'], 'TERMINAL')
        script = self.store.script('created-test', 1)
        self.assertEqual(script['entry'], 'SECOND')
        self.assertEqual(script['screens']['SECOND']['transitions'], {'CONTINUE':'FIRST'})
        start = {'script':script['id'],'version':1,'screen':script['entry'],'bindings':{},'step':0,'terminal':2}
        from runtime.token_codec import encode
        running = self.runner.transaction(encode(start))
        self.assertEqual(running['render'], 'Screen two\n\nHello Ada')
        running = self.runner.transaction(running['in_token'], 'CONTINUE')
        self.assertEqual(running['render'], 'Screen one')
        running = self.runner.transaction(running['in_token'], 'CONTINUE')
        self.assertEqual(running['render'], 'All done')
        self.assertEqual(running['status'], 'TERMINAL')
        self.runner.transaction(self.result['in_token'])  # identical publication retry
        self.assertEqual(self.store.script('created-test', 1), script)

    def test_cancel_exit_and_invalid_input(self):
        self.send('BEGIN')
        before = self.result['in_token']
        with self.assertRaises(ValueError):
            self.send('../bad')
        self.assertEqual(self.result['in_token'], before)
        self.send('good-name')
        self.send('CANCEL')
        self.assertEqual(decode(self.result['in_token'])['screen'], 'ID')
        self.field('better-name')
        with self.assertRaises(ValueError):
            self.send('true')
        self.send('EXIT')
        self.assertEqual(self.result['status'], 'TERMINAL')
        self.assertFalse((self.root / 'scripts' / 'better-name.v1.json').exists())

    def test_binding_validation_and_immutable_versions(self):
        self.configure()
        self.send('SAVE')
        original = self.store.script('created-test', 1)
        changed = json.loads(json.dumps(original))
        changed['screens']['SECOND']['text'] = 'Changed'
        with self.assertRaises(ValueError):
            self.store.publish_script(changed)
        bad = json.loads(json.dumps(original))
        bad['version'] = 2
        bad['screens']['SECOND']['text'] = '{missing}'
        with self.assertRaises(ValueError):
            validate_script(bad)
        bad['screens']['SECOND']['text'] = 'valid'
        bad['screens']['SECOND']['transitions'] = {'CONTINUE':'ABSENT'}
        with self.assertRaises(ValueError):
            validate_script(bad)
        self.assertEqual(self.store.script('created-test', 1), original)

    def test_reference_bundle_and_resume_token(self):
        from runtime.script_builder import bundle
        screens = bundle([{'id':'IMPORTED','script':'demo','version':1,'screen':'START'}], self.store)
        self.assertIn('persistent virtual terminal', screens['IMPORTED']['text'])
        self.assertIn('FINAL_SUCCESS', screens)
        with self.assertRaises(ValueError):
            bundle(['SAME','SAME'], self.store)
        with self.assertRaises(ValueError):
            bundle([{'id':'IMPORTED','script':'demo','version':'../bad','screen':'START'}], self.store)
        self.send('BEGIN')
        self.field('resumed-script')
        resumed = Runner(self.store).transaction(self.result['in_token'])
        self.assertEqual(resumed['in_token'], self.result['in_token'])
        self.assertIn('positive integer', resumed['render'])


if __name__ == '__main__':
    unittest.main()
