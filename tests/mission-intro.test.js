import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,isTankVisible} from '../src/engine.js';
import {INTRO_SECONDS,INTRO_TICKS,INTRO_NOTES} from '../src/mission-intro.js';
import {introScoreStep,scoreStep,selectMusicState} from '../src/music.js';
import {MUSIC_PATTERNS,MUSIC_ARRANGEMENTS} from '../src/music-score.js';

test('intro freezes every tank, weapon and AI clock, and keeps white tanks visible',()=>{
  const game=new Game(()=>.5);game.start();game.walls=[];
  game.enemies=['white','yellow','black'].map((type,i)=>game.tank(250+i*150,200,type));
  game.beginIntro();
  const tanks=[game.player,...game.enemies],before=structuredClone(tanks);
  for(let frame=0;frame<479;frame++){
    game.update(1/120,{x:1,y:1,aim:{x:100,y:100},fire:true,mine:true});
    assert.equal(isTankVisible(game.enemies[0],game.state,game.introRemaining),true);
  }
  assert.deepEqual(tanks,before);assert.equal(game.time,0);
  assert.equal(game.bullets.length,0);assert.equal(game.mines.length,0);
  assert.equal(game.shoot(game.player),false);assert.equal(game.plant(),false);
  game.update(1/120);
  assert.equal(game.introRemaining,0);
  assert.equal(isTankVisible(game.enemies[0],game.state,game.introRemaining),false);
  const x=game.player.x;
  game.update(1/120,{x:1,fire:true,mine:true});
  assert.ok(game.player.x>x);assert.ok(game.time>0);
  assert.ok(game.bullets.length>0);assert.ok(game.mines.length>0);
});

test('new mission and retry reset the intro clock independently of audio',()=>{
  const game=new Game(()=>.5);game.start();game.beginIntro();
  assert.equal(game.introRemaining,INTRO_SECONDS);
  game.update(1/30);
  assert.ok(game.introRemaining<INTRO_SECONDS);
  game.state='dead';game.retry();game.beginIntro();
  assert.equal(game.introRemaining,INTRO_SECONDS);
  game.state='clear';game.next();game.beginIntro();
  assert.equal(game.introRemaining,INTRO_SECONDS);
});

test('intro matches the original snare rhythm, dynamics and articulation for two bars',()=>{
  assert.equal(INTRO_SECONDS,4);assert.equal(INTRO_NOTES.length,23);
  const notes=Array.from({length:INTRO_TICKS/40},(_,step)=>introScoreStep(step)).flat();
  assert.equal(notes.length,23);
  assert.ok(notes.every(n=>n.voice==='snare'&&n.pattern==='intro'&&n.note===26));
  const state=selectMusicState([{type:'brown',alive:true}]);
  const withoutPattern=({pattern,...note})=>note;
  for(let step=0;step<INTRO_TICKS/40;step++){
    assert.deepEqual(introScoreStep(step).map(withoutPattern),
      scoreStep(step,state).filter(n=>n.voice==='snare').map(withoutPattern));
  }
  assert.deepEqual(introScoreStep(INTRO_TICKS/40),[]);
  // Each two-bar block is the same complete phrase, with room after its final hit.
  const snare=MUSIC_PATTERNS[MUSIC_ARRANGEMENTS['brown:1'].parts.snare];
  for(let phrase=0;phrase<4;phrase++){
    const block=snare.filter(([tick])=>tick>=phrase*INTRO_TICKS&&tick<(phrase+1)*INTRO_TICKS)
      .map(([tick,...note])=>[tick-phrase*INTRO_TICKS,...note]);
    assert.deepEqual(block,INTRO_NOTES);
  }
  const last=INTRO_NOTES.at(-1);
  assert.ok(last[0]+last[2]<=INTRO_TICKS-240);
  assert.ok(last[3]>INTRO_NOTES[0][3]);
  assert.deepEqual(INTRO_NOTES.slice(0,4).map(n=>n[0]),[0,80,160,240]);
  assert.ok(INTRO_NOTES.slice(0,4).every((n,i,roll)=>i===0||n[3]>roll[i-1][3]));
});
