// Web slice entry point: menu -> 6v6 Cul-de-Sac Clash vs bots, first-person, retro render.
// URL params: ?seed=N  ?faction=karens  ?script=steam  ?legal=0  ?retro=0  ?voice=0
//             ?autostart=1 (skip menu)  ?spectate=1 (you are a bot; chase cam; for demos/screenshots)
import { ContentLibrary } from '../core/content.js';
import { AudioLimiter } from '../core/audioLimiter.js';
import { mulberry32 } from '../core/rng.js';
import { Sim, yawTo } from './sim.js';
import { MODES } from './modes.js';
import { BarkSystem } from './barks.js';
import { createJuice, JUICE } from './juice.js';
import { ChatterDirector } from '../core/chatter.js';
import { Renderer } from './render.js';
import { Voice, Sfx } from './audio.js';
import { buildCulDeSac, buildMap, MAPS } from './map.js';
import { Radar } from './radar.js';
import { GunbarrelIntro } from './gunbarrel.js';
import { Controls, aimAssist, triggerHaptic as haptic } from './controls.js';
import { PerfOverlay } from './perf.js';
import { STYLES, getInitialStyle, applyStyle, cycleStyle } from './styles.js';
import { Hud } from './hud.js';
import { NetClient } from './net.js';
import { Funnel } from './funnel.js';
import { OnlineSession } from './online.js';
import { Portal } from './portal.js';
import { CareerProfile } from './progression.js';

export const DEMO_FACTIONS = ['karens', 'tradwives', 'hoaDads', 'furries', 'trumpers', 'pickleballRetirees'];

const PAUSE_HINT = { mouse: 'Click anywhere to lock aim & resume the match.', pad: 'Press START or A to resume · VIEW to quit', touch: 'Tap anywhere to resume the match.' };

const $ = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
// Build marker for the free web demo. tools/package_demo.mjs rewrites this line to `true` in
// the demo zip (and fails the pack if it cannot), so a demo build is a constant in the shipped
// file rather than a runtime flag: deleting window.__HOA_DEMO__ in DevTools no longer changes
// anything, and the demo pack does not contain the paid factions at all (it ships
// data/demo_content.json instead of data/hoa_content.json).
export const DEMO_BUILD = false;
export const isDemo = DEMO_BUILD || params.get('demo') === '1' || (typeof window !== 'undefined' && window.__HOA_DEMO__ === true);
const FIXED = 1 / 60;
const KILLCAM_SEC = 3.2;

export const career = new CareerProfile({
  isDemo,
  onAchievement: ach => game?.hud?.showAchievementToast?.(ach),
  onRankUp: rank => game?.showBanner?.(`🎖️ PROMOTED: ${rank.title.toUpperCase()}`, `HOA Career Rank ${rank.rank} Reached!`),
});

async function loadJson(path) {
  if (typeof window === 'undefined') {
    try {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const url = new URL('../../' + path, import.meta.url);
      return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
    } catch {}
  }
  try {
    const res = await fetch(path);
    if (res.ok) return await res.json();
  } catch {}
  const alt = path.startsWith('../') ? path.slice(3) : '../' + path;
  const res2 = await fetch(alt);
  return await res2.json();
}

const [content, weaponsData, demoConfig] = await Promise.all([
  loadJson('../data/hoa_content.json'),
  loadJson('../data/weapons.json'),
  loadJson('../data/demo.json').catch(() => ({})),
]);
// Web demo -> Steam funnel (links, CTA copy, share text). Steam buttons in the static HTML are wired now.
export const funnel = new Funnel(demoConfig || {});
funnel.wireSteamLinks();
// CrazyGames SDK (loaded only on CrazyGames; no-op elsewhere)
export const portal = new Portal(funnel.portal);
portal.init();
const factions = content.factions;
const shippingFactions = Object.keys(factions).filter(id => !factions[id].status || factions[id].status !== 'draft');

export const FACTION_METADATA = {
  karens: { icon: '💇‍♀️', role: 'TACTICAL ENFORCER', gear: 'Violation Megaphone', nemesis: 'VC / Finance Bros', quote: '"I want to speak to the PRESIDENT of this cul-de-sac!"', voLine: 'karens.roundStart.c.0' },
  hoaDads: { icon: '📋', role: 'LAWN COMMANDER', gear: 'Grass Measuring Tape', nemesis: 'The Furries', quote: '"Grass is measuring 2.8 inches. Acceptable. Move out."', voLine: 'hoaDads.roundStart.c.0' },
  tradwives: { icon: '🍞', role: 'HOMESTEAD HEAVY', gear: 'Sourdough Bread Basket', nemesis: 'The Woke Libs', quote: '"My sourdough starter has been alive longer than your KD ratio."', voLine: 'tradwives.roundStart.c.0' },
  furries: { icon: '🦊', role: 'MASCOT BRAWLER', gear: 'Oversized Fluffy Tail', nemesis: 'HOA Dads', quote: '"OwO what\'s this? A tactical engagement?!"', voLine: 'furries.roundStart.c.0' },
  pickleballRetirees: { icon: '🏓', role: 'KITCHEN SNIPER', gear: 'Graphite Paddle & Visor', nemesis: 'Frat House', quote: '"Dink it into the kitchen, boys!"', voLine: 'pickleballRetirees.roundStart.c.0' },
  trumpers: { icon: '🧢', role: 'RALLY CAPTAIN', gear: 'Golden Megaphone', nemesis: 'The Woke Libs', quote: '"Nobody defends a cul-de-sac like me, folks."', voLine: 'trumpers.roundStart.c.0' },
  wallstreetBets: { icon: '📈', role: 'DISRUPTOR', gear: 'Patagonia Fleece & AirPods', nemesis: 'The Karens', quote: '"Pre-revenue, pre-product, post-up on the cul-de-sac."', voLine: 'wallstreetBets.roundStart.c.0' },
  wokeLibs: { icon: '☕', role: 'ORGANIZER', gear: 'Organic Canvas Tote Bag', nemesis: 'The Trumpers', quote: '"Your lawn violates three city carbon ordinances!"', voLine: 'wokeLibs.roundStart.c.0' },
  rednecks: { icon: '🚚', role: 'FRONT-YARD GUNNER', gear: 'Fringe Trucker Cap', nemesis: 'The Woke Libs', quote: '"I do not create joinder with this HOA!"', voLine: 'rednecks.roundStart.c.0' },
  fratHouse: { icon: '🍺', role: 'RUSHER', gear: 'Red Solo Cup & Zyn', nemesis: 'Pickleball Retirees', quote: '"Rush week is OVER for you!"', voLine: 'fratHouse.roundStart.c.0' },
  gymRats: { icon: '💪', role: 'TANK BRUTE', gear: 'Frosted Protein Shaker', nemesis: 'The Weeb Mods', quote: '"Chest day is every day. No excuses!"', voLine: 'gymRats.roundStart.c.0' },
  animeWeebs: { icon: '⚔️', role: 'MALL NINJA MOD', gear: 'Heavy Ban-Hammer & Katana', nemesis: 'Gym Rats', quote: '"While you cut grass, I studied the blade."', voLine: 'animeWeebs.roundStart.c.0' },
  cloutStreamers: { icon: '📱', role: 'CONTENT SNIPER', gear: 'LED Ring Light & Tripod', nemesis: 'Old Money', quote: '"Chat, are we clipping this 360 citation?!"', voLine: 'cloutStreamers.roundStart.c.0' },
  valleyGirls: { icon: '🛍️', role: 'SOCIALITE ASSAULT', gear: 'Iced Oat Latte & Scrunchie', nemesis: 'Emo Kids', quote: '"Like, literally get evicted right now."', voLine: 'valleyGirls.roundStart.c.0' },
  fabulous: { icon: '💅', role: 'AESTHETIC VANGUARD', gear: 'Designer Shades & Pastels', nemesis: 'The Trumpers', quote: '"Your property values are simply unlivable, darling."', voLine: 'fabulous.roundStart.c.0' },
  brainRot: { icon: '💀', role: 'SKIBIDI CHAOS', gear: 'Noise-Canceling Cans', nemesis: 'HOA Dads', quote: '"Zero fanum tax on this cul-de-sac, unc."', voLine: 'brainRot.roundStart.c.0' },
};

const initialFaction = params.get('faction') && factions[params.get('faction')] ? params.get('faction') : 'karens';
const initialDiffParam = params.get('difficulty') || params.get('bots') || 'medium';
const initialDifficulty = ['easy', 'medium', 'hard'].includes(initialDiffParam) ? initialDiffParam : (initialDiffParam === 'normal' ? 'medium' : 'medium');
const initialMapParam = params.get('map') || 'culdesac';
const state = {
  faction: isDemo && !DEMO_FACTIONS.includes(initialFaction) ? 'karens' : initialFaction,
  script: params.get('script') === 'steam' ? 'steam' : 'clean',
  legalSafe: params.get('legal') !== '0',
  retro: params.get('retro') === '1',
  style: getInitialStyle(params),
  get style007() { return this.style === '007'; },
  set style007(v) { this.style = v ? '007' : 'modern'; },
  voice: params.get('voice') !== '0',
  spectate: params.get('spectate') === '1',
  mode: MODES[params.get('mode')] ? params.get('mode') : 'clash',
  difficulty: initialDifficulty,
  // Paid maps/skins/mutators are gated on DEMO_BUILD (a build constant), so a DevTools flip of
  // the demo flag cannot unlock paid content in the free pack.
  map: !DEMO_BUILD && !isDemo && MAPS[initialMapParam] && !MAPS[initialMapParam].wip ? initialMapParam : 'culdesac',
  goldSkin: !DEMO_BUILD && !isDemo && params.get('gold') === '1',
  wpnVisual: (params.get('wpn') === '3d' || (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' && localStorage.getItem('hoa_wpn_visual') === '3d')) ? '3d' : '2d',
  mutators: {
    bigHead: params.get('bighead') === '1',
    shotgunsOnly: !DEMO_BUILD && !isDemo && params.get('shotguns') === '1',
    lowGrav: !DEMO_BUILD && !isDemo && params.get('lowgrav') === '1',
    turbo: !DEMO_BUILD && !isDemo && params.get('turbo') === '1',
  },
};

const viewCanvas = typeof document !== 'undefined' ? $('view') : null;
const renderer = viewCanvas ? new Renderer(viewCanvas, { map: buildCulDeSac(), factions }) : null;
if (renderer) renderer.setRetro(state.retro);
const voice = new Voice({ factions });
const sfx = new Sfx();
let game = null;

const gunbarrel = typeof document !== 'undefined' && $('gunbarrel') ? new GunbarrelIntro($('gunbarrel'), sfx) : null;
if (gunbarrel && typeof window !== 'undefined') {
  $('gunbarrel').addEventListener('click', () => gunbarrel.stop());
  window.addEventListener('keydown', e => {
    if (gunbarrel.active && (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter')) {
      gunbarrel.stop();
    }
  });
}

if (renderer && typeof document !== 'undefined' && $('optStyle')) {
  applyStyle(state.style, state, renderer, $);
}

// ------------------------------------------------------------------ demo modal

export function showDemoModal(factionName, factionTagline = '') {
  const modal = $('demoModal');
  if (!modal) return;
  const title = $('demoModalTitle');
  if (title) title.textContent = '🔒 LOCKED IN FREE WEB DEMO';
  const sub = $('demoModalSub');
  if (sub) {
    sub.textContent = factionTagline ? `"${factionTagline}"` : '';
    sub.style.display = factionTagline ? 'block' : 'none';
  }
  const body = $('demoModalBody');
  if (body) {
    body.innerHTML = funnel.allowsStoreLink('locked_faction')
      ? `Unlock <strong>${factionName}</strong> and ${funnel.pitch(Object.keys(factions).length)} in the full ${funnel.cfg.priceLabel} release on Steam!`
      : `<strong>${factionName}</strong> is in the full game. Pick a faction without a lock to play now.`; // CrazyGames: no cross-promotion here
  }
  modal.classList.remove('hidden');
}

export function hideDemoModal() {
  const modal = $('demoModal');
  if (modal) modal.classList.add('hidden');
}

// ------------------------------------------------------------------ menu

export const WEAPON_DEFINITIONS = {
  ar: {
    weaponId: 'allowance',
    name: 'The Allowance',
    class: 'AR',
    role: 'TACTICAL ASSAULT',
    asset: 'assets/weapons/allowance.svg',
    asset3d: 'assets/weapons/allowance_3d.png',
    angle: -26,
    scale: 1.15,
    icon: 'assets/weapons/allowance.svg'
  },
  smg: {
    weaponId: 'sideHustle',
    name: 'The Side Hustle',
    class: 'SMG',
    role: 'RAPID CQB',
    asset: 'assets/weapons/sideHustle.svg',
    asset3d: 'assets/weapons/sideHustle_3d.png',
    angle: -28,
    scale: 1.1,
    icon: 'assets/weapons/sideHustle.svg'
  },
  shotgun: {
    weaponId: 'divorceSettlement',
    name: 'The Divorce Settlement',
    class: 'SHOTGUN',
    role: 'HEAVY BREACH',
    asset: 'assets/weapons/divorceSettlement.svg',
    asset3d: 'assets/weapons/divorceSettlement_3d.png',
    angle: -28,
    scale: 1.2,
    icon: 'assets/weapons/divorceSettlement.svg'
  },
  sniper: {
    weaponId: 'trustFund',
    name: 'The Trust Fund',
    class: 'SNIPER',
    role: 'PRECISION MARKSMAN',
    asset: 'assets/weapons/trustFund.svg',
    asset3d: 'assets/weapons/trustFund_3d.png',
    angle: -30,
    scale: 1.28,
    icon: 'assets/weapons/trustFund.svg'
  },
  lmg: {
    weaponId: 'subdivision',
    name: 'The Subdivision',
    class: 'LMG',
    role: 'AREA SUPPRESSION',
    asset: 'assets/weapons/subdivision.svg',
    asset3d: 'assets/weapons/subdivision_3d.png',
    angle: -28,
    scale: 1.22,
    icon: 'assets/weapons/subdivision.svg'
  },
  pistol: {
    weaponId: 'permit',
    name: 'The Building Permit',
    class: 'PISTOL',
    role: 'TACTICAL SIDEARM',
    asset: 'assets/weapons/permit.svg',
    asset3d: 'assets/weapons/permit_3d.png',
    angle: -24,
    scale: 1.05,
    icon: 'assets/weapons/permit.svg'
  }
};

export const FACTION_LOADOUTS = {
  karens: { loadout: 'default', ...WEAPON_DEFINITIONS.ar },
  hoaDads: { loadout: 'default', ...WEAPON_DEFINITIONS.ar },
  tradwives: { loadout: 'shotgun', ...WEAPON_DEFINITIONS.shotgun },
  rednecks: { loadout: 'shotgun', ...WEAPON_DEFINITIONS.shotgun },
  gymRats: { loadout: 'shotgun', ...WEAPON_DEFINITIONS.shotgun },
  furries: { loadout: 'smg', ...WEAPON_DEFINITIONS.smg },
  brainRot: { loadout: 'smg', ...WEAPON_DEFINITIONS.smg },
  valleyGirls: { loadout: 'smg', ...WEAPON_DEFINITIONS.smg },
  cloutStreamers: { loadout: 'smg', ...WEAPON_DEFINITIONS.smg },
  fratHouse: { loadout: 'smg', ...WEAPON_DEFINITIONS.smg },
  trumpers: { loadout: 'lmg', ...WEAPON_DEFINITIONS.lmg },
  wallstreetBets: { loadout: 'sniper', ...WEAPON_DEFINITIONS.sniper },
  fabulous: { loadout: 'sniper', ...WEAPON_DEFINITIONS.sniper },
  pickleballRetirees: { loadout: 'pistol', ...WEAPON_DEFINITIONS.pistol },
  wokeLibs: { loadout: 'default', ...WEAPON_DEFINITIONS.ar },
  animeWeebs: { loadout: 'default', ...WEAPON_DEFINITIONS.ar },
};

export const FEATURED_RIVALRIES = [
  ['karens', 'wallstreetBets'],
  ['tradwives', 'wokeLibs'],
  ['hoaDads', 'furries'],
  ['pickleballRetirees', 'fratHouse'],
  ['trumpers', 'fabulous'],
  ['gymRats', 'animeWeebs'],
];

export function getFeaturedRivalry(weekNumber = null) {
  const week = weekNumber != null ? weekNumber : Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  return FEATURED_RIVALRIES[Math.abs(week) % FEATURED_RIVALRIES.length];
}

export function pickBotFaction({ rng, pool, team, featuredRivalry = null, bias = 0.5 }) {
  if (featuredRivalry && rng() < bias) {
    const candidate = team === 0 ? featuredRivalry[0] : featuredRivalry[1];
    if (pool.includes(candidate)) return candidate;
  }
  return pool[Math.floor(rng() * pool.length)];
}

let menuPage = 0;
export const FACTIONS_PER_PAGE = 6;

export function buildMenu() {
  const box = $('factions');
  const pag = $('factionPagination');
  if (!box) return;

  const demoActive = isDemo || (typeof window !== 'undefined' && (window.__HOA_DEMO__ === true || new URLSearchParams(window.location?.search || '').get('demo') === '1'));
  const allFactionIds = Object.keys(factions);
  const displayFactions = demoActive
    ? [...DEMO_FACTIONS, ...allFactionIds.filter(id => !DEMO_FACTIONS.includes(id))]
    : shippingFactions;

  const totalPages = Math.ceil(displayFactions.length / FACTIONS_PER_PAGE);
  const curIdx = displayFactions.indexOf(state.faction);
  if (curIdx >= 0) {
    menuPage = Math.floor(curIdx / FACTIONS_PER_PAGE);
  }
  menuPage = Math.max(0, Math.min(totalPages - 1, menuPage));

  function renderPage() {
    box.innerHTML = '';
    const startIdx = menuPage * FACTIONS_PER_PAGE;
    const pageFactions = displayFactions.slice(startIdx, startIdx + FACTIONS_PER_PAGE);
    for (const id of pageFactions) {
      const f = factions[id];
      const el = document.createElement('div');
      const isLocked = demoActive && !DEMO_FACTIONS.includes(id);
      const isSel = id === state.faction;
      const wpn = FACTION_LOADOUTS[id] || { ...WEAPON_DEFINITIONS.ar, loadout: 'default' };
      const wpnSrc = wpn.asset; // Always 2D vector art
      const cryRaw = f.lines?.roundStart?.clean?.[0] || f.lines?.kill?.clean?.[0] || '';
      const cry = typeof cryRaw === 'object' ? (cryRaw.t || cryRaw.alt || '') : cryRaw;
      const tagline = f.tagline || 'Defend the cul-de-sac at all costs.';

      const cardInner = `
        <div class="fc-stage" style="background: radial-gradient(circle at 50% 35%, ${f.look.accent}30 0%, rgba(9,14,26,0.96) 85%);">
          ${isLocked ? '<div class="fc-stage-badges"><span class="demo-lock">🔒 STEAM ONLY</span></div>' : ''}

          <div class="fc-visuals">
            <div class="fc-wpn-hero-wrap">
              <img class="fc-wpn-hero-img" src="${wpnSrc}" alt="" style="--wpn-angle:${wpn.angle}deg; --wpn-scale:${wpn.scale};" loading="lazy">
            </div>
            <div class="fc-char-hero-wrap">
              <img class="fc-char-img" src="assets/characters/${id}.png" alt="${f.name}" loading="lazy">
            </div>
          </div>
          <div class="fc-gun-tag">${wpn.class || 'AR'}</div>
        </div>

        <div class="fc-info">
          <div class="fc-info-header">
            <div class="fc-name-group">
              <span class="fc-dot" style="background:${f.look.accent};"></span>
              <b class="fc-name">${f.name}</b>
            </div>
          </div>
          <div class="fc-tagline" title="${tagline}">“${tagline}”</div>
          <div class="fc-cry" title="${cry}">🗣️ “${cry}”</div>
        </div>
      `;

      if (isLocked) {
        el.className = 'fc fc-card locked';
        el.innerHTML = cardInner;
        el.onclick = () => showDemoModal(f.name, f.tagline);
      } else {
        el.className = 'fc fc-card' + (isSel ? ' sel' : '');
        el.style.borderColor = isSel ? '#ffec27' : f.look.accent;
        el.innerHTML = cardInner;
        el.onclick = () => { state.faction = id; buildMenu(); };
      }
      box.appendChild(el);
    }
    if (pag) {
      const pageNum = menuPage + 1;
      pag.innerHTML = `
        <button type="button" class="page-btn" id="fcPrev" ${menuPage === 0 ? 'disabled' : ''} aria-label="Previous factions">◀ Prev</button>
        <span>Page ${pageNum} of ${totalPages}</span>
        <button type="button" class="page-btn" id="fcNext" ${menuPage >= totalPages - 1 ? 'disabled' : ''} aria-label="Next factions">Next ▶</button>
      `;
      const prevBtn = $('fcPrev');
      const nextBtn = $('fcNext');
      if (prevBtn) prevBtn.onclick = (e) => { e.stopPropagation(); if (menuPage > 0) { menuPage--; renderPage(); } };
      if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); if (menuPage < totalPages - 1) { menuPage++; renderPage(); } };
    }
  }

  renderPage();

  const selF = factions[state.faction] || factions.karens;
  const isLocked = demoActive && !DEMO_FACTIONS.includes(state.faction);
  const depBtn = $('deploy');
  if (depBtn) {
    if (isLocked) {
      depBtn.textContent = '🔒 LOCKED IN DEMO (WISHLIST ON STEAM)';
      depBtn.classList.add('btn-locked');
      depBtn.onclick = () => showDemoModal(selF.name, selF.tagline);
    } else {
      depBtn.textContent = `▶ DEPLOY AS ${selF.name.toUpperCase()}`;
      depBtn.classList.remove('btn-locked');
      depBtn.onclick = () => startGame();
    }
  }

  syncOnlineButtons(demoActive && !DEMO_FACTIONS.includes(state.faction));
  if ($('careerRankBadge')) {
    const rInfo = career.getRankInfo();
    const capNote = rInfo.cappedInDemo ? ' 🔒 (MAX IN DEMO)' : rInfo.nextRank ? ` (${rInfo.xp}/${rInfo.nextRank.xp} XP)` : ' (MAX)';
    $('careerRankBadge').textContent = `${rInfo.current.badge} RANK ${rInfo.current.rank}: ${rInfo.current.title.toUpperCase()}${capNote}`;
  }
  if ($('optSteam')) $('optSteam').checked = state.script === 'steam';
  if ($('optLegal')) $('optLegal').checked = state.legalSafe;
  if ($('optRetro')) $('optRetro').checked = state.retro;
  if ($('optStyle')) $('optStyle').value = state.style;
  if ($('opt007')) $('opt007').checked = state.style === '007';
  if ($('optVoice')) $('optVoice').checked = state.voice;
  if ($('optDifficulty')) $('optDifficulty').value = state.difficulty;
  if ($('optMap')) $('optMap').value = state.map;
  if ($('mutBigHead')) $('mutBigHead').checked = !!state.mutators.bigHead;
  if ($('mutShotguns')) $('mutShotguns').checked = !!state.mutators.shotgunsOnly;
  if ($('mutLowGrav')) $('mutLowGrav').checked = !!state.mutators.lowGrav;
  if ($('mutTurbo')) $('mutTurbo').checked = !!state.mutators.turbo;
  if ($('optGoldSkin')) $('optGoldSkin').checked = !!state.goldSkin;
  if ($('optMode')) $('optMode').innerHTML = Object.values(MODES).map(M => `<option value="${M.id}"${M.id === state.mode ? ' selected' : ''}>${M.label} (${M.parent})</option>`).join('');
  updateMatchSettingsSummary();
}

function updateMatchSettingsSummary() {
  const sumEl = $('matchSettingsSummary');
  if (!sumEl) return;
  const mDef = MODES[state.mode];
  const mapDef = MAPS[state.map];
  const mLabel = mDef ? mDef.label.replace('Cul-de-sac ', '') : 'Clash';
  const mapLabel = mapDef ? mapDef.name.replace('Oakridge ', '').replace(' Club', '').replace('Sunset ', '') : 'Cul-de-Sac';
  const diffLabel = state.difficulty === 'easy' ? 'Easy' : state.difficulty === 'hard' ? 'Hard' : 'Med';
  sumEl.textContent = `${mLabel} · ${mapLabel} · ${diffLabel}`;
}

if ($('btnMatchSettings')) {
  $('btnMatchSettings').onclick = () => { $('matchSettingsModal')?.classList.remove('hidden'); };
}
if ($('closeMatchSettings')) {
  $('closeMatchSettings').onclick = () => { $('matchSettingsModal')?.classList.add('hidden'); };
}
if ($('saveMatchSettings')) {
  $('saveMatchSettings').onclick = () => { $('matchSettingsModal')?.classList.add('hidden'); };
}
if ($('matchSettingsModal')) {
  $('matchSettingsModal').onclick = (e) => {
    if (e.target === $('matchSettingsModal')) $('matchSettingsModal').classList.add('hidden');
  };
}

if ($('optMode')) $('optMode').onchange = e => { state.mode = e.target.value; updateMatchSettingsSummary(); };
if ($('optDifficulty')) $('optDifficulty').onchange = e => { state.difficulty = e.target.value; updateMatchSettingsSummary(); };
if ($('optMap')) {
  $('optMap').onchange = e => {
    const val = e.target.value;
    const demoActive = isDemo || (typeof window !== 'undefined' && (window.__HOA_DEMO__ === true || new URLSearchParams(window.location?.search || '').get('demo') === '1'));
    const mDef = MAPS[val];
    if (mDef?.wip) { e.target.value = state.map; return; } // not built yet (see map.js)
    if (demoActive && mDef && !mDef.freeInDemo) {
      e.target.value = 'culdesac';
      state.map = 'culdesac';
      showDemoModal(mDef.name, mDef.tagline);
      return;
    }
    state.map = val;
    updateMatchSettingsSummary();
  };
}
if ($('mutBigHead')) $('mutBigHead').onchange = e => { state.mutators.bigHead = e.target.checked; };
for (const [elId, mutKey, label, tagline] of [
  ['mutShotguns', 'shotgunsOnly', 'Shotguns Only Mutator', 'Divorce Settlements only — pure close-quarters chaos!'],
  ['mutLowGrav', 'lowGrav', 'Low-Gravity Moon Shoes', 'Bounce over roofs and air-strafe the cul-de-sac!'],
  ['mutTurbo', 'turbo', '2x Turbo Speed', 'Double movement speed for high-octane suburban arena action!'],
]) {
  if ($(elId)) {
    $(elId).onchange = e => {
      const demoActive = isDemo || (typeof window !== 'undefined' && (window.__HOA_DEMO__ === true || new URLSearchParams(window.location?.search || '').get('demo') === '1'));
      if (demoActive && e.target.checked) {
        e.target.checked = false;
        state.mutators[mutKey] = false;
        showDemoModal(label, tagline);
        return;
      }
      state.mutators[mutKey] = e.target.checked;
    };
  }
}
if ($('optGoldSkin')) {
  $('optGoldSkin').onchange = e => {
    const demoActive = isDemo || (typeof window !== 'undefined' && (window.__HOA_DEMO__ === true || new URLSearchParams(window.location?.search || '').get('demo') === '1'));
    if (demoActive && e.target.checked) {
      e.target.checked = false;
      state.goldSkin = false;
      showDemoModal('24K Gold Weapon Skins', 'Flex on the HOA Board with solid 24-karat gold viewmodels!');
      return;
    }
    state.goldSkin = e.target.checked;
    renderer?.setGoldSkin?.(state.goldSkin);
  };
}
if ($('optStyle')) $('optStyle').onchange = e => { applyStyle(e.target.value, state, renderer, $); };
if ($('optSteam')) $('optSteam').onchange = e => { state.script = e.target.checked ? 'steam' : 'clean'; };
if ($('optLegal')) $('optLegal').onchange = e => { state.legalSafe = e.target.checked; };
if ($('optRetro')) $('optRetro').onchange = e => { state.retro = e.target.checked; renderer?.setRetro(state.retro); };
if ($('opt007')) $('opt007').onchange = e => { applyStyle(e.target.checked ? '007' : 'modern', state, renderer, $); };
if ($('optVoice')) $('optVoice').onchange = e => { state.voice = e.target.checked; };
if ($('optMuteSound')) {
  $('optMuteSound').onchange = e => {
    sfx.setMute?.(e.target.checked);
    if ($('btnPauseMute')) $('btnPauseMute').textContent = e.target.checked ? '🔇 UNMUTE' : '🔊 MUTE SOUND';
  };
}
if ($('btnResume')) $('btnResume').onclick = () => { if (input) { input.userPaused = false; lock(); } };
if ($('btnPauseMute')) $('btnPauseMute').onclick = () => {
  const isMuted = sfx.toggleMute?.();
  $('btnPauseMute').textContent = isMuted ? '🔇 UNMUTE' : '🔊 MUTE SOUND';
  if ($('optMuteSound')) $('optMuteSound').checked = isMuted;
};
if ($('deploy')) $('deploy').onclick = () => startGame();
if ($('toMenu')) $('toMenu').onclick = () => toMenu();
if ($('closeDemoModal')) $('closeDemoModal').onclick = () => hideDemoModal();
if ($('demoModal')) {
  $('demoModal').addEventListener('click', e => {
    if (e.target === $('demoModal')) hideDemoModal();
  });
}
export function tryEnterFullscreen(lockLandscape = false, allowIframeBreakout = false) {
  if (typeof document === 'undefined') return;
  try {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
      const p = req.call(el);
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (lockLandscape) screen.orientation?.lock?.('landscape')?.catch?.(() => {});
        }).catch(() => {
          if (allowIframeBreakout && typeof window !== 'undefined' && window.self !== window.top) {
            try { window.top.location.href = window.location.href; } catch { window.open(window.location.href, '_top'); }
          }
        });
      }
    } else if (!req && allowIframeBreakout && typeof window !== 'undefined' && window.self !== window.top) {
      // iOS Safari on iPhone does not support Fullscreen API on HTML elements;
      // breaking out of the itch.io wrapper iframe removes the outer page chrome.
      try { window.top.location.href = window.location.href; } catch { window.open(window.location.href, '_top'); }
    } else if (lockLandscape) {
      screen.orientation?.lock?.('landscape')?.catch?.(() => {});
    }
  } catch {}
  try { window.scrollTo(0, 1); } catch {}
}

if ($('btnFullscreen')) {
  $('btnFullscreen').onclick = () => {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        tryEnterFullscreen(true, true);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document);
      }
    } catch {}
  };
}
if ($('btnRotateFullscreen')) {
  $('btnRotateFullscreen').onclick = () => tryEnterFullscreen(true);
}
if ($('btnPlayPortrait')) {
  $('btnPlayPortrait').onclick = () => {
    document.body.classList.add('allow-portrait');
    tryEnterFullscreen(false);
    renderer?.resize();
  };
}

// ------------------------------------------------------------------ online lobby

const isLocalHost = h => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local$)/.test(h || '');

/** wss:// URL of the multiplayer server, or null when there isn't one (online buttons stay disabled). */
export function onlineServerUrl() {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  let url = (isLocalHost(host) && params.get('server')) || demoConfig?.serverUrl || null; // ?server= only for local testing
  if (!url && isLocalHost(host)) url = `ws://${host}:8080/ws`; // npm run online
  return url ? String(url).replace(/^http/, 'ws') : null;
}

/** Online buttons live in the top bar (always visible). Disabled until a server exists; locked demo factions can't queue. */
function syncOnlineButtons(factionLocked) {
  const available = !!onlineServerUrl();
  for (const id of ['btnQuickMatch', 'btnFriends']) {
    const b = $(id);
    if (b) b.disabled = !available || factionLocked;
  }
  const n = $('onlineNote');
  if (n && !n.classList.contains('online-note-warn')) {
    n.textContent = !available ? 'Online play is launching soon. Bots for now!'
      : factionLocked ? 'Pick an unlocked faction to play online.'
      : 'Online: 8 players per room, bots fill empty seats.';
  }
}
if ($('btnQuickMatch')) $('btnQuickMatch').onclick = () => startOnline('auto');
if ($('btnFriends')) $('btnFriends').onclick = () => openRoomModal();

/** Free hosts put idle servers to sleep. Poke it while the player is still picking a faction. */
function prewarmServer() {
  const base = onlineServerUrl();
  if (!base || typeof location === 'undefined' || isLocalHost(location.hostname)) return;
  try { fetch(base.replace(/^ws/, 'http').replace(/\/ws.*$/, '/'), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch {}
}
prewarmServer();

const NAME_KEY = 'hoa.name';
function playerName() {
  const raw = ($('optName')?.value || params.get('name') || '').trim();
  const name = raw.normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 20) || `Karen${100 + Math.floor(Math.random() * 900)}`;
  try { localStorage.setItem(NAME_KEY, name); } catch {}
  return name;
}

function setOnlineNote(text) {
  const n = $('onlineNote');
  if (n) { n.textContent = text; n.classList.add('online-note-warn'); }
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O
const newRoomCode = () => Array.from({ length: 4 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');

let connectToken = 0;
async function startOnline(room = 'auto') {
  const base = onlineServerUrl();
  if (!base) return;
  const token = ++connectToken;
  $('onlineNote')?.classList.remove('online-note-warn');
  $('roomModal')?.classList.add('hidden');
  hideDemoModal();
  $('menu').classList.add('hidden');
  $('connecting').classList.remove('hidden');
  $('connectingMsg').textContent = room === 'auto' ? 'Finding a match…' : `Joining room ${room}…`;
  sfx.unlock();
  const wakeNote = setTimeout(() => { if (token === connectToken) $('connectingMsg').textContent = 'Waking the server up… the first player of the day can wait up to a minute.'; }, 4000);
  try {
    const u = new URL(base, location.href);
    u.searchParams.set('room', room);
    const session = await OnlineSession.join({ url: u.toString(), name: playerName(), faction: state.faction, timeoutMs: 60000, knownFactions: Object.keys(factions) });
    clearTimeout(wakeNote);
    if (token !== connectToken) { session.close(); return; }
    $('connecting').classList.add('hidden');
    startGame(session);
    reportRoom(session);
  } catch (err) {
    clearTimeout(wakeNote);
    if (token !== connectToken) return;
    $('connecting').classList.add('hidden');
    $('menu').classList.remove('hidden');
    buildMenu();
    setOnlineNote(err?.message === 'room_full'
      ? 'That room is full. Try Quick Match, or make your own room.'
      : "Couldn't reach the online server. Try again, or deploy against bots.");
  }
}

function openRoomModal(prefill = '') {
  const m = $('roomModal');
  if (!m) return;
  m.classList.remove('hidden');
  if ($('joinCode')) { $('joinCode').value = prefill; }
  $('roomInvite').textContent = prefill ? `You were invited to room ${prefill}. Pick a name and join!` : 'Make a private room and send friends the link, or join one with a code.';
}
if ($('btnCreateRoom')) $('btnCreateRoom').onclick = () => startOnline(newRoomCode());
if ($('btnJoinRoom')) $('btnJoinRoom').onclick = () => {
  const code = ($('joinCode').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (code) startOnline(code);
};
if ($('joinCode')) $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoinRoom').click(); });
if ($('closeRoomModal')) $('closeRoomModal').onclick = () => $('roomModal').classList.add('hidden');
if ($('cancelConnect')) $('cancelConnect').onclick = () => { connectToken++; $('connecting').classList.add('hidden'); $('menu').classList.remove('hidden'); };
if ($('btnInvite')) $('btnInvite').onclick = async () => {
  const s = game?.session;
  if (!s) return;
  const cgLink = portal.inviteLink(s.roomCode);
  const link = cgLink || s.inviteLink(funnel.shareLink());
  // itch.io and most portals don't pass ?room= into the game's iframe, so the code travels in the text too
  const text = cgLink ? `Join my Call of Karen room!` : `Join my Call of Karen room ${s.roomCode}: open the game, tap FRIENDS, enter ${s.roomCode}.`;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Join my Call of Karen room', text, url: link });
    else { await navigator.clipboard.writeText(`${text} ${link}`); $('btnInvite').textContent = '✓ INVITE COPIED'; setTimeout(() => { $('btnInvite').textContent = '🔗 COPY INVITE LINK'; }, 2000); }
  } catch { window.prompt('Send this to your friends:', `${text} ${link}`); }
};
if ($('optName')) {
  try { $('optName').value = localStorage.getItem(NAME_KEY) || params.get('name') || ''; } catch { $('optName').value = params.get('name') || ''; }
}

// CrazyGames: show their username, follow their invite / instant-multiplayer / join-room flows.
portal.ready.then(async ok => {
  if (!ok) return;
  const cgName = await portal.username();
  if (cgName && $('optName')) $('optName').value = cgName;
  portal.onJoinRoom(room => startOnline(room.toUpperCase()));
  if (!onlineServerUrl()) return;
  const invited = portal.invitedRoom();
  if (invited) startOnline(String(invited).toUpperCase());           // friend's invite: straight in, no onboarding
  else if (portal.instantMultiplayer) startOnline(newRoomCode());    // Instant Multiplayer: private room, joinable at once
});

/** Keep CrazyGames' "join friend" button accurate (room code, still has a free human seat). */
function reportRoom(session) {
  if (!session) return;
  portal.updateRoom(session.roomCode, session.players.filter(p => !p.bot).length < 8);
}

function toMenu() {
  portal.gameplayStop();
  connectToken++;
  if (game) game.dispose();
  game = null;
  document.exitPointerLock?.();
  for (const id of ['hud', 'pause', 'end', 'connecting']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  buildMenu();
  sfx.startAmbience?.();
}

// ------------------------------------------------------------------ game

class Game {
  /** @param {OnlineSession|null} session an online match; null = offline vs bots */
  constructor(session = null) {
    this.session = session;
    const seed = Number(params.get('seed')) || (Date.now() % 100000);
    this.rng = mulberry32(seed);
    // Camera shake / recoil / hit markers. Seeded with the match seed so `?seed=N` replays shake the same
    // way, which the video tooling and bug reports depend on. render.js adds the offsets to the camera.
    this.juice = createJuice({ seed });
    if (renderer) renderer.juice = this.juice;
    this.library = new ContentLibrary(content, { script: state.script, legalSafe: state.legalSafe });
    const activeMap = buildMap(state.map);
    if (renderer) renderer.setMap(activeMap);
    this.sim = new Sim({
      rules: content.rules,
      weapons: weaponsData,
      rng: this.rng,
      map: activeMap,
      mode: state.mode,
      difficulty: state.difficulty,
      botDifficulty: params.get('bots') || undefined,
      mutators: state.mutators,
      isDemo,
    });
    this.barks = new BarkSystem({ library: this.library, content, rng: this.rng, sim: this.sim });
    this.limiter = new AudioLimiter(content.rules.audioLimiter);
    this.hud = new Hud({ $, factions, weaponsData });
    if (viewCanvas && !state.spectate) this.hud.startClipRecorder?.(viewCanvas);
    voice.enabled = state.voice;

    const names = [...content.playerNames].sort(() => this.rng() - 0.5);
    const demoActive = isDemo || (typeof window !== 'undefined' && (window.__HOA_DEMO__ === true || new URLSearchParams(window.location?.search || '').get('demo') === '1'));
    const pool = demoActive ? DEMO_FACTIONS : shippingFactions;
    const weeklyRivalry = getFeaturedRivalry();
    const pickFaction = (team) => pickBotFaction({ rng: () => this.rng(), pool, team, featuredRivalry: weeklyRivalry });
    if (session) {
      // Online: the server runs the match; this Sim is a mirror that is only written into (see online.js).
      this.me = session.buildMirror(this.sim);
    } else {
      const myLoadout = FACTION_LOADOUTS[state.faction]?.loadout || 'default';
      const customName = ($('optName')?.value || params.get('name') || '').trim();
      const myName = customName ? playerName() : 'You';
      this.me = this.sim.addActor({ id: 'you', name: myName, team: 0, faction: state.faction, loadout: myLoadout, isBot: state.spectate });
      for (let i = 0; i < 11; i++) {
        const team = i < 5 ? 0 : 1;
        const botFaction = pickFaction(team);
        const botLoadout = FACTION_LOADOUTS[botFaction]?.loadout || 'default';
        this.sim.addActor({ id: 'b' + i, name: names[i], team, faction: botFaction, loadout: botLoadout, isBot: true });
      }
    }
    for (const a of this.sim.actors) renderer.ensureCharacter(a, this.me.team);

    const initW = this.me?.weapons?.[this.me.activeSlot || 'primary'] || this.me?.weapons?.primary;
    if (initW?.viewmodel && renderer?.setWeapon) {
      renderer.setWeapon(initW.viewmodel);
      renderer.weaponSwitchT = 0; // no switch animation on initial spawn
    }
    renderer?.setGoldSkin?.(state.goldSkin);

    this.frames = [];
    this.hearing = { priority: -1, until: 0 };
    // Conversation queue: barks play one at a time, back-and-forth like two
    // streamers, instead of talking over each other. Filled by onBark(),
    // drained by updateVoiceQueue() once per frame.
    this.voiceQueue = [];
    this._voiceWasBusy = false;
    this._voiceGapUntil = 0;
    // Ambient chatter: quiet back-and-forth banter when nothing else is talking.
    this.chatter = new ChatterDirector({ rng: this.rng });
    this.realTime = 0;
    this.radar = $('radar') ? new Radar($('radar')) : null;
    this.meFiredThisStep = false;
    this.netInfoAt = 0;
    this.disconnected = false;

    if (!session) {
      this.sim.start();
      this.handle(this.sim.drainEvents());
    }
  }

  showBanner(text, small = '') { this.hud.showBanner(text, small); }

  dispose() {
    this.hud.stopClipRecorder?.();
    if (this.session) {
      portal.leftRoom();
      this.session.close();
      this.session = null;
      for (const id of ['nextMatch', 'netInfo']) $(id)?.classList.add('hidden');
    }
    this.hud.reset();
    for (const c of renderer.characters.values()) renderer.scene.remove(c.root);
    renderer.characters.clear();
    for (const r of renderer.ragdolls) r.dispose();
    renderer.ragdolls = [];
    for (const f of renderer.fx) renderer.scene.remove(f.obj);
    renderer.fx = [];
    if (renderer.casings) {
      for (const c of renderer.casings) {
        renderer.scene.remove(c.mesh);
        c.mesh.material.dispose();
      }
      renderer.casings = [];
    }
    renderer.updateGrenades([]);
    renderer.updateObjects([], 0);
    renderer.updateMowers?.([], 0);
    $('bubbles').innerHTML = ''; $('feed').innerHTML = ''; $('subs').innerHTML = '';
    voice.stop();
  }

  // -------------------------------------------------------------- per-frame

  update(dt) {
    this.realTime += dt;
    // Every per-frame path below reads `sim` (and updateOnline builds its own
    // alias the same way). Without this alias the whole update() threw
    // "sim is not defined" on the first frame and the canvas stayed black.
    const sim = this.sim;
    this.juice.update(dt);
    const isAuto = params.get('auto') === '1' || params.get('autostart') === '1';
    const paused = !state.spectate && !input.engaged && !sim.over && !isAuto;
    const showPause = paused && !this.hud.killcam && $('menu').classList.contains('hidden');
    $('pause').classList.toggle('hidden', !showPause);
    if (showPause) $('pauseHint').textContent = PAUSE_HINT[input.device];
    document.body.classList.toggle('touch-mode', input.device === 'touch');
    if (!paused && !sim.over && $('menu').classList.contains('hidden')) portal.gameplayStart(); else portal.gameplayStop();
    if (this.session) {
      this.updateOnline(dt, paused);
    } else if (!paused) {
      if (!this.me.isBot) {
        const isEasyLock = state.difficulty === 'easy';
        const assist = (input.device === 'mouse' && !isEasyLock)
          ? { slow: 1, onTarget: false, locked: false }
          : aimAssist(sim, this.me, { lockOn: isEasyLock });
        input.assist = assist.slow;
        input.onTarget = assist.onTarget;
        input.lockTarget = assist.locked ? { yaw: assist.lockYaw, pitch: assist.lockPitch } : null;
        input.apply(this.me, dt);
      }
      this.acc = Math.min((this.acc || 0) + dt, FIXED * 5);
      while (this.acc >= FIXED) {
        this.acc -= FIXED;
        sim.step(FIXED);
        const evs = sim.drainEvents();
        this.frames.push({ t: sim.time, snap: sim.snapshot(), shots: evs.filter(e => e.type === 'shot') });
        while (this.frames.length && this.frames[0].t < sim.time - KILLCAM_SEC - 1) this.frames.shift();
        this.handle(evs);
      }
    }

    const ann = this.barks.updateAnnouncer(sim.time, sim.time < this.hearing.until ? this.hearing.priority : -1);
    if (ann) {
      if (voice.say({ text: ann, priority: 9, force: true, announcer: true })) this.chatter.notifyVoicePlayed(sim.time);
      this.showBanner(ann);
    }
    this.updateVoiceQueue();
    this.updateChatter(sim.time);

    if (this.hud.killcam) this.hud.updateKillcam(dt, sim, renderer, voice);
    else {
      renderer.applySnapshot(sim.snapshot(), dt, { hideId: this.me.isBot ? null : this.me.id, sim, now: sim.time });
      const me = this.me;
      const curVm = me.weapons?.[me.activeSlot || 'primary']?.viewmodel;
      if (curVm && renderer.setWeapon && renderer.activeWeapon !== curVm) {
        renderer.setWeapon(curVm);
      }
      if (state.spectate) {
        const t = this.me.brain?.target;
        if (me.alive) renderer.chase(me.pos, t?.alive ? t.pos : { x: me.pos.x - Math.sin(me.yaw) * 10, y: me.pos.y, z: me.pos.z - Math.cos(me.yaw) * 10 });
        else renderer.orbit(sim.time);
      } else if (me.alive) {
        renderer.firstPerson(me, dt, {
          moving: Math.hypot(me.vel.x, me.vel.z) > 1 && me.onGround, firing: sim.time < me.firingUntil,
          reloading: me.reloadUntil > 0, meleeAgo: sim.time - me.meleeAt, alive: true,
          shotFired: this.meFiredThisStep,
        });
        this.meFiredThisStep = false;
      } else {
        renderer.chase({ x: me.pos.x, y: me.pos.y + 4, z: me.pos.z + 3 }, me.pos, 4);
      }
    }
    renderer.updateGrenades(sim.grenades);
    renderer.updateObjects(sim.mode.objects, this.me.team);
    renderer.updateHelicopters(sim.helicopters, dt);
    renderer.updateFx(dt);
    renderer.render();
    this.hud.update({ sim, me: this.me, state, renderer, input, voice, sfx, library: this.library, radar: this.radar, realTime: this.realTime });
  }

  /** One frame of an online match: send input, predict, apply server state, feed events to the usual handler. */
  updateOnline(dt, paused) {
    const s = this.session, sim = this.sim;
    const change = s.syncRoster();
    if (change) this.onRosterChange(change);
    const me = this.me;
    if (!paused) {
      const isEasyLock = state.difficulty === 'easy';
      const assist = (input.device === 'mouse' && !isEasyLock)
        ? { slow: 1, onTarget: false, locked: false }
        : aimAssist(sim, me, { lockOn: isEasyLock });
      input.assist = assist.slow;
      input.onTarget = assist.onTarget;
      input.lockTarget = assist.locked ? { yaw: assist.lockYaw, pitch: assist.lockPitch } : null;
      input.apply(me, dt);
    }
    s.step(dt, !paused);
    const evs = s.takeEvents();
    this.frames.push({ t: sim.time, snap: sim.snapshot(), shots: evs.filter(e => e.type === 'shot') });
    while (this.frames.length && this.frames[0].t < sim.time - KILLCAM_SEC - 1) this.frames.shift();
    if (evs.length) this.handle(evs);

    // connection info + countdown to the next match
    const next = $('nextMatch');
    if (next) {
      const wait = s.over && s.restartIn != null;
      next.classList.toggle('hidden', !wait);
      if (wait) next.textContent = `NEXT MATCH IN ${Math.ceil(s.restartIn)}s`;
    }
    if (this.realTime >= this.netInfoAt && $('netInfo')) {
      this.netInfoAt = this.realTime + 0.5;
      const ni = $('netInfo');
      ni.classList.remove('hidden');
      ni.textContent = `🌐 ${s.roomCode} · ${s.latency} ms · ${s.players.filter(p => !p.bot).length} online`;
      ni.className = s.latency > 160 ? 'net-bad' : s.latency > 90 ? 'net-ok' : 'net-good';
    }
    if (!s.connected && !this.disconnected) {
      this.disconnected = true;
      this.showBanner('DISCONNECTED', 'Lost connection to the server');
      setTimeout(() => { if (game === this) { toMenu(); setOnlineNote('Lost connection to the server. Try again, or play vs bots.'); } }, 2500);
    }
  }

  /** Players joined/left (bots swap seats) or a new match started: keep characters and bark state in step. */
  onRosterChange({ added, removed, reset }) {
    reportRoom(this.session);
    for (const id of removed) {
      const c = renderer.characters.get(id);
      if (c) { renderer.scene.remove(c.root); renderer.characters.delete(id); }
    }
    this.me = this.session.me;
    for (const a of added) renderer.ensureCharacter(a, this.me.team);
    if (reset) {
      this.barks = new BarkSystem({ library: this.library, content, rng: this.rng, sim: this.sim });
      this.frames = [];
      this.hud.reset();
      $('end')?.classList.add('hidden');
      this.showBanner('NEW MATCH', 'Fight for the block!');
    }
  }

  handle(evs) {
    const sim = this.sim, me = this.me, now = sim.time;
    const out = this.barks.process(evs, now, me.id);
    const live = !this.hud.killcam;
    const shotAudioByActor = new Set();
    let meHitAny = false;
    let meHitHead = false;
    for (const e of evs) {
      const a = e.id ? sim.byId.get(e.id) : null;
      switch (e.type) {
        case 'heloShot': {
          const col = '#ffec27';
          if (live) { renderer.tracer(e.from, e.to, col); renderer.impact(e.to, col); }
          const d = Math.hypot(e.from.x - me.pos.x, e.from.z - me.pos.z);
          if (d < 50) sfx.shot(0.7 * (1 - d / 50));
          break;
        }
        case 'streakDestroyed': {
          if (live) {
            renderer.explosion(e.pos);
            renderer.debris(e.pos, 18);
          }
          if (e.killerId === me.id) {
            sfx.kill();
            this.showBanner('HELICOPTER DOWN', '+200 HOA AIRSPACE CLEARED');
            this.hud.popScore?.('+200 HELO DOWN!', true);
          }
          break;
        }
        case 'shot': {
          if (!a) break;
          const col = factions[a.faction]?.look?.accent || '#ffec27';
          if (live) { renderer.tracer(e.from, e.to, col); renderer.impact(e.to, col); }
          const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z);
          // Suppression: close enemy fire rattles the camera. Scales with how close the shot was, so a
          // distant firefight does not make your own screen jitter.
          if (a !== me && d < 18) this.juice.add(0.055 * (1 - d / 18));
          const wdef = weaponsData.weapons[e.weaponId];
          const playWeaponSound = (vol = 1) => {
            if (wdef?.class === 'shotgun') sfx.shotgun(vol);
            else if (wdef?.class === 'sniper') sfx.sniper(vol);
            else if (wdef?.class === 'smg') sfx.smg(vol);
            else if (wdef?.class === 'lmg') sfx.lmg(vol);
            else if (wdef?.class === 'pistol') sfx.pistol(vol);
            else sfx.shot(vol);
          };
          if (a === me) {
            if (!e.echo && !shotAudioByActor.has(a.id)) {
              shotAudioByActor.add(a.id);
              playWeaponSound(1);
              haptic(15);
              this.meFiredThisStep = true;
            }
          } else if (d < 40 && !shotAudioByActor.has(a.id)) {
            shotAudioByActor.add(a.id);
            playWeaponSound(0.6 * (1 - d / 40));
          }
          const target = e.hitId ? (sim.byId.get(e.hitId) || sim.helicopters?.find(h => h.id === e.hitId)) : null;
          if (a === me && target && target.team !== me.team) {
            meHitAny = true;
            if (e.head) meHitHead = true;
          }
          break;
        }
        case 'localShot': { // online: our own trigger pull, before the server's 'shot' comes back
          // Firing recoil is not juice.punch(): render.js already carries camRecoil, which is the weapon's
          // viewKick, so adding a second kick on the same event double-counts it.
          const wc = weaponsData.weapons[e.weaponId]?.class;
          if (wc === 'shotgun') sfx.shotgun(1); else if (wc === 'sniper') sfx.sniper(1); else if (wc === 'smg') sfx.smg(1);
          else if (wc === 'lmg') sfx.lmg(1); else if (wc === 'pistol') sfx.pistol(1); else sfx.shot(1);
          haptic(15);
          this.meFiredThisStep = true;
          break;
        }
        case 'hurt':
          if (e.id === me.id) {
            const attacker = e.attackerId ? sim.byId.get(e.attackerId) : null;
            if (attacker && attacker !== me) {
              const relAngle = yawTo(attacker.pos.x - me.pos.x, attacker.pos.z - me.pos.z) - me.yaw;
              this.hud.flashDamage(relAngle);
            } else {
              this.hud.flashVignette();
            }
            haptic(45);
            sfx.hurt();
            this.juice.add(JUICE.takeHit);
          }
          break;
        case 'kill': {
          if (live) renderer.spawnRagdoll(e.victimId, e);
          else renderer.splat(e.victimPos, '#ff004d', 1.1);
          if (e.victimId === me.id && !me.isBot) {
            career.recordDeath();
          }
          if (e.killerId === me.id && !me.isBot) {
            sfx.kill();
            haptic([40, 20, 60]);
            this.juice.add(e.headshot ? JUICE.headshot : JUICE.kill).hit();
            const streak = me.streak || 1;
            const label = e.headshot ? 'HEADSHOT' : e.melee ? 'TROPHY KILL' : streak === 7 ? '🚜 MOWER STAMPEDE!' : streak === 5 ? '🚁 HELICOPTER UNLOCKED!' : streak === 3 ? '🔔 RING CAM UAV!' : '+1 EVICTION';
            this.showBanner(label, streak >= 3 ? `${streak}x CITATION STREAK` : '');
            this.hud.popScore?.(e.headshot ? '★ +150 HEADSHOT FINE!' : e.melee ? '🏆 +150 TROPHY BONK!' : '+100 EVICTED!', !!(e.headshot || e.melee || streak >= 3));
            career.recordKill({
              headshot: !!e.headshot,
              melee: !!e.melee,
              explosive: !!e.explosive,
              streak,
            });
          }
          break;
        }
        case 'carAlarm': {
          const dist = Math.hypot((e.pos?.x || 0) - me.pos.x, (e.pos?.z || 0) - me.pos.z);
          if (dist < 48) sfx.carAlarm?.();
          if (e.attackerId === me.id) {
            this.hud.popScore?.('🚨 SUBURBAN NOISE VIOLATION!', false);
          }
          break;
        }
        case 'uavSweep':
          if (e.ownerId === me.id) {
            this.showBanner('🔔 RING CAM UAV ONLINE', 'All enemy neighbors revealed on radar for 15s!');
          }
          break;
        case 'mowerStampede':
          if (e.ownerId === me.id) {
            this.showBanner('🚜 LAWN MOWER STAMPEDE', '7-Killstreak autonomous riding mowers deployed!');
          }
          break;
        case 'streakLocked':
          if (e.ownerId === me.id) {
            this.showBanner('🔒 7-STREAK: MOWER STAMPEDE', 'Unlock the Autonomous Lawn Mower Stampede in the $4.99 Full Game!');
          }
          break;
        case 'streakDestroyed':
          if (e.killerId === me.id && !me.isBot) {
            this.showBanner('💥 HELICOPTER GROUNDED!', '+250 HOA AIRSPACE ENFORCEMENT');
            this.hud.popScore?.('🚁 +250 HELO DOWN!', true);
            career.unlockAchievement('ACH_HELO_DOWN');
          }
          break;
        case 'explosion': {
          const dExp = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
          if (dExp < 30) this.juice.add(dExp < 12 ? JUICE.explosionNear : JUICE.explosionFar);
          if (live) renderer.explosion(e.pos);
          sfx.boom();
          break;
        }
        case 'boing': if (a === me || Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) < 20) sfx.boing(); break;
        case 'reload': if (a === me) sfx.reload(); break;
        case 'swing': if (a === me) sfx.swing(); break;
        case 'switchWeapon':
          if (a === me) {
            sfx.reload();
            const w = me.weapons[e.slot];
            if (w?.viewmodel && renderer.setWeapon) renderer.setWeapon(w.viewmodel);
          }
          break;
        case 'campingSnitch':
          this.showBanner(a === me ? 'YOU SNITCHED ON YOURSELF' : `${a.name} snitched on themselves`, a === me ? 'Enemies can see you for 6s. Move!' : '');
          if (a === me && !me.isBot) career.unlockAchievement('ACH_CAMP_SNITCH');
          break;
        case 'receiptConfirmed': if (a === me) { sfx.kill(); this.showBanner('RECEIPT CONFIRMED', `${e.victimName} has been processed`); this.hud.popScore?.('🧾 +100 RECEIPT!', true); } break;
        case 'receiptDenied': if (a === me) { sfx.reload(); this.showBanner('RETURN DENIED', `saved ${e.victimName}'s receipt`); } break;
        case 'zoneCaptured':
          if (e.cappers?.includes(me.id) && !me.isBot) {
            career.unlockAchievement('ACH_HOA_PATROL');
            this.hud.popScore?.(`🚩 +150 ZONE ${e.letter}!`, true);
          }
          this.showBanner(`ZONE ${e.letter} SECURED`, `${e.name} captured by ${e.team === me.team ? 'YOUR TEAM' : 'ENEMY'}`);
          break;
        case 'casseroleTaken':
          // The carrier rules (speed burst, steady edge, 20% less damage taken) are invisible unless
          // the player is told: a pickup is the moment to say it.
          if (e.actorId === me.id && !me.isBot) {
            this.showBanner('HOT DISH!', 'Sprint burst, then a steady edge home — tougher skin while you carry');
            this.hud.popScore?.('\ud83e\udd58 CASSEROLE GRABBED \u2014 HAUL IT HOME', true);
            sfx.reload();
          } else if (e.casseroleTeam === me.team) {
            this.showBanner('CASSEROLE STOLEN', 'Chase the carrier down — a dropped dish returns home in 30s');
          }
          break;
        case 'casseroleCaptured':
          if (e.carrierId === me.id && !me.isBot) {
            career.unlockAchievement('ACH_CASSEROLE_THIEF');
            this.hud.popScore?.('🥘 +300 CASSEROLE SECURED!', true);
          }
          this.showBanner(e.team === me.team ? 'CASSEROLE SECURED!' : 'ENEMY SCORED!', e.team === me.team ? 'Brought the hot dish home!' : 'The enemy captured your casserole!');
          break;
        case 'objectiveBark':
          if (e.what === 'noticePosted') {
            if (e.id === me.id && !me.isBot) {
              career.unlockAchievement('ACH_EVICTION');
              this.hud.popScore?.('📄 +200 EVICTION POSTED!', true);
            }
            this.showBanner('EVICTION NOTICE POSTED', `Notice posted at Site ${e.site || 'A'}`);
          } else if (e.what === 'noticeTornDown') {
            if (e.id === me.id && !me.isBot) {
              career.unlockAchievement('ACH_EVICTION');
              this.hud.popScore?.('🛡️ +250 NOTICE DEFUSED!', true);
            }
            this.showBanner('EVICTION DEFUSED', 'The eviction notice was torn down in time!');
          }
          break;
        case 'hardpointRotated': this.showBanner('NEW LAWN ACTIVE', e.name); break;
        case 'matchEnd':
          if (!me.isBot) {
            this.hud.stopClipRecorder?.();
            career.recordMatchEnd({ won: e.winner === me.team, mode: state.mode });
            if (e.winner === me.team) { sfx.victory?.(); portal.happytime(); }
            else sfx.defeat?.();
          }
          setTimeout(() => {
            if (game !== this) return;
            this.hud.showEnd({
              sim, me: this.me, library: this.library, rng: this.rng,
              onAgain: this.session ? () => $('end').classList.add('hidden') : () => startGame(),
              againLabel: this.session ? 'STAY FOR NEXT MATCH' : undefined,
              onMenu: () => toMenu(), voice,
              isDemo, funnel,
            });
          }, 2500);
          break;
      }
    }
    if (meHitAny) {
      this.hud.hitmark(meHitHead ? '★' : '✕', meHitHead);
      sfx.hitmarker();
      haptic(meHitHead ? [25, 15, 35] : 25);
      if (meHitHead) sfx.headshot();
    }
    for (const k of out.kills) this.hud.addFeed(k, sim, me);
    for (const b of out.barks) this.onBark(b, now);
    if (out.killcam) this.hud.startKillcam(out.killcam, evs.find(e => e.type === 'kill' && e.victimId === me.id), sim, renderer, this.frames, voice);
  }

  onBark(b, now) {
    const me = this.me;
    if (b.isFatalToListener) {
      // Killcam taunt: bubble now, audio isolated at the end of the killcam.
      const speaker = this.sim.byId.get(b.speakerId);
      if (speaker) this.hud.addBubble(speaker, b, me, this.realTime);
      return;
    }
    const listener = { id: me.id, team: me.team, position: me.pos };
    const verdict = this.limiter.evaluate({ ...b, position: b.position }, listener, now);
    if (!verdict.play) return;
    // Enqueue: the conversation queue plays one line at a time so the killer's
    // taunt and the victim's reply land back-to-back instead of overlapping.
    const q = this.voiceQueue;
    q.push({ b, verdict, enqueuedAt: now });
    const MAXQ = 3;
    if (q.length > MAXQ) {
      let drop = 0;
      for (let i = 1; i < q.length; i++) if (q[i].b.priority < q[drop].b.priority) drop = i;
      q.splice(drop, 1);
    }
  }

  /** Drain one queued bark per turn: play it fully, leave a streamer beat, then the next. */
  updateVoiceQueue() {
    const me = this.me;
    if (!voice.enabled) {
      // Muted: still show visuals, no pacing needed.
      let n;
      while ((n = this.voiceQueue.shift())) {
        const speaker = this.sim.byId.get(n.b.speakerId);
        if (speaker) this.hud.addBubble(speaker, n.b, me, this.realTime);
        this.hud.addSub(n.b, n.verdict.channel);
      }
      return;
    }
    const nowRt = performance.now() / 1000;
    if (voice.isBusy()) { this._voiceWasBusy = true; return; }
    if (this._voiceWasBusy) { this._voiceWasBusy = false; this._voiceGapUntil = nowRt + 0.35; }
    if (nowRt < this._voiceGapUntil) return;
    const simNow = this.sim.time;
    let next = this.voiceQueue.shift();
    while (next && simNow - next.enqueuedAt > 6) next = this.voiceQueue.shift(); // stale
    if (!next) return;
    const { b, verdict } = next;
    const speaker = this.sim.byId.get(b.speakerId);
    if (speaker) this.hud.addBubble(speaker, b, me, this.realTime);
    const started = voice.say({ text: b.text, lineId: b.lineId, faction: b.faction, priority: b.priority, volume: b.chatter ? 0.6 : verdict.volume, force: true });
    if (started) {
      this.hearing = { priority: b.priority, until: simNow + b.duration };
      this.chatter.notifyVoicePlayed(simNow);
    }
    this.hud.addSub(b, verdict.channel);
  }

  /**
   * Ambient chatter: if nothing has spoken for 5s and the voice channel +
   * bark queue are idle, enqueue one quiet background line, alternating
   * teams for back-and-forth feel. Never interrupts action voices.
   */
  updateChatter(simNow) {
    const c = this.chatter.maybeChatter(simNow, {
      actors: this.sim.actors,
      isVoiceBusy: () => voice.isBusy() || this.voiceQueue.length > 0,
    });
    if (!c) return;
    const r = this.barks.director(c.actor).request(c.eventId, simNow, { skipChance: true });
    const b = this.barks.bark(c.actor, r, { chatter: true });
    if (b) this.onBark(b, simNow);
  }

  // Thin delegators to this.hud for backwards compatibility
  startKillcam(kc, killEv) { return this.hud.startKillcam(kc, killEv, this.sim, renderer, this.frames, voice); }
  updateKillcam(dt) { return this.hud.updateKillcam(dt, this.sim, renderer, voice); }
  hitmark(word, isHeadshot = false) { return this.hud.hitmark(word, isHeadshot); }
  flashVignette() { return this.hud.flashVignette(); }
  addFeed(k) { return this.hud.addFeed(k, this.sim, this.me); }
  addSub(b, channel) { return this.hud.addSub(b, channel); }
  addBubble(speaker, b) { return this.hud.addBubble(speaker, b, this.me, this.realTime); }
  updateHud() { return this.hud.update({ sim: this.sim, me: this.me, state, renderer, input, voice, sfx, library: this.library, radar: this.radar, realTime: this.realTime }); }
  update007Meters(hp, maxHp = 100, armor = 100, maxArmor = 100) { return this.hud.update007Meters(hp, maxHp, armor, maxArmor); }
  showRespawn() { return this.hud.showRespawn(this.me, this.sim); }
  renderBoard(el) { return this.hud.renderBoard(el, this.sim, this.me); }
  showEnd() {
    return this.hud.showEnd({
      sim: this.sim, me: this.me, library: this.library, rng: this.rng,
      onAgain: () => startGame(), onMenu: () => toMenu(), voice,
      isDemo, funnel,
    });
  }
}

// ------------------------------------------------------------------ input

const canvas = typeof document !== 'undefined' ? $('view') : null;
const input = canvas ? new Controls({ canvas, touchRoot: $('touch') }) : null;
const lock = () => input?.lock();
if (canvas) {
  canvas.addEventListener('click', () => { if (game && !game.sim.over && !state.spectate) lock(); sfx.unlock(); });
}
if ($('pause')) {
  $('pause').addEventListener('click', e => { if (e.target.id !== 'toMenu') lock(); });
}
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideDemoModal();
    if (e.code === 'KeyO' || e.code === 'Digit0') cycleStyle(state, renderer, $, name => { if (game) game.showBanner(name); });
    if (!game) return;
    if (e.code === 'KeyP') { state.retro = !state.retro; renderer?.setRetro(state.retro); }
    if (e.code === 'KeyM') { voice.enabled = !voice.enabled; if (!voice.enabled) voice.stop(); }
    if (e.code === 'KeyV' || e.code === 'KeyT') {
      sfx.ping?.('alert');
      game.showBanner('📍 LOCATION PINGED', 'Suburban citation marked on radar');
    }
    if (e.code === 'BracketLeft') { state.script = state.script === 'steam' ? 'clean' : 'steam'; game.library.setScript(state.script); game.showBanner(state.script === 'steam' ? 'STEAM SCRIPT' : 'CLEAN SCRIPT'); }
    if (e.code === 'BracketRight') { state.legalSafe = !state.legalSafe; game.library.setLegalSafe(state.legalSafe); game.showBanner(`LEGAL-SAFE ${state.legalSafe ? 'ON' : 'OFF'}`); }
  });
}

// Controller navigation outside gameplay: menu (A deploy, LB/RB or D-pad faction), pause (START resume,
// VIEW quit), end screen (A run it back, B menu). In-game START pauses.
if (input) {
  input.onPadPress = pr => {
    sfx.unlock();
    const menuOpen = $('menu') && !$('menu').classList.contains('hidden');
    const endOpen = $('end') && !$('end').classList.contains('hidden');
    if (menuOpen) {
      const step = (pr.RB || pr.RIGHT ? 1 : 0) - (pr.LB || pr.LEFT ? 1 : 0);
      if (step) {
        const pool = isDemo ? DEMO_FACTIONS : shippingFactions;
        const i = pool.indexOf(state.faction);
        state.faction = pool[(i + step + pool.length) % pool.length];
        buildMenu();
      }
      if (pr.A || pr.START) startGame();
    } else if (endOpen) {
      if (pr.A) startGame();
      if (pr.B) toMenu();
    } else if (game) {
      if (pr.START) input.userPaused = !input.userPaused;
      else if (input.userPaused && pr.VIEW) toMenu();
      else if (input.userPaused && pr.A) input.userPaused = false;
    }
  };
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => renderer?.resize());
}

function setupShortRecorder() {
  const header = document.createElement('div');
  header.className = 'short-top-header';
  header.innerHTML = `
    <div class="short-badge">🚨 SUBURBAN CODE VIOLATION</div>
    <div class="short-title">POV: YOU DIDN'T MOW AT 7:00 AM ON SATURDAY 💀</div>
    <div class="short-sub">Call of Karen: HOA Warfare</div>
  `;
  document.body.appendChild(header);

  const subBox = document.createElement('div');
  subBox.className = 'short-subtitle-box';
  subBox.innerHTML = `
    <div class="short-bark-label">SAVAGE BARK · KARENS:</div>
    <div class="short-bark-text">"I WANT TO SPEAK TO YOUR MANAGER!"</div>
  `;
  document.body.appendChild(subBox);

  const footer = document.createElement('div');
  footer.className = 'short-bottom-tag';
  footer.innerHTML = `CALL OF KAREN: HOA WARFARE - WISHLIST ON STEAM ($4.99)`;
  document.body.appendChild(footer);

  try {
    const stream = renderer.canvas.captureStream(60);
    if (sfx?.ctx) {
      try {
        const dest = sfx.ctx.createMediaStreamDestination();
        sfx.master?.connect(dest);
        const track = dest.stream.getAudioTracks()[0];
        if (track) stream.addTrack(track);
      } catch (err) {
        console.warn('Could not attach audio track:', err);
      }
    }
    const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const buf = await blob.arrayBuffer();
      await fetch('/api/save_clip', { method: 'POST', body: buf });
      window.__RECORDING_DONE = true;
      console.log('__SHORT_RECORDING_DONE__');
    };
    rec.start();
    const durSec = Number(params.get('dur')) || 15;
    setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, durSec * 1000);
  } catch (err) {
    console.error('Short recording error:', err);
  }
}

function startGame(session = null) {
  if (game) game.dispose();
  sfx.stopAmbience?.();
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  sfx.unlock();
  input.resetLook(0);
  input.userPaused = false;
  if (input.device === 'touch') { document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); }
  game = new Game(session);
  if (session) input.resetLook(game.me.team === 0 ? 0 : Math.PI); // team 1 spawns at the far end, facing the court
  $('btnInvite')?.classList.toggle('hidden', !session);
  if (params.get('short') === '1' && !window.__shortStarted) {
    window.__shortStarted = true;
    setupShortRecorder();
  }
  if (state.style007 && gunbarrel && !window.__introPlayed && params.get('short') !== '1') {
    window.__introPlayed = true;
    gunbarrel.start(() => {
      if (!state.spectate) lock();
    });
  } else {
    if (!state.spectate) lock();
  }
}

// ------------------------------------------------------------------ loop

const perf = params.get('perf') === '1' ? new PerfOverlay(renderer) : null;
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  input.pollPad();
  renderer.adapt(dt);
  perf?.update(dt);
  if (gunbarrel && gunbarrel.active) gunbarrel.update(dt);
  if (game) game.update(dt);
  else if (params.get('lineup') === '1') return;
  else { renderer.orbit(t / 1000); renderer.updateFx(dt); renderer.render(); }
  requestAnimationFrame(frame);
}

// ?lineup=1 : all factions side by side for checking silhouettes (no match)
function showLineup() {
  $('menu').classList.add('hidden');
  const ids = Object.keys(factions);
  const rows = [ids.filter(f => factions[f].status !== 'draft'), ids.filter(f => factions[f].status === 'draft')];
  rows.forEach((row, r) => row.forEach((f, i) => {
    const c = renderer.ensureCharacter({ id: 'lineup' + f, name: f, team: 0, faction: f }, 1);
    c.update({ x: (i - (row.length - 1) / 2) * 1.05, y: 0, z: 8 - r * 2.4, yaw: Math.PI, pitch: 0, speed: 0, alive: true, onGround: true }, 0.016);
  }));
  renderer.camera.position.set(0, 4.2, 14.2);
  renderer.camera.lookAt(0, 0.9, 6.8);
  renderer.viewmodel.visible = false;
  const loop = () => { renderer.render(); requestAnimationFrame(loop); };
  loop();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && $('view')) {
  buildMenu();
  sfx.startAmbience?.();
  // Dismiss the loading screen
  const loader = document.getElementById('loader');
  if (loader) { loader.classList.add('done'); setTimeout(() => loader.remove(), 600); }
  if (params.get('lineup') === '1') showLineup();
  else if (params.get('autostart') === '1' || state.spectate) startGame();
  // Invite link (?room=CODE): open the join prompt with the code filled in. Joining needs a click anyway
  // (audio, fullscreen and pointer lock all require a user gesture).
  const invited = (params.get('room') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  if (invited && onlineServerUrl() && params.get('lineup') !== '1' && params.get('autostart') !== '1') openRoomModal(invited.toUpperCase());
  requestAnimationFrame(frame);
  window.__hoa = { get game() { return game; }, renderer, state, input };
}

export { STYLES, NetClient, Game };
