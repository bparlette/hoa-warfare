// A respawn faces the way its spawn faces, including after a halftime side swap. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { buildMap, MAPS } from '../src/engine/map.js';
import { Sim, forwardOf } from '../src/engine/sim.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

test('spawn events carry the facing, and it flips with a halftime side swap', () => {
  const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(2), mode: 'clash', map: buildMap('culdesac') });
  const me = s.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false });
  s.start();
  s.mode.sidesSwapped = 0; s.drainEvents(); s.respawn(me);
  assert.equal(s.drainEvents().find(e => e.type === 'spawn').yaw, 0);
  s.mode.sidesSwapped = 1; s.respawn(me);
  assert.equal(s.drainEvents().find(e => e.type === 'spawn').yaw, Math.PI, 'after the swap team 0 spawns at the far end facing back up the map');
});

test('no spawn point stares at a wall: at least 6 m of open view straight ahead', () => {
  for (const id of Object.keys(MAPS)) {
    const map = buildMap(id);
    const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), mode: 'clash', map });
    for (const side of [0, 1]) for (const [x, z, yaw] of map.spawns[side]) {
      const hit = s.raycast({ x, y: 1.6, z }, forwardOf(yaw ?? (side === 0 ? 0 : Math.PI), 0), 80, null);
      assert.ok(!hit || hit.t >= 6, `${id} side ${side} spawn (${x}, ${z}) faces ${hit?.box?.kind || 'a prop'} ${hit?.t.toFixed(1)} m away`);
    }
  }
});
