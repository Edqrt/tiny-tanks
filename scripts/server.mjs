import http from 'node:http';
import { readFile,writeFile,rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseMapPack } from '../src/tilemap.js';
import { formatLevelSource } from '../src/level-save.js';

const root = path.resolve(fileURLToPath(new URL('../src/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const host=req.headers.host,port=server.address().port;
    if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(host)){res.writeHead(403).end('Forbidden host');return;}
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if(pathname==='/api/editor-capabilities'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify({service:'tiny-tanks',saveLevels:true}));return;
    }
    if(pathname==='/api/levels'){
      if(req.method!=='POST'){res.writeHead(405,{'Allow':'POST'}).end();return;}
      if(req.headers.origin!==`http://${host}`||req.headers['content-type']?.split(';')[0]!=='application/json'){
        res.writeHead(403).end('Same-origin JSON requests only');return;
      }
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>2_000_000){res.writeHead(413).end();return;}chunks.push(chunk);}
      let levels;
      try{levels=parseMapPack(Buffer.concat(chunks).toString('utf8'));}catch(error){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:error.message}));return;}
      const source=formatLevelSource(levels);
      const temporary=path.join(root,`.levels-${randomUUID()}.tmp`);
      await writeFile(temporary,source,'utf8');await rename(temporary,path.join(root,'levels.js'));
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({saved:levels.length}));return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
      res.writeHead(403).end(); return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(process.env.PORT===undefined?4173:Number(process.env.PORT), '127.0.0.1', () => console.log(`Local: http://localhost:${server.address().port}`));
