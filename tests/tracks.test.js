import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, TRACK_SPACING, MAX_PENDING_TRACKS, WIDTH, HEIGHT } from '../src/engine.js';
import { CLASSIC_ENEMY_TYPES } from '../src/enemy-profiles.js';
import { createMap } from '../src/tilemap.js';
import { createTrackLayer } from '../src/track-render.js';

function arena(){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];g.enemies=[];
  Object.assign(g.player,{x:800,y:450});return g;
}

test('player and all enemy types leave distance-spaced tracks only when moving',()=>{
  for(const type of ['player',...CLASSIC_ENEMY_TYPES]){
    const g=arena(),t=g.tank(200,200,type);
    g.move(t,0,0);assert.equal(g.tracks.length,0,type);
    g.move(t,TRACK_SPACING-1,0);assert.equal(g.tracks.length,0,type);
    g.move(t,TRACK_SPACING*2+1,0);
    assert.deepEqual(g.tracks.map(track=>track.x),[212,224,236],type);
  }
});

test('tracks do not expire and a new mission resets them',()=>{
  const g=arena();g.enemies=[g.tank(200,200,'brown')];g.enemies[0].cooldown=100;
  g.move(g.player,TRACK_SPACING,0);const track=g.tracks[0];
  for(let i=0;i<720;i++)g.update(1/120);
  assert.ok(g.tracks.includes(track));g.load();assert.equal(g.tracks.length,0);
});

test('undrawn track records remain bounded even without a renderer',()=>{
  const g=arena(),t=g.player;
  for(let i=0;i<MAX_PENDING_TRACKS+100;i++)g.move(t,i%2===0?-TRACK_SPACING:TRACK_SPACING,0);
  assert.equal(g.tracks.length,MAX_PENDING_TRACKS);
});

test('blocked movement leaves no tracks',()=>{
  const g=arena(),t=g.player;g.walls=[{x:t.x+19,y:t.y-40,w:40,h:80}];
  assert.equal(g.move(t,TRACK_SPACING,0),0);assert.equal(g.tracks.length,0);
});

test('cached tracks persist without repainting and reset only for a new mission',()=>{
  const calls={stamps:0,clears:0,composites:0};
  const context={save(){},restore(){},translate(){},rotate(){},fillRect(){calls.stamps++;},clearRect(){calls.clears++;}};
  const canvas={getContext:()=>context};
  const layer=createTrackLayer(WIDTH,HEIGHT,()=>canvas);
  const target={drawImage(image){assert.equal(image,canvas);calls.composites++;}};
  const tracks=[{x:200,y:200,angle:0}];layer.draw(target,tracks);
  assert.equal(tracks.length,0);assert.equal(calls.stamps,2);
  for(let i=0;i<1000;i++)layer.draw(target,tracks);
  assert.equal(calls.stamps,2);assert.equal(calls.clears,1);assert.equal(calls.composites,1001);
  tracks.push({x:212,y:200,angle:0});layer.draw(target,tracks);
  assert.equal(calls.stamps,4);assert.equal(calls.clears,1);
  layer.draw(target,[]);assert.equal(calls.clears,2);
  assert.equal(canvas.width,WIDTH);assert.equal(canvas.height,HEIGHT);
});
