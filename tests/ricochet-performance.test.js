import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/engine.js';
import {createMap} from '../src/tilemap.js';

test('reflection candidates are unique within each bounce depth',()=>{
  const game=new Game(()=>.5);
  game.level=28;game.load();
  const candidates=[...game.ricochetCandidates(2)];
  const keys=candidates.map(t=>`${t.bounces}:${t.sx},${t.sy},${t.ox},${t.oy}`);
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(candidates.length<=4096);
});

test('sliced searches retain progress and aim at the current moving target',()=>{
  const game=new Game(()=>.5,[createMap()]);game.start();game.holes=[];
  game.walls=[{x:480,y:70,w:40,h:380}];
  const tank=game.tank(200,200,'green');game.enemies=[tank];
  Object.assign(game.player,{x:800,y:450,vx:0,vy:0});
  let angle=null,previous=null,continued=false;
  for(let frame=0;frame<512&&angle===null;frame++){
    game.player.y-=.01;
    angle=game.findRicochetAim(tank,1);
    if(previous&&tank.ricochetSearch===previous)continued=true;
    previous=tank.ricochetSearch;
  }
  assert.ok(continued);assert.notEqual(angle,null);
  assert.equal(game.traceShot(tank,angle),2);
  assert.equal(tank.ricochetSearch,null);
});

test('Mission 29 limits per-update traces and invalidates pending searches after wall changes',()=>{
  const game=new Game(()=>.5);game.level=28;game.load();
  let traces=0;const trace=game.traceShot.bind(game);
  game.traceShot=(...args)=>{traces++;return trace(...args);};
  game.update(1/120);
  // Three green tanks each get at most 32 candidates plus their direct checks.
  assert.ok(traces<=105,`Unexpected spike: ${traces} traces`);
  const green=game.enemies.find(e=>e.type==='green');
  const pending=green.ricochetSearch;assert.ok(pending);
  traces=0;game.update(1/120);
  assert.equal(green.ricochetSearch,pending);
  assert.ok(traces<=105);
  game.walls=[...game.walls];game.update(1/120);
  assert.notEqual(green.ricochetSearch,pending);
  assert.equal(green.ricochetSearch.walls,game.walls);
});
