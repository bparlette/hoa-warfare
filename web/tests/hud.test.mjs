// Unit tests for HUD, FPS & Performance Profiler overlay, and dynamic quality optimizations.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Hud } from '../src/engine/hud.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weaponsData = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

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
          contains(c) { return this._classes.has(c); }
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
    'kcWho', 'kcLine', 'geHpMeter', 'geArmorMeter'
  ];
  ids.forEach(id => getOrCreate(id));

  return {
    $: id => getOrCreate(id),
    elements,
  };
}

function createMockContext({ quality = 'high', calls = 48, actorsCount = 12, deadCount = 2 } = {}) {
  const actors = [];
  for (let i = 0; i < actorsCount; i++) {
    actors.push({
      id: `p${i}`,
      name: `Player_${i}`,
      team: i % 2,
      faction: 'karens',
      alive: i >= deadCount,
      pos: { x: i * 2, y: 0, z: i * 3 },
      kills: i,
      deaths: 1,
    });
  }

  const sim = {
    score: [3, 2],
    scoreLimit: 25,
    time: 45,
    timeLimit: 300,
    actors,
    byId: new Map(actors.map(a => [a.id, a])),
    mode: {
      hud: () => 'ZONE A: SECURED',
      clock: () => 255,
      constructor: { label: 'HOA Clash' }
    }
  };

  const me = actors[0];
  me.hp = 85;
  me.weapons = { primary: { name: 'The Allowance', mag: 30 } };
  me.activeSlot = 'primary';
  me.ammo = 24;
  me.reloadUntil = 0;
  me.grenades = 2;
  me.campState = { state: 'clear', secondsLeft: 17 };

  const shadowMapSize = {
    x: quality === 'low' ? 1024 : 2048,
    y: quality === 'low' ? 1024 : 2048,
    set(x, y) { this.x = x; this.y = y; }
  };

  const renderer = {
    retro: false,
    camera: { position: { x: 0, y: 2, z: 0 } },
    toScreen: p => ({ x: Math.floor(p.x * 10 + 200), y: Math.floor(p.z * 10 + 150) }),
    gl: {
      info: {
        render: { calls, triangles: 14500 }
      }
    },
    quality: {
      tier: quality,
      shadow: quality === 'low' ? 1024 : 2048,
      maxSplats: quality === 'low' ? 60 : 160,
      scale: 1,
    },
    sun: {
      shadow: {
        mapSize: shadowMapSize
      }
    }
  };

  const state = {
    script: 'clean',
    spectate: false,
    style007: false,
    quality,
  };

  const input = { scoreboard: false };
  const voice = { enabled: true, say: () => {} };
  const sfx = { warn: () => {} };
  const library = { legalSafe: true };
  const radar = { render: () => {} };

  return { sim, me, renderer, state, input, voice, sfx, library, radar };
}

test('hud: perf overlay is disabled by default and enabled via perfOverlay flag', () => {
  const { $ } = createMockDom();
  const hudOff = new Hud({ $, factions: content.factions, weaponsData, perfOverlay: false });
  assert.equal(hudOff.perfOverlay, false);

  const hudOn = new Hud({ $, factions: content.factions, weaponsData, perfOverlay: true });
  assert.equal(hudOn.perfOverlay, true);
});

test('hud: perf=1 overlay renders without errors when enabled', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData, perfOverlay: true });
  const ctx = createMockContext({ calls: 36, actorsCount: 12, deadCount: 2 });

  // Update over multiple frames
  hud.update({ ...ctx, realTime: 1.0 });
  hud.update({ ...ctx, realTime: 1.016 });
  hud.update({ ...ctx, realTime: 1.033 });

  const overlay = hud.getPerfOverlayElement();
  assert.ok(overlay, 'Perf overlay element should be created');
  assert.ok(overlay.textContent.length > 0, 'Perf overlay should have rendered text content');
  assert.equal(overlay.style.display, '', 'Perf overlay should be visible');
});

test('hud: format and layout of performance counters', () => {
  const { $ } = createMockDom();
  const hud = new Hud({
    $,
    factions: content.factions,
    weaponsData,
    perfOverlay: true,
    perfPosition: 'upper-right',
  });
  const ctx = createMockContext({ calls: 52, actorsCount: 12, deadCount: 3 });

  // Simulate frames stepping by 16.6ms (60 FPS)
  hud.update({ ...ctx, realTime: 1.0 });
  hud.update({ ...ctx, realTime: 1.0166 });
  hud.update({ ...ctx, realTime: 1.0333 });

  const overlay = hud.getPerfOverlayElement();
  const text = overlay.textContent;

  // 1. Shows FPS counter (rolling average)
  assert.match(text, /FPS:\s*\d+/, 'Should display FPS counter');

  // 2. Shows frame time in ms
  assert.match(text, /\d+(\.\d+)?\s*ms/, 'Should display frame time in ms');

  // 3. Shows draw call count
  assert.match(text, /DRAWS:\s*52\s*calls/, 'Should display correct draw call count');

  // 4. Shows active actor count
  // 12 total, 3 dead = 9 alive active
  assert.match(text, /ACTORS:\s*9\s*active\s*\/\s*12/, 'Should display active actor count / total');

  // 5. Clean, dark transparent suburban HUD box layout
  assert.ok(overlay.style.fontFamily.includes('monospace'), 'Font family must be monospace');
  assert.equal(overlay.style.position, 'absolute', 'Position should be absolute');
  assert.equal(overlay.style.top, '12px', 'Top should be 12px');
  assert.equal(overlay.style.right, '12px', 'Upper right position should have right: 12px');
  assert.ok(
    overlay.style.background.includes('rgba(17, 29, 53') || overlay.style.background.includes('rgba('),
    'Background should be dark transparent'
  );

  // Stats API inspection
  const stats = hud.getPerfStats();
  assert.equal(stats.drawCalls, 52);
  assert.equal(stats.activeActors, 9);
  assert.equal(stats.totalActors, 12);
  assert.ok(stats.fps > 0, 'FPS should be greater than 0');
  assert.ok(stats.frameTimeMs > 0, 'Frame time should be greater than 0');
});

test('hud: upper-left positioning is supported for suburban HUD box', () => {
  const { $ } = createMockDom();
  const hud = new Hud({
    $,
    factions: content.factions,
    weaponsData,
    perfOverlay: true,
    perfPosition: 'upper-left',
  });
  const ctx = createMockContext();
  hud.update({ ...ctx, realTime: 1.0 });

  const overlay = hud.getPerfOverlayElement();
  assert.equal(overlay.style.left, '12px', 'Upper left positioning sets left: 12px');
  assert.equal(overlay.style.right, '', 'Upper left positioning clears right');

  hud.setPerfPosition('upper-right');
  assert.equal(overlay.style.right, '12px', 'setPerfPosition switches to right: 12px');
});

test('hud: dynamic shadow quality and draw call optimization for low-end devices (quality === low)', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData, perfOverlay: true, quality: 'low' });
  const ctx = createMockContext({ quality: 'low', calls: 30 });

  // Start with unoptimized high shadow setting to verify dynamic down-capping
  ctx.renderer.quality.shadow = 2048;
  ctx.renderer.quality.maxSplats = 160;
  ctx.renderer.sun.shadow.mapSize.x = 2048;
  ctx.renderer.sun.shadow.mapSize.y = 2048;

  // Add multiple bubbles to test overlay capping on low quality
  for (let i = 0; i < 5; i++) {
    hud.addBubble(ctx.sim.actors[i], { text: `Taunt ${i}`, duration: 3, priority: 5 }, ctx.me, 1.0);
  }
  // Low quality should cap active bubbles to 2
  assert.equal(hud.bubbles.length, 2, 'Low quality caps active speech bubbles to 2');

  // Test feed capping on low quality
  for (let i = 0; i < 6; i++) {
    hud.addFeed({ killerId: 'p0', victimId: 'p1', weaponId: 'ar_allowance' }, ctx.sim, ctx.me);
  }
  const feed = $('feed');
  assert.ok(feed.children.length <= 3, `Feed on low quality should be capped to 3 (was ${feed.children.length})`);

  // Test subtitle capping on low quality
  for (let i = 0; i < 5; i++) {
    hud.addSub({ faction: 'karens', name: 'Karen', text: `Sub ${i}`, lineId: `k.k.${i}` }, 'team');
  }
  const subs = $('subs');
  assert.ok(subs.children.length <= 2, `Subs on low quality should be capped to 2 (was ${subs.children.length})`);

  // Run update to apply dynamic shadow quality and draw call optimizations
  hud.update({ ...ctx, realTime: 1.0 });

  // Shadows must be capped to 1024
  assert.ok(ctx.renderer.quality.shadow <= 1024, 'Renderer shadow resolution capped to <= 1024 on low quality');
  assert.ok(ctx.renderer.sun.shadow.mapSize.x <= 1024, 'Sun shadow map size capped to <= 1024 on low quality');
  assert.ok(ctx.renderer.quality.maxSplats <= 60, 'Max splats capped to <= 60 on low quality');

  // Suggestions should highlight low tier configuration
  const stats = hud.getPerfStats();
  assert.equal(stats.qualityTier, 'low');
  assert.equal(stats.isLowQuality, true);
  assert.ok(stats.suggestions.some(s => s.toLowerCase().includes('low quality')), 'Suggestions note low quality profile');

  const text = hud.getPerfOverlayElement().textContent;
  assert.match(text, /QUALITY:\s*LOW/, 'Overlay displays QUALITY: LOW');
  assert.match(text, /SUGGEST:/, 'Overlay displays performance suggestions');
});

test('hud: toggling perfOverlay dynamically hides overlay element', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData, perfOverlay: true });
  const ctx = createMockContext();

  hud.update({ ...ctx, realTime: 1.0 });
  const overlay = hud.getPerfOverlayElement();
  assert.equal(overlay.style.display, '');

  hud.perfOverlay = false;
  hud.update({ ...ctx, realTime: 1.02 });
  assert.equal(overlay.style.display, 'none', 'Overlay should be hidden when perfOverlay is false');
});

test('hud: reset clears frame timings and bubbles', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData, perfOverlay: true });
  const ctx = createMockContext();

  hud.update({ ...ctx, realTime: 1.0 });
  hud.update({ ...ctx, realTime: 1.02 });
  assert.ok(hud._perfFrames.length > 0);

  hud.reset();
  assert.equal(hud._perfFrames.length, 0, 'Frame timings should be reset');
  assert.equal(hud.bubbles.length, 0, 'Bubbles should be reset');
});

test('hud: flashDamage rotates dmgIndicator toward relative hit angle', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });
  const ind = $('dmgIndicator');
  const vig = $('vignette');

  hud.flashDamage(1.57);
  assert.ok(ind.style.transform.includes('rotate(1.57rad)'), 'dmgIndicator should rotate to match incoming angle');
  assert.equal(vig.style.opacity, 0, 'Vignette begins fading out after flash');
});

test('hud: showEnd renders btnShareScore and handles copying score', async () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });
  let copiedText = '';

  const originalClipboard = globalThis.navigator?.clipboard;
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: async text => { copiedText = text; } },
    configurable: true,
  });

  try {
    hud.showEnd({
      sim: { actors: [{ id: 'you', name: 'You', team: 0, faction: 'karens', kills: 14, deaths: 2, alive: true }], score: [30, 20], winner: 0 },
      me: { id: 'you', name: 'You', team: 0, faction: 'karens', kills: 14, deaths: 2, alive: true },
      library: { getLines: () => [{ text: 'Get off my lawn!' }] },
      rng: () => 0,
      onAgain: () => {},
      onMenu: () => {},
      voice: { say: () => {} },
      isDemo: true,
    });

    const panelHtml = $('endPanel').innerHTML;
    assert.ok(panelHtml.includes('btnShareScore'), 'Must render #btnShareScore button');
    assert.ok(panelHtml.includes('📋 SHARE SCORE'), 'Must have Share Score label');

    const btnShare = $('btnShareScore');
    assert.ok(btnShare, 'Button must exist');
    await btnShare.onclick();

    assert.ok(copiedText.includes('14 citations'), 'Share text must include kill count');
    assert.ok(copiedText.includes('Call of Karen: HOA Warfare'), 'Share text must include game title');
    assert.ok(copiedText.includes('https://bparlette.github.io/hoa-warfare/web/?demo=1'), 'Share text must include demo link');
    assert.equal(btnShare.textContent, '✓ COPIED!', 'Button label updates to confirmed status');
  } finally {
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: originalClipboard, configurable: true });
  }
});

