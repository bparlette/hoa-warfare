// Online create-a-class: the server validates loadout/perk and the roster carries them. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Room, sanitizeClass } from '../../server/multiplayer.mjs';
import { OnlineSession } from '../src/engine/online.js';
import { Sim } from '../src/engine/sim.js';
import { mulberry32 } from '../src/core/rng.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const perks = JSON.parse(readFileSync(new URL('../../data/perks.json', import.meta.url)));
const fake = () => ({ writable: true, destroyed: false, writableLength: 0, write() {}, end() {}, destroy() {} });

test('sanitizeClass: only real primaries and perks get through', () => {
  assert.deepEqual(sanitizeClass({ loadout: 'trustFund', perk: 'cardioMom' }), { loadout: 'trustFund', perk: 'cardioMom' });
  assert.deepEqual(sanitizeClass({ loadout: 'lawsuit', perk: 'godMode' }), { loadout: null, perk: null }, 'equipment is not a primary; unknown perk');
  assert.deepEqual(sanitizeClass({ loadout: '__proto__', perk: '__proto__' }), { loadout: null, perk: null });
  assert.deepEqual(sanitizeClass({ loadout: 42, perk: {} }), { loadout: null, perk: null });
});

test('sanitizeClass: a demo server allows only the signature gun and demo perks', () => {
  const demoPerk = Object.keys(perks.perks).find(id => perks.perks[id].demoAllowed);
  const paidPerk = Object.keys(perks.perks).find(id => !perks.perks[id].demoAllowed);
  assert.deepEqual(sanitizeClass({ loadout: 'trustFund', perk: demoPerk }, { demo: true }), { loadout: null, perk: demoPerk });
  assert.equal(sanitizeClass({ perk: paidPerk }, { demo: true }).perk, null);
});

test('room: a player joins with their class, keeps it across a restart, and the roster carries it', () => {
  const room = new Room('cls', { restartMs: 99999 });
  room.stopLoop();
  const c = room.addPlayer(fake(), { name: 'Sniper', faction: 'karens', loadout: 'trustFund', perk: 'quickPaperwork' });
  assert.equal(c.actor.weapons.primary.id, 'trustFund');
  assert.equal(c.actor.perk, 'quickPaperwork');
  room.restartMatch();
  const again = room.sim.byId.get(c.actorId);
  assert.equal(again.weapons.primary.id, 'trustFund');
  assert.equal(again.perk, 'quickPaperwork');
  const p = room.rosterPlayers().find(r => r.id === c.actorId);
  assert.equal(p.primary, 'trustFund');
  assert.equal(p.perk, 'quickPaperwork');
});

test('room: a bad class request falls back to the faction signature gun', () => {
  const room = new Room('bad', { restartMs: 99999 });
  room.stopLoop();
  const c = room.addPlayer(fake(), { name: 'Hacker', faction: 'tradwives', loadout: 'participationTrophy', perk: 'aimbot' });
  assert.equal(c.actor.weapons.primary.id, 'divorceSettlement');
  assert.equal(c.actor.perk, null);
});

test('client mirror builds the same weapons and perk the server roster says', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), perks });
  const session = new OnlineSession({ connect() {}, disconnect() {} });
  session.sim = sim;
  const a = session.addMirrorActor({ id: 'p_1', name: 'Sniper', team: 0, faction: 'karens', primary: 'trustFund', perk: 'quickPaperwork' });
  assert.equal(a.weapons.primary.id, 'trustFund');
  assert.equal(a.perk, 'quickPaperwork');
  const b = session.addMirrorActor({ id: 'p_2', name: 'Old', team: 1, faction: 'tradwives' });
  assert.equal(b.weapons.primary.id, 'divorceSettlement', 'older servers send no primary: faction default');
});
