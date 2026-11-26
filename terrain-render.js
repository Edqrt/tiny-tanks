// 弾道の色は弾速（px/秒）に応じて滑らかに変化する。
export const BULLET_TRAIL_COLORS = [
  {speed:300,color:'#ffe14a'},
  {speed:350,color:'#ff922f'},
  {speed:400,color:'#e5442e'},
  {speed:500,color:'#803a29'},
  {speed:600,color:'#191613'},
];

export function bulletTrailColor(speed,player=false) {
  const base=player?'#f4f4d9aa':'#f2b26cbb';
  if(speed<=265)return base;
  let previous={speed:265,color:base.slice(0,7)};
  for(const stop of BULLET_TRAIL_COLORS){
    if(speed<=stop.speed){
      const mix=(speed-previous.speed)/(stop.speed-previous.speed);
      const channel=offset=>Math.round(parseInt(previous.color.slice(offset,offset+2),16)*(1-mix)+parseInt(stop.color.slice(offset,offset+2),16)*mix).toString(16).padStart(2,'0');
      const alpha=Math.round((player?170:187)+(224-(player?170:187))*Math.min(1,(speed-265)/(300-265))).toString(16).padStart(2,'0');
      return `#${channel(1)}${channel(3)}${channel(5)}${alpha}`;
    }
    previous=stop;
  }
  return `${previous.color}e0`;
}

export function createBulletSmokeRenderer(createCanvas=()=>document.createElement('canvas')) {
  const sprites=new Map();
  return (ctx,smoke,reducedMotion=false)=>{
    ctx.save();
    for(const puff of smoke){
      const speed=Math.round(puff.speed),key=`${speed}:${!!puff.player}`;
      let sprite=sprites.get(key);
      if(!sprite){
        sprite=createCanvas();sprite.width=sprite.height=48;
        const paint=sprite.getContext('2d'),color=bulletTrailColor(speed,puff.player).slice(0,7);
        const fog=paint.createRadialGradient(24,24,0,24,24,24);
        fog.addColorStop(0,`${color}ff`);fog.addColorStop(.5,`${color}bb`);fog.addColorStop(.8,`${color}44`);fog.addColorStop(1,`${color}00`);
        paint.fillStyle=fog;paint.fillRect(0,0,48,48);
        if(sprites.size>=32)sprites.delete(sprites.keys().next().value);
        sprites.set(key,sprite);
      }
      const fade=Math.max(0,Math.min(1,puff.life/puff.max));
      ctx.globalAlpha=Math.pow(fade,1.25)*(reducedMotion ? .65 : .95);
      ctx.drawImage(sprite,puff.x-puff.radius,puff.y-puff.radius,puff.radius*2,puff.radius*2);
    }
    ctx.restore();
  };
}

export function drawHole(ctx,{x,y,w,h}) {
  ctx.fillStyle='#99784c';ctx.fillRect(x-1,y-1,w+2,h+2);
  const depth=ctx.createLinearGradient(x,y,x,y+h);
  depth.addColorStop(0,'#242b29');depth.addColorStop(1,'#444b40');
  ctx.fillStyle=depth;ctx.fillRect(x,y,w,h);
  ctx.fillStyle='#151e2055';ctx.fillRect(x,y,w,4);ctx.fillRect(x,y,3,h);
  ctx.fillStyle='#f5db9e88';ctx.fillRect(x,y+h,w,1);
}

export function drawMineBlast(ctx,{x,y,radius,life,max},reducedMotion=false) {
  const fade=Math.max(0,Math.min(1,life/max));
  if(fade===0)return;
  ctx.save();ctx.translate(x,y);ctx.globalAlpha=fade;
  const glow=ctx.createRadialGradient(0,0,0,0,0,radius);
  glow.addColorStop(0,'#fff4c999');glow.addColorStop(.45,'#ffbf5555');glow.addColorStop(1,'#ed743322');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
  // 外周はダメージ判定と同じ半径。衝撃波もこの範囲からはみ出さない。
  ctx.strokeStyle='#ffe0a0';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,radius-ctx.lineWidth/2,0,Math.PI*2);ctx.stroke();
  if(!reducedMotion){
    const progress=1-fade,wave=1-Math.pow(1-Math.min(1,progress/.55),3);
    ctx.strokeStyle='#fff3ca';ctx.lineWidth=3;ctx.globalAlpha=fade*(1-progress);
    ctx.beginPath();ctx.arc(0,0,Math.max(0,radius*(.15+.85*wave)-ctx.lineWidth/2),0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
