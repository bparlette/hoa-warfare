// Actors must never end up frozen inside a prop. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { MAPS, buildMap } from '../src/engine/map.js';
import { Sim } from '../src/engine/sim.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const FACTIONS = Object.keys(content.factions).filter(f => content.factions[f].status !== 'draft');

function sim(map, mode = 'clash', seed = 7) {
  const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(seed), mode, map: buildMap(map), timeLimit: 300 });
  for (let i = 0; i < 12; i++) s.addActor({ id: 'p' + i, name: 'P' + i, team: i % 2, faction: FACTIONS[i % FACTIONS.length] });
  s.start();
  return s;
}

test('depenetrate: an actor that drops onto a prop rim is pushed back out, not trapped', () => {
  const s = sim('pickleball');
  const can = s.map.boxes.find(b => b.kind === 'trash');
  assert.ok(can, 'pickleball has a trash can');
  const a = s.actors[0];
  a.pos = { x: can.maxX + 0.2, y: 0, z: (can.minZ + can.maxZ) / 2 };
  assert.ok(s.blocked(a.pos.x, a.pos.z, a.pos.y), 'setup: actor overlaps the can');
  s.depenetrate(a);
  assert.ok(!s.blocked(a.pos.x, a.pos.z, a.pos.y), 'actor is free of the can');
  assert.ok(a.pos.x > can.maxX, 'pushed out on the near side');
});

test('no actor stays inside a prop during bot matches (pickleball hoaPatrol, stripmall casserole)', () => {
  for (const [map, mode] of [['pickleball', 'hoaPatrol'], ['stripmall', 'stealTheCasserole']]) {
    if (!MAPS[map]) continue;
    const s = sim(map, mode);
    let stuck = 0, n = 0;
    while (!s.over && s.time < 120) {
      s.step(1 / 60); s.drainEvents();
      if (++n % 30 === 0) for (const a of s.actors) if (a.alive && s.blocked(a.pos.x, a.pos.z, a.pos.y)) stuck++;
    }
    assert.equal(stuck, 0, `${map}/${mode}: actor samples inside a prop`);
  }
});
