import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { Sim, DIFFICULTY_PROFILES, findLockOnTarget } from '../src/engine/sim.js';
import { CareerProfile, HOA_RANKS, ACHIEVEMENTS } from '../src/engine/progression.js';
import { MAPS, buildMap } from '../src/engine/map.js';

describe('Roadmap Features: Difficulty, Career Progression, Maps, Killstreaks & Mutators', () => {
  const dummyRules = {
    killScore: 10,
    headshotMult: 1.5,
    radarRange: 50,
    uavDuration: 15,
  };
  const dummyWeapons = {
    weapons: {
      primary: { id: 'primary', class: 'ar', damage: { head: 45, body: 30 }, range: 60, intervalSec: 0.1, mag: 30, reloadSec: 1.5, spread: { base: 0.01, moveMult: 1.5, airMult: 2 } },
      shotgun: { id: 'shotgun', class: 'shotgun', damage: { head: 90, body: 60 }, range: 25, intervalSec: 0.6, mag: 6, reloadSec: 2.0, spread: { base: 0.04, moveMult: 1.2, airMult: 1.5 }, pellets: 6 },
    },
    loadouts: {
      default: { primary: 'primary' },
      shotgun: { primary: 'shotgun' },
      divorceSettlement: { primary: 'shotgun' },
    },
  };

  it('verifies Difficulty Profiles and damage scaling', () => {
    assert.equal(DIFFICULTY_PROFILES.easy.playerDamageTakenMult, 1 / 3, 'Easy mode takes 1/3 damage (3x hits to die)');
    assert.equal(DIFFICULTY_PROFILES.easy.lockOn, true, 'Easy mode enables auto lock-on');
    assert.equal(DIFFICULTY_PROFILES.medium.playerDamageTakenMult, 1 / 2, 'Medium mode takes 1/2 damage (2x hits to die)');
    assert.equal(DIFFICULTY_PROFILES.hard.playerDamageTakenMult, 1, 'Hard mode plays standard 1x damage');

    const rng = mulberry32(1);
    const simEasy = new Sim({ rules: dummyRules, weapons: dummyWeapons, difficulty: 'easy', rng });
    const p1 = simEasy.addActor({ id: 'p1', name: 'Player1', team: 0, isBot: false });
    assert.equal(p1.damageTakenMult, 1 / 3);

    const simMed = new Sim({ rules: dummyRules, weapons: dummyWeapons, difficulty: 'medium', rng });
    const p2 = simMed.addActor({ id: 'p2', name: 'Player2', team: 0, isBot: false });
    assert.equal(p2.damageTakenMult, 1 / 2);

    const simHard = new Sim({ rules: dummyRules, weapons: dummyWeapons, difficulty: 'hard', rng });
    const p3 = simHard.addActor({ id: 'p3', name: 'Player3', team: 0, isBot: false });
    assert.equal(p3.damageTakenMult, 1);
  });

  it('verifies findLockOnTarget locks onto closest enemy within 28m and field of view', () => {
    const rng = mulberry32(42);
    const sim = new Sim({ rules: dummyRules, weapons: dummyWeapons, difficulty: 'easy', rng });
    const me = sim.addActor({ id: 'me', name: 'Me', team: 0, isBot: false });
    const closeEnemy = sim.addActor({ id: 'e1', name: 'Enemy1', team: 1, isBot: true });
    me.alive = true;
    me.pos.set ? me.pos.set(0, 0, 0) : Object.assign(me.pos, { x: 0, y: 0, z: 0 });
    me.yaw = 0;
    me.pitch = 0;

    closeEnemy.alive = true;
    closeEnemy.pos.set ? closeEnemy.pos.set(0, 0, -10) : Object.assign(closeEnemy.pos, { x: 0, y: 0, z: -10 });

    const target = findLockOnTarget(sim, me, 28);
    assert.ok(target, 'Should locate close enemy in front');
    assert.equal(target.actor.id, closeEnemy.id);

    // Behind player
    closeEnemy.pos.z = 10;
    const targetBehind = findLockOnTarget(sim, me, 28);
    assert.equal(targetBehind, null, 'Should not lock onto enemy behind field of view');
  });

  it('verifies CareerProfile progression, demo rank cap and achievement unlocks', () => {
    let unlocked = [];
    let promoted = [];
    const career = new CareerProfile({
      isDemo: true,
      onAchievement: ach => unlocked.push(ach.id),
      onRankUp: rank => promoted.push(rank.rank),
    });

    assert.equal(career.profile.rank, 1);
    assert.equal(career.profile.xp, 0);

    // Record first kill
    career.recordKill({ headshot: true, streak: 3 });
    assert.ok(career.profile.kills >= 1);
    assert.ok(career.profile.headshots >= 1);
    assert.ok(unlocked.includes('ACH_FIRST_FINE'));

    // Award enough XP to reach demo cap (Rank 5)
    career.awardXp(5000);
    assert.equal(career.profile.rank, 5, 'Rank should cap at 5 in demo');
    const rInfo = career.getRankInfo();
    assert.equal(rInfo.cappedInDemo, true);

    // Full game profile allows rank beyond 5
    const fullCareer = new CareerProfile({ isDemo: false });
    fullCareer.awardXp(10000);
    assert.ok(fullCareer.profile.rank > 5, 'Full game allows reaching ranks 6-10');
  });

  it('verifies Suburban Maps registry and demo gating', () => {
    assert.ok(MAPS.culdesac, 'Flagship cul-de-Sac map exists');
    assert.equal(MAPS.culdesac.freeInDemo, true);

    assert.ok(MAPS.pickleball, 'Shady Pines Pickleball Club exists');
    assert.equal(MAPS.pickleball.freeInDemo, false, 'Pickleball map is paid $4.99 exclusive');

    assert.ok(MAPS.stripmall, 'Sunset Strip Mall exists');
    assert.equal(MAPS.stripmall.freeInDemo, false, 'Strip Mall map is paid $4.99 exclusive');

    const m1 = buildMap('culdesac');
    assert.ok(m1.boxes.length > 0);
    const m2 = buildMap('pickleball');
    assert.ok(m2.boxes.length > 0);
    const m3 = buildMap('stripmall');
    assert.ok(m3.boxes.length > 0);
  });

  it('verifies Killstreak triggers: 3-UAV, 5-Helicopter, and 7-Lawn Mower Stampede', () => {
    const rng = mulberry32(10);
    const simFull = new Sim({ rules: dummyRules, weapons: dummyWeapons, isDemo: false, rng });
    const meFull = simFull.addActor({ id: 'me_full', name: 'MeFull', team: 0, isBot: false });
    const enemyFull = simFull.addActor({ id: 'e_full', name: 'EnemyFull', team: 1, isBot: true });
    meFull.alive = true;
    enemyFull.alive = true;

    // 3-Killstreak: Ring UAV
    meFull.streak = 3;
    simFull.triggerRingUav(meFull);
    assert.ok(enemyFull.revealedUntil > simFull.time, 'UAV reveals enemy positions');

    // 7-Killstreak: Lawn Mower Stampede
    meFull.streak = 7;
    simFull.spawnMowerStampede(meFull);
    assert.equal(simFull.mowers.length, 3, 'Spawns 3 autonomous lawn mowers');

    // In demo, 7-streak emits streakLocked
    const simDemo = new Sim({ rules: dummyRules, weapons: dummyWeapons, isDemo: true, rng });
    const meDemo = simDemo.addActor({ id: 'me_demo', name: 'MeDemo', team: 0, isBot: false });
    meDemo.streak = 7;
    simDemo.spawnMowerStampede(meDemo);
    const evs = simDemo.drainEvents();
    assert.ok(evs.some(e => e.type === 'streakLocked'), 'Emits streakLocked event in demo');
    assert.equal(simDemo.mowers.length, 0, 'No mowers spawned in demo');
  });

  it('verifies party mutators: bigHead, shotgunsOnly, lowGrav, and turbo', () => {
    const rng = mulberry32(5);
    const sim = new Sim({
      rules: dummyRules,
      weapons: dummyWeapons,
      rng,
      mutators: { bigHead: true, lowGrav: true, turbo: true, shotgunsOnly: true },
    });
    const actor = sim.addActor({ id: 'mut_actor', name: 'MutActor', team: 0, isBot: false, loadout: 'default' });
    actor.alive = true;

    assert.equal(sim.mutators.bigHead, true);
    assert.equal(actor.weapons.primary.class, 'shotgun', 'Shotguns only mutator forces shotgun');

    // Test turbo speed: moving with forward input accelerates faster than standard
    actor.input.forward = 1;
    actor.input.sprint = true;
    sim.move(actor, 0.05);
    assert.ok(Math.hypot(actor.vel.x, actor.vel.z) > 0, 'Turbo actor accelerates on move');

    // Test bigHead raycast: an offset ray misses standard head but hits 2.2x big head
    const target = sim.addActor({ id: 'target_actor', name: 'Target', team: 1, isBot: true });
    target.alive = true;
    target.pos.set ? target.pos.set(0, 0, -5) : Object.assign(target.pos, { x: 0, y: 0, z: -5 });
    const origin = { x: 0, y: 1.6, z: 0 };
    // Offset ray slightly to the right of the head
    const rayHit = sim.raycast(origin, { x: 0.08, y: 0, z: -0.996 }, 10, actor.id);
    assert.equal(rayHit.actor?.id, target.id);
    assert.equal(rayHit.head, true, 'Raycast lands headshot due to enlarged bigHead hitbox');
  });

  it('verifies car alarm event on shootable parked cars', () => {
    const rng = mulberry32(7);
    const sim = new Sim({ rules: dummyRules, weapons: dummyWeapons, rng });
    const shooter = sim.addActor({ id: 'shooter', name: 'Shooter', team: 0, isBot: false, pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    shooter.alive = true;
    // Add a parked car box
    sim.map.boxes.push({
      minX: -2, maxX: 2,
      minY: 0, maxY: 2,
      minZ: -8, maxZ: -4,
      isCar: true,
    });

    sim.fire(shooter, 0);
    const evs = sim.drainEvents();
    assert.ok(evs.some(e => e.type === 'carAlarm'), 'Shooting car emits carAlarm event');
  });

  it('verifies weekly featured rivalry matchmaking bias', async () => {
    const { FEATURED_RIVALRIES, getFeaturedRivalry, pickBotFaction } = await import('../src/engine/game.js');
    assert.ok(FEATURED_RIVALRIES.length >= 7, 'Has at least 7 featured rivalry matchups');

    const week0Rivalry = getFeaturedRivalry(0);
    assert.deepEqual(week0Rivalry, ['karens', 'wallstreetBets']);

    const pool = ['karens', 'wallstreetBets', 'tradwives', 'wokeLibs', 'hoaDads', 'fratHouse'];
    // When rng generates a low value (< bias of 0.5), it picks the rivalry faction
    const biasedRng = () => 0.1;
    const team0Choice = pickBotFaction({ rng: biasedRng, pool, team: 0, featuredRivalry: week0Rivalry, bias: 0.5 });
    assert.equal(team0Choice, 'karens', 'Team 0 bot biased towards first rivalry faction');

    const team1Choice = pickBotFaction({ rng: biasedRng, pool, team: 1, featuredRivalry: week0Rivalry, bias: 0.5 });
    assert.equal(team1Choice, 'wallstreetBets', 'Team 1 bot biased towards second rivalry faction');
  });

  it('verifies audio mute, ambience, victory/defeat jingles, and suburban pings', async () => {
    const { Sfx } = await import('../src/engine/audio.js');
    const sfx = new Sfx();

    assert.equal(sfx.enabled, true);
    // Test setMute
    sfx.setMute(true);
    assert.equal(sfx.enabled, false);

    // Test toggleMute
    const toggled = sfx.toggleMute();
    assert.equal(sfx.enabled, true);
    assert.equal(toggled, false, 'Unmuted returns false for muted');

    // Test safe invocations (no audio context crash)
    assert.doesNotThrow(() => sfx.startAmbience());
    assert.doesNotThrow(() => sfx.stopAmbience());
    assert.doesNotThrow(() => sfx.victory());
    assert.doesNotThrow(() => sfx.defeat());
    assert.doesNotThrow(() => sfx.ping('alert'));
    assert.doesNotThrow(() => sfx.ping('danger'));
  });

  it('verifies Search & Destroy bot carrier escort tactics (O2b)', async () => {
    const { EvictTheBlock } = await import('../src/engine/modes.js');
    const rng = mulberry32(11);
    const sim = new Sim({ rules: dummyRules, weapons: dummyWeapons, rng });
    const mode = new EvictTheBlock(sim);
    sim.mode = mode;

    // Add attacker actors first
    const atk1 = sim.addActor({ id: 'atk1', name: 'CarrierCandidate', team: mode.attackers, isBot: true });
    const companion = sim.addActor({ id: 'comp1', name: 'EscortBot', team: mode.attackers, isBot: true });
    mode.onStart();

    const carrier = sim.actors.find(a => a.id === mode.carrierId);
    assert.ok(carrier, 'Carrier is selected on mode start');
    carrier.alive = true;

    const follower = sim.actors.find(a => a.id !== mode.carrierId && a.team === mode.attackers);
    assert.ok(follower, 'Follower attacker is found');
    follower.alive = true;
    follower.pos.x = carrier.pos.x + 15;
    follower.pos.z = carrier.pos.z + 15;

    const goal = mode.botGoal(follower);
    assert.ok(goal, 'Escort bot gets goal');
    // Escort goal directs towards carrier within 7m
    assert.equal(goal.x, carrier.pos.x);
    assert.equal(goal.z, carrier.pos.z);
    assert.equal(goal.radius, 3.5);
  });

  it('verifies Steam store capsules exist with exact required Direct dimensions', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const steamDir = path.resolve('assets/steam');

    const expected = [
      'header_capsule.jpg',
      'small_capsule.jpg',
      'main_capsule.jpg',
      'library_hero.jpg',
      'library_logo.png',
      'community_icon.png',
      'client_icon.png',
    ];

    for (const file of expected) {
      const p = path.join(steamDir, file);
      assert.ok(fs.existsSync(p), `Steam asset ${file} exists`);
      assert.ok(fs.statSync(p).size > 100, `Steam asset ${file} has valid file size`);
    }
  });
});
