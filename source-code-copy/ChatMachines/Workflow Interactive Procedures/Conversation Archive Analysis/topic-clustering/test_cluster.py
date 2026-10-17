import unittest
import numpy as np
from cluster import hierarchy, groups_at

class ClusteringTests(unittest.TestCase):
    def test_near_topics_cluster_without_forced_count(self):
        vectors=np.array([[1,0,0],[.99,.01,0],[0,0,1],[0,.01,.99]])
        _,distance,tree=hierarchy(vectors)
        self.assertEqual(groups_at(tree,.1),[[0,1],[2,3]])
        self.assertTrue(np.allclose(distance,distance.T))
        self.assertEqual(sorted(i for g in groups_at(tree,.1) for i in g),list(range(4)))
        self.assertEqual(len(groups_at(tree,1.1)),1)
    def test_bad_vectors_fail(self):
        with self.assertRaises(ValueError): hierarchy(np.array([[0,0],[1,0]]))
        with self.assertRaises(ValueError): hierarchy(np.array([[np.nan,1],[1,0]]))
if __name__=="__main__":unittest.main()
