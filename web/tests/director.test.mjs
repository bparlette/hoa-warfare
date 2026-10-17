// Viral-video director (tools/director): scripts must drive the real sim deterministically, so kills, voice
// lines and camera land exactly where the script puts them. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Stage } from '../../tools/director/stage.js';
import ambush from '../../tools/director/scripts/hoa-ambush.mjs';

const root = new URL('../../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root)));
const deps = { content: json('data/hoa_content.json'), weapons: json('data/weapons.json'), manifest: json('web/vo/manifest.json') };
const run = script => { const s = new Stage({ script, ...deps }); while (!s.done) s.step(); return s; };

test('director: the example script plays out as written (both scripted kills, every line recorded)', () => {
  const s = run(ambush);
  assert.deepEqual(s.errors, []);
  const kills = s.log.filter(e => e.kill);
  assert.deepEqual(kills.map(k => [k.kill, k.by]), [['dad', 'karen'], ['maga', 'karen']]);
  assert.ok(kills[0].t > 4.9 && kills[0].t < 5.6, `first kill right after the 4.9 s fire cue (${kills[0].t})`);
  assert.ok(kills[1].t > 8.9 && kills[1].t < 9.8, `second kill right after the 8.9 s fire cue (${kills[1].t})`);
  const says = s.audio.filter(a => a.kind === 'voice');
  assert.equal(says.length, ambush.cues.filter(c => c.say).length);
});

test('director: same script, same result (deterministic), and nobody but scripted actors acts', () => {
  const a = run(ambush), b = run(ambush);
  assert.deepEqual(a.log, b.log);
  assert.ok(a.sim.actors.every(x => x.scripted));
});

test('director: script mistakes are reported, not silent', () => {
  const s = run({ name: 't', duration: 1, actors: [{ id: 'k', faction: 'karens', pos: [0, 20] }],
    cues: [{ t: 0.1, actor: 'k', say: 'karens.kill.c.999' }, { t: 0.2, actor: 'ghost', moveTo: [0, 0] }] });
  assert.equal(s.errors.length, 2);
  assert.match(s.errors[0], /no recorded line "karens.kill.c.999" \(try karens\.kill/);
  assert.match(s.errors[1], /no actor "ghost"/);
});

test('director: camera shots resolve and blend', () => {
  const s = new Stage({ script: ambush, ...deps });
  s.step();
  const c0 = s.camera();
  assert.ok(c0 && Number.isFinite(c0.from.x + c0.from.y + c0.from.z + c0.at.x));
  while (s.time < 6.9) s.step(); // just after the 6.8 s cut to a fixed camera with a 0.5 s blend
  const mid = s.camera();
  assert.ok(Math.hypot(mid.from.x - 5, mid.from.z - 0) > 0.5, 'still blending toward the fixed camera');
  while (s.time < 7.5) s.step();
  const fixed = s.camera();
  assert.ok(Math.hypot(fixed.from.x - 5, fixed.from.y - 2.6, fixed.from.z - 0) < 1e-6, 'arrived at the fixed camera');
});
