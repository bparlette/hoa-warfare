#!/usr/bin/env node
// Automated YouTube Short clip generator for HOA Warfare factions.
// Usage: node tools/make_short.mjs [faction] [durationSec]
// Example: node tools/make_short.mjs karens 8
// Output: dist/shorts/hoa_warfare_<faction>_short.mp4

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const faction = process.argv[2] || 'karens';
const dur = Number(process.argv[3]) || 8;
const root = new URL('..', import.meta.url).pathname;

console.log(`🎬 Generating YouTube Short for faction [${faction}], duration: ${dur}s...`);
await mkdir(join(root, 'dist/shorts'), { recursive: true });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/hoa-cdp-short',
  '--window-size=720,1280',
  '--use-gl=angle',
  '--use-angle=metal',
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  `http://127.0.0.1:8642/web/?autostart=1&spectate=1&faction=${faction}&short=1&dur=${dur}`
]);

// Wait for Chrome to listen on port 9222
await new Promise(r => setTimeout(r, 2000));

try {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.type === 'page');
  if (!pageTab) throw new Error('No page tab found in Chrome instance');

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    const timeout = setTimeout(() => { ws.close(); resolve(); }, (dur + 10) * 1000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Console.enable' }));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.args.map(a => a.value || a.description).join(' ');
        if (text.includes('__SHORT_RECORDING_DONE__')) {
          console.log('✅ Recording completed by browser');
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      }
    };
    ws.onerror = (err) => reject(err);
  });
} finally {
  chrome.kill();
}

console.log(`🎥 Raw clip captured in dist/shorts/raw_clip.webm`);
