import json, pathlib, sys, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'scripts'))
import solver_query
class QueryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.kb=solver_query.load_kb()
    def test_record_count(self): self.assertEqual(len(self.kb['records']),40)
    def test_every_record_retrievable_top8_from_own_examples(self):
        bad={}
        for r in self.kb['records']:
            qs=(r.get('retrieval') or {}).get('query_examples',[])
            self.assertTrue(qs,r['id'])
            best=None
            for q in qs:
                got=[x['id'] for x in solver_query.search_knowledge(q,sorted(solver_query.KNOWLEDGE_TYPES),8)['results']]
                rank=got.index(r['id'])+1 if r['id'] in got else None
                if rank is not None and (best is None or rank<best): best=rank
            if best is None or best>8: bad[r['id']]=best
        self.assertFalse(bad,bad)
    def test_builtin_benchmark_recall_at8(self):
        total=hit=0; undes=[]
        for b in self.kb.get('benchmarks',[]):
            got=[x['id'] for x in solver_query.search_knowledge(b['query'],sorted(solver_query.KNOWLEDGE_TYPES),8)['results']]
            for e in b.get('expected',[]): total+=1; hit += int(e in got[:8])
            undes.extend((b['id'],u) for u in b.get('undesired',[]) if u in got[:3])
        self.assertTrue(total)
        self.assertGreaterEqual(hit/total,.90,(hit,total))
        self.assertFalse(undes,undes)
