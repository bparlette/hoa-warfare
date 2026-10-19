import test from 'node:test';
import assert from 'node:assert/strict';
import { createJuice, springStep, JUICE } from '../src/engine/juice.js';

// A kill or a hit used to move nothing on screen. These tests hold the two properties that make the
// shake feel right rather than random: magnitude follows trauma squared, and it always returns to rest.

// All five axes exactly zero. Compared with Math.abs because -0 === 0 but deepEqual distinguishes them.
const assertAtRest = (s, why) => {
  for (const axis of ['yaw', 'pitch', 'roll', 'x', 'y']) assert.equal(Math.abs(s[axis]), 0, `${axis} not at rest ${why}`);
};

const run = (juice, frames = 60, dt = 1 / 60) => {
  let peak = 0, peakRoll = 0, peakShift = 0;
  for (let i = 0; i < frames; i++) {
    juice.update(dt);
    const s = juice.sample();
    peak = Math.max(peak, Math.abs(s.pitch), Math.abs(s.yaw));
    peakRoll = Math.max(peakRoll, Math.abs(s.roll));
    peakShift = Math.max(peakShift, Math.hypot(s.x, s.y));
  }
  return { peak, peakRoll, peakShift };
};

test('juice: trauma decays to rest and never goes negative', () => {
  const j = createJuice({ seed: 3 });
  j.add(1);
  assert.equal(j.trauma, 1);
  run(j, 240);
  assert.equal(j.trauma, 0);
  // At rest every axis is exactly zero, so a paused player has a dead-steady camera.
  assertAtRest(j.sample(), 'after decay');
});

test('juice: add() saturates instead of stacking, so five hits are not an explosion', () => {
  const j = createJuice();
  for (let i = 0; i < 5; i++) j.add(JUICE.takeHit);
  assert.equal(j.trauma, 1);
  assert.ok(JUICE.takeHit * 5 > 1, 'five hits would overflow if trauma were additive without a cap');
});

test('juice: magnitude follows trauma squared, not trauma', () => {
  const full = createJuice({ seed: 5 });
  full.add(1);
  const big = run(full, 30).peak;

  const half = createJuice({ seed: 5 });
  half.add(0.5);
  const small = run(half, 30).peak;

  // trauma^2: half the trauma should be about a quarter of the shake, not half of it. Allow a wide band
  // because the peak of a noise sample is not exactly proportional over a 30-frame window.
  const ratio = small / big;
  assert.ok(ratio > 0.12 && ratio < 0.45, `half trauma should read ~0.25 of the shake, got ${ratio.toFixed(2)}`);
});

test('juice: a full-trauma hit is visible but never enough to make you miss', () => {
  const j = createJuice({ seed: 9 });
  j.add(1);
  const { peak, peakRoll } = run(j, 60);
  assert.ok(peak > 0.004, `shake too small to notice: ${peak}`);
  assert.ok(peak < 0.03, `shake would throw off aim (${peak} rad)`);
  assert.ok(peakRoll < 0.05, `roll too violent: ${peakRoll} rad`);
});

test('juice: same seed shakes the same way, different seed does not', () => {
  const seq = (seed) => {
    const j = createJuice({ seed });
    j.add(1);
    const out = [];
    for (let i = 0; i < 20; i++) {
      j.update(1 / 60);
      out.push(Number(j.sample().roll.toFixed(6)));
    }
    return out;
  };
  assert.deepEqual(seq(4), seq(4));
  assert.notDeepEqual(seq(4), seq(5));
});

test('juice: a recoil punch springs back to centre instead of drifting', () => {
  const j = createJuice({ seed: 2 });
  j.punch(0.05, -0.02);
  const first = j.sample();
  assert.ok(first.pitch > 0.04 && first.yaw < -0.01, 'punch should show immediately');
  run(j, 120);
  const settled = j.sample();
  assert.ok(Math.abs(settled.pitch) < 0.001, `pitch did not settle: ${settled.pitch}`);
  assert.ok(Math.abs(settled.yaw) < 0.001, `yaw did not settle: ${settled.yaw}`);
});

test('juice: hit markers age from the moment the hit lands', () => {
  const j = createJuice();
  run(j, 5);
  j.hit();
  run(j, 3);
  // `hit()` stamps the juice clock, not the caller's, so use the age accessor rather than wall time.
  const age = j.hitMarkerAge();
  assert.ok(age >= 0 && age < 0.1, `age ${age}`);
});

test('juice: springStep converges on its target and survives a backgrounded tab', () => {
  let [v, vel] = [0, 0];
  for (let i = 0; i < 120; i++) [v, vel] = springStep(v, vel, 1, 1 / 60);
  assert.ok(Math.abs(v - 1) < 0.01, `spring did not reach target: ${v}`);

  // A 2-second frame (tab was hidden) must not fling the value to infinity.
  const [slow, slowVel] = springStep(0, 0, 1, 2);
  assert.ok(Number.isFinite(slow) && Math.abs(slow) < 5, `unstable on a long frame: ${slow} ${slowVel}`);
});

test('juice: reset() clears everything (map change / respawn must not keep shaking)', () => {
  const j = createJuice();
  j.add(1);
  j.punch(0.1, 0.1);
  j.reset();
  assert.equal(j.trauma, 0);
  assertAtRest(j.sample(), 'after reset');
});
