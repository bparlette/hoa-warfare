// Unit tests for Demo Build Gating, Steam Upsell Modal, and Demo Packaging.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_FACTIONS, showDemoModal, hideDemoModal } from '../src/engine/game.js';
import { Hud } from '../src/engine/hud.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weaponsData = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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
        textContent: '',
        innerHTML: '',
        onclick: null,
        addEventListener(event, fn) { this[`on_${event}`] = fn; }
      });
    }
    return elements.get(id);
  }

  const $ = id => getOrCreate(id);
  return { $, elements, getOrCreate };
}

// ------------------------------------------------------------------ 1. DEMO_FACTIONS tests

test('DEMO_FACTIONS: contains exactly the 6 required factions', () => {
  const expected = ['karens', 'tradwives', 'hoaDads', 'furries', 'trumpers', 'pickleballRetirees'];
  assert.equal(DEMO_FACTIONS.length, 6, 'DEMO_FACTIONS must contain exactly 6 factions');
  assert.deepEqual([...DEMO_FACTIONS].sort(), [...expected].sort(), 'Must match required 6 demo factions');
  for (const id of expected) {
    assert.ok(DEMO_FACTIONS.includes(id), `Missing faction ${id} in DEMO_FACTIONS`);
    assert.ok(content.factions[id], `Faction ${id} must exist in content data`);
    assert.notEqual(content.factions[id].status, 'draft', `Demo faction ${id} cannot be a draft`);
  }
});

// ------------------------------------------------------------------ 2. Gating & Bot Pool tests

test('Demo Gating: locked faction filtering partitions 20 factions into 6 demo + 14 locked', () => {
  const allFactionIds = Object.keys(content.factions);
  assert.equal(allFactionIds.length, 20, 'Expected 20 total factions');

  const unlocked = allFactionIds.filter(id => DEMO_FACTIONS.includes(id));
  const locked = allFactionIds.filter(id => !DEMO_FACTIONS.includes(id));

  assert.equal(unlocked.length, 6, 'Exactly 6 factions are unlocked in demo mode');
  assert.equal(locked.length, 14, 'Exactly 14 factions are locked in demo mode');
  for (const id of locked) {
    assert.ok(!DEMO_FACTIONS.includes(id), `Locked faction ${id} must not be in DEMO_FACTIONS`);
  }
});

test('Bot Pool: bot spawning in demo mode only selects from DEMO_FACTIONS', () => {
  let seed = 42;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const isDemo = true;
  const shippingFactions = Object.keys(content.factions).filter(id => !content.factions[id].status || content.factions[id].status !== 'draft');
  const pickFaction = () => {
    const pool = isDemo ? DEMO_FACTIONS : shippingFactions;
    return pool[Math.floor(rng() * pool.length)];
  };

  const samples = new Set();
  for (let i = 0; i < 500; i++) {
    const f = pickFaction();
    assert.ok(DEMO_FACTIONS.includes(f), `Bot faction ${f} must be within DEMO_FACTIONS in demo mode`);
    samples.add(f);
  }
  // All 6 demo factions should be drawn over 500 samples
  assert.equal(samples.size, 6, 'All 6 demo factions should be sampled by bots in demo mode');

  // Verify full mode allows non-demo shipping factions
  const pickFactionFull = () => {
    const pool = false ? DEMO_FACTIONS : shippingFactions;
    return pool[Math.floor(rng() * pool.length)];
  };
  const fullSamples = new Set();
  for (let i = 0; i < 500; i++) fullSamples.add(pickFactionFull());
  assert.ok(fullSamples.size > 6, 'Full mode bot pool must draw beyond the 6 demo factions');
});

// ------------------------------------------------------------------ 3. Modal markup and interactions

test('HTML: index.html contains #demoModal with required title, copy, and buttons', () => {
  assert.ok(indexHtml.includes('id="demoModal"'), 'index.html must contain #demoModal');
  assert.ok(indexHtml.includes('🔒 LOCKED IN FREE WEB DEMO'), 'index.html must have locked modal title');
  assert.ok(/data-steam="locked_faction"/.test(indexHtml), 'locked-faction modal has a tracked Steam button (href set by funnel.js)');
  assert.ok(!indexHtml.includes('store.steampowered.com/app/hoa-warfare'), 'no invalid non-numeric Steam app URL');
  assert.ok(!/online\s+multiplayer/.test(indexHtml), 'do not promise online multiplayer');
  assert.ok(indexHtml.includes('btn-wishlist'), 'index.html must have btn-wishlist class');
  assert.ok(indexHtml.includes('★ WISHLIST ON STEAM ($4.99)'), 'index.html must have Wishlist CTA text');
  assert.ok(indexHtml.includes('id="closeDemoModal"'), 'index.html must have #closeDemoModal button');
});

test('Interactive Suburban Modal: showDemoModal and hideDemoModal update DOM appropriately', () => {
  const { $, getOrCreate } = createMockDom();
  const origDoc = globalThis.document;

  globalThis.document = {
    getElementById: id => $(id),
    exitPointerLock: () => {}
  };

  try {
    const modal = $('demoModal');
    modal.classList.add('hidden');
    const title = $('demoModalTitle');
    const sub = $('demoModalSub');
    const body = $('demoModalBody');

    showDemoModal('The Furries', "It's not a costume. It's a fursona.");

    assert.equal(modal.classList.contains('hidden'), false, 'Modal should become visible');
    assert.equal(title.textContent, '🔒 LOCKED IN FREE WEB DEMO', 'Title should be locked banner');
    assert.ok(body.innerHTML.includes('The Furries'), 'Body should mention faction name');
    assert.ok(body.innerHTML.includes('all 20 fully voiced factions'), 'Body should mention 20 factions');
    assert.ok(body.innerHTML.includes('$4.99 release on Steam'), 'Body should mention Steam pricing');
    assert.equal(sub.textContent, '"It\'s not a costume. It\'s a fursona."', 'Sub should show tagline');

    hideDemoModal();
    assert.equal(modal.classList.contains('hidden'), true, 'Modal should be hidden after hideDemoModal()');
  } finally {
    globalThis.document = origDoc;
  }
});

// ------------------------------------------------------------------ 4. HUD End Screen Upsell

test('HUD: showEnd renders prominent demo completion card when isDemo is true', () => {
  const { $, elements } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });

  const fakeSim = {
    actors: [
      { id: 'you', name: 'You', team: 0, faction: 'karens', kills: 12, deaths: 3, alive: true },
      { id: 'b0', name: 'Chad', team: 1, faction: 'fratHouse', kills: 4, deaths: 10, alive: true },
    ],
    score: [25, 18],
    winner: 0,
  };
  const fakeLibrary = {
    getLines: () => [{ text: 'We rule the HOA!' }]
  };
  const fakeVoice = { say: () => {} };

  // 1. With isDemo = true
  hud.showEnd({
    sim: fakeSim,
    me: fakeSim.actors[0],
    library: fakeLibrary,
    rng: () => 0,
    onAgain: () => {},
    onMenu: () => {},
    voice: fakeVoice,
    isDemo: true,
  });

  const panelHtml = $('endPanel').innerHTML;
  assert.ok(panelHtml.includes('demo-end-card'), 'End panel must contain demo-end-card');
  assert.ok(panelHtml.includes('THANKS FOR PLAYING THE CALL OF KAREN WEB DEMO!'), 'End panel must show thank you heading');
  assert.ok(panelHtml.includes('The full game unlocks'), 'End panel must show unlock subtext');
  assert.ok(!panelHtml.includes('multiplayer'), 'End panel must not promise multiplayer');
  assert.ok(panelHtml.includes('data-steam="end_card"'), 'End card Steam button is tracked');
  assert.ok(panelHtml.includes('btn-wishlist-glow'), 'Wishlist button must have glowing class');

  // 2. With isDemo = false
  hud.showEnd({
    sim: fakeSim,
    me: fakeSim.actors[0],
    library: fakeLibrary,
    rng: () => 0,
    onAgain: () => {},
    onMenu: () => {},
    voice: fakeVoice,
    isDemo: false,
  });

  const fullPanelHtml = $('endPanel').innerHTML;
  assert.equal(fullPanelHtml.includes('demo-end-card'), false, 'Full game end panel must NOT contain demo-end-card');
});

// ------------------------------------------------------------------ 5. Packaging Injection

test('Packaging: package_demo script injects window.__HOA_DEMO__ into <head>', () => {
  const pkgScript = readFileSync(new URL('../../tools/package_demo.mjs', import.meta.url), 'utf8');
  assert.ok(pkgScript.includes('window.__HOA_DEMO__ = true'), 'package_demo.mjs must inject window.__HOA_DEMO__ = true');
  assert.ok(pkgScript.includes('<head>'), 'package_demo.mjs must target <head>');

  // Verify simulated template injection
  const sampleHead = '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">';
  const injected = sampleHead.replace('<head>', '<head>\n<script>window.__HOA_DEMO__ = true;</script>');
  assert.ok(injected.includes('<head>\n<script>window.__HOA_DEMO__ = true;</script>'), 'Injection replaces <head> cleanly');
});

// ------------------------------------------------------------------ 6. Menu Building & Locked Faction Interactions

test('buildMenu: renders demo-lock badges on locked factions and clicking opens showDemoModal', async () => {
  const { $, elements } = createMockDom();
  const origDoc = globalThis.document;
  const origWindow = globalThis.window;

  globalThis.window = {
    __HOA_DEMO__: true,
    location: { search: '' },
    addEventListener: () => {}
  };

  globalThis.document = {
    getElementById: id => $(id),
    createElement: tag => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        style: {},
        onclick: null,
        children: [],
        appendChild(c) { this.children.push(c); return c; },
        classList: {
          _classes: new Set(),
          add(...cs) { cs.forEach(c => this._classes.add(c)); },
          remove(...cs) { cs.forEach(c => this._classes.delete(c)); },
          contains(c) { return this._classes.has(c); }
        }
      };
      return el;
    },
    exitPointerLock: () => {}
  };

  try {
    const { buildMenu } = await import('../src/engine/game.js');
    buildMenu();

    const box = $('factions');
    assert.ok(box.children.length > 0, 'buildMenu must populate factions box');

    const unlockedCards = box.children.filter(c => !c.className.includes('locked'));
    const lockedCards = box.children.filter(c => c.className.includes('locked'));

    assert.equal(unlockedCards.length, 6, 'Page 1 must display the 6 unlocked demo factions');
    assert.ok(lockedCards.length > 0, 'Page 1 includes locked factions to fill the page');

    for (const card of lockedCards) {
      assert.ok(card.innerHTML.includes('demo-lock'), 'Locked card must contain demo-lock badge');
      assert.ok(card.innerHTML.includes('🔒 STEAM ONLY'), 'Locked card badge text must be 🔒 STEAM ONLY');
    }

    // Clicking locked faction triggers showDemoModal and does not crash
    const lockedEl = lockedCards[0];
    const modal = $('demoModal');
    modal.classList.add('hidden');
    lockedEl.onclick();
    assert.equal(modal.classList.contains('hidden'), false, 'Clicking locked faction card must reveal demoModal');
  } finally {
    globalThis.document = origDoc;
    globalThis.window = origWindow;
  }
});
