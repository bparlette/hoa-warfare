// Create-a-class: any primary + one perk from data/perks.json. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { buildMap } from '../src/engine/map.js';
import { Sim } from '../src/engine/sim.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const perks = JSON.parse(readFileSync(new URL('../../data/perks.json', import.meta.url)));
const EFFECTS = ['respawnMult', 'extraGrenades', 'sprintMult', 'explosiveDamageMult', 'reloadMult', 'uavImmune', 'revealBonusSec'];

function sim(withPerk, { loadout } = {}) {
  const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(5), mode: 'clash', map: buildMap('culdesac'), perks });
  const me = s.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false, perk: withPerk, loadout });
  const foe = s.addActor({ id: 'foe', name: 'Foe', team: 1, faction: 'karens', isBot: false });
  s.start();
  me.spawnProtectUntil = foe.spawnProtectUntil = 0;
  return { s, me, foe };
}

test('perks.json: every perk has copy, an icon and at least one known effect; two are in the demo', () => {
  const entries = Object.entries(perks.perks);
  assert.ok(entries.length >= 6);
  for (const [id, p] of entries) {
    assert.ok(p.name && p.desc && p.icon, `${id} has name/desc/icon`);
    assert.ok(EFFECTS.some(k => k in p), `${id} has an effect`);
  }
  assert.ok(entries.filter(([, p]) => p.demoAllowed).length >= 2);
});

test('unknown perk ids are ignored', () => {
  const { me } = sim('notAPerk');
  assert.equal(me.perk, null);
});

test('any primary can be carried with any faction', () => {
  const { me } = sim(null, { loadout: 'trustFund' });
  assert.equal(me.faction, 'karens');
  assert.equal(me.weapons.primary.id, 'trustFund');
});

test('Speak to the Manager: faster respawn', () => {
  const base = sim(null), perk = sim('speakToTheManager');
  for (const r of [base, perk]) r.s.damage(r.me, 999, r.foe);
  assert.ok(perk.me.respawnAt - perk.s.time < base.me.respawnAt - base.s.time);
});

test('Second Helping: one more Lawsuit', () => {
  assert.equal(sim('secondHelping').me.grenades, sim(null).me.grenades + 1);
});

test('Quick Paperwork: faster reload', () => {
  const base = sim(null), perk = sim('quickPaperwork');
  for (const r of [base, perk]) { r.me.ammo = 0; r.s.startReload(r.me); }
  assert.ok(perk.me.reloadUntil - perk.s.time < base.me.reloadUntil - base.s.time);
});

test('Thick-Skinned: less explosive damage, same bullet damage', () => {
  const base = sim(null), perk = sim('thickSkinned');
  for (const r of [base, perk]) r.s.damage(r.me, 50, r.foe, { explosive: true });
  assert.ok(perk.me.hp > base.me.hp);
  const b2 = sim(null), p2 = sim('thickSkinned');
  for (const r of [b2, p2]) r.s.damage(r.me, 30, r.foe);
  assert.equal(p2.me.hp, b2.me.hp);
});

test('Cardio Mom: faster sprint', () => {
  const dist = perk => {
    const { s, me } = sim(perk);
    me.pos = { x: 0, y: 0, z: 0 }; me.input.yaw = 0;
    Object.assign(me.input, { forward: 1, sprint: true });
    for (let i = 0; i < 30; i++) s.move(me, 1 / 60);
    return Math.hypot(me.pos.x, me.pos.z);
  };
  assert.ok(dist('cardioMom') > dist(null) * 1.05);
});

test('Off the Grid: hidden from the enemy Ring Doorbell UAV', () => {
  const { s, me, foe } = sim('offTheGrid');
  s.triggerRingUav(foe);
  assert.ok(!(me.revealedUntil > s.time));
  const other = sim(null);
  other.s.triggerRingUav(other.foe);
  assert.ok(other.me.revealedUntil > other.s.time);
});
