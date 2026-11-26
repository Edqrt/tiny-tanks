import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';

function arena(type='red'){
  const g=new Game(()=>.5);g.start();g.walls=[];g.player.x=900;g.player.y=500;
  const e=g.tank(200,200,type);e.aim=0;e.dir=0;e.think=100;e.cooldown=1000;e.mineCooldown=1000;g.enemies=[e];return {g,e};
}
function bullet(e,values={}){return {x:e.x+60,y:e.y,vx:-265,vy:0,owner:e.id,player:false,bounces:1,maxBounces:1,age:.3,alive:true,...values};}
function step(g,count){for(let i=0;i<count;i++)g.update(1/120);}

test('enemy refuses a shot that immediately returns from a nearby wall',()=>{
  const {g,e}=arena('brown');g.walls=[{x:260,y:140,w:40,h:160}];e.cooldown=0;
  assert.equal(g.shoot(e),false);assert.equal(g.bullets.length,0);assert.equal(e.cooldown,0);
});
test('enemy refuses a diagonal shot returning from a block corner',()=>{
  const {g,e}=arena('brown');g.walls=[{x:230,y:230,w:40,h:40}];e.aim=Math.PI/4;e.cooldown=0;
  assert.equal(g.shoot(e),false);assert.ok(e.alive);
});
test('enemy does not spawn projectiles inside a wall at its muzzle',()=>{
  const {g,e}=arena('teal');g.walls=[{x:218,y:160,w:20,h:80}];e.cooldown=0;
  assert.equal(g.shoot(e),false);assert.equal(g.bullets.length,0);
});
test('a target before the returning wall remains a valid shot',()=>{
  const {g,e}=arena('brown');g.walls=[{x:260,y:140,w:40,h:160}];g.player.x=240;g.player.y=200;e.cooldown=0;
  assert.equal(g.shoot(e),true);e.cooldown=1000;step(g,60);
  assert.equal(g.player.alive,false);assert.equal(e.alive,true);
});
test('a moving red tank dodges its own returning bullet despite having no normal evasion',()=>{
  const {g,e}=arena();assert.equal(e.profile.dodgeRadius,0);g.bullets=[bullet(e)];
  step(g,120);assert.ok(e.alive);assert.ok(Math.abs(e.y-200)>20);
});
test('enemy predicts a future ricochet before its outgoing bullet hits the wall',()=>{
  const {g,e}=arena();g.walls=[{x:300,y:130,w:20,h:180}];g.bullets=[bullet(e,{x:219,vx:265,bounces:0,age:0})];
  step(g,150);assert.ok(e.alive);assert.ok(Math.abs(e.y-200)>20);
});
test('a harmless outgoing own projectile does not interrupt normal movement',()=>{
  const {g,e}=arena();g.bullets=[bullet(e,{x:219,vx:265,bounces:0,age:0})];
  const intent=g.avoidProjectiles(e,0);assert.equal(intent.vx,e.profile.moveSpeed);assert.equal(intent.vy,0);
});
test('safety decisions do not grant enemies immunity from their own ricochets',()=>{
  const {g,e}=arena('brown');g.bullets=[bullet(e,{x:240})];step(g,30);assert.equal(e.alive,false);
});
test('player shots and self-hit rules remain available beside walls',()=>{
  const {g}=arena('brown');g.player.x=200;g.player.y=200;g.player.aim=0;g.enemies[0].x=900;g.enemies[0].y=500;
  g.walls=[{x:260,y:140,w:40,h:160}];assert.equal(g.shoot(g.player),true);step(g,60);assert.equal(g.player.alive,false);assert.equal(g.lives,2);
});
