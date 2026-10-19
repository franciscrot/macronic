"""Extract bounded chapter projects from the committed Gutenberg snapshots.
Usage: python scripts/extract-candide-chapters.py 5 6
"""
import sys,re,json,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline.project import create_project, write_json
from pipeline.sources import ROOT,digest
ROMANS=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX']
def extract(n):
    if not 2<=n<=29: raise ValueError('Choose chapters 2–29; chapter 30 needs a closing-text boundary.')
    output=ROOT/f'corpus/candide-{n:02}'
    provenance=json.loads((ROOT/'data/sources/provenance.json').read_text())['sources']
    records=[]
    with tempfile.TemporaryDirectory() as tmp:
        files={}
        for lang,number in [('en',19942),('fr',4650)]:
            raw=(ROOT/f'data/sources/pg{number}.txt').read_bytes(); full=raw.decode('utf-8').replace('\r\n','\n')
            prefix='CHAPITRE ' if lang=='fr' else ''
            match=re.search(r'\n'+prefix+ROMANS[n-1]+r'\.?\s*\n',full)
            a=match.end(); b=a+re.search(r'\n'+prefix+ROMANS[n]+r'\.?\s*\n',full[a:]).start()
            body=full[a:b];a+=body.index('\n\n')+2;body=full[a:b]
            kept=[];omitted=[]
            for m in re.finditer(r'\S(?:.*?\S)?(?=\n\s*\n|\s*\Z)',body,re.S):
                record={'start':a+m.start(),'end':a+m.end()}
                if re.match(r'\[\d+\]',m.group()):omitted.append(record)
                else:kept.append((m.group(),record))
            text='\n\n'.join(p[0] for p in kept)+'\n';file=Path(tmp)/f'{lang}.txt';file.write_text(text);files[lang]=file
            records.append({'language':lang,'snapshot':f'data/sources/pg{number}.txt','snapshot_sha256':digest(raw),'source_ranges':[p[1] for p in kept],'omitted_note_ranges':omitted,'transforms':['Chapter heading excluded','Standalone numbered editorial notes excluded','Paragraphs joined by two newlines; final newline added; wording retained']})
        bylang={s['language']:s for s in provenance}
        create_project(files['en'],files['fr'],output,title='Candide',english_edition=bylang['en']['edition'],target_edition=bylang['fr']['edition'],english_url=bylang['en']['url'],target_url=bylang['fr']['url'],rights='Source snapshots and full notices retained in data/sources/')
    metadata=json.loads((output/'project.json').read_text());metadata['chapter']='Chapter '+ROMANS[n-1];write_json(output/'project.json',metadata)
    write_json(output/'extraction.json',{'schema_version':1,'sources':records})
    print(output)
if __name__=='__main__':
    for n in sys.argv[1:]:extract(int(n))
