#!/usr/bin/env node
// Packaging tool for itch.io and CrazyGames web demo.
// Bundles the standalone web slice into dist/demo/ and creates dist/hoa-warfare-web-demo.zip.
// Usage: node tools/package_demo.mjs

import { cpSync, mkdirSync, rmSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve('.');
const DIST = join(ROOT, 'dist');
const DEMO = join(DIST, 'demo');
const ZIP_PATH = join(DIST, 'hoa-warfare-web-demo.zip');

console.log('📦 Packaging Call of Karen: HOA Warfare Web Demo...');

// 1. Clean output directories
if (existsSync(DEMO)) rmSync(DEMO, { recursive: true, force: true });
if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH, { force: true });
mkdirSync(DEMO, { recursive: true });

// 2. Copy web files (index.html, style.css, src/, vo/, assets/)
console.log('  → Copying web client files...');
cpSync(join(ROOT, 'web'), DEMO, { recursive: true });

// 2b. Inject demo gating flag into dist/demo/index.html
console.log('  → Injecting demo gating flag into dist/demo/index.html...');
const demoIndexHtml = join(DEMO, 'index.html');
let html = readFileSync(demoIndexHtml, 'utf8');
html = html.replace('<head>', '<head>\n<script>window.__HOA_DEMO__ = true;</script>');
writeFileSync(demoIndexHtml, html, 'utf8');

// 3. Ensure data/ (hoa_content.json and weapons.json) is copied to demo root
console.log('  → Copying data/ content & weapons definitions...');
mkdirSync(join(DEMO, 'data'), { recursive: true });
cpSync(join(ROOT, 'data', 'hoa_content.json'), join(DEMO, 'data', 'hoa_content.json'));
cpSync(join(ROOT, 'data', 'weapons.json'), join(DEMO, 'data', 'weapons.json'));

// 4. Ensure assets are present
if (existsSync(join(ROOT, 'assets'))) {
  console.log('  → Copying assets/ art & branding...');
  mkdirSync(join(DEMO, 'assets'), { recursive: true });
  cpSync(join(ROOT, 'assets'), join(DEMO, 'assets'), { recursive: true });
}

// 5. Build zip package using native zip command
console.log('  → Compressing into standalone zip...');
try {
  execSync(`cd "${DEMO}" && zip -r -q "${ZIP_PATH}" .`, { stdio: 'inherit' });
  const sizeMb = (statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ Successfully generated: dist/hoa-warfare-web-demo.zip (${sizeMb} MB)`);
  console.log('🚀 Ready to upload to:');
  console.log('   - itch.io: Upload as HTML5 project (check "This file will be played in the browser")');
  console.log('   - CrazyGames Developer: Upload zip under Game Files');
} catch (err) {
  console.error('Failed to create zip:', err);
  process.exit(1);
}
