import pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'scripts'))
import server_integration as api
class MISQueryTests(unittest.TestCase):
    def test_public_query(self):
        r=api.retrieve_context('replace complete contents of known GitHub file and commit',5)
        self.assertEqual(r['status'],'ok'); self.assertTrue(r['matches']); self.assertEqual(r['matches'][0]['id'],'action.github.update-known-file')
    def test_retrieval_is_event_zero_and_context_is_injected(self):
        out=api.controller_start('replace a known GitHub file with supplied content and commit it')
        tx=out['transaction_id']; rec=api.controller_receipt(tx)
        self.assertEqual(rec['events'][0]['event'],'kb_retrieval'); self.assertGreater(rec['status']['retrieval_match_count'],0); self.assertIn('retrieved_context',out['instruction'])
    def test_end_to_end_protocol(self):
        out=api.controller_start('create a local marker file with exact contents'); tx=out['transaction_id']
        out=api.controller_respond(tx,{'q1':['What exact path and contents are required?']})
        self.assertEqual(out['return_schema'],{'answer':'<answer>'})
        out=api.controller_respond(tx,{'answer':'Use the requested target path and exact contents.'})
        self.assertEqual(out['return_schema'],{'script':'<script>'}); self.assertIn('retrieved_context',out['instruction'])
        out=api.controller_respond(tx,{'script':'Write exact contents, verify native receipt, stop.'})
        self.assertTrue(out['complete'])
