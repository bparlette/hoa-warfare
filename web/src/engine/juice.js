// Impact feel: camera shake, recoil impulses and spring helpers.
//
// The rule this file exists for (gamepress "Zero-Compromise Quality", docs/RECIPES-RULES.md rule 10): game
// feel is not a constraint to compromise on. Before this, a kill in HOA moved nothing on screen - the shot
// sound played, a number appeared, and the camera was identical to standing still.
//
// Shake model is trauma-based (Squirrel Eiserloh, "Juice it or lose it"): events add trauma, trauma decays
// linearly, and the shake magnitude is trauma SQUARED. Squaring is what keeps small hits subtle and big
// hits violent, and it means shake saturates instead of stacking: five small hits cannot match one
// explosion. Noise is sampled from a seeded value-noise table, so a replay with the same seed shakes the
// same way - `?seed=N` determinism matters for the video tooling and for bug reports.
//
// Rotation offsets are radians, translation is metres: the caller adds them to whatever the camera was
// already doing, so this never fights the pitch/yaw the player is aiming with.

import { mulberry32 } from '../core/rng.js';

// Degrees of shake per axis at full trauma. Roll reads as the most violent, so it gets the most.
const MAX_YAW = 0.012;
const MAX_PITCH = 0.012;
const MAX_ROLL = 0.028;
const MAX_SHIFT = 0.055; // metres of lateral camera wobble at full trauma

// How fast trauma leaves, in units per second. 1.6 means a full-trauma explosion is spent in ~0.6 s.
const DECAY = 1.6;

// Value noise: a small seeded table, wrapped, sampled with smooth (cosine) interpolation. Cheaper than
// real Perlin and indistinguishable at these amplitudes.
function makeNoise(seed) {
  const rand = mulberry32(seed);
  const N = 256;
  const table = new Float32Array(N);
  for (let i = 0; i < N; i++) table[i] = rand() * 2 - 1;
  return (t) => {
    const x = t < 0 ? 0 : t;
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i & (N - 1)];
    const b = table[(i + 1) & (N - 1)];
    const s = 0.5 - 0.5 * Math.cos(f * Math.PI); // smoothstep-ish, C1 continuous
    return a + (b - a) * s;
  };
}

export function createJuice({ seed = 1, decay = DECAY, maxTrauma = 1 } = {}) {
  const noiseYaw = makeNoise(seed * 7919 + 11);
  const noisePitch = makeNoise(seed * 6271 + 29);
  const noiseRoll = makeNoise(seed * 5233 + 47);
  const noiseShift = makeNoise(seed * 4099 + 71);

  let trauma = 0;
  let t = 0;
  // Recoil is separate from trauma: it is a directional impulse the player caused, so it must not wobble
  // like noise. It springs back to zero.
  const kick = { pitch: 0, yaw: 0, vp: 0, vy: 0 };
  let lastHit = -99;

  const api = {
    // Add trauma. 0.18 = a hit landing on you, 0.25 = you killed someone, 0.5 = an explosion nearby.
    add(amount) {
      trauma = Math.min(maxTrauma, Math.max(0, trauma + amount));
      return api;
    },
    // A directional camera punch, used on firing. Springs back on its own.
    punch(pitch, yaw = 0) {
      kick.pitch += pitch;
      kick.yaw += yaw;
      return api;
    },
    // Mark "you just hit someone" so the HUD can flash a hit marker.
    hit(stamp = t) {
      lastHit = stamp;
      return api;
    },
    hitMarkerAge() {
      return t - lastHit;
    },
    update(dt) {
      if (!(dt > 0)) return api;
      t += dt;
      trauma = Math.max(0, trauma - DECAY * dt);
      // Critically-damped spring for the recoil impulse (stable at any dt).
      const k = 140, c = 22;
      kick.vp += (-k * kick.pitch - c * kick.vp) * dt;
      kick.vy += (-k * kick.yaw - c * kick.vy) * dt;
      kick.pitch += kick.vp * dt;
      kick.yaw += kick.vy * dt;
      return api;
    },
    // Offsets to add to the camera this frame. Magnitude is trauma^2 (see note at the top).
    sample() {
      const s = trauma * trauma;
      // Multiply the clock so consecutive frames read different noise, and keep axes out of phase.
      const clock = t * 22;
      return {
        yaw: kick.yaw + noiseYaw(clock) * MAX_YAW * s,
        pitch: kick.pitch + noisePitch(clock + 31.7) * MAX_PITCH * s,
        roll: noiseRoll(clock + 67.3) * MAX_ROLL * s,
        x: noiseShift(clock + 13.1) * MAX_SHIFT * s,
        y: noiseShift(clock + 91.9) * MAX_SHIFT * s,
        trauma,
      };
    },
    get trauma() {
      return trauma;
    },
    reset() {
      trauma = 0;
      kick.pitch = kick.yaw = kick.vp = kick.vy = 0;
      lastHit = -99;
      return api;
    },
  };
  return api;
}

// Underdamped spring step for HUD numbers and scale pops (no three.js, so it is testable in node).
// Returns [value, velocity]; callers keep the velocity between frames.
export function springStep(value, velocity, target, dt, { stiffness = 180, damping = 18 } = {}) {
  if (!(dt > 0)) return [value, velocity];
  // Sub-step so a long frame (tab was backgrounded, or a tab-switch stall) cannot blow the spring up:
  // explicit Euler is only stable while stiffness * h^2 stays well under 1, so cap h rather than the
  // number of steps (capping steps still left h = 0.5 on a 2 s frame, which diverged).
  const h = Math.min(dt, 0.02);
  const steps = Math.min(128, Math.ceil(dt / h));
  let v = value, vel = velocity;
  for (let i = 0; i < steps; i++) {
    vel += (-stiffness * (v - target) - damping * vel) * h;
    v += vel * h;
  }
  return [v, vel];
}

// Trauma per event, so the numbers live in one place instead of scattered magic constants.
export const JUICE = {
  fireLight: 0.05,
  fireHeavy: 0.12,
  takeHit: 0.22,
  kill: 0.26,
  headshot: 0.34,
  explosionNear: 0.55,
  explosionFar: 0.28,
  objective: 0.3,
};
