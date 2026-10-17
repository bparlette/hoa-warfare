#!/usr/bin/env node
// Zero-dependency static server for the web slice & local assets.
// node tools/serve.mjs [port]         -> this machine only (http://localhost:8642/)
// node tools/serve.mjs [port] --lan   -> also on the Wi-Fi LAN, for testing on a phone. Anyone on that
//                                         network can then load the repo's files, so only on trusted Wi-Fi.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = new URL('..', import.meta.url).pathname;
const port = Number(process.argv.slice(2).find(a => /^\d+$/.test(a))) || 8642;
const lan = process.argv.includes('--lan') || process.env.HOST === '0.0.0.0';
const MAX_UPLOAD = 300 * 1024 * 1024; // a 15 s 8 Mbps clip is ~15 MB
const isLoopback = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

/** Read a POST body, refusing anything larger than MAX_UPLOAD. Resolves null if refused. */
function readBody(req, res) {
  return new Promise(resolve => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_UPLOAD) { res.writeHead(413).end('Too large'); req.destroy(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(size > MAX_UPLOAD ? null : Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4'
};

function getLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function renderPortalHtml(lanIp) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Call of Karen: HOA Warfare — Local Wi-Fi Portal</title>
  <style>
    :root { --bg: #0c1218; --card: #15222e; --accent: #ffd200; --cyan: #00e5ff; --text: #e6f1ff; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 24px; line-height: 1.5; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.6rem; color: var(--accent); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    p.sub { color: #8fa0b5; margin-bottom: 20px; font-size: 0.95rem; }
    .card { background: var(--card); border: 1px solid #23374d; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    h2 { font-size: 1.15rem; color: var(--cyan); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .btn { display: inline-block; background: var(--accent); color: #000; font-weight: 700; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-size: 0.95rem; text-align: center; margin-right: 8px; margin-bottom: 8px; transition: transform 0.1s; }
    .btn:active { transform: scale(0.98); }
    .btn-secondary { background: #23374d; color: var(--text); }
    .btn-block { display: block; width: 100%; margin-right: 0; }
    video { width: 100%; max-width: 320px; border-radius: 10px; border: 2px solid #23374d; margin: 12px auto; display: block; background: #000; }
    ul { list-style: none; }
    li { margin-bottom: 10px; }
    .meta { font-size: 0.82rem; color: #7f93a8; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Call of Karen: HOA Warfare</h1>
    <p class="sub">Local Wi-Fi Network Portal (Host: ${lanIp})</p>

    <div class="card">
      <h2>🎮 Play in Browser</h2>
      <a class="btn btn-block" href="/web/">Launch Game (HTML5 / WebGL)</a>
    </div>

    <div class="card">
      <h2>📱 Viral 9:16 Shorts (Video)</h2>
      <video controls playsinline preload="metadata" src="/dist/shorts/hoa_warfare_viral_short.mp4"></video>
      <ul>
        <li>
          <a class="btn" href="/dist/shorts/hoa_warfare_viral_short.mp4" download="hoa_warfare_viral_short.mp4">⬇ Download Viral Short (720x1280 · 8.7MB)</a>
          <div class="meta">Vertical 9:16 with meme captions & voice line</div>
        </li>
        <li>
          <a class="btn btn-secondary" href="/web/shorts/hoa_warfare_karens_short_720p.mp4" download="hoa_warfare_karens_short_720p.mp4">⬇ Download Karen Short (720p · 5.8MB)</a>
          <div class="meta">Alternative cut with 720p Karen gameplay</div>
        </li>
      </ul>
    </div>

    <div class="card">
      <h2>🖼️ Portal Artwork & Graphics</h2>
      <ul>
        <li>
          <a class="btn btn-secondary" href="/assets/crazygames/cover_landscape_1280x720.jpg" download>Landscape Cover (1280×720 JPG)</a>
        </li>
        <li>
          <a class="btn btn-secondary" href="/assets/crazygames/cover_square_512x512.png" download>Square Cover (512×512 PNG)</a>
        </li>
        <li>
          <a class="btn btn-secondary" href="/web/assets/badge.png" download>Official Badge Master (1024×1024 PNG)</a>
        </li>
        <li>
          <a class="btn btn-secondary" href="/assets/art/cover_key_art.jpg" download>Key Art Master (1376×768 JPG)</a>
        </li>
      </ul>
    </div>
  </div>
</body>
</html>`;
}

createServer(async (req, res) => {
  // No CORS headers: the game posts clips same-origin, and a wildcard let any website read the repo.
  // Uploads (shorts tooling) are accepted from this machine only, even in --lan mode.
  const uploads = { '/api/save_clip': 'raw_clip.webm', '/api/save_overlay': 'overlay.png' };
  if (req.method === 'POST' && uploads[req.url]) {
    if (!isLoopback(req)) { res.writeHead(403).end('Uploads only from this machine'); return; }
    const buf = await readBody(req, res);
    if (!buf) return;
    try {
      await mkdir(join(root, 'dist/shorts'), { recursive: true });
      await writeFile(join(root, 'dist/shorts', uploads[req.url]), buf);
      console.log(`Saved ${uploads[req.url]}:`, buf.length, 'bytes');
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, bytes: buf.length }));
    } catch (err) {
      res.writeHead(500).end(String(err.message));
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

  let reqPath;
  try { reqPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (reqPath === '/' || reqPath === '') {
    const lanIp = lan ? getLanIp() : 'localhost';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(renderPortalHtml(lanIp));
    return;
  }

  let normalized = normalize(reqPath);
  if (normalized.endsWith('/')) normalized += 'index.html';
  const file = join(root, normalized);
  // never serve dotfiles (.git, .env, .claude...)
  if (!file.startsWith(root) || normalized.split(/[\\/]/).some(seg => seg.startsWith('.') && seg.length > 1)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(file);
    if (fileStat.isDirectory()) {
      res.writeHead(302, { Location: reqPath.replace(/\/?$/, '/') }).end();
      return;
    }

    const mime = types[extname(file)] || 'application/octet-stream';
    const range = req.headers.range;

    // HTTP Range streaming for video playback (crucial for iOS Safari / Mobile browsers)
    if (range && (extname(file) === '.mp4' || extname(file) === '.webm')) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      const size = fileStat.size;
      let start = m && m[1] !== '' ? Number(m[1]) : NaN;
      let end = m && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); end = size - 1; } // bytes=-N: last N
      if (!m || !(start >= 0) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      const chunkSize = (end - start) + 1;
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.destroy());
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mime,
        'Cache-Control': 'no-cache'
      });
      stream.pipe(res);
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    }).end(body);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found: ' + reqPath);
  }
}).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  const lanIp = getLanIp();
  console.log(`\n==================================================`);
  console.log(`HOA Warfare server listening on ${lan ? '0.0.0.0' : '127.0.0.1'}:${port}`);
  console.log(`  Local:        http://localhost:${port}/`);
  if (lan) {
    console.log(`  Wi-Fi / LAN:  http://${lanIp}:${port}/`);
    console.log(`  Game:         http://${lanIp}:${port}/web/`);
  } else {
    console.log(`  Phone on the same Wi-Fi: restart with --lan (trusted networks only)`);
  }
  console.log(`==================================================\n`);
});
