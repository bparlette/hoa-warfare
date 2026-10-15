#!/usr/bin/env node
// Weapon balance harness: computes and prints time-to-kill (TTK) and DPS curves
// across 5m, 15m, 30m, and 60m distances based on data/weapons.json.
// Usage: node tools/ttk.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const data = JSON.parse(readFileSync(resolve('data/weapons.json'), 'utf8'));
const TARGET_HP = 100;
const BODY_RADIUS = 0.42; // target hitbox radius in metres

function computeTTK(w, dist, isHeadshot = false) {
  if (w.fire !== 'hitscan') return { ttk: null, shots: null, hitChance: 1, dps: 0 };

  // 1. Damage with falloff
  let dmgPerRay = isHeadshot ? w.damage.head : w.damage.body;
  if (w.falloff && dist > w.falloff.startM) {
    dmgPerRay *= w.falloff.mult;
  }
  if (dist > w.range) {
    dmgPerRay = 0;
  }

  // 2. Spread hit probability
  const sigma = w.spread?.base || 0.001;
  const angularRadius = Math.atan2(BODY_RADIUS, dist);
  // Rayleigh distribution hit chance
  const hitChance = Math.min(1, Math.max(0.05, 1 - Math.exp(-Math.pow(angularRadius / sigma, 2) / 2)));

  const pellets = w.pellets || 1;
  const effectiveDmgPerShot = dmgPerRay * pellets * (pellets > 1 ? hitChance : (hitChance > 0.6 ? 1 : hitChance));

  if (effectiveDmgPerShot <= 0) return { ttk: Infinity, shots: Infinity, hitChance: 0, dps: 0 };

  const shotsToKill = Math.ceil(TARGET_HP / effectiveDmgPerShot);
  let time = (shotsToKill - 1) * w.intervalSec;

  // If shots exceed magazine capacity, add reload time
  if (shotsToKill > w.mag) {
    const reloads = Math.floor((shotsToKill - 1) / w.mag);
    time += reloads * w.reloadSec;
  }

  const dps = (effectiveDmgPerShot / w.intervalSec).toFixed(0);
  return { ttk: Number(time.toFixed(3)), shots: shotsToKill, hitChance: Number(hitChance.toFixed(2)), dps: Number(dps) };
}

const distances = [5, 15, 30, 60];
console.log('========================================================================');
console.log('       CALL OF KAREN: HOA WARFARE — WEAPON BALANCE HARNESS (TTK)        ');
console.log('========================================================================');
console.log('Weapon                  Class    5m TTK    15m TTK   30m TTK   60m TTK  ');
console.log('------------------------------------------------------------------------');

const results = {};
for (const [id, w] of Object.entries(data.weapons)) {
  if (w.fire !== 'hitscan') continue;
  results[id] = {};
  const cells = distances.map(d => {
    const res = computeTTK(w, d);
    results[id][d] = res;
    if (res.ttk === Infinity || distExceeded(w, d)) return '   --   ';
    return `${res.ttk.toFixed(2)}s (${res.shots}k)`.padEnd(9);
  });
  const name = w.name.padEnd(23);
  const cls = w.class.toUpperCase().padEnd(8);
  console.log(`${name} ${cls} ${cells.join(' ')}`);
}

function distExceeded(w, d) {
  return d > w.range;
}

console.log('------------------------------------------------------------------------');
console.log('\n🔍 BALANCE SANITY CHECKS:');

// Check 1: Shotgun dominates at 5m
const sg5 = results.divorceSettlement?.[5]?.ttk;
const ar5 = results.allowance?.[5]?.ttk;
const smg5 = results.sideHustle?.[5]?.ttk;
console.log(`• 5m Point-Blank: Shotgun (${sg5}s) vs SMG (${smg5}s) vs AR (${ar5}s)`);
if (sg5 <= ar5 && sg5 <= smg5) {
  console.log('  ✅ Shotgun dominates point-blank (5m).');
} else {
  console.log('  ⚠️ Shotgun does not dominate point-blank.');
}

// Check 2: Sniper does NOT out-DPS AR at 10m
const ar10Dps = computeTTK(data.weapons.allowance, 10).dps;
const sn10Dps = computeTTK(data.weapons.trustFund, 10).dps;
console.log(`• 10m DPS: AR (${ar10Dps} dps) vs Sniper (${sn10Dps} dps)`);
if (ar10Dps > sn10Dps) {
  console.log('  ✅ AR out-DPSs Sniper at 10m.');
} else {
  console.log('  ⚠️ Sniper out-DPSs AR at 10m (Needs balance tuning).');
}

// Check 3: AR dominates mid-range (30m)
const ar30 = results.allowance?.[30]?.ttk;
const smg30 = results.sideHustle?.[30]?.ttk;
console.log(`• 30m Mid-Range: AR (${ar30}s) vs SMG (${smg30}s)`);
if (ar30 < smg30) {
  console.log('  ✅ AR outperforms SMG at mid-range (30m).');
} else {
  console.log('  ⚠️ SMG unexpectedly outperforms AR at 30m.');
}
console.log('========================================================================\n');
