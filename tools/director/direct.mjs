#!/usr/bin/env node
// Viral-video director: renders a shot script (scripts/*.mjs) to a vertical 1080x1920 MP4 with exact,
// scripted movement, aim, gunfire, voice lines, camera and captions. Video tooling only: nothing in web/
// loads it, and the game behaves the same with or without it.
//
//   node tools/director/direct.mjs <script.mjs> --dry       run the script headless, print what happened when
//   node tools/director/direct.mjs <script.mjs> [out.mp4]   render frames in headless Chrome + mix audio + ffmpeg
//
// Rendering is frame-locked (the sim advances exactly 1/fps per frame, however slow Chrome is), so the
// same script always gives the same clip. Needs Google Chrome and ffmpeg. Output: dist/director/<name>.mp4
import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Stage, STEP } from './stage.js';

const root = new URL('../../', import.meta.url);
const args = process.argv.slice(2);
const scriptPath = args.find(a => !a.startsWith('--'));
if (!scriptPath) { console.error('usage: node tools/director/direct.mjs <script.mjs> [--dry] [out.mp4]'); process.exit(1); }
const script = (await import(pathToFileURL(resolve(scriptPath)).href)).default;
const json = p => JSON.parse(readFileSync(new URL(p, root)));
const content = json('data/hoa_content.json'), weapons = json('data/weapons.json'), manifest = json('web/vo/manifest.json');

if (args.includes('--dry')) {
  const stage = new Stage({ script, content, weapons, manifest });
  while (!stage.done) stage.step();
  for (const e of stage.log) console.log(JSON.stringify(e));
  const kills = stage.log.filter(e => e.kill).length;
  console.log(`\n${script.name}: ${stage.script.duration}s, ${kills} kill(s), ${stage.audio.filter(a => a.kind === 'voice').length} voice line(s), ${stage.audio.filter(a => a.kind === 'sfx').length} sfx`);
  if (stage.errors.length) { console.error('\nSCRIPT ERRORS:\n  ' + stage.errors.join('\n  ')); process.exit(1); }
  process.exit(0);
}

// ---------------------------------------------------------------- render
const name = script.name || 'clip';
const out = resolve(args.filter(a => !a.startsWith('--'))[1] || join(new URL('dist/director/', root).pathname, `${name}.mp4`));
const work = mkdtempSync(join(tmpdir(), 'hoa-director-'));
const profile = join(work, 'chrome');
const W = 1080, H = 1920;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const serverPort = 8900 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, [new URL('tools/serve.mjs', root).pathname, String(serverPort)], { stdio: 'ignore' });
const cdpPort = 9900 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--window-size=${W},${H}`, '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

async function cleanup(code) {
  for (const p of [chrome, server]) {
    if (p.exitCode === null && p.signalCode === null) {
      const exited = new Promise(r => p.once('exit', r));
      p.kill('SIGKILL');
      await Promise.race([exited, sleep(3000)]);
    }
  }
  rmSync(work, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGINT', () => cleanup(130));

try {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
  }
  if (!wsUrl) throw new Error('Chrome did not start');
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.error('[page]', d.params.args.map(a => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/tools/director/director.html?capture=1` });
  for (let i = 0; i < 80; i++) { await sleep(250); if (await evaluate('!!window.director').catch(() => false)) break; }
  const info = await evaluate(`director.load(${JSON.stringify(script)})`);
  console.log(`🎬 ${name}: ${info.frames} frames at ${info.fps} fps (${info.duration}s), map ${info.map}`);

  const frames = join(work, 'frames');
  mkdirSync(frames);
  for (let f = 0; f < info.frames; f++) {
    const b64 = await evaluate('director.frame()');
    writeFileSync(join(frames, `${String(f).padStart(5, '0')}.jpg`), Buffer.from(b64, 'base64'));
    if (f % 30 === 0) process.stdout.write(`\r  frame ${f}/${info.frames}`);
  }
  process.stdout.write(`\r  frame ${info.frames}/${info.frames}\n`);
  const result = await evaluate('director.finish()');
  writeFileSync(join(work, 'audio.wav'), Buffer.from(await evaluate('director.renderAudio()'), 'base64'));
  if (result.errors.length) console.error('SCRIPT ERRORS:\n  ' + result.errors.join('\n  '));

  mkdirSync(resolve(out, '..'), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(info.fps), '-i', join(frames, '%05d.jpg'), '-i', join(work, 'audio.wav'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  writeFileSync(out.replace(/\.mp4$/, '.timeline.json'), JSON.stringify(result.log, null, 1));
  console.log(`✅ ${out}\n   timeline: ${out.replace(/\.mp4$/, '.timeline.json')}`);
  ws.close();
  await cleanup(result.errors.length ? 1 : 0);
} catch (err) {
  console.error('director failed:', err.message);
  await cleanup(1);
}
