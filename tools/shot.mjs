#!/usr/bin/env node
// Headless smoke check: opens the web slice in Chrome, collects console errors, saves screenshots.
//   node tools/shot.mjs "<url query>" out.png [seconds] [extra js to eval before shooting]
// Needs Google Chrome installed and `node tools/serve.mjs` running. Uses CDP over Node's WebSocket.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [query = 'spectate=1&seed=7', out = 'dist/shot.png', secs = '6', evalJs = ''] = process.argv.slice(2);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9330 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1280,720', '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'hoa-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Watchdog: never hang the caller (CI, agents) if Chrome or the page wedges.
const watchdog = setTimeout(() => { console.error('shot.mjs: timed out, killing Chrome'); chrome.kill('SIGKILL'); process.exit(2); }, (Number(secs) + 45) * 1000);
watchdog.unref?.();

let ws;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(200);
}
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', m => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(`[${msg.params.type}] ` + msg.params.args.map(a => a.value ?? a.description).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  if (msg.method === 'Log.entryAdded') logs.push(`[${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; if (process.env.SHOT_DEBUG) console.error('->', method); pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
// MOBILE=1 emulates a landscape phone with touch; TOUCH='[{"type":"touchStart","points":[[x,y]...],"wait":ms},...]'
// replays real touch events (ids = point index) after the page loads.
if (process.env.MOBILE) {
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
await send('Page.navigate', { url: `${process.env.SHOT_BASE || 'http://127.0.0.1:8642'}${process.env.SHOT_PATH || '/web/'}?${query}` });
await sleep(Number(secs) * 1000);
if (process.env.TOUCH) {
  for (const step of JSON.parse(process.env.TOUCH)) {
    await send('Input.dispatchTouchEvent', { type: step.type, touchPoints: (step.points || []).map(([x, y], id) => ({ x, y, id })) });
    if (step.wait) await sleep(step.wait);
  }
}
if (evalJs) {
  const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
  console.log('eval:', JSON.stringify(r.result?.result?.value ?? r.result));
  await sleep(1500);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(logs.join('\n') || '(no console output)');
console.log('saved', out);
ws.close();
chrome.kill();
process.exit(0);
