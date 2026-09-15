"""Project adapter; reuses the pinned pilot's segmentation and alignment functions."""
import json
import os
import time
from .sources import ROOT, digest, source_parts
from .fingerprints import inference_fingerprint
from .prepare import segment, annotate, align_passages
from .project import read_json, write_json, paragraphs


def infer(project, texts, max_align):
    os.environ['TOKENIZERS_PARALLELISM']='false'
    import torch, spacy
    from sentence_transformers import SentenceTransformer
    from huggingface_hub import snapshot_download
    from simalign import SentenceAligner
    torch.set_num_threads(4)
    started=time.time()
    metadata=read_json(project/'project.json')
    names={'en':'en_core_web_sm','fr':'fr_core_news_sm'}
    nlps={l:spacy.load(name) for l,name in names.items()}
    for nlp in nlps.values():
        if nlp.meta['version']!='3.8.0': raise ValueError('Install pinned spaCy 3.8.0 language models')
        nlp.add_pipe('sentencizer',config={'overwrite':True},last=True)
    sentences={l:segment(paragraphs(text,l),nlps[l],l) for l,text in texts.items()}
    if any(not s for s in sentences.values()): raise ValueError('Both inputs must contain sentences')
    write_json(project/'data/samples/sentences.json',{'schema_version':1,'languages':sentences})
    revisions=read_json(ROOT/'pipeline/models.json')
    local=snapshot_download('sentence-transformers/LaBSE',revision=revisions['sentence-transformers/LaBSE'],local_files_only=True)
    encoder=SentenceTransformer(local,device='cpu');encoder.max_seq_length=512
    print('Running Bertalign sentence alignment…',flush=True)
    groups,sv,tv=align_passages(sentences['en'],sentences['fr'],encoder,max_align)
    groups=[{'en':[int(i) for i in a],'fr':[int(i) for i in b]} for a,b in groups]
    for l in ['en','fr']:
        if [i for g in groups for i in g[l]]!=list(range(len(sentences[l]))):
            raise ValueError('Alignment lost or reordered sentences')
    del encoder
    local=snapshot_download('google-bert/bert-base-multilingual-cased',revision=revisions['google-bert/bert-base-multilingual-cased'],local_files_only=True)
    aligner=SentenceAligner(model=local,token_type='bpe',matching_methods='a',device='cpu')
    passages=[]
    for i,g in enumerate(groups):
        p={'id':f'p{i+1:05}','en_sentence_ids':[sentences['en'][x]['id'] for x in g['en']],
           'fr_sentence_ids':[sentences['fr'][x]['id'] for x in g['fr']], 'diagnostics':[], 'links':[], 'similarity':None}
        for l in ['en','fr']:
            selected=[sentences[l][x] for x in g[l]];parts=source_parts(selected)
            text='\n\n'.join(texts[l][x['start']:x['end']] for x in parts)
            p[l]={'text':text,'tokens':annotate(text,nlps[l],p['id']+'-'+l),'paragraph_id':selected[0]['paragraph_id'] if selected else None,'source_parts':parts}
        if not g['en'] or not g['fr']: p['diagnostics'].append('unmatched')
        else:
            a,b=g['en'],g['fr'];p['similarity']=round(float(sv[len(a)-1,a[-1]] @ tv[len(b)-1,b[-1]]),6)
            if p['similarity']<0.70:p['diagnostics'].append('low_passage_similarity')
            if len(a)+len(b)>3:p['diagnostics'].append('large_group')
            words=[[t['surface'] for t in p[l]['tokens']] for l in ['en','fr']]
            if any(not w for w in words) or max(len(aligner.embed_loader.tokenizer(w,is_split_into_words=True)['input_ids']) for w in words)>512:
                p['diagnostics'].append('word_model_limit')
            else:
                edges=sorted(aligner.get_word_aligns(*words)['inter'])
                p['links']=[{'id':f'{p["id"]}-l{j:04}','en':[p['en']['tokens'][a]['id']], 'fr':[p['fr']['tokens'][b]['id']], 'method':'simalign.inter'} for j,(a,b) in enumerate(edges)]
        passages.append(p);print(f'Aligned group {i+1}/{len(groups)}',flush=True)
    adapter_hash=digest(b''.join((ROOT/f).read_bytes() for f in ['pipeline/project.py','pipeline/project_inference.py']))
    provenance=read_json(project/'data/sources/provenance.json')
    dataset={'schema_version':1,'title':metadata['title'],'chapter':metadata['chapter'],'languages':metadata['languages'],
             'inference_fingerprint':inference_fingerprint(),'project_adapter_fingerprint':adapter_hash,
             'model_revisions':revisions,'source_provenance':provenance,'passages':passages}
    dataset['fingerprint']=digest(json.dumps(dataset,ensure_ascii=False,sort_keys=True,separators=(',',':')))
    write_json(project/'data/candidates/dataset.json',dataset)
    write_json(project/'data/candidates/bertalign.json',{'schema_version':1,'groups':groups})
    write_json(project/'data/candidates/run.json',{'schema_version':1,'pipeline_hash':inference_fingerprint(),'project_adapter_hash':adapter_hash,
               'models':revisions,'spacy_models':names,'spacy_model_version':'3.8.0','max_align':max_align,'device':'cpu','threads':4,
               'simalign':{'method':'inter','layer':8,'token_type':'bpe'},'source_provenance':provenance,'seconds':round(time.time()-started,2)})
    write_json(project/'data/reviewed/corrections.json',{'schema_version':1,'base_fingerprint':dataset['fingerprint'],'operations':[]})
    write_json(project/'data/reviewed/release.json',{'status':'pending','note':'No independent human release check'})
    # Reuse lexical entries only. Candide's occurrence-specific checks must never leak into another text.
    import shutil
    for f in ['dictionary.json','freedict-subset.tei','policy.json']:
        target=project/'data/evidence'/f;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/'data/evidence'/f,target)
    write_json(project/'data/evidence/supplement.json',{'schema_version':1,'base_fingerprint':dataset['fingerprint'],'entries':[],'sentences':[]})
