import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../src/shared/data.js';
const t=(id,lemma)=>({id,lemma,surface:lemma,upos:'VERB',morph:{VerbForm:'Inf'},is_word:true,index:0,head:0,dep:'ROOT'});
const link={id:'p-l',en:['e'],fr:['f'],method:'simalign.inter'};
const fixture=()=>({id:'p',similarity:0.9,diagnostics:[],en:{tokens:[t('e','eat')]},fr:{tokens:[t('f','manger')]},links:[link]});
const dict={entries:[{id:'lexical',en:'eat',fr:['manger']},{dictionary_refs:['lexical'],id:'checked',en:'eat',fr:['manger'],link_id:'p-l',kind:'verb',min_stage:3}]};
const policy={allowed_upos:['NOUN'],passage_similarity_min:0.7};
test('only checked infinitive occurrences enter higher levels',()=>{
  const p=fixture();
  p.en.tokens.push({...t("to", "to"), index:1, head:0, upos:"PART", morph:{}, dep:"aux"});
  assert.equal(assess(p,link,dict,policy).safe_for_substitution,true);
  assert.equal(assess(p,link,dict,policy).min_stage,3);
  assert.equal(assess(p,link,{entries:[{id:'raw',en:'eat',fr:['manger']}]},policy).safe_for_substitution,false);
  const unsupported=structuredClone(dict);unsupported.entries[1].dictionary_refs=['missing'];
  assert.equal(assess(p,link,unsupported,policy).safe_for_substitution,false);
  for(const form of ['Fin','Part']){
    const q=fixture();q.en.tokens[0].morph.VerbForm=form;
    assert.equal(assess(q,link,dict,policy).safe_for_substitution,false);
  }
  for(const dep of ['prt','aux','neg']){
    const q=fixture();q.en.tokens.push({...t('extra','not'),index:1,head:0,dep});
    assert.equal(assess(q,link,dict,policy).safe_for_substitution,false);
  }
});
