import { MUSIC_PPQ, MUSIC_LOOP_TICKS, MUSIC_PATTERNS, MUSIC_ARRANGEMENTS, MUSIC_PROGRAMS } from './music-score.js';
import { MUSIC_PATCHES, MUSIC_SAMPLES, MUSIC_PCM } from './music-bank.js';
import { INTRO_SECONDS, INTRO_TICKS, INTRO_NOTES } from './mission-intro.js';

export const MUSIC_BPM = 120;
// Existing profiles use grey for gray, and red for pink. Priority is user supplied.
export const MUSIC_PRIORITY = ['brown','grey','teal','yellow','red','purple','green','white','black'];
const QUANTUM_TICKS = 40;
export const MUSIC_STEPS = MUSIC_LOOP_TICKS / QUANTUM_TICKS;
const TICK_SECONDS = 60 / MUSIC_BPM / MUSIC_PPQ;
const STEP_SECONDS = QUANTUM_TICKS * TICK_SECONDS;
const VARIANT_LIMIT = {brown:1,grey:2,teal:2,yellow:3,red:3,purple:3,green:4,white:3,black:1};
const INTRO_STEPS=INTRO_TICKS/QUANTUM_TICKS;
export function introScoreStep(step){
  const tick=step*QUANTUM_TICKS;
  return INTRO_NOTES.filter(n=>n[0]>=tick&&n[0]<tick+QUANTUM_TICKS).map(([start,note,length,velocity,volume,expression,pan])=>({
    voice:'snare',pattern:'intro',note,velocity,volume,expression,pan,
    duration:length*TICK_SECONDS,offset:(start-tick)*TICK_SECONDS,
  }));
}

export function selectMusicState(enemies) {
  const living = enemies.filter(e => e.alive);
  const types = new Set(living.map(e => ({gray:'grey',pink:'red'}[e.type] ?? e.type)));
  const dominant = MUSIC_PRIORITY.findLast(type => types.has(type)) ?? 'brown';
  const variant = Math.min(Math.max(1,living.length),VARIANT_LIMIT[dominant]);
  const key = `${dominant}:${variant}`;
  return {count:living.length,dominant,variant,key,parts:MUSIC_ARRANGEMENTS[key].parts};
}

// Schedule the authored score with note lengths, velocity, and channel volume.
const scoreCache = new Map();
export function scoreStep(step, state) {
  if (!state.count) return [];
  if (!scoreCache.has(state.key)) {
    const buckets = Array.from({length:MUSIC_STEPS},() => []);
    for (const [voice,pattern] of Object.entries(state.parts)) {
      for (const [tick,note,length,velocity,volume,expression,pan] of MUSIC_PATTERNS[pattern]) {
        buckets[Math.floor(tick/QUANTUM_TICKS)].push({
          voice,pattern,note,velocity,volume,expression,pan,
          duration:length*TICK_SECONDS,offset:(tick%QUANTUM_TICKS)*TICK_SECONDS,
        });
      }
    }
    scoreCache.set(state.key,buckets);
  }
  return scoreCache.get(state.key)[((step%MUSIC_STEPS)+MUSIC_STEPS)%MUSIC_STEPS];
}

export function sampleRegion(voice, note, velocity) {
  return MUSIC_PATCHES[MUSIC_PROGRAMS[voice]]?.find(r =>
    note >= r.keys[0] && note <= r.keys[1] && velocity >= r.velocities[0] && velocity <= r.velocities[1]);
}

export class AdaptiveMusic {
  constructor(context) {
    this.context = context;
    this.output = context.createGain();
    this.output.gain.value = .38;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    this.output.connect(compressor);
    compressor.connect(context.destination);
    this.voices = new Set();
    this.step = 0;
    this.introStep = 0;
    this.inIntro = false;
    this.nextTime = null;
    this.enemies = null;
    // Embedded PCM keeps file:// playback working without a network request.
    const binary = atob(MUSIC_PCM);
    const pcm = new DataView(Uint8Array.from(binary,c => c.charCodeAt(0)).buffer);
    this.samples = MUSIC_SAMPLES.map(sample => {
      const buffer = context.createBuffer(1,sample.length,sample.rate);
      const output = buffer.getChannelData(0);
      for (let i=0;i<sample.length;i++) output[i] = pcm.getInt16((sample.offset+i)*2,true)/32768;
      return buffer;
    });
  }

  update(enemies, active, introRemaining=0) {
    if (enemies !== this.enemies) {
      this.stop();
      this.step = 0;
      this.introStep = 0;
      this.inIntro = introRemaining>0;
      this.enemies = enemies;
    }
    const state = selectMusicState(enemies);
    if (!active || !state.count || this.context.state !== 'running') {
      this.stop();
      return;
    }
    const now = this.context.currentTime;
    const inIntro=introRemaining>0;
    if(inIntro!==this.inIntro){
      // Keep the next beat's scheduled time across the intro/main boundary.
      if(inIntro)this.stop();
      this.step=0;
      this.inIntro=inIntro;
    }
    if(inIntro)this.introStep=Math.max(this.introStep,Math.floor((INTRO_SECONDS-introRemaining)/STEP_SECONDS));
    // Retain unchanged parts; fade removed parts and replaced rhythmic patterns.
    for (const voice of this.voices) {
      if ((inIntro ? voice.pattern!=='intro' : state.parts[voice.instrument]!==voice.pattern)) this.release(voice);
    }
    this.nextTime ??= now + .025;
    if (this.nextTime < now) this.nextTime = now + .025;
    while (this.nextTime < now + .09) {
      if(inIntro){
        if(this.introStep>=INTRO_STEPS)break;
        for(const note of introScoreStep(this.introStep++))this.play(note,this.nextTime+note.offset);
      }else{
        for (const note of scoreStep(this.step,state)) this.play(note,this.nextTime+note.offset);
        this.step = (this.step+1)%MUSIC_STEPS;
      }
      this.nextTime += STEP_SECONDS;
    }
  }

  play({voice:instrument,pattern,note,velocity,volume,expression,pan,duration}, time) {
    const region = sampleRegion(instrument,note,velocity);
    if (!region) return;
    const context = this.context, source = context.createBufferSource(), gain = context.createGain();
    source.buffer = this.samples[region.sample];
    source.playbackRate.value = 2 ** ((note-region.root+region.tune/100)/12);
    const sample = MUSIC_SAMPLES[region.sample];
    source.loop = (region.mode === 1 || region.mode === 3) && sample.loopEnd > sample.loopStart;
    if (source.loop) {
      source.loopStart = sample.loopStart;
      source.loopEnd = sample.loopEnd;
    }
    const level = region.gain*(velocity/127)**2*(volume/127)**2*(expression/127);
    const attack = Math.max(.002,region.attack), release = Math.max(.015,region.release);
    const held = Math.max(.003,duration), noteOff = time+held;
    let endTime=noteOff+release+.02;
    if(instrument==='snare'){
      // A drum hit is a one-shot: preserve its transient and natural decay.
      // A keyed envelope had softened the attack and truncated quiet hits.
      const naturalLength=sample.length/sample.rate/source.playbackRate.value;
      endTime=time+naturalLength;
      gain.gain.setValueAtTime(level,time);
      gain.gain.setValueAtTime(level,time+Math.max(0,naturalLength-.003));
      gain.gain.linearRampToValueAtTime(0,endTime);
    }else{
      gain.gain.setValueAtTime(0,time);
      gain.gain.linearRampToValueAtTime(level,time+Math.min(attack,held));
      if (held > attack) gain.gain.setTargetAtTime(level*region.sustain,time+attack,Math.max(.003,region.decay/5));
      gain.gain.setTargetAtTime(0,noteOff,release/5);
    }
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1,Math.min(1,(pan-64)/63));
    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.output);
    const voice = {source,gain,panner,instrument,pattern,released:false};
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      this.voices.delete(voice);
    };
    source.start(time);
    source.stop(endTime);
  }

  release(voice) {
    if (voice.released) return;
    voice.released = true;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0,now,.005);
    voice.source.stop(now+.025);
  }

  stop() {
    for (const voice of this.voices) this.release(voice);
    this.nextTime = null;
  }
}
