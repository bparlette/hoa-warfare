// Unit tests for Ring Doorbell Fisheye Death Cam & Formal HOA Citation Generator
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Hud,
  exportHoaCitationCanvas,
  formatDoorbellTimestamp,
  HOA_DEFAULT_VIOLATIONS,
} from '../src/engine/hud.js';
import { Renderer } from '../src/engine/render.js';
import { buildMap } from '../src/engine/map.js';

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
    moveTo(x, y) { calls.push({ type: 'moveTo', x, y }); },
    lineTo(x, y) { calls.push({ type: 'lineTo', x, y }); },
    stroke() { calls.push({ type: 'stroke' }); },
    fill() { calls.push({ type: 'fill' }); },
    save() { calls.push({ type: 'save' }); },
    restore() { calls.push({ type: 'restore' }); },
    translate(x, y) { calls.push({ type: 'translate', x, y }); },
    rotate(rad) { calls.push({ type: 'rotate', rad }); },
    drawImage(...args) { calls.push({ type: 'drawImage', args }); },
    measureText(text) {
      return { width: String(text).length * 12 };
    },
  };
}

function createMockCanvas(w = 800, h = 1000) {
  const ctx = createMockContext2D();
  return {
    width: w,
    height: h,
    calls: ctx.calls,
    getContext(type) {
      if (type === '2d') return ctx;
      return null;
    },
    toBlob(callback, mimeType = 'image/png') {
      callback?.(new Uint8Array([1, 2, 3]));
    },
    toDataURL(mimeType = 'image/png') {
      return 'data:image/png;base64,mockPngCitationNotice';
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
          this.children.push(child);
          child.parentNode = this;
          return child;
        },
        querySelector(sel) {
          if (!sel) return null;
          if (sel.startsWith('#')) {
            const childId = sel.slice(1);
            for (const c of this.children) {
              if (c.id === childId) return c;
              const found = c.querySelector?.(sel);
              if (found) return found;
            }
            return null;
          }
          if (sel.startsWith('.')) {
            const cls = sel.slice(1);
            for (const c of this.children) {
              if (c.classList?.contains?.(cls)) return c;
              const found = c.querySelector?.(sel);
              if (found) return found;
            }
            return null;
          }
          return null;
        },
        querySelectorAll(sel) {
          const results = [];
          if (!sel) return results;
          const walk = (node) => {
            for (const c of node.children || []) {
              if (sel.startsWith('.') && c.classList?.contains?.(sel.slice(1))) results.push(c);
              walk(c);
            }
          };
          walk(this);
          return results;
        },
        _textContent: '',
        get textContent() {
          if (this.children.length > 0) {
            return this.children.map(c => c.textContent).join(' ');
          }
          return this._textContent;
        },
        set textContent(v) {
          this._textContent = String(v);
        },
        innerHTML: '',
      });
    }
    return elements.get(id);
  }

  const ids = [
    'hud', 's0', 's1', 'clock', 'hpfill', 'wname', 'ammo', 'nades',
    'modes', 'crosshair', 'loiter', 'loiterT', 'board', 'bubbles',
    'feed', 'subs', 'banner', 'hitmark', 'vignette', 'killcam',
    'kcWho', 'kcLine', 'geHpMeter', 'geArmorMeter', 'end', 'endPanel',
    'btnExportShort', 'btnExportCitation', 'doorbellOverlay',
  ];
  ids.forEach(id => getOrCreate(id));

  return {
    $: id => getOrCreate(id),
    elements,
  };
}

function createTestRenderer() {
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement: () => ({
        width: 16, height: 16,
        getContext: () => ({
          fillRect() {}, clearRect() {}, fillText() {},
          getImageData: () => ({ data: new Uint8Array(64) }),
          putImageData() {},
        }),
      }),
    };
    const canvas = { clientWidth: 800, clientHeight: 600, getContext: () => null, addEventListener: () => {} };
    const map = buildMap('culdesac');
    return new Renderer(canvas, { map, factions: content.factions });
  } finally {
    globalThis.document = originalDoc;
  }
}

// ---------------------------------------------------------------------------
// 1. Ring Doorbell Camera Toggle & FOV
// ---------------------------------------------------------------------------

test('Doorbell Cam: renderer.isDoorbellCam toggles wide 110-120 FOV and restores base FOV', () => {
  const renderer = createTestRenderer();
  assert.equal(renderer.isDoorbellCam, false);
  assert.equal(renderer.camera.fov, 75, 'Default camera FOV should be 75');

  // Toggle on
  renderer.isDoorbellCam = true;
  assert.equal(renderer.isDoorbellCam, true);
  assert.ok(renderer.camera.fov >= 110 && renderer.camera.fov <= 120, `Doorbell cam FOV must be between 110 and 120 (got ${renderer.camera.fov})`);

  // Toggle off
  renderer.isDoorbellCam = false;
  assert.equal(renderer.isDoorbellCam, false);
  assert.equal(renderer.camera.fov, 75, 'Restored camera FOV should return to base 75');

  // Helper method setDoorbellCam
  renderer.setDoorbellCam(true);
  assert.ok(renderer.camera.fov >= 110 && renderer.camera.fov <= 120);
  renderer.setDoorbellCam(false);
  assert.equal(renderer.camera.fov, 75);
});

test('Doorbell Cam: hud.setDoorbellCam toggles renderer FOV and displays/hides security cam overlay', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });
  const renderer = createTestRenderer();

  // Initially off
  assert.equal(hud.isDoorbellCam, false);
  assert.equal(renderer.isDoorbellCam, false);

  // Activate doorbell cam via Hud
  hud.setDoorbellCam(true, renderer);
  assert.equal(hud.isDoorbellCam, true);
  assert.equal(renderer.isDoorbellCam, true);
  assert.ok(renderer.camera.fov >= 110 && renderer.camera.fov <= 120, 'Renderer FOV widened to 110-120');

  const overlay = hud.getDoorbellOverlayElement();
  assert.ok(overlay, 'Doorbell security cam overlay element must exist');
  assert.equal(overlay.style.display, 'block', 'Overlay must be displayed when active');

  // Deactivate doorbell cam via Hud
  hud.setDoorbellCam(false, renderer);
  assert.equal(hud.isDoorbellCam, false);
  assert.equal(renderer.isDoorbellCam, false);
  assert.equal(renderer.camera.fov, 75, 'Renderer FOV restored');
  assert.equal(overlay.style.display, 'none', 'Overlay must be hidden when inactive');
});

// ---------------------------------------------------------------------------
// 2. Security Camera HUD Overlay Elements & Aesthetics
// ---------------------------------------------------------------------------

test('Doorbell Cam: security camera HUD overlay contains REC, live timestamp, battery, motion warning, and vignette', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });

  hud.setDoorbellCam(true);
  const overlay = hud.getDoorbellOverlayElement();
  const text = overlay.textContent;

  // 1. Top left: REC ● [LIVE] in glowing green/red with ticking timestamp (HH:MM:SS:FF)
  assert.ok(text.includes('REC'), 'Must contain REC indicator');
  assert.ok(text.includes('●'), 'Must contain recording dot');
  assert.ok(text.includes('[LIVE]'), 'Must contain [LIVE] tag');
  const timeMatch = text.match(/\d{2}:\d{2}:\d{2}:\d{2}/);
  assert.ok(timeMatch, 'Must include ticking timestamp in HH:MM:SS:FF format');

  // 2. Top right: FRONT PORCH CAM #01 - 1080P HD · BATTERY 84%
  assert.ok(text.includes('FRONT PORCH CAM #01 - 1080P HD · BATTERY 84%'), 'Must include front porch cam info and battery');

  // 3. Center warning notification: ⚠️ MOTION DETECTED: UNAPPROVED NEIGHBOR ON PROPERTY
  assert.ok(text.includes('⚠️ MOTION DETECTED: UNAPPROVED NEIGHBOR ON PROPERTY'), 'Must include motion detected warning');

  // 4. Subtle vignette aesthetic element present
  const vignette = overlay.querySelector?.('.doorbell-vignette') || overlay.children.find?.(c => c.classList?.contains?.('doorbell-vignette'));
  assert.ok(vignette, 'Subtle vignette overlay element must be present in doorbell cam');
});

test('Doorbell Cam: formatDoorbellTimestamp outputs valid HH:MM:SS:FF string', () => {
  const ts1 = formatDoorbellTimestamp(123.45);
  assert.match(ts1, /^\d{2}:\d{2}:\d{2}:\d{2}$/, 'Must match HH:MM:SS:FF pattern from seconds');

  const ts2 = formatDoorbellTimestamp(new Date(2026, 9, 16, 14, 30, 45, 500));
  assert.match(ts2, /^14:30:45:\d{2}$/, 'Must match formatted date hours, minutes, seconds');

  const tsDefault = formatDoorbellTimestamp();
  assert.match(tsDefault, /^\d{2}:\d{2}:\d{2}:\d{2}$/, 'Default timestamp must match HH:MM:SS:FF pattern');
});

// ---------------------------------------------------------------------------
// 3. Killcam Doorbell Cam Integration
// ---------------------------------------------------------------------------

test('Killcam: startKillcam activates doorbell security cam and updateKillcam deactivates it on finish', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });
  const renderer = createTestRenderer();

  const sim = {
    time: 10,
    byId: new Map([
      ['k1', { id: 'k1', name: 'Todd', faction: 'dads' }],
      ['v1', { id: 'v1', name: 'Karen', faction: 'karens' }],
    ]),
    actors: [
      { id: 'k1', name: 'Todd', faction: 'dads' },
      { id: 'v1', name: 'Karen', faction: 'karens' },
    ],
  };

  const frames = [
    { t: 7.0, snap: [{ id: 'k1', x: 0, y: 0, z: 0, pos: { x: 0, y: 0, z: 0 }, alive: true }, { id: 'v1', x: 2, y: 0, z: 2, pos: { x: 2, y: 0, z: 2 }, alive: true }], shots: [] },
    { t: 9.9, snap: [{ id: 'k1', x: 0, y: 0, z: 0, pos: { x: 0, y: 0, z: 0 }, alive: true }, { id: 'v1', x: 2, y: 0, z: 2, pos: { x: 2, y: 0, z: 2 }, alive: false }], shots: [] },
  ];

  hud.startKillcam(
    { killerId: 'k1', victimId: 'v1', line: { text: 'Get off my lawn!' } },
    { type: 'kill', killerId: 'k1', victimId: 'v1' },
    sim,
    renderer,
    frames,
    { say() {} }
  );

  // When killcam starts: Doorbell cam is active with 110-120 FOV and overlay visible
  assert.equal(hud.isDoorbellCam, true, 'Hud isDoorbellCam must be active in killcam');
  assert.equal(renderer.isDoorbellCam, true, 'Renderer isDoorbellCam must be active in killcam');
  assert.ok(renderer.camera.fov >= 110 && renderer.camera.fov <= 120, 'Killcam uses wide fisheye 110-120 FOV');
  assert.equal(hud.getDoorbellOverlayElement().style.display, 'block', 'Doorbell overlay visible during killcam');

  // Fast forward killcam past expiration (KILLCAM_SEC + KILLCAM_HOLD)
  hud.updateKillcam(5.0, sim, renderer, { say() {} });

  assert.equal(hud.isDoorbellCam, false, 'Hud isDoorbellCam deactivated after killcam');
  assert.equal(renderer.isDoorbellCam, false, 'Renderer isDoorbellCam deactivated after killcam');
  assert.equal(renderer.camera.fov, 75, 'Renderer FOV restored to 75');
  assert.equal(hud.getDoorbellOverlayElement().style.display, 'none', 'Doorbell overlay hidden after killcam');
});

// ---------------------------------------------------------------------------
// 4. Formal HOA Citation & Fine Generator
// ---------------------------------------------------------------------------

test('HOA Citation: exportHoaCitationCanvas generates valid 800x1000 canvas with Gold HOA seal, header, case info, itemized fines, and red stamp', () => {
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return createMockCanvas(800, 1000);
        return { style: {} };
      },
    };

    const victim = { id: 'v1', name: 'Karen Bowman', faction: 'karens' };
    const killer = { id: 'k1', name: 'Todd Henderson', faction: 'dads' };
    const stats = { caseId: '849201' };

    const canvas = exportHoaCitationCanvas(victim, killer, stats, { factions: content.factions });
    assert.equal(canvas.width, 800, 'Citation width must be 800');
    assert.equal(canvas.height, 1000, 'Citation height must be 1000');

    const fills = canvas.calls.filter(c => c.type === 'fillText').map(c => c.text);

    // 1. Gold HOA seal & header
    assert.ok(fills.some(t => t.includes('SHADY PINES CUL-DE-SAC HOA - OFFICIAL NOTICE OF VIOLATION')), 'Header must announce Official Notice of Violation');

    // 2. Case Number, Offender Name, Offending Faction
    assert.ok(fills.some(t => t.includes('CASE NUMBER:') || t.includes('849201')), 'Case number must be printed');
    assert.ok(fills.some(t => t.includes('OFFENDER: Karen Bowman')), 'Offender name must be printed');
    assert.ok(fills.some(t => t.includes('OFFENDING FACTION:') && t.includes('Karen')), 'Offending faction must be printed');

    // 3. Itemized bill of fines
    // Code 4.12: Uncut Kentucky Bluegrass (>2.5 inches): $150.00
    assert.ok(fills.some(t => t.includes('Code 4.12') && t.includes('Kentucky Bluegrass')), 'Code 4.12 Kentucky Bluegrass fine must appear');
    assert.ok(fills.some(t => t.includes('$150.00')), '$150.00 fine must appear');

    // Code 7.08: Trash Can Left Out 14 Minutes Past Curbside Pickup: $250.00
    assert.ok(fills.some(t => t.includes('Code 7.08') && t.includes('Trash Can Left Out')), 'Code 7.08 Trash can violation must appear');
    assert.ok(fills.some(t => t.includes('$250.00')), '$250.00 fine must appear');

    // Code 9.01: Weaponized Incompetence in Cul-de-Sac Clash: $500.00
    assert.ok(fills.some(t => t.includes('Code 9.01') && t.includes('Weaponized Incompetence')), 'Code 9.01 Weaponized incompetence fine must appear');
    assert.ok(fills.some(t => t.includes('$500.00')), '$500.00 fine must appear');

    // Code 12.3: Unsanctioned Riding Lawn Mower Roadkill: $1,200.00
    assert.ok(fills.some(t => t.includes('Code 12.3') && t.includes('Riding Lawn Mower Roadkill')), 'Code 12.3 Lawn mower roadkill fine must appear');
    assert.ok(fills.some(t => t.includes('$1,200.00')), '$1,200.00 fine must appear');

    // Total Due Immediately: $2,100.00 (Late fee: $100/hour)
    assert.ok(fills.some(t => t.includes('Total Due Immediately: $2,100.00 (Late fee: $100/hour).')), 'Total Due Immediately of $2,100.00 with $100/hour late fee must appear');

    // 4. Red rubber stamp: FINAL NOTICE - EVICTION PENDING
    assert.ok(fills.some(t => t.includes('FINAL NOTICE - EVICTION PENDING')), 'Red rubber stamp FINAL NOTICE - EVICTION PENDING must appear');
  } finally {
    globalThis.document = originalDoc;
  }
});

test('HOA Citation: hud.exportHoaCitationCanvas instance method works and accepts options', () => {
  const { $ } = createMockDom();
  const hud = new Hud({ $, factions: content.factions, weaponsData });

  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return createMockCanvas(800, 1000);
        return { style: {} };
      },
    };

    const canvas = hud.exportHoaCitationCanvas(
      { name: 'Brad', faction: 'dads' },
      { name: 'Chad', faction: 'bros' },
      { caseId: '999888' }
    );
    assert.equal(canvas.width, 800);
    assert.equal(canvas.height, 1000);

    const fills = canvas.calls.filter(c => c.type === 'fillText').map(c => c.text);
    assert.ok(fills.some(t => t.includes('Brad')));
    assert.ok(fills.some(t => t.includes('FINAL NOTICE - EVICTION PENDING')));
  } finally {
    globalThis.document = originalDoc;
  }
});

// ---------------------------------------------------------------------------
// 5. #btnExportCitation Button Wires & Triggers Export
// ---------------------------------------------------------------------------

test('#btnExportCitation in killcam triggers citation export', async () => {
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return createMockCanvas(800, 1000);
        return { style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, children: [], appendChild() {} };
      },
    };

    const { $ } = createMockDom();
    const hud = new Hud({ $, factions: content.factions, weaponsData });
    const renderer = createTestRenderer();

    let citationShared = false;
    hud.shareCitation = async ({ victim, killer }) => {
      citationShared = true;
      assert.equal(victim.name, 'Karen Bowman');
      assert.equal(killer.name, 'Todd Henderson');
      return true;
    };

    const sim = {
      time: 10,
      byId: new Map([
        ['k1', { id: 'k1', name: 'Todd Henderson', faction: 'dads' }],
        ['v1', { id: 'v1', name: 'Karen Bowman', faction: 'karens' }],
      ]),
      actors: [
        { id: 'k1', name: 'Todd Henderson', faction: 'dads' },
        { id: 'v1', name: 'Karen Bowman', faction: 'karens' },
      ],
    };

    const frames = [
      { t: 7.0, snap: [{ id: 'k1', x: 0, y: 0, z: 0, pos: { x: 0, y: 0, z: 0 }, alive: true }, { id: 'v1', x: 2, y: 0, z: 2, pos: { x: 2, y: 0, z: 2 }, alive: true }], shots: [] },
      { t: 9.9, snap: [{ id: 'k1', x: 0, y: 0, z: 0, pos: { x: 0, y: 0, z: 0 }, alive: true }, { id: 'v1', x: 2, y: 0, z: 2, pos: { x: 2, y: 0, z: 2 }, alive: false }], shots: [] },
    ];

    hud.startKillcam(
      { killerId: 'k1', victimId: 'v1', line: { text: 'Violation recorded!' } },
      { type: 'kill', killerId: 'k1', victimId: 'v1' },
      sim,
      renderer,
      frames,
      { say() {} }
    );

    const btnCitation = $('btnExportCitation');
    assert.ok(btnCitation, '#btnExportCitation must exist in DOM');
    assert.equal(typeof btnCitation.onclick, 'function', '#btnExportCitation must have onclick wired');

    await btnCitation.onclick();
    assert.ok(citationShared, 'Clicking #btnExportCitation in killcam must trigger shareCitation');
  } finally {
    globalThis.document = originalDoc;
  }
});

test('#btnExportCitation in post-match podium (showEnd) renders and triggers citation export', async () => {
  const originalDoc = globalThis.document;
  try {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return createMockCanvas(800, 1000);
        return { style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, children: [], appendChild() {} };
      },
    };

    const { $ } = createMockDom();
    const hud = new Hud({ $, factions: content.factions, weaponsData });

    let citationShared = false;
    hud.shareCitation = async () => {
      citationShared = true;
      return true;
    };

    const sim = {
      winner: 0,
      score: [50, 42],
      actors: [
        { id: 'a1', name: 'Chad Pro', team: 0, faction: 'bros', kills: 14, deaths: 2 },
        { id: 'a2', name: 'Karen Loser', team: 1, faction: 'karens', kills: 1, deaths: 15 },
      ],
      mode: { constructor: { label: 'Cul-de-Sac Clash' } },
    };

    const me = sim.actors[0];
    const library = { getLines: () => [{ text: 'We run this block!' }] };
    const rng = () => 0;

    hud.showEnd({
      sim,
      me,
      library,
      rng,
      onAgain: () => {},
      onMenu: () => {},
      voice: { say() {} },
    });

    const panelHtml = $('endPanel').innerHTML;
    assert.ok(panelHtml.includes('btnExportCitation'), '#btnExportCitation must be rendered in post-match panel HTML');
    assert.ok(panelHtml.includes('📜 HOA CITATION'), 'Button must display HOA citation label');

    const btnCitation = $('btnExportCitation');
    assert.ok(btnCitation, '#btnExportCitation button element must be accessible');
    assert.equal(typeof btnCitation.onclick, 'function', '#btnExportCitation click handler must be wired');

    await btnCitation.onclick();
    assert.ok(citationShared, 'Clicking #btnExportCitation in post-match screen must trigger shareCitation');
  } finally {
    globalThis.document = originalDoc;
  }
});
