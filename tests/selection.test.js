import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap,cloneMap,paintCell,MAP_COLS,MAP_ROWS } from '../src/tilemap.js';
import { selectionRect,inSelection,clearSelection,moveSelection } from '../src/selection.js';

test('selection supports dragging in any direction and includes both endpoints',()=>{
  const a=selectionRect([13,12],[10,10]);assert.deepEqual(a,{col:10,row:10,width:4,height:3});
  assert.equal(inSelection(a,13,12),true);assert.equal(inSelection(a,14,12),false);
  assert.deepEqual(selectionRect([1,1],[1,1]),{col:1,row:1,width:1,height:1});
});
test('moving a region moves both wall types and tanks without changing other content',()=>{
  const map=createMap();paintCell(map,10,10,'wall');paintCell(map,11,10,'soft');
  paintCell(map,11,11,'player');paintCell(map,12,12,'black');const other=cloneMap(map.enemies[0]);
  const result=moveSelection(map,selectionRect([10,10],[12,12]),5,3);
  assert.equal(result.ok,true);assert.deepEqual(map.player,[16,14]);
  assert.ok(map.enemies.some(e=>e.type==='black'&&e.col===17&&e.row===15));assert.deepEqual(map.enemies[0],other);
  assert.equal(map.tiles[13][15],'#');assert.equal(map.tiles[13][16],'+');
  for(let r=10;r<=12;r++)assert.equal(map.tiles[r].slice(10,13),'...');
});
test('overlapping moves use the original content and do not erase it while shifting',()=>{
  const map=createMap();paintCell(map,10,10,'wall');paintCell(map,11,10,'soft');paintCell(map,12,10,'wall');
  assert.equal(moveSelection(map,selectionRect([10,10],[12,10]),1,0).ok,true);
  assert.equal(map.tiles[10].slice(10,14),'.#+#');
  assert.equal(moveSelection(map,selectionRect([11,10],[13,10]),-1,0).ok,true);
  assert.equal(map.tiles[10].slice(10,14),'#+#.');
});
test('blocked and out-of-bounds moves leave the entire map unchanged',()=>{
  const map=createMap();paintCell(map,10,10,'wall');paintCell(map,15,10,'soft');
  const selection=selectionRect([10,10],[10,10]),before=cloneMap(map);
  for(const [dx,dy] of [[5,0],[-11,0],[MAP_COLS,0],[0,MAP_ROWS]]){assert.equal(moveSelection(map,selection,dx,dy).ok,false);assert.deepEqual(map,before);}
  const enemy=map.enemies[0];assert.equal(moveSelection(map,selection,enemy.col-10,enemy.row-10).ok,false);assert.deepEqual(map,before);
  assert.equal(moveSelection(map,selection,map.player[0]-10,map.player[1]-10).ok,false);assert.deepEqual(map,before);
});
test('clearing a region removes included tanks and terrain, and zero movement is a no-op',()=>{
  const map=createMap();paintCell(map,10,10,'wall');paintCell(map,11,11,'player');paintCell(map,12,12,'red');
  const selection=selectionRect([10,10],[12,12]),before=cloneMap(map);
  assert.equal(moveSelection(map,selection,0,0).ok,true);assert.deepEqual(map,before);
  clearSelection(map,selection);assert.equal(map.player,null);assert.equal(map.tiles[10][10],'.');assert.equal(map.enemies.length,1);
  assert.deepEqual(before.player,[11,11]);
});
