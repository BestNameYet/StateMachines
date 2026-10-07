import pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'scripts'))
import server_integration as api
class MISQueryTests(unittest.TestCase):
    def test_public_query(self):
        r=api.retrieve_context('replace complete contents of known GitHub file and commit')
        self.assertEqual(r['status'],'ok'); self.assertEqual(len(r['matches']),52)
        self.assertEqual(r['matches'][0]['id'],'action.github.update-known-file')
        self.assertEqual([x['rank'] for x in r['matches']],list(range(1,53)))
        self.assertEqual([x['k'] for x in r['matches']],sorted((x['k'] for x in r['matches']),reverse=True))
    def test_retrieval_is_event_zero_and_context_is_injected(self):
        out=api.controller_start('replace a known GitHub file with supplied content and commit it')
        tx=out['transaction_id']; rec=api.controller_receipt(tx)
        self.assertEqual(rec['events'][0]['event'],'kb_retrieval'); self.assertEqual(rec['status']['retrieval_match_count'],52); self.assertIn('solver_guidance',out['instruction'])
        self.assertFalse(rec['retrieval']['matches'][0]['may_support_world_claims'])
    def test_end_to_end_without_external_evidence(self):
        out=api.controller_start('create a local marker file with exact contents'); tx=out['transaction_id']
        out=api.controller_respond(tx,{'q1':['What exact path and contents are required?']})
        self.assertEqual(out['return_schema'],{'answer':'<answer>'})
        out=api.controller_respond(tx,{'answer':'Use the requested target path and exact contents.'})
        self.assertIn('inquiry_plan',out['return_schema'])
        out=api.controller_respond(tx,{'inquiry_plan':{'external_evidence_needed':False,'requirements':[]}})
        self.assertEqual(out['return_schema'],{'script':'<script>'}); self.assertIn('external_evidence',out['instruction'])
        out=api.controller_respond(tx,{'script':'Write exact contents, verify native receipt, stop.'})
        self.assertTrue(out['complete'])

    def test_external_evidence_is_required_and_separated(self):
        out=api.controller_start('report the current official release of Example Product'); tx=out['transaction_id']
        out=api.controller_respond(tx,{'q1':[]})
        requirement={
            'id':'release','claim_needed':'current official release','preferred_sources':['official release page'],
            'freshness':'current','acquisition_method':'web','required':True,
        }
        out=api.controller_respond(tx,{'inquiry_plan':{'external_evidence_needed':True,'requirements':[requirement]}})
        self.assertEqual(api.controller_status(tx)['phase'],'await_evidence')
        evidence={
            'id':'ev-1','requirement_ids':['release'],'source_type':'official_web',
            'locator':'https://example.test/releases','retrieved_at':'2026-08-31T00:00:00Z',
            'content':'The official page identifies release 4.2 as current.',
        }
        out=api.controller_respond(tx,{'evidence':[evidence],'unresolved':[]})
        self.assertEqual(out['return_schema'],{'script':'<script>'})
        self.assertIn('solver_guidance may govern methods',out['instruction'])
        rec=api.controller_receipt(tx)
        self.assertEqual(rec['external_evidence'][0]['id'],'ev-1')
        self.assertEqual(rec['status']['external_evidence_count'],1)

    def test_solver_kb_cannot_be_submitted_as_world_evidence(self):
        out=api.controller_start('determine a current external fact'); tx=out['transaction_id']
        api.controller_respond(tx,{'q1':[]})
        requirement={
            'id':'fact','claim_needed':'current fact','preferred_sources':['primary source'],
            'freshness':'current','acquisition_method':'web','required':True,
        }
        api.controller_respond(tx,{'inquiry_plan':{'external_evidence_needed':True,'requirements':[requirement]}})
        with self.assertRaisesRegex(ValueError,'cannot be submitted'):
            api.controller_respond(tx,{'evidence':[{
                'id':'bad','requirement_ids':['fact'],'source_type':'solver_kb','locator':'kb:record',
                'retrieved_at':'2026-08-31T00:00:00Z','content':'internal guidance',
            }],'unresolved':[]})
