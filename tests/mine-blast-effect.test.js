import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MINE_BLAST_RADIUS } from '../src/engine.js';
import { createMap } from '../src/tilemap.js';
import { drawMineBlast } from '../src/terrain-render.js';

function arena(){
  const g=new Game(()=>.5,[createMap()]);g.start();g.walls=[];g.holes=[];
  Object.assign(g.player,{x:100,y:100});return g;
}

test('each chained mine creates one effect with the physical blast radius',()=>{
  const g=arena();g.mines=[{x:500,y:300,alive:true},{x:550,y:300,alive:true}];
  g.explode(g.mines[0]);g.explode(g.mines[0]);
  assert.deepEqual(g.mineBlasts.map(b=>[b.x,b.y,b.radius]),[[500,300,MINE_BLAST_RADIUS],[550,300,MINE_BLAST_RADIUS]]);
});

test('blast effects expire after a loss and reset when loading a mission',()=>{
  const g=arena();g.explode({x:500,y:300,alive:true});g.kill(g.player);
  for(let i=0;i<60;i++)g.update(1/120);
  assert.equal(g.mineBlasts.length,0);
  g.explode({x:500,y:300,alive:true});g.load();assert.equal(g.mineBlasts.length,0);
});

test('rendered glow and wave stay inside the damage radius with reduced-motion support',()=>{
  for(const reducedMotion of [false,true])for(const life of [.45,.3,.1]){
    const shapes=[],ctx={save(){},restore(){},translate(){},beginPath(){},
      createRadialGradient(){return {addColorStop(){}};},
      arc(x,y,radius){this.radius=radius;},
      fill(){shapes.push(this.radius);},stroke(){shapes.push(this.radius+this.lineWidth/2);}};
    drawMineBlast(ctx,{x:500,y:300,radius:MINE_BLAST_RADIUS,life,max:.45},reducedMotion);
    assert.equal(shapes[0],MINE_BLAST_RADIUS);assert.equal(shapes[1],MINE_BLAST_RADIUS);
    assert.equal(shapes.length,reducedMotion?2:3);
    assert.ok(shapes.every(radius=>radius<=MINE_BLAST_RADIUS));
  }
});
