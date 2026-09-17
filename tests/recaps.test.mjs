import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WordRecaps} from '../src/shared/recaps.js';
import {readingSections} from '../src/shared/sections.js';
import {newProgress, moveProgress} from '../src/shared/progression.js';
const section=(id,stage=1)=>[{
  id, text:Array.from({length:100},(_,i)=>`word${i}`).join(' '),
  translation:'mot0 mot1 mot2 mot3 mot4 mot5 mot6 mot7',
  replacements:Array.from({length:8},(_,i)=>({id:`r${i}`,start:i*6,end:i*6+5,english:`word${i}`,target:`mot${i}`,stage,kind:'word',decision:{status:'approved',safe_for_substitution:true}})),sentences:[],
}];
test('recaps appear at boundaries, stay stable on revisits, and ignore skipped sections',()=>{
  const r=new WordRecaps(300,400);
  assert.deepEqual(r.record(0,section('p0'),1),[]);
  assert.deepEqual(r.record(99,section('p99'),1),[]);
  const words=r.record(100,section('p100'),1);
  assert.equal(words.length,8); assert.equal(r.total,300);
  assert.deepEqual(r.record(100,section('p100'),4),words);
  r.record(0,section('p0'),4);assert.equal(r.total,300);
});
test('English and hidden higher-level words cannot seed recaps; fewer than five defers',()=>{
  const r=new WordRecaps(100,200);
  assert.deepEqual(r.record(0,section('p0',3),1),[]);
  assert.deepEqual(r.record(1,section('p1'),0),[]);
  const p=section('p2');p[0].replacements=p[0].replacements.slice(0,4);
  assert.deepEqual(r.record(2,p,1),[]);
  assert.equal(r.record(3,section('p3'),1).length,8);
});
test('old occurrences leave the window and repeated pairs are deduplicated',()=>{
  const r=new WordRecaps(300,150);
  r.record(0,section('old'),1);
  r.record(1,[{id:'blank',text:'blank '.repeat(100),replacements:[]}],0);
  const p=section('new');p[0].replacements.forEach(w=>{w.english='fresh'+w.english;w.target='neuf'+w.target;});
  const words=r.record(2,p,1);
  assert.equal(words.length,8);assert.ok(words.every(w=>w.english.startsWith('fresh')));
});
test('whole French sentences and full French use only existing approved word evidence',()=>{
  const r=new WordRecaps(100,200),p=section('p');
  p[0].sentences=[{id:'s',start:0,end:p[0].text.length,english:p[0].text,target:p[0].translation,stage:4,kind:'sentence'}];
  assert.equal(r.record(0,p,4).length,8);
  const full=new WordRecaps(100,200);
  assert.equal(full.record(0,p,5).length,8);
});
test('default six-chapter journey gives three succinct recaps near 1500-word milestones',async()=>{
  const book=JSON.parse(await readFile(new URL('../data/reader/book.json',import.meta.url),'utf8'));
  const sections=readingSections(book.passages),r=new WordRecaps();let state=newProgress(),cards=[];
  for(let i=0;i<sections.length;i++){
    state=moveProgress(state,i);const words=r.record(i,sections[i],state.stage);
    if(words.length)cards.push({total:r.total,words});
  }
  assert.equal(cards.length,3);
  cards.forEach((c,i)=>{assert.ok(c.total>=(i+1)*1500&&c.total<(i+1)*1500+400);assert.ok(c.words.length>=5&&c.words.length<=8);});
});
