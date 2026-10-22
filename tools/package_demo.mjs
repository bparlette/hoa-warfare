#!/usr/bin/env node
// Packaging tool for the free web demo (itch.io, CrazyGames, Newgrounds).
// Writes dist/demo/ (static, relative paths, index.html at the root) and dist/hoa-warfare-web-demo.zip.
// Usage: npm run pack   (or: node tools/package_demo.mjs)
//
// Only ships what the demo loads: game code, three.js, data, the logo/favicon/menu art, and voice
// lines for the demo factions (DEMO_FACTIONS in web/src/engine/game.js; bots only use those too).
// Marketing video (web/shorts, web/clips) and art masters stay out, so the first load stays small.
//
// PAID CONTENT NEVER SHIPS HERE. The demo pack gets data/demo_content.json (the demo factions and
// their rivalries, built below from data/hoa_content.json) instead of the full content file, and
// DEMO_BUILD in the shipped game.js is a compile-time true. Both are enforced: the pack fails if
// the marker cannot be rewritten, and — because the full content file is absent — deleting
// window.__HOA_DEMO__ in DevTools has nothing paid left to unlock.
//
// Flags: --no-zip  build dist/demo/ but skip the zip (fast; used by the packaging test).

import { cpSync, mkdirSync, rmSync, existsSync, statSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { MAPS } from '../web/src/engine/map.js';

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
if (existsSync(join(WEB, 'assets', 'weapons'))) copy(join(WEB, 'assets', 'weapons'), join(DEMO, 'assets', 'weapons'));
copy(join(ROOT, 'assets', 'art', 'cover_key_art.jpg'), join(DEMO, 'assets', 'art', 'cover_key_art.jpg'));
for (const f of ['weapons.json', 'demo.json', 'perks.json', 'achievements.json']) copy(join(ROOT, 'data', f), join(DEMO, 'data', f));
// challenges.json is filtered in step 2b (paid maps/factions stay out).
// hoa_content.json is deliberately NOT copied: the demo ships demo_content.json (step 2b).

// 2. Paths: the repo serves web/ next to data/ and assets/; in the zip everything sits at the root.
const gamePath = join(DEMO, 'src', 'engine', 'game.js');
const game = readFileSync(gamePath, 'utf8');
let gameFixed = game.replace(/'\.\.\/data\//g, "'data/");
if (gameFixed === game) throw new Error('package_demo: expected ../data/ paths in game.js');

// Build marker: isDemo becomes a constant in the shipped file, so deleting window.__HOA_DEMO__ in
// DevTools changes nothing. Fail loudly if the line moves, or a refactor would silently ship a
// demo whose only gate is a client-side flag.
const DEMO_MARKER = 'export const DEMO_BUILD = false;';
if (!gameFixed.includes(DEMO_MARKER)) throw new Error('package_demo: DEMO_BUILD marker missing from game.js');
gameFixed = gameFixed.replace(DEMO_MARKER, 'export const DEMO_BUILD = true; // rewritten by tools/package_demo.mjs');

// Content: the demo loads the whitelisted file built in step 2b, never the paid one. The full
// hoa_content.json is not in the zip at all, so unlocking the flag would find nothing paid.
const CONTENT_REF = "'data/hoa_content.json'";
if (!gameFixed.includes(CONTENT_REF)) throw new Error('package_demo: content path reference missing from game.js');
gameFixed = gameFixed.replace(CONTENT_REF, "'data/demo_content.json'");
writeFileSync(gamePath, gameFixed);
// Modules under web/src/engine import repo data as '../../../data/'; in the zip src/ sits at the root.
const srcFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? srcFiles(join(dir, e.name)) : /\.js$/.test(e.name) ? [join(dir, e.name)] : []));
for (const f of srcFiles(join(DEMO, 'src'))) {
  const body = readFileSync(f, 'utf8');
  if (body.includes("'../../../data/")) writeFileSync(f, body.replaceAll("'../../../data/", "'../../data/"));
}
const cssPath = join(DEMO, 'style.css');
writeFileSync(cssPath, readFileSync(cssPath, 'utf8').replace(/url\((["']?)\.\.\/assets\//g, 'url($1assets/'));

// 2b. Demo content whitelist: only the demo factions and the rivalries between them. Everything
// else in hoa_content.json (the other factions' stats, names and barks) stays out of the zip.
const demoFactions = JSON.parse(game.match(/DEMO_FACTIONS\s*=\s*(\[[^\]]*\])/)[1].replace(/'/g, '"'));
const fullContent = JSON.parse(readFileSync(join(ROOT, 'data', 'hoa_content.json'), 'utf8'));
// Challenges: only the ones the demo can play (free map, demo factions on both sides).
const allChallenges = JSON.parse(readFileSync(join(ROOT, 'data', 'challenges.json'), 'utf8'));
const demoChallenges = allChallenges.filter(c => MAPS[c.map]?.freeInDemo && demoFactions.includes(c.playerFaction) && (!c.enemyFaction || demoFactions.includes(c.enemyFaction)));
writeFileSync(join(DEMO, 'data', 'challenges.json'), JSON.stringify(demoChallenges, null, 2) + '\n');
const demoContent = { ...fullContent, __demo: true, factions: {}, rivalry: [] };
for (const id of demoFactions) {
  const faction = fullContent.factions[id];
  if (!faction) throw new Error(`package_demo: DEMO_FACTIONS lists ${id}, which is not in hoa_content.json`);
  // `brief` is design documentation (angle/joke mines/rivalsFirst, with paid faction ids in it)
  // and nothing at runtime reads it, so the demo pack drops it.
  const { brief, ...runtimeFaction } = faction;
  demoContent.factions[id] = runtimeFaction;
}
// Rivalry quips are keyed { killer, victim }: keep only the pairs where BOTH sides are in the demo,
// the same rule the voice manifest uses. Anything else would name a faction the pack does not ship.
demoContent.rivalry = (fullContent.rivalry || []).filter(
  r => demoFactions.includes(r?.killer) && demoFactions.includes(r?.victim)
);
mkdirSync(join(DEMO, 'data'), { recursive: true });
writeFileSync(join(DEMO, 'data', 'demo_content.json'), JSON.stringify(demoContent, null, 2));
console.log(`  → content: ${Object.keys(demoContent.factions).length} demo factions, ${demoContent.rivalry.length} rivalries (paid factions excluded)`);

// 3. Demo flag
const htmlPath = join(DEMO, 'index.html');
writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('<head>', '<head>\n<script>window.__HOA_DEMO__ = true;</script>'));

// 4. Voice lines: demo factions only (rivalries only when both sides are in the demo)
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
    // any relative path that resolves outside the zip root (a module import or a ../data fetch)
    for (const [, rel] of readFileSync(p, 'utf8').matchAll(/['"(]((?:\.\.\/)+(?:data|assets)\/[^'")]+)/g)) {
      // '../data/' is relative to the page for fetch/CSS, so it always escapes; deeper module imports are checked by resolving
      if (/^\.\.\/(data|assets)\//.test(rel) || !resolve(dirname(p), rel).startsWith(DEMO + '/')) offenders.push(`${p.slice(DEMO.length + 1)} -> ${rel}`);
    }
  }
};
scan(DEMO);
if (offenders.length) throw new Error('package_demo: paths escape the zip root in ' + offenders.join(', '));

// 5b. Leak check: no paid faction id may appear in any shipped data file.
const paidIds = Object.keys(fullContent.factions).filter(id => !demoFactions.includes(id));
for (const f of readdirSync(join(DEMO, 'data'))) {
  const body = readFileSync(join(DEMO, 'data', f), 'utf8');
  const leaked = paidIds.filter(id => body.includes(`"${id}"`));
  if (leaked.length) throw new Error(`package_demo: paid faction ids in data/${f}: ${leaked.join(', ')}`);
}
if (existsSync(join(DEMO, 'data', 'hoa_content.json'))) throw new Error('package_demo: the full content file must not ship in the demo');

// 6. Zip
const noZip = process.argv.includes('--no-zip') || process.env.HOA_PACK_NO_ZIP === '1';
if (noZip) {
  console.log('\n✅ dist/demo/ built (zip skipped: --no-zip)');
  process.exit(0);
}
execSync(`cd "${DEMO}" && zip -r -q "${ZIP_PATH}" .`, { stdio: 'inherit' });
const size = statSync(ZIP_PATH).size;
console.log(`\n✅ dist/hoa-warfare-web-demo.zip (${mb(size)} MB)`);
if (size > MAX_ZIP_MB * 1048576) { console.error(`❌ zip is over ${MAX_ZIP_MB} MB`); process.exit(1); }
console.log('🚀 Upload: itch.io (HTML5, "played in the browser"), CrazyGames (Game Files), Newgrounds (HTML5 zip).');
console.log('   Check it first: node tools/serve.mjs, then open http://localhost:8642/dist/demo/');
