import { ENEMY_PROFILES } from './enemy-profiles.js';

export const TILE_SIZE=20, MAP_COLS=50, MAP_ROWS=25;
export const MAP_ORIGIN={x:60,y:70};
export const MAP_STORAGE_KEY='tiny-tanks-maps-v1';
export const PLAYTEST_STORAGE_KEY='tiny-tanks-playtest-v1';
export const MAX_LEVELS=100, MAX_ENEMIES=32;
export const cellCenter=(col,row)=>[MAP_ORIGIN.x+(col+.5)*TILE_SIZE,MAP_ORIGIN.y+(row+.5)*TILE_SIZE];
export const worldCell=(x,y)=>[Math.floor((x-MAP_ORIGIN.x)/TILE_SIZE),Math.floor((y-MAP_ORIGIN.y)/TILE_SIZE)];
export const cloneMap=map=>JSON.parse(JSON.stringify(map));

export function createMap(name='新しい作戦') {
  return {name,tiles:Array.from({length:MAP_ROWS},()=>'.'.repeat(MAP_COLS)),player:[7,21],enemies:[{col:41,row:6,type:'brown'}]};
}

export function validateMap(map,{playable=true,cols=MAP_COLS,rows=MAP_ROWS}={}) {
  const errors=[];
  if(!map||typeof map!=='object')return ['レベルの形式が正しくありません。'];
  if(typeof map.name!=='string'||map.name.length>60||(playable&&!map.name.trim()))errors.push('レベル名は1〜60文字で入力してください。');
  const validTiles=Array.isArray(map.tiles)&&map.tiles.length===rows&&map.tiles.every(row=>typeof row==='string'&&row.length===cols&&/^[.#+O]+$/.test(row));
  if(!validTiles)errors.push(`マップは${cols}列×${rows}行で、床「.」・壁「#」・壊せる壁「+」・穴「O」を指定してください。`);
  const validCell=cell=>Array.isArray(cell)&&cell.length===2&&cell.every(Number.isInteger)&&cell[0]>=0&&cell[0]<cols&&cell[1]>=0&&cell[1]<rows;
  if(map.player!==null&&!validCell(map.player))errors.push('プレイヤーの配置が正しくありません。');
  if(playable&&map.player===null)errors.push('プレイヤーを1台配置してください。');
  if(!Array.isArray(map.enemies)||map.enemies.length>MAX_ENEMIES)errors.push(`敵は${MAX_ENEMIES}台まで配置できます。`);
  const spawns=[];
  if(validCell(map.player))spawns.push({cell:map.player,label:'プレイヤー'});
  if(Array.isArray(map.enemies)){
    if(playable&&map.enemies.length===0)errors.push('敵を1台以上配置してください。');
    map.enemies.forEach((enemy,i)=>{
      if(!enemy||!validCell([enemy.col,enemy.row])||typeof enemy.type!=='string'||!Object.hasOwn(ENEMY_PROFILES,enemy.type))errors.push(`敵${i+1}の配置または種類が正しくありません。`);
      else spawns.push({cell:[enemy.col,enemy.row],label:`敵${i+1}`});
    });
  }
  // Tank radius is 18px, so a spawn also needs clearance in adjacent cells.
  if(playable&&validTiles)for(let i=0;i<spawns.length;i++){
    const {cell:[col,row],label}=spawns[i],[x,y]=cellCenter(col,row);
    if(col===0||row===0||col===MAP_COLS-1||row===MAP_ROWS-1)errors.push(`${label}が外周に近すぎます。外側から1マス空けてください。`);
    for(let r=Math.max(0,row-1);r<=Math.min(MAP_ROWS-1,row+1);r++)for(let c=Math.max(0,col-1);c<=Math.min(MAP_COLS-1,col+1);c++){
      if(map.tiles[r][c]==='.')continue;
      const dx=x-Math.max(MAP_ORIGIN.x+c*TILE_SIZE,Math.min(x,MAP_ORIGIN.x+(c+1)*TILE_SIZE));
      const dy=y-Math.max(MAP_ORIGIN.y+r*TILE_SIZE,Math.min(y,MAP_ORIGIN.y+(r+1)*TILE_SIZE));
      if(Math.hypot(dx,dy)<18){errors.push(`${label}が${map.tiles[r][c]==='O'?'穴':'壁'}に重なっています。周囲に空間を空けてください。`);r=MAP_ROWS;break;}
    }
    for(let j=0;j<i;j++){const [ox,oy]=cellCenter(...spawns[j].cell);if(Math.hypot(x-ox,y-oy)<36)errors.push(`${label}と${spawns[j].label}が近すぎます。`);}
  }
  return errors;
}

export function parseMapPack(value,{playable=true}={}) {
  const data=typeof value==='string'?JSON.parse(value):value;
  if(!data||![1,2].includes(data.version)||!Array.isArray(data.levels)||data.levels.length<1||data.levels.length>MAX_LEVELS)throw new Error(`version: 2 と1〜${MAX_LEVELS}個の levels が必要です。`);
  return data.levels.map((level,i)=>{
    const retired={sentry:'brown',scout:'red',sniper:'green'};
    if(Array.isArray(level?.enemies))level={...level,enemies:level.enemies.map(enemy=>typeof enemy?.type==='string'&&Object.hasOwn(retired,enemy.type)?{...enemy,type:retired[enemy.type]}:enemy)};
    if(data.version===1&&level?.tiles?.length===29)level=migrateLegacyMap(level);
    const errors=validateMap(level,{playable});
    if(errors.length)throw new Error(`レベル${i+1}：${errors.join(' ')}`);
    return {name:level.name,tiles:[...level.tiles],player:level.player?[...level.player]:null,enemies:level.enemies.map(({col,row,type})=>({col,row,type}))};
  });
}

export function serializeMaps(maps) {return JSON.stringify({version:2,levels:maps},null,2);}

export function migrateLegacyMap(map) {
  const errors=validateMap(map,{playable:false,cols:53,rows:29});if(errors.length)throw new Error(errors.join(' '));
  const resize=([col,row])=>[Math.floor((col+.5)*MAP_COLS/53),Math.floor((row+.5)*MAP_ROWS/29)];
  const tiles=Array.from({length:MAP_ROWS},()=>Array(MAP_COLS).fill('.'));
  for(let row=0;row<29;row++)for(let col=0;col<53;col++){
    const tile=map.tiles[row][col];if(tile==='.')continue;
    const [c,r]=resize([col,row]);if(tiles[r][c]!=='#')tiles[r][c]=tile;
  }
  return {name:map.name,tiles:tiles.map(row=>row.join('')),player:map.player?resize(map.player):null,enemies:map.enemies.map(e=>{const [col,row]=resize([e.col,e.row]);return {col,row,type:e.type};})};
}

// Walls and holes have separate collision layers. Breakable walls stay individual.
export function compileMap(map) {
  const errors=validateMap(map);if(errors.length)throw new Error(errors.join(' '));
  const walls=[],holes=[],active=new Map();
  for(let row=0;row<MAP_ROWS;row++){
    const next=new Map();
    for(let col=0;col<MAP_COLS;col++){
      if(map.tiles[row][col]==='+'){walls.push([MAP_ORIGIN.x+col*TILE_SIZE,MAP_ORIGIN.y+row*TILE_SIZE,TILE_SIZE,TILE_SIZE,1]);continue;}
      const tile=map.tiles[row][col];if(tile!=='#'&&tile!=='O')continue;
      const start=col;while(col+1<MAP_COLS&&map.tiles[row][col+1]===tile)col++;
      const count=col-start+1,key=`${tile}:${start}:${count}`,prev=active.get(key);
      if(prev){prev[3]+=TILE_SIZE;next.set(key,prev);}
      else {const rectangle=[MAP_ORIGIN.x+start*TILE_SIZE,MAP_ORIGIN.y+row*TILE_SIZE,count*TILE_SIZE,TILE_SIZE];(tile==='O'?holes:walls).push(rectangle);next.set(key,rectangle);}
    }
    active.clear();for(const [key,wall] of next)active.set(key,wall);
  }
  return {name:map.name,tiles:[...map.tiles],player:cellCenter(...map.player),enemies:map.enemies.map(e=>[...cellCenter(e.col,e.row),e.type]),walls,holes};
}

export function paintCell(map,col,row,tool) {
  if(!Number.isInteger(col)||!Number.isInteger(row)||col<0||row<0||col>=MAP_COLS||row>=MAP_ROWS)return false;
  const before=JSON.stringify(map);
  if(tool==='player')map.player=[col,row];
  else if(Object.hasOwn(ENEMY_PROFILES,tool)){
    const existing=map.enemies.find(e=>e.col===col&&e.row===row);
    if(!existing&&map.enemies.length>=MAX_ENEMIES)return false;
    map.enemies=map.enemies.filter(e=>e!==existing);map.enemies.push({col,row,type:tool});
  }else if(!['floor','wall','soft','hole','erase'].includes(tool))return false;
  if(tool==='wall'||tool==='soft'||tool==='hole'||tool==='erase'||tool==='player'||Object.hasOwn(ENEMY_PROFILES,tool)){
    map.enemies=map.enemies.filter(e=>e.col!==col||e.row!==row||e.type===tool);
    if(tool!=='player'&&map.player?.[0]===col&&map.player?.[1]===row)map.player=null;
  }
  const tile=tool==='wall'?'#':tool==='soft'?'+':tool==='hole'?'O':'.';
  map.tiles[row]=map.tiles[row].slice(0,col)+tile+map.tiles[row].slice(col+1);
  return before!==JSON.stringify(map);
}

export function paintLine(map,from,to,tool) {
  let [x,y]=from;const [endX,endY]=to,dx=Math.abs(endX-x),dy=-Math.abs(endY-y),sx=x<endX?1:-1,sy=y<endY?1:-1;let error=dx+dy,changed=false;
  while(true){changed=paintCell(map,x,y,tool)||changed;if(x===endX&&y===endY)break;const e=error*2;if(e>=dy){error+=dy;x+=sx;}if(e<=dx){error+=dx;y+=sy;}}
  return changed;
}
