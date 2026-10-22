// Fine From Above: the 9-killstreak HOA drone gunship. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { buildMap } from '../src/engine/map.js';
import { Sim, FINE_FROM_ABOVE, droneView } from '../src/engine/sim.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

function sim({ isDemo = false, seed = 3 } = {}) {
  const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(seed), mode: 'clash', map: buildMap('culdesac'), isDemo });
  for (let i = 0; i < 12; i++) s.addActor({ id: 'p' + i, name: 'P' + i, team: i % 2, faction: 'karens' });
  s.start();
  for (const a of s.actors) a.spawnProtectUntil = 0;
  return s;
}

function aimAt(s, a, p) {
  s.aimDroneAt(a, p);
  a.yaw = a.input.yaw; a.pitch = a.input.pitch;
}

test('demo build: the 9-streak is teased, not granted', () => {
  const s = sim({ isDemo: true });
  assert.equal(s.startFineFromAbove(s.actors[0]), null);
  assert.ok(!s.actors[0].drone);
  assert.ok(s.drainEvents().some(e => e.type === 'streakLocked' && e.streakType === 'fineFromAbove'));
});

test('9th kill in a row calls in the drone', () => {
  const s = sim();
  const killer = s.actors[0];
  killer.streak = FINE_FROM_ABOVE.streak - 1;
  s.damage(s.actors[1], 999, killer);
  assert.ok(killer.drone, 'drone started');
  assert.ok(s.drainEvents().some(e => e.type === 'fineFromAboveStart' && e.id === killer.id));
});

test('a shell lands where the drone aims, kills enemies, spares teammates', () => {
  const s = sim();
  const pilot = s.actors[0];
  pilot.isBot = false; pilot.brain = null;
  const foe = s.actors[1], friend = s.actors[2];
  foe.pos = { x: 10, y: 0, z: 30 }; friend.pos = { x: 11, y: 0, z: 30 };
  for (const a of s.actors) if (a !== pilot && a !== foe && a !== friend) a.pos = { x: -30, y: 0, z: -30 };
  s.startFineFromAbove(pilot);
  s.time = pilot.drone.nextShot;
  pilot.input.fire = true;
  aimAt(s, pilot, { x: 10.5, y: 0, z: 30 });
  s.droneInput(pilot);
  assert.equal(s.fineShells.length, 1, 'shell called in');
  const shell = s.fineShells[0];
  assert.ok(Math.hypot(shell.pos.x - 10.5, shell.pos.z - 30) < 1.5, `lands on the aim point (${shell.pos.x.toFixed(1)}, ${shell.pos.z.toFixed(1)})`);
  assert.equal(pilot.input.fire, false, 'the gun does not fire while flying');
  s.time = shell.impactAt;
  s.stepFineShells();
  assert.ok(!foe.alive, 'enemy fined');
  assert.ok(friend.alive, 'teammate untouched');
});

test('the pilot stands still while flying', () => {
  const s = sim();
  const pilot = s.actors[0];
  pilot.isBot = false; pilot.brain = null;
  s.startFineFromAbove(pilot);
  const start = { ...pilot.pos };
  for (let i = 0; i < 120; i++) { Object.assign(pilot.input, { forward: 1, sprint: true }); s.step(1 / 60); }
  assert.ok(Math.hypot(pilot.pos.x - start.x, pilot.pos.z - start.z) < 0.05, 'did not walk');
});

test('the drone ends when the battery runs out or the pilot dies', () => {
  const s = sim();
  const a = s.actors[0], b = s.actors[2];
  s.startFineFromAbove(a);
  s.time = a.drone.until;
  s.droneInput(a);
  assert.equal(a.drone, null, 'battery dead');
  s.startFineFromAbove(b);
  s.damage(b, 999, s.actors[1]);
  assert.equal(b.drone, null, 'shot down with the pilot');
});

test('droneView looks down from the orbit for any mouse pitch', () => {
  const d = { startedAt: 0, angle: 0 };
  for (const pitch of [-1.45, 0, 1.45]) {
    const v = droneView(d, 0, pitch, 0, null);
    assert.equal(v.pos.y, FINE_FROM_ABOVE.altitude);
    assert.ok(v.dir.y < -0.3, `pitch ${pitch} still looks down`);
  }
});
