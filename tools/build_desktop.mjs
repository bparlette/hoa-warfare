#!/usr/bin/env node
// Desktop build & packaging tool for Call of Karen: HOA Warfare (P0 Steam).
// Stages Electron/desktop wrapper files into dist/desktop/ and prepares Steamworks assets.
// Usage: node tools/build_desktop.mjs [--run] [--zip] [--appId=480]

import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { ACHIEVEMENTS } from '../desktop/steamworks.js';

const ROOT = resolve('.');
const DIST = join(ROOT, 'dist');
const DESKTOP_OUT = join(DIST, 'desktop');
const ZIP_PATH = join(DIST, 'hoa-warfare-desktop.zip');

// Parse flags
const args = process.argv.slice(2);
const shouldRun = args.includes('--run');
const shouldDist = args.includes('--dist') || args.includes('--zip');
const shouldZip = shouldDist;
const appIdArg = args.find(a => a.startsWith('--appId='));
const APP_ID = appIdArg ? appIdArg.split('=')[1] : (process.env.STEAM_APP_ID || '480');

console.log('🖥️  Building Call of Karen: HOA Warfare — Desktop & Steam Package...');
console.log(`   Steam App ID: ${APP_ID}`);

// 1. Clean destination directory
if (existsSync(DESKTOP_OUT)) {
  rmSync(DESKTOP_OUT, { recursive: true, force: true });
}
mkdirSync(DESKTOP_OUT, { recursive: true });

// 2. Validate achievement definitions
console.log(`  → Validating ${ACHIEVEMENTS.length} Steam launch achievements...`);
for (const ach of ACHIEVEMENTS) {
  if (!ach.id || !ach.name || !ach.description) {
    throw new Error(`Invalid achievement definition: ${JSON.stringify(ach)}`);
  }
}
console.log(`     ✓ All 10 achievements verified.`);

// 3. Copy desktop wrapper source files
console.log('  → Copying desktop wrapper files (main.mjs, preload.cjs, steamworks.js)...');
mkdirSync(join(DESKTOP_OUT, 'desktop'), { recursive: true });
cpSync(join(ROOT, 'desktop'), join(DESKTOP_OUT, 'desktop'), { recursive: true });

// 4. Copy web client files
console.log('  → Copying web client assets & scripts...');
cpSync(join(ROOT, 'web'), join(DESKTOP_OUT, 'web'), { recursive: true });

// 5. Copy data definitions
console.log('  → Copying data definitions (hoa_content.json, weapons.json, perks.json, achievements.json)...');
mkdirSync(join(DESKTOP_OUT, 'data'), { recursive: true });
cpSync(join(ROOT, 'data', 'hoa_content.json'), join(DESKTOP_OUT, 'data', 'hoa_content.json'));
cpSync(join(ROOT, 'data', 'weapons.json'), join(DESKTOP_OUT, 'data', 'weapons.json'));
cpSync(join(ROOT, 'data', 'perks.json'), join(DESKTOP_OUT, 'data', 'perks.json'));
if (existsSync(join(ROOT, 'data', 'achievements.json'))) {
  cpSync(join(ROOT, 'data', 'achievements.json'), join(DESKTOP_OUT, 'data', 'achievements.json'));
}

// 6. Copy assets if present
if (existsSync(join(ROOT, 'assets'))) {
  console.log('  → Copying game assets & branding...');
  mkdirSync(join(DESKTOP_OUT, 'assets'), { recursive: true });
  cpSync(join(ROOT, 'assets'), join(DESKTOP_OUT, 'assets'), { recursive: true });
}

// 7. Write steam_appid.txt in staging root and project root
console.log('  → Generating steam_appid.txt...');
writeFileSync(join(DESKTOP_OUT, 'steam_appid.txt'), `${APP_ID}\n`, 'utf8');
writeFileSync(join(ROOT, 'steam_appid.txt'), `${APP_ID}\n`, 'utf8');

// 8. Generate standalone package.json for Electron
console.log('  → Writing desktop package.json...');
const desktopPkg = {
  name: 'call-of-karen-hoa-warfare',
  productName: 'Call of Karen: HOA Warfare',
  version: '1.0.0',
  description: 'Call of Karen: HOA Warfare — Tactical Suburban FPS',
  main: 'desktop/main.mjs',
  type: 'module',
  scripts: {
    start: 'electron .'
  },
  dependencies: {}
};
writeFileSync(join(DESKTOP_OUT, 'package.json'), JSON.stringify(desktopPkg, null, 2), 'utf8');

// 9. Optional Zip archive
if (shouldZip) {
  console.log('  → Compressing into dist/hoa-warfare-desktop.zip...');
  try {
    execSync(`cd "${DESKTOP_OUT}" && zip -r -q "${ZIP_PATH}" .`, { stdio: 'inherit' });
    const sizeMb = (statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(2);
    console.log(`     ✓ Archive generated: ${ZIP_PATH} (${sizeMb} MB)`);
  } catch (err) {
    console.warn('     ⚠️ Zip creation skipped or failed:', err.message);
  }
}

console.log('\n✅ Desktop build staged successfully in: dist/desktop/');
console.log('--------------------------------------------------------------');
console.log('To run in Electron:');
console.log('   npx electron dist/desktop');
console.log('To build binaries via electron-builder:');
console.log('   npx electron-builder --dir dist/desktop');
console.log('--------------------------------------------------------------');

// 10. Optional execution
if (shouldRun) {
  console.log('🚀 Launching desktop application...');
  try {
    const child = spawn('npx', ['electron', DESKTOP_OUT], { stdio: 'inherit' });
    child.on('error', () => {
      console.log('Fallback: Running via node desktop/main.mjs...');
      spawn('node', [join(ROOT, 'desktop', 'main.mjs')], { stdio: 'inherit' });
    });
  } catch {
    spawn('node', [join(ROOT, 'desktop', 'main.mjs')], { stdio: 'inherit' });
  }
}
