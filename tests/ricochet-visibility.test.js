import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, BOUNDS } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

function arena(maxBounces,walls=[]){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=walls;g.holes=[];
  Object.assign(g.player,{x:800,y:450});
  const e=g.tank(200,200,'purple');
  e.profile={...e.profile,aimMode:'ricochet',maxBounces,moveSpeed:0};e.cooldown=100;e.mineCooldown=100;
  g.enemies=[e];return {g,e};
}

for(const required of [0,1,2]){
  test(`visibility requires a route within the configured bounce limit (${required}-bounce arena)`,()=>{
    const walls=required===0?[]:required===1?[{x:480,y:280,w:40,h:90}]:[{x:480,y:70,w:40,h:380}];
    for(let limit=0;limit<=2;limit++){
      const {g,e}=arena(limit,walls);g.update(1/120);
      assert.equal(e.targetAcquired,limit>=required,`limit ${limit}`);
      assert.equal(e.sightTime>0,limit>=required,`reaction timer with limit ${limit}`);
      if(e.targetAcquired)assert.ok(g.traceShot(e,e.shotAim)<=limit);
    }
  });
}

test('losing every reflected route resets visibility and reaction time',()=>{
  const {g,e}=arena(2,[{x:480,y:70,w:40,h:380}]);g.update(1/120);
  assert.equal(e.targetAcquired,true);
  g.walls=[{x:480,y:BOUNDS.y,w:40,h:BOUNDS.h}];g.update(1/120);
  assert.equal(e.targetAcquired,false);assert.equal(e.sightTime,0);
});

test('a reflected sighting drives pursuit even when a wall blocks direct sight',()=>{
  const {g,e}=arena(2,[{x:480,y:70,w:40,h:380}]);
  e.profile={...e.profile,moveSpeed:100,strafeDistance:0};e.dir=Math.PI;e.think=0;
  g.update(1/120);
  assert.equal(e.targetAcquired,true);assert.ok(Math.abs(e.dir-Math.atan2(250,600))<1e-10);
});

test('failed searches retry within 0.1 seconds independently of movement decisions',()=>{
  const {g,e}=arena(2,[{x:480,y:BOUNDS.y,w:40,h:BOUNDS.h}]);
  e.profile={...e.profile,decisionInterval:[10,10]};
  const search=g.findRicochetAim.bind(g);let searches=0;
  g.findRicochetAim=t=>{searches++;return search(t);};
  g.update(1/120);assert.equal(searches,1);assert.equal(e.targetAcquired,false);
  for(let i=0;i<11;i++)g.update(1/120);
  assert.equal(searches,1);
  g.update(1/120);assert.equal(searches,2);
});

test('changed walls trigger immediate reacquisition despite the search cooldown',()=>{
  const {g,e}=arena(2,[{x:480,y:BOUNDS.y,w:40,h:BOUNDS.h}]);
  g.update(1/120);assert.equal(e.targetAcquired,false);assert.ok(e.aimThink>0);
  g.walls=[{x:480,y:70,w:40,h:380}];g.update(1/120);
  assert.equal(e.targetAcquired,true);assert.ok(e.sightTime>0);
});

test('an invalid cached bounce route is replaced without waiting for the retry timer',()=>{
  const {g,e}=arena(2,[{x:480,y:70,w:40,h:380}]);
  g.update(1/120);assert.equal(e.targetAcquired,true);
  e.ricochetTransform={sx:1,sy:1,ox:0,oy:0,bounces:2};e.aimThink=10;
  g.update(1/120);
  assert.equal(e.targetAcquired,true);assert.equal(g.traceShot(e,e.shotAim),2);
  assert.ok(e.aimThink<=e.profile.ricochetSearchInterval);
});
