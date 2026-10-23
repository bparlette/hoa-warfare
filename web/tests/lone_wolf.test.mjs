// Lone Wolf: one player against a whole faction. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { buildMap } from '../src/engine/map.js';
import { Sim } from '../src/engine/sim.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

function loneWolf(mapId = 'pickleball') {
  const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(3), mode: 'loneWolf', map: buildMap(mapId) });
  const me = s.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false });
  for (let i = 0; i < 6; i++) s.addActor({ id: 'e' + i, name: 'E' + i, team: 1, faction: 'karens' });
  s.start();
  return { s, me };
}

test('Lone Wolf: the 200 HP buff survives a respawn', () => {
  const { s, me } = loneWolf();
  assert.equal(me.hp, 200);
  s.respawn(me);
  assert.equal(me.hp, 200, 'respawn used to reset the lone player to 100 HP');
});

test('Lone Wolf: with the faction camped on the player spawns, the player spawns away from them', () => {
  const { s, me } = loneWolf();
  const base = s.map.spawns[0];
  // park one enemy on every player spawn point
  s.actors.filter(a => a.team === 1).forEach((e, i) => { const p = base[i % base.length]; Object.assign(e.pos, { x: p[0] + 1, y: 0, z: p[1] }); });
  s.respawn(me);
  const nearest = Math.min(...s.actors.filter(a => a.team === 1).map(e => Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)));
  assert.ok(nearest >= 10, `spawned ${nearest.toFixed(1)} m from an enemy`);
});
