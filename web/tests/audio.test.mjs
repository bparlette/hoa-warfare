// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Voice, parseManifest, voFileFor } from '../src/engine/audio.js';

const tick = () => new Promise(r => setTimeout(r, 10));

function stubFetch(payload, ok = true) {
  globalThis.fetch = async () => ({ ok, json: async () => payload });
}

test('audio: voFileFor maps dots to underscores', () => {
  assert.equal(voFileFor('fratHouse.kill.c.0'), 'vo/fratHouse_kill_c_0.ogg');
  assert.equal(voFileFor('karens.spawn.alt'), 'vo/karens_spawn_alt.ogg');
});

test('audio: parseManifest accepts the legacy flat array', () => {
  const { ids, durations } = parseManifest(['a.b', 'c.d']);
  assert.deepEqual([...ids].sort(), ['a.b', 'c.d']);
  assert.equal(durations.size, 0);
});

test('audio: parseManifest accepts the rich T11 schema', () => {
  const { ids, durations } = parseManifest({
    version: 1,
    lines: {
      'fratHouse.kill.c.0': { file: 'fratHouse_kill_c_0.ogg', duration: 1.307 },
      'karens.spawn.alt': { file: 'karens_spawn_alt.ogg', duration: 0.9 },
    },
  });
  assert.ok(ids.has('fratHouse.kill.c.0'));
  assert.ok(ids.has('karens.spawn.alt'));
  assert.equal(durations.get('fratHouse.kill.c.0'), 1.307);
});

test('audio: parseManifest tolerates garbage', () => {
  assert.deepEqual([...parseManifest(null).ids], []);
  assert.deepEqual([...parseManifest(undefined).ids], []);
  assert.deepEqual([...parseManifest('nope').ids], []);
});

test('audio: Voice loads the rich manifest and resolves real durations', async () => {
  stubFetch({ version: 1, lines: { 'x.y': { file: 'x_y.ogg', duration: 2.5 } } });
  const v = new Voice({ factions: {} });
  await tick();
  assert.ok(v.manifest.has('x.y'));
  assert.equal(v.durations.get('x.y'), 2.5);
});

test('audio: Voice loads the legacy flat-array manifest', async () => {
  stubFetch(['x.y']);
  const v = new Voice({ factions: {} });
  await tick();
  assert.ok(v.manifest.has('x.y'));
  assert.equal(v.durations.size, 0);
});

test('audio: Voice survives a missing manifest', async () => {
  stubFetch(null, false);
  const v = new Voice({ factions: {} });
  await tick();
  assert.equal(v.manifest.size, 0);
});

// Regression guard for T11: when web/vo/manifest.json is committed, it must
// cover every line ID from the recording sheet with matching filenames.
test('audio: committed manifest covers the full recording sheet', () => {
  const manifestPath = new URL('../../web/vo/manifest.json', import.meta.url);
  const csvPath = new URL('../../dist/vo_session_sheet.csv', import.meta.url);
  if (!existsSync(manifestPath) || !existsSync(csvPath)) {
    console.log('  (skip: manifest or recording sheet not present)');
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { ids } = parseManifest(manifest);
  const csv = readFileSync(csvPath, 'utf8').split('\n').slice(1).filter(Boolean);
  const csvIds = csv.map(line => line.split('","')[1]);
  const missing = csvIds.filter(id => !ids.has(id));
  assert.deepEqual(missing, []);
  for (const id of csvIds) {
    const entry = manifest.lines[id];
    assert.equal(entry.file, id.replace(/\./g, '_') + '.ogg', id);
  }
});
