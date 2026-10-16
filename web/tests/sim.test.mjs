// Headless tests for the web slice runtime (map, sim, bark glue). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContentLibrary } from '../src/core/content.js';
import { mulberry32 } from '../src/core/rng.js';
import { buildCulDeSac, findPath } from '../src/engine/map.js';
import { Sim, rayActor, BODY, resolveLoadout, FACTION_DEFAULT_LOADOUTS } from '../src/engine/sim.js';
import { MODES } from '../src/engine/modes.js';
import { BarkSystem } from '../src/engine/barks.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const PHASE0 = Object.keys(content.factions).filter(f => content.factions[f].phase0);

function match(seed, { script = 'clean', seconds = 300, local = 'p0', step, mode = 'clash', weaponsData = weapons } = {}) {
  const rng = mulberry32(seed);
  const library = new ContentLibrary(content, { script });
  const sim = new Sim({ rules: content.rules, weapons: weaponsData, rng, mode });
  for (let i = 0; i < 12; i++) sim.addActor({ id: 'p' + i, name: content.playerNames[i], team: i % 2, faction: PHASE0[i % PHASE0.length] });
  const barks = new BarkSystem({ library, content, rng, sim });
  sim.start();
  const log = { barks: [], kills: [], killcams: [], events: [] };
  const drain = () => {
    const evs = sim.drainEvents();
    log.events.push(...evs);
    const out = barks.process(evs, sim.time, local);
    log.barks.push(...out.barks);
    log.kills.push(...out.kills);
    if (out.killcam) log.killcams.push(out.killcam);
    barks.updateAnnouncer(sim.time, -1);
  };
  drain();
  while (!sim.over && sim.time < seconds) {
    sim.step(1 / 60);
    step?.(sim);
    drain();
  }
  return { sim, log };
}

test('map: nav graph is fully connected and spawns are clear', () => {
  const map = buildCulDeSac();
  for (let i = 1; i < map.nodes.length; i++) assert.ok(findPath(map.nodes, 0, i), `node ${i} unreachable`);
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), map });
  for (const t of [0, 1]) for (const [x, z] of map.spawns[t]) assert.equal(sim.blocked(x, z, 0), false, `spawn ${x},${z}`);
});

test('hitbox: head sphere beats body cylinder, misses miss', () => {
  const p = { x: 0, y: 0, z: -10 };
  const head = rayActor({ x: 0, y: BODY.headY, z: 0 }, { x: 0, y: 0, z: -1 }, p, 100);
  assert.ok(head.head && Math.abs(head.t - (10 - BODY.headR)) < 1e-6);
  const body = rayActor({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, p, 100);
  assert.ok(body && !body.head && Math.abs(body.t - (10 - BODY.hitRadius)) < 1e-6);
  assert.equal(rayActor({ x: 2, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, p, 100), null);
  assert.equal(rayActor({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, p, 5), null, 'beyond maxT');
});

test('bot match: finishes, both teams score, nobody clips into geometry', () => {
  let clipped = 0;
  const { sim, log } = match(11, { step: s => { for (const a of s.actors) if (a.alive && (s.blocked(a.pos.x, a.pos.z, a.pos.y) || !Number.isFinite(a.pos.x + a.pos.y + a.pos.z))) clipped++; } });
  assert.ok(sim.over, 'match should end by score or time');
  assert.ok(sim.score[0] > 5 && sim.score[1] > 5, `score ${sim.score}`);
  assert.equal(clipped, 0);
  const killEvents = log.events.filter(e => e.type === 'kill');
  assert.equal(sim.score[0] + sim.score[1], killEvents.filter(e => e.killerId).length);
  assert.equal(killEvents.filter(e => e.killerId).length, log.kills.filter(k => k.killerId).length);
  assert.equal(log.kills.filter(k => k.firstBlood).length, 1, 'exactly one first blood');
  const used = new Set(log.barks.map(b => b.eventId));
  for (const ev of ['roundStart', 'firstBlood', 'rivalry', 'double']) assert.ok(used.has(ev), `expected some ${ev} barks`);
});

test('determinism: same seed -> identical match', () => {
  const a = match(5, { seconds: 60 }), b = match(5, { seconds: 60 });
  assert.deepEqual(a.sim.score, b.sim.score);
  assert.deepEqual(a.log.barks.map(x => x.lineId), b.log.barks.map(x => x.lineId));
});

test('killcam: the local player always gets the fatal line, never null', () => {
  const { sim, log } = match(3);
  const deaths = log.events.filter(e => e.type === 'kill' && e.victimId === 'p0' && e.killerId).length;
  assert.ok(deaths > 0);
  const byOthers = log.killcams.filter(k => !k.selfKill);
  assert.equal(byOthers.length, deaths);
  for (const k of byOthers) assert.ok(k.line && k.line.text && k.line.id, 'killcam line missing');
  assert.ok(sim.byId.get('p0').deaths >= deaths);
});

test('steam script: steam-only lines can appear', () => {
  const { log } = match(9, { script: 'steam' });
  assert.ok(log.barks.some(b => b.lineId.includes('.s.')), 'expected at least one Steam line');
});

test('camping: a player who stands still snitches on themselves and is revealed', () => {
  const rng = mulberry32(2);
  const library = new ContentLibrary(content);
  const sim = new Sim({ rules: content.rules, weapons, rng });
  const me = sim.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false });
  const barks = new BarkSystem({ library, content, rng, sim });
  sim.start();
  let snitchAt = null, warned = false, line = null;
  while (sim.time < 25 && snitchAt === null) {
    sim.step(1 / 60);
    if (me.campState.state === 'warning') warned = true;
    const evs = sim.drainEvents();
    const out = barks.process(evs, sim.time, 'me');
    if (evs.some(e => e.type === 'campingSnitch')) { snitchAt = sim.time; line = out.barks.find(b => b.eventId === 'campingSnitch'); }
  }
  assert.ok(warned, 'warning shown before snitch');
  assert.ok(snitchAt > 19.5 && snitchAt < 21, `snitched at ${snitchAt}`);
  assert.ok(me.revealedUntil > sim.time);
  assert.ok(line && line.speakerId === 'me' && line.lineId.startsWith('karens.campingSnitch'));
});

test('trampoline bounces, lawsuit grenade can self-kill with a self-roast', () => {
  const rng = mulberry32(4);
  const sim = new Sim({ rules: content.rules, weapons, rng });
  const me = sim.addActor({ id: 'me', name: 'Me', team: 0, faction: 'fratHouse', isBot: false });
  const barks = new BarkSystem({ library: new ContentLibrary(content), content, rng, sim });
  sim.start();
  Object.assign(me.pos, { x: 0, y: 4, z: -7 });
  me.spawnProtectUntil = 0;
  let boing = false;
  for (let i = 0; i < 90 && !boing; i++) { sim.step(1 / 60); boing = sim.drainEvents().some(e => e.type === 'boing'); }
  assert.ok(boing && me.vel.y > 5, 'trampoline launch');

  Object.assign(me.pos, { x: 0, y: 0, z: 20 }); Object.assign(me.vel, { x: 0, y: 0, z: 0 });
  me.input.pitch = -1.4; // throw at own feet
  me.input.grenade = true;
  let self = null;
  for (let i = 0; i < 200 && !self; i++) {
    sim.step(1 / 60);
    const g = sim.grenades[0];
    if (g && g.explodeAt - sim.time < 0.1) Object.assign(me.pos, { x: g.pos.x, z: g.pos.z }); // walk onto your own Lawsuit
    const out = barks.process(sim.drainEvents(), sim.time, 'me');
    if (out.killcam?.selfKill) self = out;
  }
  assert.ok(self, 'self kill registered');
  assert.equal(self.barks[0].eventId, 'selfKill');
  assert.deepEqual(sim.score, [0, 0], 'self kills do not score');
});

test('weapons.json: every loadout resolves and every weapon has the fields its fire type needs', () => {
  const need = {
    hitscan: ['mag', 'reloadSec', 'intervalSec', 'damage', 'range', 'spread', 'auto'],
    projectile: ['count', 'projectile'],
    melee: ['range', 'damage', 'cooldownSec', 'coneDot'],
  };
  for (const [id, w] of Object.entries(weapons.weapons)) {
    assert.ok(need[w.fire], `${id}: unknown fire type ${w.fire}`);
    for (const f of need[w.fire]) assert.ok(w[f] !== undefined, `${id} missing ${f}`);
    assert.ok(w.name && w.slot && w.feedIcon, `${id} needs name/slot/feedIcon`);
    if (w.fire === 'hitscan') assert.ok(Math.ceil(100 / w.damage.body) >= 2, `${id} one-shots to the body`);
  }
  for (const name of Object.keys(weapons.loadouts)) {
    const l = resolveLoadout(weapons, name);
    assert.equal(l.primary.slot, 'primary', `${name}.primary`);
  }
});

test('faction weapons: every faction has a signature weapon loadout that assigns on spawn', () => {
  const factionKeys = Object.keys(content.factions);
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(42) });
  for (const f of factionKeys) {
    assert.ok(FACTION_DEFAULT_LOADOUTS[f], `missing default loadout for faction ${f}`);
    const actor = sim.addActor({ id: `test_${f}`, name: f, team: 0, faction: f });
    assert.ok(actor.weapons.primary, `missing primary weapon for faction ${f}`);
    const loadoutKey = FACTION_DEFAULT_LOADOUTS[f];
    const expectedLoadout = resolveLoadout(weapons, loadoutKey);
    assert.equal(actor.weapons.primary.id, expectedLoadout.primary.id, `${f} weapon mismatch`);
  }
});

test('weapons: pellets fire multiple rays, semi-auto needs a fresh click', () => {
  const custom = structuredClone(weapons);
  custom.weapons.testShotgun = { ...weapons.weapons.allowance, name: 'Test Shotgun', auto: false, pellets: 8, mag: 6 };
  custom.loadouts.shotgun = { primary: 'testShotgun', melee: 'participationTrophy' };
  const sim = new Sim({ rules: content.rules, weapons: custom, rng: mulberry32(8) });
  const me = sim.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false, loadout: 'shotgun' });
  sim.start(); sim.drainEvents();
  me.input.fire = true;
  for (let i = 0; i < 30; i++) sim.step(1 / 60); // trigger held for 0.5 s
  const shots = sim.drainEvents().filter(e => e.type === 'shot');
  assert.equal(shots.length, 8, 'one trigger pull = 8 pellets, no auto refire');
  assert.equal(me.ammo, 5);
  assert.equal(me.grenades, 0, 'loadout without equipment has no Lawsuits');
});

test('weapons: auto reload triggers after 1 second of not firing', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(10) });
  const me = sim.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false });
  sim.start();
  const maxMag = weapons.weapons.allowance.mag;
  assert.equal(me.ammo, maxMag);

  // Fire one shot
  me.input.fire = true;
  sim.step(1 / 60);
  me.input.fire = false;
  assert.equal(me.ammo, maxMag - 1);
  assert.equal(me.reloadUntil, 0);

  // Advance 0.5s (30 ticks) -> still not reloading
  for (let i = 0; i < 30; i++) sim.step(1 / 60);
  assert.equal(me.reloadUntil, 0);

  // Advance another 0.6s (36 ticks, total 1.1s since shot) -> auto reload triggers!
  for (let i = 0; i < 36; i++) sim.step(1 / 60);
  assert.ok(me.reloadUntil > 0, 'auto-reload initiated after 1s inactivity');

  // Let reload complete
  const reloadTicks = Math.ceil(weapons.weapons.allowance.reloadSec * 60) + 5;
  for (let i = 0; i < reloadTicks; i++) sim.step(1 / 60);
  assert.equal(me.ammo, maxMag, 'mag refilled to full');
  assert.equal(me.reloadUntil, 0);
});

test('receipt check: kills drop receipts, only pickups score, bots go for them', () => {
  const { sim, log } = match(21, { mode: 'receiptCheck' });
  const kinds = t => log.events.filter(e => e.type === t).length;
  assert.ok(kinds('kill') > 20);
  assert.equal(sim.score[0] + sim.score[1], kinds('receiptConfirmed'), 'score == confirmed receipts');
  assert.ok(kinds('receiptConfirmed') > 10, `confirmed ${kinds('receiptConfirmed')}`);
  assert.ok(kinds('receiptDenied') > 0, 'some denies');
  assert.ok(log.barks.some(b => b.eventId === 'objective'), 'pickup barks');
  assert.equal(MODES.receiptCheck.defaults.scoreLimit, sim.scoreLimit);
});

test('king of the lawn: zone rotation, uncontested hold scores, contested stops, camping exempt', () => {
  const rng = mulberry32(19);
  const sim = new Sim({ rules: content.rules, weapons, rng, mode: 'kingOfTheLawn' });
  const a0 = sim.addActor({ id: 'a0', name: 'Alpha', team: 0, faction: 'karens', isBot: false });
  const b1 = sim.addActor({ id: 'b1', name: 'Bravo', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();

  const mode = sim.mode;
  assert.equal(mode.zoneIndex, 0);
  const z = mode.zoneObj;
  assert.ok(z && z.pos);

  // Put a0 inside the active zone
  Object.assign(a0.pos, { x: z.pos.x, y: 0, z: z.pos.z });
  // Put b1 far away
  Object.assign(b1.pos, { x: z.pos.x + 30, y: 0, z: z.pos.z + 30 });

  assert.ok(mode.campingExempt(a0), 'actor in zone is camping-exempt');
  assert.ok(!mode.campingExempt(b1), 'actor outside zone is not exempt');

  // Step 2 seconds: uncontested hold should score
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  assert.ok(sim.score[0] >= 1, `Team 0 should have scored, got ${sim.score[0]}`);
  assert.equal(sim.score[1], 0);

  // Move b1 into the zone -> contested
  Object.assign(b1.pos, { x: z.pos.x + 1, y: 0, z: z.pos.z + 1 });
  const scoreBefore = sim.score[0];
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  assert.ok(mode.contested, 'zone is contested');
  assert.equal(sim.score[0], scoreBefore, 'contested zone does not award points');

  // Fast forward rotation
  sim.time = mode.rotateAt + 0.1;
  sim.step(1 / 60);
  assert.equal(mode.zoneIndex, 1, 'zone rotated to index 1');
});

test('sim - weapon switching and ammo banking', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(123) });
  const a = sim.addActor({ id: 'hero', name: 'Hero', team: 0, faction: 'karens', isBot: false });
  sim.start();

  assert.equal(a.activeSlot, 'primary');
  assert.equal(a.ammo, a.weapons.primary.mag); // Allowance: 30

  // Fire one shot from primary
  a.input.fire = true;
  sim.step(1 / 60);
  a.input.fire = false;
  assert.equal(a.ammo, 29);
  const primaryShot = sim.drainEvents().find(e => e.type === 'shot');
  assert.equal(primaryShot.weaponId, 'allowance');

  // Switch to secondary (Permit)
  a.input.switchSlot = 'secondary';
  sim.step(1 / 60);
  assert.equal(a.activeSlot, 'secondary');
  assert.equal(a.ammo, a.weapons.secondary.mag); // Permit: 15
  const switchEv = sim.drainEvents().find(e => e.type === 'switchWeapon');
  assert.equal(switchEv.slot, 'secondary');
  assert.equal(switchEv.weaponId, 'permit');

  // Fire one shot from secondary
  sim.time += 0.5; // pass cooldown
  a.input.fire = true;
  sim.step(1 / 60);
  a.input.fire = false;
  assert.equal(a.ammo, 14);
  const secondaryShot = sim.drainEvents().find(e => e.type === 'shot');
  assert.equal(secondaryShot.weaponId, 'permit');

  // Switch back to primary: ammo should be restored to 29
  a.input.switchSlot = 'primary';
  sim.step(1 / 60);
  assert.equal(a.activeSlot, 'primary');
  assert.equal(a.ammo, 29);

  // Switch back to secondary: ammo should be restored to 14
  a.input.switchSlot = 'secondary';
  sim.step(1 / 60);
  assert.equal(a.activeSlot, 'secondary');
  assert.equal(a.ammo, 14);
});

test('radar - shooting and snitch reveal timers and radar render', async () => {
  const { Sim } = await import('../src/engine/sim.js');
  const { Radar } = await import('../src/engine/radar.js');
  const sim = new Sim({ rules: content.rules, weapons, rng: () => 0.5, mode: 'clash' });
  const a0 = sim.addActor({ id: 'a0', team: 0, faction: 'karens', isBot: false });
  const a1 = sim.addActor({ id: 'a1', team: 1, faction: 'frat', isBot: false });
  sim.start();

  // Initially not revealed
  assert.ok(!a1.revealedUntil || a1.revealedUntil <= sim.time);

  // Firing reveals enemy
  a1.input.fire = true;
  sim.step(1 / 60);
  a1.input.fire = false;
  assert.ok(a1.revealedUntil >= sim.time + 1.5);

  // Mock canvas to test Radar render pass
  const ops = [];
  const mockCtx = new Proxy({}, {
    get: (_, prop) => (...args) => ops.push([prop, ...args]),
    set: () => true,
  });
  const mockCanvas = { width: 130, height: 130, getContext: () => mockCtx };
  const radar = new Radar(mockCanvas);
  assert.equal(radar.size, 130);
  radar.render(sim, a0);
  assert.ok(ops.length > 10, 'Radar rendered map geometry and entities');
});

test('sim - bullet flinch hitAgo, hitDir, and takeDamage tracking', async () => {
  const { Sim } = await import('../src/engine/sim.js');
  const sim = new Sim({ rules: content.rules, weapons, rng: () => 0.5, mode: 'clash' });
  const a0 = sim.addActor({ id: 'a0', team: 0, faction: 'karens', isBot: false });
  const a1 = sim.addActor({ id: 'a1', team: 1, faction: 'frat', isBot: false });
  sim.start();
  a1.spawnProtectUntil = 0;

  assert.equal(a1.hitAgo, Infinity);
  assert.deepEqual(a1.hitDir, { x: 0, y: 0, z: 0 });

  // Apply damage with direction from attacker
  sim.damage(a1, 10, a0, { dir: { x: 0, y: 0, z: -1 } });
  assert.equal(a1.hitAgo, 0);
  assert.equal(a1.hitDir.z, -1);

  // Stepping advances hitAgo
  sim.step(0.1);
  assert.ok(Math.abs(a1.hitAgo - 0.1) < 1e-4);

  // Snapshot contains hitAgo and hitDir
  const snap = sim.snapshot();
  const s1 = snap.find(s => s.id === 'a1');
  assert.ok(s1);
  assert.ok(Math.abs(s1.hitAgo - 0.1) < 1e-4);
  assert.equal(s1.hitDir.z, -1);

  // Direct takeDamage call
  a1.takeDamage(10, a0, { dir: { x: 1, y: 0, z: 0 } });
  assert.equal(a1.hitAgo, 0);
  assert.equal(a1.hitDir.x, 1);
});


test('spawn safety: never spawn in an enemy\'s sight within 25 m when a safe spawn exists (1,000 trials)', async () => {
  const { SPAWN_SAFE_M } = await import('../src/engine/sim.js');
  const rng = mulberry32(77);
  const sim = new Sim({ rules: content.rules, weapons, rng });
  const me = sim.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false });
  const foes = [0, 1, 2, 3, 4, 5].map(i => sim.addActor({ id: 'f' + i, name: 'F' + i, team: 1, faction: 'fratHouse', isBot: false }));
  sim.start();
  const { bounds } = sim.map;
  let checked = 0, exposedAvoidable = 0, allExposed = 0;
  for (let trial = 0; trial < 1000; trial++) {
    for (const f of foes) {
      // enemies anywhere, biased toward our spawn area half the time (the spawn-camping case)
      let x, z;
      do {
        x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
        z = rng() < 0.5 ? 20 + rng() * 27 : bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
      } while (sim.blocked(x, z, 0));
      Object.assign(f.pos, { x, y: 0, z });
      f.alive = true;
    }
    const candidates = [...sim.map.spawns[0], ...sim.map.nodes.map(n => [n.x, n.z])];
    const anySafe = candidates.some(p => { const x = sim.spawnThreat(0, p); return x.seenClose === 0 && x.near >= 15; });
    const chosen = sim.pickSpawn(me);
    const t = sim.spawnThreat(0, chosen);
    if (anySafe) { checked++; if (t.seenClose > 0) exposedAvoidable++; }
    else allExposed++;
  }
  assert.equal(exposedAvoidable, 0, `spawned in sight within ${SPAWN_SAFE_M} m although a safe spawn existed`);
  assert.ok(allExposed < 20, `${allExposed}/1000 trials had nowhere safe to spawn`);
});

test('bot difficulty: a hard team clearly outfights an easy team', () => {
  let hardKills = 0, easyKills = 0;
  for (const seed of [1, 2, 3]) {
    const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(seed), timeLimit: 120 });
    for (let i = 0; i < 12; i++) {
      const a = sim.addActor({ id: 'p' + i, name: 'P' + i, team: i % 2, faction: PHASE0[i % PHASE0.length] });
      a.difficulty = i % 2 === 0 ? 'hard' : 'easy';
    }
    sim.start();
    while (!sim.over) { sim.step(1 / 60); sim.drainEvents(); }
    hardKills += sim.score[0]; easyKills += sim.score[1];
  }
  assert.ok(hardKills > easyKills * 1.5, `hard ${hardKills} vs easy ${easyKills}`);
});

test('King of the Lawn: bots split into zone players and flankers instead of one blob', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(12), mode: 'kingOfTheLawn', timeLimit: 240 });
  for (let i = 0; i < 12; i++) sim.addActor({ id: 'p' + i, name: 'P' + i, team: i % 2, faction: PHASE0[i % PHASE0.length] });
  sim.start();
  const roles = sim.actors.map(a => a.brain.role);
  assert.equal(roles.filter(r => r === 'objective').length, 8, '60% of 6 per team, rounded = 4 each');
  const dist = { objective: [], hunter: [] };
  let inZone = 0, samples = 0;
  for (let i = 0; !sim.over; i++) {
    sim.step(1 / 60); sim.drainEvents();
    if (i % 30 || sim.time < 15) continue; // sample twice a second after the opening rush
    const z = sim.mode.zoneObj;
    for (const a of sim.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - z.pos.x, a.pos.z - z.pos.z);
      dist[a.brain.role].push(d);
      samples++; if (d <= z.radius) inZone++;
    }
  }
  const avg = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(avg(dist.hunter) > avg(dist.objective) + 4, `hunters ${avg(dist.hunter).toFixed(1)} m vs objective ${avg(dist.objective).toFixed(1)} m from the zone`);
  const share = inZone / samples;
  assert.ok(share > 0.15 && share < 0.7, `share of bots standing in the zone: ${share.toFixed(2)}`);
  assert.ok(sim.score[0] + sim.score[1] > 40, `zone actually gets held: ${sim.score}`);
});

test('Evict the Block: one life per round, rounds decided by wipe/post/tear-down/time, halftime swap', () => {
  const tally = { rounds: 0, posted: 0, objectiveEnds: 0, halftime: 0, multiDeath: 0, lastAlive: 0 };
  let decided = 0;
  for (const seed of [1, 2, 3, 4]) {
    const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(seed), mode: 'evictTheBlock' });
    for (let i = 0; i < 12; i++) sim.addActor({ id: 'p' + i, name: 'P' + i, team: i % 2, faction: PHASE0[i % PHASE0.length] });
    sim.start();
    let deaths = new Map(), attackersBefore = sim.mode.attackers;
    while (!sim.over) {
      sim.step(1 / 60);
      for (const e of sim.drainEvents()) {
        if (e.type === 'roundStart') deaths = new Map();
        if (e.type === 'kill') { const n = (deaths.get(e.victimId) || 0) + 1; deaths.set(e.victimId, n); if (n > 1) tally.multiDeath++; }
        if (e.type === 'roundEnd') { tally.rounds++; if (e.reason === 'torn down' || e.reason === 'evicted') tally.objectiveEnds++; }
        if (e.type === 'objectiveBark' && e.what === 'noticePosted') tally.posted++;
        if (e.type === 'lastAlive') tally.lastAlive++;
        if (e.type === 'halftime') { tally.halftime++; assert.notEqual(sim.mode.attackers, attackersBefore, 'sides swap'); }
      }
    }
    assert.equal(Math.max(...sim.score), 4, `first to 4 rounds: ${sim.score}`);
    decided++;
  }
  assert.equal(decided, 4);
  assert.equal(tally.multiDeath, 0, 'nobody respawns mid-round');
  assert.ok(tally.posted >= 1, `the notice gets posted in real bot matches (${tally.posted})`);
  assert.ok(tally.halftime >= 3 && tally.lastAlive > 4, JSON.stringify(tally));
});

test('Evict the Block rules: post takes 3 s on a lawn, tear-down 5 s, fuse and clock decide rounds', async () => {
  const { EvictTheBlock } = await import('../src/engine/modes.js');
  const E = EvictTheBlock;
  const setup = () => {
    const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(5), mode: 'evictTheBlock' });
    const atk = sim.addActor({ id: 'atk', name: 'A', team: 1, faction: 'karens', isBot: false });
    const def = sim.addActor({ id: 'def', name: 'D', team: 0, faction: 'fratHouse', isBot: false });
    sim.start(); sim.drainEvents();
    assert.equal(sim.mode.attackers, 1);
    assert.equal(sim.mode.carrierId, 'atk', 'the only attacker carries the notice');
    return { sim, atk, def };
  };
  const run = (sim, sec, each) => { const evs = []; for (let i = 0; i < sec * 60; i++) { each?.(); sim.step(1 / 60); evs.push(...sim.drainEvents()); } return evs; };
  const site = E.SITES[0];

  // posted after 3 s standing on the lawn; defender then tears it down in 5 s -> defenders take the round
  let { sim, atk, def } = setup();
  Object.assign(def.pos, { x: 30, y: 0, z: 40 });
  let evs = run(sim, E.PLANT_SEC + 0.2, () => Object.assign(atk.pos, { x: site.x, y: 0, z: site.z }));
  assert.ok(sim.mode.planted, 'notice posted');
  assert.ok(evs.some(e => e.type === 'objectiveBark' && e.what === 'noticePosted'));
  Object.assign(atk.pos, { x: -40, y: 0, z: 40 });
  evs = run(sim, E.DEFUSE_SEC + 0.2, () => Object.assign(def.pos, { x: sim.mode.planted.x, y: 0, z: sim.mode.planted.z }));
  assert.deepEqual(evs.filter(e => e.type === 'roundEnd').map(e => [e.winner, e.reason]), [[0, 'torn down']]);

  // posted and nobody tears it down -> it takes effect, attackers win
  ({ sim, atk, def } = setup());
  Object.assign(def.pos, { x: 30, y: 0, z: 40 });
  run(sim, E.PLANT_SEC + 0.2, () => Object.assign(atk.pos, { x: site.x, y: 0, z: site.z }));
  Object.assign(atk.pos, { x: -40, y: 0, z: 40 });
  evs = run(sim, E.FUSE_SEC + 0.5);
  assert.deepEqual(evs.filter(e => e.type === 'roundEnd').map(e => [e.winner, e.reason]), [[1, 'evicted']]);

  // nobody posts before the round clock runs out -> defenders win
  ({ sim, atk, def } = setup());
  Object.assign(atk.pos, { x: -40, y: 0, z: 40 }); Object.assign(def.pos, { x: 40, y: 0, z: 40 });
  evs = run(sim, E.ROUND_SEC + 0.5);
  assert.deepEqual(evs.filter(e => e.type === 'roundEnd').map(e => [e.winner, e.reason]), [[0, 'time']]);
});
