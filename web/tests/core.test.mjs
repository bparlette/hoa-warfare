// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContentLibrary, estimateSeconds } from '../src/core/content.js';
import { BarkDirector } from '../src/core/barkDirector.js';
import { AudioLimiter, AnnouncerQueue } from '../src/core/audioLimiter.js';
import { CampingMonitor } from '../src/core/campingMonitor.js';
import { MatchTracker } from '../src/core/matchTracker.js';
import { ShuffleBag } from '../src/core/shuffleBag.js';
import { mulberry32 } from '../src/core/rng.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const lib = (o) => new ContentLibrary(content, o);
const dir = (l, f = 'karens', busy) => new BarkDirector({ library: l, faction: f, rng: mulberry32(1), isAnnouncerBusy: busy });

test('content: every shipping faction covers every required event', () => {
  for (const [id, f] of Object.entries(content.factions)) {
    if (f.status === 'draft') continue; // drafts are gated below; remove "status" when lines are complete
    for (const ev of content.requiredEvents) assert.ok(f.lines[ev]?.clean?.length, `${id} missing ${ev}`);
  }
});

test('content: draft factions are complete briefs and never ship by accident', () => {
  for (const [id, f] of Object.entries(content.factions)) {
    if (f.status === undefined) continue;
    assert.equal(f.status, 'draft', `${id}: only "draft" is a valid status`);
    assert.ok(!f.phase0, `${id}: a draft cannot be a Phase 0 faction`);
    assert.ok(f.name && f.tagline && f.look?.hat && f.voice?.gender, `${id}: needs name, tagline, look, voice`);
    assert.ok(f.brief?.angle && f.brief.jokeMines?.length && f.brief.rivalsFirst?.length, `${id}: needs a writer brief`);
    for (const r of f.brief.rivalsFirst) assert.ok(content.factions[r], `${id}: unknown rival ${r}`);
  }
});

test('content: 1.8-second rule (lint estimate) on every line', () => {
  const bad = lib().allLines().filter(r => estimateSeconds(r.text, content.rules.wordsPerSecond) > content.rules.maxBarkSec);
  assert.deepEqual(bad.map(r => `${r.id}: ${r.text}`), []);
});

test('content: legal-safe mode swaps flagged brand lines', () => {
  const safe = lib({ script: 'steam', legalSafe: true }).getLines('fratHouse', 'kill').map(l => l.text);
  assert.ok(!safe.some(t => /Zyn|Amex/.test(t)));
  const raw = lib({ script: 'steam', legalSafe: false }).getLines('fratHouse', 'kill').map(l => l.text);
  assert.ok(raw.some(t => /Zyn/.test(t)));
});

test('content: steamMode=replace and clean build never sees steam lines', () => {
  assert.deepEqual(lib({ script: 'steam' }).getLines('fratHouse', 'ownStreak').map(l => l.text), ['KEG STAND INCOMING!']);
  assert.deepEqual(lib({ script: 'clean' }).getLines('fratHouse', 'ownStreak').map(l => l.text), ['PIZZA PARTY INCOMING!']);
});

test('shuffle bag: no repeat until exhausted; script switch is safe', () => {
  const bag = new ShuffleBag(mulberry32(3));
  const items = ['a', 'b', 'c', 'd'];
  const seen = new Set([0, 1, 2, 3].map(() => bag.draw('k', items)));
  assert.equal(seen.size, 4);
  assert.ok(['x'].includes(bag.draw('k', ['x'])));
});

test('director: higher priority interrupts; lower is blocked while speaking', () => {
  const d = dir(lib());
  assert.ok(d.request('headshot', 0).ok);
  assert.equal(d.request('kill', 0.2, { skipChance: true }).reason, 'speaking-higher-or-equal');
  const dbl = d.request('double', 0.4);
  assert.ok(dbl.ok && dbl.interrupted);
});

test('director: double kill 1s after a kill is NOT eaten by the kill cooldown (v4 bug)', () => {
  const d = dir(lib());
  assert.ok(d.request('kill', 0, { skipChance: true }).ok);
  assert.ok(d.request('double', 1).ok);
});

test('director: per-tier cooldown, and stale priority does not block later lines', () => {
  const d = dir(lib());
  assert.ok(d.request('firstBlood', 0).ok);
  assert.ok(d.request('headshot', 10).ok, 'stale priority must not block');
  assert.equal(d.request('headshot', 12).reason, 'tier-cooldown');
});

test('director: chance failure is silence, no-lines falls through', () => {
  const d = dir(lib(), 'karens');
  d.rng = () => 0.99;
  assert.equal(d.requestFirst(['kill'], 0).reason, 'chance');
  d.rng = () => 0;
  const r = d.requestFirst(['rivalry', 'headshot'], 5, { victimFaction: 'gymRats' });
  assert.equal(r.eventId, 'headshot');
  const r2 = dir(lib(), 'karens').requestFirst(['rivalry', 'headshot'], 0, { victimFaction: 'hoaDads' });
  assert.equal(r2.eventId, 'rivalry');
});

test('director: ducks under announcer; killcam line always exists', () => {
  const d = dir(lib(), 'karens', () => true);
  assert.equal(d.request('firstBlood', 0).reason, 'announcer-ducking');
  assert.ok(d.killcamLine(['kill']).line.text);
});

test('announcer waits for high-priority bark', () => {
  const a = new AnnouncerQueue();
  a.push('First blood!');
  assert.equal(a.update(0, 8), null);
  assert.equal(a.update(1, -1), 'First blood!');
  assert.ok(a.isBusy(1.2));
});

test('limiter: self/fatal always; range, team scope, 4s gap', () => {
  const L = new AudioLimiter({ hearingRadius: 12, externalGapSec: 4 });
  const me = { id: 'me', team: 0, position: { x: 0, y: 0, z: 0 } };
  const b = (o) => ({ speakerId: 'x', speakerTeam: 1, scope: 'world', position: { x: 5, y: 0, z: 0 }, ...o });
  assert.equal(L.evaluate(b({ speakerId: 'me' }), me, 0).channel, 'self');
  assert.equal(L.evaluate(b({ isFatalToListener: true }), me, 0).channel, 'killcam');
  assert.equal(L.evaluate(b({ position: { x: 30, y: 0, z: 0 } }), me, 0).reason, 'out-of-range');
  assert.equal(L.evaluate(b({ scope: 'team' }), me, 0).reason, 'team-local');
  assert.ok(L.evaluate(b(), me, 0).play);
  assert.equal(L.evaluate(b(), me, 2).reason, 'external-gap');
  assert.ok(L.evaluate(b(), me, 4.1).play);
});

function simCamp(pathFn, seconds, opts = {}) {
  const m = new CampingMonitor(content.rules.camping);
  const dt = 1 / 30; const out = { warnAt: null, snitchAt: null };
  for (let t = 0; t <= seconds; t += dt) {
    const r = m.update(t, dt, pathFn(t), opts);
    if (r.state === 'warning' && out.warnAt === null) out.warnAt = t;
    if (r.state === 'snitch' && out.snitchAt === null) out.snitchAt = t;
  }
  return out;
}

test('camping: standing still warns ~17s, snitches ~20s', () => {
  const r = simCamp(() => ({ x: 0, z: 0 }), 25);
  assert.ok(Math.abs(r.warnAt - 17) < 0.5 && Math.abs(r.snitchAt - 20) < 0.5, JSON.stringify(r));
});

test('camping: A/D strafing across 3.1 m does not dodge it', () => {
  assert.ok(simCamp(t => ({ x: Math.floor(t) % 2 ? 3.1 : 0, z: 0 }), 30).snitchAt !== null);
});

test('camping: 2-second dash out and back does not reset it', () => {
  assert.ok(simCamp(t => ({ x: t > 10 && t < 12 ? 8 : 0, z: 0 }), 30).snitchAt !== null);
});

test('camping: actually moving never snitches; exempt never snitches', () => {
  assert.equal(simCamp(t => ({ x: Math.cos(t / 5) * 15, z: Math.sin(t / 5) * 15 }), 60).snitchAt, null);
  assert.equal(simCamp(() => ({ x: 0, z: 0 }), 60, { exempt: true }).snitchAt, null);
});

test('tracker: first blood, multikill, revenge, shutdown, streaks, melee', () => {
  const m = new MatchTracker(content);
  let r = m.registerKill({ killerId: 'a', victimId: 'b', now: 0 });
  assert.equal(r.killerEvents[0], 'firstBlood');
  r = m.registerKill({ killerId: 'a', victimId: 'c', now: 1, headshot: true });
  assert.equal(r.killerEvents[0], 'double');
  assert.ok(r.killerEvents.includes('headshot'));
  r = m.registerKill({ killerId: 'a', victimId: 'd', now: 10 });
  assert.equal(r.streakEarned, 3);
  assert.equal(r.killerEvents[0], 'ownStreak');
  r = m.registerKill({ killerId: 'b', victimId: 'a', now: 20, melee: true });
  assert.ok(r.isRevenge && r.isShutdown);
  assert.equal(r.victimEvent, 'humiliated');
  assert.equal(m.registerKill({ killerId: null, victimId: 'c', now: 30 }).victimEvent, 'selfKill');
});
