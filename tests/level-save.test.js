import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap } from '../src/tilemap.js';
import { createLevelSaver,formatLevelSource } from '../src/level-save.js';

test('Live Server 404 falls back to a file picker in the original click call',async()=>{
  const operations=[];let source='',pickerCalls=0;
  const saver=createLevelSaver({
    apiBase:'http://localhost:5500/Tanks/api/',
    fetcher:async url=>{operations.push(String(url));return {ok:false,status:404};},
    pickFile:()=>{pickerCalls++;return Promise.resolve({name:'levels.js',createWritable:async()=>({write:async value=>{source=value;operations.push('write');},close:async()=>operations.push('close')})});},
  });
  assert.equal(await saver.detect(),'file');
  const map=createMap();const pending=saver.save([map]);
  assert.equal(pickerCalls,1);assert.deepEqual(await pending,{method:'file'});
  const generated=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);assert.deepEqual(generated.TILE_LEVELS,[map]);
  assert.deepEqual(operations,['http://localhost:5500/Tanks/api/editor-capabilities','write','close']);
  await saver.save([map]);assert.equal(pickerCalls,1);
});

test('a static server returning HTML also uses the browser file path',async()=>{
  const saver=createLevelSaver({fetcher:async()=>({ok:true,json:async()=>{throw new SyntaxError('HTML');}}),pickFile:()=>{}});
  assert.equal(await saver.detect(),'file');
});

test('the dedicated server keeps direct saving without opening a file picker',async()=>{
  let posts=0;
  const saver=createLevelSaver({apiBase:'http://localhost:4173/api/',fetcher:async(url,options)=>{
    if(options.method==='POST'){posts++;assert.equal(new URL(url).pathname,'/api/levels');assert.equal(JSON.parse(options.body).version,2);return {ok:true};}
    return {ok:true,json:async()=>({service:'tiny-tanks',saveLevels:true})};
  },pickFile:()=>assert.fail('Picker should not open')});
  assert.equal(await saver.detect(),'server');assert.deepEqual(await saver.save([createMap()]),{method:'server'});assert.equal(posts,1);
});

test('unsupported browsers export a JavaScript file, not a JSON map pack',async()=>{
  let downloaded;
  const saver=createLevelSaver({fetcher:async()=>{throw new Error('No API');},download:(source,name)=>{downloaded={source,name};}});
  assert.equal(await saver.detect(),'download');assert.deepEqual(await saver.save([createMap()]),{method:'download'});
  assert.equal(downloaded.name,'levels.js');assert.match(downloaded.source,/export const TILE_LEVELS =/);
});

test('invalid levels and incorrect target filenames never write a file',async()=>{
  let picks=0,writes=0;
  const saver=createLevelSaver({pickFile:()=>{picks++;return {name:'engine.js',createWritable:async()=>{writes++;}};}});
  const invalid=createMap();invalid.player=null;await assert.rejects(saver.save([invalid]));assert.equal(picks,0);
  await assert.rejects(saver.save([createMap()]),/levels\.js/);assert.equal(writes,0);
});

test('picker cancellation and stream failures do not report success or silently download',async()=>{
  const cancelled=createLevelSaver({pickFile:()=>{throw Object.assign(new Error('Cancelled'),{name:'AbortError'});},download:()=>assert.fail('No fallback on cancellation')});
  await assert.rejects(cancelled.save([createMap()]),{name:'AbortError'});
  let picks=0,aborts=0;
  const failed=createLevelSaver({pickFile:()=>{picks++;return {name:'levels.js',createWritable:async()=>({write:async()=>{throw new Error('Disk full');},abort:async()=>aborts++})};}});
  await assert.rejects(failed.save([createMap()]),/Disk full/);await assert.rejects(failed.save([createMap()]),/Disk full/);
  assert.equal(aborts,2);assert.equal(picks,2);
});

test('all source export paths use validated, correctly escaped level data',()=>{
  const map=createMap('"quoted"\n日本語');const source=formatLevelSource([map]);
  assert.ok(source.includes('日本語'));assert.ok(source.includes('\\n'));assert.ok(source.endsWith(';\n'));
  assert.throws(()=>formatLevelSource([]));
});
