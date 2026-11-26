// 足跡は固定サイズのCanvasに蓄積し、新しく生成された分だけ描き込む。
export function createTrackLayer(width,height,createCanvas=()=>document.createElement('canvas')){
  const canvas=createCanvas();canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');let source=null;
  return {
    draw(target,tracks){
      // load()で配列が置き換わったときだけ、前ミッションの足跡を消す。
      if(source!==tracks){ctx.clearRect(0,0,width,height);source=tracks;}
      ctx.fillStyle='#78613e';ctx.globalAlpha=.3;
      for(const track of tracks){
        ctx.save();ctx.translate(track.x,track.y);ctx.rotate(track.angle);
        ctx.fillRect(-3,-18,6,7);ctx.fillRect(-3,11,6,7);ctx.restore();
      }
      tracks.length=0;
      target.drawImage(canvas,0,0);
    },
  };
}
