#!/usr/bin/env node
// Map fairness probe: walking distance from each team's spawn centroid to the map centre, the enemy
// kitchen (Steal the Casserole) and the casserole objective, so a lopsided map can be measured instead
// of guessed. Uses the same nav graph the bots use.
//   node tools/fairness.mjs [maps]
import { MAPS, buildMap } from '../web/src/engine/map.js';
import { MODES } from '../web/src/engine/modes.js';

const ids = (process.argv[2] ? process.argv[2].split(',') : Object.keys(MAPS)).filter(id => MAPS[id] && !MAPS[id].wip);

function dijkstra(nodes, fromIndex) {
  const dist = new Array(nodes.length).fill(Infinity);
  const seen = new Array(nodes.length).fill(false);
  dist[fromIndex] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!seen[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    seen[u] = true;
    for (const l of nodes[u].links) if (dist[u] + l.d < dist[l.to]) dist[l.to] = dist[u] + l.d;
  }
  return dist;
}

const walkTo = (nodes, dist, p) => {
  let best = Infinity;
  nodes.forEach((n, i) => {
    if (!Number.isFinite(dist[i])) return;
    const d = dist[i] + Math.hypot(n.x - p.x, n.z - p.z);
    if (d < best) best = d;
  });
  return best;
};

const nearest = (nodes, x, z) => {
  let best = -1, bd = Infinity;
  nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } });
  return best;
};

for (const id of ids) {
  const map = buildMap(id);
  const nodes = map.nodes || [];
  const mode = new MODES.stealTheCasserole({ map, rules: {}, weapons: null, rng: () => 0.5 });
  const rows = [];
  for (const team of [0, 1]) {
    const pts = map.spawns[team];
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const start = nearest(nodes, cx, cz);
    const dist = dijkstra(nodes, start);
    const own = mode.kitchenPos(team);
    const enemy = mode.kitchenPos(1 - team);
    const centre = nearest(nodes, 0, 0);
    rows.push({
      team,
      spawn: [Math.round(cx), Math.round(cz)],
      kitchen: [Math.round(own.x), Math.round(own.z)],
      enemyKitchen: [Math.round(enemy.x), Math.round(enemy.z)],
      // Walk to the exact point: nearest node plus the straight leg to it. Kitchen points are often
      // link midpoints, so snapping to the nearest node reads up to half a link short.
      toOwnKitchen: +walkTo(nodes, dist, own).toFixed(1),
      toEnemyKitchen: +walkTo(nodes, dist, enemy).toFixed(1),
      toCentre: +dist[centre].toFixed(1),
    });
  }
  const gap = d => +(Math.max(d[0], d[1]) - Math.min(d[0], d[1])).toFixed(1);
  console.log(`\n${id}  nodes=${nodes.length}`);
  for (const r of rows) console.log(`  team ${r.team}: spawn ${r.spawn} → own kitchen ${r.kitchen} ${r.toOwnKitchen}m · enemy kitchen ${r.enemyKitchen} ${r.toEnemyKitchen}m · centre ${r.toCentre}m`);
  console.log(`  asymmetry: own-kitchen ${gap(rows.map(r => r.toOwnKitchen))}m · enemy-kitchen ${gap(rows.map(r => r.toEnemyKitchen))}m · centre ${gap(rows.map(r => r.toCentre))}m`);
}
