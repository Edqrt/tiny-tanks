import { TILE_LEVELS } from './levels.js';
import { ENEMY_PROFILES,CLASSIC_ENEMY_TYPES } from './enemy-profiles.js';
import { TILE_SIZE,MAP_COLS,MAP_ROWS,MAP_ORIGIN,MAP_STORAGE_KEY,PLAYTEST_STORAGE_KEY,MAX_LEVELS,cloneMap,createMap,validateMap,parseMapPack,serializeMaps,paintLine,worldCell,cellCenter } from './tilemap.js';
import { selectionRect,inSelection,moveSelection,clearSelection } from './selection.js';
import { createLevelSaver } from './level-save.js';
import { drawHole } from './terrain-render.js';

const $=id=>document.getElementById(id),canvas=$('map-canvas'),ctx=canvas.getContext('2d');
function downloadSource(source,name){
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const levelSaver=createLevelSaver({pickFile:window.isSecureContext&&window.showSaveFilePicker?window.showSaveFilePicker.bind(window):undefined,download:downloadSource});
$('save-source').disabled=true;
levelSaver.detect().then(method=>{
  $('save-source').disabled=false;
  $('save-hint').textContent=method==='server'?'標準レベルへの保存はプロジェクトの levels.js に直接反映されます。':method==='file'?'Live Serverなどの静的サーバーでは、保存先に Tanks/levels.js を選んでください。':'このブラウザでは levels.js をダウンロードします。プロジェクトの Tanks/levels.js と置き換えてください。';
  $('save-source').title=$('save-hint').textContent;
  if(method==='download')$('save-source').textContent='↓ JS';
});
let maps=TILE_LEVELS.map(cloneMap),index=0,tool='wall',cursor=[0,0],drawing=null,selection=null,undo=[],redo=[];
let startupMessage='';
try{const saved=localStorage.getItem(MAP_STORAGE_KEY);if(saved)maps=parseMapPack(saved,{playable:false});index=Math.min(maps.length-1,Math.max(0,Number(localStorage.getItem('tiny-tanks-editor-index'))||0));}
catch{startupMessage='保存データを読み込めなかったため、標準レベルを表示しています。JSONバックアップから復元できます。';}
const current=()=>maps[index];
const snapshot=()=>JSON.stringify({maps,index,selection});
function remember(before){if(before===snapshot())return;undo.push(before);if(undo.length>40)undo.shift();redo.length=0;save();}
function save(){
  try{localStorage.setItem(MAP_STORAGE_KEY,serializeMaps(maps));localStorage.setItem('tiny-tanks-editor-index',String(index));$('save-status').textContent='';}
  catch{$('save-status').textContent='ブラウザに保存できませんでした。「JSONを書き出す」で保存してください。';}
}
function change(action){finishStroke();const before=snapshot(),oldIndex=index;action();if(oldIndex!==index)selection=null;remember(before);refresh();}
function restore(from,to){finishStroke();if(!from.length)return;to.push(snapshot());const state=JSON.parse(from.pop());maps=state.maps;index=state.index;selection=state.selection;save();refresh();}

const terrain=[['select','範囲選択','#75a8a0'],['wall','壁','#b69f72'],['soft','壊せる壁','#bd9565'],['hole','穴','#303b35'],['floor','床','#e3c792'],['erase','消しゴム','#f7f6ec'],['player','プレイヤー','#70a9bc']];
const tools=[];
function addTool(container,key,label,color){
  const button=document.createElement('button');button.type='button';button.className='tool-button';button.dataset.tool=key;button.setAttribute('aria-pressed','false');
  const swatch=document.createElement('span');swatch.className=`tool-swatch ${key==='soft'?'soft':''}`;swatch.style.setProperty('--swatch',color);
  swatch.setAttribute('aria-hidden','true');swatch.textContent=({select:'⛶',wall:'■',soft:'▧',hole:'●',floor:'·',erase:'×',player:'P'})[key]||'';
  const text=document.createElement('span');text.className='tool-label';text.textContent=label;
  button.title=label;button.setAttribute('aria-label',label);
  button.append(swatch,text);button.addEventListener('click',()=>{finishStroke();tool=key;if(tool!=='select')selection=null;refresh();});$(container).append(button);tools.push(button);
}
for(const [key,label,color] of terrain)addTool('terrain-tools',key,label,color);
for(const key of CLASSIC_ENEMY_TYPES)addTool('enemy-tools',key,ENEMY_PROFILES[key].name,ENEMY_PROFILES[key].palette[0]);

function drawTank(col,row,palette,player=false){
  const [x,y]=cellCenter(col,row);ctx.save();ctx.translate(x,y);
  ctx.fillStyle='#333e35';ctx.fillRect(-16,-18,8,36);ctx.fillRect(8,-18,8,36);
  ctx.fillStyle=palette[0];ctx.fillRect(-12,-13,24,26);ctx.fillStyle=palette[1];ctx.fillRect(-8,-9,16,17);ctx.fillRect(-3,-26,6,22);
  ctx.strokeStyle='#faf7dd';ctx.lineWidth=1;ctx.strokeRect(-12,-13,24,26);
  if(player){ctx.fillStyle='#fff6d9';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('P',0,6);}
  ctx.restore();
}
function draw(){
  const {x:ox,y:oy}=MAP_ORIGIN,size=TILE_SIZE,width=MAP_COLS*size,height=MAP_ROWS*size;
  ctx.fillStyle='#a48759';ctx.fillRect(0,0,1120,640);ctx.fillStyle='#e3c792';ctx.fillRect(ox,oy,width,height);
  const map=drawing?.preview||current();
  for(let row=0;row<MAP_ROWS;row++)for(let col=0;col<MAP_COLS;col++){
    const tile=map.tiles[row][col],x=ox+col*size,y=oy+row*size;
    if(tile==='O'){drawHole(ctx,{x,y,w:size,h:size});continue;}
    if(tile!=='.'){
      ctx.fillStyle=tile==='#'?'#b39b6d':'#bc9360';ctx.fillRect(x,y,20,20);ctx.fillStyle='#edd7a7';ctx.fillRect(x+1,y+1,18,2);ctx.fillStyle='#947b50';ctx.fillRect(x+1,y+17,18,2);
      if(tile==='+'){ctx.strokeStyle='#755537';ctx.beginPath();ctx.moveTo(x+12,y+2);ctx.lineTo(x+8,y+8);ctx.lineTo(x+13,y+12);ctx.lineTo(x+9,y+18);ctx.stroke();}
    }
  }
  ctx.lineWidth=.6;ctx.strokeStyle='#8f733b55';ctx.beginPath();
  for(let col=0;col<=MAP_COLS;col++){const x=ox+col*size;ctx.moveTo(x,oy);ctx.lineTo(x,oy+height);}
  for(let row=0;row<=MAP_ROWS;row++){const y=oy+row*size;ctx.moveTo(ox,y);ctx.lineTo(ox+width,y);}ctx.stroke();
  for(const e of map.enemies)drawTank(e.col,e.row,ENEMY_PROFILES[e.type].palette);
  if(map.player)drawTank(...map.player,['#447c91','#8bc1ce'],true);
  const [col,row]=cursor;ctx.fillStyle='#fffdf033';ctx.fillRect(ox+col*size,oy+row*size,size,size);ctx.strokeStyle='#d75e31';ctx.lineWidth=2;ctx.strokeRect(ox+col*size,oy+row*size,size,size);
  const area=drawing?.target||selection;
  if(area){ctx.save();ctx.fillStyle=drawing?.error?'#d84e4033':'#367d9b33';ctx.strokeStyle=drawing?.error?'#c74230':'#28667d';ctx.lineWidth=2;ctx.setLineDash([6,3]);ctx.fillRect(ox+area.col*size,oy+area.row*size,area.width*size,area.height*size);ctx.strokeRect(ox+area.col*size,oy+area.row*size,area.width*size,area.height*size);ctx.restore();}
  ctx.fillStyle='#f0ddb5';ctx.font='10px monospace';ctx.textAlign='center';
  for(let col=0;col<MAP_COLS;col++)ctx.fillText(String(col),ox+(col+.5)*size,oy-12);
  for(let row=0;row<MAP_ROWS;row++)ctx.fillText(String(row),ox-18,oy+(row+.5)*size+4);
}
function refresh(){
  const select=$('level-select');select.replaceChildren();maps.forEach((map,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${String(i+1).padStart(2,'0')} / ${map.name}`;select.append(option);});select.value=index;
  if(document.activeElement!==$('level-name'))$('level-name').value=current().name;
  $('map-count').textContent=`${MAP_ROWS}行 × ${MAP_COLS}列 / 敵 ${current().enemies.length}台`;
  $('cursor-position').textContent=`${cursor[0]}, ${cursor[1]}`;
  const selected=tools.find(button=>button.dataset.tool===tool);$('selected-tool').textContent=selected.textContent;
  for(const button of tools)button.setAttribute('aria-pressed',String(button.dataset.tool===tool));
  document.querySelector('.selection-toolbar').hidden=tool!=='select';
  $('selection-info').textContent=selection?`${selection.width} × ${selection.height}`:'';
  for(const button of document.querySelectorAll('[data-selection-action]'))button.disabled=!selection;
  canvas.style.cursor=tool==='select'?(inSelection(selection,...cursor)?'move':'crosshair'):'crosshair';
  $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;$('delete-level').disabled=maps.length===1;
  $('new-level').disabled=$('duplicate-level').disabled=maps.length>=MAX_LEVELS;
  const errors=validateMap(current());$('validation').textContent=errors.join(' / ');$('validation').title=errors.join('\n');
  $('validation').classList.toggle('has-errors',!!errors.length);draw();
}
function finishStroke(){
  if(!drawing)return;const stroke=drawing;drawing=null;let error;
  if(stroke.kind==='move'){
    const result=moveSelection(current(),selection,stroke.last[0]-stroke.start[0],stroke.last[1]-stroke.start[1]);
    if(result.ok){selection=result.selection;remember(stroke.before);}else error=result.error;
  }else if(stroke.kind==='paint')remember(stroke.before);
  refresh();if(error)$('save-status').textContent=error;
}
function cancelStroke(){if(!drawing)return;const state=JSON.parse(drawing.before);maps=state.maps;index=state.index;selection=state.selection;drawing=null;refresh();}
function moveBy(dx,dy){let error;change(()=>{const result=moveSelection(current(),selection,dx,dy);if(result.ok)selection=result.selection;else error=result.error;});if(error)$('save-status').textContent=error;}
function eventCell(e){const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/1120,r.height/640);const [col,row]=worldCell((e.clientX-r.left-(r.width-1120*scale)/2)/scale,(e.clientY-r.top-(r.height-640*scale)/2)/scale);return [Math.max(0,Math.min(MAP_COLS-1,col)),Math.max(0,Math.min(MAP_ROWS-1,row))];}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==2)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
  cursor=eventCell(e);const before=snapshot();
  if(tool==='select'&&e.button===0){
    if(inSelection(selection,...cursor))drawing={kind:'move',before,start:cursor,last:cursor,id:e.pointerId};
    else {drawing={kind:'select',before,start:cursor,last:cursor,id:e.pointerId};selection=selectionRect(cursor,cursor);}
  }else {drawing={kind:'paint',before,last:cursor,tool:e.button===2?'erase':tool,id:e.pointerId};paintLine(current(),cursor,cursor,drawing.tool);}
  refresh();
});
canvas.addEventListener('pointermove',e=>{
  cursor=eventCell(e);
  if(drawing&&drawing.id===e.pointerId){
    if(drawing.kind==='select')selection=selectionRect(drawing.start,cursor);
    else if(drawing.kind==='move'){
      const dx=cursor[0]-drawing.start[0],dy=cursor[1]-drawing.start[1],preview=cloneMap(current()),result=moveSelection(preview,selection,dx,dy);
      drawing.preview=result.ok?preview:null;drawing.target={...selection,col:selection.col+dx,row:selection.row+dy};drawing.error=result.error;
    }else paintLine(current(),drawing.tool==='player'?cursor:drawing.last,cursor,drawing.tool);
    drawing.last=cursor;
  }refresh();
});
for(const event of ['pointerup','lostpointercapture'])canvas.addEventListener(event,()=>finishStroke());
canvas.addEventListener('pointercancel',cancelStroke);
window.addEventListener('blur',finishStroke);
canvas.addEventListener('keydown',e=>{
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(e.code==='Escape'){e.preventDefault();cancelStroke();selection=null;refresh();return;}
  if(tool==='select'&&selection&&directions[e.code]){e.preventDefault();moveBy(...directions[e.code]);return;}
  if(directions[e.code]){e.preventDefault();const [dx,dy]=directions[e.code];cursor=[Math.max(0,Math.min(MAP_COLS-1,cursor[0]+dx)),Math.max(0,Math.min(MAP_ROWS-1,cursor[1]+dy))];refresh();}
  if(['Enter','Space','Delete','Backspace'].includes(e.code)){
    e.preventDefault();
    if(selection&&['Delete','Backspace'].includes(e.code))change(()=>clearSelection(current(),selection));
    else if(tool==='select'){selection=selectionRect(cursor,cursor);refresh();}
    else change(()=>paintLine(current(),cursor,cursor,['Delete','Backspace'].includes(e.code)?'erase':tool));
  }
});
$('level-select').addEventListener('change',e=>{finishStroke();index=Number(e.target.value);selection=null;save();refresh();});
$('level-name').addEventListener('change',()=>change(()=>{current().name=$('level-name').value;}));
$('new-level').addEventListener('click',()=>change(()=>{maps.push(createMap(`新しい作戦 ${maps.length+1}`));index=maps.length-1;}));
$('duplicate-level').addEventListener('click',()=>change(()=>{const copy=cloneMap(current());copy.name=copy.name.slice(0,55)+' の複製';maps.splice(index+1,0,copy);index++;}));
$('delete-level').addEventListener('click',()=>{if(maps.length>1)change(()=>{maps.splice(index,1);index=Math.min(index,maps.length-1);selection=null;});});
$('undo').addEventListener('click',()=>restore(undo,redo));$('redo').addEventListener('click',()=>restore(redo,undo));
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();if(e.shiftKey)restore(redo,undo);else restore(undo,redo);}else if(e.code==='KeyV'&&!e.ctrlKey&&!e.metaKey){finishStroke();tool='select';refresh();}});
for(const button of document.querySelectorAll('[data-selection-action]'))button.addEventListener('click',()=>{
  if(!selection)return;
  const action=button.dataset.selectionAction;
  if(action==='delete')change(()=>clearSelection(current(),selection));
  else if(action==='deselect'){selection=null;refresh();}
  else moveBy(...({left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[action]));
});
$('export').addEventListener('click',()=>{
  finishStroke();const blob=new Blob([serializeMaps(maps)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='tiny-tanks-levels.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('save-status').textContent='JSONを書き出しました。ダウンロード先を確認してください。';
});
$('save-source').addEventListener('click',async()=>{
  finishStroke();const button=$('save-source');button.disabled=true;
  try{
    save();
    const result=await levelSaver.save(maps);
    $('save-status').textContent=result.method==='download'?'levels.js を書き出しました。Tanks/levels.js と置き換えて、ゲームを再読み込みしてください。':'✓ levels.js に保存しました。通常のゲームを再読み込みすると反映されます。';
  }catch(error){$('save-status').textContent=error.name==='AbortError'?'保存をキャンセルしました。編集内容はブラウザに残っています。':`標準レベルに保存できません：${error.message}`;}
  finally{button.disabled=false;}
});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>2_000_000)throw new Error('ファイルは2MB以下にしてください。');const imported=parseMapPack(await file.text(),{playable:false});change(()=>{maps=imported;index=0;selection=null;});}
  catch(error){$('save-status').textContent=`読み込みできませんでした：${error.message}`;}
  e.target.value='';
});
function play(all){
  finishStroke();
  try{const selected=parseMapPack({version:2,levels:all?maps:[current()]});save();sessionStorage.setItem(PLAYTEST_STORAGE_KEY,serializeMaps(selected));window.location.href='./?editor=1';}
  catch(error){$('save-status').textContent=`試遊できません：${error.message}`;}
}
$('play-level').addEventListener('click',()=>play(false));$('play-pack').addEventListener('click',()=>play(true));
refresh();$('save-status').textContent=startupMessage;
