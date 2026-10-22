#!/usr/bin/env node
/**
 * tools/build_steam_capsules_v2.mjs
 *
 * Generates official Steam Direct store capsules, hero banners, and library logos:
 * 1. Primary Set: "Call of Karen: HOA Warfare" with a distinctive, Non-CoD suburban tactical visual identity
 * 2. Backup Title Set: "HOA Warfare: Cul-de-Sac Clash" (ready for immediate use if trademark advice warrants a title change)
 *
 * Steam Specifications:
 * - Header Capsule: 460 x 215 JPG
 * - Small Capsule: 231 x 87 JPG
 * - Main Capsule: 616 x 353 JPG
 * - Library Hero: 1920 x 620 JPG (clean cinematic background without baked text)
 * - Library Logo: 1280 x 720 PNG (transparent title logo for Steam client overlay)
 * - Client Icon: 256 x 256 PNG
 * - Community Icon: 32 x 32 PNG
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PRIMARY_DIR = path.join(ROOT, 'assets', 'steam');
const BACKUP_DIR = path.join(PRIMARY_DIR, 'backup_title');

fs.mkdirSync(PRIMARY_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const KEY_ART = path.join(ROOT, 'web', 'assets', 'cover_key_art.jpg');
const BADGE_PNG = path.join(ROOT, 'web', 'assets', 'badge.png');

/**
 * Render an SVG string to a PNG file using macOS sips.
 */
function renderSvgToPng(svgContent, outPngPath) {
  const tmpSvg = outPngPath.replace(/\.png$/, '.tmp.svg');
  fs.writeFileSync(tmpSvg, svgContent, 'utf8');
  try {
    execFileSync('sips', ['-s', 'format', 'png', tmpSvg, '--out', outPngPath], {
      stdio: 'pipe',
    });
  } finally {
    try {
      fs.unlinkSync(tmpSvg);
    } catch {}
  }
}

// =============================================================================
// LOGO 1: CALL OF KAREN: HOA WARFARE (Non-CoD Suburban Tactical Identity)
// =============================================================================
// Distinctive features:
// - Golden Suburban HOA Shield with McMansion gables and grass ruler
// - 3D beveled gold arcade block typography (NOT military stencil)
// - Slanted red "VIOLATION CITED" rubber stamp banner
// - Cyan tactical accent glow and 6v6 suburban tagline
function generateCallOfKarenLogoSvg(width = 1280, height = 720) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="${width}" height="${height}">
  <defs>
    <!-- Gradients -->
    <linearGradient id="goldFace" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="25%" stop-color="#fef08a"/>
      <stop offset="60%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>
    <linearGradient id="goldBevel" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#a16207"/>
      <stop offset="100%" stop-color="#451a03"/>
    </linearGradient>
    <linearGradient id="whiteFace" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
    <linearGradient id="navyShield" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="redStamp" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#b91c1c"/>
    </linearGradient>
    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.95"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
  </defs>

  <!-- Group with Drop Shadow -->
  <g filter="url(#dropShadow)" transform="translate(40, 20)">

    <!-- Left HOA Shield Crest -->
    <g transform="translate(100, 110)">
      <!-- Outer Golden Shield -->
      <path d="M 120 10 L 230 50 V 180 C 230 250, 120 310, 120 310 C 120 310, 10 250, 10 180 V 50 Z"
            fill="url(#navyShield)" stroke="url(#goldFace)" stroke-width="10"/>
      <path d="M 120 28 L 214 62 V 176 C 214 234, 120 288, 120 288 C 120 288, 26 234, 26 176 V 62 Z"
            fill="none" stroke="#fef08a" stroke-width="3" opacity="0.6"/>

      <!-- McMansion Gables -->
      <polygon points="120,70 180,120 166,120 120,84 74,120 60,120" fill="url(#goldFace)"/>
      <polygon points="120,100 156,130 146,130 120,108 94,130 84,130" fill="url(#goldFace)"/>

      <!-- Crossed Grass Ruler & Citation Pen -->
      <g transform="rotate(45, 120, 185)">
        <rect x="112" y="125" width="16" height="120" fill="#facc15" stroke="#000" stroke-width="2"/>
        <line x1="112" y1="145" x2="120" y2="145" stroke="#000" stroke-width="2"/>
        <line x1="112" y1="165" x2="124" y2="165" stroke="#000" stroke-width="2"/>
        <line x1="112" y1="185" x2="120" y2="185" stroke="#000" stroke-width="2"/>
        <line x1="112" y1="205" x2="124" y2="205" stroke="#000" stroke-width="2"/>
        <line x1="112" y1="225" x2="120" y2="225" stroke="#000" stroke-width="2"/>
      </g>
      <g transform="rotate(-45, 120, 185)">
        <rect x="114" y="125" width="12" height="120" rx="3" fill="#e2e8f0" stroke="#000" stroke-width="2"/>
        <circle cx="120" cy="138" r="9" fill="url(#goldFace)" stroke="#000" stroke-width="1.5"/>
      </g>

      <!-- Laurel Stars -->
      <circle cx="120" cy="50" r="7" fill="url(#goldFace)"/>
      <circle cx="85" cy="58" r="5" fill="url(#goldFace)"/>
      <circle cx="155" cy="58" r="5" fill="url(#goldFace)"/>
    </g>

    <!-- Right Typography Block -->
    <g transform="translate(390, 120)">
      <!-- Top Eyebrow Banner -->
      <rect x="4" y="24" width="480" height="32" rx="6" fill="#0f172a" stroke="#ca8a04" stroke-width="2"/>
      <text x="244" y="46" font-family="-apple-system, 'SF Pro Display', sans-serif" font-size="16" font-weight="900" fill="#fef08a" text-anchor="middle" letter-spacing="4">★ THE ESTATES AT SHADY PINES ★</text>

      <!-- Main Title: CALL OF KAREN (3D Beveled Gold) -->
      <!-- Bevel Shadow Layers -->
      <text x="4" y="174" font-family="Impact, 'Arial Black', sans-serif" font-size="124" font-weight="900" fill="#000000" letter-spacing="4">CALL OF KAREN</text>
      <text x="2" y="170" font-family="Impact, 'Arial Black', sans-serif" font-size="124" font-weight="900" fill="url(#goldBevel)" stroke="#000000" stroke-width="12" letter-spacing="4">CALL OF KAREN</text>
      <text x="0" y="164" font-family="Impact, 'Arial Black', sans-serif" font-size="124" font-weight="900" fill="url(#goldFace)" stroke="#1e293b" stroke-width="4" letter-spacing="4">CALL OF KAREN</text>

      <!-- Subtitle: HOA WARFARE -->
      <g transform="translate(6, 210)">
        <rect x="-10" y="0" width="700" height="84" rx="10" fill="#0f172a" stroke="#facc15" stroke-width="4"/>
        <text x="340" y="62" font-family="Impact, 'Arial Black', sans-serif" font-size="72" font-weight="900" fill="url(#whiteFace)" stroke="#0f172a" stroke-width="3" text-anchor="middle" letter-spacing="10">HOA WARFARE</text>
      </g>

      <!-- Bottom Tagline & Violation Stamp -->
      <g transform="translate(6, 314)">
        <rect x="0" y="0" width="450" height="36" rx="4" fill="#1e293b" stroke="#334155" stroke-width="2"/>
        <text x="225" y="24" font-family="monospace" font-size="15" font-weight="900" fill="#38bdf8" text-anchor="middle" letter-spacing="4">6v6 TACTICAL SUBURBAN FPS</text>
      </g>

      <!-- Slanted Red Stamp -->
      <g transform="translate(460, 275) rotate(-9)">
        <rect x="0" y="0" width="240" height="54" rx="6" fill="url(#redStamp)" stroke="#fecaca" stroke-width="3" stroke-dasharray="14 5"/>
        <text x="120" y="38" font-family="Impact, 'Arial Black', sans-serif" font-size="32" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4">VIOLATION CITED</text>
      </g>
    </g>

  </g>
</svg>
`;
}

// =============================================================================
// LOGO 2: HOA WARFARE: CUL-DE-SAC CLASH (Backup Title)
// =============================================================================
// Designed specifically as the trademark-bulletproof alternative:
// - Removes "Call of" completely
// - Centers "HOA WARFARE" in massive golden block lettering
// - Subtitle "CUL-DE-SAC CLASH" in a high-voltage suburban hazard banner
// - Preserves 100% of the game's identity and humor
function generateBackupTitleLogoSvg(width = 1280, height = 720) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="${width}" height="${height}">
  <defs>
    <!-- Gradients -->
    <linearGradient id="bGoldFace" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fffbeb"/>
      <stop offset="30%" stop-color="#fde047"/>
      <stop offset="70%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#a16207"/>
    </linearGradient>
    <linearGradient id="bGoldBevel" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#854d0e"/>
      <stop offset="100%" stop-color="#3b1d03"/>
    </linearGradient>
    <linearGradient id="bCyanBanner" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="50%" stop-color="#0369a1"/>
      <stop offset="100%" stop-color="#075985"/>
    </linearGradient>
    <linearGradient id="bRedRibbon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#991b1b"/>
    </linearGradient>
    <filter id="bDropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.95"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
  </defs>

  <!-- Centered / Anchored Group with Drop Shadow -->
  <g filter="url(#bDropShadow)" transform="translate(60, 30)">

    <!-- Left HOA Shield Crest -->
    <g transform="translate(80, 100)">
      <path d="M 120 10 L 230 50 V 180 C 230 250, 120 310, 120 310 C 120 310, 10 250, 10 180 V 50 Z"
            fill="#0b1329" stroke="url(#bGoldFace)" stroke-width="10"/>
      <path d="M 120 28 L 214 62 V 176 C 214 234, 120 288, 120 288 C 120 288, 26 234, 26 176 V 62 Z"
            fill="none" stroke="#fde047" stroke-width="3" opacity="0.6"/>

      <!-- Suburban Crosshair Reticle -->
      <circle cx="120" cy="160" r="64" fill="none" stroke="#00e5ff" stroke-width="4" stroke-dasharray="14 10"/>
      <line x1="120" y1="84" x2="120" y2="236" stroke="#00e5ff" stroke-width="3"/>
      <line x1="44" y1="160" x2="196" y2="160" stroke="#00e5ff" stroke-width="3"/>

      <!-- Golden Lawn Mower Silhouette Center -->
      <rect x="88" y="146" width="64" height="28" rx="6" fill="url(#bGoldFace)"/>
      <circle cx="96" cy="174" r="14" fill="#0f172a" stroke="url(#bGoldFace)" stroke-width="4"/>
      <circle cx="144" cy="174" r="14" fill="#0f172a" stroke="url(#bGoldFace)" stroke-width="4"/>
      <line x1="140" y1="146" x2="164" y2="120" stroke="url(#bGoldFace)" stroke-width="6" stroke-linecap="round"/>
      <line x1="156" y1="120" x2="172" y2="120" stroke="url(#bGoldFace)" stroke-width="6" stroke-linecap="round"/>

      <!-- Stars -->
      <polygon points="120,44 125,58 139,58 128,67 132,81 120,72 108,81 112,67 101,58 115,58" fill="url(#bGoldFace)"/>
    </g>

    <!-- Right Typography Block -->
    <g transform="translate(370, 110)">
      <!-- Top Badge -->
      <rect x="4" y="24" width="460" height="32" rx="6" fill="#0f172a" stroke="#00e5ff" stroke-width="2"/>
      <text x="234" y="46" font-family="-apple-system, sans-serif" font-size="16" font-weight="900" fill="#38bdf8" text-anchor="middle" letter-spacing="4">★ SUBURBAN TACTICAL COMBAT ★</text>

      <!-- Main Title: HOA WARFARE (Massive 3D Beveled Gold) -->
      <text x="4" y="174" font-family="Impact, 'Arial Black', sans-serif" font-size="134" font-weight="900" fill="#000000" letter-spacing="4">HOA WARFARE</text>
      <text x="2" y="170" font-family="Impact, 'Arial Black', sans-serif" font-size="134" font-weight="900" fill="url(#bGoldBevel)" stroke="#000000" stroke-width="12" letter-spacing="4">HOA WARFARE</text>
      <text x="0" y="164" font-family="Impact, 'Arial Black', sans-serif" font-size="134" font-weight="900" fill="url(#bGoldFace)" stroke="#0f172a" stroke-width="4" letter-spacing="4">HOA WARFARE</text>

      <!-- Subtitle: CUL-DE-SAC CLASH -->
      <g transform="translate(6, 210)">
        <rect x="-10" y="0" width="720" height="84" rx="10" fill="#0f172a" stroke="#ef4444" stroke-width="4"/>
        <text x="350" y="62" font-family="Impact, 'Arial Black', sans-serif" font-size="70" font-weight="900" fill="#ffffff" stroke="#991b1b" stroke-width="3" text-anchor="middle" letter-spacing="8">CUL-DE-SAC CLASH</text>
      </g>

      <!-- Bottom Tagline & Bylaw Stamp -->
      <g transform="translate(6, 314)">
        <rect x="0" y="0" width="450" height="36" rx="4" fill="#0f172a" stroke="#334155" stroke-width="2"/>
        <text x="225" y="24" font-family="monospace" font-size="15" font-weight="900" fill="#fde047" text-anchor="middle" letter-spacing="4">BYLAW ENFORCEMENT SHOOTER</text>
      </g>

      <!-- Red Stamp -->
      <g transform="translate(470, 275) rotate(-8)">
        <rect x="0" y="0" width="240" height="54" rx="6" fill="url(#bRedRibbon)" stroke="#fecaca" stroke-width="3" stroke-dasharray="14 5"/>
        <text x="120" y="38" font-family="Impact, 'Arial Black', sans-serif" font-size="30" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">UNLICENSED MOWING</text>
      </g>
    </g>

  </g>
</svg>
`;
}

// =============================================================================
// COMPOSITING ENGINE: FFMPEG PIPELINE
// =============================================================================

/**
 * Builds a complete Steam Capsule image by compositing the background key art
 * with the generated logo and target dimensions.
 */
function buildCapsule({ bgPath, logoPath, outPath, width, height, logoScale = 0.85, logoYOffset = 0.5 }) {
  // Use ffmpeg filter graph to crop/scale background, add dark vignette/gradient, and overlay the logo
  const filter = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},eq=contrast=1.06:brightness=-0.04:saturation=1.12[bg]`,
    `[1:v]scale=w=${Math.round(width * logoScale)}:h=-1[logo]`,
    `[bg][logo]overlay=(W-w)/2:(H-h)*${logoYOffset}[out]`
  ].join(';');

  const res = spawnSync('ffmpeg', [
    '-y',
    '-i', bgPath,
    '-i', logoPath,
    '-filter_complex', filter,
    '-map', '[out]',
    '-q:v', '2',
    outPath
  ], { stdio: 'pipe' });

  if (res.status !== 0) {
    throw new Error(`ffmpeg failed to build ${path.basename(outPath)}: ${res.stderr.toString()}`);
  }

  // Ensure exact pixel dimensions (including odd heights/widths like 215, 353, 87, 231) via sips
  spawnSync('sips', ['-z', String(height), String(width), outPath], { stdio: 'pipe' });
}

/**
 * Builds a clean widescreen Library Hero image (1920x620) WITHOUT baked text,
 * exactly as required by Steamworks guidelines (the Steam client overlays the Library Logo dynamically).
 */
function buildLibraryHero(bgPath, outPath) {
  const filter = `scale=1920:620:force_original_aspect_ratio=increase,crop=1920:620,eq=contrast=1.08:brightness=-0.02:saturation=1.15`;
  const res = spawnSync('ffmpeg', [
    '-y',
    '-i', bgPath,
    '-vf', filter,
    '-q:v', '2',
    outPath
  ], { stdio: 'pipe' });

  if (res.status !== 0) {
    throw new Error(`ffmpeg failed to build Library Hero: ${res.stderr.toString()}`);
  }
}

// =============================================================================
// EXECUTION PIPELINE
// =============================================================================

console.log('🚀 Generating Steam Capsule Art Suite (Non-CoD & Backup Title)...\n');

const TMP_DIR = path.join(ROOT, 'dist', 'capsule_tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

// 1. Render Transparent Title Logos
const primaryLogoPng = path.join(TMP_DIR, 'logo_call_of_karen.png');
const backupLogoPng = path.join(TMP_DIR, 'logo_hoa_warfare.png');

console.log('1. Rendering High-Res 1280x720 Transparent Logos (sips CoreGraphics)...');
renderSvgToPng(generateCallOfKarenLogoSvg(1280, 720), primaryLogoPng);
renderSvgToPng(generateBackupTitleLogoSvg(1280, 720), backupLogoPng);

// Copy as the official Library Logos (1280x720 transparent PNG)
fs.copyFileSync(primaryLogoPng, path.join(PRIMARY_DIR, 'library_logo.png'));
fs.copyFileSync(backupLogoPng, path.join(BACKUP_DIR, 'library_logo.png'));
console.log('   ✓ assets/steam/library_logo.png (1280x720)');
console.log('   ✓ assets/steam/backup_title/library_logo.png (1280x720)\n');

// 2. Generate Cinematic Library Heroes (1920x620 JPG, no baked text)
console.log('2. Generating Cinematic Library Heroes (1920x620)...');
buildLibraryHero(KEY_ART, path.join(PRIMARY_DIR, 'library_hero.jpg'));
buildLibraryHero(KEY_ART, path.join(BACKUP_DIR, 'library_hero.jpg'));
console.log('   ✓ assets/steam/library_hero.jpg (1920x620)');
console.log('   ✓ assets/steam/backup_title/library_hero.jpg (1920x620)\n');

// 3. Build Store Capsules for PRIMARY Set (Call of Karen: HOA Warfare)
console.log('3. Building Primary Capsules (Call of Karen: HOA Warfare)...');

// Header Capsule: 460 x 215
buildCapsule({
  bgPath: KEY_ART,
  logoPath: primaryLogoPng,
  outPath: path.join(PRIMARY_DIR, 'header_capsule.jpg'),
  width: 460,
  height: 215,
  logoScale: 0.94,
  logoYOffset: 0.5,
});
console.log('   ✓ header_capsule.jpg (460x215)');

// Small Capsule: 231 x 87
buildCapsule({
  bgPath: KEY_ART,
  logoPath: primaryLogoPng,
  outPath: path.join(PRIMARY_DIR, 'small_capsule.jpg'),
  width: 231,
  height: 87,
  logoScale: 0.95,
  logoYOffset: 0.5,
});
console.log('   ✓ small_capsule.jpg (231x87)');

// Main Capsule: 616 x 353
buildCapsule({
  bgPath: KEY_ART,
  logoPath: primaryLogoPng,
  outPath: path.join(PRIMARY_DIR, 'main_capsule.jpg'),
  width: 616,
  height: 353,
  logoScale: 0.88,
  logoYOffset: 0.48,
});
console.log('   ✓ main_capsule.jpg (616x353)');

// Client Icon: 256 x 256
spawnSync('sips', ['-z', '256', '256', BADGE_PNG, '--out', path.join(PRIMARY_DIR, 'client_icon.png')], { stdio: 'pipe' });
console.log('   ✓ client_icon.png (256x256)');

// Community Icon: 32 x 32
spawnSync('sips', ['-z', '32', '32', BADGE_PNG, '--out', path.join(PRIMARY_DIR, 'community_icon.png')], { stdio: 'pipe' });
console.log('   ✓ community_icon.png (32x32)\n');

// 4. Build Store Capsules for BACKUP Title Set (HOA Warfare: Cul-de-Sac Clash)
console.log('4. Building Backup Title Capsules (HOA Warfare: Cul-de-Sac Clash)...');

// Header Capsule: 460 x 215
buildCapsule({
  bgPath: KEY_ART,
  logoPath: backupLogoPng,
  outPath: path.join(BACKUP_DIR, 'header_capsule.jpg'),
  width: 460,
  height: 215,
  logoScale: 0.94,
  logoYOffset: 0.5,
});
console.log('   ✓ backup_title/header_capsule.jpg (460x215)');

// Small Capsule: 231 x 87
buildCapsule({
  bgPath: KEY_ART,
  logoPath: backupLogoPng,
  outPath: path.join(BACKUP_DIR, 'small_capsule.jpg'),
  width: 231,
  height: 87,
  logoScale: 0.95,
  logoYOffset: 0.5,
});
console.log('   ✓ backup_title/small_capsule.jpg (231x87)');

// Main Capsule: 616 x 353
buildCapsule({
  bgPath: KEY_ART,
  logoPath: backupLogoPng,
  outPath: path.join(BACKUP_DIR, 'main_capsule.jpg'),
  width: 616,
  height: 353,
  logoScale: 0.88,
  logoYOffset: 0.48,
});
console.log('   ✓ backup_title/main_capsule.jpg (616x353)');

// Icons for backup title
spawnSync('sips', ['-z', '256', '256', BADGE_PNG, '--out', path.join(BACKUP_DIR, 'client_icon.png')], { stdio: 'pipe' });
console.log('   ✓ backup_title/client_icon.png (256x256)');

spawnSync('sips', ['-z', '32', '32', BADGE_PNG, '--out', path.join(BACKUP_DIR, 'community_icon.png')], { stdio: 'pipe' });
console.log('   ✓ backup_title/community_icon.png (32x32)\n');

// 5. Author Backup Title Documentation
const backupReadme = `# Steam Backup Title Store Package

## Title: HOA Warfare: Cul-de-Sac Clash
**Alternative / Fallback Title**: Use this complete asset set if trademark counsel advises replacing "Call of Karen" to eliminate all resemblance or parody association with Activision's "Call of Duty".

### Why This Backup Title Works:
1. **Zero Parody Trademark Exposure**: Eliminates the "Call of..." phrase entirely.
2. **Maintains Established Brand Recognition**: "HOA Warfare" is already the exact subtitle, domain identity, and concept of the game.
3. **Immediate Drop-in Ready**: All assets in this directory match Steam Direct partner upload requirements pixel-for-pixel:
   - \`header_capsule.jpg\` (460 x 215)
   - \`small_capsule.jpg\` (231 x 87)
   - \`main_capsule.jpg\` (616 x 353)
   - \`library_hero.jpg\` (1920 x 620)
   - \`library_logo.png\` (1280 x 720 transparent PNG)
   - \`client_icon.png\` (256 x 256)
   - \`community_icon.png\` (32 x 32)

### Short Description (~300 chars):
The HOA has gone too far. Grab your Allowance AR and settle it the suburban way: a 6v6 tactical FPS where Karens, HOA Dads, Tradwives, Furries, and 12 other neighborhood factions battle for cul-de-sac dominance. 1,580+ voice barks. Zero mercy. Fines incoming.
`;

fs.writeFileSync(path.join(BACKUP_DIR, 'README.md'), backupReadme, 'utf8');
console.log('✓ Wrote assets/steam/backup_title/README.md');

// Clean up temporary files
try {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
} catch {}

console.log('\n🎉 Steam Capsule Generation Complete for both Primary & Backup Title sets!');
