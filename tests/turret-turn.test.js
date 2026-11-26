import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

function arena(type){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];
  Object.assign(g.player,{x:200,y:500});
  const e=g.tank(200,200,type);e.aim=0;e.profile={...e.profile,aimJitter:0};g.enemies=[e];
  return {g,e};
}

test('direct and ricochet turrets turn at their configured rate and wait until aligned',()=>{
  for(const type of ['grey','teal','yellow','red','green','purple','white','black']){
    const {g,e}=arena(type),dt=1/120;
    assert.equal(g.aimEnemy(e,dt,true),false,type);
    assert.ok(Math.abs(e.aim-e.profile.turretTurnSpeed*dt)<1e-10,type);
    let ready=false;
    for(let i=0;i<400&&!ready;i++)ready=g.aimEnemy(e,dt,true);
    assert.equal(ready,true,type);assert.equal(e.aim,Math.PI/2,type);
  }
});

test('a blocked direct path allows the turret to finish turning toward a cached bounce route',()=>{
  const {g,e}=arena('green');Object.assign(g.player,{x:800,y:450});
  g.walls=[{x:480,y:70,w:40,h:380}];
  assert.equal(g.aimEnemy(e,1/120,false),false);
  assert.notEqual(e.shotAim,null);
  let ready=false;
  for(let i=0;i<400&&!ready;i++)ready=g.aimEnemy(e,1/120,false);
  assert.equal(ready,true);assert.equal(g.traceShot(e,e.aim),2);
});

test('turrets cross the angle boundary by the shortest route without overshooting',()=>{
  const {g,e}=arena('grey');e.aim=Math.PI-.01;
  assert.equal(g.turnEnemyTurret(e,-Math.PI+.01,.01),false);
  assert.ok(e.aim<0);
  assert.equal(g.turnEnemyTurret(e,-Math.PI+.01,.01),true);
  assert.equal(e.aim,-Math.PI+.01);
});

test('stronger enemies acquire the same target sooner',()=>{
  const weak=arena('grey'),strong=arena('black');
  assert.equal(weak.g.aimEnemy(weak.e,.5,true),false);
  assert.equal(strong.g.aimEnemy(strong.e,.5,true),true);
});
