import unittest
from pipeline.sources import source_parts
from pipeline.corrections import apply_groups
class PipelineTests(unittest.TestCase):
 def setUp(self):
  self.old={'fingerprint':'x','passages':[{'id':'p1','en_sentence_ids':['e1'],'fr_sentence_ids':['f1']},{'id':'p2','en_sentence_ids':['e2'],'fr_sentence_ids':['f2']}]}
  self.sentences={'en':[{'id':'e1'},{'id':'e2'}],'fr':[{'id':'f1'},{'id':'f2'}]}
  self.c={'base_fingerprint':'x','operations':[{'type':'regroup','passage_ids':['p1','p2'],'groups':[{'en':['e1','e2'],'fr':['f1','f2']}]}]}
 def apply(self):return apply_groups([],self.old,self.c,self.sentences)
 def test_merge(self):self.assertEqual(self.apply(),[{'en':[0,1],'fr':[0,1]}])
 def test_unmatched(self):
  self.c['operations'][0]['groups']=[{'en':['e1','e2'],'fr':[]},{'en':[],'fr':['f1','f2']}]
  self.assertEqual(len(self.apply()),2)
 def test_coverage(self):
  self.c['operations'][0]['groups'][0]['en']=['e2']
  with self.assertRaises(ValueError):self.apply()
 def test_stale(self):
  self.c['base_fingerprint']='stale'
  with self.assertRaises(ValueError):self.apply()
 def test_overlap(self):
  self.c['operations']*=2
  with self.assertRaises(ValueError):self.apply()
 def test_source_parts_skip_footnote_gap(self):
  s=[{'paragraph_id':'a','source_start':0,'source_end':5},{'paragraph_id':'a','source_start':6,'source_end':10},{'paragraph_id':'b','source_start':30,'source_end':40}]
  self.assertEqual(source_parts(s),[{'paragraph_id':'a','start':0,'end':10},{'paragraph_id':'b','start':30,'end':40}])
if __name__=='__main__':unittest.main()
