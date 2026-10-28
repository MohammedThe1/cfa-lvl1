"""Checks boundaries using real supplied-page conventions, not financial demo questions."""
import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('transcriber',Path(__file__).parents[1]/'scripts/transcribe-books.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Boundaries(unittest.TestCase):
 def test_cfa_ignores_nested_numbered_rows_and_keeps_multidigit_questions(self):
  records,shared=m.numbered('__PASSAGE__\n1.\t__STEM__\n1. __MATCHING_ROW__\nA.\t__A__\nB.\t__B__\nC.\t__C__\n10.\t__STEM2__\n','curriculum')
  self.assertEqual([q['number'] for q in records],[1,10]);self.assertIn('__MATCHING_ROW__',records[0]['rawText']);self.assertEqual(len(records[0]['optionsCandidate']),3);self.assertEqual(shared,'__PASSAGE__')
 def test_diagram_numbers_do_not_become_questions_and_tab_newline_is_kept(self):
  records,_=m.numbered('1.\t__STEM__\n7.\n__DIAGRAM_LABEL__\n2.\t\n__STEM_TWO__','curriculum')
  self.assertEqual([q['number'] for q in records],[1,2])
 def test_schw_boundary_and_unanswered_remain_for_review(self):
  records,_=m.numbered('1. __STEM__\nA. __A__\nB. __B__\nC. __C__\n2. __OPEN_QUESTION__','schweser')
  self.assertEqual(len(records),2);self.assertEqual(records[1]['optionsCandidate'],[]);self.assertTrue(all(r['status']=='review' for r in records))
if __name__=='__main__':unittest.main()
