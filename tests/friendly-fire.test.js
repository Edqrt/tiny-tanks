import test from 'node:test';
import assert from 'node:assert/strict';
import { Game,MINE_BLAST_RADIUS,TANK_RADIUS } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';

function arena(type='red'){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];g.player.x=800;g.player.y=300;
  const e=g.tank(200,300,type);e.aim=0;e.dir=0;e.think=100;e.cooldown=0;e.mineCooldown=0;g.enemies=[e];return {g,e};
}
function ally(g,x,y,type='brown'){
  const a=g.tank(x,y,type);a.cooldown=1000;a.mineCooldown=1000;a.think=100;g.enemies.push(a);return a;
}
function step(g,count){for(let i=0;i<count;i++)g.update(1/120);}

test('direct fire and rockets are withheld if an ally is in front of the target',()=>{
  for(const type of ['red','teal']){
    const {g,e}=arena(type);ally(g,400,300);assert.equal(g.shoot(e),false);assert.equal(g.bullets.length,0);
    assert.ok(e.fireSafetyUntil>g.time);
  }
});
test('a moving ally crossing the upcoming shot path also suppresses fire',()=>{
  const {g,e}=arena();const a=ally(g,350,245,'grey');a.vx=0;a.vy=100;
  assert.equal(g.traceShot(e,0,{friendlyOnly:true}),false);
  assert.equal(g.shoot(e),false);assert.equal(g.bullets.length,0);
});
test('allies behind an intercepted target do not prevent a valid attack',()=>{
  const {g,e}=arena('teal');g.player.x=400;ally(g,600,300);assert.equal(g.shoot(e),true);
});
test('ricochet planning rejects a path that would hit a teammate after reflection',()=>{
  const {g,e}=arena('green');g.player.x=200;g.player.y=500;
  // A 45-degree shot reaches this ally only after reflecting off the top border.
  e.aim=-Math.PI/4;const a=ally(g,450,98);
  assert.equal(g.traceShot(e,e.aim,{friendlyOnly:true}),true);assert.equal(g.shoot(e),false);assert.ok(a.alive);
});
test('red tanks dodge teammate rockets even though normal dodgeRadius is zero',()=>{
  const {g,e}=arena();e.cooldown=1000;g.player.x=100;g.player.y=100;const a=ally(g,900,500);
  g.bullets=[{x:320,y:300,vx:-480,vy:0,owner:a.id,team:'enemy',bounces:0,maxBounces:0,alive:true,age:0}];
  step(g,120);assert.ok(e.alive);assert.ok(Math.abs(e.y-300)>15);
});
test('mine laying waits for nearby stationary or approaching allies',()=>{
  const {g,e}=arena('yellow');const a=ally(g,270,300);
  assert.equal(g.plant(e),false);assert.equal(g.mines.length,0);
  a.x=330;a.vx=-85;a.profile={...a.profile,moveSpeed:85};e.mineCooldown=0;
  assert.equal(g.plant(e),false);assert.equal(g.mines.length,0);
});
test('mine safety includes connected explosives that could chain toward an ally',()=>{
  const {g,e}=arena('yellow');e.y=200;ally(g,370,250);
  g.mines=[{x:260,y:200,age:1,alive:true},{x:320,y:200,age:1,alive:true}];
  assert.equal(g.safeMineForAllies(e,{x:200,y:200,alive:true}),false);
});
test('enemy fire will not trigger a mine chain that threatens teammates',()=>{
  const {g,e}=arena();const a=ally(g,410,350);
  g.mines=[{x:300,y:300,age:1,alive:true,owner:a.id,team:'enemy'},{x:360,y:300,age:1,alive:true,owner:a.id,team:'enemy'}];
  assert.equal(g.shoot(e),false);assert.equal(g.bullets.length,0);
});
test('all enemy mine layers plan an escape, including normally non-evading white tanks',()=>{
  for(const type of ['yellow','purple','white','black']){
    const {g,e}=arena(type);e.x=400;e.y=300;g.player.x=100;g.player.y=100;
    assert.equal(g.plant(e),true);assert.ok(e.mineEscape.path.length);e.mineCooldown=1000;e.cooldown=1000;
    step(g,500);assert.ok(e.alive,`${type} failed to escape`);
  }
});
test('red tanks keep out of teammate mine blasts despite zero mineAvoidRadius',()=>{
  const {g,e}=arena();e.cooldown=1000;g.player.x=100;g.player.y=100;const a=ally(g,900,500);
  const m={x:280,y:300,owner:a.id,team:'enemy',age:.9,alive:true};g.mines=[m];
  step(g,180);assert.ok(e.alive);assert.ok(Math.hypot(e.x-m.x,e.y-m.y)>MINE_BLAST_RADIUS+TANK_RADIUS);
});
test('collision and explosion damage still apply if avoidance is bypassed',()=>{
  const {g,e}=arena('brown');const a=ally(g,400,300);e.cooldown=1000;
  g.bullets=[{x:370,y:300,vx:265,vy:0,owner:e.id,team:'enemy',bounces:0,maxBounces:1,age:0,alive:true}];
  step(g,20);assert.equal(a.alive,false);
  const b=ally(g,600,300);g.explode({x:600,y:300,owner:e.id,team:'enemy',alive:true});assert.equal(b.alive,false);
});
