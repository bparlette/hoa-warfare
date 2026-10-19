#!/usr/bin/env node
// Lobby / modal layout audit: finds interactive controls that are clipped off-screen,
// stacked on top of each other, or too small to tap. Runs headless at several viewport
// sizes so a desktop-only tweak can't silently break the phone layout.
//   node tools/ui-audit.mjs                     audit the default viewport set
//   VP="844x390@2" node tools/ui-audit.mjs      single viewport (WxH@DPR)
// Needs `node tools/serve.mjs` running (same guard as tools/shot.mjs).
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = process.env.SHOT_BASE || 'http://127.0.0.1:8642';
const path = process.env.SHOT_PATH || '/web/';
const query = process.env.AUDIT_QUERY || 'voice=0';
const viewports = (process.env.VP || '1280x720@1,844x390@2,1024x600@1,390x844@2').split(',').map(s => {
  const [wh, dpr = '1'] = s.split('@');
  const [w, h] = wh.split('x').map(Number);
  return { w, h, dpr: Number(dpr) };
});

const port = 9330 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'hoa-ui-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1280,720', '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
async function finish(code) {
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(r => chrome.once('exit', r));
    chrome.kill('SIGKILL');
    await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]);
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const watchdog = setTimeout(() => { console.error('ui-audit: timed out'); finish(2); }, 180000);
watchdog.unref?.();

// Refuse to audit a stale server: same guard as shot.mjs, because a leftover
// serve.mjs from another checkout answers on 8642 with old markup.
{
  const probe = await fetch(`${base}/web/index.html`).then(r => (r.ok ? r.text() : null)).catch(() => null);
  if (probe === null) { console.error(`ui-audit: nothing is serving ${base} - start it here: node tools/serve.mjs 8642`); process.exit(1); }
  if (probe !== readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')) {
    console.error(`ui-audit: ${base} is serving a DIFFERENT copy of the repo (index.html differs).`);
    process.exit(1);
  }
}

let ws;
for (let i = 0; i < 50; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
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
  if (msg.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

// Page-side auditor. Works on any container so the same code covers the lobby and modals.
const AUDIT = String.raw`
window.__audit = (rootSels) => {
  // first selector that exists AND is actually on screen - #menu is always in the
  // DOM, so a naive querySelector would re-audit the lobby while a modal is open.
  const picked = (Array.isArray(rootSels) ? rootSels : [rootSels]).map(s => document.querySelector(s)).filter(Boolean)
    .map(el => ({ el, r: el.getBoundingClientRect() })).filter(o => o.r.width > 2 && o.r.height > 2 && getComputedStyle(o.el).display !== 'none');
  const root = picked.length ? picked[picked.length - 1].el : null;
  if (!root) return { error: 'no visible root in ' + JSON.stringify(rootSels), problems: [] };
  const vis = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const label = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
  const sel = 'button, a[href], summary, input, select, textarea, [role="button"], [data-tap]';
  // A control inside a scrolling body keeps its unclipped rect, which made the auditor
  // cry "overlap" about things nobody can see next to each other. Clip every rect by its
  // scrolling ancestors first and judge only what is actually painted.
  const visibleRect = el => {
    const r = el.getBoundingClientRect();
    const box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      box.l = Math.max(box.l, pr.left); box.t = Math.max(box.t, pr.top);
      box.r = Math.min(box.r, pr.right); box.b = Math.min(box.b, pr.bottom);
      if (box.r <= box.l || box.b <= box.t) return null;
    }
    return box;
  };
  const items = [...root.querySelectorAll(sel)].filter(vis).map(el => {
    const box = visibleRect(el);
    const r = el.getBoundingClientRect();
    return { clipped: box ? Math.round(100 * ((box.r - box.l) * (box.b - box.t)) / (r.width * r.height)) : 0,
      name: label(el), text: (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 28),
      x: Math.round((box || r).l), y: Math.round((box || r).t),
      w: Math.round(box ? box.r - box.l : r.width), h: Math.round(box ? box.b - box.t : r.height),
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true' };
  }).filter(it => it.clipped > 0);
  const problems = [];
  const vw = innerWidth, vh = innerHeight;
  for (const it of items) {
    const out = [];
    if (it.x < -1) out.push('left ' + it.x);
    if (it.y < -1) out.push('top ' + it.y);
    if (it.x + it.w > vw + 1) out.push('right ' + (it.x + it.w) + '>' + vw);
    if (it.y + it.h > vh + 1) out.push('bottom ' + (it.y + it.h) + '>' + vh);
    if (out.length) problems.push({ kind: 'offscreen', name: it.name, text: it.text, detail: out.join(', ') });
    if (!it.disabled && it.h < 30) problems.push({ kind: 'tiny-tap', name: it.name, text: it.text, detail: it.h + 'px tall' });
    if (it.clipped < 60) problems.push({ kind: 'clipped', name: it.name, text: it.text, detail: it.clipped + '% visible' });
  }
  const area = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    const ov = area(a, b), small = Math.min(a.w * a.h, b.w * b.h);
    if (ov > small * 0.25) problems.push({ kind: 'overlap', name: a.name + ' / ' + b.name,
      text: a.text + ' | ' + b.text, detail: Math.round(100 * ov / small) + '% of the smaller control' });
  }
  return { count: items.length, problems, items };
};
true`;

let total = 0;
for (const vp of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.w < 900 });
  if (vp.w < 900) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  else await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Page.navigate', { url: `${base}${path}?${query}` });
  await sleep(2500);
  await evaluate(AUDIT);
  const states = [{ name: 'lobby', root: '#menu' }];
  // Also audit the match-settings modal: it is the densest panel and is opened on phones constantly.
  await evaluate(`document.getElementById('btnMatchSettings')?.click(); true`);
  await sleep(400);
  states.push({ name: 'match-settings', root: ['#matchSettingsModal'] });
  if (process.env.PROBE) {
    // PROBE="<js expression returning serialisable data>" dumps its value for the current viewport.
    const out = await evaluate(`JSON.stringify((() => { try { return (${process.env.PROBE}); } catch (e) { return { probeError: String(e) }; } })())`);
    console.log(`${vp.w}x${vp.h}@${vp.dpr} probe: ${out}`);
  }
  const tag = `${vp.w}x${vp.h}@${vp.dpr}`;
  for (const st of states) {
    let res;
    try { res = await evaluate(`JSON.stringify(window.__audit(${JSON.stringify(st.root)}))`); } catch (e) { console.log(`${tag} ${st.name}: ERROR ${e.message}`); continue; }
    const data = JSON.parse(res);
    if (!data.problems.length) { console.log(`${tag} ${st.name}: OK (${data.count} controls)`); continue; }
    console.log(`${tag} ${st.name}: ${data.problems.length} issue(s) across ${data.count} controls`);
    for (const p of data.problems) { console.log(`  - [${p.kind}] ${p.name} "${p.text}" -> ${p.detail}`); total++; }
  }
}
if (logs.length) console.log('\nconsole problems:\n' + logs.join('\n'));
console.log(total ? `\n${total} layout issue(s) found` : '\nno layout issues found');
ws.close();
await finish(total ? 1 : 0);
