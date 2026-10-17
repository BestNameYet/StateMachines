import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
from run import documents_for, load_documents, run
from collections import Counter

CONFIG = json.loads(Path(__file__).with_name("config.json").read_text())

class PipelineTests(unittest.TestCase):
    def test_branch_nodes_once_and_nontext_excluded(self):
        c={"id":"c","mapping":{"a":{"parent":None,"message":{"id":"m","author":{"role":"user"},"content":{"parts":["one two three four five six",{"content_type":"image_asset_pointer","asset_pointer":"secret"}]}}},"b":{"parent":"a","message":{"id":"m","author":{"role":"assistant"},"content":{"parts":["seven eight nine ten eleven twelve"]}}},"c":{"parent":"a","message":{"author":{"role":"tool"},"content":{"parts":["tool text must be excluded"]}}}}}
        counters=Counter()
        docs=list(documents_for(c,"source",0,{"roles":["user","assistant"],"min_words":1,"max_words_per_document":3},counters))
        self.assertEqual(len(docs),4)
        self.assertEqual(len({d["document_id"] for d in docs}),4)
        self.assertEqual(counters["excluded_role:tool"],1)
        self.assertEqual(counters["non_text_parts"],1)
        self.assertNotIn("secret"," ".join(d["text"] for d in docs))
        self.assertEqual([d["parent_node_id"] for d in docs], [None,None,"a","a"])

    def test_end_to_end_and_checksum_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            texts=["orchard apple pear fruit harvest", "apple orchard fruit tree harvest",
                   "pear fruit apple orchard garden","engine wheel brake vehicle repair",
                   "vehicle engine brake wheel garage","repair garage engine vehicle wheel"]
            records=[{"id":str(i),"mapping":{"node":{"parent":None,"message":{"id":"message","author":{"role":"user"},"content":{"parts":[text]}}}}} for i,text in enumerate(texts)]
            raw=json.dumps(records).encode()
            (root/"bin.json").write_bytes(raw)
            manifest={"conversation_count":len(records),"bins":[{"output":"bin.json","conversation_count":len(records),"sha256":hashlib.sha256(raw).hexdigest()}]}
            (root/"manifest.json").write_text(json.dumps(manifest))
            cfg=copy.deepcopy(CONFIG);cfg["input"]["manifest"]="manifest.json"
            cfg["tfidf"].update(min_df=1,max_df=1.0)
            cfg["nmf"].update(n_components=2,max_iter=1000)
            run(cfg,root,root/"output")
            report=json.loads((root/"output/report.json").read_text())
            self.assertEqual(report["coverage"]["conversations_seen"],6)
            rows=[json.loads(x) for x in (root/"output/document_topics.jsonl").read_text().splitlines()]
            self.assertEqual(len(rows),6)
            self.assertTrue(all(abs(sum(x["relative_weight"] for x in r["topics"])-1)<1e-8 for r in rows))
            self.assertTrue(all("text" not in r for r in rows))
            terms=[{r["term"] for r in t["keywords"]} for t in json.loads((root/"output/topics.json").read_text())]
            self.assertTrue(any("apple" in t for t in terms))
            self.assertTrue((root/"output/model.joblib").exists())
            (root/"bin.json").write_text("[]")
            with self.assertRaisesRegex(ValueError,"checksum"):
                load_documents(cfg,root)

if __name__=="__main__": unittest.main()
