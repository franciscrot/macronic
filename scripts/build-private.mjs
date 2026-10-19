// Reproducible owner-private Site layout; public Pages has a separate build.
import {build,root} from './tasks.mjs';
import {readFile,writeFile,cp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
const at=(...p)=>path.join(root,...p);
await build();
for(const name of ['index.html','reader.js','reader.json','shared','guide','guide.html','prepare'])await cp(at('dist/prototype',name),at('dist',name),{recursive:true});
await rm(at('dist/prototype'),{recursive:true});
await mkdir(at('dist/workshop'),{recursive:true});
for(const name of ['index.html','review.js'])await cp(at('src/review',name),at('dist/workshop',name));
for(const name of ['candidates','evidence','reviewed','samples'])await cp(at('data',name),at('dist/data',name),{recursive:true});
let review=await readFile(at('dist/workshop/index.html'),'utf8');
await writeFile(at('dist/workshop/index.html'),review.replace('href="../reader/"','href="../"'));
const manifest=JSON.parse(await readFile(at('corpus/candide.json'),'utf8'));
const links=['<a href="./workshop/">Chapter I</a>'];
for(const c of manifest.chapters){
 for(const [dir,folders] of [['src',['review','shared','guide','prepare','reader']],['data',['candidates','evidence','reviewed','samples','reader']]])
  for(const folder of folders)await cp(at(c.project,dir,folder),at('dist/chapters',c.id,dir,folder),{recursive:true});
 links.push(`<a href="./chapters/${c.id}/src/review/">${c.title}</a>`);
}
let html=await readFile(at('dist/index.html'),'utf8');
await writeFile(at('dist/index.html'),html.replace('</footer>',`<p>Review workshop: ${links.join(' · ')}</p><p><a href="./prepare/">Prepare two texts</a></p></footer>`));
console.log('Private Site build: passed');
