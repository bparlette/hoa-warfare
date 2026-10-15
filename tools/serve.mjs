#!/usr/bin/env node
// Zero-dependency static server for the web slice.  node tools/serve.mjs [port]  ->  http://localhost:8642/web/
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const port = Number(process.argv[2]) || 8642;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4' };

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/save_clip') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const buf = Buffer.concat(chunks);
      await mkdir(join(root, 'dist/shorts'), { recursive: true });
      await writeFile(join(root, 'dist/shorts/raw_clip.webm'), buf);
      console.log('Saved raw clip:', buf.length, 'bytes');
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, bytes: buf.length }));
    });
    return;
  }
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`HOA Warfare web slice: http://localhost:${port}/web/`));
