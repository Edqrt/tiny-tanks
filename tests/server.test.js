import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,copyFile,readFile,rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMap,serializeMaps } from '../src/tilemap.js';

test('local editor API saves validated levels and refuses cross-origin or invalid writes',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'tiny-tanks-server-'));
  let server;
  t.after(async()=>{
    if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}
    assert.equal(path.dirname(directory),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('tiny-tanks-server-'));
    await rm(directory,{recursive:true,force:true});
  });
  await mkdir(path.join(directory,'src'));
  await mkdir(path.join(directory,'scripts'));
  for(const file of ['scripts/server.mjs','src/tilemap.js','src/level-save.js','src/enemy-profiles.js','src/levels.js','package.json','src/editor.html'])await copyFile(new URL(`../${file}`,import.meta.url),path.join(directory,file));
  server=spawn(process.execPath,['scripts/server.mjs'],{cwd:directory,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  const origin=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Server startup timed out')),10000);timeout.unref();
    server.once('error',reject);
    server.stdout.on('data',chunk=>{const match=chunk.toString().match(/Local: (http:\/\/localhost:\d+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
  });
  const levelPath=path.join(directory,'src','levels.js');
  const original=await readFile(levelPath,'utf8');
  const capabilities=await fetch(`${origin}/api/editor-capabilities`);assert.deepEqual(await capabilities.json(),{service:'tiny-tanks',saveLevels:true});
  const page=await fetch(`${origin}/editor.html`);assert.equal(page.status,200);assert.match(await page.text(),/map-canvas/);
  for(const route of ['/package.json','/scripts/server.mjs'])assert.equal((await fetch(`${origin}${route}`)).status,404);
  const map=createMap();map.name='作戦：日本語の保存';
  const options={method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:serializeMaps([map])};
  const blocked=await fetch(`${origin}/api/levels`,{...options,headers:{...options.headers,Origin:'https://unrelated.example'}});
  assert.equal(blocked.status,403);assert.equal(await readFile(levelPath,'utf8'),original);
  const invalid=await fetch(`${origin}/api/levels`,{...options,body:'{"version":1,"levels":[]}'});
  assert.equal(invalid.status,400);assert.equal(await readFile(levelPath,'utf8'),original);
  const saved=await fetch(`${origin}/api/levels`,options);assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{saved:1});
  const source=await readFile(levelPath,'utf8');assert.ok(source.includes(map.name));
  assert.deepEqual(JSON.parse(source.slice(source.indexOf('=')+1).trim().replace(/;$/,'')),[map]);
});
