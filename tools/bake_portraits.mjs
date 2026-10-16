#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const content = JSON.parse(readFileSync(new URL('../data/hoa_content.json', import.meta.url)));
const factions = Object.keys(content.factions);

mkdirSync('web/assets/characters', { recursive: true });

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9550;
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--window-size=800,800',
  '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'hoa-baker-'))}`,
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

// Open the game with lineup
await send('Page.navigate', { url: 'http://127.0.0.1:8642/web/?baker=1' });
await sleep(2000);

// Injected baker script
const bakerJs = `
(async function() {
  const THREE = await import('./vendor/three.module.min.js');
  const { CharacterView } = await import('./src/engine/character.js');
  const content = await (await fetch('../data/hoa_content.json')).json();
  const factions = content.factions;
  
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(400, 400);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = false;
  
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  // Frame torso, head and signature accessories
  camera.position.set(0, 1.45, 2.2);
  camera.lookAt(0, 1.35, 0);
  
  const ambient = new THREE.AmbientLight(0xffffff, 1.3);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 1.8);
  dir.position.set(1.5, 3, 2.5);
  scene.add(dir);
  const rim = new THREE.DirectionalLight(0xffec27, 0.8);
  rim.position.set(-2, 2, -2);
  scene.add(rim);

  window.__bakerResults = {};

  for (const [id, f] of Object.entries(factions)) {
    const group = new THREE.Group();
    scene.add(group);
    const view = new CharacterView({ faction: id, look: f.look, seed: 42, team: 0, isLocalTeam: true });
    group.add(view.root);
    // Slight angled pose
    view.root.rotation.y = 0.28;
    renderer.render(scene, camera);
    window.__bakerResults[id] = canvas.toDataURL('image/png');
    scene.remove(group);
  }
  return Object.keys(window.__bakerResults);
})()
`;

const res = await send('Runtime.evaluate', { expression: bakerJs, awaitPromise: true, returnByValue: true });
console.log('Baked factions:', res.result?.value);

const dataRes = await send('Runtime.evaluate', { expression: 'window.__bakerResults', returnByValue: true });
const results = dataRes.result?.value || {};

for (const [fId, dataUri] of Object.entries(results)) {
  const base64 = dataUri.replace(/^data:image\/png;base64,/, '');
  const dest = `web/assets/characters/${fId}.png`;
  writeFileSync(dest, Buffer.from(base64, 'base64'));
  console.log(`Saved ${dest}`);
}

ws.close();
chrome.kill();
console.log('All portraits baked successfully!');
