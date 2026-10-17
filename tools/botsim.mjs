#!/usr/bin/env node
// Headless bot matches for balance and map checks (no browser, ~60-400x real time).
//   node tools/botsim.mjs modes   [maps]   every map x mode, 12 bots: score, NaN, actors stuck in props, sim speed
//   node tools/botsim.mjs weapons [map]    K/D, accuracy and damage per primary weapon (6 seeds, all-Karen teams)
//   node tools/botsim.mjs factions [map]   K/D per faction (12 seeds, factions rotated across teams)
//   node tools/botsim.mjs mode <mode> [map] 6 seeds of one mode: total score per team, plus same-faction control
// [maps] is a comma list (default: every map). Results are deterministic per seed.
import { readFileSync } from 'node:fs';
import { Sim } from '../web/src/engine/sim.js';
import { MODES } from '../web/src/engine/modes.js';
import { MAPS, buildMap } from '../web/src/engine/map.js';
import { mulberry32 } from '../web/src/core/rng.js';

const root = new URL('..', import.meta.url);
const content = JSON.parse(readFileSync(new URL('data/hoa_content.json', root)));
const weapons = JSON.parse(readFileSync(new URL('data/weapons.json', root)));
const FACTIONS = Object.keys(content.factions).filter(f => content.factions[f].status !== 'draft');
const PRIMARIES = Object.keys(weapons.weapons).filter(k => weapons.weapons[k].slot === 'primary');

function match({ mode = 'clash', map = 'culdesac', seed = 1, limit = 300, actor = i => ({ team: i % 2, faction: FACTIONS[i % FACTIONS.length] }), onStep } = {}) {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(seed), mode, map: buildMap(map), timeLimit: limit });
  for (let i = 0; i < 12; i++) sim.addActor({ id: 'p' + i, name: 'P' + i, ...actor(i) });
  sim.start();
  let steps = 0;
  while (!sim.over && sim.time < limit + 100) {
    sim.step(1 / 60);
    const events = sim.drainEvents();
    onStep?.(sim, events, ++steps);
  }
  return sim;
}

const [cmd = 'modes', a1, a2] = process.argv.slice(2);
const mapList = s => (s ? s.split(',') : Object.keys(MAPS));

if (cmd === 'modes') {
  for (const map of mapList(a1)) for (const mode of Object.keys(MODES)) {
    let nan = 0, stuck = 0;
    const t0 = performance.now();
    try {
      const sim = match({ mode, map, seed: 7, onStep: (s, ev, n) => {
        if (n % 30) return;
        for (const a of s.actors) {
          if (!Number.isFinite(a.pos.x + a.pos.y + a.pos.z)) nan++;
          if (a.alive && s.blocked(a.pos.x, a.pos.z, a.pos.y)) stuck++;
        }
      } });
      const speed = (sim.time * 1000 / (performance.now() - t0)).toFixed(0);
      console.log(`${map.padEnd(12)} ${mode.padEnd(18)} t=${sim.time.toFixed(0).padStart(4)}s score=${sim.score} nan=${nan} stuck=${stuck} x${speed}`);
    } catch (err) {
      console.log(`${map.padEnd(12)} ${mode.padEnd(18)} CRASH ${err.message}`);
    }
  }
} else if (cmd === 'weapons') {
  const st = Object.fromEntries(PRIMARIES.map(w => [w, { shots: 0, hits: 0, kills: 0, deaths: 0 }]));
  for (let seed = 1; seed <= 6; seed++) {
    const sim = match({ map: a1 || 'culdesac', seed, actor: i => ({ team: i % 2, faction: 'karens', loadout: PRIMARIES[(Math.floor(i / 2) + seed) % PRIMARIES.length] }),
      onStep: (s, events) => {
        for (const e of events) if (e.type === 'shot') {
          const w = st[e.weaponId]; if (!w) continue;
          w.shots++;
          const victim = s.byId.get(e.hitId);
          if (victim && victim.team !== s.byId.get(e.id).team) w.hits++;
        }
      } });
    for (const a of sim.actors) { const w = st[a.weapons.primary.id]; w.kills += a.kills; w.deaths += a.deaths; }
  }
  for (const [w, s] of Object.entries(st).sort((x, y) => y[1].kills / y[1].deaths - x[1].kills / x[1].deaths)) {
    console.log(`${w.padEnd(18)} K/D ${(s.kills / (s.deaths || 1)).toFixed(2)}  ${s.kills}/${s.deaths}  acc ${(s.hits / (s.shots || 1)).toFixed(2)}  shots ${s.shots}`);
  }
} else if (cmd === 'factions') {
  const st = Object.fromEntries(FACTIONS.map(f => [f, { k: 0, d: 0 }]));
  for (let seed = 1; seed <= 12; seed++) {
    const sim = match({ map: a1 || 'culdesac', seed, actor: i => ({ team: i % 2, faction: FACTIONS[(i + seed) % FACTIONS.length] }) });
    for (const a of sim.actors) { st[a.faction].k += a.kills; st[a.faction].d += a.deaths; }
  }
  for (const [f, s] of Object.entries(st).sort((x, y) => y[1].k / y[1].d - x[1].k / x[1].d)) {
    console.log(`${f.padEnd(20)} K/D ${(s.k / (s.d || 1)).toFixed(2)}  ${s.k}/${s.d}`);
  }
} else if (cmd === 'mode') {
  if (!a1 || !MODES[a1]) { console.error(`usage: botsim.mjs mode <${Object.keys(MODES).join('|')}> [map]`); process.exit(1); }
  for (const same of [false, true]) {
    const tot = [0, 0];
    for (let seed = 1; seed <= 6; seed++) {
      const sim = match({ mode: a1, map: a2 || 'culdesac', seed, actor: i => ({ team: i % 2, faction: same ? 'karens' : FACTIONS[i % FACTIONS.length] }) });
      tot[0] += sim.score[0]; tot[1] += sim.score[1];
    }
    console.log(`${a1} on ${a2 || 'culdesac'} (${same ? 'same faction both teams' : 'mixed factions'}): total score ${tot[0]}-${tot[1]} over 6 seeds`);
  }
} else {
  console.error('usage: node tools/botsim.mjs modes|weapons|factions|mode <mode> [map]');
  process.exit(1);
}
