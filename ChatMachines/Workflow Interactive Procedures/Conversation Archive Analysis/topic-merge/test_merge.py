import unittest
import numpy as np
from merge import cluster_topics, remap_topics

class MergeTests(unittest.TestCase):
    def test_no_transitive_chain_merge(self):
        sim=np.array([[1,.9,.2],[.9,1,.8],[.2,.8,1]])
        self.assertEqual(cluster_topics(sim,[0,1,2],.7),[[0,1],[2]])

    def test_same_partition_kept_separate(self):
        self.assertEqual(cluster_topics(np.ones((3,3)),[0,0,1],.7),[[0,2],[1]])

    def test_remapping_preserves_saved_weight(self):
        result=remap_topics([{"topic_id":0,"relative_weight":.3},{"topic_id":1,"relative_weight":.2}],{0:2,1:2})
        self.assertEqual(result,[{"topic_id":2,"relative_weight":.5}])
        with self.assertRaises(KeyError):
            remap_topics([{"topic_id":9,"relative_weight":.2}],{0:2})

if __name__=="__main__": unittest.main()
