import { Game } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

// Fixed synthetic layout: 320 tiles away from the tank and its nearby bullets.
for(const scenario of ['none','own-rocket','five-incoming']){
  const g=new Game(()=>.5,[createMap()]);g.start();g.holes=[];
  g.walls=Array.from({length:320},(_,i)=>({x:60+(i%20)*20,y:70+Math.floor(i/20)*20,w:20,h:20}));
  g.player.x=100;g.player.y=500;
  const e=g.tank(700,300,'teal');g.enemies=[e];
  g.bullets=scenario==='none'?[]:scenario==='own-rocket'?[{x:719,y:300,vx:480,vy:0,owner:e.id,bounces:0,maxBounces:0,alive:true}]:Array.from({length:5},(_,i)=>({x:760+i*12,y:300+(i-2)*7,vx:-265,vy:0,owner:g.player.id,bounces:0,maxBounces:1,alive:true}));
  const blocked=g.tankBlocked.bind(g);let checks=0;
  g.tankBlocked=(...args)=>{checks++;return blocked(...args);};
  for(let i=0;i<10;i++){g.time+=1/120;g.avoidProjectiles(e,0);}
  checks=0;const start=performance.now();
  for(let i=0;i<100;i++){g.time+=1/120;g.avoidProjectiles(e,0);}
  console.log(JSON.stringify({scenario,msPerTick:Number(((performance.now()-start)/100).toFixed(3)),collisionChecksPerTick:checks/100}));
}
