"""Evaluate explicit reference labels; never turn model outputs into gold labels."""
import argparse,json,subprocess
from .sources import ROOT,write,digest

def main():
    p=argparse.ArgumentParser();p.add_argument('--reference',default='data/evidence/reference.json');args=p.parse_args()
    data=json.loads((ROOT/'data/candidates/dataset.json').read_text());ref=json.loads((ROOT/args.reference).read_text())
    if ref['base_fingerprint']!=data['fingerprint']:raise ValueError('Reference dataset changed; recheck labels')
    groups={(tuple(p['en_sentence_ids']),tuple(p['fr_sentence_ids'])) for p in data['passages']}
    exact=sum((tuple(g['en']),tuple(g['fr'])) in groups for g in ref['passage_groups'])
    subprocess.run(['node','scripts/evaluation.mjs'],cwd=ROOT,check=True)
    counts=json.loads((ROOT/'data/evidence/automatic-counts.json').read_text())
    tp=fp=fn=0;cases=[]
    for item in ref.get('word_cases',[]):
        passage=next(p for p in data['passages'] if p['id']==item['passage_id'])
        actual={tid for l in passage['links'] if item['en'] in l['en'] for tid in l['fr']};expected=set(item['fr'])
        tp+=len(actual&expected);fp+=len(actual-expected);fn+=len(expected-actual)
        cases.append({'en':item['en'],'expected':sorted(expected),'actual':sorted(actual),'correct':actual==expected})
    result={'schema_version':1,'base_fingerprint':data['fingerprint'],'reference_origin':ref['origin'],'independent_human_evaluation':ref['origin']=='human','passage_groups_checked':len(ref['passage_groups']),'exact_group_matches':exact,'word_cases_checked':len(cases),'diagnostic_word_precision':tp/(tp+fp) if tp+fp else None,'diagnostic_word_recall':tp/(tp+fn) if tp+fn else None,'scope':'Only explicitly labelled diagnostic token occurrences; not whole-corpus accuracy or held-out validation','cases':cases,'automatic':counts,'correction_time_per_passage':None,'limitation':'Reference is AI-authored after inspecting the output; not independent, not held out. No human accuracy claim or release approval is implied.' if ref['origin']!='human' else ref.get('limitations','')}
    write('data/evidence/evaluation.json',result)
    print(json.dumps({k:v for k,v in result.items() if k not in ['cases','automatic']},indent=2))
if __name__=='__main__':main()
