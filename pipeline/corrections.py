"""Boundary overrides preserve sentence coverage; rebase only untouched groups."""
import json
from .sources import ROOT,write

def apply_groups(raw,old,corrections,sentences):
    if corrections['base_fingerprint']!=old['fingerprint']:raise ValueError('Stale correction file')
    groups=[{'en':p['en_sentence_ids'],'fr':p['fr_sentence_ids'],'old_id':p['id']} for p in old['passages']]
    for op in corrections['operations']:
        if op['type']!='regroup':continue
        ids=op['passage_ids'];indices=[i for i,g in enumerate(groups) if g.get('old_id') in ids]
        if len(indices)!=len(ids) or indices!=list(range(indices[0],indices[-1]+1)):raise ValueError('Overlapping/non-adjacent boundary edits; undo and combine them')
        for l in ['en','fr']:
            before=[s for i in indices for s in groups[i][l]];after=[s for g in op['groups'] for s in g[l]]
            if before!=after:raise ValueError('Boundary edit loses or duplicates sentences')
        groups[indices[0]:indices[-1]+1]=op['groups']
    result=[]
    for g in groups:
        result.append({l:[next(i for i,s in enumerate(sentences[l]) if s['id']==sid) for sid in g[l]] for l in ['en','fr']})
    for l in ['en','fr']:
        if [i for g in result for i in g[l]]!=list(range(len(sentences[l]))):raise ValueError('Sentence segmentation changed; boundary overrides are stale')
    return result

def rebase(old,new,corrections):
    result={'schema_version':1,'base_fingerprint':new['fingerprint'],'operations':[]};invalid=[]
    affected={pid for op in corrections['operations'] if op['type']=='regroup' for pid in op['passage_ids']}
    for op in corrections['operations']:
        if op['type']=='regroup':continue
        if old.get('inference_fingerprint')!=new.get('inference_fingerprint'):invalid.append(op);continue
        p=next(p for p in old['passages'] if p['id']==op['passage_id'])
        q=next((q for q in new['passages'] if all(q[l+'_sentence_ids']==p[l+'_sentence_ids'] and q[l]['text']==p[l]['text'] for l in ['en','fr'])),None)
        if p['id'] in affected or not q:invalid.append(op);continue
        # Exact same text, tokens, model results: only IDs may have shifted.
        def strip_ids(tokens):return [{k:v for k,v in t.items() if k!='id'} for t in tokens]
        if any(strip_ids(p[l]['tokens'])!=strip_ids(q[l]['tokens']) for l in ['en','fr']):invalid.append(op);continue
        maps={l:{a['id']:b['id'] for a,b in zip(p[l]['tokens'],q[l]['tokens'])} for l in ['en','fr']}
        edited=json.loads(json.dumps(op));edited['passage_id']=q['id']
        if op['type']=='passage':result['operations'].append(edited);continue
        edited['link']['id']=op['link']['id'] if '-editor-' in op['link']['id'] else op['link']['id'].replace(p['id'],q['id'],1)
        for l in ['en','fr']:edited['link'][l]=[maps[l][x] for x in op['link'][l]]
        result['operations'].append(edited)
    return result,invalid
