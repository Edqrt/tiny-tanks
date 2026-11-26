import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=new URL('../',import.meta.url);
const source=new URL('src/',root);
const output=new URL('dist/',root);
// Only this generated directory is cleared. Server code and other projects are excluded.
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
const files=[
  'index.html','style.css','game.js','engine.js','enemy-profiles.js','levels.js',
  'tilemap.js','terrain-render.js','track-render.js','music.js','music-score.js','music-bank.js','mission-intro.js','editor.html','editor.css','editor.js',
  'selection.js','level-save.js',
];
for(const file of files)await cp(new URL(file,source),new URL(file,output));
await import('./build-browser.mjs');
// One versioned bundle per page avoids mixing cached modules from older releases.
for(const page of ['index','editor']){
  const bundle=page==='index'?'game.bundle.js':'editor.bundle.js';
  const version=createHash('sha256').update(await readFile(new URL(bundle,output))).digest('hex').slice(0,12);
  const htmlURL=new URL(`${page}.html`,output);
  let html=await readFile(htmlURL,'utf8');
  html=html.replace(/<script>[\s\S]*?<\/script>/,`<script src="${bundle}?v=${version}" defer></script>`);
  for(const css of ['style.css',...(page==='editor'?['editor.css']:[])]){
    const cssVersion=createHash('sha256').update(await readFile(new URL(css,output))).digest('hex').slice(0,12);
    html=html.replace(`href="${css}"`,`href="${css}?v=${cssVersion}"`);
  }
  await writeFile(htmlURL,html);
}
await writeFile(new URL('.nojekyll',output),'');
console.log(`公開用ファイル ${files.length+2} 個を作成しました: ${fileURLToPath(output)}`);
