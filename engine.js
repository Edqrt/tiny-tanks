import { getEnemyProfile } from './enemy-profiles.js';
import { TILE_LEVELS } from './levels.js';
import { INTRO_SECONDS } from './mission-intro.js';
import { compileMap, worldCell,MAP_ORIGIN,MAP_COLS,MAP_ROWS,TILE_SIZE } from './tilemap.js';

export const WIDTH = 1120, HEIGHT = 640;
export const BOUNDS = { ...MAP_ORIGIN,w:MAP_COLS*TILE_SIZE,h:MAP_ROWS*TILE_SIZE };
const SHOT_BOUNDS={left:BOUNDS.x+4,right:BOUNDS.x+BOUNDS.w-4,top:BOUNDS.y+4,bottom:BOUNDS.y+BOUNDS.h-4};
export const TANK_RADIUS = 18;
export const MINE_BLAST_RADIUS = 100*2/3;
export const TRACK_SPACING = 12, MAX_PENDING_TRACKS = 2048;
export const MAX_BULLET_SMOKE = 600;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function circleRect(x, y, r, box) {
  return Math.hypot(x - clamp(x, box.x, box.x + box.w), y - clamp(y, box.y, box.y + box.h)) < r;
}
export function segmentRect(a, b, box) {
  let lo = 0, hi = 1;
  for (const [p, d, min, max] of [[a.x, b.x-a.x, box.x, box.x+box.w], [a.y, b.y-a.y, box.y, box.y+box.h]]) {
    if (Math.abs(d) < 1e-8) { if (p < min || p > max) return false; }
    else {
      const t1 = (min-p)/d, t2 = (max-p)/d;
      lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}

function rayRect(x,y,dx,dy,box) {
  const tx=Math.abs(dx)<1e-9?[-Infinity,Infinity]:[(box.x-x)/dx,(box.x+box.w-x)/dx].sort((a,b)=>a-b);
  const ty=Math.abs(dy)<1e-9?[-Infinity,Infinity]:[(box.y-y)/dy,(box.y+box.h-y)/dy].sort((a,b)=>a-b);
  if(Math.abs(dx)<1e-9&&(x<box.x||x>box.x+box.w))return null;
  if(Math.abs(dy)<1e-9&&(y<box.y||y>box.y+box.h))return null;
  const entry=Math.max(tx[0],ty[0]),exit=Math.min(tx[1],ty[1]);
  if(exit<0||entry>exit)return null;
  return {distance:Math.max(0,entry),hitX:tx[0]>=ty[0]-1e-7,hitY:ty[0]>=tx[0]-1e-7};
}

export function isTankVisible(t,state,introRemaining=0) {
  return !t.profile?.invisible||state==='ready'||introRemaining>0;
}

export const LEVELS = TILE_LEVELS.map(compileMap);

function mergeShotWalls(walls) {
  let result=walls.map(({x,y,w,h})=>({x,y,w,h}));
  for(const horizontal of [true,false]){
    result.sort((a,b)=>horizontal?a.y-b.y||a.h-b.h||a.x-b.x:a.x-b.x||a.w-b.w||a.y-b.y);
    const merged=[];
    for(const box of result){
      const previous=merged.at(-1);
      if(previous&&(horizontal?previous.y===box.y&&previous.h===box.h&&previous.x+previous.w===box.x:previous.x===box.x&&previous.w===box.w&&previous.y+previous.h===box.y)){
        if(horizontal)previous.w+=box.w;else previous.h+=box.h;
      }else merged.push(box);
    }
    result=merged;
  }
  return result;
}

export class Game {
  constructor(random = Math.random, maps = TILE_LEVELS) {
    this.levels=maps.map(compileMap);
    if(!this.levels.length)throw new Error('レベルが1つ以上必要です。');
    this.random = random; this.level = 0; this.lives = 3; this.score = 0; this.checkpoint = 0; this.serial = 0; this.events = []; this.load(); this.state = 'ready';
  }
  tank(x,y,type) {
    const profile=type==='player'?null:getEnemyProfile(type);
    return { id:++this.serial, x,y,type,profile,angle:-Math.PI/2,aim:-Math.PI/2,alive:true,cooldown:profile?this.sampleRange(profile.initialShotDelay):0,dir:this.random()*Math.PI*2,think:0,tread:0,mineCooldown:0,aimThink:0,vx:0,vy:0 };
  }
  sampleRange([min,max]) { return min===max?min:min+this.random()*(max-min); }
  load() {
    this.introRemaining=0;
    const l = this.levels[this.level]; this.tiles=[...l.tiles]; this.walls = l.walls.map(([x,y,w,h,soft])=>({x,y,w,h,soft:!!soft}));
    this.holes=l.holes.map(([x,y,w,h])=>({x,y,w,h}));
    this.player = this.tank(...l.player,'player'); this.enemies = l.enemies.map(e=>this.tank(...e));
    this.bullets = []; this.bulletSmoke = []; this.mines = []; this.mineBlasts = []; this.particles = []; this.wrecks = []; this.tracks=[];this.events = []; this.time = 0; this.state = 'playing';
  }
  start() { this.level=0;this.lives=3;this.score=0;this.checkpoint=0;this.load(); }
  next() { if (this.state !== 'clear') return; this.level++;this.checkpoint=this.score;this.load(); }
  retry() { if (this.state !== 'dead') return;this.score=this.checkpoint;this.load(); }
  beginIntro() { this.introRemaining=INTRO_SECONDS; }
  emit(type,x,y) { this.events.push({type,x,y}); }
  attackTeam(attack) {
    if(attack.team)return attack.team;
    if(attack.player===true||attack.owner===this.player.id)return 'player';
    return this.enemies.some(e=>e.id===attack.owner)?'enemy':null;
  }
  friendlyAttack(t,attack) {return !!t.profile&&attack.owner!==t.id&&this.attackTeam(attack)==='enemy';}
  blocked(x,y,r=TANK_RADIUS) {
    return this.projectileBlocked(x,y,r)||this.holes.some(h=>circleRect(x,y,r,h));
  }
  projectileBlocked(x,y,r=4) {
    return x-r<BOUNDS.x || y-r<BOUNDS.y || x+r>BOUNDS.x+BOUNDS.w || y+r>BOUNDS.y+BOUNDS.h || this.walls.some(w=>circleRect(x,y,r,w));
  }
  tankBlocked(t,x,y) {
    return this.blocked(x,y)||[this.player,...this.enemies].some(o=>o!==t&&o.alive&&Math.hypot(x-o.x,y-o.y)<TANK_RADIUS*2);
  }
  move(t,dx,dy) {
    const valid=(x,y)=>!this.tankBlocked(t,x,y);
    const ox=t.x,oy=t.y;
    if(valid(t.x+dx,t.y))t.x+=dx;
    if(valid(t.x,t.y+dy))t.y+=dy;
    const moved=Math.hypot(t.x-ox,t.y-oy);
    if(moved>.01) {
      t.angle=Math.atan2(dy,dx);
      for(let offset=TRACK_SPACING-t.tread%TRACK_SPACING;offset<=moved&&this.tracks.length<MAX_PENDING_TRACKS;offset+=TRACK_SPACING){
        const ratio=offset/moved;
        this.tracks.push({x:ox+(t.x-ox)*ratio,y:oy+(t.y-oy)*ratio,angle:t.angle});
      }
      t.tread+=moved;
    }
    return moved;
  }
  shoot(t) {
    if(this.introRemaining>0)return false;
    const cap=t.profile?.maxBullets??5;
    if(!t.alive||t.cooldown>0||this.time<(t.fireSafetyUntil||0)||this.bullets.filter(b=>b.owner===t.id).length>=cap)return false;
    const speed=t.profile?.bulletSpeed??265;
    if(t.profile&&!this.safeEnemyShot(t,speed))return false;
    // Spawn within the hull: close walls are checked by the first physics step.
    this.bullets.push({x:t.x+Math.cos(t.aim)*19,y:t.y+Math.sin(t.aim)*19,vx:Math.cos(t.aim)*speed,vy:Math.sin(t.aim)*speed,owner:t.id,player:t.type==='player',team:t.profile?'enemy':'player',bounces:0,maxBounces:t.profile?.maxBounces??1,age:0,alive:true});
    t.cooldown=t.profile?this.sampleRange(t.profile.shotInterval):.22;
    this.emit('shot',t.x,t.y);return true;
  }
  stepProjectile(b,dt) {
    const ox=b.x,oy=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;
    let hitX=b.x<SHOT_BOUNDS.left||b.x>SHOT_BOUNDS.right;
    let hitY=b.y<SHOT_BOUNDS.top||b.y>SHOT_BOUNDS.bottom;
    for(const w of this.walls)if(circleRect(b.x,b.y,4,w)){
      const xOnly=circleRect(b.x,oy,4,w),yOnly=circleRect(ox,b.y,4,w);
      if(xOnly)hitX=true;if(yOnly)hitY=true;if(!xOnly&&!yOnly){hitX=true;hitY=true;}
    }
    if(!hitX&&!hitY)return null;
    if(b.bounces>=(b.maxBounces??1)){b.alive=false;return {type:'stop',x:ox,y:oy};}
    if(hitX)b.vx=-b.vx;if(hitY)b.vy=-b.vy;b.x=ox;b.y=oy;b.bounces++;
    return {type:'bounce',x:ox,y:oy};
  }
  forecastProjectile(b,horizon) {
    const copy={...b},path=[];let time=0;
    const step=Math.min(1/60,3/Math.max(1,Math.hypot(b.vx,b.vy)));
    while(copy.alive&&time<horizon){
      const dt=Math.min(step,horizon-time),ax=copy.x,ay=copy.y;
      const hit=this.stepProjectile(copy,dt);
      if(hit?.type==='stop')break;
      path.push({ax,ay,bx:copy.x,by:copy.y,start:time,end:time+dt,bounces:copy.bounces});time+=dt;
    }
    return path;
  }
  forecastTankMotion(t,vx,vy,horizon) {
    const points=[{x:t.x,y:t.y,time:0}];let x=t.x,y=t.y,time=0;
    if(vx===0&&vy===0)return {points:[...points,{x,y,time:horizon}],step:horizon};
    const step=1/30;
    while(time<horizon){
      const dt=Math.min(step,horizon-time);
      if(vx!==0&&!this.tankBlocked(t,x+vx*dt,y))x+=vx*dt;
      if(vy!==0&&!this.tankBlocked(t,x,y+vy*dt))y+=vy*dt;
      time+=dt;points.push({x,y,time});
    }
    return {points,step};
  }
  motionPosition(motion,time) {
    const index=Math.min(Math.floor(time/motion.step),motion.points.length-2);
    const a=motion.points[index],b=motion.points[index+1],ratio=clamp((time-a.time)/(b.time-a.time||1),0,1);
    return {x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio};
  }
  projectileRisk(t,b,path,vx=0,vy=0,{margin=3,checkMovement=true,motion=null}={}) {
    let x=t.x,y=t.y;
    for(const segment of path){
      if(motion&&b.owner===t.id&&segment.bounces===0)continue;
      const dt=segment.end-segment.start;let px=x,py=y;
      if(motion){
        const a=this.motionPosition(motion,segment.start),end=this.motionPosition(motion,segment.end);px=a.x;py=a.y;x=end.x;y=end.y;
      }else{
        if(vx!==0&&(!checkMovement||!this.tankBlocked(t,x+vx*dt,y)))x+=vx*dt;
        if(vy!==0&&(!checkMovement||!this.tankBlocked(t,x,y+vy*dt)))y+=vy*dt;
      }
      if(b.owner===t.id&&segment.bounces===0)continue;
      const ax=segment.ax-px,ay=segment.ay-py,dx=segment.bx-x-ax,dy=segment.by-y-ay;
      const ratio=clamp(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1),0,1);
      if(Math.hypot(ax+dx*ratio,ay+dy*ratio)<TANK_RADIUS+3+margin)return segment.start+dt*ratio;
    }
    return Infinity;
  }
  safeEnemyShot(t,speed) {
    const b={x:t.x+Math.cos(t.aim)*19,y:t.y+Math.sin(t.aim)*19,vx:Math.cos(t.aim)*speed,vy:Math.sin(t.aim)*speed,owner:t.id,bounces:0,maxBounces:t.profile.maxBounces,alive:true};
    if(this.projectileBlocked(b.x,b.y))return false;
    const allies=this.enemies.filter(e=>e.alive&&e!==t);
    if((allies.length||this.mines.length)&&this.traceShot(t,t.aim,{friendlyOnly:true})){t.fireSafetyUntil=this.time+.1;return false;}
    if(b.maxBounces===0&&!allies.length)return true;
    const path=this.forecastProjectile(b,.75);
    const targetRisk=this.projectileRisk(this.player,b,path,0,0,{margin:0,checkMovement:false});
    for(const ally of allies){
      const motion=this.forecastTankMotion(ally,ally.vx||0,ally.vy||0,.75);
      if(this.projectileRisk(ally,b,path,0,0,{motion})<targetRisk){t.fireSafetyUntil=this.time+.1;return false;}
    }
    const ownRisk=this.projectileRisk(t,b,path,t.vx||0,t.vy||0);
    if(ownRisk===Infinity)return true;
    // An intercepted shot cannot return from a wall behind its target.
    return targetRisk<ownRisk;
  }
  avoidProjectiles(t,preferred) {
    const speed=t.profile.moveSpeed,horizon=.6,eligible=[];
    for(const b of this.bullets){
      if(!b.alive||Math.hypot(b.vx,b.vy)===0)continue;
      const own=b.owner===t.id,friendly=this.friendlyAttack(t,b);
      if(own&&b.bounces===0&&(b.maxBounces??1)===0)continue;
      const range=own||friendly?(Math.hypot(b.vx,b.vy)+speed)*horizon+30:t.profile.dodgeRadius;
      if(distance(b,t)>range)continue;
      eligible.push(b);
    }
    const vx=Math.cos(preferred)*speed,vy=Math.sin(preferred)*speed;
    const friendlyMines=this.mines.filter(m=>m.alive&&this.attackTeam(m)==='enemy'&&distance(t,m)<MINE_BLAST_RADIUS+TANK_RADIUS+speed*horizon+35);
    if(!eligible.length&&!friendlyMines.length){t.avoidanceDecision=null;return {vx,vy};}
    const interval=clamp(t.profile.avoidanceInterval??.05,0,.1),cached=t.avoidanceDecision;
    const urgent=eligible.some(b=>distance(b,t)<(Math.hypot(b.vx,b.vy)+speed)*interval+32);
    if(cached&&!urgent&&this.time<cached.until&&cached.walls===this.walls&&cached.holes===this.holes&&
       distance(t,cached)<speed*interval+4&&Math.abs(Math.atan2(Math.sin(preferred-cached.preferred),Math.cos(preferred-cached.preferred)))<.2&&
       cached.bullets.length===eligible.length&&eligible.every((b,i)=>{const old=cached.bullets[i];return old.bullet===b&&old.bounces===b.bounces&&old.vx===b.vx&&old.vy===b.vy;})&&
       cached.mines?.length===friendlyMines.length&&friendlyMines.every((mine,i)=>cached.mines[i]===mine)&&
       !this.tankBlocked(t,t.x+cached.intent.vx*.03,t.y+cached.intent.vy*.03))return cached.intent;
    const remember=intent=>{
      t.avoidanceDecision={x:t.x,y:t.y,until:this.time+interval,preferred,walls:this.walls,holes:this.holes,intent,mines:friendlyMines,bullets:eligible.map(b=>({bullet:b,bounces:b.bounces,vx:b.vx,vy:b.vy}))};return intent;
    };
    const hazards=[];
    for(const b of eligible){
      if(b.forecastTime!==this.time||b.forecastWalls!==this.walls){b.forecastTime=this.time;b.forecastWalls=this.walls;b.forecast=this.forecastProjectile(b,horizon);}
      if(b.owner===t.id&&b.bounces===0&&!b.forecast.some(segment=>segment.bounces>0))continue;
      hazards.push({bullet:b,path:b.forecast});
    }
    const risk=(vx,vy)=>{
      const motion=this.forecastTankMotion(t,vx,vy,horizon);
      return hazards.reduce((time,h)=>Math.min(time,this.projectileRisk(t,h.bullet,h.path,vx,vy,{motion})),this.friendlyMineMotionRisk(motion,friendlyMines));
    };
    if((!hazards.length&&!friendlyMines.length)||risk(vx,vy)===Infinity)return remember({vx,vy});
    const stopped=risk(0,0);let best={vx:0,vy:0},score=(stopped===Infinity?2:stopped)*1000-20;
    // Nearest headings first: the first safe moving option is the best safe one.
    for(const i of [1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8]){
      const angle=preferred+i*Math.PI/8,dx=Math.cos(angle),dy=Math.sin(angle);
      if(this.tankBlocked(t,t.x+dx*speed*.08,t.y+dy*speed*.08))continue;
      const danger=risk(dx*speed,dy*speed);
      if(danger===Infinity)return remember({vx:dx*speed,vy:dy*speed});
      const candidate=danger*1000+Math.cos(angle-preferred)*8;
      if(candidate>score){score=candidate;best={vx:dx*speed,vy:dy*speed};}
    }
    return remember(best);
  }
  friendlyMineMotionRisk(motion,mines) {
    let risk=Infinity;
    for(const mine of mines){
      let previous=distance(motion.points[0],mine);
      for(const point of motion.points.slice(1)){
        const next=distance(point,mine);
        if((mine.age+point.time>=3.2&&next<MINE_BLAST_RADIUS+TANK_RADIUS+3)||(mine.age+point.time>.8&&next<48)){risk=Math.min(risk,point.time);break;}
        if(next<MINE_BLAST_RADIUS+TANK_RADIUS+12&&next<previous-.05){risk=Math.min(risk,point.time);break;}
        previous=next;
      }
    }
    return risk;
  }
  mineChain(origin) {
    const chain=[origin],seen=new Set(chain);
    for(let i=0;i<chain.length;i++)for(const m of this.mines){
      if(m.alive&&!seen.has(m)&&distance(chain[i],m)<MINE_BLAST_RADIUS){seen.add(m);chain.push(m);}
    }
    return chain;
  }
  safeMineForAllies(t,mine) {
    const chain=this.mineChain(mine),radius=MINE_BLAST_RADIUS+TANK_RADIUS+12;
    for(const ally of this.enemies){
      if(!ally.alive||ally===t)continue;
      if(chain.every(m=>distance(ally,m)>radius+Math.hypot(ally.vx||0,ally.vy||0)*.8))continue;
      const motion=this.forecastTankMotion(ally,ally.vx||0,ally.vy||0,.8);
      if(chain.some(m=>motion.points.some(p=>distance(p,m)<radius)))return false;
    }
    return true;
  }
  plant(t=this.player) {
    if(this.introRemaining>0)return false;
    const cap=t.profile?.maxMines??2;
    if(!t.alive||cap===0||this.mines.filter(m=>m.alive&&m.owner===t.id).length>=cap||t.mineCooldown>0)return false;
    const mine={x:t.x,y:t.y,owner:t.id,team:t.profile?'enemy':'player',age:0,alive:true};let escape;
    if(t.profile&&!this.safeMineForAllies(t,mine)){t.mineCooldown=.25;return false;}
    if(t.profile){
      if(this.mines.some(m=>m.alive&&distance(t,m)<t.profile.mineSpacing)||this.bullets.some(b=>b.alive&&distance(t,b)<120)){
        t.mineCooldown=.4;return false;
      }
      escape=this.findMineEscape(t,mine);
      if(!escape){t.mineCooldown=.4;return false;}
    }
    this.mines.push(mine);
    if(escape)t.mineEscape={mine,path:escape};
    t.mineCooldown=t.profile?this.sampleRange(t.profile.mineInterval):.5;
    this.emit('mine',t.x,t.y);return true;
  }
  findMineEscape(t,mine) {
    const targetDistance=Math.max(t.profile.mineEscapeDistance,t.profile.mineAvoidRadius+10,MINE_BLAST_RADIUS+TANK_RADIUS+22);
    const maxSteps=Math.floor(t.profile.moveSpeed*1.8/TILE_SIZE);
    if(maxSteps<1)return null;
    const directions=[[1,0],[0,1],[-1,0],[0,-1]].sort((a,b)=>(b[0]-a[0])*Math.cos(t.dir)+(b[1]-a[1])*Math.sin(t.dir));
    const queue=[{x:t.x,y:t.y,col:0,row:0,path:[]}],visited=new Set(['0:0']);
    const hazards=this.mines.filter(m=>m.alive&&m!==mine);
    for(let head=0;head<queue.length&&head<600;head++){
      const node=queue[head];
      if(distance(node,mine)>=targetDistance)return node.path;
      if(node.path.length>=maxSteps)continue;
      for(const [dc,dr] of directions){
        const col=node.col+dc,row=node.row+dr,key=`${col}:${row}`;
        if(visited.has(key))continue;
        const point={x:t.x+col*TILE_SIZE,y:t.y+row*TILE_SIZE};
        if(this.tankBlocked(t,point.x,point.y)||this.tankBlocked(t,(node.x+point.x)/2,(node.y+point.y)/2))continue;
        if(hazards.some(m=>distance(point,m)<MINE_BLAST_RADIUS+TANK_RADIUS+12))continue;
        const seconds=(node.path.length+1)*TILE_SIZE/t.profile.moveSpeed;
        if(seconds>Math.max(.1,.65-mine.age)&&distance(point,mine)<70)continue;
        visited.add(key);queue.push({...point,col,row,path:[...node.path,point]});
      }
    }
    return null;
  }
  openDirection(t,preferred,mine=null) {
    let best=preferred,bestScore=-Infinity;
    for(let i=0;i<16;i++){
      const angle=preferred+i*Math.PI/8,dx=Math.cos(angle),dy=Math.sin(angle);
      let clearance=0;
      for(let step=10;step<=70;step+=10){if(this.tankBlocked(t,t.x+dx*step,t.y+dy*step))break;clearance=step;}
      if(clearance<10)continue;
      const point={x:t.x+dx*clearance,y:t.y+dy*clearance};
      const score=clearance+Math.cos(angle-preferred)*20+(mine?(distance(point,mine)-distance(t,mine))*4:0);
      if(score>bestScore){bestScore=score;best=angle;}
    }
    return best;
  }
  mineEscapeDirection(t,mine) {
    let escape=t.mineEscape;
    if(!escape||escape.mine!==mine||!escape.path.length||this.tankBlocked(t,escape.path[0].x,escape.path[0].y)){
      const path=this.findMineEscape(t,mine);escape=path?{mine,path}:null;t.mineEscape=escape;
    }
    if(escape){
      while(escape.path.length&&distance(t,escape.path[0])<3)escape.path.shift();
      if(escape.path.length)return Math.atan2(escape.path[0].y-t.y,escape.path[0].x-t.x);
    }
    const away=distance(t,mine)<1?t.dir:Math.atan2(t.y-mine.y,t.x-mine.x);
    return this.openDirection(t,away,mine);
  }
  traceShot(t,angle,{details=false,friendlyOnly=false,target=this.player}={}) {
    let dx=Math.cos(angle),dy=Math.sin(angle),x=t.x+dx*19,y=t.y+dy*19;
    let traveled=19;
    const boxes=this.shotGeometry().boxes;
    for(let bounce=0;bounce<=t.profile.maxBounces;bounce++){
      if(x<SHOT_BOUNDS.left||x>SHOT_BOUNDS.right||y<SHOT_BOUNDS.top||y>SHOT_BOUNDS.bottom||boxes.some(w=>x>=w.x&&x<=w.x+w.w&&y>=w.y&&y<=w.y+w.h))return friendlyOnly?false:null;
      const tx=dx>1e-9?(SHOT_BOUNDS.right-x)/dx:dx<-1e-9?(SHOT_BOUNDS.left-x)/dx:Infinity;
      const ty=dy>1e-9?(SHOT_BOUNDS.bottom-y)/dy:dy<-1e-9?(SHOT_BOUNDS.top-y)/dy:Infinity;
      let hit={distance:Math.min(tx,ty),hitX:tx<=ty+1e-7,hitY:ty<=tx+1e-7};
      for(const box of boxes){const h=rayRect(x,y,dx,dy,box);if(h&&h.distance<hit.distance)hit=h;}
      const px=target.x-x,py=target.y-y,projection=px*dx+py*dy;
      const targetHit=projection>0&&projection<hit.distance&&Math.abs(px*dy-py*dx)<TANK_RADIUS+3;
      if(friendlyOnly)for(const mine of this.mines){
        if(!mine.alive)continue;
        const mx=mine.x-x,my=mine.y-y,along=mx*dx+my*dy;
        if(along>0&&along<hit.distance&&(!targetHit||along<projection)&&Math.abs(mx*dy-my*dx)<12&&
           mine.age+(traveled-19+along)/t.profile.bulletSpeed>.6&&!this.safeMineForAllies(null,mine))return true;
      }
      for(const ally of this.enemies){
        if(ally===t||!ally.alive)continue;
        const ax=ally.x-x,ay=ally.y-y,along=ax*dx+ay*dy;
        if(along>=0&&along<hit.distance&&(!targetHit||along<projection)&&Math.abs(ax*dy-ay*dx)<TANK_RADIUS+6)return friendlyOnly?true:null;
      }
      // Reject paths that would strike the firing tank after reflection.
      const ox=t.x-x,oy=t.y-y,ownProjection=ox*dx+oy*dy;
      if(!friendlyOnly&&bounce>0&&ownProjection>0&&ownProjection<hit.distance&&(!targetHit||ownProjection<projection)&&Math.abs(ox*dy-oy*dx)<TANK_RADIUS+3)return null;
      if(targetHit)return friendlyOnly?false:details?{bounces:bounce,distance:traveled+projection}:bounce;
      x+=dx*hit.distance;y+=dy*hit.distance;
      if(hit.hitX)dx=-dx;if(hit.hitY)dy=-dy;x+=dx*.05;y+=dy*.05;
      traveled+=hit.distance+.05;
    }
    return friendlyOnly?false:null;
  }
  shotGeometry() {
    if(this.shotWallSource!==this.walls){
      this.shotWallSource=this.walls;
      const walls=mergeShotWalls(this.walls);
      const faces=new Map([['left',['x',SHOT_BOUNDS.left]],['right',['x',SHOT_BOUNDS.right]],['top',['y',SHOT_BOUNDS.top]],['bottom',['y',SHOT_BOUNDS.bottom]]]);
      for(const w of walls)for(const face of [['x',w.x-4],['x',w.x+w.w+4],['y',w.y-4],['y',w.y+w.h+4]])faces.set(face.join(':'),face);
      this.cachedShotGeometry={boxes:walls.map(w=>({x:w.x-4,y:w.y-4,w:w.w+8,h:w.h+8})),faces:[...faces.values()]};
    }
    return this.cachedShotGeometry;
  }
  interceptAim(t,transform={sx:1,sy:1,ox:0,oy:0}) {
    const p=this.player,{sx,sy,ox,oy}=transform,speed=t.profile.bulletSpeed;
    const vx=p.vx*t.profile.leadFactor,vy=p.vy*t.profile.leadFactor;
    const rx=sx*p.x+ox-t.x,ry=sy*p.y+oy-t.y,ux=sx*vx,uy=sy*vy;
    // The shell starts 19px ahead of the tank: |r + v*time| = 19 + speed*time.
    const a=ux*ux+uy*uy-speed*speed,b=2*(rx*ux+ry*uy-19*speed),c=rx*rx+ry*ry-19*19;
    let roots=[];
    if(Math.abs(a)<1e-9){if(Math.abs(b)>1e-9)roots=[-c/b];}
    else {
      const d=b*b-4*a*c;
      if(d>=0){const q=-.5*(b+(b>=0?1:-1)*Math.sqrt(d));roots=q===0?[-b/(2*a)]:[q/a,c/q];}
    }
    const time=Math.min(...roots.filter(v=>Number.isFinite(v)&&v>=0&&v<=10));
    if(!Number.isFinite(time))return null;
    const target={x:p.x+vx*time,y:p.y+vy*time};
    if(target.x<BOUNDS.x+TANK_RADIUS||target.x>BOUNDS.x+BOUNDS.w-TANK_RADIUS||target.y<BOUNDS.y+TANK_RADIUS||target.y>BOUNDS.y+BOUNDS.h-TANK_RADIUS)return null;
    return {angle:Math.atan2(sy*target.y+oy-t.y,sx*target.x+ox-t.x),target,time};
  }
  findRicochetAim(t) {
    const directSolution=this.interceptAim(t);
    const direct=directSolution?.angle??Math.atan2(this.player.y-t.y,this.player.x-t.x);
    const directPath=directSolution&&this.traceShot(t,direct,{details:true,target:directSolution.target});
    if(directPath?.bounces===0){t.ricochetTransform=null;return direct;}
    const faces=this.shotGeometry().faces;
    let images=[{sx:1,sy:1,ox:0,oy:0}],best=null,bestTransform=null,bestScore=Infinity;
    const consider=(transform,depth)=>{
      const solution=this.interceptAim(t,transform);if(!solution)return;
      const {angle,target}=solution,path=this.traceShot(t,angle,{details:true,target});
      if(path===null||path.bounces!==depth)return;
      const score=path.distance+path.bounces*40+Math.max(0,-Math.cos(angle-direct))*150;
      if(score<bestScore){best=angle;bestTransform={...transform,bounces:depth};bestScore=score;}
    };
    let budget=4096;
    for(let depth=0;depth<t.profile.maxBounces;depth++){
      const next=[];
      for(const image of images)for(const [axis,value] of faces){
        const sign=axis==='x'?'sx':'sy',offset=axis==='x'?'ox':'oy';
        const reflected={...image,[sign]:-image[sign],[offset]:2*value-image[offset]};consider(reflected,depth+1);next.push(reflected);
        if(--budget<=0){t.ricochetTransform=bestTransform;return best;}
      }
      images=next;
    }
    t.ricochetTransform=bestTransform;return best;
  }
  turnEnemyTurret(e,target,dt) {
    const delta=Math.atan2(Math.sin(target-e.aim),Math.cos(target-e.aim));
    const step=e.profile.turretTurnSpeed*Math.max(0,dt);
    if(Math.abs(delta)<=step){e.aim=target;return true;}
    e.aim+=Math.sign(delta)*step;
    e.aim=Math.atan2(Math.sin(e.aim),Math.cos(e.aim));
    return false;
  }
  aimEnemy(e,dt,visible) {
    const profile=e.profile,p=this.player;
    e.targetAcquired=profile.aimMode==='ricochet'?false:visible;
    const solution=this.interceptAim(e);
    const direct=solution?.angle??Math.atan2(p.y-e.y,p.x-e.x);
    if(profile.aimMode==='scan'){
      e.aim+=profile.turretTurnSpeed*Math.max(0,dt);
      return visible&&Math.abs(Math.atan2(Math.sin(direct-e.aim),Math.cos(direct-e.aim)))<profile.scanTolerance;
    }
    if(profile.aimMode==='ricochet'){
      if(solution&&this.traceShot(e,direct,{target:solution.target})===0){e.targetAcquired=true;e.ricochetTransform=null;e.shotAim=direct;e.aimThink=0;return this.turnEnemyTurret(e,direct,dt);}
      e.aimThink-=dt;
      if(e.aimWallSource!==this.walls){e.aimThink=0;e.aimWallSource=this.walls;}
      if(e.ricochetTransform){
        const next=this.interceptAim(e,e.ricochetTransform);
        if(next&&this.traceShot(e,next.angle,{target:next.target})===e.ricochetTransform.bounces){e.targetAcquired=true;e.shotAim=next.angle;return this.turnEnemyTurret(e,next.angle,dt);}
        e.ricochetTransform=null;e.aimThink=0;
      }
      if(e.aimThink<=1e-9){e.aimThink=profile.ricochetSearchInterval;e.shotAim=this.findRicochetAim(e);}
      else return false;
      if(e.shotAim===null||e.shotAim===undefined)return false;
      e.targetAcquired=true;
      return this.turnEnemyTurret(e,e.shotAim,dt);
    }
    const aligned=this.turnEnemyTurret(e,direct+Math.sin(this.time*2+e.id)*profile.aimJitter,dt);
    return aligned&&visible&&solution!==null;
  }
  burst(x,y,color,count=18) {
    for(let i=0;i<count;i++){const a=this.random()*Math.PI*2,s=30+this.random()*150;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+this.random()*.5,max:.8,color,size:2+this.random()*5});}
  }
  kill(t) {
    if(!t.alive)return;t.alive=false;this.wrecks.push({x:t.x,y:t.y,angle:t.angle});this.burst(t.x,t.y,'#d77e3f',30);this.emit('explosion',t.x,t.y);
    if(t===this.player){this.lives--;this.state=this.lives>0?'dead':'gameover';}
    else this.score+=t.profile.score;
  }
  explode(m) {
    if(!m.alive)return;m.alive=false;this.burst(m.x,m.y,'#edb55d',50);this.emit('explosion',m.x,m.y);
    this.mineBlasts.push({x:m.x,y:m.y,radius:MINE_BLAST_RADIUS,life:.45,max:.45});
    this.walls=this.walls.filter(w=>{
      if(!w.soft||!circleRect(m.x,m.y,MINE_BLAST_RADIUS,w))return true;
      const [col,row]=worldCell(w.x,w.y);
      if(this.tiles[row])this.tiles[row]=this.tiles[row].slice(0,col)+'.'+this.tiles[row].slice(col+1);
      return false;
    });
    for(const t of [this.player,...this.enemies])if(t.alive&&distance(m,t)<MINE_BLAST_RADIUS+TANK_RADIUS)this.kill(t);
    for(const b of this.bullets)if(distance(m,b)<MINE_BLAST_RADIUS)b.alive=false;
    for(const other of this.mines)if(other.alive&&distance(m,other)<MINE_BLAST_RADIUS)this.explode(other);
  }
  emitBulletSmoke(b,ax,ay) {
    const moved=Math.hypot(b.x-ax,b.y-ay);
    if(moved===0)return;
    const spacing=6,remainder=b.smokeDistance??0;
    for(let offset=spacing-remainder;offset<=moved;offset+=spacing){
      const sequence=b.smokeSequence=(b.smokeSequence??0)+1;
      if(this.bulletSmoke.length>=MAX_BULLET_SMOKE)continue;
      // 見た目の揺らぎにAI・射撃用の乱数を消費しない。
      const phase=sequence*2.399963+(b.owner??0)*1.7,ratio=offset/moved;
      this.bulletSmoke.push({x:ax+(b.x-ax)*ratio,y:ay+(b.y-ay)*ratio,
        vx:Math.cos(phase)*7,vy:Math.sin(phase)*7-3,radius:2,
        life:.45,max:.45,speed:Math.hypot(b.vx,b.vy),player:b.player});
    }
    b.smokeDistance=(remainder+moved)%spacing;
  }
  update(dt,input={}) {
    dt=clamp(dt,0,1/30);
    if(this.state==='playing'&&this.introRemaining>0){
      this.introRemaining=Math.max(0,this.introRemaining-dt);
      if(this.introRemaining<1e-9)this.introRemaining=0;
      return;
    }
    for(const p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*3;p.vy*=1-dt*3;p.life-=dt;}
    this.particles=this.particles.filter(p=>p.life>0);
    for(const blast of this.mineBlasts)blast.life-=dt;
    this.mineBlasts=this.mineBlasts.filter(blast=>blast.life>0);
    for(const puff of this.bulletSmoke){puff.life-=dt;puff.x+=puff.vx*dt;puff.y+=puff.vy*dt;puff.radius+=9*dt;}
    this.bulletSmoke=this.bulletSmoke.filter(puff=>puff.life>0);
    if(this.state!=='playing')return;
    this.time+=dt;
    const p=this.player;
    for(const t of [p,...this.enemies]){t.cooldown=Math.max(0,t.cooldown-dt);t.mineCooldown=Math.max(0,t.mineCooldown-dt);}
    if(input.aim)p.aim=Math.atan2(input.aim.y-p.y,input.aim.x-p.x);
    const mx=input.x||0,my=input.y||0,n=Math.max(1,Math.hypot(mx,my));
    const oldX=p.x,oldY=p.y;
    this.move(p,mx/n*135*dt,my/n*135*dt);p.vx=dt>0?(p.x-oldX)/dt:0;p.vy=dt>0?(p.y-oldY)/dt:0;
    if(input.fire)this.shoot(p);if(input.mine)this.plant();
    for(const e of this.enemies){
      if(!e.alive)continue;
      const profile=e.profile;
      const directVisible=!this.walls.some(w=>segmentRect(e,p,w));
      const canShoot=this.aimEnemy(e,dt,directVisible),toward=Math.atan2(p.y-e.y,p.x-e.x);
      const visible=e.targetAcquired;
      e.sightTime=e.targetAcquired?(e.sightTime??0)+dt:0;
      if(profile.moveSpeed>0){
        e.think-=dt;
        if(e.think<=0){
          e.think=this.sampleRange(profile.decisionInterval);
          if(profile.movement==='wander'||!visible)e.dir+=(this.random()-.5)*profile.wanderAngleRange;
          else if(profile.movement==='evade'&&distance(e,p)<profile.strafeDistance)e.dir=toward+Math.PI;
          else e.dir=toward+(distance(e,p)<profile.strafeDistance?Math.PI/2:0);
        }
        let dir=e.dir;
        const mine=this.mines.filter(m=>m.alive&&distance(e,m)<(this.attackTeam(m)==='enemy'?Math.max(profile.mineAvoidRadius,profile.mineEscapeDistance,MINE_BLAST_RADIUS+TANK_RADIUS+30):profile.mineAvoidRadius)).sort((a,b)=>distance(e,a)-distance(e,b))[0];
        if(mine)dir=profile.safeMineLaying||this.attackTeam(mine)==='enemy'?this.mineEscapeDirection(e,mine):this.openDirection(e,distance(e,mine)<1?e.dir:Math.atan2(e.y-mine.y,e.x-mine.x),mine);
        else if(profile.safeMineLaying){e.mineEscape=null;dir=this.openDirection(e,dir);e.dir=dir;}
        const speed=profile.moveSpeed;
        const intent=this.avoidProjectiles(e,dir),ex=e.x,ey=e.y;
        const moved=this.move(e,intent.vx*dt,intent.vy*dt);e.vx=dt>0?(e.x-ex)/dt:0;e.vy=dt>0?(e.y-ey)/dt:0;
        if(moved<Math.hypot(intent.vx,intent.vy)*dt*profile.blockedMoveRatio){e.mineEscape=null;e.dir+=profile.blockedTurnAngle;e.think=profile.blockedRetryDelay;}
      }
      if(this.time>profile.activationDelay){if(canShoot&&e.sightTime+1e-9>=profile.reactionDelay)this.shoot(e);if(profile.maxMines>0)this.plant(e);}
    }
    // Small physics steps prevent fast projectiles from tunnelling through walls.
    for(const b of this.bullets){
      if(!b.alive)continue;b.age+=dt;
      const steps=Math.max(1,Math.ceil(Math.hypot(b.vx,b.vy)*dt/3));
      for(let s=0;s<steps&&b.alive;s++){
        const ax=b.x,ay=b.y,hit=this.stepProjectile(b,dt/steps);
        if(!hit)this.emitBulletSmoke(b,ax,ay);
        if(hit?.type==='stop'){this.burst(hit.x,hit.y,'#e8d3a2',5);break;}
        if(hit?.type==='bounce'){this.emit('bounce',hit.x,hit.y);this.burst(hit.x,hit.y,'#f9d57e',4);}
        for(const t of [p,...this.enemies])if(t.alive&&!(t.id===b.owner&&b.bounces===0)&&distance(t,b)<TANK_RADIUS+3){this.kill(t);b.alive=false;break;}
        for(const m of this.mines)if(m.alive&&m.age>.6&&distance(m,b)<12){b.alive=false;this.explode(m);}
      }
      if(b.age>10)b.alive=false;
    }
    for(let i=0;i<this.bullets.length;i++)for(let j=i+1;j<this.bullets.length;j++){
      const a=this.bullets[i],b=this.bullets[j];
      if(a.alive&&b.alive&&distance(a,b)<12){a.alive=b.alive=false;this.burst(a.x,a.y,'#f7d493',8);this.emit('bounce',a.x,a.y);}
    }
    for(const m of this.mines){m.age+=dt;if(m.alive&&(m.age>=3.2||(m.age>.8&&[p,...this.enemies].some(t=>t.alive&&distance(t,m)<48))))this.explode(m);}
    this.bullets=this.bullets.filter(b=>b.alive);this.mines=this.mines.filter(m=>m.alive);
    if(this.state==='playing'&&this.enemies.every(e=>!e.alive)){
      this.score+=500;
      if((this.level+1)%5===0)this.lives++;
      this.state=this.level===this.levels.length-1?'won':'clear';this.emit('clear',p.x,p.y);
    }
  }
}
