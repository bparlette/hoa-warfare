#!/usr/bin/env node
// Automated Viral YouTube Short clip generator for HOA Warfare factions.
// Usage: node tools/make_short.mjs [faction] [durationSec]
// Example: node tools/make_short.mjs karens 10
// Output: dist/shorts/hoa_warfare_viral_short.mp4 (and dist/shorts/hoa_warfare_<faction>_short.mp4)

import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const faction = process.argv[2] || 'karens';
const dur = Math.max(3, Number(process.argv[3]) || 10);
const shortsDir = join(root, 'dist/shorts');
await mkdir(shortsDir, { recursive: true });

console.log(`🎬 Call of Karen: HOA Warfare - YouTube Short Specialist`);
console.log(`🔥 Faction: [${faction}] | Duration: ${dur}s | Output: dist/shorts/hoa_warfare_viral_short.mp4\n`);

// 1. Ensure tools/serve.mjs is running on port 8642
let spawnedServer = null;
async function ensureServer(port = 8642) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/web/`);
    if (res.ok) {
      console.log(`📡 Connected to existing server on port ${port}`);
      return;
    }
  } catch {}

  console.log(`🚀 Server not detected. Auto-launching tools/serve.mjs on port ${port}...`);
  spawnedServer = spawn('node', [join(root, 'tools/serve.mjs'), String(port)], {
    stdio: 'ignore',
    detached: false,
  });

  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 100));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/web/`);
      if (res.ok) {
        console.log(`✅ Local static server active on http://127.0.0.1:${port}/web/`);
        return;
      }
    } catch {}
  }
  throw new Error(`Failed to connect to tools/serve.mjs on port ${port}`);
}

await ensureServer(8642);

// 2. Discover Chrome & ffmpeg paths
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) {
  throw new Error(`Google Chrome binary not found at ${CHROME}`);
}

const FFMPEG = process.env.FFMPEG || (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');

// 3. Launch Chrome with 720x1280 (9:16 vertical), sound enabled, headless=new
const cdpPort = 9222 + Math.floor(Math.random() * 200);
const userDataDir = mkdtempSync(join(tmpdir(), 'hoa-cdp-short-'));

console.log(`🌐 Launching Chrome (headless=new, 720x1280, sound enabled, CDP port: ${cdpPort})...`);
const targetUrl = `http://127.0.0.1:8642/web/?autostart=1&spectate=1&faction=${encodeURIComponent(faction)}&bots=hard&wpn=3d&short=1&dur=${dur}`;

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=720,1280',
  '--use-gl=angle',
  '--use-angle=metal',
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream',
  targetUrl,
], { stdio: 'ignore' });

let chromeKilled = false;
const killChrome = () => {
  if (!chromeKilled) {
    chromeKilled = true;
    try { chrome.kill('SIGTERM'); } catch {}
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
};
process.on('exit', killChrome);
process.on('SIGINT', () => { killChrome(); process.exit(130); });

// Wait for Chrome CDP to be available
let pageTab = null;
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 200));
  try {
    const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const tabs = await listRes.json();
    pageTab = tabs.find(t => t.type === 'page');
    if (pageTab) break;
  } catch {}
}

if (!pageTab) {
  killChrome();
  throw new Error('Could not find active page tab in Chrome CDP');
}

// 4. Connect to Chrome CDP via WebSocket and monitor recording + render overlay
console.log(`🕹️ Capturing cul-de-sac bot battle & rendering viral 9:16 overlay...`);

await new Promise((resolve, reject) => {
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise(res => {
    const i = ++msgId;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  const timeout = setTimeout(() => {
    ws.close();
    resolve();
  }, (dur + 20) * 1000);

  ws.onopen = async () => {
    await send('Runtime.enable');
    await send('Console.enable');
    await send('Page.enable');

    // Force exact 9:16 vertical viewport dimensions (720x1280)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 1280,
      deviceScaleFactor: 1,
      mobile: false,
      screenOrientation: { type: 'portraitPrimary', angle: 0 },
    });

    // Generate high-resolution transparent overlay PNG with meme banner, subtitles, and callout
    const overlayScript = `(() => {
      const c = document.createElement('canvas');
      c.width = 720;
      c.height = 1280;
      const ctx = c.getContext('2d');

      // Outer framing / yellow TikTok hazard accents
      ctx.strokeStyle = '#ffec27';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, 700, 1260);

      // Top meme banner card (White box with bold black stroke)
      const banX = 24, banY = 28, banW = 672, banH = 175;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(banX, banY, banW, banH);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(banX, banY, banW, banH);

      // Red tag above headline
      ctx.fillStyle = '#ff004d';
      ctx.fillRect(banX + 16, banY + 12, 240, 26);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('🚨 SUBURBAN CODE VIOLATION', banX + 24, banY + 30);

      // Headline in Impact font
      ctx.fillStyle = '#000000';
      ctx.font = '900 32px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("POV: YOU DIDN'T MOW AT", 360, banY + 78);
      ctx.fillText("7:00 AM ON SATURDAY 💀", 360, banY + 122);

      // Live Cul-de-sac Warfare badge
      ctx.fillStyle = '#ff004d';
      ctx.fillRect(28, 220, 220, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('🔴 CUL-DE-SAC WARFARE', 38, 241);

      // Corner brackets framing the center gameplay frame
      ctx.strokeStyle = '#ffec27';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(24, 280); ctx.lineTo(24, 260); ctx.lineTo(64, 260); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(696, 280); ctx.lineTo(696, 260); ctx.lineTo(656, 260); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 885); ctx.lineTo(24, 905); ctx.lineTo(64, 905); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(696, 885); ctx.lineTo(696, 905); ctx.lineTo(656, 905); ctx.stroke();

      // Yellow subtitle box: savage voice bark
      const subX = 24, subY = 920, subW = 672, subH = 210;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.fillRect(subX, subY, subW, subH);
      ctx.strokeStyle = '#ffec27';
      ctx.lineWidth = 4;
      ctx.strokeRect(subX, subY, subW, subH);

      // Speaker tag
      ctx.fillStyle = '#29adff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SAVAGE BARK · KARENS:', subX + 20, subY + 34);

      // Killer savage line in large bold yellow text with heavy black stroke
      const line1 = '"I WANT TO SPEAK';
      const line2 = 'TO YOUR MANAGER!"';
      ctx.font = '900 42px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 10;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line1, 360, subY + 95);
      ctx.strokeText(line2, 360, subY + 148);

      ctx.fillStyle = '#ffec27';
      ctx.fillText(line1, 360, subY + 95);
      ctx.fillText(line2, 360, subY + 148);

      // Steam wishlist callout banner at bottom
      const wmX = 24, wmY = 1155, wmW = 672, wmH = 75;
      ctx.fillStyle = '#171a21';
      ctx.fillRect(wmX, wmY, wmW, wmH);
      ctx.strokeStyle = '#66c0f4';
      ctx.lineWidth = 3;
      ctx.strokeRect(wmX, wmY, wmW, wmH);

      ctx.fillStyle = '#66c0f4';
      ctx.font = '900 19px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CALL OF KAREN: HOA WARFARE - WISHLIST ON STEAM ($4.99)', 360, wmY + 45);

      return c.toDataURL('image/png');
    })()`;

    try {
      const evalRes = await send('Runtime.evaluate', { expression: overlayScript, returnByValue: true });
      const dataUrl = evalRes?.result?.result?.value;
      if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        await writeFile(join(shortsDir, 'overlay.png'), Buffer.from(base64Data, 'base64'));
        console.log(`🎨 Rendered 720x1280 viral overlay PNG in dist/shorts/overlay.png`);
      } else {
        console.warn('⚠️ Unexpected evalRes from overlayScript:', JSON.stringify(evalRes));
      }
    } catch (err) {
      console.warn('⚠️ Could not generate overlay PNG via CDP:', err.message);
    }
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map(a => a.value || a.description).join(' ');
      if (text.includes('__SHORT_RECORDING_DONE__')) {
        console.log('✅ Browser recording finished and raw WebM uploaded');
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    }
  };

  ws.onerror = (err) => reject(err);
});

killChrome();

const rawClipPath = join(shortsDir, 'raw_clip.webm');
const overlayPath = join(shortsDir, 'overlay.png');
const outViralMp4 = join(shortsDir, 'hoa_warfare_viral_short.mp4');
const outFactionMp4 = join(shortsDir, `hoa_warfare_${faction}_short.mp4`);

if (!existsSync(rawClipPath)) {
  throw new Error(`Raw clip missing at ${rawClipPath}`);
}

const rawStats = await stat(rawClipPath);
console.log(`📹 Raw gameplay captured: ${(rawStats.size / (1024 * 1024)).toFixed(2)} MB`);

// 5. Post-process via ffmpeg (/opt/homebrew/bin/ffmpeg)
// Mix procedural suburban lawn mower sound, tactical combat pops, and savage voice barks!
console.log(`⚡ Post-processing with ffmpeg (${FFMPEG})...`);

const voDir = join(root, 'web/vo');
const voDad1 = join(voDir, 'hoaDads_kill_c_0.ogg'); // "VIOLATION!"
const voKaren1 = join(voDir, 'karens_kill_c_0.ogg'); // "I want to speak to your MANAGER!"
const voDad2 = join(voDir, 'hoaDads_kill_c_2.ogg'); // "Grass at three inches? FINED."
const voKaren2 = join(voDir, 'karens_kill_c_1.ogg'); // "Consider yourself REPORTED."

// Time delays in milliseconds
const d1 = Math.round(Math.min(1000, dur * 100));
const d2 = Math.round(Math.min(3200, dur * 350));
const d3 = Math.round(Math.min(6200, dur * 650));
const d4 = Math.round(Math.min(8200, dur * 820));

const filterComplex = [
  // 1. Video stream: scale and center pad gameplay to 720x1280 @ 60fps, overlay 9:16 banner/subtitles
  `[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,fps=60[vbase]`,
  `[vbase][1:v]overlay=0:0[vout]`,

  // 2. Audio stream: procedural 2-stroke riding mower rumble + combat gunfire bursts
  // Voice barks delayed to peak dramatic comedic moments
  `[4:a]adelay=${d1}|${d1},volume=1.25[v_dad1]`,
  `[5:a]adelay=${d2}|${d2},volume=1.65[v_karen_savage]`,
  `[6:a]adelay=${d3}|${d3},volume=1.20[v_dad2]`,
  `[7:a]adelay=${d4}|${d4},volume=1.35[v_karen2]`,

  // Mix procedural lawnmower, combat gunfire, and 4 voice barks with limiter
  `[2:a][3:a][v_dad1][v_karen_savage][v_dad2][v_karen2]amix=inputs=6:duration=first:dropout_transition=2,volume=1.5,alimiter=limit=0.92[aout]`,
].join(';');

const ffmpegArgs = [
  '-y',
  // Input 0: Raw video clip
  '-i', rawClipPath,
  // Input 1: Viral 9:16 PNG overlay
  '-loop', '1', '-i', overlayPath,
  // Input 2: Procedural 2-stroke riding lawnmower rumble
  '-f', 'lavfi', '-i', `aevalsrc=exprs='0.16*sin(2*PI*56*t)*(1+0.25*sin(2*PI*8*t)) + 0.10*sin(2*PI*112*t) + 0.05*sin(2*PI*168*t) + 0.03*(2*random(0)-1)':s=48000:d=${dur}`,
  // Input 3: Tactical suburban combat pops & gunfire bursts
  '-f', 'lavfi', '-i', `aevalsrc=exprs='if(gt(mod(t,1.4),0.35),0,0.18*(2*random(0)-1)*exp(-25*mod(t,0.07)))':s=48000:d=${dur}`,
  // Input 4: HOA Dad voice bark ("VIOLATION!")
  '-i', voDad1,
  // Input 5: Karen savage voice bark ("I want to speak to your MANAGER!")
  '-i', voKaren1,
  // Input 6: HOA Dad fine bark ("Grass at three inches? FINED.")
  '-i', voDad2,
  // Input 7: Karen report bark ("Consider yourself REPORTED.")
  '-i', voKaren2,

  // Complex filter graph
  '-filter_complex', filterComplex,
  '-map', '[vout]',
  '-map', '[aout]',

  // Duration and encoding options
  '-t', String(dur),
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-ar', '48000',
  '-movflags', '+faststart',
  outViralMp4,
];

try {
  execFileSync(FFMPEG, ffmpegArgs, { stdio: 'inherit' });
} catch (err) {
  throw new Error(`FFmpeg processing failed: ${err.message}`);
}

await copyFile(outViralMp4, outFactionMp4);

const outStats = await stat(outViralMp4);
console.log(`\n🎉 YouTube Short Generation Successful!`);
console.log(`📂 Output file: ${outViralMp4}`);
console.log(`📊 File size: ${(outStats.size / (1024 * 1024)).toFixed(2)} MB (${outStats.size} bytes)`);
console.log(`📐 Resolution: 720x1280 (9:16 Vertical Short)`);
console.log(`⏱️ Duration: ${dur}s @ 60fps`);
console.log(`🔊 Savage voice bark: "I WANT TO SPEAK TO YOUR MANAGER!" + Procedural 2-Stroke Lawnmower Chaos Audio`);
