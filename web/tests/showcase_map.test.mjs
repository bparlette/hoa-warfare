// Model Home Showcase: small, point-symmetric two-house map. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { MAPS, buildMap } from '../src/engine/map.js';
import { Sim } from '../src/engine/sim.js';
import { MODES } from '../src/engine/modes.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

function dijkstra(nodes, from) {
  const d = nodes.map(() => Infinity), seen = nodes.map(() => false);
  d[from] = 0;
  for (let k = 0; k < nodes.length; k++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!seen[i] && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || d[u] === Infinity) break;
    seen[u] = true;
    for (const l of nodes[u].links) d[l.to] = Math.min(d[l.to], d[u] + l.d);
  }
  return d;
}
const nearest = (nodes, x, z) => nodes.reduce((b, n, i) => (Math.hypot(n.x - x, n.z - z) < Math.hypot(nodes[b].x - x, nodes[b].z - z) ? i : b), 0);

test('showcase: registered as a full-game map', () => {
  assert.ok(MAPS.showcase && !MAPS.showcase.wip);
  assert.equal(MAPS.showcase.demoAllowed, false);
  assert.equal(buildMap('showcase').id, 'showcase');
});

test('showcase: every solid has a twin through the centre, and so do the spawns', () => {
  const m = buildMap('showcase');
  const key = b => [b.minX, b.maxX, b.minZ, b.maxZ, b.minY, b.maxY].map(v => v.toFixed(2)).join(',');
  const all = new Set(m.boxes.map(key));
  for (const b of m.boxes) {
    const twin = { minX: -b.maxX, maxX: -b.minX, minZ: -b.maxZ, maxZ: -b.minZ, minY: b.minY, maxY: b.maxY };
    assert.ok(all.has(key(twin)), `${b.kind} at (${b.minX},${b.minZ}) has a twin`);
  }
  assert.deepEqual(m.spawns[1], m.spawns[0].map(([x, z]) => [-x, -z]));
});

test('showcase: one connected nav graph, and both spawns are the same walk from the centre', () => {
  const m = buildMap('showcase');
  const d0 = dijkstra(m.nodes, nearest(m.nodes, 0, 32));
  const d1 = dijkstra(m.nodes, nearest(m.nodes, 0, -32));
  assert.ok(d0.every(Number.isFinite), 'every node reachable');
  const c = nearest(m.nodes, 0, 0);
  assert.ok(Math.abs(d0[c] - d1[c]) < 0.5, `centre walk ${d0[c].toFixed(1)} vs ${d1[c].toFixed(1)}`);
});

test('showcase: spawns are inside bounds and clear of props; the centre objective spot is open', () => {
  const m = buildMap('showcase');
  const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), mode: 'clash', map: m });
  for (const side of [0, 1]) for (const [x, z] of m.spawns[side]) {
    assert.ok(x > m.bounds.minX && x < m.bounds.maxX && z > m.bounds.minZ && z < m.bounds.maxZ);
    assert.ok(!s.blocked(x, z, 0), `spawn (${x},${z}) is clear`);
  }
  assert.ok(!s.blocked(0, 0, 0), 'centre is open');
});

test('showcase: every mode finishes a headless bot match with no actor stuck in a prop', () => {
  for (const mode of Object.keys(MODES).filter(m => m !== 'tutorial')) {
    const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(7), mode, map: buildMap('showcase') });
    for (let i = 0; i < 12; i++) s.addActor({ id: 'p' + i, name: 'P' + i, team: i % 2, faction: 'karens' });
    s.start();
    let stuck = 0, n = 0;
    while (!s.over && s.time < 300) {
      s.step(1 / 60); s.drainEvents();
      if (++n % 30 === 0) for (const a of s.actors) if (a.alive && s.blocked(a.pos.x, a.pos.z, a.pos.y)) stuck++;
    }
    assert.equal(stuck, 0, `${mode}: stuck samples`);
    assert.ok(s.score[0] + s.score[1] > 0 || mode === 'evictTheBlock', `${mode}: someone scored`);
  }
});
