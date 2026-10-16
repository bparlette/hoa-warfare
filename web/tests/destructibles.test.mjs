// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveLoadout } from '../src/engine/sim.js';
import {
  buildCulDeSac,
  buildMap,
  sprinklers,
  mailboxes,
  glassTables,
  rocketPropane,
  destructibles,
  SPRINKLERS,
  MAILBOXES,
  GLASS_TABLES,
  ROCKET_PROPANE,
} from '../src/engine/map.js';
import { Sfx, sfx } from '../src/engine/audio.js';

const weaponsData = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

test('weapons.json: resolves leafBlower with knockback parameters', () => {
  const lb = weaponsData.weapons.leafBlower;
  assert.ok(lb, 'leafBlower weapon must exist in weapons.json');
  assert.equal(lb.class, 'special', 'leafBlower class must be special');
  assert.equal(lb.slot, 'equipment', 'leafBlower slot must be equipment');
  assert.equal(lb.fire, 'hitscan', 'leafBlower fire must be hitscan');
  assert.equal(lb.pellets, 6, 'leafBlower pellets must be 6');
  assert.equal(lb.range, 14, 'leafBlower range must be 14m');
  assert.deepEqual(lb.damage, { body: 35, head: 50 }, 'leafBlower damage must be body: 35, head: 50');
  assert.equal(lb.knockback, 18, 'leafBlower knockback impulse must be 18 m/s');
  assert.equal(lb.name, 'The HOA Blower', 'leafBlower name must be "The HOA Blower"');
  assert.equal(lb.feedIcon, '🍃', 'leafBlower feedIcon must be 🍃');

  // Verify resolveLoadout resolves leafBlower with knockback
  const resolved = resolveLoadout(weaponsData, { equipment: 'leafBlower' });
  assert.ok(resolved.equipment, 'resolved loadout must contain equipment slot');
  assert.equal(resolved.equipment.id, 'leafBlower');
  assert.equal(resolved.equipment.knockback, 18);
  assert.equal(resolved.equipment.pellets, 6);

  // Verify named loadout if present
  if (weaponsData.loadouts.leafBlower) {
    const namedLoadout = resolveLoadout(weaponsData, 'leafBlower');
    assert.equal(namedLoadout.equipment.id, 'leafBlower');
    assert.equal(namedLoadout.equipment.knockback, 18);
  }
});

test('map.js: exports sprinklers, mailboxes, glass tables, and rocket propane props', () => {
  // Test named array exports
  assert.ok(Array.isArray(sprinklers), 'sprinklers must be exported as an array');
  assert.ok(sprinklers.length >= 6, 'must have active sprinklers across residential lawns');
  assert.equal(sprinklers, SPRINKLERS);

  for (const s of sprinklers) {
    assert.equal(s.kind, 'sprinkler');
    assert.equal(typeof s.pos?.x, 'number');
    assert.equal(s.pos.y, 0);
    assert.equal(typeof s.pos?.z, 'number');
    assert.equal(s.active, true);
    assert.equal(s.radius, 2.5);
  }

  // Test mailboxes export
  assert.ok(Array.isArray(mailboxes), 'mailboxes must be exported as an array');
  assert.ok(mailboxes.length >= 4, 'must have destructible mailboxes along curbs');
  assert.equal(mailboxes, MAILBOXES);

  const mb1 = mailboxes.find(m => m.id === 'mailbox_1');
  assert.ok(mb1, 'mailbox_1 must exist in mailboxes');
  assert.equal(mb1.kind, 'mailbox');
  assert.equal(typeof mb1.pos.x, 'number');
  assert.equal(mb1.pos.y, 0);
  assert.equal(typeof mb1.pos.z, 'number');
  assert.equal(mb1.hp, 25);
  assert.equal(mb1.maxHp, 25);
  assert.equal(mb1.destroyed, false);

  for (const m of mailboxes) {
    assert.equal(m.kind, 'mailbox');
    assert.equal(m.hp, 25);
    assert.equal(m.maxHp, 25);
    assert.equal(m.destroyed, false);
  }

  // Test glassTables export
  assert.ok(Array.isArray(glassTables), 'glassTables must be exported as an array');
  assert.ok(glassTables.length >= 1, 'must have glass patio tables');
  assert.equal(glassTables, GLASS_TABLES);

  const gt1 = glassTables.find(g => g.id === 'glassTable_1');
  assert.ok(gt1, 'glassTable_1 must exist in glassTables');
  assert.equal(gt1.kind, 'glassTable');
  assert.equal(typeof gt1.pos.x, 'number');
  assert.equal(gt1.pos.y, 0);
  assert.equal(typeof gt1.pos.z, 'number');
  assert.equal(gt1.hp, 20);
  assert.equal(gt1.maxHp, 20);
  assert.equal(gt1.destroyed, false);

  // Test rocketPropane export
  assert.ok(Array.isArray(rocketPropane), 'rocketPropane must be exported as an array');
  assert.ok(rocketPropane.length >= 1, 'must have rocket propane tanks');
  assert.equal(rocketPropane, ROCKET_PROPANE);

  const rp1 = rocketPropane.find(p => p.id === 'propane_1');
  assert.ok(rp1, 'propane_1 must exist in rocketPropane');
  assert.equal(rp1.kind, 'rocketPropane');
  assert.equal(typeof rp1.pos.x, 'number');
  assert.equal(rp1.pos.y, 0.5);
  assert.equal(typeof rp1.pos.z, 'number');
  assert.equal(rp1.hp, 30);
  assert.equal(rp1.maxHp, 30);
  assert.equal(rp1.triggered, false);
  assert.equal(rp1.destroyed, false);

  // Test destructibles combination
  assert.ok(Array.isArray(destructibles), 'destructibles must be exported as an array');
  assert.ok(destructibles.length >= mailboxes.length + glassTables.length + rocketPropane.length);

  // Test map instance exports via buildCulDeSac and buildMap
  const map = buildCulDeSac();
  assert.ok(Array.isArray(map.sprinklers), 'buildCulDeSac must return sprinklers array');
  assert.ok(Array.isArray(map.mailboxes), 'buildCulDeSac must return mailboxes array');
  assert.ok(Array.isArray(map.glassTables), 'buildCulDeSac must return glassTables array');
  assert.ok(Array.isArray(map.rocketPropane), 'buildCulDeSac must return rocketPropane array');
  assert.ok(Array.isArray(map.destructibles), 'buildCulDeSac must return destructibles array');

  const built = buildMap('culdesac');
  assert.ok(Array.isArray(built.sprinklers), 'buildMap must return sprinklers array');
  assert.ok(Array.isArray(built.mailboxes), 'buildMap must return mailboxes array');
  assert.ok(Array.isArray(built.glassTables), 'buildMap must return glassTables array');
  assert.ok(Array.isArray(built.rocketPropane), 'buildMap must return rocketPropane array');
});

test('audio: audio methods exist on sfx', () => {
  const instances = [sfx, new Sfx()];
  for (const inst of instances) {
    assert.equal(typeof inst.sprinklerHiss, 'function', 'sfx.sprinklerHiss must be a function');
    assert.equal(typeof inst.glassShatter, 'function', 'sfx.glassShatter must be a function');
    assert.equal(typeof inst.leafBlowerHum, 'function', 'sfx.leafBlowerHum must be a function');
    assert.equal(typeof inst.mailboxCrunch, 'function', 'sfx.mailboxCrunch must be a function');
    assert.equal(typeof inst.rocketHiss, 'function', 'sfx.rocketHiss must be a function');

    // Headless / disabled safe execution
    assert.equal(inst.sprinklerHiss(), null);
    assert.equal(inst.glassShatter(), null);
    assert.equal(inst.leafBlowerHum(), null);
    assert.equal(inst.mailboxCrunch(), null);
    assert.equal(inst.rocketHiss(), null);
  }

  // Active AudioContext synthesized execution
  function createMockNode() {
    return {
      connect() { return this; },
      disconnect() {},
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
    };
  }

  const mockCtx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: createMockNode(),
    createOscillator() {
      const o = createMockNode();
      o.frequency = createMockNode();
      o.type = 'sawtooth';
      o.start = () => {};
      o.stop = () => {};
      return o;
    },
    createGain() {
      const g = createMockNode();
      g.gain = createMockNode();
      g.gain.value = 1;
      return g;
    },
    createDelay() {
      const d = createMockNode();
      d.delayTime = { value: 0 };
      return d;
    },
    createBuffer(ch, len) {
      return { getChannelData: () => new Float32Array(len) };
    },
    createBufferSource() {
      const s = createMockNode();
      s.start = () => {};
      s.stop = () => {};
      return s;
    },
  };

  const testSfx = new Sfx();
  testSfx.ctx = mockCtx;
  testSfx.master = mockCtx.createGain();

  const sh = testSfx.sprinklerHiss();
  assert.ok(sh && sh.source && sh.gain, 'sprinklerHiss creates water spray nodes');

  const gs = testSfx.glassShatter();
  assert.ok(gs && gs.source && gs.gain, 'glassShatter creates glass shatter nodes');

  const lb = testSfx.leafBlowerHum();
  assert.ok(lb && lb.osc && lb.gain && lb.windSource, 'leafBlowerHum creates 2-stroke and wind nodes');

  const mc = testSfx.mailboxCrunch();
  assert.ok(mc && mc.source && mc.gain, 'mailboxCrunch creates metal and splinter nodes');

  const rh = testSfx.rocketHiss();
  assert.ok(rh && rh.osc && rh.gain && rh.noiseSource, 'rocketHiss creates rocket whoosh nodes');
});
