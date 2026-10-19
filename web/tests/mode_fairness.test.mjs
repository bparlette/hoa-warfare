// Objective placement fairness (Steal the Casserole). Run: npm test
//
// The kitchens used to be placed with "45% of the way from the map centre to the spawns" — straight-line
// geometry snapped to the nearest nav node. On stripmall that put team 1's kitchen 13.6 m from its spawn
// and team 0's 29.5 m from its own, which online balance runs turned into an 18-5 sweep. These tests pin
// the rule that replaced it: both kitchens sit the same walk from their own spawns, on their own half.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, buildMap, nearestNode, navDistances } from '../src/engine/map.js';
import { MODES } from '../src/engine/modes.js';

const maps = Object.keys(MAPS).filter(id => MAPS[id] && !MAPS[id].wip);

const centroidOf = (spawns, side) => {
  const pts = spawns[side] || [];
  return {
    x: pts.reduce((s, p) => s + p[0], 0) / (pts.length || 1),
    z: pts.reduce((s, p) => s + p[1], 0) / (pts.length || 1),
  };
};

/** Walking distance to an exact point: nearest reachable node plus the straight leg to it. */
const walkTo = (nodes, dist, p) => {
  let best = Infinity;
  nodes.forEach((n, i) => {
    if (!Number.isFinite(dist[i])) return;
    const d = dist[i] + Math.hypot(n.x - p.x, n.z - p.z);
    if (d < best) best = d;
  });
  return best;
};

const kitchenWalks = map => {
  const mode = new MODES.stealTheCasserole({ map, rules: {}, weapons: null, rng: () => 0.5 });
  return [0, 1].map(team => {
    const own = centroidOf(map.spawns, team);
    const foe = centroidOf(map.spawns, 1 - team);
    const start = nearestNode(map.nodes, map.boxes, own.x, own.z);
    const foeStart = nearestNode(map.nodes, map.boxes, foe.x, foe.z);
    const dist = navDistances(map.nodes, start);
    const foeDist = navDistances(map.nodes, foeStart);
    const ownKitchen = mode.kitchenPos(team);
    const enemyKitchen = mode.kitchenPos(1 - team);
    return {
      team,
      ownKitchen,
      enemyKitchen,
      toOwnKitchen: walkTo(map.nodes, dist, ownKitchen),
      toEnemyKitchen: walkTo(map.nodes, dist, enemyKitchen),
      foeToOwnKitchen: walkTo(map.nodes, foeDist, ownKitchen),
      toCentre: walkTo(map.nodes, dist, { x: 0, z: 0 }),
    };
  });
};

for (const id of maps) {
  test(`${id}: both kitchens are the same walk from their own spawns`, () => {
    const rows = kitchenWalks(buildMap(id));
    const [a, b] = rows.map(r => r.toOwnKitchen);
    assert.ok(Number.isFinite(a) && Number.isFinite(b), `${id}: kitchens must be reachable (${a}, ${b})`);
    assert.ok(a > 5 && b > 5, `${id}: a kitchen must not sit on top of the spawns (${a.toFixed(1)} m, ${b.toFixed(1)} m)`);
    const gap = Math.abs(a - b);
    assert.ok(gap <= 4, `${id}: kitchen walk differs by ${gap.toFixed(1)} m (team 0 ${a.toFixed(1)} m, team 1 ${b.toFixed(1)} m)`);
  });

  test(`${id}: each kitchen is on its own team's half`, () => {
    const rows = kitchenWalks(buildMap(id));
    for (const r of rows) {
      // On your own half, your spawn must be the shorter walk to your own kitchen.
      assert.ok(r.toOwnKitchen < r.foeToOwnKitchen,
        `${id} team ${r.team}: enemy spawn reaches this kitchen sooner (${r.foeToOwnKitchen.toFixed(1)} m < ${r.toOwnKitchen.toFixed(1)} m)`);
    }
    const [t0, t1] = rows;
    assert.ok(Math.hypot(t0.ownKitchen.x - t1.ownKitchen.x, t0.ownKitchen.z - t1.ownKitchen.z) > 8,
      `${id}: the two kitchens are on top of each other`);
  });

  test(`${id}: the raid is a real trip, not a spawn camp`, () => {
    const rows = kitchenWalks(buildMap(id));
    for (const r of rows) {
      // Placing a kitchen next to the enemy spawn produced 0-0 matches (every carrier died instantly).
      assert.ok(r.toEnemyKitchen > 12, `${id} team ${r.team}: enemy kitchen only ${r.toEnemyKitchen.toFixed(1)} m away`);
    }
  });
}
