import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9772;
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--window-size=2400,1200',
  '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'hoa-runner-'))}`,
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

await send('Page.navigate', { url: 'http://127.0.0.1:8642/web/extract_lineup.html' });

let cards = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  const evalRes = await send('Runtime.evaluate', { expression: 'window.__CARDS__', returnByValue: true });
  if (evalRes.result?.value) {
    cards = evalRes.result.value;
    break;
  }
}

if (!cards) {
  console.error('Failed to extract cards!');
  process.exit(1);
}

console.log('Cards extracted count:', Object.keys(cards).length);

for (const [faction, dataUrl] of Object.entries(cards)) {
  if (faction === '__master__') {
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    writeFileSync('web/assets/faction_lineup_20.jpg', Buffer.from(base64, 'base64'));
    writeFileSync('/Users/braidpairlette/.gemini/antigravity/brain/dc5b35b1-df86-4f06-a385-b6621b4d6267/faction_lineup_20.jpg', Buffer.from(base64, 'base64'));
    console.log('Saved master 20-character lineup to web/assets/faction_lineup_20.jpg');
    continue;
  }
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(`web/assets/characters/${faction}.png`, Buffer.from(base64, 'base64'));
  console.log(`Saved character card: web/assets/characters/${faction}.png (${Buffer.from(base64, 'base64').length} bytes)`);
}

await send('Browser.close').catch(() => {});
console.log('ALL CARDS EXTRACTED AND SAVED!');
process.exit(0);
