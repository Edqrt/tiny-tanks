import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

function arena(){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];g.player.x=100;g.player.y=100;
  const e=g.tank(700,300,'teal');g.enemies=[e];
  // Benchmark forecast reuse independently of the live profile's detection radius.
  e.profile={...e.profile,dodgeRadius:180};
  const bullet=(values={})=>({x:810,y:370,vx:-265,vy:0,owner:g.player.id,bounces:0,maxBounces:1,alive:true,...values});
  return {g,e,bullet};
}
function count(g,name){const original=g[name].bind(g);let calls=0;g[name]=(...args)=>{calls++;return original(...args);};return ()=>calls;}

test('own non-bouncing rockets require no forecasts or movement collision tests',()=>{
  const {g,e,bullet}=arena();g.bullets=[bullet({x:719,y:300,vx:480,owner:e.id,maxBounces:0})];
  const forecasts=count(g,'forecastProjectile'),motions=count(g,'forecastTankMotion'),checks=count(g,'tankBlocked');
  assert.deepEqual(g.avoidProjectiles(e,0),{vx:85,vy:0});
  assert.equal(forecasts(),0);assert.equal(motions(),0);assert.equal(checks(),0);
});
test('one candidate movement forecast is shared by five projectile trajectories',()=>{
  const {g,e,bullet}=arena();g.bullets=Array.from({length:5},(_,i)=>bullet({x:800+i*10}));
  const motions=count(g,'forecastTankMotion'),checks=count(g,'tankBlocked');
  assert.deepEqual(g.avoidProjectiles(e,0),{vx:85,vy:0});
  assert.equal(motions(),1);assert.ok(checks()<=20,`unexpected collision work: ${checks()}`);
});
test('ordinary decisions are reused for roughly 20 evaluations per second',()=>{
  const {g,e,bullet}=arena();g.bullets=[bullet()];const motions=count(g,'forecastTankMotion');
  for(let i=0;i<120;i++){g.time=i/120;g.avoidProjectiles(e,0);}
  assert.ok(motions()>=15&&motions()<=25,`motion forecasts: ${motions()}`);
});
test('new projectiles invalidate a held avoidance decision immediately',()=>{
  const {g,e,bullet}=arena();g.bullets=[bullet()];const forecasts=count(g,'forecastProjectile');
  g.avoidProjectiles(e,0);const before=forecasts();g.time+=1/120;
  g.bullets.push(bullet({x:770,y:300}));g.avoidProjectiles(e,0);assert.ok(forecasts()>before);
});
test('a close projectile overrides the reuse interval even without a signature change',()=>{
  const {g,e,bullet}=arena();const b=bullet();g.bullets=[b];const forecasts=count(g,'forecastProjectile');
  g.avoidProjectiles(e,0);const before=forecasts();g.time+=1/120;b.x=730;b.y=300;
  g.avoidProjectiles(e,0);assert.ok(forecasts()>before);
});
test('terrain changes and a changed preferred heading invalidate the decision',()=>{
  const {g,e,bullet}=arena();g.bullets=[bullet()];const forecasts=count(g,'forecastProjectile');
  g.avoidProjectiles(e,0);const first=forecasts();g.time+=1/120;g.walls=[];
  g.avoidProjectiles(e,0);assert.ok(forecasts()>first);
  const motions=count(g,'forecastTankMotion');g.time+=1/120;g.avoidProjectiles(e,Math.PI/2);assert.ok(motions()>0);
});
test('shared movement forecasts stop at holes and walls',()=>{
  const {g,e}=arena();g.holes=[{x:740,y:260,w:20,h:100}];
  const motion=g.forecastTankMotion(e,300,0,.6);
  assert.ok(motion.points.every(point=>point.x<=722));
  const end=g.motionPosition(motion,.6);assert.equal(end.x,motion.points.at(-1).x);
});
