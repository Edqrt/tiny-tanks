import test from 'node:test';
import assert from 'node:assert/strict';
import { Game,BOUNDS } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

function arena(type='green'){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];g.player.x=800;g.player.y=450;
  const e=g.tank(200,200,type);g.enemies=[e];return {g,e};
}
test('ricochet tanks shoot straight at an unobstructed player',()=>{
  for(const type of ['green','purple']){
    const {g,e}=arena(type),aim=g.findRicochetAim(e);
    assert.equal(aim,Math.atan2(250,600));assert.equal(g.traceShot(e,aim),0);
    assert.equal(g.traceShot(e,aim,{details:true}).distance,650);
  }
});
test('when direct fire is blocked, a short one-bounce route beats a longer route',()=>{
  const {g,e}=arena();g.walls=[{x:480,y:300,w:40,h:40}];
  const direct=Math.atan2(250,600);assert.equal(g.traceShot(e,direct),null);
  const top=BOUNDS.y+4,bottom=BOUNDS.y+BOUNDS.h-4;
  const topAim=Math.atan2(2*top-g.player.y-e.y,g.player.x-e.x),bottomAim=Math.atan2(2*bottom-g.player.y-e.y,g.player.x-e.x);
  const topPath=g.traceShot(e,topAim,{details:true}),bottomPath=g.traceShot(e,bottomAim,{details:true});
  assert.equal(topPath.bounces,1);assert.equal(bottomPath.bounces,1);assert.ok(bottomPath.distance<topPath.distance);
  const aim=g.findRicochetAim(e),chosen=g.traceShot(e,aim,{details:true});
  assert.equal(chosen.bounces,1);assert.ok(chosen.distance<=bottomPath.distance+1e-6);assert.ok(aim>0&&aim<Math.PI/2);
});
test('two-bounce shots remain available when the useful routes require them',()=>{
  const {g,e}=arena();g.walls=[{x:480,y:70,w:40,h:380}];const aim=g.findRicochetAim(e);
  assert.notEqual(aim,null);assert.equal(g.traceShot(e,aim),2);
});
test('a completely sealed target causes the tank to wait instead of firing away',()=>{
  const {g,e}=arena();g.walls=[{x:480,y:BOUNDS.y,w:40,h:BOUNDS.h}];
  assert.equal(g.findRicochetAim(e),null);
});
test('direct shots through holes are preferred over unnecessary ricochets',()=>{
  const {g,e}=arena();g.holes=[{x:480,y:BOUNDS.y,w:40,h:BOUNDS.h}];
  const aim=g.findRicochetAim(e);assert.equal(aim,Math.atan2(250,600));assert.equal(g.traceShot(e,aim),0);
});

test('a newly clear direct shot replaces the cached route while the turret turns',()=>{
  const {g,e}=arena();e.shotAim=Math.PI;e.aimThink=10;
  assert.equal(g.aimEnemy(e,1/120,true),false);assert.equal(e.shotAim,Math.atan2(250,600));
  assert.equal(g.aimEnemy(e,2,true),true);assert.equal(e.aim,Math.atan2(250,600));
});
