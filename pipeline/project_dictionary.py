"""Extract chapter-specific lexical evidence from the pinned FreeDict source."""
import argparse,xml.etree.ElementTree as ET
from pathlib import Path
from .sources import ROOT,digest
from .project import read_json,write_json
SOURCE='https://github.com/freedict/fd-dictionaries/blob/5bdceeac8d0dba3298c1bebe734f60d54dad30f7/eng-fra/eng-fra.tei'
SHA='5b7e1f657c5902f10ace0a31a6ffa3702ac0b5a49dfcc66883040c2a5e05a9a6'
def download():
    import urllib.request
    url=SOURCE.replace('github.com/','raw.githubusercontent.com/').replace('/blob/','/')
    raw=urllib.request.urlopen(url,timeout=120).read()
    if digest(raw)!=SHA: raise ValueError('FreeDict download fingerprint mismatch')
    target=ROOT/'.cache/eng-fra.tei';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    return target

def extract(project,tei):
    project=Path(project);raw=Path(tei).read_bytes()
    if digest(raw)!=SHA: raise ValueError('FreeDict input does not match pinned source')
    root=ET.fromstring(raw);ns={'t':'http://www.tei-c.org/ns/1.0'}
    data=read_json(project/'data/candidates/dataset.json')
    lemmas={t['lemma'] for p in data['passages'] for t in p['en']['tokens']}
    entries=[];subset=ET.Element('TEI',{'xmlns':ns['t']});subset.append(root.find('t:teiHeader',ns));body=ET.SubElement(ET.SubElement(subset,'text'),'body')
    for i,e in enumerate(root.findall('.//t:entry',ns)):
        orth=e.findtext('t:form/t:orth',namespaces=ns)
        if orth and orth.lower() in lemmas:
            body.append(e)
            for j,s in enumerate(e.findall('t:sense',ns)):
                entries.append({'id':f'freedict-eng-fra-entry-{i}-sense-{j}','en':orth.lower(),'fr':[q.text for q in s.findall('.//t:quote',ns) if q.text],'entry_index':i,'sense_index':j})
    ET.ElementTree(subset).write(project/'data/evidence/freedict-subset.tei',encoding='utf-8',xml_declaration=True)
    write_json(project/'data/evidence/dictionary.json',{'schema_version':1,'source':SOURCE,'release':'0.1.6 + pinned repository changes','sha256':SHA,'license':'GPL-2.0-or-later; original TEI header retained','entries':entries})
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('project');p.add_argument('tei');a=p.parse_args();extract(a.project,a.tei)
