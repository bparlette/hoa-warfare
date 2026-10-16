// Unit and integration tests for Shady Pines Pickleball Club custom map layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPickleballClub, buildCulDeSac, buildMap, MAPS } from '../src/engine/map.js';
import { Sim } from '../src/engine/sim.js';

const dummyRules = {
  playerHp: 100,
  headshotMultiplier: 1.5,
  scoreToWin: 40,
  timeLimitSec: 300,
  respawnDelaySec: 2.5,
};

const dummyWeapons = {
  weapons: {
    blaster: {
      class: 'ar',
      fire: 'hitscan',
      damage: { body: 25, head: 40 },
      range: 50,
      mag: 30,
      fireInterval: 0.12,
      reloadTime: 1.8,
    },
  },
  loadouts: {
    default: { primary: 'blaster' },
  },
};

test('pickleball: buildPickleballClub returns complete and distinct map object', () => {
  const m = buildPickleballClub();
  assert.equal(m.id, 'pickleball');
  assert.equal(m.name, 'Shady Pines Pickleball Club');
  assert.ok(m.boxes.length > 50, `Expected >50 boxes, got ${m.boxes.length}`);

  // Signature must differ completely from cul-de-sac
  const base = buildCulDeSac();
  const sig = map => JSON.stringify(map.boxes.map(b => [b.kind, b.minX, b.maxX, b.minZ, b.maxZ, b.maxY]));
  assert.notEqual(sig(m), sig(base), 'Pickleball club must not be a duplicate/recolor of the cul-de-sac');
});

test('pickleball: MAPS registry entry is active and not WIP', () => {
  assert.ok(MAPS.pickleball);
  assert.equal(MAPS.pickleball.wip, false, 'Pickleball map must not be flagged WIP');
  assert.equal(MAPS.pickleball.freeInDemo, false, 'Pickleball map is paid $4.99 release feature');
  const active = buildMap('pickleball');
  assert.equal(active.id, 'pickleball');
  assert.equal(active.name, 'Shady Pines Pickleball Club');
});

test('pickleball: geometry contains 4 tournament courts, nets, bleachers, and golf carts', () => {
  const m = buildPickleballClub();

  const nets = m.boxes.filter(b => b.kind === 'pickleNet');
  assert.equal(nets.length, 4, 'Must have 4 regulation pickleball nets');
  for (const net of nets) {
    assert.equal(net.maxY - net.minY, 0.9, 'Net must be regulation 0.9m height');
  }

  const bleachers = m.boxes.filter(b => b.kind === 'bleachers');
  assert.ok(bleachers.length >= 4, 'Must have spectator bleachers on the sidelines');

  const golfCarts = m.boxes.filter(b => b.isGolfCart);
  assert.ok(golfCarts.length >= 5, 'Must have luxury golf carts parked as tactical cover');

  const fences = m.boxes.filter(b => b.kind === 'courtFence');
  assert.ok(fences.length >= 5, 'Must have court perimeter and dividing windscreens');

  const clubhouse = m.boxes.filter(b => b.kind === 'clubhouse');
  assert.ok(clubhouse.length >= 1, 'Must have country club clubhouse building');
});

test('pickleball: spawns are defined, within bounds, and non-colliding', () => {
  const m = buildPickleballClub();
  assert.ok(m.spawns[0]?.length >= 6, 'Team 0 spawns must exist');
  assert.ok(m.spawns[1]?.length >= 6, 'Team 1 spawns must exist');

  for (const team of [0, 1]) {
    for (const [x, z] of m.spawns[team]) {
      assert.ok(x >= m.bounds.minX && x <= m.bounds.maxX, `Spawn x=${x} within bounds`);
      assert.ok(z >= m.bounds.minZ && z <= m.bounds.maxZ, `Spawn z=${z} within bounds`);

      // Ensure spawns do not intersect solid tall boxes
      for (const b of m.boxes) {
        if (b.maxY > 0.5 && b.minY < 1.8) {
          const inside = x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
          assert.ok(!inside, `Spawn at (${x}, ${z}) should not intersect solid box ${b.kind}`);
        }
      }
    }
  }
});

test('pickleball: bot navmesh is connected across court zones', () => {
  const m = buildPickleballClub();
  assert.ok(m.nodes.length >= 25, `Expected >=25 nav nodes, got ${m.nodes.length}`);

  // Reachability test using BFS from north clubhouse node to south cart plaza node
  const startIdx = 0; // [0, -42] North
  const visited = new Set([startIdx]);
  const queue = [startIdx];

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const link of m.nodes[cur].links) {
      if (!visited.has(link.to)) {
        visited.add(link.to);
        queue.push(link.to);
      }
    }
  }

  // At least 90% of nodes must be reachable in single connected component
  const reachRatio = visited.size / m.nodes.length;
  assert.ok(reachRatio >= 0.9, `Nav graph connectivity ${reachRatio} >= 0.9`);
});

test('pickleball: Sim runs deterministic headless match on pickleball map', () => {
  const m = buildPickleballClub();
  const sim = new Sim({
    rules: dummyRules,
    weapons: dummyWeapons,
    map: m,
    mode: 'clash',
    rng: () => 0.5,
  });

  const p1 = sim.addActor({ id: 'p1', name: 'Dad', team: 0, isBot: false });
  const p2 = sim.addActor({ id: 'p2', name: 'Karen', team: 1, isBot: true });
  sim.start();

  assert.equal(sim.map.id, 'pickleball');
  assert.ok(p1.pos.z > 20, `Team 0 spawns south in cart plaza (got ${p1.pos.z})`);
  assert.ok(p2.pos.z < -20, `Team 1 spawns north on clubhouse terrace (got ${p2.pos.z})`);

  // Step simulation for 60 ticks (1 second)
  for (let i = 0; i < 60; i++) {
    sim.step(1 / 60);
  }

  assert.ok(p1.alive);
  assert.ok(p2.alive);
  assert.ok(sim.time > 0.9);
});
