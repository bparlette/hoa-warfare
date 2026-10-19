#!/usr/bin/env node
// Bakes high-res transparent 3D viewmodel renders for all 6 weapon classes
// using Three.js and headless Chrome.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';

const ROOT = resolve('.');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9560;

mkdirSync('web/assets/weapons', { recursive: true });

// 1. Ephemeral server
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png'
};

const server = createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = join(ROOT, urlPath);
  if (urlPath === '/' || urlPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><body><h1>Weapon Baker</h1></body></html>`);
    return;
  }
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(404).end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const serverPort = server.address().port;
console.log(`Ephemeral server listening on port ${serverPort}`);

// 2. Headless Chrome
// Each run makes a ~30 MB throwaway profile in $TMPDIR. They were never deleted (shot.mjs had the same
// leak until 1e64617: 4.7 GB had piled up), so every exit path here kills Chrome, waits for it to stop
// writing, then removes the profile.
const profile = mkdtempSync(join(tmpdir(), 'hoa-wpn-baker-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--window-size=1000,600',
  '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(150);
}
async function finish(code = 0, err) {
  try { ws?.close(); } catch {}
  try { server.close(); } catch {}
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(r => chrome.once('exit', r));
    chrome.kill('SIGKILL');
    await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]);
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  if (err) console.error(err);
  process.exit(code);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => finish(130));
process.on('uncaughtException', e => finish(1, e));

if (!ws) {
  await finish(1, new Error('Failed to connect to headless Chrome debugger'));
}

await new Promise(r => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
ws.addEventListener('message', m => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise(r => {
  const i = ++id;
  pending.set(i, r);
  ws.send(JSON.stringify({ id: i, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/web/index.html` });
await sleep(2000);

const bakerJs = `
(async function() {
  const THREE = await import('./vendor/three.module.min.js');
  const { Renderer } = await import('./src/engine/render.js');

  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 450;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(900, 450);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 900 / 450, 0.05, 50);

  // Studio lighting
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(2, 3, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x29adff, 0.8);
  fillLight.position.set(-3, 1, 2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffec27, 1.4);
  rimLight.position.set(1, 2, -3);
  scene.add(rimLight);

  // Instantiate viewmodel mock
  const muzzleLight = new THREE.PointLight('#ffec27', 0, 15);
  camera.add(muzzleLight);

  const mock = {
    camera,
    muzzleLight,
    vmMeshes: {},
    muzzleOffsets: {},
    currentVmType: 'blaster',
    switchTimer: 0,
    bob: 0,
    kick: 0,
  };
  mock.buildViewmodel = Renderer.prototype.buildViewmodel.bind(mock);
  mock.setWeapon = Renderer.prototype.setWeapon.bind(mock);
  mock.buildViewmodel();

  const weapons = {
    allowance: { mesh: mock.vmMeshes.blaster, dist: 1.4, yOffset: -0.02, rotY: Math.PI * 0.46, rotX: 0.12, rotZ: 0.08 },
    sideHustle: { mesh: mock.vmMeshes.smg, dist: 1.1, yOffset: -0.01, rotY: Math.PI * 0.46, rotX: 0.12, rotZ: 0.08 },
    divorceSettlement: { mesh: mock.vmMeshes.shotgun, dist: 1.6, yOffset: -0.02, rotY: Math.PI * 0.46, rotX: 0.12, rotZ: 0.08 },
    trustFund: { mesh: mock.vmMeshes.sniper, dist: 2.1, yOffset: -0.03, rotY: Math.PI * 0.47, rotX: 0.10, rotZ: 0.06 },
    subdivision: { mesh: mock.vmMeshes.lmg, dist: 1.8, yOffset: -0.03, rotY: Math.PI * 0.46, rotX: 0.12, rotZ: 0.08 },
    permit: { mesh: mock.vmMeshes.pistol, dist: 0.85, yOffset: -0.01, rotY: Math.PI * 0.44, rotX: 0.14, rotZ: 0.08 }
  };

  const results = {};

  for (const [key, cfg] of Object.entries(weapons)) {
    const mesh = cfg.mesh;
    mesh.visible = true;
    scene.add(mesh);

    // Frame weapon
    camera.position.set(0, 0.08, cfg.dist);
    camera.lookAt(0, cfg.yOffset, 0);

    mesh.rotation.set(cfg.rotX, cfg.rotY, cfg.rotZ);
    mesh.position.set(0, cfg.yOffset, 0);

    renderer.render(scene, camera);
    results[key] = canvas.toDataURL('image/png');

    scene.remove(mesh);
  }

  window.__wpnBakeResults = results;
  return Object.keys(results);
})()
`;

const evalRes = await send('Runtime.evaluate', { expression: bakerJs, awaitPromise: true, returnByValue: true });
console.log('Baker execution returned:', JSON.stringify(evalRes));

const keys = evalRes.result?.result?.value || ['allowance', 'sideHustle', 'divorceSettlement', 'trustFund', 'subdivision', 'permit'];
console.log('Weapon keys to save:', keys);

for (const key of keys) {
  const itemRes = await send('Runtime.evaluate', { expression: `window.__wpnBakeResults['${key}']`, returnByValue: true });
  const dataUri = itemRes.result?.result?.value || '';
  if (!dataUri) {
    console.error(`Warning: no data for ${key}`);
    continue;
  }
  const base64 = dataUri.replace(/^data:image\/png;base64,/, '');
  const dest1 = `web/assets/weapons/${key}_3d.png`;
  writeFileSync(dest1, Buffer.from(base64, 'base64'));
  console.log(`✓ Saved ${dest1} (${base64.length} bytes)`);
}

// Copy class aliases for convenience
const classMap = {
  allowance: 'ar',
  sideHustle: 'smg',
  divorceSettlement: 'shotgun',
  trustFund: 'sniper',
  subdivision: 'lmg',
  permit: 'pistol'
};
for (const [id, cls] of Object.entries(classMap)) {
  const buf = readFileSync(`web/assets/weapons/${id}_3d.png`);
  writeFileSync(`web/assets/weapons/${cls}_3d.png`, buf);
  console.log(`✓ Copied web/assets/weapons/${cls}_3d.png`);
}

console.log('All 3D weapon viewmodels baked successfully!');
await finish(0);
