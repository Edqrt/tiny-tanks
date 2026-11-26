import { mkdir, writeFile } from 'node:fs/promises';
import { MUSIC_TITLE,MUSIC_PPQ,MUSIC_LOOP_TICKS,MUSIC_PATTERNS,MUSIC_ARRANGEMENTS,MUSIC_PROGRAMS } from '../src/music-score.js';
import { MUSIC_BPM } from '../src/music.js';

const vlq = value => {
  const bytes = [value&127];
  while ((value=Math.floor(value/128))>0) bytes.unshift((value&127)|128);
  return bytes;
};
const chunk = (name,bytes) => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([Buffer.from(name),size,Buffer.from(bytes)]);
};
const textEvent = (type,text) => {
  const bytes = Buffer.from(text,'utf8');
  return [255,type,...vlq(bytes.length),...bytes];
};
const tempo = Math.round(60000000/MUSIC_BPM);
const conductor = chunk('MTrk',[
  0,...textEvent(3,MUSIC_TITLE),
  0,255,81,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,
  0,255,88,4,4,2,24,8,
  ...vlq(MUSIC_LOOP_TICKS),255,47,0,
]);
const tracks = [conductor];
for (const [channel,[voice,pattern]] of Object.entries(MUSIC_ARRANGEMENTS['black:1'].parts).entries()) {
  const notes = MUSIC_PATTERNS[pattern], events = [];
  for (const [tick,note,length,velocity] of notes) {
    events.push({tick,bytes:[144|channel,note,velocity],order:1});
    events.push({tick:tick+length,bytes:[128|channel,note,0],order:0});
  }
  events.sort((a,b) => a.tick-b.tick || a.order-b.order);
  const bytes = [0,...textEvent(3,voice),0,192|channel,MUSIC_PROGRAMS[voice],
    0,176|channel,7,notes[0][4],0,176|channel,10,64];
  let previous = 0;
  for (const event of events) {
    bytes.push(...vlq(event.tick-previous),...event.bytes);
    previous = event.tick;
  }
  bytes.push(...vlq(Math.max(0,MUSIC_LOOP_TICKS-previous)),255,47,0);
  tracks.push(chunk('MTrk',bytes));
}
const header = Buffer.alloc(6);
header.writeUInt16BE(1,0);
header.writeUInt16BE(tracks.length,2);
header.writeUInt16BE(MUSIC_PPQ,4);
await mkdir(new URL('../artifacts/audio/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/audio/music-original.mid',import.meta.url),Buffer.concat([chunk('MThd',header),...tracks]));
console.log('オリジナル曲のMIDIを書き出しました: artifacts/audio/music-original.mid（Black編成、付属SoundFont用）');
