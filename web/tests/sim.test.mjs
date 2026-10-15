// Headless tests for the web slice runtime (map, sim, bark glue). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContentLibrary } from '../src/core/content.js';
import { mulberry32 } from '../src/core/rng.js';
import { buildCulDeSac, findPath } from '../src/engine/map.js';
import { Sim, rayActor, BODY, resolveLoadout } from '../src/engine/sim.js';
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

