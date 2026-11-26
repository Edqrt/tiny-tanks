import { MAP_COLS,MAP_ROWS,cloneMap } from './tilemap.js';

export function selectionRect(a,b) {
  return {col:Math.min(a[0],b[0]),row:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0])+1,height:Math.abs(a[1]-b[1])+1};
}
export function inSelection(selection,col,row) {
  return !!selection&&col>=selection.col&&col<selection.col+selection.width&&row>=selection.row&&row<selection.row+selection.height;
}
export function clearSelection(map,selection) {
  for(let row=selection.row;row<selection.row+selection.height;row++)map.tiles[row]=map.tiles[row].slice(0,selection.col)+'.'.repeat(selection.width)+map.tiles[row].slice(selection.col+selection.width);
  map.enemies=map.enemies.filter(e=>!inSelection(selection,e.col,e.row));
  if(map.player&&inSelection(selection,...map.player))map.player=null;
}
export function moveSelection(map,selection,dx,dy) {
  const destination={...selection,col:selection.col+dx,row:selection.row+dy};
  if(!Number.isInteger(dx)||!Number.isInteger(dy)||destination.col<0||destination.row<0||destination.col+destination.width>MAP_COLS||destination.row+destination.height>MAP_ROWS)return {ok:false,error:'マップの外には移動できません。'};
  if(dx===0&&dy===0)return {ok:true,selection:destination};
  for(let row=destination.row;row<destination.row+destination.height;row++)for(let col=destination.col;col<destination.col+destination.width;col++){
    if(inSelection(selection,col,row))continue;
    if(map.tiles[row][col]!=='.'||map.enemies.some(e=>e.col===col&&e.row===row)||(map.player?.[0]===col&&map.player?.[1]===row))return {ok:false,error:'移動先に壁・穴・戦車があります。空いている場所へ移動してください。'};
  }
  const before=cloneMap(map);clearSelection(map,selection);
  for(let row=0;row<selection.height;row++){
    const y=destination.row+row;
    map.tiles[y]=map.tiles[y].slice(0,destination.col)+before.tiles[selection.row+row].slice(selection.col,selection.col+selection.width)+map.tiles[y].slice(destination.col+destination.width);
  }
  for(const e of before.enemies)if(inSelection(selection,e.col,e.row))map.enemies.push({...e,col:e.col+dx,row:e.row+dy});
  if(before.player&&inSelection(selection,...before.player))map.player=[before.player[0]+dx,before.player[1]+dy];
  return {ok:true,selection:destination};
}
