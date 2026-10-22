// Match simulation: movement, weapons (data/weapons.json), respawns, camping, bots.
// Scoring and objectives belong to the active game mode (modes.js).
// No three.js and no DOM, so the whole match can run headlessly in tests (see web/tests/sim.test.mjs).
// The sim only emits gameplay events; barks.js turns them into voice lines and the renderer draws them.
//
// Conventions match three.js: yaw 0 looks down -z, positive pitch looks up.
//   forward = (-sin yaw, 0, -cos yaw)   right = (cos yaw, 0, -sin yaw)

import { CampingMonitor } from '../core/campingMonitor.js';
import { buildCulDeSac, rayBox, rayGround, findPath, nearestNode } from './map.js';
import { createMode, MODES, resolveModeId } from './modes.js';

/** Resolve a named loadout from weapons.json into {primary, equipment, melee} definitions (with ids). */
export function resolveLoadout(weapons, loadout = 'default') {
  const slots = typeof loadout === 'string' ? weapons.loadouts[loadout] : loadout;
  if (!slots) throw new Error(`unknown loadout ${loadout}`);
  const out = {};
  for (const [slot, id] of Object.entries(slots)) {
    const w = weapons.weapons[id];
    if (!w) throw new Error(`loadout ${JSON.stringify(slots)} references unknown weapon ${id}`);
    out[slot] = { id, ...w };
  }
  return out;
}

export const FACTION_DEFAULT_LOADOUTS = {
  karens: 'allowance',
  hoaDads: 'allowance',
  wokeLibs: 'allowance',
  animeWeebs: 'allowance',
  tradwives: 'divorceSettlement',
  rednecks: 'divorceSettlement',
  gymRats: 'divorceSettlement',
  emoKids: 'divorceSettlement',
  furries: 'sideHustle',
  brainRot: 'sideHustle',
  valleyGirls: 'sideHustle',
  cloutStreamers: 'sideHustle',
  fratHouse: 'sideHustle',
  mlmHuns: 'sideHustle',
  oldMoney: 'trustFund',
  wallstreetBets: 'trustFund',
  fabulous: 'trustFund',
  theaterKids: 'trustFund',
  trumpers: 'subdivision',
  pickleballRetirees: 'permit',
};

export const BODY = { radius: 0.4, height: 1.8, eye: 1.6, hitRadius: 0.42, hitHeight: 1.42, headY: 1.62, headR: 0.25 };
export const SPAWN_SAFE_M = 25;

/**
 * Bot skill. `normal` is the original tuning. react = seconds before the first shot at a new
 * target [min, +random]; sigma = aim error (rad) base + per metre + vs moving targets;
 * burst = shots [min, +random]; pause = seconds between bursts [min, +random].
 */
export const BOT_DIFFICULTY = {
  easy:   { react: [0.55, 0.4], sigma: [0.034, 0.0018, 0.02], burst: [3, 4], pause: [0.45, 0.5], head: 0.06, turn: 4.5, fov: 1.0, range: 45 },
  normal: { react: [0.3, 0.35], sigma: [0.018, 0.0011, 0.012], burst: [4, 6], pause: [0.25, 0.45], head: 0.18, turn: 7, fov: 1.3, range: 58 },
  hard:   { react: [0.16, 0.16], sigma: [0.011, 0.0007, 0.008], burst: [5, 6], pause: [0.15, 0.25], head: 0.3, turn: 10, fov: 1.5, range: 66 },
};

/**
 * Game difficulty profiles for Demo & Full Game:
 * - easy:   Auto lock-on when close + player takes 1/3 damage (requires 3x as many hits before dying)
 * - medium: Player takes 1/2 damage (requires 2x as many hits before dying)
 * - hard:   Classic 1x damage (plays the exact way it played originally)
 */
export const DIFFICULTY_PROFILES = {
  easy:   { id: 'easy',   label: 'Easy (Auto Lock-On · 3x HP)', botDifficulty: 'easy',   playerDamageTakenMult: 1 / 3, lockOn: true,  lockRange: 28, lockCone: 0.55 },
  medium: { id: 'medium', label: 'Medium (2x HP)',              botDifficulty: 'normal', playerDamageTakenMult: 1 / 2, lockOn: false, lockRange: 0,  lockCone: 0 },
  hard:   { id: 'hard',   label: 'Hard (Classic 1x HP)',        botDifficulty: 'hard',   playerDamageTakenMult: 1,     lockOn: false, lockRange: 0,  lockCone: 0 },
};

const STEP = 0.45, GRAVITY = 20, JUMP_V = 6.8, WALK = 5.2, SPRINT = 7.4, TRAMPOLINE_V = 12;

export function forwardOf(yaw, pitch = 0) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}
export function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }

/** 9-killstreak ($4.99 Full Game): an HOA drone gunship. Its owner stands still and aims from an orbit overhead. */
export const FINE_FROM_ABOVE = { streak: 9, durationSec: 20, intervalSec: 1.1, botIntervalSec: 2.4, delaySec: 0.9, radius: 5, damage: 170, altitude: 55, orbitR: 28, orbitSec: 36, pitchMid: -0.9, pitchGain: 0.38 };

/** Drone camera for an actor flying Fine From Above. The full mouse pitch range maps onto looking 20-83 degrees down, level = ~52. */
export function droneView(drone, yaw, pitch, time, bounds) {
  const F = FINE_FROM_ABOVE;
  const ang = drone.angle + (time - drone.startedAt) * 2 * Math.PI / F.orbitSec;
  const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : 0, cz = bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  const p = Math.max(-1.45, Math.min(-0.35, F.pitchMid + pitch * F.pitchGain));
  return { pos: { x: cx + Math.cos(ang) * F.orbitR, y: F.altitude, z: cz + Math.sin(ang) * F.orbitR }, yaw, pitch: p, dir: forwardOf(yaw, p) };
}
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng()); }

export function emptyInput() {
  return { forward: 0, right: 0, jump: false, sprint: false, fire: false, reload: false, melee: false, grenade: false, interact: false, switchSlot: null, yaw: 0, pitch: 0 };
}

export class Sim {
  /**
   * @param {{rules:object, weapons:object, rng:()=>number, map?:object, mode?:string, scoreLimit?:number, timeLimit?:number, difficulty?:string}} o
   * rules = hoa_content.json "rules" (camping tuning lives there); weapons = data/weapons.json; perks = data/perks.json
   */
  constructor({ rules, weapons, rng, map = buildCulDeSac(), mode = 'clash', scoreLimit, timeLimit, botDifficulty, difficulty = null, mutators = {}, isDemo = false, perks = null }) {
    if (!weapons) throw new Error('Sim needs weapons (data/weapons.json)');
    this.rules = rules;
    this.weapons = weapons;
    this.perks = perks?.perks || {};
    this.isDemo = !!isDemo;
    this.mutators = {
      bigHead: !!mutators?.bigHead,
      shotgunsOnly: !!mutators?.shotgunsOnly,
      lowGrav: !!mutators?.lowGrav,
      turbo: !!mutators?.turbo,
    };
    const normDiff = difficulty === 'normal' ? 'medium' : difficulty;
    this.difficulty = DIFFICULTY_PROFILES[normDiff] ? normDiff : null;
    this.difficultyProfile = this.difficulty ? DIFFICULTY_PROFILES[this.difficulty] : null;
    const resolvedBotDiff = botDifficulty || this.difficultyProfile?.botDifficulty || 'normal';
    this.botDifficulty = BOT_DIFFICULTY[resolvedBotDiff] ? resolvedBotDiff : 'normal';
    this.rng = rng;
    this.map = map;
    const canonicalMode = resolveModeId(mode);
    const defaults = MODES[canonicalMode]?.defaults || {};
    this.scoreLimit = scoreLimit ?? defaults.scoreLimit ?? 40;
    this.timeLimit = timeLimit ?? defaults.timeLimit ?? 300;
    this.time = 0;
    this.actors = [];
    this.byId = new Map();
    this.events = [];
    this.grenades = [];
    this.fineShells = [];
    this.score = [0, 0];
    this.over = false;
    this.winner = null;
    this.started = false;
    this.nextObjectId = 0;
    this.helicopters = [];
    this.mowers = [];
    this.vehicles = [];
    this.spawnMower();
    this.mode = createMode(mode, this);
  }

  spawnMower({ id = 'mower_driveable', pos = { x: -10, y: 0, z: 6 }, yaw = 0, speed = 0, maxSpeed = 14, reverseSpeed = -5, hp = 250, maxHp = 250 } = {}) {
    const mower = {
      id,
      pos: { ...pos },
      yaw,
      speed,
      maxSpeed,
      reverseSpeed,
      driverId: null,
      hp,
      maxHp,
      isMower: true,
      alive: true,
    };
    mower.takeDamage = (amount, attacker, opts) => this.damageVehicle(mower, amount, attacker, opts);
    this.vehicles.push(mower);
    return mower;
  }

  addBot({ id, name, team, faction, loadout = 'default' } = {}) {
    return this.addActor({ id, name, team, faction, isBot: true, loadout });
  }

  addActor({ id, name, team, faction, isBot = true, loadout = 'default', damageTakenMult, easyLockOn, perk = null }) {
    if (this.mutators?.shotgunsOnly) {
      loadout = 'divorceSettlement';
    } else if (loadout === 'default' && faction && FACTION_DEFAULT_LOADOUTS[faction]) {
      loadout = FACTION_DEFAULT_LOADOUTS[faction];
    }
    const weapons = resolveLoadout(this.weapons, loadout);
    const defaultDmgMult = !isBot && this.difficultyProfile ? this.difficultyProfile.playerDamageTakenMult : 1;
    const defaultLockOn = !isBot && this.difficultyProfile ? !!this.difficultyProfile.lockOn : false;
    const perkDef = (perk && this.perks[perk]) || null;
    const a = {
      id, name, team, faction, isBot, weapons, triggerHeld: false,
      perk: perkDef ? perk : null, perkDef,
      damageTakenMult: typeof damageTakenMult === 'number' ? damageTakenMult : defaultDmgMult,
      easyLockOn: typeof easyLockOn === 'boolean' ? easyLockOn : defaultLockOn,
      activeSlot: 'primary', ammoBank: {},
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
      hp: 100, alive: false, respawnAt: 0, deathAt: 0,
      inVehicle: null,
      ammo: weapons.primary.mag, reloadUntil: 0, nextShotAt: 0, nextMeleeAt: 0, grenades: (weapons.equipment?.count ?? 0) + (perkDef?.extraGrenades || 0),
      onGround: true, kills: 0, deaths: 0, streak: 0, spawnProtectUntil: 0, lowHealthSaid: false,
      lastHitBy: null, lastHurtAt: -Infinity, revealedUntil: 0, firingUntil: 0, meleeAt: -Infinity, lastShotAt: -Infinity,
      hitAgo: Infinity, hitDir: { x: 0, y: 0, z: 0 },
      input: emptyInput(), camp: new CampingMonitor(this.rules.camping), campState: { state: 'ok', dwell: 0 },
      brain: isBot ? newBrain(this.rng) : null,
      takeDamage(amount, attacker, { dir = null } = {}) {
        this.hitAgo = 0;
        let dx = dir?.x ?? (attacker ? this.pos.x - attacker.pos.x : 0);
        let dy = dir?.y ?? (attacker ? this.pos.y - attacker.pos.y : 0);
        let dz = dir?.z ?? (attacker ? this.pos.z - attacker.pos.z : 0);
        const len = Math.hypot(dx, dy, dz) || 1;
        this.hitDir = { x: dx / len, y: dy / len, z: dz / len };
      },
    };
    this.actors.push(a);
    this.byId.set(id, a);
    return a;
  }

  emit(e) { this.events.push({ t: this.time, ...e }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  start() {
    this.started = true;
    if (!this.vehicles.some(v => v.id === 'mower_driveable')) {
      this.spawnMower();
    }
    for (const a of this.actors) this.respawn(a);
    this.assignRoles();
    this.mode.onStart();
    this.emit({ type: 'roundStart', mode: this.mode.constructor.id, round: this.mode.round });
  }

  /**
   * Spawn choice. Hard rule: never spawn where a living enemy within SPAWN_SAFE_M has line of sight,
   * if any spawn avoids that. Then prefer spawns no enemy can see, far from enemies, not stacked.
   */
  spawnThreat(team, p) {
    const chest = { x: p[0], y: 1.2, z: p[1] };
    let near = Infinity, seenBy = 0, seenClose = 0;
    for (const e of this.actors) {
      if (!e.alive || e.team === team) continue;
      const d = Math.hypot(e.pos.x - p[0], e.pos.z - p[1]);
      near = Math.min(near, d);
      if (d > 60 || !this.lineClear(this.eye(e), chest)) continue;
      seenBy++;
      if (d < SPAWN_SAFE_M) seenClose++;
    }
    return { near, seenBy, seenClose };
  }

  pickSpawn(a) {
    const score = p => {
      const t = this.spawnThreat(a.team, p);
      const crowd = this.actors.filter(o => o.alive && o !== a && Math.hypot(o.pos.x - p[0], o.pos.z - p[1]) < 1).length;
      return { t, s: (t.seenClose ? -1000 : 0) - t.seenBy * 40 + Math.min(t.near, 60) - crowd * 50 + this.rng() * 3 };
    };
    let best = null, bestScore = -Infinity, safe = false;
    const side = this.mode.spawnSide(a);
    for (const p of this.map.spawns[side]) {
      const { t, s } = score(p);
      if (s > bestScore) { bestScore = s; best = p; safe = t.seenClose === 0; }
    }
    if (safe) return best;
    // Base is camped: fall back to any nav point no enemy can see up close and none is within 15 m of.
    for (const n of this.map.nodes) {
      const p = [n.x, n.z];
      const { t, s } = score(p);
      if (t.seenClose === 0 && t.near >= 15 && s > bestScore) { bestScore = s; best = p; safe = true; }
    }
    return best;
  }

  /** Ask the mode how each team's bots split between objective play and hunting. */
  assignRoles() {
    for (const team of [0, 1]) {
      const bots = this.actors.filter(a => a.brain && a.team === team);
      bots.forEach((a, i) => { a.brain.role = this.mode.botRole(a, i, bots.length); });
    }
  }

  skill(a) { return BOT_DIFFICULTY[a.difficulty] || BOT_DIFFICULTY[this.botDifficulty]; }

  /** Objective for this bot given its role: objective players go to it, hunters flank around it. */
  roleGoal(a) {
    const g = this.mode.botGoal(a);
    if (!g || a.brain.role !== 'hunter') return g;
    return null;
  }

  /** Round-based modes: everyone back to their spawns at once, no grenades left over. */
  resetRound() {
    this.grenades = [];
    for (const a of this.actors) a.alive = false; // so spawn threat ignores last round's positions
    for (const a of this.actors) this.respawn(a, { roundReset: true });
  }

  respawn(a, { roundReset = false } = {}) {
    if (a.inVehicle) this.exitVehicle(a);
    const best = this.pickSpawn(a);
    Object.assign(a.pos, { x: best[0], y: 0, z: best[1] });
    Object.assign(a.vel, { x: 0, y: 0, z: 0 });
    a.yaw = this.mode.spawnSide(a) === 0 ? 0 : Math.PI;
    a.pitch = 0;
    a.input.yaw = a.yaw; a.input.pitch = 0;
    a.activeSlot = 'primary';
    a.ammoBank = {};
    Object.assign(a, { hp: 100, alive: true, ammo: a.weapons.primary.mag, reloadUntil: 0, grenades: (a.weapons.equipment?.count ?? 0) + (a.perkDef?.extraGrenades || 0), streak: 0,
      spawnProtectUntil: this.time + 1.2, lowHealthSaid: false, lastHitBy: null, onGround: true, hitAgo: Infinity, hitDir: { x: 0, y: 0, z: 0 }, lastShotAt: -Infinity });
    a.camp.reset();
    if (a.brain) { resetBrain(a.brain); a.brain.aimYaw = a.yaw; }
    this.emit({ type: 'spawn', id: a.id, roundReset });
  }

  enterVehicle(actor, vehicleId = null) {
    const a = typeof actor === 'string' ? this.byId.get(actor) : actor;
    if (!a || !a.alive || a.inVehicle) return false;
    let mower = null;
    if (vehicleId) {
      mower = this.vehicles.find(v => v.id === vehicleId);
    } else {
      let bestDist = Infinity;
      for (const v of this.vehicles) {
        if (!v.alive || v.driverId) continue;
        const d = Math.hypot(v.pos.x - a.pos.x, v.pos.z - a.pos.z);
        if (d <= 3.0 && d < bestDist) {
          bestDist = d;
          mower = v;
        }
      }
    }
    if (!mower || !mower.alive || mower.driverId) return false;
    const dist = Math.hypot(mower.pos.x - a.pos.x, mower.pos.z - a.pos.z);
    if (dist > 3.0) return false;

    mower.driverId = a.id;
    a.inVehicle = mower.id;
    this.emit({ type: 'vehicleEnter', actorId: a.id, vehicleId: mower.id });
    return true;
  }

  exitVehicle(actor) {
    const a = typeof actor === 'string' ? this.byId.get(actor) : actor;
    if (!a) return false;
    const vehicleId = a.inVehicle;
    const mower = this.vehicles.find(v => v.id === vehicleId || v.driverId === a.id);
    if (mower) {
      mower.driverId = null;
      const rx = Math.cos(mower.yaw);
      const rz = -Math.sin(mower.yaw);
      let exitX = mower.pos.x + rx * 1.5;
      let exitZ = mower.pos.z + rz * 1.5;
      if (this.blocked(exitX, exitZ, mower.pos.y)) {
        exitX = mower.pos.x - rx * 1.5;
        exitZ = mower.pos.z - rz * 1.5;
        if (this.blocked(exitX, exitZ, mower.pos.y)) {
          exitX = mower.pos.x;
          exitZ = mower.pos.z;
        }
      }
      a.pos.x = exitX;
      a.pos.y = mower.pos.y;
      a.pos.z = exitZ;
      a.vel.x = 0;
      a.vel.y = 0;
      a.vel.z = 0;
    }
    a.inVehicle = null;
    this.emit({ type: 'vehicleExit', actorId: a.id, vehicleId: mower?.id ?? vehicleId });
    return true;
  }

  activeWeapon(a) {
    return (a.weapons && a.weapons[a.activeSlot]) || a.weapons?.primary || null;
  }

  switchWeapon(a, slot) {
    if (!a.weapons || !a.weapons[slot] || a.activeSlot === slot) return;
    const oldSlot = a.activeSlot;
    a.ammoBank[oldSlot] = a.ammo;
    a.activeSlot = slot;
    const w = a.weapons[slot];
    a.reloadUntil = 0;
    a.ammo = typeof a.ammoBank[slot] === 'number' ? a.ammoBank[slot] : w.mag;
    a.lastShotAt = this.time;
    this.emit({ type: 'switchWeapon', id: a.id, slot, weaponId: w.id });
  }

  // ---------------------------------------------------------------- physics helpers

  overlaps(b, x, z, y, r = BODY.radius) {
    if (b.maxY <= y + STEP || b.minY >= y + BODY.height) return false;
    const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    return (cx - x) ** 2 + (cz - z) ** 2 < r * r;
  }
  blocked(x, z, y, r = BODY.radius) { return this.map.boxes.some(b => this.overlaps(b, x, z, y, r)); }

  groundUnder(x, z, y) {
    let g = 0, box = null;
    const r = BODY.radius * 0.9;
    for (const b of this.map.boxes) {
      if (b.maxY > y + STEP + 0.01 || b.maxY <= g) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) { g = b.maxY; box = b; }
    }
    return { g, box };
  }

  move(a, dt) {
    const inp = a.input;
    a.yaw = inp.yaw; a.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
    let mx = fx * inp.forward + rx * inp.right, mz = fz * inp.forward + rz * inp.right;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const sprinting = inp.sprint && inp.forward > 0.1 && !inp.fire;
    const baseSpeed = sprinting ? SPRINT : WALK;
    // Modes may scale an actor's speed (e.g. carrying the casserole: a burst on pickup, then a
    // small edge so a long run across an open map is not a guaranteed death sentence).
    const modeScale = this.mode?.speedScale?.(a) ?? 1;
    const perkScale = sprinting ? (a.perkDef?.sprintMult ?? 1) : 1;
    const speed = (this.mutators?.turbo ? baseSpeed * 1.55 : baseSpeed) * modeScale * perkScale;
    const accel = a.onGround ? 40 : 8;
    const k = Math.min(1, accel * dt);
    a.vel.x += (mx * speed - a.vel.x) * k;
    a.vel.z += (mz * speed - a.vel.z) * k;
    const jumpV = this.mutators?.lowGrav ? JUMP_V * 1.45 : JUMP_V;
    const grav = this.mutators?.lowGrav ? GRAVITY * 0.35 : GRAVITY;
    if (inp.jump && a.onGround) { a.vel.y = jumpV; a.onGround = false; }
    a.vel.y -= grav * dt;

    const nx = a.pos.x + a.vel.x * dt;
    if (!this.blocked(nx, a.pos.z, a.pos.y)) a.pos.x = nx; else a.vel.x = 0;
    const nz = a.pos.z + a.vel.z * dt;
    if (!this.blocked(a.pos.x, nz, a.pos.y)) a.pos.z = nz; else a.vel.z = 0;
    const { minX, maxX, minZ, maxZ } = this.map.bounds;
    a.pos.x = Math.max(minX + BODY.radius, Math.min(maxX - BODY.radius, a.pos.x));
    a.pos.z = Math.max(minZ + BODY.radius, Math.min(maxZ - BODY.radius, a.pos.z));

    const prevY = a.pos.y;
    let ny = prevY + a.vel.y * dt;
    if (a.vel.y > 0) {
      for (const b of this.map.boxes) {
        if (b.minY >= prevY + BODY.height - 0.01 && b.minY < ny + BODY.height && this.overlaps({ ...b, minY: -1e9, maxY: 1e9 }, a.pos.x, a.pos.z, 0)) {
          ny = b.minY - BODY.height; a.vel.y = 0;
        }
      }
    }
    const { g, box } = this.groundUnder(a.pos.x, a.pos.z, Math.max(prevY, ny));
    if (ny <= g) {
      if (box?.kind === 'trampoline' && a.vel.y < -3) {
        a.vel.y = TRAMPOLINE_V; a.onGround = false; ny = g;
        this.emit({ type: 'boing', id: a.id });
      } else {
        ny = g; a.vel.y = 0; a.onGround = true;
      }
    } else {
      a.onGround = false;
    }
    a.pos.y = ny;
    this.depenetrate(a);
  }

  // groundUnder() tests 0.9 of the body radius and overlaps() the full radius, so an actor landing on
  // a prop's rim drops into it, and from inside every horizontal move is blocked: frozen until killed.
  depenetrate(a) {
    const r = BODY.radius + 0.01;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of this.map.boxes) {
        if (!this.overlaps(b, a.pos.x, a.pos.z, a.pos.y)) continue;
        const { x, z } = a.pos;
        const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          a.pos.x = cx + dx / d * r;
          a.pos.z = cz + dz / d * r;
        } else {
          const exits = [[x - b.minX, -1, 0], [b.maxX - x, 1, 0], [z - b.minZ, 0, -1], [b.maxZ - z, 0, 1]];
          const [depth, ex, ez] = exits.reduce((m, e) => (e[0] < m[0] ? e : m));
          a.pos.x += ex * (depth + r);
          a.pos.z += ez * (depth + r);
        }
        moved = true;
      }
      if (!moved) break;
    }
    const { minX, maxX, minZ, maxZ } = this.map.bounds;
    a.pos.x = Math.max(minX + BODY.radius, Math.min(maxX - BODY.radius, a.pos.x));
    a.pos.z = Math.max(minZ + BODY.radius, Math.min(maxZ - BODY.radius, a.pos.z));
  }

  // ---------------------------------------------------------------- combat

  raycast(o, dir, maxT, ignoreId = null) {
    let best = { t: maxT, kind: 'none', actor: null, helicopter: null, head: false };
    const tg = rayGround(o, dir, best.t);
    if (tg < best.t) best = { t: tg, kind: 'world', actor: null, helicopter: null, head: false };
    for (const b of this.map.boxes) {
      const t = rayBox(o, dir, b, best.t);
      if (t < best.t) best = { t, kind: 'world', actor: null, helicopter: null, head: false, box: b };
    }
    const headR = this.mutators?.bigHead ? BODY.headR * 2.2 : BODY.headR;
    for (const a of this.actors) {
      if (!a.alive || a.id === ignoreId) continue;
      const hit = rayActor(o, dir, a.pos, best.t, headR);
      if (hit) best = { t: hit.t, kind: 'actor', actor: a, helicopter: null, head: hit.head };
    }
    for (const h of this.helicopters) {
      if (!h.alive) continue;
      const t = raySphere(o, dir, h.pos, 2.5, best.t);
      if (t !== null && t < best.t) {
        best = { t, kind: 'helicopter', actor: null, helicopter: h, vehicle: null, head: false };
      }
    }
    for (const v of this.vehicles) {
      if (!v.alive || v.driverId === ignoreId) continue;
      const t = raySphere(o, dir, { x: v.pos.x, y: v.pos.y + 0.6, z: v.pos.z }, 1.2, best.t);
      if (t !== null && t < best.t) {
        best = { t, kind: 'vehicle', actor: null, helicopter: null, vehicle: v, head: false };
      }
    }
    best.point = { x: o.x + dir.x * best.t, y: o.y + dir.y * best.t, z: o.z + dir.z * best.t };
    return best;
  }

  lineClear(o, p) {
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
    const d = Math.hypot(dx, dy, dz);
    const dir = { x: dx / d, y: dy / d, z: dz / d };
    for (const b of this.map.boxes) if (rayBox(o, dir, b, d) < d) return false;
    return true;
  }

  eye(a) { return { x: a.pos.x, y: a.pos.y + BODY.eye, z: a.pos.z }; }

  /**
   * Easy Mode close-range auto lock-on: finds the nearest visible enemy within maxRange and front cone.
   * Returns { actor, yaw, pitch, dist } or null.
   */
  findLockOnTarget(a, { maxRange = 28, maxCone = 0.55 } = {}) {
    if (!a?.alive) return null;
    const eye = this.eye(a);
    const f = forwardOf(a.yaw, a.pitch);
    let best = null, bestAng = Infinity, bestDist = Infinity, bestYaw = a.yaw, bestPitch = a.pitch;
    for (const e of this.actors) {
      if (!e.alive || e.team === a.team) continue;
      const t = { x: e.pos.x, y: e.pos.y + 1.25, z: e.pos.z };
      const dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxRange || d < 0.4) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dy * f.y + dz * f.z) / d)));
      const allowedCone = d < 10 ? Math.max(maxCone, 0.85) : maxCone + 0.8 / d;
      if (ang <= allowedCone && this.lineClear(eye, t)) {
        if (ang < bestAng || (Math.abs(ang - bestAng) < 0.08 && d < bestDist)) {
          best = e;
          bestAng = ang;
          bestDist = d;
          bestYaw = yawTo(dx, dz);
          bestPitch = Math.asin(Math.max(-1, Math.min(1, dy / d)));
        }
      }
    }
    return best ? { actor: best, yaw: bestYaw, pitch: bestPitch, dist: bestDist } : null;
  }

  fire(a) {
    const now = this.time, w = this.activeWeapon(a);
    if (!w || now < a.nextShotAt || a.reloadUntil > 0) return;
    if (!w.auto && a.triggerHeld && !a.isBot) return; // semi-auto: one shot per click
    if (a.ammo <= 0) { this.startReload(a); return; }
    a.ammo--;
    a.lastShotAt = now;
    a.nextShotAt = now + w.intervalSec;
    a.firingUntil = now + 0.15;
    a.revealedUntil = Math.max(a.revealedUntil || 0, now + 1.8);
    const moving = Math.hypot(a.vel.x, a.vel.z) > 1;
    let spread = w.spread.base * (moving ? w.spread.moveMult : 1) * (a.onGround ? 1 : w.spread.airMult);
    let baseYaw = a.yaw, basePitch = a.pitch;
    if (a.easyLockOn && !a.isBot) {
      const lock = this.findLockOnTarget(a);
      if (lock) {
        baseYaw = lock.yaw;
        basePitch = lock.pitch;
        a.yaw = lock.yaw;
        a.pitch = lock.pitch;
        spread *= 0.45;
      }
    }
    const o = this.eye(a);
    for (let p = 0; p < (w.pellets || 1); p++) {
      const yaw = baseYaw + gauss(this.rng) * spread, pitch = basePitch + gauss(this.rng) * spread;
      const dir = forwardOf(yaw, pitch);
      const hit = this.raycast(o, dir, w.range, a.id);
      this.emit({ type: 'shot', id: a.id, weaponId: w.id, from: o, to: hit.point, hitId: hit.actor?.id ?? hit.helicopter?.id ?? hit.vehicle?.id ?? null, head: hit.head, kind: hit.kind });
      if (hit.actor && hit.actor.team !== a.team) {
        let dmg = hit.head ? w.damage.head : w.damage.body;
        if (w.falloff && hit.t > w.falloff.startM) dmg *= w.falloff.mult;
        this.damage(hit.actor, dmg, a, { headshot: hit.head, dir, weaponId: w.id });
      } else if (hit.helicopter && hit.helicopter.team !== a.team) {
        let dmg = w.damage.body;
        if (w.falloff && hit.t > w.falloff.startM) dmg *= w.falloff.mult;
        this.damageHelicopter(hit.helicopter, dmg, a, { dir, weaponId: w.id });
      } else if (hit.vehicle && hit.vehicle.alive) {
        let dmg = hit.head ? w.damage.head : w.damage.body;
        if (w.falloff && hit.t > w.falloff.startM) dmg *= w.falloff.mult;
        this.damageVehicle(hit.vehicle, dmg, a, { dir, weaponId: w.id });
      } else if (hit.box?.isCar && now >= (hit.box.alarmUntil || 0)) {
        hit.box.alarmUntil = now + 8;
        this.emit({ type: 'carAlarm', id: a.id, pos: { ...hit.point } });
      }
    }
    if (a.ammo === 0) this.startReload(a);
  }

  shootRay(o, dir, maxRange = 100, attacker = null, damage = 25) {
    const hit = this.raycast(o, dir, maxRange, attacker?.id);
    if (hit.helicopter) {
      if (!attacker || hit.helicopter.team !== attacker.team) {
        this.damageHelicopter(hit.helicopter, damage, attacker, { dir });
        return { hit: true, kind: 'helicopter', target: hit.helicopter, point: hit.point, t: hit.t };
      }
      return { hit: false, friendly: true, kind: 'helicopter', target: hit.helicopter, point: hit.point, t: hit.t };
    }
    if (hit.actor) {
      if (!attacker || hit.actor.team !== attacker.team) {
        this.damage(hit.actor, damage, attacker, { headshot: hit.head, dir });
        return { hit: true, kind: 'actor', target: hit.actor, point: hit.point, t: hit.t };
      }
      return { hit: false, friendly: true, kind: 'actor', target: hit.actor, point: hit.point, t: hit.t };
    }
    return { hit: false, kind: hit.kind, point: hit.point, t: hit.t };
  }

  startReload(a) {
    const w = this.activeWeapon(a);
    if (!w || a.reloadUntil > 0 || a.ammo >= w.mag) return;
    a.reloadUntil = this.time + w.reloadSec * (a.perkDef?.reloadMult ?? 1);
    this.emit({ type: 'reload', id: a.id, weaponId: w.id });
  }

  melee(a) {
    const now = this.time, m = a.weapons.melee;
    if (!m || now < a.nextMeleeAt) return;
    a.nextMeleeAt = now + m.cooldownSec;
    a.meleeAt = now;
    this.emit({ type: 'swing', id: a.id });
    const f = forwardOf(a.yaw);
    let best = null, bd = m.range;
    for (const e of this.actors) {
      if (!e.alive || e.team === a.team) continue;
      const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, dy = e.pos.y - a.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(dy) > 1.2) continue;
      if ((dx * f.x + dz * f.z) / (d || 1) < m.coneDot) continue;
      best = e; bd = d;
    }
    if (best) this.damage(best, m.damage, a, { melee: true, dir: f, weaponId: m.id });
  }

  throwGrenade(a) {
    const e = a.weapons.equipment;
    if (!e || a.grenades <= 0 || this.grenades.some(g => g.ownerId === a.id)) return;
    a.grenades--;
    const P = e.projectile;
    const d = forwardOf(a.yaw, a.pitch + 0.15);
    const o = this.eye(a);
    this.grenades.push({
      ownerId: a.id, team: a.team, weaponId: e.id, def: P, explodeAt: this.time + P.fuseSec,
      pos: { x: o.x + d.x * 0.6, y: o.y + d.y * 0.6, z: o.z + d.z * 0.6 },
      vel: { x: d.x * P.speed + a.vel.x, y: d.y * P.speed + P.upBoost, z: d.z * P.speed + a.vel.z },
    });
    this.emit({ type: 'throw', id: a.id });
  }

  stepGrenades(dt) {
    for (const g of this.grenades) {
      g.vel.y -= g.def.gravity * dt;
      for (const axis of ['x', 'y', 'z']) {
        const prev = g.pos[axis];
        g.pos[axis] += g.vel[axis] * dt;
        const inside = this.map.boxes.some(b => g.pos.x > b.minX && g.pos.x < b.maxX && g.pos.y > b.minY && g.pos.y < b.maxY && g.pos.z > b.minZ && g.pos.z < b.maxZ);
        if (inside || (axis === 'y' && g.pos.y < 0.08)) {
          g.pos[axis] = axis === 'y' && g.pos.y < 0.08 && !inside ? 0.08 : prev;
          g.vel[axis] *= -g.def.bounce;
          if (axis === 'y') { g.vel.x *= 0.6; g.vel.z *= 0.6; }
        }
      }
    }
    const boom = this.grenades.filter(g => this.time >= g.explodeAt);
    this.grenades = this.grenades.filter(g => this.time < g.explodeAt);
    for (const g of boom) {
      this.emit({ type: 'explosion', id: g.ownerId, pos: { ...g.pos } });
      const owner = this.byId.get(g.ownerId);
      for (const e of this.actors) {
        if (!e.alive) continue;
        if (e.id === g.ownerId ? !g.def.selfDamage : e.team === g.team && !g.def.friendlyDamage) continue;
        const c = { x: e.pos.x, y: e.pos.y + 0.9, z: e.pos.z };
        const d = Math.hypot(c.x - g.pos.x, c.y - g.pos.y, c.z - g.pos.z);
        if (d >= g.def.radius) continue;
        const dir = { x: (c.x - g.pos.x) / (d || 1), y: 0.6, z: (c.z - g.pos.z) / (d || 1) };
        this.damage(e, g.def.damage * (1 - d / g.def.radius), owner, { explosive: true, dir, weaponId: g.weaponId });
      }
      for (const v of this.vehicles) {
        if (!v.alive) continue;
        const c = { x: v.pos.x, y: v.pos.y + 0.6, z: v.pos.z };
        const d = Math.hypot(c.x - g.pos.x, c.y - g.pos.y, c.z - g.pos.z);
        if (d >= g.def.radius) continue;
        const dir = { x: (c.x - g.pos.x) / (d || 1), y: 0.6, z: (c.z - g.pos.z) / (d || 1) };
        this.damageVehicle(v, g.def.damage * (1 - d / g.def.radius), owner, { explosive: true, dir, weaponId: g.weaponId });
      }
    }
  }

  damageVehicle(v, amount, attacker = null, { dir = null, explosive = false, weaponId = null } = {}) {
    if (!v.alive) return;
    v.hp -= amount;
    this.emit({ type: 'vehicleHurt', id: v.id, hp: Math.max(0, v.hp), maxHp: v.maxHp, attackerId: attacker?.id ?? null, amount });
    if (v.hp <= 0) {
      v.hp = 0;
      v.alive = false;
      const boomPos = { ...v.pos };
      const driver = v.driverId ? this.byId.get(v.driverId) : null;
      if (driver) {
        this.exitVehicle(driver);
        if (driver.alive) {
          driver.spawnProtectUntil = 0;
          this.damage(driver, 100, attacker, { explosive: true, weaponId: 'mowerExplosion' });
        }
      }
      this.emit({
        type: 'vehicleDestroyed',
        id: v.id,
        vehicle: 'mower',
        killerId: attacker?.id ?? null,
        pos: boomPos,
      });
      this.emit({ type: 'explosion', id: attacker?.id ?? v.id, pos: boomPos });

      // Radial damage (100 damage in 5m)
      for (const e of this.actors) {
        if (!e.alive || e === driver) continue;
        const d = Math.hypot(e.pos.x - boomPos.x, (e.pos.y || 0) - boomPos.y, e.pos.z - boomPos.z);
        if (d <= 5) {
          const dmg = 100 * (1 - d / 5);
          this.damage(e, dmg, attacker, { explosive: true, weaponId: 'mowerExplosion' });
        }
      }
    }
  }

  damage(target, amount, attacker, { headshot = false, melee = false, explosive = false, dir = null, weaponId = null } = {}) {
    if (!target) return;
    if (target.isMower || (typeof target.hp === 'number' && target.driverId !== undefined)) {
      return this.damageVehicle(target, amount, attacker, { headshot, melee, explosive, dir, weaponId });
    }
    if (!target.alive || this.time < target.spawnProtectUntil || this.over) return;
    // Actor-level (per-faction/easy mode) and mode-level (e.g. carrying the casserole) scales multiply.
    const dmgMult = (typeof target.damageTakenMult === 'number' ? target.damageTakenMult : 1)
      * (this.mode?.damageScale?.(target) ?? 1)
      * (explosive ? (target.perkDef?.explosiveDamageMult ?? 1) : 1);
    const effectiveAmount = amount * dmgMult;
    target.hp -= effectiveAmount;
    target.lastHitBy = attacker?.id ?? null;
    target.lastHurtAt = this.time;
    if (typeof target.takeDamage === 'function') {
      target.takeDamage(effectiveAmount, attacker, { dir });
    } else {
      target.hitAgo = 0;
      let dx = dir?.x ?? (attacker ? target.pos.x - attacker.pos.x : 0);
      let dy = dir?.y ?? (attacker ? target.pos.y - attacker.pos.y : 0);
      let dz = dir?.z ?? (attacker ? target.pos.z - attacker.pos.z : 0);
      const len = Math.hypot(dx, dy, dz) || 1;
      target.hitDir = { x: dx / len, y: dy / len, z: dz / len };
    }
    this.emit({ type: 'hurt', id: target.id, attackerId: attacker?.id ?? null, amount: effectiveAmount, headshot, hp: Math.max(0, target.hp) });
    if (target.hp > 0) {
      if (target.hp < 25 && !target.lowHealthSaid) { target.lowHealthSaid = true; this.emit({ type: 'lowHealth', id: target.id }); }
      return;
    }
    target.alive = false;
    target.hp = 0;
    if (target.inVehicle) {
      this.exitVehicle(target);
    }
    target.deaths++;
    target.deathAt = this.time;
    target.respawnAt = this.time + this.mode.respawnDelay(target) * (target.perkDef?.respawnMult ?? 1);
    target.streak = 0;
    const killer = attacker && attacker.id !== target.id ? attacker : null;
    if (killer) {
      killer.kills++;
      killer.streak++;
      if (!killer.isBot && killer.streak === 3) {
        this.triggerRingUav(killer);
      } else if (killer.streak === 5) {
        this.spawnHelicopter(killer);
      } else if (!killer.isBot && killer.streak === 7) {
        this.spawnMowerStampede(killer);
      } else if (killer.streak === FINE_FROM_ABOVE.streak) {
        this.startFineFromAbove(killer);
      }
    }
    if (target.drone) { target.drone = null; this.emit({ type: 'fineFromAboveEnd', id: target.id }); }
    const ev = {
      type: 'kill', killerId: killer?.id ?? null, victimId: target.id, headshot, melee, explosive, weaponId,
      dir: dir || { x: 0, y: 0, z: 0 }, victimPos: { ...target.pos }, killerPos: killer ? { ...killer.pos } : null,
      killerAirborne: killer ? killer.onGround === false && !killer.inVehicle : false,
    };
    this.emit(ev);
    this.mode.onKill(ev, killer, target);
  }

  /** 3-Killstreak (Demo & Full Game): Ring Doorbell UAV Sweep reveals all enemies on radar for 15 seconds. */
  triggerRingUav(ownerActor) {
    const until = this.time + 15;
    for (const a of this.actors) {
      if (a.team !== ownerActor.team && !a.perkDef?.uavImmune) {
        a.revealedUntil = Math.max(a.revealedUntil || 0, until);
      }
    }
    this.emit({ type: 'uavSweep', ownerId: ownerActor.id, team: ownerActor.team, until });
    return until;
  }

  startFineFromAbove(owner) {
    if (this.isDemo) {
      this.emit({ type: 'streakLocked', streakType: 'fineFromAbove', ownerId: owner.id, team: owner.team });
      return null;
    }
    const F = FINE_FROM_ABOVE;
    owner.drone = { startedAt: this.time, until: this.time + F.durationSec, nextShot: this.time + 1.0, angle: this.rng() * 2 * Math.PI };
    this.emit({ type: 'fineFromAboveStart', id: owner.id, team: owner.team, until: owner.drone.until, startedAt: owner.drone.startedAt, angle: owner.drone.angle });
    return owner.drone;
  }

  /** While the drone is up its owner stands still and the trigger calls in shells instead of firing the gun. */
  droneInput(a) {
    const F = FINE_FROM_ABOVE, d = a.drone, inp = a.input;
    if (this.time >= d.until) {
      a.drone = null;
      this.emit({ type: 'fineFromAboveEnd', id: a.id });
      return;
    }
    if (a.isBot) this.botDroneAim(a);
    if ((a.isBot || inp.fire) && this.time >= d.nextShot) {
      const v = droneView(d, inp.yaw, inp.pitch, this.time, this.map.bounds);
      const maxT = 250;
      const hit = this.raycast(v.pos, v.dir, maxT, a.id);
      if (hit.t < maxT) {
        const pos = { x: v.pos.x + v.dir.x * hit.t, y: v.pos.y + v.dir.y * hit.t, z: v.pos.z + v.dir.z * hit.t };
        const impactAt = this.time + F.delaySec;
        this.fineShells.push({ ownerId: a.id, team: a.team, pos, impactAt });
        d.nextShot = this.time + (a.isBot ? F.botIntervalSec : F.intervalSec);
        this.emit({ type: 'fineShell', id: a.id, pos: { ...pos }, impactAt, nextShot: d.nextShot });
      }
    }
    Object.assign(inp, { forward: 0, right: 0, jump: false, sprint: false, fire: false, melee: false, grenade: false, reload: false, interact: false });
  }

  /** Bots point the drone at a random living enemy, with a few metres of error. */
  botDroneAim(a) {
    const d = a.drone;
    if (this.time < d.nextShot - 0.05 && d.aimAt) return this.aimDroneAt(a, d.aimAt);
    const foes = this.actors.filter(e => e.alive && e.team !== a.team);
    if (!foes.length) return;
    const t = foes[Math.floor(this.rng() * foes.length)];
    d.aimAt = { x: t.pos.x + gauss(this.rng) * 4.5, y: 0, z: t.pos.z + gauss(this.rng) * 4.5 };
    this.aimDroneAt(a, d.aimAt);
  }

  aimDroneAt(a, p) {
    const v = droneView(a.drone, 0, 0, this.time, this.map.bounds);
    const dx = p.x - v.pos.x, dy = p.y - v.pos.y, dz = p.z - v.pos.z;
    a.input.yaw = yawTo(dx, dz);
    const F = FINE_FROM_ABOVE;
    a.input.pitch = Math.max(-1.45, Math.min(1.45, (Math.atan2(dy, Math.hypot(dx, dz)) - F.pitchMid) / F.pitchGain));
  }

  stepFineShells() {
    if (!this.fineShells.length) return;
    const F = FINE_FROM_ABOVE;
    const due = this.fineShells.filter(s => this.time >= s.impactAt);
    this.fineShells = this.fineShells.filter(s => this.time < s.impactAt);
    for (const s of due) {
      this.emit({ type: 'explosion', id: s.ownerId, pos: { ...s.pos }, fine: true });
      const owner = this.byId.get(s.ownerId) || null;
      for (const e of this.actors) {
        if (!e.alive || e.team === s.team) continue;
        const c = { x: e.pos.x, y: e.pos.y + 0.9, z: e.pos.z };
        const dist = Math.hypot(c.x - s.pos.x, c.y - s.pos.y, c.z - s.pos.z);
        if (dist >= F.radius) continue;
        const dir = { x: (c.x - s.pos.x) / (dist || 1), y: 0.6, z: (c.z - s.pos.z) / (dist || 1) };
        this.damage(e, F.damage * (1 - 0.5 * dist / F.radius), owner, { explosive: true, dir, weaponId: 'fineFromAbove' });
      }
    }
  }

  /** 7-Killstreak ($4.99 Full Game Exclusive): Autonomous Riding Lawn Mower Stampede. */
  spawnMowerStampede(ownerActor) {
    if (this.isDemo) {
      this.emit({ type: 'streakLocked', streakType: 'mowerStampede', ownerId: ownerActor.id, team: ownerActor.team });
      return [];
    }
    const spawned = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      const m = {
        id: 'mower_' + (++this.nextObjectId),
        team: ownerActor.team,
        ownerId: ownerActor.id,
        alive: true,
        pos: { x: Math.cos(angle) * 8, y: 0, z: Math.sin(angle) * 8 },
        angle,
        radius: 10 + i * 3,
        speed: 1.4,
        expiresAt: this.time + 22,
      };
      this.mowers.push(m);
      spawned.push(m);
    }
    this.emit({ type: 'mowerStampede', ownerId: ownerActor.id, team: ownerActor.team, count: spawned.length });
    return spawned;
  }

  updateMowers(dt) {
    const now = this.time;
    for (const m of this.mowers) {
      if (!m.alive) continue;
      if (now >= m.expiresAt) { m.alive = false; continue; }
      m.angle += m.speed * dt;
      m.pos.x = Math.cos(m.angle) * m.radius;
      m.pos.z = Math.sin(m.angle) * m.radius;
      const owner = this.byId.get(m.ownerId);
      for (const e of this.actors) {
        if (!e.alive || e.team === m.team || now < e.spawnProtectUntil) continue;
        if (Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z) < 1.8) {
          this.damage(e, 120, owner || { id: m.ownerId, team: m.team }, { explosive: true, weaponId: 'lawnMower' });
        }
      }
    }
    this.mowers = this.mowers.filter(m => m.alive);
  }

  spawnHelicopter(ownerActor) {
    const h = {
      id: 'helo_' + (++this.nextObjectId),
      team: ownerActor.team,
      ownerId: ownerActor.id,
      hp: 160,
      maxHp: 160,
      alive: true,
      pos: { x: 0, y: 16, z: 0 },
      angle: 0,
      radius: 24,
      speed: 0.4,
      lastFire: 0,
      fireInterval: 0.8,
      expiresAt: this.time + 35,
    };
    this.helicopters.push(h);
    this.emit({ type: 'heloSpawn', id: h.id, ownerId: h.ownerId, team: h.team, pos: { ...h.pos } });
    return h;
  }

  damageHelicopter(h, amount, attacker = null, { dir = null, weaponId = null } = {}) {
    if (!h.alive) return;
    h.hp -= amount;
    this.emit({ type: 'heloHurt', id: h.id, hp: Math.max(0, h.hp), maxHp: h.maxHp, attackerId: attacker?.id ?? null, amount });
    if (h.hp <= 0) {
      h.hp = 0;
      h.alive = false;
      const killerId = attacker?.id ?? null;
      const killerTeam = attacker ? attacker.team : (h.team === 0 ? 1 : 0);
      this.emit({
        type: 'streakDestroyed',
        streakType: 'helicopter',
        killerId,
        killerTeam,
        ownerId: h.ownerId,
        pos: { ...h.pos },
      });
      if (attacker) {
        attacker.streakDestroyedCount = (attacker.streakDestroyedCount || 0) + 1;
        this.addScore(attacker.team, 1);
      }
    }
  }

  updateHelicopters(dt) {
    const now = this.time;
    for (const h of this.helicopters) {
      if (!h.alive) continue;
      if (now >= h.expiresAt) {
        h.alive = false;
        this.emit({ type: 'heloExpired', id: h.id, ownerId: h.ownerId });
        continue;
      }

      h.angle += h.speed * dt;
      h.pos.x = Math.cos(h.angle) * h.radius;
      h.pos.z = Math.sin(h.angle) * h.radius;
      h.pos.y = 16 + Math.sin(h.angle * 2) * 1.5;

      if (now - h.lastFire >= h.fireInterval) {
        let target = null;
        let bestDist = Infinity;
        for (const e of this.actors) {
          if (!e.alive || e.team === h.team || now < e.spawnProtectUntil) continue;
          const eCenter = { x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z };
          const dist = Math.hypot(eCenter.x - h.pos.x, eCenter.y - h.pos.y, eCenter.z - h.pos.z);
          if (dist > 65) continue;
          if (this.lineClear(h.pos, eCenter)) {
            if (dist < bestDist) {
              bestDist = dist;
              target = e;
            }
          }
        }

        if (target) {
          h.lastFire = now;
          const targetPoint = { x: target.pos.x, y: target.pos.y + 1.0, z: target.pos.z };
          this.emit({
            type: 'heloShot',
            id: h.id,
            ownerId: h.ownerId,
            from: { ...h.pos },
            to: targetPoint,
            targetId: target.id,
          });
          const owner = this.byId.get(h.ownerId);
          const dx = targetPoint.x - h.pos.x, dy = targetPoint.y - h.pos.y, dz = targetPoint.z - h.pos.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          this.damage(target, 10, owner || { id: h.ownerId, team: h.team }, {
            dir: { x: dx / len, y: dy / len, z: dz / len },
            weaponId: 'helicopter',
          });
        }
      }
    }
    this.helicopters = this.helicopters.filter(h => h.alive);
  }

  /** Modes award points through here so the score limit is checked in one place. */
  addScore(team, n = 1) {
    if (this.over) return;
    this.score[team] += n;
    if (this.score[team] >= this.scoreLimit) this.end(team);
    else this.mode.onScore?.();
  }

  end(winner) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.emit({ type: 'matchEnd', winner });
  }

  // ---------------------------------------------------------------- main step

  step(dt) {
    if (!this.started || this.over) return;
    this.time += dt;
    const now = this.time;
    for (const a of this.actors) {
      if (typeof a.hitAgo === 'number') a.hitAgo += dt;
      if (!a.alive) { if (now >= a.respawnAt) this.respawn(a); continue; }
      if (a.brain && !a.scripted) this.think(a, dt);
      if (a.drone) this.droneInput(a);
      if (a.reloadUntil > 0 && now >= a.reloadUntil) {
        a.reloadUntil = 0;
        const w = this.activeWeapon(a);
        if (w) a.ammo = w.mag;
      }
      if (!a.inVehicle) {
        this.move(a, dt);
      }
      const inp = a.input;
      if (inp.interact) {
        if (a.inVehicle) {
          this.exitVehicle(a);
        } else {
          this.enterVehicle(a);
        }
        inp.interact = false;
      }
      if (inp.switchSlot) {
        this.switchWeapon(a, inp.switchSlot);
        if (!a.isBot) inp.switchSlot = null;
      }
      if (inp.reload) this.startReload(a);
      if (inp.fire) this.fire(a);
      a.triggerHeld = inp.fire;
      // auto-reload after 1 s of not shooting, stretched for slow guns: a flat 1 s reloaded a sniper
      // (1.15 s between shots) after every single shot
      const aw = this.activeWeapon(a);
      if (!inp.fire && a.reloadUntil === 0 && a.ammo < (aw?.mag ?? 0) && now - (a.lastShotAt ?? 0) >= Math.max(1.0, (aw?.intervalSec ?? 0) + 0.5)) {
        this.startReload(a);
      }
      if (inp.melee) this.melee(a);
      if (inp.grenade) this.throwGrenade(a);
      if (!a.isBot) { inp.melee = false; inp.grenade = false; inp.reload = false; inp.switchSlot = null; }
      const c = a.camp.update(now, dt, a.pos, { alive: a.alive, exempt: this.mode.campingExempt(a) || !!a.drone });
      if (c.state === 'warning' && a.campState?.state !== 'warning') this.emit({ type: 'campingWarn', id: a.id });
      if (c.state === 'snitch' && a.campState?.state !== 'snitch') { a.revealedUntil = now + 6; this.emit({ type: 'campingSnitch', id: a.id }); }
      a.campState = c;
    }
    this.stepGrenades(dt);
    this.stepFineShells();
    this.updateHelicopters(dt);
    this.updateMowers(dt);
    this.updateVehicles(dt);
    this.mode.update(dt);
    if (now >= this.timeLimit) {
      const tied = this.score[0] === this.score[1];
      const ot = this.mode.constructor.OVERTIME_SEC;
      if (tied && ot && !this.overtime) {
        this.overtime = true;
        this.timeLimit += ot;
        this.scoreLimit = this.score[0] + 1;
        this.emit({ type: 'overtime', seconds: ot });
      } else {
        this.end(tied ? null : this.score[0] > this.score[1] ? 0 : 1);
      }
    }
  }

  updateVehicles(dt) {
    for (const v of this.vehicles) {
      if (!v.alive) continue;
      if (v.hp <= 0) {
        this.damageVehicle(v, 0);
        continue;
      }
      if (v.driverId) {
        const driver = this.byId.get(v.driverId);
        if (!driver || !driver.alive) {
          v.driverId = null;
          if (driver) driver.inVehicle = null;
          continue;
        }

        const inp = driver.input;
        const targetSpeed = inp.forward > 0
          ? inp.forward * v.maxSpeed
          : inp.forward < 0
            ? inp.forward * Math.abs(v.reverseSpeed)
            : 0;

        const accel = 18;
        const decel = 24;
        if (targetSpeed > v.speed) {
          v.speed = Math.min(targetSpeed, v.speed + accel * dt);
        } else if (targetSpeed < v.speed) {
          v.speed = Math.max(targetSpeed, v.speed - decel * dt);
        }

        const steerRate = 2.4;
        if (inp.right !== 0) {
          v.yaw = wrap(v.yaw - inp.right * steerRate * dt);
        }
        v.steeringAngle = -inp.right * 0.5;

        const fx = -Math.sin(v.yaw);
        const fz = -Math.cos(v.yaw);
        const nx = v.pos.x + fx * v.speed * dt;
        if (!this.blocked(nx, v.pos.z, v.pos.y, 0.8)) {
          v.pos.x = nx;
        } else {
          v.speed = 0;
        }
        const nz = v.pos.z + fz * v.speed * dt;
        if (!this.blocked(v.pos.x, nz, v.pos.y, 0.8)) {
          v.pos.z = nz;
        } else {
          v.speed = 0;
        }

        if (this.map?.bounds) {
          const { minX, maxX, minZ, maxZ } = this.map.bounds;
          v.pos.x = Math.max(minX + 0.8, Math.min(maxX - 0.8, v.pos.x));
          v.pos.z = Math.max(minZ + 0.8, Math.min(maxZ - 0.8, v.pos.z));
        }

        driver.pos.x = v.pos.x;
        driver.pos.y = v.pos.y;
        driver.pos.z = v.pos.z;
        driver.yaw = v.yaw;
        driver.vel.x = fx * v.speed;
        driver.vel.z = fz * v.speed;

        if (v.speed > 4) {
          v.roadkillCooldowns ??= new Map();
          for (const e of this.actors) {
            if (!e.alive || e.id === driver.id) continue;
            if (e.team !== undefined && driver.team !== undefined && e.team === driver.team) continue;
            const d = Math.hypot(e.pos.x - v.pos.x, e.pos.z - v.pos.z);
            if (d < 1.8) {
              const lastHit = v.roadkillCooldowns.get(e.id);
              if (lastHit !== undefined && this.time - lastHit < 0.5) continue;
              v.roadkillCooldowns.set(e.id, this.time);

              this.damage(e, 85, driver, { dir: { x: fx, y: 0.2, z: fz }, weaponId: 'mower' });

              e.vel.x = fx * 16;
              e.vel.y = 4;
              e.vel.z = fz * 16;
              e.onGround = false;

              this.emit({ type: 'roadkill', killerId: driver.id, targetId: e.id, vehicle: 'mower' });
            }
          }
        }
      } else {
        if (Math.abs(v.speed) > 0.01) {
          const decel = 15;
          if (v.speed > 0) v.speed = Math.max(0, v.speed - decel * dt);
          else v.speed = Math.min(0, v.speed + decel * dt);
          const fx = -Math.sin(v.yaw);
          const fz = -Math.cos(v.yaw);
          v.pos.x += fx * v.speed * dt;
          v.pos.z += fz * v.speed * dt;
        } else {
          v.speed = 0;
        }
      }
    }
  }

  snapshot() {
    const snap = this.actors.map(a => ({
      id: a.id, team: a.team, x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, pitch: a.pitch, alive: a.alive,
      speed: Math.hypot(a.vel.x, a.vel.z), firing: this.time < a.firingUntil, onGround: a.onGround,
      inVehicle: a.inVehicle || null,
      hitAgo: a.hitAgo ?? Infinity,
      hitDir: a.hitDir ? { x: a.hitDir.x, y: a.hitDir.y, z: a.hitDir.z } : { x: 0, y: 0, z: 0 },
    }));
    snap.helicopters = this.helicopters.map(h => ({
      id: h.id,
      team: h.team,
      ownerId: h.ownerId,
      hp: h.hp,
      maxHp: h.maxHp,
      alive: h.alive,
      pos: { ...h.pos },
      x: h.pos.x,
      y: h.pos.y,
      z: h.pos.z,
      angle: h.angle,
    }));
    snap.mowers = this.mowers.map(m => ({
      id: m.id,
      team: m.team,
      ownerId: m.ownerId,
      alive: m.alive,
      x: m.pos.x,
      y: m.pos.y,
      z: m.pos.z,
      angle: m.angle,
    }));
    snap.vehicles = this.vehicles.map(v => ({
      id: v.id,
      pos: { ...v.pos },
      x: v.pos.x,
      y: v.pos.y,
      z: v.pos.z,
      yaw: v.yaw,
      speed: v.speed,
      maxSpeed: v.maxSpeed,
      reverseSpeed: v.reverseSpeed,
      driverId: v.driverId,
      hp: v.hp,
      maxHp: v.maxHp,
      isMower: v.isMower,
      alive: v.alive,
    }));
    return snap;
  }

  // ---------------------------------------------------------------- bots

  canSee(a, e) {
    const o = this.eye(a);
    return this.lineClear(o, { x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z }) ||
      this.lineClear(o, { x: e.pos.x, y: e.pos.y + BODY.headY, z: e.pos.z });
  }

  think(a, dt) {
    const b = a.brain, now = this.time, inp = a.input, rng = this.rng, K = this.skill(a);
    inp.fire = false; inp.melee = false; inp.reload = false; inp.jump = false; inp.grenade = false;

    if (now >= b.nextScanAt) {
      b.nextScanAt = now + 0.18 + rng() * 0.08;
      const f = forwardOf(a.yaw);
      let best = null, bd = Infinity;
      // runners (e.g. a casserole carrier) only fight what is in their face and otherwise keep moving
      const runner = this.mode.botRunner(a);
      if (runner && b.target && Math.hypot(b.target.pos.x - a.pos.x, b.target.pos.z - a.pos.z) > 6) { b.target = null; b.path = null; }
      for (const e of this.actors) {
        if (!e.alive || e.team === a.team) continue;
        const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > (runner ? 6 : K.range)) continue;
        const inFov = (dx * f.x + dz * f.z) / (d || 1) > Math.cos(K.fov);
        const alerted = d < 7 || e.revealedUntil > now || (a.lastHitBy === e.id && now - a.lastHurtAt < 1.5) || e === b.target;
        if (!inFov && !alerted) continue;
        if (!this.canSee(a, e)) continue;
        const score = d - (e === b.target ? 8 : 0);
        if (score < bd) { bd = score; best = e; }
      }
      if (best && best !== b.target) {
        b.reactAt = now + K.react[0] + rng() * K.react[1];
        b.burstLeft = 0;
        if (!b.spotted.has(best.id)) { b.spotted.add(best.id); this.emit({ type: 'spotted', id: a.id, targetId: best.id }); }
      }
      if (best) { b.target = best; b.seenAt = now; b.lastKnown = { x: best.pos.x, z: best.pos.z }; }
      else if (b.target && (now - b.seenAt > 1.2 || !b.target.alive)) {
        b.target = null;
        b.path = null;
      }
      if (!b.target) {
        const g = this.roleGoal(a);
        if (g && g !== b.objective && Math.hypot(g.x - a.pos.x, g.z - a.pos.z) < 18) { b.objective = g; b.path = null; b.lastKnown = null; }
      }
      if (!b.target && !b.lastKnown) {
        const snitch = this.actors.find(e => e.alive && e.team !== a.team && e.revealedUntil > now);
        if (snitch && (b.role !== 'objective' || !this.roleGoal(a))) { b.lastKnown = { x: snitch.pos.x, z: snitch.pos.z }; b.path = null; }
      }
    }

    let wantYaw = a.yaw, wantPitch = 0;
    inp.forward = 0; inp.right = 0; inp.sprint = false;
    const t = b.target;
    if (t && t.alive) {
      const ax = t.pos.x - a.pos.x, az = t.pos.z - a.pos.z;
      const d = Math.hypot(ax, az);
      const aimY = t.pos.y + (b.aimHead ? BODY.headY : 1.1) - (a.pos.y + BODY.eye);
      wantYaw = yawTo(ax, az);
      wantPitch = Math.atan2(aimY, d);
      if (now >= b.strafeUntil) { b.strafeDir = rng() < 0.5 ? -1 : 1; b.strafeUntil = now + 0.5 + rng() * 0.9; }
      // fight at the held weapon's range: close in until inside its falloff (shotguns rush, rifles hold),
      // and weapons that are wildly inaccurate on the move (snipers) plant their feet to shoot
      const w = this.activeWeapon(a);
      const pref = Math.max(6, Math.min(24, (w?.falloff?.startM ?? 30) * 0.8));
      const planted = (w?.spread?.moveMult ?? 1) >= 3 && now - b.seenAt < 0.35;
      inp.right = planted ? 0 : b.strafeDir * 0.8;
      inp.forward = d > pref ? (planted ? 0 : 0.7) : d < Math.min(5, pref * 0.5) ? -0.5 : 0;
      if (pref < 10 && d > pref) { inp.forward = 1; inp.sprint = true; } // close-range guns rush in
      // mid-fight, drift onto a nearby objective (e.g. a receipt) instead of pure strafing
      // mid-fight: objective players keep pushing to the objective while they shoot (fight on the
      // move); hunters only grab something they are practically standing on (e.g. a receipt)
      const g = this.mode.botGoal(a);
      if (g) {
        const gx = g.x - a.pos.x, gz = g.z - a.pos.z, gd = Math.hypot(gx, gz);
        const reach = b.role === 'objective' ? 40 : 3;
        if (gd < reach && gd > (g.radius ? g.radius * 0.5 : 0.2)) {
          inp.forward = (gx * -Math.sin(a.yaw) + gz * -Math.cos(a.yaw)) / gd;
          inp.right = (gx * Math.cos(a.yaw) + gz * -Math.sin(a.yaw)) / gd;
        }
      }
      if (d < 1.8) inp.melee = true;
      const aligned = Math.abs(wrap(wantYaw - a.yaw)) < 0.15;
      // shotguns hold fire until close; long-range guns stop wasting rounds at 80 m+ (bots were
      // sniping across the pickleball courts, which made the sniper a bot-meta pick and left it 2.5x
      // the K/D of the next primary)
      const inRange = d <= Math.min(80, Math.max(12, (w?.falloff?.startM ?? 60) * 1.6));
      if (aligned && inRange && now >= b.reactAt && now - b.seenAt < 0.35) {
        if (b.burstLeft <= 0 && now >= b.nextBurstAt) {
          // a burst lasts about as long as an AR burst whatever the gun, so slow weapons (sniper, shotgun)
          // re-roll their aim error every shot instead of repeating one bad aim for several seconds
          const shots = K.burst[0] + Math.floor(rng() * K.burst[1]);
          b.burstLeft = Math.max(1, Math.round(shots * Math.min(1, 0.105 / (w?.intervalSec || 0.105))));
          b.aimHead = rng() < K.head;
          const moving = Math.hypot(t.vel.x, t.vel.z) > 1;
          // slow guns get the time between shots to line up: aim error shrinks with the fire interval,
          // so a sniper bot is a threat instead of one wild shot per second (spray weapons are unchanged)
          const settle = Math.min(1, 0.105 / (w?.intervalSec || 0.105)) ** 0.12;
          const sigma = (K.sigma[0] + d * K.sigma[1] + (moving ? K.sigma[2] : 0)) * settle;
          b.errYaw = gauss(rng) * sigma;
          b.errPitch = gauss(rng) * sigma * 0.7;
        }
        if (b.burstLeft > 0) {
          if (now >= a.nextShotAt && a.reloadUntil === 0) {
            inp.fire = true;
            b.burstLeft--;
            if (b.burstLeft === 0) b.nextBurstAt = now + K.pause[0] + rng() * K.pause[1];
          }
        }
      }
    } else {
      b.target = null;
      if (a.ammo < 12) inp.reload = true;
      if (!b.path || b.pathIdx >= b.path.length) {
        const from = nearestNode(this.map.nodes, this.map.boxes, a.pos.x, a.pos.z);
        let goal;
        const objective = b.objective || (b.role === 'objective' || rng() < 0.7 ? this.roleGoal(a) : null);
        const flank = b.role === 'hunter' ? this.mode.botGoal(a) : null;
        if (b.lastKnown && !(b.role === 'objective' && objective)) { goal = nearestNode(this.map.nodes, this.map.boxes, b.lastKnown.x, b.lastKnown.z); b.lastKnown = null; }
        else if (objective) {
          b.lastKnown = null; goal = nearestNode(this.map.nodes, this.map.boxes, objective.x, objective.z); b.objective = objective; }
        else if (flank) {
          // hunters work the ring around the objective: close enough to catch attackers, not on it
          const nodes = this.map.nodes;
          const ring = nodes.map((n, i) => i).filter(i => { const dd = Math.hypot(nodes[i].x - flank.x, nodes[i].z - flank.z); return dd > 9 && dd < 26; });
          goal = ring.length ? ring[Math.floor(rng() * ring.length)] : nearestNode(nodes, this.map.boxes, flank.x, flank.z);
        } else {
          const nodes = this.map.nodes;
          const pool = rng() < 0.55 ? nodes.map((n, i) => i).filter(i => Math.abs(nodes[i].x) < 16 && Math.abs(nodes[i].z) < 22) : nodes.map((n, i) => i);
          goal = pool[Math.floor(rng() * pool.length)];
        }
        b.path = findPath(this.map.nodes, from, goal) || [goal];
        b.pathIdx = 0;
      }
      // last few metres to an objective (receipt, flag, zone centre) go straight at it
      if (b.objective) {
        const live = this.roleGoal(a);
        b.objective = live && Math.hypot(live.x - b.objective.x, live.z - b.objective.z) < 0.1 ? live : null;
      }
      const near = b.objective && Math.hypot(b.objective.x - a.pos.x, b.objective.z - a.pos.z) < 8 ? b.objective : null;
      const node = near || this.map.nodes[b.path[b.pathIdx]];
      if (near) {
        wantYaw = yawTo(near.x - a.pos.x, near.z - a.pos.z);
        // hold position once inside a goal that has a radius (plant/defuse/zone); otherwise walk onto it
        inp.forward = near.radius && Math.hypot(near.x - a.pos.x, near.z - a.pos.z) < near.radius * 0.5 ? 0 : 1;
      } else if (node) {
        const dx = node.x - a.pos.x, dz = node.z - a.pos.z;
        if (Math.hypot(dx, dz) < 1.3) b.pathIdx++;
        wantYaw = yawTo(dx, dz);
        inp.forward = 1;
        inp.sprint = true;
      }
      if (now - b.progressAt > 1.5) {
        if (Math.hypot(a.pos.x - b.progressPos.x, a.pos.z - b.progressPos.z) < 0.6) { b.path = null; inp.jump = true; }
        b.progressAt = now; b.progressPos = { x: a.pos.x, z: a.pos.z };
      }
    }

    // turn toward the wanted direction at a human-ish rate, then apply this burst's aim error
    const turn = K.turn * dt;
    const dy = wrap(wantYaw - b.aimYaw);
    b.aimYaw = wrap(b.aimYaw + Math.max(-turn, Math.min(turn, dy)));
    b.aimPitch += Math.max(-turn, Math.min(turn, wantPitch - b.aimPitch));
    const err = t ? 1 : 0;
    inp.yaw = wrap(b.aimYaw + b.errYaw * err);
    inp.pitch = b.aimPitch + b.errPitch * err;
  }
}

function newBrain(rng) {
  const b = { nextScanAt: rng() * 0.2, spotted: new Set() };
  resetBrain(b);
  return b;
}

function resetBrain(b) {
  Object.assign(b, {
    target: null, seenAt: 0, reactAt: 0, lastKnown: null, objective: null, path: null, pathIdx: 0, role: b.role ?? 'hunter',
    strafeDir: 1, strafeUntil: 0, burstLeft: 0, nextBurstAt: 0, errYaw: 0, errPitch: 0, aimHead: false,
    aimYaw: 0, aimPitch: 0, progressAt: 0, progressPos: { x: 0, z: 0 },
  });
  b.spotted.clear();
}

/** Ray vs a combatant: vertical body cylinder + head sphere. Returns {t, head} or null. */
export function rayActor(o, d, p, maxT, headR = BODY.headR) {
  let best = null;
  // head sphere
  const hx = o.x - p.x, hy = o.y - (p.y + BODY.headY), hz = o.z - p.z;
  const hb = hx * d.x + hy * d.y + hz * d.z;
  const hc = hx * hx + hy * hy + hz * hz - headR * headR;
  const hdisc = hb * hb - hc;
  if (hdisc >= 0) {
    const t = -hb - Math.sqrt(hdisc);
    if (t > 0 && t < maxT) best = { t, head: true };
  }
  // body cylinder
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-9) {
    const ox = o.x - p.x, oz = o.z - p.z;
    const bb = ox * d.x + oz * d.z;
    const c = ox * ox + oz * oz - BODY.hitRadius * BODY.hitRadius;
    const disc = bb * bb - a * c;
    if (disc >= 0) {
      const t = (-bb - Math.sqrt(disc)) / a;
      const y = o.y + d.y * t;
      if (t > 0 && t < (best ? best.t : maxT) && y >= p.y && y <= p.y + BODY.hitHeight) best = { t, head: false };
    }
  }
  return best;
}

/** Ray vs sphere (used for helicopter bounding sphere). Returns t or null. */
export function raySphere(o, d, center, radius, maxT = Infinity) {
  const ox = o.x - center.x, oy = o.y - center.y, oz = o.z - center.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  let t = -b - sqrtDisc;
  if (t < 0) t = -b + sqrtDisc;
  if (t > 0 && t < maxT) return t;
  return null;
}

export function findLockOnTarget(sim, a, maxRange = 28) {
  return sim.findLockOnTarget(a, { maxRange });
}

