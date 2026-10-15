import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContentLibrary } from '../src/core/content.js';
import { mulberry32 } from '../src/core/rng.js';
import { Sim, raySphere } from '../src/engine/sim.js';
import { BarkSystem } from '../src/engine/barks.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

function setupSim(seed = 1) {
  const rng = mulberry32(seed);
  const sim = new Sim({ rules: content.rules, weapons, rng, mode: 'clash' });
  const p0 = sim.addActor({ id: 'p0', name: 'Dad', team: 0, faction: 'hoaDads' });
  const p1 = sim.addActor({ id: 'p1', name: 'Karen', team: 1, faction: 'karens' });
  sim.start();
  return { sim, p0, p1, rng };
}

test('helicopter: raySphere intersection math', () => {
  const center = { x: 0, y: 16, z: 0 };
  const radius = 2.5;

  // Direct hit from below
  const t1 = raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, center, radius, 100);
  assert.ok(t1 !== null);
  assert.ok(Math.abs(t1 - (16 - 2.5)) < 1e-4);

  // Miss
  const t2 = raySphere({ x: 10, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, center, radius, 100);
  assert.equal(t2, null);

  // Pointing away
  const t3 = raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, center, radius, 100);
  assert.equal(t3, null);

  // Beyond maxT
  const t4 = raySphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, center, radius, 10);
  assert.equal(t4, null);
});

test('helicopter: spawning a helicopter tracks its orbit position', () => {
  const { sim, p0 } = setupSim();
  const h = sim.spawnHelicopter(p0);

  assert.ok(h.id.startsWith('helo_'));
  assert.equal(h.team, p0.team);
  assert.equal(h.ownerId, p0.id);
  assert.equal(h.hp, 160);
  assert.equal(h.maxHp, 160);
  assert.equal(h.alive, true);
  assert.equal(h.radius, 24);
  assert.equal(h.speed, 0.4);
  assert.equal(h.angle, 0);

  // Initial step: check orbit update
  sim.step(1.0);
  assert.ok(Math.abs(h.angle - 0.4) < 1e-4);
  const expectedX = Math.cos(h.angle) * 24;
  const expectedZ = Math.sin(h.angle) * 24;
  const expectedY = 16 + Math.sin(h.angle * 2) * 1.5;

  assert.ok(Math.abs(h.pos.x - expectedX) < 1e-4);
  assert.ok(Math.abs(h.pos.z - expectedZ) < 1e-4);
  assert.ok(Math.abs(h.pos.y - expectedY) < 1e-4);

  // Check snapshot includes helicopters
  const snap = sim.snapshot();
  assert.ok(snap.helicopters);
  assert.equal(snap.helicopters.length, 1);
  assert.equal(snap.helicopters[0].id, h.id);
  assert.equal(snap.helicopters[0].team, p0.team);
  assert.equal(snap.helicopters[0].ownerId, p0.id);
  assert.equal(snap.helicopters[0].hp, 160);
  assert.equal(snap.helicopters[0].alive, true);
  assert.ok(Math.abs(snap.helicopters[0].x - expectedX) < 1e-4);
  assert.ok(Math.abs(snap.helicopters[0].z - expectedZ) < 1e-4);
});

test('helicopter: shooting it inflicts damage', () => {
  const { sim, p0, p1 } = setupSim();
  const h = sim.spawnHelicopter(p0);
  sim.step(0.5);

  const origin = { x: 0, y: 1.6, z: 0 };
  const dx = h.pos.x - origin.x;
  const dy = h.pos.y - origin.y;
  const dz = h.pos.z - origin.z;
  const dist = Math.hypot(dx, dy, dz);
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };

  // Friendly fire should not damage helicopter
  const friendlyRes = sim.shootRay(origin, dir, 100, p0, 30);
  assert.equal(friendlyRes.hit, false);
  assert.equal(h.hp, 160);

  // Enemy shot damages helicopter
  const enemyRes = sim.shootRay(origin, dir, 100, p1, 40);
  assert.equal(enemyRes.hit, true);
  assert.equal(enemyRes.kind, 'helicopter');
  assert.equal(h.hp, 120);

  // Direct damageHelicopter call also reduces HP
  sim.damageHelicopter(h, 20, p1);
  assert.equal(h.hp, 100);
});

test('helicopter: reducing HP to 0 emits streakDestroyed event', () => {
  const { sim, p0, p1 } = setupSim();
  const h = sim.spawnHelicopter(p0);
  sim.step(0.5);

  const scoreBefore = sim.score[p1.team];
  sim.drainEvents();

  // Reduce HP to 0
  sim.damageHelicopter(h, 160, p1);

  assert.equal(h.hp, 0);
  assert.equal(h.alive, false);

  const evs = sim.drainEvents();
  const destroyed = evs.find(e => e.type === 'streakDestroyed');
  assert.ok(destroyed, 'streakDestroyed event was emitted');
  assert.equal(destroyed.streakType, 'helicopter');
  assert.equal(destroyed.killerId, p1.id);
  assert.equal(destroyed.killerTeam, p1.team);
  assert.equal(destroyed.ownerId, p0.id);
  assert.ok(Math.abs(destroyed.pos.x - h.pos.x) < 1e-4);

  // Killer team awarded score bonus
  assert.equal(sim.score[p1.team], scoreBefore + 1);
});

test('helicopter: barks.process on streakDestroyed triggers the streakDestroyed voice line', () => {
  const { sim, p0, p1, rng } = setupSim();
  const library = new ContentLibrary(content, { script: 'clean' });
  const barks = new BarkSystem({ library, content, rng, sim });

  const h = sim.spawnHelicopter(p0);
  sim.step(0.5);
  sim.damageHelicopter(h, 160, p1);

  const evs = sim.drainEvents();
  const destroyed = evs.find(e => e.type === 'streakDestroyed');
  assert.ok(destroyed);

  const out = barks.process([destroyed], sim.time, p1.id);
  assert.ok(out.barks.length > 0, 'barks array contains streakDestroyed line');

  const bark = out.barks.find(b => b.eventId === 'streakDestroyed');
  assert.ok(bark, 'found streakDestroyed bark');
  assert.equal(bark.speakerId, p1.id);
  assert.equal(bark.speakerTeam, p1.team);
  assert.equal(typeof bark.text, 'string');
  assert.ok(bark.text.length > 0);
});

test('helicopter: earning killstreak 5 automatically spawns helicopter', () => {
  const { sim, p0, p1 } = setupSim();
  assert.equal(sim.helicopters.length, 0);

  // p0 gets 5 kills
  for (let k = 0; k < 5; k++) {
    p1.alive = true;
    p1.spawnProtectUntil = 0;
    sim.damage(p1, 200, p0);
  }

  assert.equal(p0.streak, 5);
  assert.equal(sim.helicopters.length, 1);
  assert.equal(sim.helicopters[0].ownerId, p0.id);
  assert.equal(sim.helicopters[0].alive, true);
});

test('helicopter: periodically acquires and fires at living enemies in line of sight', () => {
  const { sim, p0, p1 } = setupSim();
  const h = sim.spawnHelicopter(p0);

  // Position enemy p1 in open area without spawn protection
  p1.alive = true;
  p1.hp = 100;
  p1.pos = { x: 5, y: 0, z: 5 };
  p1.spawnProtectUntil = 0;

  // Clear events
  sim.drainEvents();

  // Step past fireInterval (0.8s)
  sim.step(1.0);

  const evs = sim.drainEvents();
  const shot = evs.find(e => e.type === 'heloShot');
  assert.ok(shot, 'helicopter fired tracer burst at enemy');
  assert.equal(shot.id, h.id);
  assert.equal(shot.ownerId, p0.id);
  assert.equal(shot.targetId, p1.id);
  assert.ok(p1.hp < 100, 'enemy took damage from helicopter fire');
});
