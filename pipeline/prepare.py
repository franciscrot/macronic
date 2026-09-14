"""Bertalign + SimAlign preparation. No projection or online language detection."""
import argparse, collections, hashlib, json, os, time
from pathlib import Path
from .sources import ROOT, digest, write, extract, source_parts
from .fingerprints import inference_fingerprint

def segment(paragraphs, nlp, lang):
    sentences=[]
    for p in paragraphs:
        # Same-length spaces for line wrapping: exact offsets still address p.text.
        doc=nlp(p['text'].replace('\n',' '))
        for sent in doc.sents:
            a,b=sent.start_char,sent.end_char
            while a<b and p['text'][a].isspace():a+=1
            while b>a and p['text'][b-1].isspace():b-=1
            if a==b:continue
            sentences.append({'id':f'{lang}-s{len(sentences)+1:03}','paragraph_id':p['id'],'text':p['text'][a:b], 'source_start':p['source_start']+a,'source_end':p['source_start']+b})
    return sentences

def align_passages(en,fr,encoder,max_align=5):
    import numpy as np
    from .vendor import bertalign_core as c
    def embed(sents):
        lines=[]
        for n in range(1,max_align):
            lines += ['PAD']*min(n-1,len(sents)) + [' '.join(s['text'].replace('\n',' ') for s in sents[i:i+n]) for i in range(len(sents)-n+1)]
        lengths=[len(encoder.tokenizer(x)['input_ids']) for x in lines]
        if max(lengths)>encoder.max_seq_length:
            raise ValueError(f'Bertalign overlap exceeds model limit: {max(lengths)} > {encoder.max_seq_length}; reduce overlap size explicitly')
        v=encoder.encode(lines,batch_size=8,show_progress_bar=True,normalize_embeddings=True).astype('float32')
        return v.reshape(max_align-1,len(sents),-1),np.array([len(x.encode()) for x in lines]).reshape(max_align-1,len(sents))
    sv,sl=embed(en);tv,tl=embed(fr)
    D,I=c.find_top_k_sents(sv[0],tv[0],k=min(3,len(fr)))
    at=c.get_alignment_types(2);w,path=c.find_first_search_path(len(en),len(fr))
    ptr=c.first_pass_align(len(en),len(fr),w,path,at,D,I)
    first=c.first_back_track(len(en),len(fr),ptr,path,at)
    at=c.get_alignment_types(max_align);w,path=c.find_second_search_path(first,5,len(en),len(fr))
    ptr=c.second_pass_align(sv,tv,sl,tl,w,path,at,float(sl[0].sum()/tl[0].sum()),-0.1,margin=True,len_penalty=True)
    groups=c.second_back_track(len(en),len(fr),ptr,path,at)
    return groups,sv,tv

def annotate(text,nlp,prefix):
    return [{'id':f'{prefix}-t{i:03}','index':i,'start':t.idx,'end':t.idx+len(t.text),'surface':text[t.idx:t.idx+len(t.text)], 'lemma':t.lemma_.lower(),'upos':t.pos_,'morph':t.morph.to_dict(),'dep':t.dep_,'head':t.head.i,'is_word':t.is_alpha} for i,t in enumerate(nlp(text.replace('\n',' '))) if not t.is_space]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--max-align',type=int,default=5);parser.add_argument('--apply-boundaries',action='store_true');args=parser.parse_args()
    os.environ['TOKENIZERS_PARALLELISM']='false'
    import torch,spacy
    from sentence_transformers import SentenceTransformer
    from huggingface_hub import snapshot_download
    from simalign import SentenceAligner
    torch.set_num_threads(4)
    old_path=ROOT/'data/candidates/dataset.json'
    old=json.loads(old_path.read_text()) if old_path.exists() else None
    corrections_path=ROOT/'data/reviewed/corrections.json'
    corrections=json.loads(corrections_path.read_text()) if corrections_path.exists() else None
    start=time.time();texts=extract();nlps={l:spacy.load(n) for l,n in [('en','en_core_web_sm'),('fr','fr_core_news_sm')]}
    for nlp in nlps.values(): nlp.add_pipe('sentencizer', config={'overwrite':True}, last=True)
    sents={l:segment(texts[l],nlps[l],l) for l in texts}
    write('data/samples/sentences.json',{'schema_version':1,'languages':sents})
    revisions=json.loads((ROOT/'pipeline/models.json').read_text())
    labse=snapshot_download('sentence-transformers/LaBSE',revision=revisions['sentence-transformers/LaBSE'],local_files_only=True)
    encoder=SentenceTransformer(labse,device='cpu');encoder.max_seq_length=512
    groups,sv,tv=align_passages(sents['en'],sents['fr'],encoder,args.max_align)
    raw_groups=[{'en':[int(i) for i in a],'fr':[int(i) for i in b]} for a,b in groups]
    write('data/candidates/bertalign.json',{'schema_version':1,'groups':raw_groups})
    if args.apply_boundaries:
        from .corrections import apply_groups
        if old is None or corrections is None:raise ValueError('No existing data/corrections')
        raw_groups=apply_groups(raw_groups,old,corrections,sents)
        if any(max(len(g['en']),len(g['fr']))>=args.max_align for g in raw_groups):raise ValueError('Boundary group exceeds max-align overlap window; rerun with a larger --max-align')
    # Release LaBSE before loading mBERT to reduce memory requirements.
    del encoder
    mbert=snapshot_download('google-bert/bert-base-multilingual-cased',revision=revisions['google-bert/bert-base-multilingual-cased'],local_files_only=True)
    aligner=SentenceAligner(model=mbert,token_type='bpe',matching_methods='a',device='cpu')
    passages=[]
    for i,g in enumerate(raw_groups):
        p={'id':f'p{i+1:03}','en_sentence_ids':[sents['en'][x]['id'] for x in g['en']], 'fr_sentence_ids':[sents['fr'][x]['id'] for x in g['fr']], 'diagnostics':[]}
        for l in ['en','fr']:
            selected=[sents[l][x] for x in g[l]]
            if selected:
                # Preserve source text and paragraph gaps inside each group.
                source=(ROOT/'data/sources'/('pg19942.txt' if l=='en' else 'pg4650.txt')).read_text()
                parts=source_parts(selected)
                text='\n\n'.join(source[x['start']:x['end']] for x in parts)
                p[l]={'text':text,'tokens':annotate(text,nlps[l],p['id']+'-'+l),'paragraph_id':selected[0]['paragraph_id'],'source_parts':parts}
            else:p[l]={'text':'','tokens':[],'paragraph_id':None}
        if not g['en'] or not g['fr']:
            p['similarity']=None;p['diagnostics'].append('unmatched');p['links']=[]
        else:
            a,b=g['en'],g['fr'];p['similarity']=round(float(sv[len(a)-1,a[-1]] @ tv[len(b)-1,b[-1]]),6)
            if p['similarity']<0.70:p['diagnostics'].append('low_passage_similarity')
            if len(a)+len(b)>3:p['diagnostics'].append('large_group')
            words=[[t['surface'] for t in p[l]['tokens']] for l in ['en','fr']]
            lengths=[len(aligner.embed_loader.tokenizer(w,is_split_into_words=True)['input_ids']) for w in words]
            if max(lengths)>512:
                p['diagnostics'].append('word_model_limit');p['links']=[]
            else:
                edges=aligner.get_word_aligns(*words)['inter']
                p['links']=[{'id':f'{p["id"]}-l{j:03}','en':[p['en']['tokens'][a]['id']],'fr':[p['fr']['tokens'][b]['id']],'method':'simalign.inter'} for j,(a,b) in enumerate(edges)]
        passages.append(p)
        print(p['id'],len(g['en']),len(g['fr']),p['similarity'],len(p['links']),flush=True)
    policy=json.loads((ROOT/'data/evidence/policy.json').read_text())
    manifest={'schema_version':1,'bertalign_commit':'df8c63f51aa203faed9f2fe45ae39e6fca75e667','models':revisions,'max_align':args.max_align,'device':'cpu','threads':4,'simalign':{'method':'inter','layer':8,'token_type':'bpe','distortion':0},'spacy_models':{l:nlps[l].meta['version'] for l in nlps},'source_hashes':{x['language']:x['sha256'] for x in json.loads((ROOT/'data/sources/provenance.json').read_text())['sources']},'seconds':round(time.time()-start,2)}
    manifest['pipeline_hash']=inference_fingerprint()
    manifest['policy_hash']=digest(json.dumps(policy,sort_keys=True))
    write('data/candidates/run.json',manifest)
    dataset={'schema_version':1,'inference_fingerprint':inference_fingerprint(),'model_revisions':revisions,'passages':passages}
    dataset['fingerprint']=digest(json.dumps(dataset,ensure_ascii=False,sort_keys=True,separators=(',',':')))
    write('data/candidates/dataset.json',dataset)
    if old is not None and corrections is not None:
        write('data/reviewed/history/'+old['fingerprint']+'.json',corrections)
        from .corrections import rebase
        # Model/policy changes require fresh decisions; don't silently rebase those.
        if args.apply_boundaries:
            rebased,invalid=rebase(old,dataset,corrections)
        else:
            rebased={'schema_version':1,'base_fingerprint':dataset['fingerprint'],'operations':[]}
            invalid=corrections['operations'] if old['fingerprint']!=dataset['fingerprint'] else []
            if not invalid:rebased['operations']=corrections['operations']
        write('data/reviewed/corrections.json',rebased)
        write('data/reviewed/invalidated.json',{'schema_version':1,'operations':invalid})
    else:write('data/reviewed/corrections.json',{'schema_version':1,'base_fingerprint':dataset['fingerprint'],'operations':[]})
if __name__=='__main__':main()
