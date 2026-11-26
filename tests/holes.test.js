import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { createMap,paintCell,paintLine,compileMap,cellCenter,validateMap,parseMapPack,serializeMaps,MAP_ORIGIN,TILE_SIZE } from '../src/tilemap.js';
import { selectionRect,moveSelection } from '../src/selection.js';

function pitMap(){
  const map=createMap('穴越しの対決');map.player=[17,11];map.enemies=[{col:25,row:11,type:'red'}];paintLine(map,[20,8],[20,14],'hole');return map;
}
test('holes compile into tank obstacles rather than projectile walls and round-trip in JSON',()=>{
  const map=pitMap(),level=compileMap(map);assert.equal(level.walls.length,0);assert.equal(level.holes.length,1);
  assert.deepEqual(level.holes[0],[MAP_ORIGIN.x+20*TILE_SIZE,MAP_ORIGIN.y+8*TILE_SIZE,TILE_SIZE,7*TILE_SIZE]);
  assert.deepEqual(parseMapPack(serializeMaps([map])),[map]);
});
test('neither the player nor enemy movement can cross a pit',()=>{
  const g=new Game(()=>.5,[pitMap()]);g.start();const e=g.enemies[0];e.cooldown=1000;e.think=100;e.dir=Math.PI;
  e.profile={...e.profile,moveSpeed:135,strafeDistance:0};
  const edge=MAP_ORIGIN.x+20*TILE_SIZE;
  for(let i=0;i<120;i++)g.update(1/120,{x:1});
  assert.ok(g.player.x<=edge-18);assert.ok(e.x>=edge+TILE_SIZE+18);
  const [x,y]=cellCenter(20,11);assert.equal(g.blocked(x,y),true);assert.equal(g.projectileBlocked(x,y),false);
});
test('AI sees and shoots the player across a hole without a ricochet',()=>{
  const g=new Game(()=>.5,[pitMap()]);g.start();const e=g.enemies[0];e.profile={...e.profile,moveSpeed:0,aimJitter:0};e.aim=Math.PI;e.cooldown=0;
  assert.equal(g.aimEnemy(e,2,!g.walls.length),true);assert.equal(g.shoot(e),true);e.cooldown=1000;
  let bounced=false;
  for(let i=0;i<120&&g.player.alive;i++){g.update(1/120);bounced||=g.bullets.some(b=>b.bounces>0);}
  assert.equal(bounced,false);assert.equal(g.player.alive,false);
});
test('a hole at the muzzle does not block enemy shooting or bullet forecasts',()=>{
  const g=new Game(()=>.5,[pitMap()]);g.start();const e=g.enemies[0];const [hx,hy]=cellCenter(20,11);
  e.x=hx-30;e.y=hy;e.aim=0;e.cooldown=0;g.player.x=hx+160;g.player.y=hy;
  assert.equal(g.blocked(e.x,e.y),false);assert.equal(g.shoot(e),true);
  const path=g.forecastProjectile(g.bullets[0],.3);assert.ok(path.some(p=>p.bx>hx+10));assert.ok(path.every(p=>p.bounces===0));
});
test('tanks cannot spawn on or overlapping a hole',()=>{
  const map=pitMap();map.player=[20,11];assert.ok(validateMap(map).some(error=>error.includes('穴に重なって')));
  map.player=[19,11];assert.ok(validateMap(map).some(error=>error.includes('穴に重なって')));
});
test('holes survive mine explosions and stay present after a reload',()=>{
  const map=pitMap(),g=new Game(()=>.5,[map]);g.start();const before=JSON.stringify(g.holes),[x,y]=cellCenter(20,11);
  g.explode({x,y,alive:true});assert.equal(g.tiles[11][20],'O');assert.equal(JSON.stringify(g.holes),before);
  g.load();assert.equal(g.tiles[11][20],'O');
});
test('editor can paint, move and erase holes, clearing entities when painting a pit',()=>{
  const map=createMap();paintCell(map,10,10,'red');paintCell(map,10,10,'hole');assert.equal(map.tiles[10][10],'O');assert.equal(map.enemies.some(e=>e.col===10&&e.row===10),false);
  assert.equal(moveSelection(map,selectionRect([10,10],[10,10]),2,0).ok,true);assert.equal(map.tiles[10][12],'O');assert.equal(map.tiles[10][10],'.');
  paintCell(map,12,10,'floor');assert.equal(map.tiles[10][12],'.');
});
test('yellow escape routes consider holes impassable',()=>{
  const map=pitMap(),g=new Game(()=>.5,[map]);g.start();const [x,y]=cellCenter(17,11),e=g.tank(x,y,'yellow');g.enemies=[e];g.player.x=900;g.player.y=500;e.dir=0;
  const route=g.findMineEscape(e,{x,y,age:0,alive:true});assert.ok(route?.length);
  for(const point of route)assert.equal(g.blocked(point.x,point.y),false);
});
