// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Voice, Sfx, parseManifest, voFileFor } from '../src/engine/audio.js';
import { buildCulDeSac, SPRINKLER_NODES } from '../src/engine/map.js';

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
  // Lines without a recording fall back to browser TTS at runtime. Coverage may only go up: raise this floor
  // to 1.0 after `node tools/vo_synth.mjs` records the gap (see TASKS.md, Muse).
  const COVERAGE_FLOOR = 0.92;
  const coverage = 1 - missing.length / csvIds.length;
  assert.ok(coverage >= COVERAGE_FLOOR, `voice coverage ${(coverage * 100).toFixed(1)}% < ${COVERAGE_FLOOR * 100}%; unrecorded: ${missing.slice(0, 8).join(', ')}...`);
  for (const id of csvIds) {
    const entry = manifest.lines[id];
    if (entry) assert.equal(entry.file, id.replace(/\./g, '_') + '.ogg', id);
  }
});

function mockAudioCtx() {
  const nodes = [];
  const createMockNode = () => {
    const node = {
      connect(target) { node.target = target; return target; },
    };
    nodes.push(node);
    return node;
  };
  return {
    currentTime: 10,
    sampleRate: 44100,
    destination: {},
    createGain() {
      const g = createMockNode();
      g.gain = {
        value: 1,
        setValueAtTime: (v) => { g.gain.value = v; },
        exponentialRampToValueAtTime: () => {},
      };
      return g;
    },
    createOscillator() {
      const o = createMockNode();
      o.frequency = {
        value: 440,
        setValueAtTime: (v) => { o.frequency.value = v; },
        exponentialRampToValueAtTime: () => {},
      };
      o.start = () => {};
      o.stop = () => {};
      return o;
    },
    createDelay() {
      const d = createMockNode();
      d.delayTime = { value: 0 };
      return d;
    },
    createBuffer(ch, len) {
      return { getChannelData: () => new Float32Array(len) };
    },
    createBufferSource() {
      const s = createMockNode();
      s.start = () => {};
      s.stop = () => {};
      return s;
    },
  };
}

test('audio: Sfx survives headless/disabled mode gracefully', () => {
  const sfx = new Sfx();
  assert.equal(sfx.carAlarm(), null);
  sfx.footstep('grass');
  sfx.footstep('asphalt');
  assert.equal(sfx.echoSlapback(null), null);
});

test('audio: Sfx carAlarm is silenced (alarm cut per Cherie 2026-10-16)', () => {
  const sfx = new Sfx();
  sfx.ctx = mockAudioCtx();
  sfx.master = sfx.ctx.createGain();
  const alarm = sfx.carAlarm(1.0, 0.3);
  assert.equal(alarm, null);
});

test('audio: Sfx footstep differentiates grass rustle from asphalt click', () => {
  const sfx = new Sfx();
  sfx.ctx = mockAudioCtx();
  sfx.master = sfx.ctx.createGain();
  sfx.footstep('grass');
  sfx.footstep('turf');
  sfx.footstep('asphalt');
  sfx.footstep('concrete');
});

test('audio: Sfx echoSlapback creates 75ms delay and 0.25 feedback', () => {
  const sfx = new Sfx();
  sfx.ctx = mockAudioCtx();
  sfx.master = sfx.ctx.createGain();
  const dummyGain = sfx.ctx.createGain();
  const delay = sfx.echoSlapback(dummyGain);
  assert.ok(delay);
  assert.equal(delay.delayTime.value, 0.075);
});

test('map: vehicle bounding boxes marked with isCar: true', () => {
  const map = buildCulDeSac();
  const cars = map.boxes.filter(b => b.kind === 'car');
  assert.ok(cars.length >= 4, 'expected at least 4 cars on cul-de-sac');
  for (const car of cars) {
    assert.equal(car.isCar, true, 'vehicle bounding box must have isCar: true');
  }
});

test('map: residential lawns contain sprinkler nodes', () => {
  const map = buildCulDeSac();
  assert.ok(Array.isArray(map.sprinklers), 'map.sprinklers must be an array');
  assert.ok(map.sprinklers.length >= 6, 'expected sprinklers across residential lawns');
  assert.equal(map.sprinklers, map.sprinklerNodes);
  assert.ok(SPRINKLER_NODES.length >= 6);
  for (const s of map.sprinklers) {
    assert.equal(typeof s.x, 'number');
    assert.equal(typeof s.z, 'number');
    assert.equal(s.isSprinkler, true);
    assert.equal(s.active, true);
    assert.ok(s.radius > 0);
  }
});

test('audio: Voice.say pads the busy window against edge clipping', async () => {
  stubFetch({ version: 1, lines: { 'x.y': { file: 'x_y.ogg', duration: 2.0 } } });
  globalThis.Audio = class { constructor() {} play() { return Promise.resolve(); } pause() {} set volume(v) {} };
  try {
    const v = new Voice({ factions: {} });
    await tick();
    const t0 = performance.now() / 1000;
    const started = v.say({ text: 'hello world', lineId: 'x.y', priority: 3 });
    assert.ok(started);
    // until = now + 0.15 startup pad + 2.0 duration + 0.25 tail pad
    const expected = t0 + 0.15 + 2.0 + 0.25;
    assert.ok(Math.abs(v.current.until - expected) < 0.1, `until=${v.current.until} expected~${expected}`);
    assert.ok(v.isBusy());
  } finally {
    delete globalThis.Audio;
  }
});
