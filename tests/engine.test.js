import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS, BOUNDS, MINE_BLAST_RADIUS, TANK_RADIUS, circleRect, segmentRect } from '../src/engine.js';
import { getEnemyProfile } from '../src/enemy-profiles.js';

const fresh=()=>{const g=new Game(()=>.5);g.start();g.enemies.forEach(e=>{e.cooldown=100;});return g;};
const step=(g,n,input={})=>{for(let i=0;i<n;i++)g.update(1/120,input);};

test('all configured mission spawns are inside the field, clear of walls and other tanks',()=>{
  assert.ok(LEVELS.length>0);
  for(let i=0;i<LEVELS.length;i++){
    const g=fresh();g.level=i;g.load();const tanks=[g.player,...g.enemies];
    for(const t of tanks){assert.equal(g.blocked(t.x,t.y),false,`mission ${i+1}: ${t.type}`);for(const other of tanks)if(t!==other)assert.ok(Math.hypot(t.x-other.x,t.y-other.y)>=36);}
  }
});
test('circle and segment collision distinguish clear and obstructed paths',()=>{
  const w={x:100,y:100,w:40,h:80};
  assert.equal(circleRect(95,120,10,w),true);assert.equal(circleRect(80,120,10,w),false);
  assert.equal(segmentRect({x:0,y:120},{x:200,y:120},w),true);
  assert.equal(segmentRect({x:0,y:80},{x:200,y:80},w),false);
  assert.equal(segmentRect({x:110,y:0},{x:110,y:250},w),true);
});
test('movement is normalized diagonally and cannot leave arena or cross walls',()=>{
  const a=fresh(),b=fresh(),start={x:a.player.x,y:a.player.y};step(a,30,{x:1});step(b,30,{x:1,y:-1});
  assert.ok(Math.abs(Math.hypot(a.player.x-start.x,a.player.y-start.y)-Math.hypot(b.player.x-start.x,b.player.y-start.y))<.01);
  const g=fresh();step(g,500,{x:-1});assert.ok(g.player.x>=BOUNDS.x+18);
  const wall=g.walls[0];g.player.x=wall.x-30;g.player.y=wall.y+wall.h/2;step(g,150,{x:1});assert.ok(g.player.x<=wall.x-18);
});
test('projectile ricochets once, then disappears at the next wall',()=>{
  const g=fresh();g.walls=[];g.enemies.forEach(e=>{e.alive=false;});g.enemies.push(g.tank(560,90,'brown'));g.enemies.at(-1).cooldown=100;
  g.player.x=200;g.player.y=500;
  g.bullets=[{x:BOUNDS.x+BOUNDS.w-10,y:300,vx:350,vy:0,owner:-1,player:false,bounces:0,age:0,alive:true}];
  step(g,10);assert.equal(g.bullets[0].bounces,1);assert.ok(g.bullets[0].vx<0);
  step(g,400);assert.equal(g.bullets.length,0);
});
test('reflected player projectile can hit its owner and costs exactly one life',()=>{
  const g=fresh();g.walls=[];g.player.x=200;g.player.y=400;
  g.bullets=[{x:240,y:400,vx:-265,vy:0,owner:g.player.id,player:true,bounces:1,age:1,alive:true}];
  step(g,30);assert.equal(g.state,'dead');assert.equal(g.lives,2);assert.equal(g.player.alive,false);
  step(g,30);assert.equal(g.lives,2);
});
test('shooting enforces the five-projectile capacity',()=>{
  const g=fresh();for(let i=0;i<5;i++){g.player.cooldown=0;assert.equal(g.shoot(g.player),true);}
  g.player.cooldown=0;assert.equal(g.shoot(g.player),false);assert.equal(g.bullets.length,5);
});
test('mine destroys nearby soft walls, preserves solid walls and chains explosions',()=>{
  const g=fresh();g.player.x=100;g.player.y=100;
  g.walls=[{x:500,y:300,w:40,h:40,soft:true},{x:500,y:350,w:40,h:40,soft:false}];
  g.mines=[{x:480,y:320,owner:0,age:1,alive:true},{x:540,y:320,owner:0,age:1,alive:true}];
  g.explode(g.mines[0]);assert.equal(g.walls.length,1);assert.equal(g.walls[0].soft,false);assert.ok(g.mines.every(m=>!m.alive));
});

test('mine blast radius is two-thirds of 100px for tanks, walls and bullets',()=>{
  assert.ok(Math.abs(MINE_BLAST_RADIUS-100*2/3)<1e-10);
  const g=fresh(),r=MINE_BLAST_RADIUS;g.player.x=100;g.player.y=100;
  const inner=g.tank(500+r+TANK_RADIUS-1,300,'brown'),outer=g.tank(500-r-TANK_RADIUS-1,300,'brown');g.enemies=[inner,outer];
  g.walls=[{x:500+r-1,y:300,w:10,h:10,soft:true},{x:500-r-11,y:300,w:10,h:10,soft:true}];
  g.bullets=[{x:500+r-1,y:300,alive:true},{x:500-r-1,y:300,alive:true}];
  g.explode({x:500,y:300,alive:true});
  assert.equal(inner.alive,false);assert.equal(outer.alive,true);assert.equal(g.walls.length,1);
  assert.equal(g.bullets[0].alive,false);assert.equal(g.bullets[1].alive,true);
});

test('mine chain reactions stop outside the reduced blast radius',()=>{
  const g=fresh(),r=MINE_BLAST_RADIUS;
  g.mines=[{x:500,y:300,alive:true},{x:500+r-1,y:300,alive:true},{x:500-r-1,y:300,alive:true}];
  g.explode(g.mines[0]);assert.equal(g.mines[1].alive,false);assert.equal(g.mines[2].alive,true);
});
test('clear progresses to next mission and retry restores the score checkpoint',()=>{
  const g=fresh();g.enemies.forEach(e=>g.kill(e));g.update(1/120);assert.equal(g.state,'clear');assert.equal(g.score,700);
  g.next();assert.equal(g.level,1);assert.equal(g.checkpoint,700);
  g.kill(g.enemies[0]);g.kill(g.player);assert.equal(g.lives,2);g.retry();assert.equal(g.score,700);assert.equal(g.state,'playing');assert.ok(g.enemies.every(e=>e.alive));
});
test('losing the last life ends the game and finishing the last configured mission wins',()=>{
  const g=fresh();g.lives=1;g.kill(g.player);assert.equal(g.state,'gameover');g.retry();assert.equal(g.state,'gameover');
  g.start();g.level=g.levels.length-1;g.load();g.enemies.forEach(e=>g.kill(e));g.update(1/120);assert.equal(g.state,'won');
});
test('simultaneous player and final enemy destruction is a loss',()=>{
  const g=fresh();g.enemies.forEach(e=>g.kill(e));g.kill(g.player);g.update(1/120);assert.equal(g.state,'dead');
});

test('every fifth mission awards one extra life exactly once, including the final mission',()=>{
  const g=fresh();
  for(let i=0;i<g.levels.length;i++){
    g.enemies.forEach(e=>g.kill(e));g.update(1/120);
    const expected=3+Math.floor((i+1)/5);
    assert.equal(g.lives,expected);
    step(g,10);assert.equal(g.lives,expected);
    if(i<g.levels.length-1)g.next();
  }
  g.start();assert.equal(g.lives,3);
});

test('dying at a fifth mission gives no bonus; clearing after a retry awards it once',()=>{
  const g=fresh();g.level=4;g.load();
  g.enemies.forEach(e=>g.kill(e));g.kill(g.player);g.update(1/120);
  assert.equal(g.lives,2);assert.equal(g.state,'dead');
  g.retry();assert.equal(g.lives,2);
  g.enemies.forEach(e=>g.kill(e));g.update(1/120);assert.equal(g.lives,3);
  g.next();g.kill(g.player);g.retry();assert.equal(g.lives,2);
});

test('default enemy profiles preserve shot speed, cooldown, capacity and score',()=>{
  for(const [type,speed,interval,score] of [['brown',200,6.5,100],['red',200,.425,250],['green',400,1.1,350]]){
    const g=fresh();g.walls=[];const e=g.tank(700,300,type);g.enemies=[e];
    assert.ok(Math.abs(e.cooldown-2.3)<1e-10);
    e.aim=0;
    for(let i=0;i<e.profile.maxBullets;i++){
      e.cooldown=0;assert.equal(g.shoot(e),true);
      assert.ok(Math.abs(e.cooldown-interval)<1e-10);
      assert.equal(g.bullets[i].vx,speed);assert.equal(g.bullets[i].maxBounces,e.profile.maxBounces);
    }
    e.cooldown=0;assert.equal(g.shoot(e),false);
    g.kill(e);assert.equal(g.score,score);
  }
});

test('enemy combat parameters come from its profile rather than its type',()=>{
  const g=fresh(),e=g.tank(900,300,'brown');
  g.enemies=[e];g.walls=[];
  e.profile={...e.profile,bulletSpeed:123,shotInterval:[.4,.4],maxBullets:1,maxBounces:0,score:777};
  e.cooldown=0;e.aim=0;
  assert.equal(g.shoot(e),true);assert.equal(g.bullets[0].vx,123);assert.equal(e.cooldown,.4);
  e.cooldown=0;assert.equal(g.shoot(e),false);
  const b=g.bullets[0];b.x=1085;b.y=300;
  step(g,5);assert.equal(g.bullets.length,0);
  g.kill(e);assert.equal(g.score,777);
});

test('profile enables movement for a stationary tank and controls activation and decision timing',()=>{
  const g=fresh();g.walls=[];g.player.x=200;g.player.y=300;
  const e=g.tank(700,300,'brown');g.enemies=[e];
  e.profile={...e.profile,moveSpeed:120,aimMode:'direct',activationDelay:.1,reactionDelay:0,decisionInterval:[.8,.8],strafeDistance:0};
  e.cooldown=0;e.aim=Math.PI;
  step(g,6);assert.ok(Math.abs(e.x-694)<1e-8);assert.equal(g.bullets.length,0);
  assert.ok(Math.abs(e.think-(.8-5/120))<1e-8);
  step(g,8);assert.equal(g.bullets.length,1);
});

test('zero moveSpeed keeps a red tank stationary and unknown profiles fail clearly',()=>{
  const g=fresh();g.walls=[];const e=g.tank(700,300,'red');g.enemies=[e];
  e.profile={...e.profile,moveSpeed:0};e.cooldown=100;step(g,30);
  assert.equal(e.x,700);assert.equal(e.y,300);
  assert.throws(()=>g.tank(0,0,'missing'),/Unknown enemy profile: missing/);
  assert.throws(()=>getEnemyProfile('toString'),/Unknown enemy profile/);
});
