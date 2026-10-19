"""Reproduce AI context checks for IX–X; independent human review is pending."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline.project import read_json,write_json
from pipeline.sources import ROOT
CHECKS={9:('p00023','Both describe Candide saddling the three horses and the three travellers covering thirty miles together.'),10:('p00020','Both describe the travellers discussing poor Pangloss’s philosophy during the voyage.')}
for n,(pid,note) in CHECKS.items():
 project=ROOT/f'corpus/candide-{n:02}';data=read_json(project/'data/candidates/dataset.json')
 p=next(p for p in data['passages'] if p['id']==pid)
 assert not p['diagnostics'] and len(p['en_sentence_ids'])==len(p['fr_sentence_ids'])==1
 sentence={'id':f'checked-{n}-{pid}-sentence','passage_id':pid,'en_sentence_ids':p['en_sentence_ids'],'fr_sentence_ids':p['fr_sentence_ids'],'source_text':p['en']['text'],'target_text':p['fr']['text'],'min_stage':4,'check_origin':'ai_context_check','checked':'2026-10-18','source':'https://www.gutenberg.org/ebooks/4650','note':note}
 write_json(project/'data/evidence/supplement.json',{'schema_version':1,'base_fingerprint':data['fingerprint'],'entries':[],'sentences':[sentence]})
