// Match simulation: movement, hitscan, melee, grenades, scoring, respawns, camping, bots.
// No three.js and no DOM, so the whole match can run headlessly in tests (see web/tests/sim.test.mjs).
// The sim only emits gameplay events; barks.js turns them into voice lines and the renderer draws them.
//
// Conventions match three.js: yaw 0 looks down -z, positive pitch looks up.
//   forward = (-sin yaw, 0, -cos yaw)   right = (cos yaw, 0, -sin yaw)

import { CampingMonitor } from '../core/campingMonitor.js';
import { buildCulDeSac, rayBox, rayGround, findPath, nearestNode } from './map.js';

export const WEAPON = { name: 'The Allowance', mag: 30, reload: 1.7, interval: 0.105, body: 24, head: 55, range: 90, falloffAt: 35, spread: 0.01 };
export const MELEE = { name: 'The Participation Trophy', range: 2.1, damage: 100, cooldown: 0.9 };
export const GRENADE = { name: 'The Lawsuit', fuse: 1.6, radius: 5, damage: 130, count: 2, speed: 15 };

export const BODY = { radius: 0.4, height: 1.8, eye: 1.6, hitRadius: 0.42, hitHeight: 1.42, headY: 1.62, headR: 0.25 };
const STEP = 0.45, GRAVITY = 20, JUMP_V = 6.8, WALK = 5.2, SPRINT = 7.4, TRAMPOLINE_V = 12;

export function forwardOf(yaw, pitch = 0) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}
export function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng()); }

export function emptyInput() {
  return { forward: 0, right: 0, jump: false, sprint: false, fire: false, reload: false, melee: false, grenade: false, yaw: 0, pitch: 0 };
}

export class Sim {
  /**
   * @param {{rules:object, rng:()=>number, map?:object, scoreLimit?:number, timeLimit?:number}} o
   * rules = hoa_content.json "rules" (camping tuning lives there)
   */
  constructor({ rules, rng, map = buildCulDeSac(), scoreLimit = 40, timeLimit = 300 }) {
    this.rules = rules;
    this.rng = rng;
    this.map = map;
    this.scoreLimit = scoreLimit;
    this.timeLimit = timeLimit;
    this.time = 0;
    this.actors = [];
    this.byId = new Map();
    this.events = [];
    this.grenades = [];
    this.score = [0, 0];
    this.over = false;
    this.winner = null;
    this.started = false;
  }

  addActor({ id, name, team, faction, isBot = true }) {
    const a = {
      id, name, team, faction, isBot,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
      hp: 100, alive: false, respawnAt: 0, deathAt: 0,
      ammo: WEAPON.mag, reloadUntil: 0, nextShotAt: 0, nextMeleeAt: 0, grenades: GRENADE.count,
      onGround: true, kills: 0, deaths: 0, streak: 0, spawnProtectUntil: 0, lowHealthSaid: false,
      lastHitBy: null, lastHurtAt: -Infinity, revealedUntil: 0, firingUntil: 0, meleeAt: -Infinity,
      input: emptyInput(), camp: new CampingMonitor(this.rules.camping), campState: { state: 'ok', dwell: 0 },
      brain: isBot ? newBrain(this.rng) : null,
    };
    this.actors.push(a);
    this.byId.set(id, a);
    return a;
  }

  emit(e) { this.events.push({ t: this.time, ...e }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  start() {
    this.started = true;
    for (const a of this.actors) this.respawn(a);
    this.emit({ type: 'roundStart' });
  }

  respawn(a) {
    const pts = this.map.spawns[a.team];
    const enemies = this.actors.filter(e => e.alive && e.team !== a.team);
    let best = pts[0], bestScore = -Infinity;
    for (const p of pts) {
      let near = Infinity;
      for (const e of enemies) near = Math.min(near, Math.hypot(e.pos.x - p[0], e.pos.z - p[1]));
      const crowd = this.actors.filter(o => o.alive && o !== a && Math.hypot(o.pos.x - p[0], o.pos.z - p[1]) < 1).length;
      const s = Math.min(near, 60) - crowd * 50 + this.rng() * 3;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    Object.assign(a.pos, { x: best[0], y: 0, z: best[1] });
    Object.assign(a.vel, { x: 0, y: 0, z: 0 });
    a.yaw = a.team === 0 ? 0 : Math.PI;
    a.pitch = 0;
    a.input.yaw = a.yaw; a.input.pitch = 0;
    Object.assign(a, { hp: 100, alive: true, ammo: WEAPON.mag, reloadUntil: 0, grenades: GRENADE.count, streak: 0,
      spawnProtectUntil: this.time + 1.2, lowHealthSaid: false, lastHitBy: null, onGround: true });
    a.camp.reset();
    if (a.brain) { resetBrain(a.brain); a.brain.aimYaw = a.yaw; }
    this.emit({ type: 'spawn', id: a.id });
  }

  // ---------------------------------------------------------------- physics helpers

  overlaps(b, x, z, y, r = BODY.radius) {
    if (b.maxY <= y + STEP || b.minY >= y + BODY.height) return false;
    const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    return (cx - x) ** 2 + (cz - z) ** 2 < r * r;
  }
  blocked(x, z, y) { return this.map.boxes.some(b => this.overlaps(b, x, z, y)); }

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
    const speed = sprinting ? SPRINT : WALK;
    const accel = a.onGround ? 40 : 8;
    const k = Math.min(1, accel * dt);
    a.vel.x += (mx * speed - a.vel.x) * k;
    a.vel.z += (mz * speed - a.vel.z) * k;
    if (inp.jump && a.onGround) { a.vel.y = JUMP_V; a.onGround = false; }
    a.vel.y -= GRAVITY * dt;

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
  }

  // ---------------------------------------------------------------- combat

  raycast(o, dir, maxT, ignoreId = null) {
    let best = { t: maxT, kind: 'none', actor: null, head: false };
    const tg = rayGround(o, dir, best.t);
    if (tg < best.t) best = { t: tg, kind: 'world', actor: null, head: false };
    for (const b of this.map.boxes) {
      const t = rayBox(o, dir, b, best.t);
      if (t < best.t) best = { t, kind: 'world', actor: null, head: false, box: b };
    }
    for (const a of this.actors) {
      if (!a.alive || a.id === ignoreId) continue;
      const hit = rayActor(o, dir, a.pos, best.t);
      if (hit) best = { t: hit.t, kind: 'actor', actor: a, head: hit.head };
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

  fire(a) {
    const now = this.time;
    if (now < a.nextShotAt || a.reloadUntil > 0) return;
    if (a.ammo <= 0) { this.startReload(a); return; }
    a.ammo--;
    a.nextShotAt = now + WEAPON.interval;
    a.firingUntil = now + 0.15;
    const moving = Math.hypot(a.vel.x, a.vel.z) > 1;
    const spread = WEAPON.spread * (moving ? 1.8 : 1) * (a.onGround ? 1 : 3);
    const yaw = a.yaw + gauss(this.rng) * spread, pitch = a.pitch + gauss(this.rng) * spread;
    const o = this.eye(a), dir = forwardOf(yaw, pitch);
    const hit = this.raycast(o, dir, WEAPON.range, a.id);
    this.emit({ type: 'shot', id: a.id, from: o, to: hit.point, hitId: hit.actor?.id ?? null, head: hit.head, kind: hit.kind });
    if (hit.actor && hit.actor.team !== a.team) {
      let dmg = hit.head ? WEAPON.head : WEAPON.body;
      if (hit.t > WEAPON.falloffAt) dmg *= 0.8;
      this.damage(hit.actor, dmg, a, { headshot: hit.head, dir });
    }
    if (a.ammo === 0) this.startReload(a);
  }

  startReload(a) {
    if (a.reloadUntil > 0 || a.ammo >= WEAPON.mag) return;
    a.reloadUntil = this.time + WEAPON.reload;
    this.emit({ type: 'reload', id: a.id });
  }

  melee(a) {
    const now = this.time;
    if (now < a.nextMeleeAt) return;
    a.nextMeleeAt = now + MELEE.cooldown;
    a.meleeAt = now;
    this.emit({ type: 'swing', id: a.id });
    const f = forwardOf(a.yaw);
    let best = null, bd = MELEE.range;
    for (const e of this.actors) {
      if (!e.alive || e.team === a.team) continue;
      const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, dy = e.pos.y - a.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(dy) > 1.2) continue;
      if ((dx * f.x + dz * f.z) / (d || 1) < 0.45) continue;
      best = e; bd = d;
    }
    if (best) this.damage(best, MELEE.damage, a, { melee: true, dir: f });
  }

  throwGrenade(a) {
    if (a.grenades <= 0 || this.grenades.some(g => g.ownerId === a.id)) return;
    a.grenades--;
    const d = forwardOf(a.yaw, a.pitch + 0.15);
    const o = this.eye(a);
    this.grenades.push({
      ownerId: a.id, team: a.team, explodeAt: this.time + GRENADE.fuse,
      pos: { x: o.x + d.x * 0.6, y: o.y + d.y * 0.6, z: o.z + d.z * 0.6 },
      vel: { x: d.x * GRENADE.speed + a.vel.x, y: d.y * GRENADE.speed + 2, z: d.z * GRENADE.speed + a.vel.z },
    });
    this.emit({ type: 'throw', id: a.id });
  }

  stepGrenades(dt) {
    for (const g of this.grenades) {
      g.vel.y -= GRAVITY * dt;
      for (const axis of ['x', 'y', 'z']) {
        const prev = g.pos[axis];
        g.pos[axis] += g.vel[axis] * dt;
        const inside = this.map.boxes.some(b => g.pos.x > b.minX && g.pos.x < b.maxX && g.pos.y > b.minY && g.pos.y < b.maxY && g.pos.z > b.minZ && g.pos.z < b.maxZ);
        if (inside || (axis === 'y' && g.pos.y < 0.08)) {
          g.pos[axis] = axis === 'y' && g.pos.y < 0.08 && !inside ? 0.08 : prev;
          g.vel[axis] *= -0.35;
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
        if (e.team === g.team && e.id !== g.ownerId) continue;
        const c = { x: e.pos.x, y: e.pos.y + 0.9, z: e.pos.z };
        const d = Math.hypot(c.x - g.pos.x, c.y - g.pos.y, c.z - g.pos.z);
        if (d >= GRENADE.radius) continue;
        const dir = { x: (c.x - g.pos.x) / (d || 1), y: 0.6, z: (c.z - g.pos.z) / (d || 1) };
        this.damage(e, GRENADE.damage * (1 - d / GRENADE.radius), owner, { explosive: true, dir });
      }
    }
  }

  damage(target, amount, attacker, { headshot = false, melee = false, explosive = false, dir = null } = {}) {
    if (!target.alive || this.time < target.spawnProtectUntil || this.over) return;
    target.hp -= amount;
    target.lastHitBy = attacker?.id ?? null;
    target.lastHurtAt = this.time;
    this.emit({ type: 'hurt', id: target.id, attackerId: attacker?.id ?? null, amount, headshot, hp: Math.max(0, target.hp) });
    if (target.hp > 0) {
      if (target.hp < 25 && !target.lowHealthSaid) { target.lowHealthSaid = true; this.emit({ type: 'lowHealth', id: target.id }); }
      return;
    }
    target.alive = false;
    target.hp = 0;
    target.deaths++;
    target.deathAt = this.time;
    target.respawnAt = this.time + (target.isBot ? 3 : 4.5);
    target.streak = 0;
    const killer = attacker && attacker.id !== target.id ? attacker : null;
    if (killer) { killer.kills++; killer.streak++; this.score[killer.team]++; }
    this.emit({
      type: 'kill', killerId: killer?.id ?? null, victimId: target.id, headshot, melee, explosive,
      dir: dir || { x: 0, y: 0, z: 0 }, victimPos: { ...target.pos }, killerPos: killer ? { ...killer.pos } : null,
    });
    if (killer && this.score[killer.team] >= this.scoreLimit) this.end(killer.team);
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
      if (!a.alive) { if (now >= a.respawnAt) this.respawn(a); continue; }
      if (a.brain) this.think(a, dt);
      if (a.reloadUntil > 0 && now >= a.reloadUntil) { a.reloadUntil = 0; a.ammo = WEAPON.mag; }
      this.move(a, dt);
      const inp = a.input;
      if (inp.reload) this.startReload(a);
      if (inp.fire) this.fire(a);
      if (inp.melee) this.melee(a);
      if (inp.grenade) this.throwGrenade(a);
      if (!a.isBot) { inp.melee = false; inp.grenade = false; inp.reload = false; }
      const c = a.camp.update(now, dt, a.pos, { alive: a.alive });
      a.campState = c;
      if (c.state === 'snitch') { a.revealedUntil = now + 6; this.emit({ type: 'campingSnitch', id: a.id }); }
    }
    this.stepGrenades(dt);
    if (now >= this.timeLimit) this.end(this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1);
  }

  snapshot() {
    return this.actors.map(a => ({
      id: a.id, x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, pitch: a.pitch, alive: a.alive,
      speed: Math.hypot(a.vel.x, a.vel.z), firing: this.time < a.firingUntil, onGround: a.onGround,
    }));
  }

  // ---------------------------------------------------------------- bots

  canSee(a, e) {
    const o = this.eye(a);
    return this.lineClear(o, { x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z }) ||
      this.lineClear(o, { x: e.pos.x, y: e.pos.y + BODY.headY, z: e.pos.z });
  }

  think(a, dt) {
    const b = a.brain, now = this.time, inp = a.input, rng = this.rng;
    inp.fire = false; inp.melee = false; inp.reload = false; inp.jump = false; inp.grenade = false;

    if (now >= b.nextScanAt) {
      b.nextScanAt = now + 0.18 + rng() * 0.08;
      const f = forwardOf(a.yaw);
      let best = null, bd = Infinity;
      for (const e of this.actors) {
        if (!e.alive || e.team === a.team) continue;
        const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 58) continue;
        const inFov = (dx * f.x + dz * f.z) / (d || 1) > Math.cos(1.3);
        const alerted = d < 7 || e.revealedUntil > now || (a.lastHitBy === e.id && now - a.lastHurtAt < 1.5) || e === b.target;
        if (!inFov && !alerted) continue;
        if (!this.canSee(a, e)) continue;
        const score = d - (e === b.target ? 8 : 0);
        if (score < bd) { bd = score; best = e; }
      }
      if (best && best !== b.target) {
        b.reactAt = now + 0.3 + rng() * 0.35;
        b.burstLeft = 0;
        if (!b.spotted.has(best.id)) { b.spotted.add(best.id); this.emit({ type: 'spotted', id: a.id, targetId: best.id }); }
      }
      if (best) { b.target = best; b.seenAt = now; b.lastKnown = { x: best.pos.x, z: best.pos.z }; }
      else if (b.target && (now - b.seenAt > 1.2 || !b.target.alive)) {
        b.target = null;
        b.path = null;
      }
      if (!b.target && !b.lastKnown) {
        const snitch = this.actors.find(e => e.alive && e.team !== a.team && e.revealedUntil > now);
        if (snitch) { b.lastKnown = { x: snitch.pos.x, z: snitch.pos.z }; b.path = null; }
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
      inp.right = b.strafeDir * 0.8;
      inp.forward = d > 24 ? 0.7 : d < 5 ? -0.5 : 0;
      if (d < 1.8) inp.melee = true;
      const aligned = Math.abs(wrap(wantYaw - a.yaw)) < 0.15;
      if (aligned && now >= b.reactAt && now - b.seenAt < 0.35) {
        if (b.burstLeft <= 0 && now >= b.nextBurstAt) {
          b.burstLeft = 4 + Math.floor(rng() * 6);
          b.aimHead = rng() < 0.18;
          const moving = Math.hypot(t.vel.x, t.vel.z) > 1;
          const sigma = 0.018 + d * 0.0011 + (moving ? 0.012 : 0);
          b.errYaw = gauss(rng) * sigma;
          b.errPitch = gauss(rng) * sigma * 0.7;
        }
        if (b.burstLeft > 0) {
          if (now >= a.nextShotAt && a.reloadUntil === 0) {
            inp.fire = true;
            b.burstLeft--;
            if (b.burstLeft === 0) b.nextBurstAt = now + 0.25 + rng() * 0.45;
          }
        }
      }
    } else {
      b.target = null;
      if (a.ammo < 12) inp.reload = true;
      if (!b.path || b.pathIdx >= b.path.length) {
        const from = nearestNode(this.map.nodes, this.map.boxes, a.pos.x, a.pos.z);
        let goal;
        if (b.lastKnown) { goal = nearestNode(this.map.nodes, this.map.boxes, b.lastKnown.x, b.lastKnown.z); b.lastKnown = null; }
        else {
          const nodes = this.map.nodes;
          const pool = rng() < 0.55 ? nodes.map((n, i) => i).filter(i => Math.abs(nodes[i].x) < 16 && Math.abs(nodes[i].z) < 22) : nodes.map((n, i) => i);
          goal = pool[Math.floor(rng() * pool.length)];
        }
        b.path = findPath(this.map.nodes, from, goal) || [goal];
        b.pathIdx = 0;
      }
      const node = this.map.nodes[b.path[b.pathIdx]];
      if (node) {
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
    const turn = 7 * dt;
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
    target: null, seenAt: 0, reactAt: 0, lastKnown: null, path: null, pathIdx: 0,
    strafeDir: 1, strafeUntil: 0, burstLeft: 0, nextBurstAt: 0, errYaw: 0, errPitch: 0, aimHead: false,
    aimYaw: 0, aimPitch: 0, progressAt: 0, progressPos: { x: 0, z: 0 },
  });
  b.spotted.clear();
}

/** Ray vs a combatant: vertical body cylinder + head sphere. Returns {t, head} or null. */
export function rayActor(o, d, p, maxT) {
  let best = null;
  // head sphere
  const hx = o.x - p.x, hy = o.y - (p.y + BODY.headY), hz = o.z - p.z;
  const hb = hx * d.x + hy * d.y + hz * d.z;
  const hc = hx * hx + hy * hy + hz * hz - BODY.headR * BODY.headR;
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
