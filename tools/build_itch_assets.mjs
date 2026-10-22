#!/usr/bin/env node
/**
 * tools/build_itch_assets.mjs
 *
 * Generates a complete, professional, high-impact asset suite for itch.io:
 * https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare
 *
 * Output:
 * - assets/itch/cover_630x500.jpg (Standard itch.io game card thumbnail)
 * - assets/itch/cover_1260x1000.jpg (Retina @2x game card thumbnail)
 * - assets/itch/banner_960x400.jpg (Page header banner)
 * - assets/itch/banner_1920x800.jpg (High-res page header banner)
 * - assets/itch/01_culdesac_tactical_clash.png (1920x1080 in-game action)
 * - assets/itch/02_model_home_showcase.png (1920x1080 Showcase map)
 * - assets/itch/03_pickleball_club_standoff.png (1920x1080 Pickleball courts)
 * - assets/itch/04_sunset_stripmall_heist.png (1920x1080 Strip Mall)
 * - assets/itch/05_riding_mower_mayhem.png (1920x1080 Riding Mower)
 * - assets/itch/06_doorbell_cam_surveillance.png (1920x1080 Ring CCTV Night Vision)
 * - assets/itch/07_suburban_shame_citation.png (1920x1080 Stockades & Fines)
 * - assets/itch/08_faction_roster_lineup.png (1920x1080 16-Faction Lineup)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'itch');

fs.mkdirSync(OUT_DIR, { recursive: true });

const SOURCES = {
  logoOfficial: path.join(ROOT, 'docs', 'launch', 'logo-official.jpg'),
  coverKeyArt: path.join(ROOT, 'web', 'assets', 'cover_key_art.jpg'),
  logoTransparent: path.join(ROOT, 'web', 'assets', 'logo_transparent.png'),
  badge: path.join(ROOT, 'web', 'assets', 'badge.png'),
};

console.log('🎨 Generating Itch.io Professional Cover & Banner Assets...\n');

// 1. Cover 1260x1000 and 630x500
try {
  const cover1260 = path.join(OUT_DIR, 'cover_1260x1000.jpg');
  const cover630 = path.join(OUT_DIR, 'cover_630x500.jpg');

  // Crop & scale key art to 1260x1000 using ffmpeg
  spawnSync('ffmpeg', [
    '-y',
    '-i', SOURCES.coverKeyArt,
    '-vf', 'scale=1792:1000:force_original_aspect_ratio=increase,crop=1260:1000',
    '-q:v', '2',
    cover1260,
  ], { stdio: 'pipe' });

  spawnSync('ffmpeg', [
    '-y',
    '-i', cover1260,
    '-vf', 'scale=630:500',
    '-q:v', '2',
    cover630,
  ], { stdio: 'pipe' });

  console.log(`✓ Generated cover_1260x1000.jpg (${Math.round(fs.statSync(cover1260).size / 1024)} KB)`);
  console.log(`✓ Generated cover_630x500.jpg (${Math.round(fs.statSync(cover630).size / 1024)} KB)`);
} catch (e) {
  console.warn('Cover generation failed:', e.message);
}

// 2. Banner 1920x800 and 960x400
try {
  const banner1920 = path.join(OUT_DIR, 'banner_1920x800.jpg');
  const banner960 = path.join(OUT_DIR, 'banner_960x400.jpg');

  spawnSync('ffmpeg', [
    '-y',
    '-i', SOURCES.coverKeyArt,
    '-vf', 'scale=1920:1072:force_original_aspect_ratio=increase,crop=1920:800',
    '-q:v', '2',
    banner1920,
  ], { stdio: 'pipe' });

  spawnSync('ffmpeg', [
    '-y',
    '-i', banner1920,
    '-vf', 'scale=960:400',
    '-q:v', '2',
    banner960,
  ], { stdio: 'pipe' });

  console.log(`✓ Generated banner_1920x800.jpg (${Math.round(fs.statSync(banner1920).size / 1024)} KB)`);
  console.log(`✓ Generated banner_960x400.jpg (${Math.round(fs.statSync(banner960).size / 1024)} KB)`);
} catch (e) {
  console.warn('Banner generation failed:', e.message);
}

// 3. High-Res 1920x1080 Action Screenshot Gallery
const SHOTS = [
  {
    name: '01_culdesac_tactical_clash.png',
    query: 'spectate=1&seed=7&map=culdesac',
    secs: '5',
    desc: 'Oakridge Cul-de-Sac tactical firefight and manicured lawns',
  },
  {
    name: '02_model_home_showcase.png',
    query: 'spectate=1&seed=12&map=showcase',
    secs: '5',
    desc: 'Model Home Showcase two-story suburban crossfire',
  },
  {
    name: '03_pickleball_club_standoff.png',
    query: 'spectate=1&seed=4&map=pickleball',
    secs: '5',
    desc: 'Shady Pines Pickleball Club doubles battle with regulation nets',
  },
  {
    name: '04_sunset_stripmall_heist.png',
    query: 'spectate=1&seed=9&map=stripmall',
    secs: '5',
    desc: 'Sunset Strip Mall parking lot combat and shopping carts',
  },
  {
    name: '05_riding_mower_mayhem.png',
    query: 'spectate=1&seed=3&map=culdesac',
    secs: '6',
    desc: 'Driveable John Deere-style riding mower harvesting lawns',
  },
  {
    name: '06_doorbell_cam_surveillance.png',
    query: 'spectate=1&seed=5&map=culdesac&style=cctv',
    secs: '5',
    desc: 'Ring Doorbell 1080p night-vision surveillance camera overlay',
  },
  {
    name: '07_suburban_shame_citation.png',
    query: 'spectate=1&seed=1&map=culdesac',
    secs: '4',
    evalJs: `if (window.__game) { window.__game.showEnd(); }`,
    desc: 'Suburban Stockades Shame Pillory and official HOA Citation fines',
  },
  {
    name: '08_faction_roster_lineup.png',
    query: 'lineup=1',
    secs: '3',
    desc: 'Full 16-faction character roster showcase lineup',
  },
];

console.log('\n📸 Capturing 1920x1080 Action Screenshots via headless Chrome...\n');

for (const s of SHOTS) {
  const dest = path.join(OUT_DIR, s.name);
  console.log(`→ Shooting: ${s.name} (${s.desc})...`);
  const args = ['tools/shot.mjs', s.query, dest, s.secs];
  if (s.evalJs) args.push(s.evalJs);

  const res = spawnSync('node', args, {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, SHOT_W: '1920', SHOT_H: '1080' },
  });

  if (fs.existsSync(dest)) {
    const size = Math.round(fs.statSync(dest).size / 1024);
    console.log(`  ✓ Saved ${s.name} (1920x1080 · ${size} KB)`);
  } else {
    console.error(`  ❌ Failed to capture ${s.name}: ${res.stderr?.toString() || res.stdout?.toString()}`);
  }
}

console.log('\n🎉 Finished generating all itch.io store assets in assets/itch/!');
