import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

function arena(values={}){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];
  Object.assign(g.player,{x:800,y:200});
  const e=g.tank(200,200,'grey');e.aim=0;e.cooldown=0;
  e.profile={...e.profile,moveSpeed:0,aimJitter:0,activationDelay:0,reactionDelay:.2,shotInterval:[.1,.1],...values};
  g.enemies=[e];return {g,e};
}
function step(g,count){for(let i=0;i<count;i++)g.update(1/120);}
function shots(g){return g.events.filter(event=>event.type==='shot').length;}

test('sighting delays the first shot and continuous sight does not delay every shot',()=>{
  const {g}=arena({maxBullets:5});step(g,23);assert.equal(shots(g),0);
  step(g,1);assert.equal(shots(g),1);
  step(g,13);assert.equal(shots(g),2);
});

test('losing sight resets the reaction delay for reacquisition',()=>{
  const {g,e}=arena();step(g,12);
  g.walls=[{x:450,y:100,w:40,h:200}];step(g,12);
  assert.equal(e.sightTime,0);assert.equal(shots(g),0);
  g.walls=[];step(g,23);assert.equal(shots(g),0);
  step(g,1);assert.equal(shots(g),1);
});

test('reaction time runs while the turret turns and alignment is still required',()=>{
  const {g,e}=arena({reactionDelay:.1,turretTurnSpeed:1});e.aim=-.5;
  step(g,30);assert.equal(shots(g),0);assert.ok(e.sightTime>=.1);
  step(g,31);assert.equal(shots(g),1);
});

test('zero reaction delay permits an aligned shot immediately',()=>{
  const {g}=arena({reactionDelay:0});step(g,1);assert.equal(shots(g),1);
});

test('scan mode waits for reaction time even when already aligned',()=>{
  const {g}=arena({aimMode:'scan',turretTurnSpeed:0});
  step(g,23);assert.equal(shots(g),0);step(g,1);assert.equal(shots(g),1);
});

test('reaction readiness does not bypass the initial cooldown or activation delay',()=>{
  const {g,e}=arena({reactionDelay:0,activationDelay:.3});e.cooldown=.4;
  step(g,37);assert.equal(shots(g),0);step(g,12);assert.equal(shots(g),1);
});

test('a bounce route starts reaction time before alignment without direct sight',()=>{
  const {g,e}=arena({aimMode:'ricochet',maxBounces:2,reactionDelay:.2});
  g.player.y=450;g.walls=[{x:480,y:70,w:40,h:380}];
  step(g,1);assert.equal(e.targetAcquired,true);assert.ok(e.sightTime>0);assert.equal(shots(g),0);
  step(g,22);assert.equal(shots(g),0);
  for(let i=0;i<400&&shots(g)===0;i++)step(g,1);
  assert.equal(shots(g),1);
});
