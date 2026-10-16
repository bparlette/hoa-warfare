import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9771;
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--window-size=2400,1200',
  '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'hoa-stitch-'))}`,
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

await send('Page.navigate', { url: 'http://127.0.0.1:8642/web/' });
await sleep(1000);

const cropScript = `
(async function() {
  function loadImg(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  const img1 = await loadImg('/web/assets/faction_lineup.jpg');
  const img2 = await loadImg('/web/assets/new_8_factions.jpg');

  function extractCard(img, sx, sy, sw, sh) {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 300;
    const ctx = c.getContext('2d');

    const scale = Math.min(270 / sh, 270 / sw);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (300 - dw) / 2;
    const dy = 300 - dh - 12;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = sw;
    sliceCanvas.height = sh;
    const sliceCtx = sliceCanvas.getContext('2d');
    sliceCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const imgData = sliceCtx.getImageData(0, 0, sw, sh);
    const d = imgData.data;

    // Corner background sample
    const bR = d[0], bG = d[1], bB = d[2];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      const diff = Math.hypot(r - bR, g - bG, b - bB);
      if (diff < 26) {
        d[i+3] = 0;
      } else if (diff < 40) {
        d[i+3] = Math.round(((diff - 26) / 14) * 255);
      }
    }
    sliceCtx.putImageData(imgData, 0, 0);

    ctx.drawImage(sliceCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
    return c.toDataURL('image/png');
  }

  const results = {};

  // 12 from img1
  results['fratHouse'] = extractCard(img1, 20, 220, 120, 420);
  results['brainRot'] = extractCard(img1, 140, 230, 125, 410);
  results['valleyGirls'] = extractCard(img1, 255, 215, 120, 425);
  results['oldMoney'] = extractCard(img1, 365, 225, 120, 415);
  results['rednecks'] = extractCard(img1, 475, 210, 120, 430);
  results['karens'] = extractCard(img1, 585, 225, 110, 415);
  results['gymRats'] = extractCard(img1, 675, 190, 160, 450);
  results['theaterKids'] = extractCard(img1, 820, 215, 115, 425);
  results['cloutStreamers'] = extractCard(img1, 915, 210, 130, 430);
  results['wallstreetBets'] = extractCard(img1, 1030, 220, 115, 420);
  results['hoaDads'] = extractCard(img1, 1130, 220, 125, 420);
  results['emoKids'] = extractCard(img1, 1235, 230, 120, 410);

  // 8 from img2
  results['fabulous'] = extractCard(img2, 20, 195, 150, 460);
  results['trumpers'] = extractCard(img2, 165, 210, 175, 445);
  results['wokeLibs'] = extractCard(img2, 345, 200, 155, 455);
  results['mlmHuns'] = extractCard(img2, 510, 190, 145, 465);
  results['furries'] = extractCard(img2, 635, 165, 255, 490);
  results['animeWeebs'] = extractCard(img2, 870, 205, 155, 450);
  results['tradwives'] = extractCard(img2, 1025, 210, 170, 445);
  results['pickleballRetirees'] = extractCard(img2, 1190, 215, 165, 440);

  // Master 20-character lineup
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = 2480;
  fullCanvas.height = 768;
  const fullCtx = fullCanvas.getContext('2d');
  fullCtx.fillStyle = '#cbcbcb';
  fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

  // Draw 12 original characters on left
  fullCtx.drawImage(img1, 0, 0, 1376, 768, 0, 0, 1440, 768);

  // Draw 8 new characters on right
  fullCtx.drawImage(img2, 20, 0, 1350, 768, 1440, 0, 1040, 768);

  results['__master__'] = fullCanvas.toDataURL('image/jpeg', 0.94);

  return results;
})();
`;

const res = await send('Runtime.evaluate', { expression: cropScript, awaitPromise: true, returnByValue: true });
if (res.exceptionDetails) {
  console.error('Eval error:', res.exceptionDetails);
  process.exit(1);
}

const cards = res.result?.value || {};
console.log('Received keys:', Object.keys(cards));

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
console.log('Finished successfully!');
process.exit(0);
