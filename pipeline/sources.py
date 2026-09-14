"""Extract chapter I without guessing sentence correspondences."""
import hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def digest(value):
    return hashlib.sha256(value if isinstance(value,bytes) else value.encode()).hexdigest()
def write(path,value):
    p=ROOT/path; p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def extract():
    metadata=[]; texts={}
    for lang,filename,start,end,edition in [
        ('en','pg19942.txt','In a castle of Westphalia',r'\nII\s*\n','Boni and Liveright, 1918; introduction Philip Littell; translator not identified in ebook'),
        ('fr','pg4650.txt','Il y avait en Vestphalie',r'\nCHAPITRE II\s*\n','Gutenberg 4650, French collected-works transcription with editorial notes')]:
        p=ROOT/'data/sources'/filename; raw=p.read_bytes(); full=raw.decode('utf-8').replace('\r\n','\n')
        a=full.index(start); b=a+re.search(end,full[a:]).start()
        body=full[a:b]; paragraphs=[]
        for m in re.finditer(r'\S(?:.*?\S)?(?=\n\s*\n|\Z)',body,re.S):
            if re.match(r'\[\d+\]',m.group()): continue
            paragraphs.append({'id':f'{lang}-p{len(paragraphs)+1:03}', 'text':m.group(), 'source_start':a+m.start(),'source_end':a+m.end()})
        texts[lang]=paragraphs
        metadata.append({'language':lang,'file':filename,'url':f'https://www.gutenberg.org/ebooks/{19942 if lang=="en" else 4650}', 'download_url':f'https://www.gutenberg.org/cache/epub/{19942 if lang=="en" else 4650}/{filename}', 'sha256':digest(raw), 'edition':edition,'retrieved':'2026-09-14','rights':'Public-domain text; Gutenberg terms retained in source snapshot. Translator unspecified; no attribution invented.', 'transforms':['CRLF to LF for source offsets','Chapter I narrative only; standalone editorial footnote paragraphs omitted; wording and embedded note markers retained']})
    write('data/sources/provenance.json',{'schema_version':1,'sources':metadata})
    write('data/samples/paragraphs.json',{'schema_version':1,'languages':texts})
    return texts
def source_parts(selected):
    parts=[]
    for s in selected:
        if parts and parts[-1]['paragraph_id']==s['paragraph_id']:
            parts[-1]['end']=s['source_end']
        else:parts.append({'paragraph_id':s['paragraph_id'],'start':s['source_start'],'end':s['source_end']})
    return parts
if __name__=='__main__':extract()
