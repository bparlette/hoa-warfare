#!/usr/bin/env node
/**
 * tools/build_steam_capsules.mjs
 *
 * Generates all official Steam Direct store capsules, hero banners,
 * library logos, and community icons from source game art.
 *
 * Required Steam Direct Assets:
 * - Header Capsule: 460 x 215 (Store search, category pages)
 * - Small Capsule: 231 x 87 (Search dropdown, top sellers)
 * - Main Capsule: 616 x 353 (Store front page feature carousel)
 * - Library Hero: 1920 x 620 (Steam desktop client game page banner)
 * - Library Logo: 1280 x 720 (Overlay title logo in client library)
 * - Community Icon: 32 x 32 (Taskbar, steam chat, desktop shortcut)
 * - Client Icon: 256 x 256 (High-res icon)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'steam');

fs.mkdirSync(OUT_DIR, { recursive: true });

const SOURCES = {
  logoOfficial: path.join(ROOT, 'docs', 'launch', 'logo-official.jpg'),
  coverKeyArt: path.join(ROOT, 'web', 'assets', 'cover_key_art.jpg'),
  logoTransparent: path.join(ROOT, 'web', 'assets', 'logo_transparent.png'),
  badge: path.join(ROOT, 'web', 'assets', 'badge.png'),
};

const CAPSULES = [
  {
    name: 'header_capsule.jpg',
    width: 460,
    height: 215,
    source: SOURCES.logoOfficial,
    desc: 'Steam Header Capsule (Store category/search view)',
  },
  {
    name: 'small_capsule.jpg',
    width: 231,
    height: 87,
    source: SOURCES.logoOfficial,
    desc: 'Steam Small Capsule (Dropdown & top seller lists)',
  },
  {
    name: 'main_capsule.jpg',
    width: 616,
    height: 353,
    source: SOURCES.logoOfficial,
    desc: 'Steam Main Capsule (Featured carousel)',
  },
  {
    name: 'library_hero.jpg',
    width: 1920,
    height: 620,
    source: SOURCES.coverKeyArt,
    desc: 'Steam Library Hero Banner (Client game view)',
  },
  {
    name: 'library_logo.png',
    width: 1280,
    height: 720,
    source: SOURCES.logoTransparent,
    desc: 'Steam Library Logo (Transparent title overlay)',
  },
  {
    name: 'community_icon.png',
    width: 32,
    height: 32,
    source: SOURCES.badge,
    desc: 'Steam Community Icon (Taskbar & chat icon)',
  },
  {
    name: 'client_icon.png',
    width: 256,
    height: 256,
    source: SOURCES.badge,
    desc: 'Steam Client High-Res Icon',
  },
];

console.log('🎮 Building Steam Direct Store Assets in assets/steam/...\n');

let built = 0;
for (const cap of CAPSULES) {
  const dest = path.join(OUT_DIR, cap.name);
  if (!fs.existsSync(cap.source)) {
    console.warn(`⚠️ Source not found for ${cap.name}: ${cap.source}`);
    continue;
  }

  try {
    // Use macOS built-in sips tool
    execFileSync('sips', [
      '-z', String(cap.height), String(cap.width),
      cap.source,
      '--out', dest,
    ], { stdio: 'pipe' });

    const stats = fs.statSync(dest);
    console.log(`✓ [${cap.width}x${cap.height}] ${cap.name} (${Math.round(stats.size / 1024)} KB) - ${cap.desc}`);
    built++;
  } catch (err) {
    console.error(`❌ Failed to generate ${cap.name}:`, err.message);
  }
}

console.log(`\n🎉 Successfully generated ${built}/${CAPSULES.length} Steam Direct store capsules!`);
