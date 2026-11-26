// Original composition. Reference instrumentation, independently authored notes.
export const MUSIC_TITLE = '小さな戦車の行進';
export const MUSIC_PPQ = 480;
export const MUSIC_LOOP_TICKS = 15360;
export const MUSIC_PROGRAMS = {piccolo:0,chimes:6,timpani:2,snare:1,bassDrum:2,cymbal:2,triangle:3,sawtooth:5,tuba:4};
export const MUSIC_PATTERNS = [];
const levels = {piccolo:116,chimes:66,timpani:52,snare:104,bassDrum:100,cymbal:76,triangle:75,sawtooth:71,tuba:88};
const register = (voice, events) => {
  const pattern = events.map(([beat,pitch,length,velocity=88]) =>
    [Math.round(beat*480),pitch,Math.round(length*480),velocity,levels[voice],127,64]);
  pattern.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  MUSIC_PATTERNS.push(pattern);
  return MUSIC_PATTERNS.length-1;
};

// Four two-bar sentences: question, higher question, return, closing answer.
// Dm | Dm/A | Gm | A7 | Dm | Bb | Gm–A7 | Dm–A7.
// Durations and velocities are phrased explicitly, rather than accented by index.
const melodyBars = [
  [[0,69,.08,80],[.5,74,.38,96],[1,74,.22,77],[1.5,77,.22,88],[2,76,.38,82],[3,74,.12,91]],
  [[0,72,.08,77],[.5,74,.25,83],[1,77,.55,92],[2,76,.25,79],[2.5,74,.60,88]],
  [[0,74,.08,80],[.5,79,.38,96],[1,79,.22,77],[1.5,82,.22,88],[2,81,.38,82],[3,79,.12,91]],
  [[0,77,.08,84],[.5,76,.25,79],[1,73,.55,88],[2,76,.25,82],[2.5,69,.60,85]],
  [[0,69,.08,80],[.5,74,.38,96],[1,74,.22,77],[1.5,77,.22,88],[2,76,.38,82],[3,74,.12,91]],
  [[0,77,.40,91],[1,82,.22,93],[1.5,81,.22,78],[2,77,.30,84],[2.5,74,.70,88]],
  [[0,79,.08,92],[.5,77,.25,80],[1,74,.55,86],[2,76,.30,85],[2.5,73,.22,74],[3,69,.12,78]],
  [[0,77,.08,85],[.5,76,.22,77],[1,74,.85,96],[2.5,74,.65,77]],
];
const melody = melodyBars.flatMap((bar,index) => bar.map(([beat,note,length,velocity]) =>
  [index*4+beat,note,length,velocity]));
// Two sixteenth-note pickups: the existing note on beat 0, then the approach
// on beat .25, landing on beat .5. The low doubling shares this timing.
const approaches = [[72,73],[74,76],[77,78],[76,74],[72,73],null,[77,76],[76,74]];
const answers = [[76,74,72],[76,74,72],[81,79,77],[76,73,69],[76,77,76],[76,77,74],[73,76,73],null];
const ornaments = [
  ...approaches.flatMap((notes,bar)=>notes ? [[bar*4+.25,notes.at(-1),.12,79]] : []),
  [20+.5,79,.12,76],[20+.75,81,.12,81],
  ...answers.flatMap((notes,bar)=>notes ? notes.map((note,i)=>[bar*4+3.25+i*.25,note,.12,i===2?76:81]) : []),
];
// Reference gates are roughly half the attack spacing: 39/80, 59/120, 119/240.
const leadLine=[...melody,...ornaments].map(([beat,note,length,velocity])=>
  [beat,note,Math.min(length,119/480),velocity]);
const supportPitches=[[69,69],[69,74],[70,74],[69,73],[69,69],[70,74],[70,73],[69,73]];
const piccoloHarmony=supportPitches.flatMap((notes,bar)=>notes.map((note,i)=>
  [bar*4+1.5+i*2,note,119/480,52]));
const piccolo = register('piccolo',[...leadLine,...piccoloHarmony]);
const sawtooth = register('sawtooth',leadLine.map(([beat,note,length,velocity]) => [beat,note-36,length,velocity-8]));

const roots = [26,21,31,21,26,22,31,26];
// Short chord-tone bass answers on eighth-note offbeats, approached chromatically.
const bassChords=[[26,29,21,29],[21,26,29,21],[31,22,26,22],[21,25,28,31],
  [26,29,21,29],[22,26,29,26],[31,22,21,25],[26,29,21,25]];
const tuba = register('tuba',bassChords.flatMap((notes,bar)=>[
  ...(bar%2===0?[[bar*4,notes[0]-1,119/480,105]]:[]),
  ...notes.map((note,i)=>[bar*4+.5+i,note,119/480,112]),
]));
// One shared accent skeleton joins the kick, cymbal and long bell notes.
export const ACCENT_BEATS=Array.from({length:4},(_,phrase)=>
  [.5,2.5,4.5,5.5,6.5].map(beat=>phrase*8+beat)).flat();
const bellChords=[[69,77],[69,74],[70,74],[69,73],[69,77],[70,77],[70,73],[69,74]];
const harmonicBoundaries=[8,12,16,20,24,26,28,31,32];
const chimes=register('chimes',ACCENT_BEATS.map((beat,i)=>{
  const bar=Math.floor(beat/4),boundary=harmonicBoundaries.find(end=>end>beat);
  const note=bar===6&&beat>=26?73:bar===7&&beat>=31?73:bellChords[bar][i%2];
  return [beat,note,Math.min(i%2?3:5,boundary-beat-.04),78];
}));
// Master uses rising triplet rolls into accented half-beats, then lighter taps.
// Repeat that gesture three times and close the two-bar sentence on beat 7.
// The velocity layers change at the crescendo's peak, not on arbitrary ghosts.
export const SNARE_PHRASE = [
  ...[0,2,4].flatMap(beat=>[
    [beat,26,.165,24],[beat+1/6,26,.165,44],[beat+1/3,26,.165,65],
    [beat+.5,26,.248,98],[beat+1,26,.248,58],[beat+1.5,26,.248,64],
  ]),
  [6,26,.165,24],[6+1/6,26,.165,44],[6+1/3,26,.165,65],
  [6.5,26,.248,96],[7,26,.20,101],
];
const snare = register('snare',Array.from({length:4},(_,phrase) =>
  SNARE_PHRASE.map(([beat,note,length,velocity])=>[phrase*8+beat,note,length,velocity])).flat());
const bassDrum=register('bassDrum',ACCENT_BEATS.map(beat=>[beat,24,239/480,112]));
const cymbal=register('cymbal',ACCENT_BEATS.map((beat,i)=>[beat,43,i%5<2?959/480:479/480,i%5===0?63:52]));
const triangle = register('triangle',Array.from({length:8},(_,bar) => [
  [bar*4+.5,21,359/480,82],[bar*4+1.5,22,359/480,82],
  [bar*4+2.5,21,359/480,82],[bar*4+3.5,22,359/480,82],
]).flat());
const timpaniPitch=bar=>{const root=roots[bar];return root<29?root+12:root;};
const timpaniRoll=(beat,note)=>[.125,.25,.375].map((offset,i)=>[beat+offset,note,59/480,[54,65,91][i]]);
// Sparse variants really leave bars empty; a roll launches each four-bar phrase.
const timpani=register('timpani',[0,16].flatMap((beat,phrase)=>[
  ...timpaniRoll(beat,33),[beat+.5,33,959/480,112],[beat+2.5,38,959/480,104],
  [beat+4.5,phrase?41:33,479/480,102],[beat+5.5,phrase?41:33,239/480,98],
  [beat+6,phrase?38:41,239/480,96],[beat+6.5,phrase?34:38,959/480,106],
]));
const busyTimpani=(alternate=false)=>Array.from({length:8},(_,bar)=>[
  ...(bar%2===0?timpaniRoll(bar*4,timpaniPitch(bar)):[]),
  ...[.5,2.5].map((beat,i)=>[bar*4+beat,bar===6&&i===1?33:timpaniPitch(bar),i?479/480:959/480,i?98:108]),
  ...(bar%2===1?[[bar*4+1.5,timpaniPitch(bar),239/480,88],
    [bar*4+3,bar>=6?33:timpaniPitch(bar),alternate?59/480:239/480,76]]:[]),
]).flat();
const timpaniDense = register('timpani',busyTimpani());
const timpaniAlternate = register('timpani',busyTimpani(true));

// Arrangement changes follow the reference roles; no reference note data is used.
const parts = {piccolo,snare,triangle,timpani,tuba,chimes,sawtooth,bassDrum,cymbal};
const arrangement = (names, dense = false) => ({
  parts:Object.fromEntries(names.split(' ').map(name => [name,name==='timpani'&&dense
    ? dense==='alternate'?timpaniAlternate:timpaniDense : parts[name]])),
});
export const MUSIC_ARRANGEMENTS = {
  'brown:1':arrangement('piccolo snare'),
  'grey:1':arrangement('piccolo snare triangle'),
  'grey:2':arrangement('piccolo snare triangle timpani'),
  'teal:1':arrangement('piccolo timpani cymbal triangle'),
  'teal:2':arrangement('piccolo timpani cymbal triangle snare'),
  'yellow:1':arrangement('piccolo timpani bassDrum cymbal triangle'),
  'yellow:2':arrangement('piccolo timpani bassDrum cymbal triangle snare'),
  'yellow:3':arrangement('piccolo timpani bassDrum cymbal triangle snare',true),
  'red:1':arrangement('piccolo timpani snare',true),
  'red:2':arrangement('piccolo timpani snare cymbal',true),
  'red:3':arrangement('piccolo timpani snare cymbal triangle',true),
  'purple:1':arrangement('piccolo timpani cymbal tuba'),
  'purple:2':arrangement('piccolo timpani cymbal tuba snare bassDrum'),
  'purple:3':arrangement('piccolo timpani cymbal tuba snare bassDrum triangle',true),
  'green:1':arrangement('piccolo chimes timpani cymbal tuba'),
  'green:2':arrangement('piccolo chimes timpani cymbal tuba bassDrum'),
  'green:3':arrangement('piccolo chimes timpani cymbal tuba bassDrum snare triangle'),
  'green:4':arrangement('piccolo chimes timpani cymbal tuba bassDrum snare triangle',true),
  'white:1':arrangement('piccolo timpani snare sawtooth tuba'),
  'white:2':arrangement('piccolo timpani snare sawtooth tuba bassDrum triangle',true),
  'white:3':arrangement('piccolo timpani snare sawtooth tuba bassDrum triangle cymbal','alternate'),
  'black:1':arrangement('piccolo chimes timpani bassDrum cymbal triangle sawtooth tuba',true),
};
