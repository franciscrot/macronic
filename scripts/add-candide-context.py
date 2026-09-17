"""Reproduce the occurrence-specific AI context checks for Chapters V–VI.
These checks do not represent independent human review.
"""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline.project import read_json,write_json
from pipeline.sources import ROOT
CHECKS={
5:[
('p00002-l0001','other','autre','adjective',3,'Both qualify the other half of the passengers, contrasting with the first half.'),
('p00021-l0006','new','nouveau','adjective',3,'Both qualify a thing as new; the negative remains in the surrounding English sentence.'),
('p00029-l0001','little','petit','adjective',3,'Both describe the same little man, the Inquisition official.'),
('p00032-l0009','absolute','absolu','adjective',4,'Both qualify necessity as absolute in Pangloss’s philosophical claim.'),
('p00005-l0030','perish','périr','verb',3,'Both are simple infinitives referring to Jacques being left to die; no tense, auxiliary or negation is replaced.'),
('p00016-l0006','find','trouver','verb',4,'Both are infinitives of purpose: the sailor faces death in order to find money. The English to is retained.'),
],
6:[
('p00001-l0053','great','grand','adjective',3,'Both qualify the ceremony as great/grand; the French feminine form agrees with cérémonie in its source.'),
('p00006-l0022','possible','possible','adjective',3,'Both qualify worlds as possible. French plural possibles is kept from the source.'),
('p00007-l0015','dear','cher','adjective',3,'Both directly address Pangloss as dear, with masculine cher in the source.'),
('p00009-l0002','dear','cher','adjective',4,'Both directly address the Anabaptist as dear; this is a separate occurrence from Pangloss.'),
('p00001-l0019','prevent','prévenir','verb',3,'Both infinitives mean avert the total ruin following the earthquake; prévenir is not used in the warn sense here.'),
('p00001-l0023','give','donner','verb',4,'Both infinitives describe giving the people an auto-da-fé. The same giver and recipients are understood.'),
]}
SENTENCES={5:('p00025','Both report Candide losing consciousness and Pangloss obtaining water for him from a nearby fountain.'),6:('p00004','Both report Candide being whipped during singing, the Biscayner and Portuguese men being burnt, and Pangloss being hanged contrary to custom.')}
REJECTIONS={5:[{'link_id':'p00005-l0034','reason':'look/regarder has a different prepositional frame; replacing look alone would leave regarder at him.'},{'link_id':'p00007-l0002','reason':'jump/se jeter is reflexive and multiword; a single-word substitution would conceal that construction.'},{'link_id':'p00016-l0024','reason':'good is part of good-natured and bonne belongs to bonne volonté; do not split either expression.'}],6:[{'link_id':'p00006-l0002','reason':'amazed and desperate compete for éperdu; retain both in English.'},{'link_id':'p00008-l0001','reason':'greatest corresponds to plus grand; do not replace a superlative with a lone positive adjective.'},{'link_id':'p00004-l0020','reason':'eat/manger is plausible but has no matching entry in the extracted dictionary; leave English under the selected evidence rule.'}]}
for n,checks in CHECKS.items():
    project=ROOT/f'corpus/candide-{n:02}';data=read_json(project/'data/candidates/dataset.json');dictionary=read_json(project/'data/evidence/dictionary.json');entries=[]
    for link_id,en,fr,kind,stage,note in checks:
        p=next(p for p in data['passages'] if any(l['id']==link_id for l in p['links']));link=next(l for l in p['links'] if l['id']==link_id)
        e=next(t for t in p['en']['tokens'] if t['id']==link['en'][0]);f=next(t for t in p['fr']['tokens'] if t['id']==link['fr'][0])
        assert (e['lemma'],f['lemma'])==(en,fr) and not p['diagnostics']
        refs=[x['id'] for x in dictionary['entries'] if x['en']==en and fr in x['fr']];assert refs
        entries.append({'id':f'checked-{n}-{link_id}','link_id':link_id,'en':en,'fr':[fr],'kind':kind,'min_stage':stage,'check_origin':'ai_context_check','checked':'2026-09-17','source':dictionary['source'],'dictionary_refs':refs,'note':note})
    pid,note=SENTENCES[n];p=next(p for p in data['passages'] if p['id']==pid)
    assert not p['diagnostics'] and len(p['en_sentence_ids'])==len(p['fr_sentence_ids'])==1
    sentence={'id':f'checked-{n}-{pid}-sentence','passage_id':pid,'en_sentence_ids':p['en_sentence_ids'],'fr_sentence_ids':p['fr_sentence_ids'],'source_text':p['en']['text'],'target_text':p['fr']['text'],'min_stage':4,'check_origin':'ai_context_check','checked':'2026-09-17','source':'https://www.gutenberg.org/ebooks/4650','note':note}
    write_json(project/'data/evidence/supplement.json',{'schema_version':1,'base_fingerprint':data['fingerprint'],'entries':entries,'sentences':[sentence]})
    write_json(project/'data/evidence/context-review.json',{'schema_version':1,'base_fingerprint':data['fingerprint'],'check_origin':'ai_context_check','checked':'2026-09-17','scope':'Selected adjective/infinitive occurrences and one complete sentence; not an independent accuracy evaluation. Baseline noun candidates inspected in their paragraph context.','excluded_examples':REJECTIONS[n]})
    print('Recorded context evidence:',n)
