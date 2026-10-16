#!/usr/bin/env node
// Packaging tool for the free web demo (itch.io, CrazyGames, Newgrounds).
// Writes dist/demo/ (static, relative paths, index.html at the root) and dist/hoa-warfare-web-demo.zip.
// Usage: npm run pack   (or: node tools/package_demo.mjs)
//
// Only ships what the demo loads: game code, three.js, data, the logo/favicon/menu art, and voice
// lines for the demo factions (DEMO_FACTIONS in web/src/engine/game.js; bots only use those too).
// Marketing video (web/shorts, web/clips) and art masters stay out, so the first load stays small.

import { cpSync, mkdirSync, rmSync, existsSync, statSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const WEB = join(ROOT, 'web');
const DIST = join(ROOT, 'dist');
const DEMO = join(DIST, 'demo');
const ZIP_PATH = join(DIST, 'hoa-warfare-web-demo.zip');
const MAX_ZIP_MB = 40; // CrazyGames asks for small initial downloads; fail loudly if we creep up

const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); cpSync(from, to, { recursive: true }); };
const mb = bytes => (bytes / 1048576).toFixed(2);

console.log('📦 Packaging Call of Karen: HOA Warfare web demo...');
if (existsSync(DEMO)) rmSync(DEMO, { recursive: true, force: true });
if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH, { force: true });
mkdirSync(DEMO, { recursive: true });

// 1. Game files
for (const f of ['index.html', 'style.css', 'manifest.webmanifest']) {
  if (existsSync(join(WEB, f))) copy(join(WEB, f), join(DEMO, f));
}
copy(join(WEB, 'src'), join(DEMO, 'src'));
copy(join(WEB, 'vendor'), join(DEMO, 'vendor'));
for (const f of ['logo.png', 'favicon.png', 'badge.png']) if (existsSync(join(WEB, 'assets', f))) copy(join(WEB, 'assets', f), join(DEMO, 'assets', f));
if (existsSync(join(WEB, 'assets', 'characters'))) copy(join(WEB, 'assets', 'characters'), join(DEMO, 'assets', 'characters'));
copy(join(ROOT, 'assets', 'art', 'cover_key_art.jpg'), join(DEMO, 'assets', 'art', 'cover_key_art.jpg'));
for (const f of ['hoa_content.json', 'weapons.json', 'demo.json']) copy(join(ROOT, 'data', f), join(DEMO, 'data', f));

// 2. Paths: the repo serves web/ next to data/ and assets/; in the zip everything sits at the root.
const gamePath = join(DEMO, 'src', 'engine', 'game.js');
const game = readFileSync(gamePath, 'utf8');
const gameFixed = game.replace(/'\.\.\/data\//g, "'data/");
if (gameFixed === game) throw new Error('package_demo: expected ../data/ paths in game.js');
writeFileSync(gamePath, gameFixed);
const cssPath = join(DEMO, 'style.css');
writeFileSync(cssPath, readFileSync(cssPath, 'utf8').replace(/url\((["']?)\.\.\/assets\//g, 'url($1assets/'));

// 3. Demo flag
const htmlPath = join(DEMO, 'index.html');
writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('<head>', '<head>\n<script>window.__HOA_DEMO__ = true;</script>'));

// 4. Voice lines: demo factions only (rivalries only when both sides are in the demo)
const demoFactions = JSON.parse(game.match(/DEMO_FACTIONS\s*=\s*(\[[^\]]*\])/)[1].replace(/'/g, '"'));
const manifest = JSON.parse(readFileSync(join(WEB, 'vo', 'manifest.json'), 'utf8'));
const keep = id => {
  const m = id.match(/^rivalry\.([^-]+)-([^.]+)\./);
  return m ? demoFactions.includes(m[1]) && demoFactions.includes(m[2]) : demoFactions.includes(id.split('.')[0]);
};
if (manifest.lines && !Array.isArray(manifest)) {
  const lines = {};
  let voBytes = 0;
  for (const [id, e] of Object.entries(manifest.lines)) {
    if (!keep(id) || !existsSync(join(WEB, 'vo', e.file))) continue;
    lines[id] = e;
    copy(join(WEB, 'vo', e.file), join(DEMO, 'vo', e.file));
    voBytes += statSync(join(WEB, 'vo', e.file)).size;
  }
  writeFileSync(join(DEMO, 'vo', 'manifest.json'), JSON.stringify({ ...manifest, lines, demoFactions }));
  console.log(`  → voice: ${Object.keys(lines).length} lines for ${demoFactions.join(', ')} (${mb(voBytes)} MB)`);
} else {
  const ids = (Array.isArray(manifest) ? manifest : []).filter(keep);
  for (const id of ids) {
    const f = id.replace(/\./g, '_') + '.ogg';
    if (existsSync(join(WEB, 'vo', f))) copy(join(WEB, 'vo', f), join(DEMO, 'vo', f));
  }
  writeFileSync(join(DEMO, 'vo', 'manifest.json'), JSON.stringify(ids));
}

// 5. Sanity: nothing in the build may point above its own root
const offenders = [];
const scan = dir => {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) { if (ent.name !== 'vendor' && ent.name !== 'vo') scan(p); continue; }
    if (!/\.(js|css|html)$/.test(ent.name)) continue;
    if (/['"(]\.\.\/(data|assets)\//.test(readFileSync(p, 'utf8'))) offenders.push(p.slice(DEMO.length + 1));
  }
};
scan(DEMO);
if (offenders.length) throw new Error('package_demo: paths escape the zip root in ' + offenders.join(', '));

// 6. Zip
execSync(`cd "${DEMO}" && zip -r -q "${ZIP_PATH}" .`, { stdio: 'inherit' });
const size = statSync(ZIP_PATH).size;
console.log(`\n✅ dist/hoa-warfare-web-demo.zip (${mb(size)} MB)`);
if (size > MAX_ZIP_MB * 1048576) { console.error(`❌ zip is over ${MAX_ZIP_MB} MB`); process.exit(1); }
console.log('🚀 Upload: itch.io (HTML5, "played in the browser"), CrazyGames (Game Files), Newgrounds (HTML5 zip).');
console.log('   Check it first: node tools/serve.mjs, then open http://localhost:8642/dist/demo/');
