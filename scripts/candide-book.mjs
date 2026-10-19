import { readFile, writeFile } from 'node:fs/promises';
import { exportProject } from './project.mjs';
import { validateReader } from '../src/shared/data.js';
const root = new URL('../', import.meta.url);
export async function candideBook() {
  const first = JSON.parse(await readFile(new URL('data/reader/reader.json',root),'utf8'));
  const manifest=JSON.parse(await readFile(new URL('corpus/candide.json',root),'utf8'));
  const chapters=[{id:'i',title:'Chapter I',reader:first}];
  for(const chapter of manifest.chapters) chapters.push({...chapter,reader:await exportProject(new URL(chapter.project+'/',root).pathname)});
  const book={...first,title:'Candide',chapter:'',chapters:chapters.map(({id,title,reader})=>({id,title,base_fingerprint:reader.base_fingerprint,provenance:reader.provenance})),passages:chapters.flatMap(({id,title,reader})=>reader.passages.map(p=>({...p,id:`${id}-${p.id}`,source_passage_id:p.id,chapter_id:id,chapter_title:title,replacements:p.replacements.map(x=>({...x,id:`${id}-${x.id}`}))})))};
  delete book.base_fingerprint;
  validateReader(book);
  await writeFile(new URL('data/reader/book.json',root),JSON.stringify(book,null,2)+'\n');
  return book;
}
