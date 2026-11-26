import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { TILE_LEVELS } from '../src/levels.js';
import { createMap,cloneMap,cellCenter,worldCell,validateMap,parseMapPack,serializeMaps,compileMap,paintCell,paintLine,MAP_COLS,MAP_ROWS,MAP_ORIGIN,TILE_SIZE } from '../src/tilemap.js';

test('all built-in tilemaps are valid and JSON round-trips preserve placements',()=>{
  assert.ok(TILE_LEVELS.length>0);
  assert.equal(MAP_COLS,50);assert.equal(MAP_ROWS,25);
  for(const map of TILE_LEVELS)assert.deepEqual(validateMap(map),[]);
  assert.deepEqual(parseMapPack(serializeMaps(TILE_LEVELS)),TILE_LEVELS);
  for(let c=0;c<MAP_COLS;c++)for(let r=0;r<MAP_ROWS;r++)assert.deepEqual(worldCell(...cellCenter(c,r)),[c,r]);
});
test('solid tiles merge for physics while breakable tiles remain individually destructible',()=>{
  const map=createMap();paintLine(map,[10,10],[13,10],'wall');paintLine(map,[10,11],[13,11],'wall');
  paintLine(map,[20,10],[22,10],'soft');const level=compileMap(map);
  assert.equal(level.walls.filter(w=>!w[4]).length,1);assert.deepEqual(level.walls[0],[MAP_ORIGIN.x+10*TILE_SIZE,MAP_ORIGIN.y+10*TILE_SIZE,80,40]);
  assert.equal(level.walls.filter(w=>w[4]).length,3);
});
test('painting replaces entities, moves the one player and interpolates drag strokes',()=>{
  const map=createMap();paintCell(map,10,10,'player');assert.deepEqual(map.player,[10,10]);
  paintCell(map,10,10,'black');assert.equal(map.player,null);assert.equal(map.enemies.at(-1).type,'black');
  paintCell(map,10,10,'green');assert.equal(map.enemies.filter(e=>e.col===10&&e.row===10).length,1);
  paintCell(map,10,10,'floor');assert.equal(map.enemies.at(-1).type,'green');
  paintCell(map,10,10,'erase');assert.equal(map.enemies.filter(e=>e.col===10&&e.row===10).length,0);
  paintLine(map,[5,5],[25,5],'soft');for(let c=5;c<=25;c++)assert.equal(map.tiles[5][c],'+');
  const before=cloneMap(map);assert.equal(paintCell(map,-1,0,'wall'),false);assert.deepEqual(map,before);
});
test('validation rejects malformed imports, unknown enemies and unsafe spawn locations',()=>{
  const map=createMap();assert.deepEqual(validateMap(map),[]);
  paintCell(map,map.player[0]+1,map.player[1],'wall');assert.ok(validateMap(map).some(e=>e.includes('壁に重なって')));
  const edge=createMap();edge.player=[0,0];assert.ok(validateMap(edge).some(e=>e.includes('外周')));
  const overlap=createMap();overlap.enemies=[{col:overlap.player[0]+1,row:overlap.player[1],type:'brown'}];assert.ok(validateMap(overlap).some(e=>e.includes('近すぎ')));
  assert.throws(()=>parseMapPack({version:3,levels:[createMap()]}));
  const bad=createMap();bad.enemies[0].type='missing';assert.throws(()=>parseMapPack({version:1,levels:[bad]}));
  const short=createMap();short.tiles[0]='.';assert.throws(()=>parseMapPack({version:1,levels:[short]}));
});
test('incomplete drafts can be saved and reopened, but cannot be played',()=>{
  const map=createMap();map.name='';map.player=null;map.enemies=[];
  assert.deepEqual(parseMapPack(serializeMaps([map]),{playable:false}),[map]);
  assert.throws(()=>parseMapPack(serializeMaps([map])));
});
test('custom campaigns use their own mission count and reset tiles after destruction',()=>{
  const map=createMap('試遊');paintCell(map,20,10,'soft');paintCell(map,22,10,'soft');paintCell(map,35,10,'soft');
  const g=new Game(()=>.5,[map]);g.start();
  const [x,y]=cellCenter(21,10);assert.equal(g.levels.length,1);g.explode({x,y,alive:true});
  assert.equal(g.tiles[10][20],'.');assert.equal(g.tiles[10][22],'.');assert.equal(g.tiles[10][35],'+');
  assert.equal(map.tiles[10][20],'+');g.load();assert.equal(g.tiles[10][20],'+');
  g.enemies.forEach(e=>g.kill(e));g.update(1/120);assert.equal(g.state,'won');
  const multi=new Game(()=>.5,[map,cloneMap(map)]);multi.start();multi.enemies.forEach(e=>multi.kill(e));multi.update(1/120);
  assert.equal(multi.state,'clear');multi.next();assert.equal(multi.level,1);assert.equal(multi.state,'playing');
});

test('legacy 53 by 29 drafts and JSON files migrate to 50 by 25',()=>{
  const legacy={name:'旧マップ',tiles:Array.from({length:29},()=>'.'.repeat(53)),player:[7,23],enemies:[{col:43,row:6,type:'black'}]};
  legacy.tiles[10]='.'.repeat(10)+'####'+'.'.repeat(39);
  const [converted]=parseMapPack({version:1,levels:[legacy]});
  assert.equal(converted.tiles.length,25);assert.ok(converted.tiles.every(row=>row.length===50));
  assert.equal(converted.enemies[0].type,'black');assert.equal(converted.enemies.length,1);assert.ok(converted.tiles.some(row=>row.includes('#')));
  assert.deepEqual(validateMap(converted),[]);assert.equal(JSON.parse(serializeMaps([converted])).version,2);
  assert.equal(legacy.tiles.length,29);assert.deepEqual(legacy.player,[7,23]);
});
