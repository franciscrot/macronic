"""Extract a reproducible subset, preserving original TEI entries and attribution."""
import argparse,json,xml.etree.ElementTree as ET
from .sources import ROOT,digest,write

def main():
    p=argparse.ArgumentParser();p.add_argument('tei');args=p.parse_args()
    raw=open(args.tei,'rb').read();root=ET.fromstring(raw);ns={'t':'http://www.tei-c.org/ns/1.0'}
    import spacy
    nlp=spacy.load('en_core_web_sm')
    paras=json.loads((ROOT/'data/samples/paragraphs.json').read_text())['languages']['en']
    lemmas={t.lemma_.lower() for t in nlp(' '.join(p['text'] for p in paras))}
    entries=[];subset=ET.Element('TEI',{'xmlns':ns['t']});subset.append(root.find('t:teiHeader',ns));body=ET.SubElement(ET.SubElement(subset,'text'),'body')
    for i,e in enumerate(root.findall('.//t:entry',ns)):
        orth=e.findtext('t:form/t:orth',namespaces=ns)
        if orth and orth.lower() in lemmas:
            body.append(e)
            for j,s in enumerate(e.findall('t:sense',ns)):
                entries.append({'id':f'freedict-eng-fra-entry-{i}-sense-{j}','en':orth.lower(),'fr':[q.text for q in s.findall('.//t:quote',ns) if q.text], 'entry_index':i,'sense_index':j})
    ET.ElementTree(subset).write(ROOT/'data/evidence/freedict-subset.tei',encoding='utf-8',xml_declaration=True)
    write('data/evidence/dictionary.json',{'schema_version':1,'source':'https://github.com/freedict/fd-dictionaries/blob/5bdceeac8d0dba3298c1bebe734f60d54dad30f7/eng-fra/eng-fra.tei','release':'0.1.6 + pinned repository changes','sha256':digest(raw),'license':'GPL-2.0-or-later; original TEI header retained','entries':entries})
if __name__=='__main__':main()
