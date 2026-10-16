// Unit tests for HOA Patrol and Steal the Casserole game modes and radar objectives.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { Sim } from '../src/engine/sim.js';
import { MODES } from '../src/engine/modes.js';
import { Radar } from '../src/engine/radar.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

test('HoaPatrol: onStart spawns 3 zones (Gazebo, Clubhouse, Pool Patio)', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(101), mode: 'hoaPatrol' });
  sim.start();
  const zones = sim.mode.objects.filter(o => o.kind === 'patrolZone');
  assert.equal(zones.length, 3, 'should spawn 3 patrol zones');
  const names = zones.map(z => z.name);
  assert.ok(names.includes('Gazebo'), 'includes Gazebo');
  assert.ok(names.includes('Clubhouse'), 'includes Clubhouse');
  assert.ok(names.includes('Pool Patio'), 'includes Pool Patio');
  assert.deepEqual(zones.map(z => z.letter), ['A', 'B', 'C']);
  for (const z of zones) {
    assert.equal(z.ownerTeam, null);
    assert.equal(z.contested, false);
    assert.equal(z.capProgress, 0);
  }
});

test('HoaPatrol: uncontested presence in a zone captures it and increments score for that team', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(102), mode: 'hoaPatrol' });
  const a0 = sim.addActor({ id: 'a0', name: 'Alpha', team: 0, faction: 'karens', isBot: false });
  const b1 = sim.addActor({ id: 'b1', name: 'Bravo', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const zoneA = sim.mode.objects.find(o => o.kind === 'patrolZone' && o.letter === 'A');
  assert.ok(zoneA);

  // Place a0 in zone A, b1 far away
  Object.assign(a0.pos, { x: zoneA.pos.x, y: 0, z: zoneA.pos.z });
  Object.assign(b1.pos, { x: 50, y: 0, z: 50 });

  // CAP_SEC is 3.0s. Run for 3.5s (210 steps of 1/60s)
  for (let i = 0; i < 210; i++) sim.step(1 / 60);

  assert.equal(zoneA.ownerTeam, 0, 'Zone A should be captured by Team 0');
  assert.equal(zoneA.capProgress, 1, 'Zone A capture progress should be 1');

  // Step 2 more seconds: scoring happens once per second
  const scoreBefore = sim.score[0];
  for (let i = 0; i < 120; i++) sim.step(1 / 60);

  assert.ok(sim.score[0] > scoreBefore, `Team 0 score should increment (was ${scoreBefore}, now ${sim.score[0]})`);
  assert.equal(sim.score[1], 0, 'Team 1 score should remain 0');
});

test('HoaPatrol: contested zone freezes scoring', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(103), mode: 'hoaPatrol' });
  const a0 = sim.addActor({ id: 'a0', name: 'Alpha', team: 0, faction: 'karens', isBot: false });
  const b1 = sim.addActor({ id: 'b1', name: 'Bravo', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const zoneA = sim.mode.objects.find(o => o.kind === 'patrolZone' && o.letter === 'A');
  // First, let Team 0 capture zone A
  Object.assign(a0.pos, { x: zoneA.pos.x, y: 0, z: zoneA.pos.z });
  Object.assign(b1.pos, { x: 50, y: 0, z: 50 });
  for (let i = 0; i < 210; i++) sim.step(1 / 60);
  assert.equal(zoneA.ownerTeam, 0);

  // Now move b1 into zone A -> contested!
  Object.assign(b1.pos, { x: zoneA.pos.x + 1, y: 0, z: zoneA.pos.z + 1 });
  sim.step(1 / 60);
  assert.equal(zoneA.contested, true, 'zone should be contested');

  const frozenScore = sim.score[0];
  // Step 2 full seconds while contested
  for (let i = 0; i < 120; i++) sim.step(1 / 60);

  assert.equal(sim.score[0], frozenScore, 'scoring should be frozen while contested');
  assert.equal(sim.score[1], 0);
});

test('HoaPatrol: actors in zones are camping-exempt', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(104), mode: 'hoaPatrol' });
  const a0 = sim.addActor({ id: 'a0', name: 'Alpha', team: 0, faction: 'karens', isBot: false });
  const b1 = sim.addActor({ id: 'b1', name: 'Bravo', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const zoneB = sim.mode.objects.find(o => o.kind === 'patrolZone' && o.letter === 'B');
  Object.assign(a0.pos, { x: zoneB.pos.x, y: 0, z: zoneB.pos.z });
  Object.assign(b1.pos, { x: zoneB.pos.x + 30, y: 0, z: zoneB.pos.z + 30 });

  assert.equal(sim.mode.campingExempt(a0), true, 'actor inside zone is camping exempt');
  assert.equal(sim.mode.campingExempt(b1), false, 'actor outside zone is not exempt');
});

test('HoaPatrol: bots have goals pointing to zones', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(105), mode: 'hoaPatrol' });
  const bot = sim.addActor({ id: 'bot0', name: 'Bot0', team: 0, faction: 'karens', isBot: true });
  sim.start();

  const zones = sim.mode.objects.filter(o => o.kind === 'patrolZone');
  const goal = sim.mode.botGoal(bot);
  assert.ok(goal, 'bot should receive a non-null goal');
  const matchesZone = zones.some(z => z.pos.x === goal.x && z.pos.z === goal.z);
  assert.ok(matchesZone, 'bot goal must point directly to one of the patrol zone positions');
});

test('StealTheCasserole: onStart spawns bases and casseroles for Team 0 and Team 1', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(201), mode: 'stealTheCasserole' });
  sim.start();

  const bases = sim.mode.objects.filter(o => o.kind === 'casseroleBase');
  const casseroles = sim.mode.objects.filter(o => o.kind === 'casserole');
  assert.equal(bases.length, 2, 'should spawn 2 casserole bases');
  assert.equal(casseroles.length, 2, 'should spawn 2 casseroles');

  const base0 = bases.find(b => b.team === 0);
  const base1 = bases.find(b => b.team === 1);
  const c0 = casseroles.find(c => c.team === 0);
  const c1 = casseroles.find(c => c.team === 1);

  assert.ok(base0 && base1, 'both team bases must exist');
  assert.ok(c0 && c1, 'both team casseroles must exist');
  assert.equal(c0.state, 'home');
  assert.equal(c1.state, 'home');
  assert.equal(c0.carrierId, null);
  assert.equal(c1.carrierId, null);
  assert.deepEqual(c0.pos, c0.homePos);
  assert.deepEqual(c1.pos, c1.homePos);
});

test('StealTheCasserole: enemy actor running over casserole picks it up (state: carried)', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(202), mode: 'stealTheCasserole' });
  const a1 = sim.addActor({ id: 'a1', name: 'Infiltrator', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const c0 = sim.mode.getCasserole(0);
  assert.ok(c0);
  // Put enemy actor right on Team 0's casserole
  Object.assign(a1.pos, { x: c0.pos.x, y: 0, z: c0.pos.z });

  sim.step(1 / 60);

  assert.equal(c0.state, 'carried', 'casserole state should become carried');
  assert.equal(c0.carrierId, a1.id, 'casserole carrier should be the enemy actor');
});

test('StealTheCasserole: carrier bringing it to friendly home base captures and scores a point', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(203), mode: 'stealTheCasserole' });
  const a1 = sim.addActor({ id: 'a1', name: 'Infiltrator', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const c0 = sim.mode.getCasserole(0);
  const base1 = sim.mode.getBase(1);
  assert.ok(c0 && base1);

  // Pick up casserole 0
  Object.assign(a1.pos, { x: c0.pos.x, y: 0, z: c0.pos.z });
  sim.step(1 / 60);
  assert.equal(c0.state, 'carried');

  // Carry to friendly home base (Team 1 base)
  Object.assign(a1.pos, { x: base1.pos.x, y: 0, z: base1.pos.z });
  const initialScore = sim.score[1];
  sim.step(1 / 60);

  assert.equal(sim.score[1], initialScore + 1, 'Team 1 score should increase by 1 point');
  assert.equal(c0.state, 'home', 'captured casserole should reset to home state');
  assert.equal(c0.carrierId, null, 'carrier should be reset to null');
  assert.deepEqual(c0.pos, c0.homePos, 'casserole position should reset to its home base');
});

test('StealTheCasserole: carrier death drops casserole (state: dropped)', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(204), mode: 'stealTheCasserole' });
  const a0 = sim.addActor({ id: 'a0', name: 'Defender', team: 0, faction: 'karens', isBot: false });
  const a1 = sim.addActor({ id: 'a1', name: 'Thief', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const c0 = sim.mode.getCasserole(0);
  // a1 picks up c0
  Object.assign(a1.pos, { x: c0.pos.x, y: 0, z: c0.pos.z });
  sim.step(1 / 60);
  assert.equal(c0.state, 'carried');

  // Move a1 away to midfield
  Object.assign(a1.pos, { x: 5, y: 0, z: -10 });
  sim.step(1 / 60);

  // Kill carrier a1
  a1.spawnProtectUntil = 0;
  sim.damage(a1, 200, a0);

  assert.equal(c0.state, 'dropped', 'casserole should drop when carrier dies');
  assert.equal(c0.carrierId, null, 'carrier should be cleared');
  assert.equal(c0.pos.x, 5, 'dropped pos matches victim pos x');
  assert.equal(c0.pos.z, -10, 'dropped pos matches victim pos z');
  assert.ok(c0.droppedAt > 0, 'droppedAt timestamp should be recorded');
});

test('StealTheCasserole: friendly actor touching dropped casserole returns it home', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(205), mode: 'stealTheCasserole' });
  const a0 = sim.addActor({ id: 'a0', name: 'Defender', team: 0, faction: 'karens', isBot: false });
  const a1 = sim.addActor({ id: 'a1', name: 'Thief', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const c0 = sim.mode.getCasserole(0);
  // a1 picks up and drops c0 at midfield
  Object.assign(a1.pos, { x: c0.pos.x, y: 0, z: c0.pos.z });
  sim.step(1 / 60);
  Object.assign(a1.pos, { x: 8, y: 0, z: -5 });
  sim.step(1 / 60);
  a1.spawnProtectUntil = 0;
  sim.damage(a1, 200, a0);
  assert.equal(c0.state, 'dropped');

  // Friendly actor (a0, team 0) touches dropped casserole
  Object.assign(a0.pos, { x: c0.pos.x, y: 0, z: c0.pos.z });
  sim.step(1 / 60);

  assert.equal(c0.state, 'home', 'friendly touch should return casserole to home');
  assert.deepEqual(c0.pos, c0.homePos, 'casserole position returned to home');
});

test('StealTheCasserole: camping exemption for carrier and near home base', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(206), mode: 'stealTheCasserole' });
  const a0 = sim.addActor({ id: 'a0', name: 'Defender', team: 0, faction: 'karens', isBot: false });
  sim.start();

  const base0 = sim.mode.getBase(0);
  const c1 = sim.mode.getCasserole(1);

  // 1. Close to friendly home base (< 6m) -> exempt
  Object.assign(a0.pos, { x: base0.pos.x + 2, y: 0, z: base0.pos.z + 1 });
  assert.equal(sim.mode.campingExempt(a0), true, 'actor near home base is camping exempt');

  // 2. Far from home base (> 6m) and not carrying -> not exempt
  Object.assign(a0.pos, { x: 0, y: 0, z: 0 });
  assert.equal(sim.mode.campingExempt(a0), false, 'actor in open midfield is not exempt');

  // 3. Carrying casserole in open field -> exempt
  c1.state = 'carried';
  c1.carrierId = a0.id;
  assert.equal(sim.mode.campingExempt(a0), true, 'casserole carrier is camping exempt everywhere');
});

test('radar renders patrolZone and casserole mode objectives', () => {
  const simPatrol = new Sim({ rules: content.rules, weapons, rng: mulberry32(301), mode: 'hoaPatrol' });
  const a0 = simPatrol.addActor({ id: 'a0', team: 0, faction: 'karens', isBot: false });
  simPatrol.start();

  const opsPatrol = [];
  const mockCtxPatrol = new Proxy({}, {
    get: (_, prop) => (...args) => opsPatrol.push([prop, ...args]),
    set: () => true,
  });
  const radarPatrol = new Radar({ width: 130, height: 130, getContext: () => mockCtxPatrol });
  radarPatrol.render(simPatrol, a0);
  assert.ok(opsPatrol.some(op => op[0] === 'fillText' && ['A', 'B', 'C'].includes(op[1])), 'radar renders zone letter');

  const simCtf = new Sim({ rules: content.rules, weapons, rng: mulberry32(302), mode: 'stealTheCasserole' });
  const a1 = simCtf.addActor({ id: 'a1', team: 1, faction: 'fratHouse', isBot: false });
  simCtf.start();

  const opsCtf = [];
  const mockCtxCtf = new Proxy({}, {
    get: (_, prop) => (...args) => opsCtf.push([prop, ...args]),
    set: () => true,
  });
  const radarCtf = new Radar({ width: 130, height: 130, getContext: () => mockCtxCtf });
  radarCtf.render(simCtf, a1);
  assert.ok(opsCtf.some(op => op[0] === 'fillRect'), 'radar renders casserole dishes');
});

test('LoneWolf: onStart buffs player HP, kill siphons heal, and player infinitely respawns until enemies dead', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(401), mode: 'loneWolf' });
  const player = sim.addActor({ id: 'you', team: 0, faction: 'karens', isBot: false });
  const enemy = sim.addActor({ id: 'b0', team: 1, faction: 'hoaDads', isBot: true });
  sim.start();

  assert.equal(player.maxHp, 200, 'Lone player should have 200 max HP');
  assert.equal(player.hp, 200, 'Lone player should start at 200 HP');
  assert.ok(sim.mode.hud(player).includes('ENEMIES REMAINING'), 'HUD should display enemies remaining');

  // Player has infinite respawns
  assert.equal(sim.mode.respawnDelay(player), 2.5, 'Player should infinitely respawn in 2.5s');

  // Damage player to 100 HP
  player.hp = 100;

  // Player kills enemy
  sim.mode.onKill({ type: 'kill' }, player, enemy);

  assert.equal(player.hp, 135, 'Kill should siphon +35 HP adrenaline heal');
  assert.equal(sim.score[0], 1, 'Player team should receive 1 point');
  assert.equal(sim.mode.enemiesLeft, 29, 'Enemy ticket pool should decrement');
});

test('SuburbanWipeout: team has infinite respawns and wins when all enemy tickets and living enemies are wiped out', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(402), mode: 'wipeout' });
  const p0 = sim.addActor({ id: 'p0', team: 0, faction: 'karens', isBot: false });
  const e0 = sim.addActor({ id: 'e0', team: 1, faction: 'hoaDads', isBot: true });
  sim.start();

  assert.equal(sim.mode.respawnDelay(p0), 2.5, 'Friendly team has infinite respawns');
  assert.ok(sim.mode.hud().includes('ENEMIES LEFT'), 'HUD shows enemy count');

  // Deplete tickets
  sim.mode.enemyTickets = 1;
  e0.alive = true;

  // Kill last ticket enemy
  e0.alive = false;
  sim.mode.onKill({ type: 'kill' }, p0, e0);

  assert.equal(sim.mode.enemyTickets, 0, 'Enemy tickets should reach 0');
  assert.equal(sim.over, true, 'Match should end in victory when all enemies dead');
  assert.equal(sim.winner, 0, 'Team 0 should win the match');
});

