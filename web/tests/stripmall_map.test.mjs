// Unit and integration tests for Sunset Strip Mall Parking Lot custom map layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStripMall, buildPickleballClub, buildCulDeSac, buildMap, MAPS } from '../src/engine/map.js';
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

test('stripmall: buildStripMall returns complete and distinct map object', () => {
  const m = buildStripMall();
  assert.equal(m.id, 'stripmall');
  assert.equal(m.name, 'Sunset Strip Mall Parking Lot');
  assert.ok(m.boxes.length > 50, `Expected >50 boxes, got ${m.boxes.length}`);

  // Signature must differ completely from both cul-de-sac and pickleball
  const base = buildCulDeSac();
  const pb = buildPickleballClub();
  const sig = map => JSON.stringify(map.boxes.map(b => [b.kind, b.minX, b.maxX, b.minZ, b.maxZ, b.maxY]));
  assert.notEqual(sig(m), sig(base), 'Strip Mall must not be a duplicate/recolor of the cul-de-sac');
  assert.notEqual(sig(m), sig(pb), 'Strip Mall must not be a duplicate of pickleball');
});

test('stripmall: MAPS registry entry is active and not WIP', () => {
  assert.ok(MAPS.stripmall);
  assert.equal(MAPS.stripmall.wip, false, 'Strip Mall map must not be flagged WIP');
  assert.equal(MAPS.stripmall.freeInDemo, false, 'Strip Mall map is paid $4.99 release feature');
  const active = buildMap('stripmall');
  assert.equal(active.id, 'stripmall');
  assert.equal(active.name, 'Sunset Strip Mall Parking Lot');
});

test('stripmall: geometry contains supermarket, boutiques, awnings, dumpsters, cart corrals, and luxury SUVs', () => {
  const m = buildStripMall();

  const supermarket = m.boxes.filter(b => b.kind === 'supermarket');
  assert.ok(supermarket.length >= 2, 'Must have anchor supermarket buildings');

  const boutique = m.boxes.filter(b => b.kind === 'boutique');
  assert.ok(boutique.length >= 1, 'Must have boutique retail shop strip');

  const corrals = m.boxes.filter(b => b.kind === 'cartCorral');
  assert.equal(corrals.length, 2, 'Must have 2 shopping cart corrals');

  const suvs = m.boxes.filter(b => b.isSuv);
  assert.ok(suvs.length >= 6, 'Must have luxury suburban SUVs parked in stalls');

  const dumpsters = m.boxes.filter(b => b.kind === 'dumpster');
  assert.ok(dumpsters.length >= 2, 'Must have commercial waste dumpsters');

  const evChargers = m.boxes.filter(b => b.kind === 'evCharger');
  assert.ok(evChargers.length >= 4, 'Must have EV charging stations');

  const hvac = m.boxes.filter(b => b.kind === 'hvac');
  assert.ok(hvac.length >= 2, 'Must have rooftop HVAC units');
});

test('stripmall: spawns are defined, within bounds, and non-colliding', () => {
  const m = buildStripMall();
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

test('stripmall: bot navmesh is connected across parking lanes, storefronts, and loading bay', () => {
  const m = buildStripMall();
  assert.ok(m.nodes.length >= 25, `Expected >=25 nav nodes, got ${m.nodes.length}`);

  // Reachability test using BFS from south entrance node to north storefront promenade node
  const southNodeIdx = m.nodes.findIndex(n => n.z > 35 && Math.abs(n.x) < 10);
  assert.ok(southNodeIdx >= 0, 'Must have a southern entrance nav node');

  const northNodeIdx = m.nodes.findIndex(n => n.z < -20 && Math.abs(n.x) < 10);
  assert.ok(northNodeIdx >= 0, 'Must have a northern storefront promenade nav node');

  const visited = new Set();
  const queue = [southNodeIdx];
  visited.add(southNodeIdx);

  while (queue.length > 0) {
    const cur = queue.shift();
    const node = m.nodes[cur];
    for (const link of node.links) {
      if (!visited.has(link.to)) {
        visited.add(link.to);
        queue.push(link.to);
      }
    }
  }

  assert.ok(visited.has(northNodeIdx), 'North storefront node must be reachable from south entrance');
  const connectivityRatio = visited.size / m.nodes.length;
  assert.ok(connectivityRatio >= 0.85, `Graph connectivity must be >= 85%, got ${(connectivityRatio * 100).toFixed(1)}%`);
});

test('stripmall: Sim runs deterministic headless match on stripmall map', () => {
  const map = buildStripMall();
  const sim = new Sim({
    map,
    rules: dummyRules,
    weapons: dummyWeapons,
    mode: 'clash',
    rng: () => 0.5,
  });

  const p0 = sim.addActor({ id: 'p0', name: 'Karen', team: 0, isBot: false });
  const p1 = sim.addActor({ id: 'p1', name: 'Brad', team: 1, isBot: true });

  sim.start();

  assert.equal(p0.alive, true);
  assert.equal(p1.alive, true);

  // Run 30 ticks of simulation
  for (let t = 0; t < 30; t++) {
    sim.step(1 / 60);
  }

  assert.ok(p0.pos.x >= map.bounds.minX && p0.pos.x <= map.bounds.maxX);
  assert.ok(p0.pos.z >= map.bounds.minZ && p0.pos.z <= map.bounds.maxZ);
  assert.ok(!Number.isNaN(p0.pos.x));
  assert.ok(!Number.isNaN(p1.pos.z));
});
