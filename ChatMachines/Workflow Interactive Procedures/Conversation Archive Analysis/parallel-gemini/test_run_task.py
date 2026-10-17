import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runner', Path(__file__).with_name('run_task.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class Tests(unittest.TestCase):
    def test_text_assignment_boundaries_and_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'one').mkdir()
            (root / 'one' / 'a.txt').write_text('original source')
            (root / 'outside.txt').write_text('not assigned')
            files = runner.collect(root, 'one', 1000)
            self.assertEqual([f['path'] for f in files], ['one/a.txt'])
            self.assertEqual(len(files[0]['sha256']), 64)
            with self.assertRaises(ValueError):
                runner.collect(root, '../escape', 1000)
            with self.assertRaises(ValueError):
                runner.collect(root, 'one', 1)

    def test_image_mime_uses_content_signature_not_extension(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            misnamed = root / 'camera-export.PNG'
            misnamed.write_bytes(b'\xff\xd8\xff' + b'jpeg bytes with a misleading extension')
            files = runner.collect(root, 'camera-export.PNG', 1000)
            self.assertEqual(files[0]['mime_type'], 'image/jpeg')

    def test_image_assignment_sends_multimodal_data_and_manifest_without_bytes(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key'}):
            root = Path(temp)
            image = root / 'conversation.png'
            image.write_bytes(b'\x89PNG\r\n\x1a\n' + b'png sample bytes')
            seen = {}

            def model(prompt, key, model, images=None):
                seen.update(prompt=prompt, key=key, images=images)
                return '{"image":"conversation.png","messages":[],"unreadable_regions":[]}', {'finishReason': 'STOP'}

            out = root / 'out'
            result = runner.run(root, 'conversation.png', 'Extract messages and authors', out, request_fn=model)
            self.assertEqual(result['status'], 'completed')
            self.assertIn('image/png', seen['prompt'])
            self.assertEqual(base64.b64decode(seen['images'][0]['inline_data']), b'\x89PNG\r\n\x1a\n' + b'png sample bytes')
            manifest = (out / 'source-manifest.json').read_text()
            self.assertIn('sha256', manifest)
            self.assertNotIn('inline_data', manifest)

    def test_rejects_malformed_image_extraction_json(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key'}):
            root = Path(temp)
            (root / 'conversation.jpg').write_bytes(b'\xff\xd8\xff' + b'jpg sample bytes')
            def model(*args, **kwargs):
                return 'not json', {'finishReason': 'STOP'}
            with self.assertRaisesRegex(RuntimeError, 'not valid JSON'):
                runner.run(root, 'conversation.jpg', 'Extract', root / 'out', request_fn=model)

    def test_api_contract_and_incomplete_output(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self):
                return json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 'answer'}]}}]}).encode()

        image_bytes = b'fake-png-bytes'
        def opener(request, timeout):
            self.assertEqual(request.get_header('X-goog-api-key'), 'test-key')
            payload = json.loads(request.data)
            self.assertEqual(payload['generationConfig']['responseMimeType'], 'application/json')
            image = payload['contents'][0]['parts'][1]['inline_data']
            self.assertEqual(image['mime_type'], 'image/png')
            self.assertEqual(base64.b64decode(image['data']), image_bytes)
            return Response()

        encoded = base64.b64encode(image_bytes).decode('ascii')
        self.assertEqual(runner.call('prompt', 'test-key', 'test-model', opener,
                                     images=[{'mime_type': 'image/png', 'inline_data': encoded}])[0], 'answer')

        class Truncated(Response):
            def read(self):
                return json.dumps({'candidates': [{'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': 'partial'}]}}]}).encode()
        with self.assertRaises(RuntimeError):
            runner.call('prompt', 'key', 'model', lambda *a, **k: Truncated())

    def test_response_and_failure_are_saved_without_key(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'GEMINI_API_KEY': 'fake-secret'}):
            root = Path(temp)
            (root / 'a.txt').write_text('source')

            def model(prompt, key, model):
                self.assertIn('source', prompt)
                self.assertEqual(key, 'fake-secret')
                return 'a.txt:1 — finding', {'finishReason': 'STOP'}

            out = root / 'out'
            runner.run(root, 'a.txt', 'Analyze', out, request_fn=model)
            self.assertEqual(json.loads((out / 'result.json').read_text())['status'], 'completed')
            self.assertNotIn('fake-secret', ''.join(p.read_text() for p in out.iterdir()))

            def fail(*args):
                raise RuntimeError('failed fake-secret')
            with self.assertRaises(RuntimeError):
                runner.run(root, 'a.txt', 'Analyze', out, request_fn=fail)
            self.assertEqual(json.loads((out / 'result.json').read_text())['status'], 'failed')
            self.assertNotIn('fake-secret', (out / 'result.json').read_text())

    def test_workers_overlap_and_keep_outputs_separate(self):
        from concurrent.futures import ThreadPoolExecutor
        import threading
        barrier = threading.Barrier(2)
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key'}):
            root = Path(temp)
            (root / 'a.txt').write_text('source a')
            (root / 'b.txt').write_text('source b')

            def model(prompt, *args):
                barrier.wait(timeout=5)
                return ('answer a' if 'source a' in prompt else 'answer b'), {'finishReason': 'STOP'}

            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(runner.run, root, name, 'Analyze', root / ('out-' + name), 1000, model)
                           for name in ['a.txt', 'b.txt']]
                self.assertTrue(all(f.result()['status'] == 'completed' for f in futures))
            self.assertEqual((root / 'out-a.txt' / 'response.txt').read_text(), 'answer a')
            self.assertEqual((root / 'out-b.txt' / 'response.txt').read_text(), 'answer b')


if __name__ == '__main__':
    unittest.main()
