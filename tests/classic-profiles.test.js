import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, isTankVisible } from '../src/engine.js';
import { CLASSIC_ENEMY_TYPES, getEnemyProfile } from '../src/enemy-profiles.js';

function arena(type) {
  const g=new Game(()=>.5);g.start();g.walls=[];
  g.player.x=800;g.player.y=450;
  const e=g.tank(200,200,type);e.cooldown=100;e.mineCooldown=100;
  g.enemies=[e];return {g,e};
}
function step(g,count,input={}){for(let i=0;i<count;i++)g.update(1/120,input);}

test('all nine classic profiles enforce their configured weapon capacities',()=>{
  for(const type of CLASSIC_ENEMY_TYPES){
    const p=getEnemyProfile(type);assert.ok(Number.isInteger(p.maxBullets)&&p.maxBullets>0);assert.ok(Number.isInteger(p.maxMines)&&p.maxMines>=0);
    const {g,e}=arena(type);e.aim=0;
    for(let i=0;i<p.maxBullets;i++){e.cooldown=0;assert.equal(g.shoot(e),true);}
    e.cooldown=0;assert.equal(g.shoot(e),false);
    assert.equal(g.bullets[0].vx,p.bulletSpeed);assert.equal(g.bullets[0].maxBounces,p.maxBounces);
  }
});

test('every classic type can complete a simulation without invalid positions',()=>{
  for(const type of CLASSIC_ENEMY_TYPES){const {g,e}=arena(type);step(g,240);assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.aim),type);}
});

test('classic mines enforce per-owner capacities including zero and four',()=>{
  for(const type of CLASSIC_ENEMY_TYPES){
    const {g,e}=arena(type),cap=e.profile.maxMines;
    // Spread legal placements out instead of stacking live explosives.
    for(let i=0;i<cap;i++){e.x=200+i*240;e.y=200;e.mineCooldown=0;assert.equal(g.plant(e),true);}
    e.mineCooldown=0;assert.equal(g.plant(e),false);assert.equal(g.mines.length,cap);
  }
  const {g,e}=arena('yellow');e.mineCooldown=0;assert.equal(g.plant(e),true);
  assert.equal(g.plant(g.player),true);assert.equal(g.mines.length,2);
});

test('yellow automatically lays mines and cooldowns reset with a mission',()=>{
  const {g,e}=arena('yellow');e.mineCooldown=0;step(g,190);
  assert.ok(g.mines.some(m=>m.owner===e.id));
  assert.ok(e.alive);assert.ok(e.tread>100);
  g.player.mineCooldown=100;g.load();assert.equal(g.player.mineCooldown,0);
});

test('white is visible before starting, leaves tracks, and stays invisible on firing',()=>{
  const {g,e}=arena('white');assert.equal(isTankVisible(e,'ready'),true);assert.equal(isTankVisible(e,'playing'),false);
  step(g,30);assert.ok(g.tracks.length>0);assert.equal(isTankVisible(e,'playing'),false);
  e.cooldown=0;assert.equal(g.shoot(e),true);assert.equal(isTankVisible(e,'playing'),false);
  step(g,40);assert.equal(isTankVisible(e,'playing'),false);
});

test('white stays invisible after successfully laying a mine',()=>{
  const {g,e}=arena('white');e.mineCooldown=0;
  assert.equal(g.plant(e),true);assert.equal(g.mines.length,1);
  assert.equal(isTankVisible(e,'playing'),false);
  step(g,40);assert.equal(isTankVisible(e,'playing'),false);
});

test('scan mode rotates rather than tracking the player directly',()=>{
  const {g,e}=arena('brown');e.aim=0;g.player.x=200;g.player.y=500;
  e.profile={...e.profile,aimMode:'scan'};
  assert.equal(g.aimEnemy(e,1/120,true),false);assert.ok(Math.abs(e.aim-e.profile.turretTurnSpeed/120)<1e-10);
  e.aim=Math.PI/2;assert.equal(g.aimEnemy(e,1/120,true),true);
});

test('black leads a moving target while teal aims at its current position',()=>{
  const {g,e}=arena('black');g.player.y=300;g.player.vx=0;g.player.vy=135;g.aimEnemy(e,2,true);
  const direct=Math.atan2(g.player.y-e.y,g.player.x-e.x);assert.ok(e.aim>direct);
  e.profile={...getEnemyProfile('teal'),aimJitter:0};g.aimEnemy(e,2,true);assert.equal(e.aim,direct);
});

test('green selects a two-bounce path that can actually hit the player',()=>{
  const {g,e}=arena('green');g.walls=[{x:480,y:70,w:40,h:380}];const aim=g.findRicochetAim(e);
  assert.notEqual(aim,null);assert.equal(g.traceShot(e,aim),2);
  e.aim=aim;e.cooldown=0;g.shoot(e);step(g,1100);
  assert.equal(g.player.alive,false);
});

test('teal rockets disappear at their first wall without bouncing',()=>{
  const {g,e}=arena('teal');e.aim=0;e.cooldown=0;g.shoot(e);
  g.bullets[0].x=1085;g.bullets[0].y=100;step(g,2);assert.equal(g.bullets.length,0);
});
