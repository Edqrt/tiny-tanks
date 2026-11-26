import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
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
await writeFile(new URL('.nojekyll',output),'');
console.log(`公開用ファイル ${files.length+2} 個を作成しました: ${fileURLToPath(output)}`);
