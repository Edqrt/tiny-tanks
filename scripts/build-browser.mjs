import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
await build({
  absWorkingDir:root,
  entryPoints:{'game.bundle':'src/game.js','editor.bundle':'src/editor.js'},
  outdir:fileURLToPath(new URL('../dist/',import.meta.url)),
  bundle:true,
  format:'iife',
  platform:'browser',
  target:'es2022',
  define:{'import.meta.url':'__bundleModuleURL'},
  banner:{js:'// 自動生成ファイル。変更後は npm run build で更新してください。\nconst __bundleModuleURL = new URL("level-save.js", document.currentScript.src).href;'},
  minify:true,
});
