#!/usr/bin/env node
/**
 * tools/build_steam_achievements.mjs
 *
 * Generates official Steam Direct assets:
 * 1. 13 Launch Achievement Icons (256x256 Unlocked + Locked PNGs) in assets/steam/achievements/
 * 2. 4 Weapon Camo Swatches (256x256 PNGs) in assets/steam/camos/
 * 3. 10 Prestige / Re-Zoning Badges (256x256 PNGs) in assets/steam/prestige/
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ACHIEVEMENTS_DIR = path.join(ROOT, 'assets', 'steam', 'achievements');
const CAMOS_DIR = path.join(ROOT, 'assets', 'steam', 'camos');
const PRESTIGE_DIR = path.join(ROOT, 'assets', 'steam', 'prestige');

fs.mkdirSync(ACHIEVEMENTS_DIR, { recursive: true });
fs.mkdirSync(CAMOS_DIR, { recursive: true });
fs.mkdirSync(PRESTIGE_DIR, { recursive: true });

const rawAchievements = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'achievements.json'), 'utf8')
);

/**
 * Render SVG content to PNG using macOS sips (CoreGraphics / Quartz).
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

// -----------------------------------------------------------------------------
// 1. STEAM ACHIEVEMENTS (13 Unlocked + 13 Locked)
// -----------------------------------------------------------------------------

const ACH_VISUALS = {
  ach_first_fine: {
    title: 'FIRST CITATION',
    emoji: '📋',
    color1: '#f59e0b',
    color2: '#ef4444',
    symbol: `
      <rect x="78" y="60" width="100" height="136" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
      <rect x="98" y="44" width="60" height="24" rx="6" fill="#64748b" stroke="#334155" stroke-width="3"/>
      <line x1="96" y1="92" x2="160" y2="92" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
      <line x1="96" y1="116" x2="160" y2="116" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
      <line x1="96" y1="140" x2="136" y2="140" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
      <circle cx="152" cy="154" r="22" fill="#ef4444"/>
      <text x="152" y="161" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="-apple-system, sans-serif">✓</text>
    `,
  },
  ach_lawn_order: {
    title: 'LAWN & ORDER',
    emoji: '🏆',
    color1: '#eab308',
    color2: '#ca8a04',
    symbol: `
      <path d="M72 80 C72 136 100 156 128 156 C156 156 184 136 184 80 Z" fill="#eab308" stroke="#fef08a" stroke-width="5"/>
      <path d="M72 90 C50 90 46 118 68 126 C74 128 78 126 80 120" fill="none" stroke="#eab308" stroke-width="6" stroke-linecap="round"/>
      <path d="M184 90 C206 90 210 118 188 126 C182 128 178 126 176 120" fill="none" stroke="#eab308" stroke-width="6" stroke-linecap="round"/>
      <rect x="116" y="156" width="24" height="26" fill="#ca8a04"/>
      <rect x="94" y="182" width="68" height="18" rx="4" fill="#854d0e" stroke="#eab308" stroke-width="3"/>
      <polygon points="128,94 133,108 147,108 136,117 140,131 128,122 116,131 120,117 109,108 123,108" fill="#ffffff"/>
    `,
  },
  ach_casserole_thief: {
    title: 'CASSEROLE BANDIT',
    emoji: '🥘',
    color1: '#f97316',
    color2: '#c2410c',
    symbol: `
      <ellipse cx="128" cy="142" rx="68" ry="32" fill="#ea580c" stroke="#fed7aa" stroke-width="5"/>
      <ellipse cx="128" cy="132" rx="58" ry="24" fill="#fbbf24"/>
      <path d="M56 138 C40 138 40 148 56 148" fill="none" stroke="#fed7aa" stroke-width="5" stroke-linecap="round"/>
      <path d="M200 138 C216 138 216 148 200 148" fill="none" stroke="#fed7aa" stroke-width="5" stroke-linecap="round"/>
      <path d="M104 100 Q112 84 108 72" fill="none" stroke="#fdba74" stroke-width="4" stroke-linecap="round"/>
      <path d="M128 96 Q136 78 130 64" fill="none" stroke="#fdba74" stroke-width="4" stroke-linecap="round"/>
      <path d="M152 100 Q160 84 154 72" fill="none" stroke="#fdba74" stroke-width="4" stroke-linecap="round"/>
      <rect x="80" y="124" width="96" height="18" rx="9" fill="#0f172a"/>
      <circle cx="106" cy="133" r="5" fill="#f8fafc"/>
      <circle cx="150" cy="133" r="5" fill="#f8fafc"/>
    `,
  },
  ach_hoa_patrol: {
    title: 'NEIGHBORHOOD WATCH',
    emoji: '🚩',
    color1: '#3b82f6',
    color2: '#1d4ed8',
    symbol: `
      <path d="M128 48 L192 74 V126 C192 168 128 198 128 198 C128 198 64 168 64 126 V74 Z" fill="#1e40af" stroke="#93c5fd" stroke-width="5"/>
      <circle cx="110" cy="116" r="18" fill="none" stroke="#60a5fa" stroke-width="5"/>
      <circle cx="146" cy="116" r="18" fill="none" stroke="#60a5fa" stroke-width="5"/>
      <line x1="124" y1="116" x2="132" y2="116" stroke="#60a5fa" stroke-width="5"/>
      <line x1="128" y1="64" x2="128" y2="92" stroke="#f87171" stroke-width="4"/>
      <polygon points="128,64 164,74 128,84" fill="#ef4444"/>
    `,
  },
  ach_eviction: {
    title: 'EVICTION NOTICE',
    emoji: '📄',
    color1: '#ef4444',
    color2: '#991b1b',
    symbol: `
      <rect x="74" y="56" width="108" height="144" rx="8" fill="#fef2f2" stroke="#fca5a5" stroke-width="4"/>
      <line x1="92" y1="84" x2="164" y2="84" stroke="#f87171" stroke-width="5" stroke-linecap="round"/>
      <line x1="92" y1="104" x2="164" y2="104" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
      <line x1="92" y1="120" x2="164" y2="120" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
      <line x1="92" y1="136" x2="140" y2="136" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
      <g transform="translate(120, 150) rotate(-18)">
        <rect x="-42" y="-14" width="84" height="28" rx="4" fill="none" stroke="#dc2626" stroke-width="4"/>
        <text x="0" y="6" font-size="14" font-weight="900" fill="#dc2626" text-anchor="middle" font-family="Impact, Arial Black, sans-serif">EVICTED</text>
      </g>
    `,
  },
  ach_helo_down: {
    title: "DAD'S PRIDE GROUNDED",
    emoji: '🚁',
    color1: '#64748b',
    color2: '#334155',
    symbol: `
      <g transform="translate(128, 120) rotate(24)">
        <line x1="-50" y1="-26" x2="50" y2="-26" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
        <line x1="0" y1="-26" x2="0" y2="-12" stroke="#64748b" stroke-width="4"/>
        <ellipse cx="0" cy="0" rx="34" ry="18" fill="#3b82f6" stroke="#93c5fd" stroke-width="4"/>
        <rect x="24" y="-4" width="36" height="8" fill="#1e40af"/>
        <line x1="56" y1="-14" x2="56" y2="6" stroke="#94a3b8" stroke-width="3"/>
        <line x1="-20" y1="20" x2="20" y2="20" stroke="#475569" stroke-width="4"/>
        <line x1="-12" y1="16" x2="-16" y2="20" stroke="#475569" stroke-width="3"/>
        <line x1="12" y1="16" x2="16" y2="20" stroke="#475569" stroke-width="3"/>
      </g>
      <circle cx="132" cy="120" r="48" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="6 6"/>
      <line x1="132" y1="64" x2="132" y2="176" stroke="#ef4444" stroke-width="2"/>
      <line x1="76" y1="120" x2="188" y2="120" stroke="#ef4444" stroke-width="2"/>
    `,
  },
  ach_streak_5: {
    title: 'OVERBEARING HOA',
    emoji: '⭐',
    color1: '#eab308',
    color2: '#854d0e',
    symbol: `
      <circle cx="128" cy="128" r="64" fill="#713f12" stroke="#fef08a" stroke-width="4"/>
      <g fill="#facc15">
        <polygon points="128,74 133,88 147,88 136,97 140,111 128,102 116,111 120,97 109,88 123,88"/>
        <polygon points="86,108 91,122 105,122 94,131 98,145 86,136 74,145 78,131 67,122 81,122"/>
        <polygon points="170,108 175,122 189,122 178,131 182,145 170,136 158,145 162,131 151,122 165,122"/>
        <polygon points="102,152 107,166 121,166 110,175 114,189 102,180 90,189 94,175 83,166 97,166"/>
        <polygon points="154,152 159,166 173,166 162,175 166,189 154,180 142,189 146,175 135,166 149,166"/>
      </g>
    `,
  },
  ach_camp_snitch: {
    title: 'GET MOVING!',
    emoji: '🚨',
    color1: '#dc2626',
    color2: '#7f1d1d',
    symbol: `
      <rect x="98" y="146" width="60" height="30" rx="4" fill="#334155" stroke="#64748b" stroke-width="3"/>
      <path d="M102 146 C102 96 154 96 154 146 Z" fill="#ef4444" stroke="#fca5a5" stroke-width="4"/>
      <line x1="72" y1="84" x2="88" y2="98" stroke="#f87171" stroke-width="4" stroke-linecap="round"/>
      <line x1="128" y1="64" x2="128" y2="82" stroke="#f87171" stroke-width="4" stroke-linecap="round"/>
      <line x1="184" y1="84" x2="168" y2="98" stroke="#f87171" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="120" cy="116" rx="6" ry="14" fill="#fee2e2" opacity="0.6"/>
    `,
  },
  ach_lawsuit: {
    title: 'SEE YOU IN COURT',
    emoji: '⚖️',
    color1: '#a855f7',
    color2: '#6b21a8',
    symbol: `
      <line x1="128" y1="66" x2="128" y2="180" stroke="#fef08a" stroke-width="6"/>
      <line x1="84" y1="86" x2="172" y2="86" stroke="#fef08a" stroke-width="6" stroke-linecap="round"/>
      <circle cx="128" cy="66" r="10" fill="#eab308"/>
      <rect x="100" y="174" width="56" height="16" rx="4" fill="#ca8a04"/>
      <line x1="88" y1="88" x2="72" y2="134" stroke="#cbd5e1" stroke-width="2"/>
      <line x1="88" y1="88" x2="104" y2="134" stroke="#cbd5e1" stroke-width="2"/>
      <path d="M66 134 C66 150 110 150 110 134 Z" fill="#facc15" stroke="#a16207" stroke-width="3"/>
      <line x1="168" y1="88" x2="152" y2="134" stroke="#cbd5e1" stroke-width="2"/>
      <line x1="168" y1="88" x2="184" y2="134" stroke="#cbd5e1" stroke-width="2"/>
      <path d="M146 134 C146 150 190 150 190 134 Z" fill="#facc15" stroke="#a16207" stroke-width="3"/>
    `,
  },
  ach_trophy_hunter: {
    title: 'EVERYONE GETS A TROPHY',
    emoji: '🥇',
    color1: '#f59e0b',
    color2: '#b45309',
    symbol: `
      <circle cx="128" cy="116" r="46" fill="#f59e0b" stroke="#fef08a" stroke-width="5"/>
      <text x="128" y="132" font-size="44" font-weight="900" fill="#78350f" text-anchor="middle" font-family="-apple-system, sans-serif">1</text>
      <polygon points="108,154 94,204 116,192 128,204 120,158" fill="#3b82f6"/>
      <polygon points="148,154 162,204 140,192 128,204 136,158" fill="#ef4444"/>
    `,
  },
  ach_fine_from_above: {
    title: 'FINE FROM ABOVE',
    emoji: '🛸',
    color1: '#06b6d4',
    color2: '#0e7490',
    symbol: `
      <circle cx="128" cy="128" r="66" fill="none" stroke="#22d3ee" stroke-width="3" stroke-dasharray="12 6"/>
      <circle cx="128" cy="128" r="42" fill="none" stroke="#0891b2" stroke-width="2"/>
      <circle cx="128" cy="128" r="6" fill="#06b6d4"/>
      <line x1="56" y1="128" x2="200" y2="128" stroke="#22d3ee" stroke-width="2"/>
      <line x1="128" y1="56" x2="128" y2="200" stroke="#22d3ee" stroke-width="2"/>
      <polygon points="128,88 156,128 142,136 128,124 114,136 100,128" fill="#06b6d4" stroke="#e0f2fe" stroke-width="2"/>
    `,
  },
  ach_gold_standard: {
    title: 'GOLD STANDARD',
    emoji: '✨',
    color1: '#ffd700',
    color2: '#b45309',
    symbol: `
      <g transform="translate(128, 126) rotate(-15)">
        <polygon points="-46,-16 46,-16 36,16 -56,16" fill="#facc15" stroke="#fef08a" stroke-width="4"/>
        <text x="-5" y="6" font-size="16" font-weight="900" fill="#78350f" text-anchor="middle" font-family="monospace">24K GOLD</text>
      </g>
      <polygon points="76,82 82,96 96,96 85,105 89,119 76,110 63,119 67,105 56,96 70,96" fill="#ffffff"/>
      <polygon points="184,152 188,162 198,162 190,168 193,178 184,172 175,178 178,168 170,162 180,162" fill="#ffffff"/>
    `,
  },
  ach_rezoned: {
    title: 'RE-ZONED',
    emoji: '🏚️',
    color1: '#e2e8f0',
    color2: '#64748b',
    symbol: `
      <circle cx="128" cy="128" r="62" fill="#1e293b" stroke="#facc15" stroke-width="5"/>
      <polygon points="128,72 172,108 84,108" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>
      <rect x="94" y="108" width="68" height="46" fill="#cbd5e1"/>
      <rect x="116" y="124" width="24" height="30" fill="#0f172a"/>
      <rect x="142" y="80" width="12" height="20" fill="#94a3b8"/>
      <path d="M72 172 Q128 192 184 172" fill="none" stroke="#facc15" stroke-width="6" stroke-linecap="round"/>
      <text x="128" y="180" font-size="11" font-weight="900" fill="#fef08a" text-anchor="middle" font-family="monospace">PRESTIGE</text>
    `,
  },
};

console.log('🏆 Generating Steam Launch Achievements in assets/steam/achievements/...\n');

for (const ach of rawAchievements) {
  const meta = ACH_VISUALS[ach.steamIcon] || {
    title: ach.name.toUpperCase(),
    emoji: ach.icon || '🏆',
    color1: '#3b82f6',
    color2: '#1d4ed8',
    symbol: `<text x="128" y="150" font-size="64" text-anchor="middle">${ach.icon || '🏆'}</text>`,
  };

  // 1. UNLOCKED ICON (256x256)
  const unlockedSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg_${ach.steamIcon}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>
    <linearGradient id="rim_${ach.steamIcon}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${meta.color1}"/>
      <stop offset="100%" stop-color="${meta.color2}"/>
    </linearGradient>
    <radialGradient id="glow_${ach.steamIcon}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${meta.color1}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${meta.color1}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Base Dark Plate -->
  <rect x="8" y="8" width="240" height="240" rx="44" fill="url(#bg_${ach.steamIcon})"/>
  <rect x="8" y="8" width="240" height="240" rx="44" fill="url(#glow_${ach.steamIcon})"/>

  <!-- Tactical Rim -->
  <rect x="8" y="8" width="240" height="240" rx="44" fill="none" stroke="url(#rim_${ach.steamIcon})" stroke-width="8"/>
  <rect x="18" y="18" width="220" height="220" rx="36" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="6 4"/>

  <!-- Background Reticle -->
  <circle cx="128" cy="128" r="82" fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 6"/>
  <circle cx="128" cy="128" r="54" fill="none" stroke="#1e293b" stroke-width="2"/>

  <!-- Foreground Symbol -->
  ${meta.symbol}

  <!-- Steam Corner Screws -->
  <circle cx="28" cy="28" r="4" fill="#475569"/>
  <circle cx="228" cy="28" r="4" fill="#475569"/>
  <circle cx="28" cy="228" r="4" fill="#475569"/>
  <circle cx="228" cy="228" r="4" fill="#475569"/>
</svg>
`;

  // 2. LOCKED ICON (256x256)
  const lockedSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg_locked" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
  </defs>

  <!-- Base Plate -->
  <rect x="8" y="8" width="240" height="240" rx="44" fill="url(#bg_locked)"/>
  <rect x="8" y="8" width="240" height="240" rx="44" fill="none" stroke="#334155" stroke-width="8"/>
  <rect x="18" y="18" width="220" height="220" rx="36" fill="none" stroke="#1e293b" stroke-width="2"/>

  <!-- Dimmed Silhouette -->
  <g opacity="0.12" filter="grayscale(100%)">
    ${meta.symbol}
  </g>

  <!-- Heavy Padlock Emblem -->
  <path d="M104 116 V96 C104 82 114 72 128 72 C142 72 152 82 152 96 V116" fill="none" stroke="#64748b" stroke-width="12" stroke-linecap="round"/>
  <rect x="94" y="112" width="68" height="56" rx="10" fill="#334155" stroke="#475569" stroke-width="4"/>
  <circle cx="128" cy="136" r="6" fill="#0f172a"/>
  <path d="M128 142 V152" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>

  <!-- Locked Ribbon -->
  <rect x="64" y="186" width="128" height="22" rx="4" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <text x="128" y="202" font-size="11" font-weight="900" fill="#64748b" text-anchor="middle" font-family="monospace">LOCKED</text>

  <!-- Screws -->
  <circle cx="28" cy="28" r="4" fill="#334155"/>
  <circle cx="228" cy="28" r="4" fill="#334155"/>
  <circle cx="28" cy="228" r="4" fill="#334155"/>
  <circle cx="228" cy="228" r="4" fill="#334155"/>
</svg>
`;

  const unlockedPng = path.join(ACHIEVEMENTS_DIR, `${ach.steamIcon}.png`);
  const lockedPng = path.join(ACHIEVEMENTS_DIR, `${ach.steamIcon}_locked.png`);

  renderSvgToPng(unlockedSvg, unlockedPng);
  renderSvgToPng(lockedSvg, lockedPng);
  console.log(`✓ ${ach.steamIcon}.png & ${ach.steamIcon}_locked.png`);
}

// -----------------------------------------------------------------------------
// 2. WEAPON CAMO SWATCHES (4 Swatches)
// -----------------------------------------------------------------------------

console.log('\n🎨 Generating Weapon Camo Swatches in assets/steam/camos/...\n');

const CAMOS = [
  {
    id: 'camo_beige',
    name: 'HOA-Approved Beige',
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#d8c8a0"/>
  <line x1="0" y1="32" x2="256" y2="32" stroke="#c2b088" stroke-width="6"/>
  <line x1="0" y1="64" x2="256" y2="64" stroke="#c2b088" stroke-width="6"/>
  <line x1="0" y1="96" x2="256" y2="96" stroke="#c2b088" stroke-width="6"/>
  <line x1="0" y1="128" x2="256" y2="128" stroke="#c2b088" stroke-width="6"/>
  <line x1="0" y1="160" x2="256" y2="160" stroke="#c2b088" stroke-width="6"/>
  <line x1="0" y1="192" x2="256" y2="192" stroke="#c2b088" stroke-width="6"/>
  <line x1="0" y1="224" x2="256" y2="224" stroke="#c2b088" stroke-width="6"/>
  <rect x="12" y="12" width="232" height="232" rx="20" fill="none" stroke="#8c7853" stroke-width="6"/>
  <text x="128" y="240" font-size="12" font-weight="900" fill="#6b5838" text-anchor="middle" font-family="monospace">HOA BEIGE</text>
</svg>
    `,
  },
  {
    id: 'camo_mulch',
    name: 'Fresh Mulch',
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#4a3018"/>
  <g fill="#6b4a2b" stroke="#321e0c" stroke-width="2">
    <ellipse cx="48" cy="48" rx="24" ry="12" transform="rotate(25 48 48)"/>
    <ellipse cx="120" cy="72" rx="28" ry="14" transform="rotate(-35 120 72)"/>
    <ellipse cx="200" cy="40" rx="22" ry="10" transform="rotate(15 200 40)"/>
    <ellipse cx="70" cy="130" rx="30" ry="14" transform="rotate(45 70 130)"/>
    <ellipse cx="150" cy="140" rx="26" ry="12" transform="rotate(-20 150 140)"/>
    <ellipse cx="220" cy="120" rx="24" ry="12" transform="rotate(30 220 120)"/>
    <ellipse cx="40" cy="200" rx="26" ry="12" transform="rotate(-15 40 200)"/>
    <ellipse cx="120" cy="210" rx="30" ry="14" transform="rotate(40 120 210)"/>
    <ellipse cx="190" cy="200" rx="24" ry="12" transform="rotate(-40 190 200)"/>
  </g>
  <rect x="12" y="12" width="232" height="232" rx="20" fill="none" stroke="#8b5e34" stroke-width="6"/>
  <text x="128" y="240" font-size="12" font-weight="900" fill="#a27042" text-anchor="middle" font-family="monospace">FRESH MULCH</text>
</svg>
    `,
  },
  {
    id: 'camo_granite',
    name: 'Granite Countertop',
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#475569"/>
  <!-- Quartz flecks -->
  <g fill="#cbd5e1">
    <polygon points="30,40 38,44 32,52 26,46"/>
    <polygon points="90,30 96,32 94,40 88,38"/>
    <polygon points="160,50 170,54 164,62 156,58"/>
    <polygon points="220,35 228,38 224,46 216,42"/>
    <polygon points="45,110 55,114 48,124 40,118"/>
    <polygon points="120,105 132,108 126,118 114,114"/>
    <polygon points="190,120 202,124 196,134 184,128"/>
    <polygon points="35,180 44,184 38,192 30,186"/>
    <polygon points="105,175 118,178 112,188 100,184"/>
    <polygon points="175,190 186,194 180,204 170,198"/>
    <polygon points="230,185 240,188 235,196 226,192"/>
  </g>
  <g fill="#1e293b">
    <circle cx="60" cy="70" r="6"/>
    <circle cx="140" cy="45" r="5"/>
    <circle cx="210" cy="80" r="7"/>
    <circle cx="80" cy="145" r="6"/>
    <circle cx="160" cy="160" r="7"/>
    <circle cx="230" cy="140" r="5"/>
    <circle cx="70" cy="220" r="6"/>
    <circle cx="140" cy="225" r="5"/>
    <circle cx="210" cy="220" r="7"/>
  </g>
  <rect x="12" y="12" width="232" height="232" rx="20" fill="none" stroke="#94a3b8" stroke-width="6"/>
  <text x="128" y="240" font-size="12" font-weight="900" fill="#e2e8f0" text-anchor="middle" font-family="monospace">GRANITE</text>
</svg>
    `,
  },
  {
    id: 'camo_gold',
    name: '24K Gold',
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="gold_grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="35%" stop-color="#eab308"/>
      <stop offset="70%" stop-color="#ca8a04"/>
      <stop offset="100%" stop-color="#854d0e"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#gold_grad)"/>
  <!-- Luxury Damask / Chevron weave -->
  <g fill="none" stroke="#fef08a" stroke-width="4" opacity="0.65">
    <path d="M-20 60 L60 -20 M20 100 L100 20 M60 140 L140 60 M100 180 L180 100 M140 220 L220 140 M180 260 L260 180"/>
    <path d="M276 60 L196 -20 M236 100 L156 20 M196 140 L116 60 M156 180 L76 100 M116 220 L36 140 M76 260 L-4 180"/>
  </g>
  <rect x="12" y="12" width="232" height="232" rx="20" fill="none" stroke="#ffffff" stroke-width="6"/>
  <polygon points="128,40 134,56 150,56 137,66 142,82 128,72 114,82 119,66 106,56 122,56" fill="#ffffff"/>
  <text x="128" y="240" font-size="12" font-weight="900" fill="#713f12" text-anchor="middle" font-family="monospace">24K GOLD</text>
</svg>
    `,
  },
];

for (const c of CAMOS) {
  const p = path.join(CAMOS_DIR, `${c.id}.png`);
  renderSvgToPng(c.svg, p);
  console.log(`✓ ${c.id}.png (${c.name})`);
}

// -----------------------------------------------------------------------------
// 3. PRESTIGE BADGES (Prestige 1 to 10)
// -----------------------------------------------------------------------------

console.log('\n👑 Generating Prestige Badges in assets/steam/prestige/...\n');

const PRESTIGE_TIERS = [
  { level: 1, title: 'Re-Zoned I', color: '#b45309', rim: '#d97706', star: 1 },
  { level: 2, title: 'Re-Zoned II', color: '#b45309', rim: '#f59e0b', star: 2 },
  { level: 3, title: 'Re-Zoned III', color: '#64748b', rim: '#94a3b8', star: 3 },
  { level: 4, title: 'Re-Zoned IV', color: '#64748b', rim: '#cbd5e1', star: 4 },
  { level: 5, title: 'Re-Zoned V', color: '#ca8a04', rim: '#eab308', star: 5 },
  { level: 6, title: 'Re-Zoned VI', color: '#ca8a04', rim: '#fde047', star: 6 },
  { level: 7, title: 'Re-Zoned VII', color: '#0284c7', rim: '#38bdf8', star: 7 },
  { level: 8, title: 'Re-Zoned VIII', color: '#0369a1', rim: '#7dd3fc', star: 8 },
  { level: 9, title: 'Re-Zoned IX', color: '#7c3aed', rim: '#c084fc', star: 9 },
  { level: 10, title: 'Supreme HOA President', color: '#e11d48', rim: '#ffd700', star: 10, master: true },
];

for (const p of PRESTIGE_TIERS) {
  const starsSvg = Array.from({ length: Math.min(5, p.star) })
    .map((_, i, arr) => {
      const offset = (i - (arr.length - 1) / 2) * 22;
      return `<polygon points="${128 + offset},172 ${132 + offset},182 ${144 + offset},182 ${134 + offset},188 ${138 + offset},198 ${128 + offset},192 ${118 + offset},198 ${122 + offset},188 ${112 + offset},182 ${124 + offset},182" fill="#fef08a"/>`;
    })
    .join('');

  const badgeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="pbg_${p.level}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="prim_${p.level}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${p.rim}"/>
      <stop offset="100%" stop-color="${p.color}"/>
    </linearGradient>
  </defs>

  <!-- Background Shield -->
  <path d="M128 20 L216 56 V134 C216 190 128 236 128 236 C128 236 40 190 40 134 V56 Z" fill="url(#pbg_${p.level})" stroke="url(#prim_${p.level})" stroke-width="8"/>
  <path d="M128 34 L202 66 V130 C202 178 128 218 128 218 C128 218 54 178 54 130 V66 Z" fill="none" stroke="${p.rim}" stroke-width="2" stroke-dasharray="6 4" opacity="0.6"/>

  <!-- Center Emblem -->
  ${
    p.master
      ? `
    <!-- Supreme Master Crown -->
    <path d="M72 134 L92 90 L128 116 L164 90 L184 134 Z" fill="#ffd700" stroke="#fef08a" stroke-width="5"/>
    <circle cx="92" cy="84" r="7" fill="#ef4444"/>
    <circle cx="128" cy="108" r="7" fill="#3b82f6"/>
    <circle cx="164" cy="84" r="7" fill="#ef4444"/>
    <rect x="72" y="134" width="112" height="18" rx="4" fill="#b45309" stroke="#fef08a" stroke-width="3"/>
  `
      : `
    <!-- Re-Zoning Chevron / Star -->
    <polygon points="128,64 142,106 186,106 150,132 164,174 128,148 92,174 106,132 70,106 114,106" fill="${p.rim}" stroke="#f8fafc" stroke-width="4"/>
    <circle cx="128" cy="122" r="18" fill="#0f172a" stroke="${p.rim}" stroke-width="3"/>
    <text x="128" y="129" font-size="18" font-weight="900" fill="#f8fafc" text-anchor="middle" font-family="Impact, Arial Black, sans-serif">${p.level}</text>
  `
  }

  <!-- Lower Stars -->
  ${starsSvg}

  <!-- Banner -->
  <rect x="56" y="206" width="144" height="20" rx="4" fill="#0f172a" stroke="${p.rim}" stroke-width="2"/>
  <text x="128" y="220" font-size="10" font-weight="900" fill="${p.rim}" text-anchor="middle" font-family="monospace">${p.title.toUpperCase()}</text>
</svg>
`;

  const destPng = path.join(PRESTIGE_DIR, `prestige_${p.level}.png`);
  renderSvgToPng(badgeSvg, destPng);
  console.log(`✓ prestige_${p.level}.png (${p.title})`);
}

console.log('\n✨ Steam Assets build complete!');
