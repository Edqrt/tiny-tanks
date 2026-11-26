import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, TANK_RADIUS } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

function arena(type='green') {
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];
  const e=g.tank(200,200,type);e.profile={...e.profile,aimJitter:0};g.enemies=[e];
  Object.assign(g.player,{x:800,y:450,vx:0,vy:0});return {g,e};
}

function assertHit(g,e,angle,expectedBounces) {
  assert.notEqual(angle,null);
  const speed=e.profile.bulletSpeed,p=g.player;
  const b={x:e.x+19*Math.cos(angle),y:e.y+19*Math.sin(angle),vx:speed*Math.cos(angle),vy:speed*Math.sin(angle),bounces:0,maxBounces:e.profile.maxBounces,alive:true};
  for(let i=1;i<=10000&&b.alive;i++) {
    g.stepProjectile(b,.001);
    if(Math.hypot(b.x-p.x-p.vx*i*.001,b.y-p.y-p.vy*i*.001)<TANK_RADIUS+3) {
      assert.equal(b.bounces,expectedBounces);return;
    }
  }
  assert.fail('The physical projectile missed the constant-velocity target');
}

for(const moving of [false,true])for(const bounces of [0,1,2]) {
  test(`${bounces}-bounce intercept hits a ${moving?'moving':'stationary'} target`,()=>{
    const {g,e}=arena();
    if(moving)g.player.vy=-30;
    if(bounces===1)g.walls=[{x:480,y:280,w:40,h:90}];
    if(bounces===2)g.walls=[{x:480,y:70,w:40,h:380}];
    assertHit(g,e,g.findRicochetAim(e),bounces);
  });
}

test('black intercepts perpendicular, approaching and retreating straight movement',()=>{
  for(const [vx,vy] of [[0,-135],[-135,0],[100,0]]) {
    const {g,e}=arena('black');Object.assign(g.player,{x:600,y:350,vx,vy});
    assert.equal(g.aimEnemy(e,2,true),true);assertHit(g,e,e.aim,0);
  }
});

test('intercept solves flight time including the muzzle offset',()=>{
  const {g,e}=arena('black');Object.assign(g.player,{vx:-100,vy:60});
  const s=g.interceptAim(e);
  assert.ok(Math.abs(Math.hypot(s.target.x-e.x,s.target.y-e.y)-19-e.profile.bulletSpeed*s.time)<1e-8);
});

test('two reflections can intercept a target moving at full player speed',()=>{
  const {g,e}=arena();g.player.x=600;g.player.vy=-135;
  const solution=g.interceptAim(e,{sx:-1,sy:-1,ox:128,oy:1132});
  assert.notEqual(solution,null);
  assert.equal(g.traceShot(e,solution.angle,{target:solution.target}),2);
  assertHit(g,e,solution.angle,2);
});

test('no intercept is claimed beyond the playable area',()=>{
  const {g,e}=arena('black');g.player.y=530;g.player.vy=135;
  assert.equal(g.interceptAim(e),null);assert.equal(g.aimEnemy(e,2,true),false);
});

test('a cached bounce route updates its aim as the target moves and stops',()=>{
  const {g,e}=arena();g.walls=[{x:480,y:280,w:40,h:90}];g.player.vy=-30;
  assert.equal(g.aimEnemy(e,2,false),true);
  const old=e.aim;e.aimThink=10;g.player.y-=3;
  assert.equal(g.aimEnemy(e,2,false),true);assert.notEqual(e.aim,old);assertHit(g,e,e.aim,1);
  g.player.vy=0;
  assert.equal(g.aimEnemy(e,2,false),true);assertHit(g,e,e.aim,1);
});

test('zero lead retains current-position aiming',()=>{
  const {g,e}=arena('purple');g.player.vy=-90;
  assert.equal(g.interceptAim(e).angle,Math.atan2(250,600));
});
