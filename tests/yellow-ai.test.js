import test from 'node:test';
import assert from 'node:assert/strict';
import { Game,BOUNDS } from '../src/engine.js';
import { ENEMY_PROFILES,CLASSIC_ENEMY_TYPES,getEnemyProfile } from '../src/enemy-profiles.js';
import { TILE_LEVELS } from '../src/levels.js';
import { createMap,parseMapPack } from '../src/tilemap.js';

function arena(random=()=>.5){
  const g=new Game(random);g.start();g.walls=[];g.player.x=900;g.player.y=500;
  const e=g.tank(200,200,'yellow');e.cooldown=1000;e.mineCooldown=0;e.dir=0;g.enemies=[e];return {g,e};
}
function step(g,count){for(let i=0;i<count;i++)g.update(1/120);}

test('only the nine classic profiles are selectable and built-in levels use them',()=>{
  assert.deepEqual(Object.keys(ENEMY_PROFILES),CLASSIC_ENEMY_TYPES);
  for(const type of ['sentry','scout','sniper'])assert.throws(()=>getEnemyProfile(type),/Unknown enemy profile/);
  for(const map of TILE_LEVELS)for(const enemy of map.enemies)assert.ok(CLASSIC_ENEMY_TYPES.includes(enemy.type));
});

test('retired profiles in saved drafts migrate without losing enemy placements',()=>{
  const map=createMap();map.enemies=[{col:20,row:10,type:'sentry'},{col:25,row:10,type:'scout'},{col:30,row:10,type:'sniper'}];
  const [loaded]=parseMapPack({version:2,levels:[map]});assert.deepEqual(loaded.enemies,map.enemies.map((e,i)=>({...e,type:['brown','red','green'][i]})));
  assert.equal(map.enemies[0].type,'sentry');
});

test('yellow escapes a mine beside a wall instead of steering into that wall',()=>{
  const {g,e}=arena();g.walls=[{x:220,y:150,w:40,h:200}];
  assert.equal(g.plant(e),true);const mine=g.mines[0];e.mineCooldown=1000;
  step(g,100);assert.ok(e.alive);assert.ok(Math.hypot(e.x-mine.x,e.y-mine.y)>70);
  step(g,400);assert.ok(e.alive);assert.equal(mine.alive,false);assert.equal(g.mines.length,0);
});

test('yellow refuses to lay mines in a room with no escape from the blast',()=>{
  const {g,e}=arena();e.x=300;e.y=300;
  g.walls=[{x:200,y:200,w:200,h:20},{x:200,y:380,w:200,h:20},{x:200,y:220,w:20,h:160},{x:380,y:220,w:20,h:160}];
  assert.equal(g.plant(e),false);assert.equal(g.mines.length,0);
  step(g,720);assert.ok(e.alive);assert.equal(g.mines.length,0);
});

test('yellow follows a turning escape path through an L-shaped passage',()=>{
  const {g,e}=arena();e.x=190;e.y=200;
  g.walls=[{x:140,y:100,w:20,h:240},{x:160,y:100,w:60,h:20},{x:220,y:100,w:20,h:160},{x:160,y:300,w:200,h:20}];
  assert.equal(g.plant(e),true);const mine=g.mines[0];e.mineCooldown=1000;
  assert.ok(e.mineEscape.path.some(point=>point.x>240));
  step(g,200);assert.ok(e.alive);assert.ok(e.x>240);
  step(g,300);assert.ok(e.alive);assert.equal(mine.alive,false);
});

test('yellow does not stack mines or plant while a projectile is close',()=>{
  const {g,e}=arena();assert.equal(g.plant(e),true);e.mineCooldown=0;
  assert.equal(g.plant(e),false);assert.equal(g.mines.length,1);
  g.mines=[];e.mineCooldown=0;g.bullets=[{x:e.x+30,y:e.y,alive:true}];
  assert.equal(g.plant(e),false);assert.equal(g.mines.length,0);
});

test('yellow still takes damage from its own mines',()=>{
  const {g,e}=arena();assert.equal(g.plant(e),true);g.explode(g.mines[0]);assert.equal(e.alive,false);
});

test('yellow survives sustained mine laying in open fields and beside arena edges',()=>{
  for(let seed=1;seed<=12;seed++){
    let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const {g,e}=arena(random);
    if(seed%2===0){e.x=BOUNDS.x+22;e.y=BOUNDS.y+22;}
    let laid=0;for(let frame=0;frame<2400&&e.alive;frame++){g.update(1/120);laid+=g.events.filter(event=>event.type==='mine').length;g.events=[];}
    assert.ok(e.alive,`self-destructed for seed ${seed}`);assert.ok(laid>=3,`not enough mine laying for seed ${seed}: ${laid}`);
  }
});
