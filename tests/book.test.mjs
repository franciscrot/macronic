import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {candideBook} from '../scripts/candide-book.mjs';
import {readingSections} from '../src/shared/sections.js';
const read=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
test('book preserves every source word and chapter boundaries', async()=>{
  const book=await candideBook();
  const manifest=await read('corpus/candide.json');
  assert.equal(book.chapters.length,manifest.chapters.length+1);
  for(const c of manifest.chapters){
    const passages=book.passages.filter(p=>p.chapter_id===c.id);
    for(const [lang,field] of [['en','text'],['fr','translation']]){
      const source=await readFile(new URL('../'+c.project+'/data/sources/'+lang+'.txt',import.meta.url),'utf8');
      assert.equal(passages.map(p=>p[field]).join('').replace(/\s/g,''),source.replace(/\s/g,''));
    }
    assert.ok(passages.some(p=>p.replacements.length>0));
    if(["v","vi"].includes(c.id)) {
      const replacements=passages.flatMap(p=>p.replacements);
      const evidenceKinds=kind=>replacements.filter(x=>x.decision.evidence?.some(e=>e.kind===kind));
      assert.equal(evidenceKinds("verb").length,2);
      assert.equal(evidenceKinds("adjective").length,4);
      for(const x of evidenceKinds("verb"))assert.ok(x.stage>=3);
      assert.equal(passages.flatMap(p=>p.sentences||[]).length,1);
      assert.ok(replacements.length>evidenceKinds("verb").length+evidenceKinds("adjective").length);
    }
  }
  for(const section of readingSections(book.passages))assert.equal(new Set(section.map(p=>p.chapter_id)).size,1);
  const original=await read('data/reader/reader.json');
  for(let i=0;i<original.passages.length;i++){
    const p=book.passages[i];
    assert.equal(p.text,original.passages[i].text);
    assert.deepEqual(p.replacements.map(({id,...x})=>x),original.passages[i].replacements.map(({id,...x})=>x));
  }
});
