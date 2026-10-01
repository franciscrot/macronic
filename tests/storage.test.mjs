import test from 'node:test';
import assert from 'node:assert/strict';
import {newProgress} from '../src/shared/progression.js';
import {WordRecaps} from '../src/shared/recaps.js';
import {readingKey, saveReading, loadReading} from '../src/shared/storage.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
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
