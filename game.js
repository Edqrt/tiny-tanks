import { Game, WIDTH, HEIGHT, BOUNDS, clamp, isTankVisible } from './engine.js';
import { TILE_SIZE,PLAYTEST_STORAGE_KEY,parseMapPack } from './tilemap.js';
import { drawHole, drawMineBlast, createBulletSmokeRenderer } from './terrain-render.js';
import { createTrackLayer } from './track-render.js';
import { AdaptiveMusic } from './music.js';

const $ = id => document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d');
const trackLayer=createTrackLayer(WIDTH,HEIGHT);
const drawBulletSmoke=createBulletSmokeRenderer();
const testMode=new URLSearchParams(window.location.search).get('editor')==='1';
let customMaps,startupError;
if(testMode){try{customMaps=parseMapPack(sessionStorage.getItem(PLAYTEST_STORAGE_KEY));}catch{startupError='編集データを読み込めませんでした。エディタからもう一度試遊してください。';}}
const game=customMaps?new Game(Math.random,customMaps):new Game();
const bestKey=testMode?'tiny-tanks-test-best':'tiny-tanks-best';
if(testMode)$('editor-link').setAttribute('aria-label','編集に戻る');
const keys=new Set(),pointer={x:560,y:320},stick={x:0,y:0};
let firing=false,paused=false,sound=true,audio,music,previous=0,accumulator=0,lastState='ready',stateAge=0,shake=0,joystickPointer=null;
let best=0;try{best=Number(localStorage.getItem(bestKey))||0;}catch{}
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function enableAudio(){
  audio??=new (window.AudioContext||window.webkitAudioContext)();
  music??=new AdaptiveMusic(audio);
  if(audio.state==='suspended')audio.resume().catch(()=>{});
}
function syncMusic(){music?.update(game.enemies,sound&&!paused&&!document.hidden&&game.state==='playing',game.introRemaining);}
function tone(freq,duration,type='sine',volume=.04,slide=0){
  if(!sound)return;
  try{
    enableAudio();
    const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25,freq+slide),audio.currentTime+duration);
    gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
    osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
  }catch{}
}
function eventSound(type){
  if(type==='shot')tone(160,.09,'triangle',.045,-105);
  if(type==='bounce')tone(920,.06,'sine',.025,-450);
  if(type==='mine')tone(650,.1,'sine',.03,200);
  if(type==='explosion'){tone(95,.4,'sawtooth',.045,-65);shake=reducedMotion?0:6;}
  if(type==='clear'){tone(440,.2,'sine',.05,220);setTimeout(()=>tone(880,.3,'sine',.04,200),150);}
}

function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}

// Cache the wood grain so rendering doesn't generate noise each frame.
const floor=document.createElement('canvas');floor.width=WIDTH;floor.height=HEIGHT;
const f=floor.getContext('2d');
let seed=1234;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const {x:fx,y:fy,w:fw,h:fh}=BOUNDS;
f.fillStyle='#b38d56';f.fillRect(0,0,WIDTH,HEIGHT);
const fg=f.createLinearGradient(fx,fy,fx+fw,fy+fh);fg.addColorStop(0,'#ead5a6');fg.addColorStop(.6,'#dfc18c');fg.addColorStop(1,'#d5b77f');
f.fillStyle=fg;f.fillRect(fx,fy,fw,fh);
f.save();f.beginPath();f.rect(fx,fy,fw,fh);f.clip();
for(let y=fy;y<fy+fh;y+=76){
  f.fillStyle='#9d79371c';f.fillRect(fx,y,fw,1);f.fillStyle='#fff1c54a';f.fillRect(fx,y+1,fw,1);
  for(let k=0;k<60;k++){
    const x=fx+rand()*fw,gy=y+rand()*75;
    f.strokeStyle=`rgba(131,93,49,${.025+rand()*.04})`;f.lineWidth=.5;f.beginPath();f.moveTo(x,gy);f.bezierCurveTo(x+30,gy-2,x+70,gy+2,x+70+rand()*160,gy);f.stroke();
  }
}
f.strokeStyle='#9e783f33';f.lineWidth=1;
for(let y=fy+TILE_SIZE;y<fy+fh;y+=TILE_SIZE)for(let x=fx+TILE_SIZE;x<fx+fw;x+=TILE_SIZE){f.beginPath();f.moveTo(x-2,y);f.lineTo(x+2,y);f.moveTo(x,y-2);f.lineTo(x,y+2);f.stroke();}
f.restore();f.strokeStyle='#87673f';f.lineWidth=2;f.strokeRect(fx-1,fy-1,fw+2,fh+2);
f.strokeStyle='#efd4a3';f.lineWidth=4;f.strokeRect(fx-14,fy-14,fw+28,fh+28);
for(const x of [fx-25,fx+fw+25])for(const y of [fy-25,fy+fh+25]){f.fillStyle='#8e744f';f.beginPath();f.arc(x,y,3,0,Math.PI*2);f.fill();}

function wall(w){
  const tile=TILE_SIZE;
  rounded(w.x+5,w.y+9,w.w,w.h,3,'#5f482133');
  for(let x=w.x;x<w.x+w.w;x+=tile)for(let y=w.y;y<w.y+w.h;y+=tile){
    const tw=Math.min(tile,w.x+w.w-x),th=Math.min(tile,w.y+w.h-y);
    rounded(x,y,tw,th,2,w.soft?'#bd9565':'#b69f72','#8b774e');
    ctx.fillStyle=w.soft?'#d9b788':'#d8c69b';ctx.fillRect(x+2,y+2,tw-4,5);ctx.fillRect(x+2,y+2,4,th-4);
    ctx.fillStyle=w.soft?'#a77d50':'#968253';ctx.fillRect(x+3,y+th-6,tw-5,4);ctx.fillRect(x+tw-5,y+5,3,th-7);
    ctx.strokeStyle='#e9d8ad33';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+tw*.225,y+th*.35);ctx.lineTo(x+tw*.775,y+th*.35);ctx.moveTo(x+tw*.225,y+th*.55);ctx.lineTo(x+tw*.775,y+th*.55);ctx.stroke();
    if(w.soft){ctx.strokeStyle='#86653e';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(x+tw*.525,y+th*.075);ctx.lineTo(x+tw*.4,y+th*.35);ctx.lineTo(x+tw*.625,y+th*.55);ctx.lineTo(x+tw*.45,y+th*.925);ctx.moveTo(x+tw*.625,y+th*.55);ctx.lineTo(x+tw*.925,y+th*.425);ctx.stroke();}
  }
}
const playerPalette=['#447c91','#70a9bc','#315c6c'];
function tank(t){
  if(!t.alive||!isTankVisible(t,game.state,game.introRemaining))return;
  ctx.save();ctx.translate(t.x+4,t.y+6);ctx.rotate(t.angle);rounded(-21,-18,42,36,7,'#5e472746');ctx.restore();
  const [base,light,dark]=t.profile?t.profile.palette:playerPalette;
  ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.angle);
  for(const side of [-1,1]){
    const y=side<0?-19:10;rounded(-21,y,42,9,3,'#3b4037');
    for(let i=0;i<7;i++){const x=-19+(i*6+t.tread*.6)%38;ctx.fillStyle='#6a6b54';ctx.fillRect(x,y+1,3,7);}
  }
  rounded(-18,-13,36,26,4,base);ctx.fillStyle=light;ctx.fillRect(-15,-12,28,3);ctx.fillStyle=dark;ctx.fillRect(-16,9,31,3);
  ctx.strokeStyle=dark;ctx.lineWidth=1.2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-12+i*4,-7);ctx.lineTo(-12+i*4,6);ctx.stroke();}
  ctx.restore();
  ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.aim);
  rounded(-11,-11,23,23,5,dark);rounded(-12,-13,23,23,5,light);rounded(3,-4,30,8,1,dark);ctx.fillStyle=base;ctx.fillRect(5,-4,25,3);ctx.fillStyle=light;ctx.fillRect(28,-5,5,10);
  rounded(-6,-8,9,11,3,base);ctx.fillStyle='#e5e1bcaa';ctx.fillRect(-9,6,4,2);ctx.restore();
  if(t.type==='player'){
    ctx.fillStyle='#44778a';ctx.beginPath();ctx.moveTo(t.x-4,t.y-34);ctx.lineTo(t.x+4,t.y-34);ctx.lineTo(t.x,t.y-28);ctx.fill();
  }
}

function render(){
  ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.save();
  if(shake>.1){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.88;}
  ctx.drawImage(floor,0,0);
  trackLayer.draw(ctx,game.tracks);
  game.holes.forEach(hole=>drawHole(ctx,hole));
  // Discrete tracks and wrecks remain readable against the wooden board.
  for(const w of game.wrecks){ctx.save();ctx.translate(w.x,w.y);ctx.rotate(w.angle);ctx.fillStyle='#594f3b44';ctx.beginPath();ctx.ellipse(0,0,28,22,0,0,Math.PI*2);ctx.fill();rounded(-17,-15,34,30,4,'#685d4655');ctx.strokeStyle='#4a463d88';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-9,-8);ctx.lineTo(9,8);ctx.moveTo(-9,8);ctx.lineTo(9,-8);ctx.stroke();ctx.restore();}
  for(const m of game.mines){ctx.fillStyle='#594b2a33';ctx.beginPath();ctx.ellipse(m.x+3,m.y+4,13,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6b7250';ctx.beginPath();ctx.arc(m.x,m.y,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d1bc7b';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=m.age>.7&&Math.sin(m.age*15)>0?'#f17a43':'#b6b286';ctx.beginPath();ctx.arc(m.x,m.y,3,0,Math.PI*2);ctx.fill();}
  if(game.state==='playing'&&!paused){
    const p=game.player;ctx.save();ctx.strokeStyle='#366b7855';ctx.lineWidth=1.5;ctx.setLineDash([3,9]);ctx.beginPath();
    ctx.moveTo(p.x+Math.cos(p.aim)*38,p.y+Math.sin(p.aim)*38);ctx.lineTo(p.x+Math.cos(p.aim)*170,p.y+Math.sin(p.aim)*170);ctx.stroke();ctx.restore();
    ctx.save();ctx.strokeStyle='#376d7b99';ctx.lineWidth=1;ctx.beginPath();ctx.arc(pointer.x,pointer.y,8,0,Math.PI*2);for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){ctx.moveTo(pointer.x+dx*11,pointer.y+dy*11);ctx.lineTo(pointer.x+dx*15,pointer.y+dy*15);}ctx.stroke();ctx.restore();
  }
  game.walls.forEach(wall);
  drawBulletSmoke(ctx,game.bulletSmoke,reducedMotion);
  game.enemies.forEach(tank);tank(game.player);
  for(const b of game.bullets){
    ctx.fillStyle=b.player?'#fff9ce':'#ffe3a4';ctx.strokeStyle='#967044';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  for(const blast of game.mineBlasts)drawMineBlast(ctx,blast,reducedMotion);
  for(const p of game.particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}ctx.globalAlpha=1;
  ctx.restore();
}

function hud(){
  $('mission').innerHTML=`${String(game.level+1).padStart(2,'0')} <span>/ ${game.levels.length}</span>`;
  $('lives').textContent=Array.from({length:Math.max(3,game.lives)},(_,i)=>i<game.lives?'◆':'◇').join(' ');
  $('targets').textContent=String(game.enemies.filter(e=>e.alive).length).padStart(2,'0');
  $('score').textContent=String(game.score).padStart(5,'0');
  const shots=game.bullets.filter(b=>b.owner===game.player.id).length;
  $('ammo').textContent=Array.from({length:5},(_,i)=>i<5-shots?'●':'○').join(' ');
  $('mines').textContent=2-game.mines.filter(m=>m.owner===game.player.id).length;
  $('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'ゲームを再開':'一時停止');
}
function card(symbol,label,title=''){
  $('card-title').textContent=title;$('card-title').hidden=!title;
  const lifeBonus=(game.state==='clear'||game.state==='won')&&(game.level+1)%5===0;
  $('life-bonus').hidden=!lifeBonus;
  $('primary').textContent=symbol;$('primary').setAttribute('aria-label',label);
  $('overlay').hidden=false;$('announcement').textContent=(title||label)+(lifeBonus?' 残機＋1':'');
}
function showState(){
  if(paused){card('▶','ゲームを再開','Ⅱ');return;}
  if(game.state==='playing'){$('overlay').hidden=true;return;}
  if(game.state==='clear')card('→','次のミッションへ','✓');
  if(game.state==='dead')card('↻','再出撃する','×');
  if(game.state==='gameover'||game.state==='won'){
    best=Math.max(best,game.score);try{localStorage.setItem(bestKey,String(best));}catch{}
    card('↻','最初から挑戦',game.state==='won'?'★':'×');
  }
}
function clearInput(){keys.clear();firing=false;stick.x=stick.y=0;joystickPointer=null;$('joystick').firstElementChild.style.transform='';}
function togglePause(){if(game.state!=='playing')return;paused=!paused;clearInput();syncMusic();showState();hud();}
function primary(){
  if(sound){try{enableAudio();}catch{}}
  const previousEnemies=game.enemies;
  if(paused){paused=false;}
  else if(game.state==='ready'||game.state==='gameover'||game.state==='won')game.start();
  else if(game.state==='clear')game.next();
  else if(game.state==='dead')game.retry();
  if(game.enemies!==previousEnemies)game.beginIntro();
  clearInput();lastState=game.state;stateAge=0;syncMusic();showState();hud();canvas.focus({preventScroll:true});
}
$('primary').addEventListener('click',primary);$('pause').addEventListener('click',togglePause);
$('sound').addEventListener('click',()=>{sound=!sound;$('sound').textContent=sound?'♫':'♪';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'サウンドを無効にする':'サウンドを有効にする');if(sound)tone(560,.1);syncMusic();});
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)&&e.target.tagName!=='BUTTON')e.preventDefault();
  if(e.repeat)return;
  if(e.code==='KeyP'||e.code==='Escape'){togglePause();return;}
  if(e.code==='KeyR'&&game.state==='dead'){primary();return;}
  keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(game.state==='playing'&&!paused)togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='playing'&&!paused)togglePause();});
function aim(e){
  const rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/WIDTH,rect.height/HEIGHT);
  pointer.x=clamp((e.clientX-rect.left-(rect.width-WIDTH*scale)/2)/scale,BOUNDS.x,BOUNDS.x+BOUNDS.w);
  pointer.y=clamp((e.clientY-rect.top-(rect.height-HEIGHT*scale)/2)/scale,BOUNDS.y,BOUNDS.y+BOUNDS.h);
}
canvas.addEventListener('pointermove',aim);
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;aim(e);canvas.focus({preventScroll:true});if(e.pointerType!=='touch')firing=true;});
window.addEventListener('pointerup',()=>{firing=false;});window.addEventListener('pointercancel',()=>{firing=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const joy=$('joystick');
function moveStick(e){const r=joy.getBoundingClientRect(),dx=(e.clientX-r.left-r.width/2)/28,dy=(e.clientY-r.top-r.height/2)/28,n=Math.max(1,Math.hypot(dx,dy));stick.x=dx/n;stick.y=dy/n;joy.firstElementChild.style.transform=`translate(${stick.x*22}px,${stick.y*22}px)`;}
joy.addEventListener('pointerdown',e=>{joystickPointer=e.pointerId;joy.setPointerCapture(e.pointerId);moveStick(e);});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)moveStick(e);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(name,()=>{joystickPointer=null;stick.x=stick.y=0;joy.firstElementChild.style.transform='';});
$('touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);firing=true;});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('touch-fire').addEventListener(name,()=>{firing=false;});
$('touch-mine').addEventListener('pointerdown',e=>{e.preventDefault();if(game.state==='playing'&&!paused)game.plant();});

function frame(now){
  const elapsed=Math.min((now-previous)/1000||0, .06);previous=now;
  accumulator+=elapsed;
  while(accumulator>=1/120){
    if(!paused){
      game.update(1/120,{x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+stick.x,y:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'))+stick.y,aim:pointer,fire:firing,mine:keys.has('Space')});
      // A key press places one mine; holding Space must not repeatedly lay mines.
      keys.delete('Space');
      for(const event of game.events)eventSound(event.type);game.events.length=0;
      if(game.state!==lastState){lastState=game.state;stateAge=0;clearInput();}
      if(game.state!=='ready'&&game.state!=='playing'){stateAge+=1/120;if(stateAge>=.8&&$('overlay').hidden)showState();}
    }
    accumulator-=1/120;
  }
  syncMusic();render();hud();requestAnimationFrame(frame);
}
if(customMaps)card('▶','試遊を開始');
if(startupError){card('▶','標準ステージで遊ぶ','!');$('announcement').textContent=startupError;}
hud();requestAnimationFrame(frame);
