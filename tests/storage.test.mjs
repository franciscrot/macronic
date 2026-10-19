import test from 'node:test';
import assert from 'node:assert/strict';
import {newProgress} from '../src/shared/progression.js';
import {WordRecaps} from '../src/shared/recaps.js';
import {readingKey, saveReading, loadReading, restoreReading} from '../src/shared/storage.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
const book = n => ({title:'Candide', languages:{base:'en',learning:'fr'},
  chapters:Array.from({length:n},(_,i)=>({id:String(i),provenance:{edition:'original'}})),
  passages:Array.from({length:n},(_,i)=>({id:String(i),chapter_id:String(i),text:'English passage',translation:'Passage français',replacements:[]}))});
test('appending chapters migrates exact legacy prefix saves and complete recap history',async()=>{
  const storage=memory(), old=book(2), expanded=book(4), recaps=new WordRecaps();
  recaps.total=1800; recaps.nextAt=3000;
  recaps.visits.set(1,{start:0,end:1800,words:new Map([['w',{english:'dog',target:'chien',position:20}]])});
  recaps.cards.set(1,Array.from({length:5},()=>({english:'dog',target:'chien'})));
  const state={...newProgress(),index:1,furthest:1,stage:3,automatic:false};
  saveReading(await readingKey(old),state,recaps,storage);
  const restored=await restoreReading(expanded,storage);
  assert.equal(restored.key,await readingKey(expanded));
  assert.deepEqual(restored.saved,{state,recaps});
  saveReading(restored.key,state,recaps,storage);
  assert.deepEqual((await restoreReading(expanded,storage)).saved,{state,recaps});
});
test('edited passages, translations, substitutions, provenance and different books do not inherit saves',async()=>{
  const storage=memory(), old=book(2);
  saveReading(await readingKey(old),newProgress(),new WordRecaps(),storage);
  for(const edit of [
    b=>b.passages[0].text='Edited', b=>b.passages[0].translation='Modifié',
    b=>b.passages[0].replacements.push({target:'chien'}),
    b=>b.chapters[0].provenance.edition='another edition', b=>b.title='Another book',
    b=>b.passages.reverse(), b=>b.chapters.reverse(),
  ]){const b=book(3);edit(b);assert.equal((await restoreReading(b,storage)).saved,null);}
});
test('exact book fingerprints isolate changed and imported reading files', async()=>{
  assert.equal(await readingKey({title:'a'}),await readingKey({title:'a'}));
  assert.notEqual(await readingKey({title:'a'}),await readingKey({title:'b'}));
});
test('save restores progression and recap maps, rejecting stale or corrupt state',()=>{
  const storage=memory(), recap=new WordRecaps();
  recap.total=1800;recap.nextAt=3000;
  recap.visits.set(2,{start:0,end:1800,words:new Map([['w',{english:'dog',target:'chien',position:20}]])});
  recap.cards.set(2,Array.from({length:5},()=>({english:'dog',target:'chien'})));
  const state={...newProgress(),index:2,furthest:3,stage:3,automatic:false};
  assert.equal(saveReading('a',state,recap,storage),true);
  const result=loadReading('a',4,storage);
  assert.deepEqual(result.state,state);assert.deepEqual(result.recaps.visits,recap.visits);
  assert.deepEqual(result.recaps.cards,recap.cards);
  assert.equal(loadReading('b',4,storage),null);
  assert.equal(loadReading('a',2,storage),null);
  storage.setItem('a','{');assert.equal(loadReading('a',4,storage),null);
});
test('unavailable storage is a recoverable condition',()=>{
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.equal(loadReading('a',4,blocked),null);
  assert.equal(saveReading('a',newProgress(),new WordRecaps(),blocked),false);
});

test('the complete prepared book recovers an earlier chapter-prefix save',async()=>{
  const {readFile}=await import('node:fs/promises');
  const data=JSON.parse(await readFile(new URL('../data/reader/book.json',import.meta.url),'utf8'));
  const chapters=data.chapters.slice(0,-1), ids=new Set(chapters.map(c=>c.id));
  const earlier={...data,chapters,passages:data.passages.filter(p=>ids.has(p.chapter_id))};
  const storage=memory(), state=newProgress(), recaps=new WordRecaps();
  saveReading(await readingKey(earlier),state,recaps,storage);
  assert.deepEqual((await restoreReading(data,storage)).saved,{state,recaps});
});
