import test from 'node:test';
import assert from 'node:assert/strict';
import {MUSIC_PRIORITY,MUSIC_STEPS,selectMusicState,scoreStep,sampleRegion,AdaptiveMusic} from '../src/music.js';
import {MUSIC_ARRANGEMENTS,MUSIC_PATTERNS} from '../src/music-score.js';

const enemy = (type,alive = true) => ({type,alive});
const stateFor = (type,count = 1) => selectMusicState(Array.from({length:count},() => enemy(type)));
const score = state => Array.from({length:MUSIC_STEPS},(_,step) => scoreStep(step,state)).flat();

test('priority follows the supplied order and changes after the last dominant tank dies', () => {
  const order = ['brown','gray','teal','yellow','pink','purple','green','white','black'];
  const canonical = type => ({gray:'grey',pink:'red'}[type] ?? type);
  assert.deepEqual(MUSIC_PRIORITY,order.map(canonical));
  for (let i=1;i<order.length;i++) {
    assert.equal(selectMusicState([enemy(order[i]),enemy(order[i-1])]).dominant,canonical(order[i]));
  }
  assert.equal(selectMusicState([enemy('black',false),enemy('white')]).dominant,'white');
});

test('all 22 arrangements retain the original piccolo melody and timing', () => {
  assert.equal(Object.keys(MUSIC_ARRANGEMENTS).length,22);
  const melody = MUSIC_ARRANGEMENTS['brown:1'].parts.piccolo;
  for (const [key,arrangement] of Object.entries(MUSIC_ARRANGEMENTS)) {
    assert.equal(arrangement.parts.piccolo,melody,key);
    const [type,count] = key.split(':');
    const state = stateFor(type,Number(count));
    const notes = score(state);
    assert.ok(notes.every(n => n.duration>0 && n.offset>=0 && n.offset<1/24 && n.note<=127));
    assert.deepEqual(scoreStep(0,state),scoreStep(MUSIC_STEPS,state));
    const piccolo = notes.filter(n => n.voice==='piccolo');
    assert.equal(piccolo.length,MUSIC_PATTERNS[melody].length,key);
    assert.ok(notes.every(n => sampleRegion(n.voice,n.note,n.velocity)),key);
  }
  const state = stateFor('brown');
  const parts=stateFor('black').parts;
  const attacks=voice=>MUSIC_PATTERNS[parts[voice]].map(n=>n[0]);
  assert.deepEqual(attacks('bassDrum'),attacks('cymbal'));
  assert.deepEqual(attacks('bassDrum'),attacks('chimes'));
  assert.ok(attacks('bassDrum').every(tick=>tick%480===240));
  assert.deepEqual(score(selectMusicState([enemy('black',false)])),[]);
});

test('instrumentation follows reference substitutions rather than cumulative layers', () => {
  const parts = (type,count) => Object.keys(stateFor(type,count).parts).sort();
  assert.deepEqual(parts('brown',1),['piccolo','snare']);
  assert.ok(!parts('teal',1).includes('snare'));
  assert.ok(parts('teal',2).includes('snare'));
  assert.ok(parts('purple',1).includes('tuba'));
  assert.ok(!parts('purple',1).includes('triangle'));
  assert.ok(parts('green',1).includes('chimes'));
  assert.ok(!parts('green',2).includes('snare'));
  assert.ok(parts('green',3).includes('snare'));
  assert.ok(parts('white',1).includes('sawtooth'));
  assert.ok(!parts('white',1).includes('chimes'));
  assert.ok(!parts('black',1).includes('snare'));
  assert.notEqual(stateFor('green',3).parts.timpani,stateFor('green',4).parts.timpani);
  assert.equal(stateFor('green',32).key,'green:4');
  assert.equal(selectMusicState([enemy('teal'),enemy('brown')]).key,'teal:2');
});

test('black keeps exactly the same score regardless of count or lower priority survivors', () => {
  const baseline = score(stateFor('black'));
  for (const count of [2,3,4,32]) assert.deepEqual(score(stateFor('black',count)),baseline);
  assert.deepEqual(score(selectMusicState(MUSIC_PRIORITY.map(type => enemy(type)))),baseline);
});

test('sawtooth doubles the piccolo three octaves below instead of replacing it', () => {
  const parts = stateFor('white').parts;
  const piccolo = MUSIC_PATTERNS[parts.piccolo], sawtooth = MUSIC_PATTERNS[parts.sawtooth];
  assert.ok(sawtooth.length<piccolo.length);
  for (const [tick,note] of sawtooth) assert.ok(piccolo.some(n => n[0]===tick && n[1]===note+36));
});

test('custom SoundFont patches select separate drum samples and snare velocity layers', () => {
  assert.equal(sampleRegion('bassDrum',24,100).sample,7);
  assert.equal(sampleRegion('cymbal',43,100).sample,12);
  assert.equal(sampleRegion('timpani',38,100).sample,10);
  assert.equal(sampleRegion('snare',26,40).sample,5);
  assert.equal(sampleRegion('snare',26,100).sample,6);
  assert.equal(sampleRegion('triangle',21,100).sample,13);
  assert.equal(sampleRegion('triangle',22,100).sample,14);
});

test('intro plays only snare, preserves pause position and enters the song once',()=>{
  const context=audioContext(),music=new AdaptiveMusic(context),enemies=[enemy('black')];
  music.update(enemies,true,4);
  assert.equal(music.inIntro,true);assert.equal(music.step,0);
  assert.ok(music.voices.size>0);
  assert.ok([...music.voices].every(v=>v.instrument==='snare'&&v.pattern==='intro'));
  const introStep=music.introStep;
  music.update(enemies,false,4);assert.equal(music.nextTime,null);
  music.update(enemies,true,4);
  assert.ok(music.introStep>introStep);assert.equal(music.step,0);
  context.currentTime=4;
  music.update(enemies,true,0);
  assert.equal(music.inIntro,false);assert.ok(music.step>0);
  assert.ok([...music.voices].some(v=>v.instrument==='piccolo'));
  const phase=music.step;
  music.update(enemies,true,0);assert.equal(music.step,phase);
  const late=new AdaptiveMusic(context);
  late.update(enemies,true,1);
  assert.ok(late.introStep>=72);assert.equal(late.step,0);
});

test('snare preserves its full one-shot decay regardless of keyed note duration',()=>{
  const context=audioContext(),music=new AdaptiveMusic(context);
  const hit=score(stateFor('brown')).find(n=>n.voice==='snare');
  music.play({...hit,duration:.005},1);
  music.play({...hit,duration:.5},1);
  const voices=[...music.voices];
  assert.equal(voices.length,2);
  assert.equal(voices[0].source.stopTime,voices[1].source.stopTime);
  assert.ok(voices[0].source.stopTime>1.09&&voices[0].source.stopTime<1.11);
});

function audioContext() {
  const parameter = () => ({value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  const node = () => ({connect(){},disconnect(){},gain:parameter(),pan:parameter(),threshold:parameter(),ratio:parameter()});
  return {
    currentTime:0,state:'running',destination:node(),
    createGain:node,createDynamicsCompressor:node,createStereoPanner:node,
    createBuffer:(_,length) => ({getChannelData:() => new Float32Array(length)}),
    createBufferSource:() => ({...node(),playbackRate:parameter(),start(){},stop(time){this.stopTime=time;}}),
  };
}

test('transport keeps common parts and phase across kills, stops on pause and cleans up samples', () => {
  const context = audioContext(), music = new AdaptiveMusic(context);
  const enemies = [enemy('black'),enemy('brown')];
  music.update(enemies,true);
  const phase = music.step;
  const synth = [...music.voices].find(v => v.instrument==='sawtooth');
  const piccolo = [...music.voices].find(v => v.instrument==='piccolo');
  enemies[0].alive = false;
  music.update(enemies,true);
  assert.equal(music.step,phase);
  assert.equal(synth.released,true);
  assert.equal(piccolo.released,false);
  music.update(enemies,false);
  assert.equal(music.nextTime,null);
  assert.ok([...music.voices].every(v => v.released));
  for (const voice of [...music.voices]) voice.source.onended();
  assert.equal(music.voices.size,0);
  music.update(enemies,true);
  assert.ok(music.step>phase);
  music.update([enemy('brown')],true);
  assert.equal(music.step,phase);
  context.currentTime = 100;
  music.update(music.enemies,true);
  assert.ok(music.step<=phase+3);
  context.state = 'suspended';
  music.update(music.enemies,true);
  assert.equal(music.nextTime,null);
});
