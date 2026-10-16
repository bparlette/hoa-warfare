// Unit tests for Instant 9:16 TikTok/Shorts Exporter & Suburban Stockades Shame Podium
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Hud,
  calculatePodium,
} from '../src/engine/hud.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weaponsData = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

function createMockContext2D() {
  const calls = [];
  return {
    calls,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineJoin: 'miter',
    miterLimit: 10,
    font: '10px sans-serif',
    textAlign: 'left',
    fillRect(x, y, w, h) {
      calls.push({ type: 'fillRect', x, y, w, h, fillStyle: this.fillStyle });
    },
    strokeRect(x, y, w, h) {
      calls.push({ type: 'strokeRect', x, y, w, h, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
    },
    fillText(text, x, y) {
      calls.push({ type: 'fillText', text: String(text), x, y, fillStyle: this.fillStyle, font: this.font });
    },
    strokeText(text, x, y) {
      calls.push({ type: 'strokeText', text: String(text), x, y, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, font: this.font });
    },
    createLinearGradient(x0, y0, x1, y1) {
      return {
        x0, y0, x1, y1,
        stops: [],
        addColorStop(offset, color) { this.stops.push({ offset, color }); }
      };
    },
    beginPath() { calls.push({ type: 'beginPath' }); },
    arc(x, y, r, sAngle, eAngle) { calls.push({ type: 'arc', x, y, r, sAngle, eAngle }); },
    stroke() { calls.push({ type: 'stroke' }); },
    fill() { calls.push({ type: 'fill' }); },
    drawImage(...args) { calls.push({ type: 'drawImage', args }); },
    measureText(text) {
      return { width: String(text).length * 12 };
    },
  };
}

function createMockCanvas(w = 720, h = 1280) {
  const ctx = createMockContext2D();
  return {
    width: w,
    height: h,
    getContext(type) {
      if (type === '2d') return ctx;
      return null;
    },
    toBlob(callback, mimeType = 'image/png') {
      callback?.(new Uint8Array([1, 2, 3]));
    },
    toDataURL(mimeType = 'image/png') {
      return 'data:image/png;base64,mockPngShort';
    },
  };
}

function createMockDom() {
  const elements = new Map();

  function getOrCreate(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        style: {},
        classList: {
          _classes: new Set(),
          add(...cs) { cs.forEach(c => this._classes.add(c)); },
          remove(...cs) { cs.forEach(c => this._classes.delete(c)); },
          toggle(c, force) {
            if (force === undefined) {
              if (this._classes.has(c)) this._classes.delete(c);
              else this._classes.add(c);
            } else if (force) {
              this._classes.add(c);
            } else {
              this._classes.delete(c);
            }
          },
          contains(c) { return this._classes.has(c); },
        },
        children: [],
        appendChild(child) {
          child.parentNode = this;
          this.children.push(child);
          return child;
        },
        prepend(child) {
          child.parentNode = this;
          this.children.unshift(child);
          return child;
        },
        remove() {
          if (this.parentNode?.children) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx >= 0) this.parentNode.children.splice(idx, 1);
          }
        },
        querySelector(sel) {
          const idMatch = sel.match(/^#([\w-]+)$/);
          if (idMatch) return getOrCreate(idMatch[1]);
          return null;
        },
        get lastChild() { return this.children[this.children.length - 1] || null; },
        get firstChild() { return this.children[0] || null; },
        textContent: '',
        innerHTML: '',
        offsetWidth: 100,
        offsetHeight: 24,
      });
    }
    return elements.get(id);
  }

  const ids = [
    'hud', 's0', 's1', 'clock', 'hpfill', 'wname', 'ammo', 'nades',
    'modes', 'crosshair', 'loiter', 'loiterT', 'board', 'bubbles',
    'feed', 'subs', 'banner', 'hitmark', 'vignette', 'killcam',
    'kcWho', 'kcLine', 'geHpMeter', 'geArmorMeter', 'end', 'endPanel',
    'btnExportShort', 'btnExportShortKc',
  ];
  ids.forEach(id => getOrCreate(id));

  return {
    $: id => getOrCreate(id),
    elements,
  };
}

// ---------------------------------------------------------------------------
// 1. Standing Rule: Viral Shorts Exporter is EXTERNAL tooling only (tools/make_short.mjs)
// ---------------------------------------------------------------------------

test('Shorts Exporter: viral YouTube short pipeline is external and configured in tools/make_short.mjs', async () => {
  const shortScript = readFileSync(new URL('../../tools/make_short.mjs', import.meta.url), 'utf8');

  // Verify external script exists and defines 9:16 vertical parameters
  assert.ok(shortScript.includes('720x1280') || shortScript.includes('720,1280'), 'External short script must target 9:16 (720x1280)');
  assert.ok(shortScript.includes('ffmpeg') || shortScript.includes('FFMPEG'), 'External short script must use ffmpeg for encoding');
  assert.ok(shortScript.includes('dist/shorts'), 'External short script must output to dist/shorts/');
  assert.ok(shortScript.includes('POV:') || shortScript.includes('SATURDAY'), 'External short script must include suburban meme headlines');
});

test('Shorts Exporter: client HUD does NOT ship in-game 9:16 TikTok exporter button or methods', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });

  // Verify client hud does not expose exportShortsCanvas or shareShort
  assert.equal(typeof hud.exportShortsCanvas, 'undefined', 'Hud should not expose in-game exportShortsCanvas method');
  assert.equal(typeof hud.shareShort, 'undefined', 'Hud should not expose in-game shareShort method');
});

// ---------------------------------------------------------------------------
// 2. Task 1.3: Shame podium correctly identifies bottom fragger from actor stats
// ---------------------------------------------------------------------------

test('Shame Podium: calculatePodium correctly identifies MVP and bottom fragger', () => {
  const actors = [
    { id: 'p0', name: 'MowerMaster', kills: 14, deaths: 2, team: 0, faction: 'hoaDads' },
    { id: 'p1', name: 'MidTier', kills: 5, deaths: 4, team: 0, faction: 'fratHouse' },
    { id: 'p2', name: 'ShamedNeighbor', kills: 0, deaths: 12, team: 1, faction: 'karens' },
  ];

  const { mvp, bottomFragger } = calculatePodium(actors);

  assert.equal(mvp.name, 'MowerMaster', 'MVP must have the highest kills');
  assert.equal(mvp.kills, 14);
  assert.equal(bottomFragger.name, 'ShamedNeighbor', 'Bottom fragger must have lowest kills and highest deaths');
  assert.equal(bottomFragger.kills, 0);
  assert.equal(bottomFragger.deaths, 12);
});

test('Shame Podium: bottom fragger tie-breaking prefers highest citations/deaths when kills are equal', () => {
  const actors = [
    { id: 'p0', name: 'TopDog', kills: 8, deaths: 1, team: 0, faction: 'hoaDads' },
    { id: 'p1', name: 'BadPlayerA', kills: 0, deaths: 3, team: 1, faction: 'karens' },
    { id: 'p2', name: 'WorstPlayerB', kills: 0, deaths: 15, team: 1, faction: 'karens' },
    { id: 'p3', name: 'BadPlayerC', kills: 0, deaths: 7, team: 1, faction: 'karens' },
  ];

  const { mvp, bottomFragger } = calculatePodium(actors);

  assert.equal(mvp.name, 'TopDog');
  assert.equal(bottomFragger.name, 'WorstPlayerB', 'Player with 0 kills and 15 deaths must be shamed over player with 0 kills and 3 deaths');
});

test('Shame Podium: showEnd renders Golden Riding Mower MVP and Suburban Stockades Shame Pillory card', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });

  const actors = [
    { id: 'mvpGuy', name: 'Hank Hill', team: 0, faction: 'hoaDads', kills: 16, deaths: 1, alive: true },
    { id: 'midGuy', name: 'AverageJoe', team: 0, faction: 'hoaDads', kills: 6, deaths: 4, alive: true },
    { id: 'worstGuy', name: 'LazyLou', team: 1, faction: 'karens', kills: 0, deaths: 12, alive: true },
  ];

  hud.showEnd({
    sim: { actors, score: [25, 10], winner: 0 },
    me: actors[0],
    library: { getLines: () => [{ text: 'Taste 48 volts of suburban fury!' }] },
    rng: () => 0,
    onAgain: () => {},
    onMenu: () => {},
    voice: { say: () => {} },
    isDemo: false,
  });

  const panelHtml = $('endPanel').innerHTML;

  // 1. MVP crowned on Golden Riding Mower
  assert.ok(panelHtml.includes('Hank Hill'), 'MVP name must appear on podium');
  assert.ok(panelHtml.includes('Crowned on the Golden Riding Mower'), 'MVP crowned on Golden Riding Mower badge must appear');
  assert.ok(panelHtml.includes('16 Kills') || panelHtml.includes('16-1'), 'MVP kill count must appear');

  // 2. Bottom Fragger locked in Suburban Stockades / Shame Pillory with red violation stamp
  assert.ok(panelHtml.includes('SUBURBAN STOCKADES / SHAME PILLORY'), 'Suburban stockades shame pillory title must appear');
  assert.ok(panelHtml.includes('VIOLATION: WEAPONIZED INCOMPETENCE'), 'Giant red violation stamp must appear');
  assert.ok(panelHtml.includes('0 KILLS · 12 DEATHS'), 'Bottom fragger kill & citation stats must appear');
  assert.ok(panelHtml.includes('FORMAL HOA EVICTION NOTICE ISSUED TO BOTTOM FRAGGER'), 'Roast eviction notice must appear');

  // 3. Export short button NOT present on client, citation button IS present
  assert.ok(!panelHtml.includes('btnExportShort'), '#btnExportShort button must not be rendered on client podium');
  assert.ok(panelHtml.includes('btnExportCitation'), '#btnExportCitation button must be rendered on podium');
  assert.ok(panelHtml.includes('📜 HOA CITATION'), 'Must display HOA Citation button label');
});

// ---------------------------------------------------------------------------
// 3. Scorecard renders stockades badge
// ---------------------------------------------------------------------------

test('Scorecard: renderScoreCardCanvas renders Suburban Stockades shame badge and MVP badge', async () => {
  const originalDoc = globalThis.document;
  try {
    const mockCanvas = createMockCanvas(800, 450);
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return mockCanvas;
        return { style: {} };
      },
    };

    const { $ } = createMockDom();
    const hud = new Hud({ $, factions: content.factions, weaponsData });

    const actors = [
      { id: 'alice', name: 'Alice MVP', kills: 18, deaths: 2, team: 0, faction: 'hoaDads' },
      { id: 'charlie', name: 'Charlie Shamed', kills: 0, deaths: 11, team: 1, faction: 'karens' },
    ];

    const canvas = await hud.renderScoreCardCanvas({
      sim: { actors, score: [25, 14], winner: 0 },
      me: actors[0],
      won: true,
      draw: false,
      mvpLine: 'The HOA board has spoken!',
    });

    assert.ok(canvas, 'Scorecard canvas must be generated');
    const ctx = canvas.getContext('2d');
    const fillTexts = ctx.calls.filter(c => c.type === 'fillText').map(c => c.text);

    // Verify MVP badge
    const hasMvpBadge = fillTexts.some(t => t.includes('GOLDEN MOWER') || t.includes('MATCH MVP'));
    assert.ok(hasMvpBadge, 'Scorecard must render Golden Mower MVP badge');

    // Verify Suburban Stockades shame pillory badge
    const hasStockadesBadge = fillTexts.some(t => t.includes('SUBURBAN STOCKADES') || t.includes('SHAME PILLORY'));
    assert.ok(hasStockadesBadge, 'Scorecard must render Suburban Stockades / Shame Pillory badge');

    const hasViolationStamp = fillTexts.some(t => t.includes('VIOLATION: WEAPONIZED INCOMPETENCE') || t.includes('Charlie Shamed'));
    assert.ok(hasViolationStamp, 'Scorecard must render stockades violation notice with bottom fragger');
  } finally {
    globalThis.document = originalDoc;
  }
});

// ---------------------------------------------------------------------------
// 4. Killcam HUD: HOA Citation Button Wired & No In-Game Shorts Bloat
// ---------------------------------------------------------------------------

test('Killcam: startKillcam wires up #btnExportCitation button and omits #btnExportShort', async () => {
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return createMockCanvas(800, 1000);
        return { style: {} };
      },
      querySelector: () => null,
    };

    const { $ } = createMockDom();
    const hud = new Hud({ $, factions: content.factions, weaponsData });

    let citationShared = false;
    hud.shareCitation = async () => {
      citationShared = true;
      return true;
    };

    const actors = [
      { id: 'k1', name: 'KillerBob', faction: 'hoaDads', alive: true },
      { id: 'v1', name: 'VictimDan', faction: 'karens', alive: false },
    ];
    const sim = {
      time: 20,
      actors,
      byId: new Map(actors.map(a => [a.id, a])),
    };
    const renderer = {
      characters: new Map(),
    };
    const voice = { say: () => {} };
    const frames = [{ t: 18, snap: [], shots: [] }, { t: 20, snap: [], shots: [] }];

    hud.startKillcam(
      { killerId: 'k1', victimId: 'v1', line: { text: 'Get off my lawn!' } },
      { type: 'kill', killerId: 'k1', victimId: 'v1' },
      sim,
      renderer,
      frames,
      voice
    );

    const btnCitation = $('btnExportCitation');
    assert.ok(btnCitation, '#btnExportCitation must exist in DOM');
    assert.ok(typeof btnCitation.onclick === 'function', '#btnExportCitation must have click handler wired');

    await btnCitation.onclick();
    assert.ok(citationShared, 'Clicking #btnExportCitation in killcam must trigger shareCitation');
  } finally {
    globalThis.document = originalDoc;
  }
});
