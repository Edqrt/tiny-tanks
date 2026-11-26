import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_BULLET_SMOKE } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';
import { createBulletSmokeRenderer } from '../src/terrain-render.js';

function arena(){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];
  Object.assign(g.player,{x:200,y:200,aim:0});
  const e=g.tank(900,500,'brown');e.cooldown=100;e.mineCooldown=100;g.enemies=[e];return g;
}

test('moving bullets leave smoke which persists after impact and then expires',()=>{
  const g=arena();g.shoot(g.player);
  for(let i=0;i<12;i++)g.update(1/120);
  assert.ok(g.bulletSmoke.length>0);assert.equal(g.bulletSmoke[0].speed,265);
  const puff=g.bulletSmoke.at(-1);g.bullets=[];g.state='dead';g.update(1/120);
  assert.ok(g.bulletSmoke.includes(puff));assert.ok(puff.radius>2);
  for(let i=0;i<60;i++)g.update(1/120);
  assert.equal(g.bulletSmoke.length,0);
});

test('smoke stays bounded, clears on loading, and does not consume gameplay randomness',()=>{
  const g=arena();g.random=()=>assert.fail('Cosmetic smoke consumed gameplay randomness');
  const b={x:0,y:200,vx:480,vy:0,owner:1};
  for(let i=0;i<MAX_BULLET_SMOKE+100;i++){const previous=b.x;b.x+=12;g.emitBulletSmoke(b,previous,b.y);}
  assert.equal(g.bulletSmoke.length,MAX_BULLET_SMOKE);
  g.random=()=>.5;g.load();assert.equal(g.bulletSmoke.length,0);
});

test('AI projectile forecasts do not generate smoke',()=>{
  const g=arena();g.shoot(g.player);g.forecastProjectile(g.bullets[0],.5);
  assert.equal(g.bulletSmoke.length,0);
});

test('smoke reuses its soft sprite across particles and frames',()=>{
  let textures=0,draws=0;
  const draw=createBulletSmokeRenderer(()=>{
    textures++;return {getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})};
  });
  const ctx={save(){},restore(){},drawImage(){draws++;}};
  const puff={x:200,y:200,speed:480,player:false,radius:4,life:.3,max:.45};
  for(let i=0;i<60;i++)draw(ctx,[puff,puff]);
  assert.equal(textures,1);assert.equal(draws,120);
});
