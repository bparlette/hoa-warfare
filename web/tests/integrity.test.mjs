// Cross-file integrity: content, voice manifest and audio files must agree after renames/cuts. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const content = JSON.parse(readFileSync(new URL('data/hoa_content.json', root)));
const manifest = JSON.parse(readFileSync(new URL('web/vo/manifest.json', root)));
const factions = new Set(Object.keys(content.factions));
const factionsOf = id => (id.startsWith('rivalry.') ? id.split('.')[1].split('-') : [id.split('.')[0]]);

test('every voice line in the manifest has its audio file (a missing file meant a silent, channel-blocking bark)', () => {
  const missing = Object.entries(manifest.lines).filter(([, e]) => !existsSync(new URL(`web/vo/${e.file}`, root))).map(([id]) => id);
  assert.deepEqual(missing.slice(0, 10), [], `${missing.length} manifest entries without a file`);
});

test('the manifest only lists factions that exist (renamed/cut factions are removed)', () => {
  const orphans = Object.keys(manifest.lines).filter(id => factionsOf(id).some(f => !factions.has(f)));
  assert.deepEqual(orphans.slice(0, 10), [], `${orphans.length} lines for factions that no longer exist`);
});

test('rivalries and briefs only reference existing factions', () => {
  for (const r of content.rivalry) assert.ok(factions.has(r.killer) && factions.has(r.victim), `${r.killer}>${r.victim}`);
  for (const [id, f] of Object.entries(content.factions)) for (const r of f.brief?.rivalsFirst || []) assert.ok(factions.has(r), `${id} brief -> ${r}`);
});

test('the demo faction list only uses shipping factions', () => {
  const src = readFileSync(new URL('web/src/engine/game.js', root), 'utf8');
  const demo = JSON.parse(src.match(/DEMO_FACTIONS\s*=\s*(\[[^\]]*\])/)[1].replace(/'/g, '"'));
  for (const id of demo) assert.ok(factions.has(id) && content.factions[id].status !== 'draft', id);
});

test('every map offered to players has its own layout (not a recolour of the cul-de-sac)', async () => {
  const { MAPS, buildMap, buildCulDeSac } = await import('../src/engine/map.js');
  const sig = m => JSON.stringify(m.boxes.map(b => [b.kind, b.minX, b.maxX, b.minZ, b.maxZ, b.maxY]));
  const base = sig(buildCulDeSac());
  for (const [id, def] of Object.entries(MAPS)) {
    if (id === 'culdesac') continue;
    if (def.wip) { assert.equal(buildMap(id).id, 'culdesac', `${id} is wip: buildMap falls back to the cul-de-sac`); continue; }
    assert.notEqual(sig(def.build()), base, `${id} is offered but has the cul-de-sac's geometry`);
  }
  const html = readFileSync(new URL('web/index.html', root), 'utf8');
  for (const [id, def] of Object.entries(MAPS)) if (def.wip) assert.match(html, new RegExp(`<option value="${id}" disabled`), `${id} must be disabled in the picker`);
});

test('every map: bot nav nodes stand on open ground and form one connected graph (bots walked into carts and nets)', async () => {
  const { MAPS, buildMap } = await import('../src/engine/map.js');
  for (const id of Object.keys(MAPS)) {
    const m = buildMap(id);
    const inside = m.nodes.filter(n => m.boxes.some(b => b.maxY > 0.45 && b.minY <= 1.8 && n.x > b.minX - 0.4 && n.x < b.maxX + 0.4 && n.z > b.minZ - 0.4 && n.z < b.maxZ + 0.4));
    assert.deepEqual(inside.map(n => [n.x, n.z]), [], `${id}: nav nodes inside solid props`);
    const seen = new Set([0]), q = [0];
    while (q.length) for (const { to } of m.nodes[q.pop()].links) if (!seen.has(to)) { seen.add(to); q.push(to); }
    assert.equal(seen.size, m.nodes.length, `${id}: nav graph is split`);
    for (const pts of Object.values(m.spawns)) for (const [x, z] of pts) assert.ok(!m.boxes.some(b => b.maxY > 0.45 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ), `${id}: spawn ${x},${z} inside a prop`);
  }
});
