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
    def test_assignment_boundaries_and_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'one').mkdir()
            (root/'one'/'a.txt').write_text('original source')
            (root/'outside.txt').write_text('not assigned')
            files=runner.collect(root,'one',1000)
            self.assertEqual([f['path'] for f in files], ['one/a.txt'])
            self.assertEqual(len(files[0]['sha256']),64)
            with self.assertRaises(ValueError): runner.collect(root,'../escape',1000)
            with self.assertRaises(ValueError): runner.collect(root,'one',1)

    def test_response_and_failure_are_saved_without_key(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'GEMINI_API_KEY':'fake-secret'}):
            root=Path(temp); (root/'a.txt').write_text('source')
            def model(prompt,key,model):
                self.assertIn('source',prompt); self.assertEqual(key,'fake-secret')
                return 'a.txt:1 — finding', {'finishReason':'STOP'}
            out=root/'out'
            runner.run(root,'a.txt','Analyze',out,request_fn=model)
            self.assertEqual(json.loads((out/'result.json').read_text())['status'],'completed')
            self.assertNotIn('fake-secret',''.join(p.read_text() for p in out.iterdir()))
            def fail(*args): raise RuntimeError('failed fake-secret')
            with self.assertRaises(RuntimeError): runner.run(root,'a.txt','Analyze',out,request_fn=fail)
            self.assertEqual(json.loads((out/'result.json').read_text())['status'],'failed')
            self.assertNotIn('fake-secret',(out/'result.json').read_text())

    def test_api_contract_and_incomplete_output(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self): return json.dumps({'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'answer'}]}}]}).encode()
        def opener(request,timeout):
            self.assertEqual(request.get_header('X-goog-api-key'),'test-key')
            self.assertNotIn('test-key',request.full_url)
            return Response()
        self.assertEqual(runner.call('prompt','test-key','test-model',opener)[0],'answer')
        class Truncated(Response):
            def read(self): return json.dumps({'candidates':[{'finishReason':'MAX_TOKENS','content':{'parts':[{'text':'partial'}]}}]}).encode()
        with self.assertRaises(RuntimeError): runner.call('prompt','key','model',lambda *a,**k:Truncated())

class PlanTests(unittest.TestCase):
    def test_plan_assignments_and_concurrency(self):
        spec=importlib.util.spec_from_file_location('plan',Path(__file__).with_name('plan.py'))
        plan=importlib.util.module_from_spec(spec);spec.loader.exec_module(plan)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'a.txt').write_text('a');(root/'b.txt').write_text('b')
            matrix,parallel,instruction=plan.build({'paths':['a.txt','b.txt'],'instruction':'Analyze','maxParallel':2},root)
            self.assertEqual(len(matrix['include']),2);self.assertEqual(parallel,2)
            with self.assertRaises(ValueError):plan.build({'paths':['a.txt','a.txt'],'instruction':'x'},root)
            with self.assertRaises(ValueError):plan.build({'paths':['a.txt'],'instruction':'x','maxParallel':0},root)

    def test_workers_overlap_and_keep_outputs_separate(self):
        from concurrent.futures import ThreadPoolExecutor
        import threading
        barrier=threading.Barrier(2)
        with tempfile.TemporaryDirectory() as temp,patch.dict(os.environ,{'GEMINI_API_KEY':'test-key'}):
            root=Path(temp);(root/'a.txt').write_text('source a');(root/'b.txt').write_text('source b')
            def model(prompt,*args):
                barrier.wait(timeout=5)
                return ('answer a' if 'source a' in prompt else 'answer b'),{'finishReason':'STOP'}
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures=[pool.submit(runner.run,root,name,'Analyze',root/('out-'+name),1000,model) for name in ['a.txt','b.txt']]
                self.assertTrue(all(f.result()['status']=='completed' for f in futures))
            self.assertEqual((root/'out-a.txt'/'response.txt').read_text(),'answer a')
            self.assertEqual((root/'out-b.txt'/'response.txt').read_text(),'answer b')

if __name__=='__main__': unittest.main()
