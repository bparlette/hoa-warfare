// Director stage: runs a shot script against the real game simulation, headless and deterministic.
// No DOM here, so the same code drives the browser renderer (director.js) and `direct.mjs --dry` in Node.
// Nothing in web/ imports this: it is video tooling, not game code.
//
// Script (see scripts/*.mjs for full examples):
//   { name, map, seed, duration, fps, retro, respawn, subtitles,
//     actors: [{ id, faction, team, pos: [x, z], face: [x, z] | degrees, loadout?, hp?, name?, bot? }],
//     cues: [{ t, ...one action }] }
// Actor cues ({ t, actor, ... }):
//   moveTo: [x, z], run?: bool     walk (or sprint) to a point; keeps aiming if an aim is set
//   stop: true                      stop moving
//   face: [x, z] | degrees          turn to a point or a compass yaw (0 = facing -z / north)
//   aim: actorId | [x, y, z] | null track a target (null releases)
//   fire: actorId, head?: bool, for?: s   aim at the actor and shoot until it dies (or `for` seconds, default 4)
//   fire: true, for?: s             shoot straight ahead for `for` seconds (default 0.5)
//   say: lineId                     play that voice line (web/vo/manifest.json), with bubble and subtitle
//   jump: true | weapon: 'primary'|'secondary' | grenade: true | hp: number
// Global cues ({ t, ... }):
//   camera: { follow: id, back?, up?, side?, lookAt? } | { pov: id } | { fixed: [x,y,z], lookAt }
//           | { orbit: id | [x, z], radius?, height?, speed? }, blend?: s (ease from the previous shot)
//   caption: text, for?: s (default 2.5), style?: 'top' | 'center' | 'bottom'
import { Sim, BODY, yawTo } from '../../web/src/engine/sim.js';
import { buildMap } from '../../web/src/engine/map.js';
import { mulberry32 } from '../../web/src/core/rng.js';

export const STEP = 1 / 60;
const DEG = Math.PI / 180;

const v3 = (p, y = 0) => (Array.isArray(p) ? { x: p[0], y: p.length === 3 ? p[1] : y, z: p[p.length - 1] } : { x: p.x, y: p.y ?? y, z: p.z });
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k * k * (3 - 2 * k);

export class Stage {
  /** @param {{script: object, content: object, weapons: object, manifest?: {lines: object}}} o */
  constructor({ script, content, weapons, manifest = { lines: {} } }) {
    this.script = { duration: 15, fps: 30, map: 'culdesac', seed: 7, subtitles: true, respawn: false, ...script };
    this.manifest = manifest;
    this.weapons = weapons;
    this.cues = [...(this.script.cues || [])].sort((a, b) => a.t - b.t);
    this.cueIdx = 0;
    this.orders = new Map();      // actorId -> { move, aim, fire, yaw, jump }
    this.captions = [];           // { text, style, from, to }
    this.bubbles = [];            // { actorId, text, from, to }
    this.audio = [];              // { t, kind: 'voice' | 'sfx', file?, name?, vol }
    this.log = [];                // what actually happened, for checking a script
    this.cam = null;              // { def, from, at, prev }
    this.errors = [];

    const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(this.script.seed), mode: this.script.mode || 'clash',
      map: buildMap(this.script.map), scoreLimit: 9999, timeLimit: this.script.duration + 60 });
    sim.mode.respawnDelay = () => (this.script.respawn ? 3 : Infinity);
    sim.mode.campingExempt = () => true;
    for (const d of this.script.actors) {
      sim.addActor({ id: d.id, name: d.name || d.id, team: d.team ?? 0, faction: d.faction, loadout: d.loadout || 'default', isBot: true });
    }
    sim.start();
    sim.drainEvents();
    for (const d of this.script.actors) {
      const a = sim.byId.get(d.id);
      a.scripted = !d.bot;
      a.spawnProtectUntil = 0;
      if (d.hp) a.hp = d.hp;
      if (d.pos) { const p = v3(d.pos); Object.assign(a.pos, { x: p.x, y: 0, z: p.z }); a.vel = { x: 0, y: 0, z: 0 }; }
      const yaw = this.yawFor(a, d.face);
      if (yaw !== null) { a.yaw = yaw; a.input.yaw = yaw; }
      this.orders.set(d.id, { move: null, aim: null, fire: null, yaw: a.yaw, jump: false, grenade: false });
    }
    this.sim = sim;
  }

  get time() { return this.sim.time; }
  get done() { return this.sim.time >= this.script.duration; }

  yawFor(a, face) {
    if (face == null) return null;
    if (typeof face === 'number') return -face * DEG;
    const p = v3(face);
    return yawTo(p.x - a.pos.x, p.z - a.pos.z);
  }

  /** Point an actor aims at: another actor's chest (or head), or a fixed point. */
  aimPoint(target, head = false) {
    if (target == null) return null;
    if (typeof target === 'string') {
      const t = this.sim.byId.get(target);
      if (!t) return null;
      return { x: t.pos.x, y: t.pos.y + (head ? BODY.headY : 1.15), z: t.pos.z };
    }
    return v3(target, 1.2);
  }

  apply(cue) {
    const sim = this.sim, now = sim.time;
    if (cue.camera) { this.setCamera(cue.camera, cue.blend || 0); }
    if (cue.caption != null) this.captions.push({ text: String(cue.caption), style: cue.style || 'top', from: now, to: now + (cue.for ?? 2.5) });
    if (!cue.actor) return;
    const a = sim.byId.get(cue.actor), o = this.orders.get(cue.actor);
    if (!a || !o) { this.errors.push(`t=${cue.t}: no actor "${cue.actor}"`); return; }
    if (cue.moveTo) { const p = v3(cue.moveTo); o.move = { x: p.x, z: p.z, run: !!cue.run }; }
    if (cue.stop) o.move = null;
    if (cue.face != null) { o.yaw = this.yawFor(a, cue.face); o.aim = null; }
    if ('aim' in cue) o.aim = cue.aim;
    if (cue.fire === true) o.fire = { target: null, until: now + (cue.for ?? 0.5) };
    else if (typeof cue.fire === 'string') o.fire = { target: cue.fire, head: !!cue.head, until: now + (cue.for ?? 4) };
    if (cue.jump) o.jump = true;
    if (cue.weapon) a.input.switchSlot = cue.weapon;
    if (cue.grenade) o.grenade = true;
    if (cue.hp != null) a.hp = cue.hp;
    if (cue.say) this.say(a, cue.say);
  }

  say(a, id) {
    const e = this.manifest.lines?.[id];
    if (!e) {
      const prefix = id.split('.').slice(0, 2).join('.');
      const near = Object.keys(this.manifest.lines || {}).filter(k => k.startsWith(prefix)).slice(0, 5);
      this.errors.push(`t=${this.time.toFixed(2)}: no recorded line "${id}"${near.length ? ` (try ${near.join(', ')})` : ''}`);
      return;
    }
    const now = this.sim.time, dur = e.duration || 1.5;
    this.audio.push({ t: now, kind: 'voice', file: e.file, vol: 1 });
    this.bubbles.push({ actorId: a.id, text: e.text, from: now, to: now + dur + 0.4 });
    if (this.script.subtitles) this.captions.push({ text: `${a.name}: ${e.text}`, style: 'subtitle', from: now, to: now + dur + 0.4 });
    this.log.push({ t: +now.toFixed(2), say: id, actor: a.id, text: e.text, dur });
  }

  /** Scripted actors: turn cue orders into the same inputs a player sends. */
  control() {
    const now = this.sim.time;
    for (const [id, o] of this.orders) {
      const a = this.sim.byId.get(id), inp = a.input;
      if (!a.scripted) continue;
      inp.forward = 0; inp.right = 0; inp.sprint = false; inp.fire = false; inp.jump = false; inp.grenade = false;
      if (!a.alive) continue;
      if (o.fire && (now > o.fire.until || (o.fire.target && !this.sim.byId.get(o.fire.target)?.alive))) o.fire = null;
      const pt = o.fire?.target ? this.aimPoint(o.fire.target, o.fire.head) : this.aimPoint(o.aim);
      let yaw = o.yaw ?? a.yaw, pitch = 0;
      if (pt) {
        const dx = pt.x - a.pos.x, dz = pt.z - a.pos.z;
        yaw = yawTo(dx, dz);
        pitch = Math.atan2(pt.y - (a.pos.y + BODY.eye), Math.hypot(dx, dz));
      }
      if (o.move) {
        const gx = o.move.x - a.pos.x, gz = o.move.z - a.pos.z, gd = Math.hypot(gx, gz);
        if (gd < 0.35) { o.move = null; this.log.push({ t: +now.toFixed(2), arrived: id }); }
        else {
          if (!pt) { yaw = yawTo(gx, gz); o.yaw = yaw; }
          inp.forward = (gx * -Math.sin(yaw) + gz * -Math.cos(yaw)) / gd;
          inp.right = (gx * Math.cos(yaw) + gz * -Math.sin(yaw)) / gd;
          inp.sprint = o.move.run && !o.fire;
        }
      }
      inp.yaw = yaw; inp.pitch = pitch;
      if (o.fire) inp.fire = true;
      if (o.jump) { inp.jump = true; o.jump = false; }
      if (o.grenade) { inp.grenade = true; o.grenade = false; }
    }
  }

  /** Advance one fixed tick. Returns the sim events of that tick (for the renderer's effects). */
  step() {
    while (this.cueIdx < this.cues.length && this.cues[this.cueIdx].t <= this.sim.time + 1e-9) this.apply(this.cues[this.cueIdx++]);
    this.control();
    this.sim.step(STEP);
    const events = this.sim.drainEvents();
    const cam = this.camera();
    for (const e of events) {
      if (e.type === 'shot') {
        const shooter = this.sim.byId.get(e.id);
        const d = cam ? Math.hypot(e.from.x - cam.from.x, e.from.z - cam.from.z) : 10;
        const cls = this.weapons.weapons[e.weaponId]?.class || 'ar';
        this.audio.push({ t: this.sim.time, kind: 'sfx', name: cls, vol: Math.max(0.25, 1 - d / 60) });
        if (e.hitId && this.sim.byId.get(e.hitId)?.team !== shooter?.team) this.log.push({ t: +this.sim.time.toFixed(2), hit: e.hitId, by: e.id, head: !!e.head });
      } else if (e.type === 'kill') {
        this.audio.push({ t: this.sim.time, kind: 'sfx', name: 'kill', vol: 0.8 });
        this.log.push({ t: +this.sim.time.toFixed(2), kill: e.victimId, by: e.killerId, headshot: !!e.headshot });
      } else if (e.type === 'explosion') {
        this.audio.push({ t: this.sim.time, kind: 'sfx', name: 'boom', vol: 1 });
      }
    }
    return events;
  }

  // ------------------------------------------------------------------ camera

  setCamera(def, blend) {
    const prev = this.cam ? this.resolveCamera(this.cam.def) : null;
    this.cam = { def, start: this.sim.time, blend, prev };
  }

  resolveCamera(def) {
    const sim = this.sim, t = sim.time;
    const actor = id => sim.byId.get(id);
    if (def.pov) {
      const a = actor(def.pov);
      if (!a) return null;
      const f = { x: -Math.sin(a.yaw) * Math.cos(a.pitch), y: Math.sin(a.pitch), z: -Math.cos(a.yaw) * Math.cos(a.pitch) };
      const from = { x: a.pos.x, y: a.pos.y + BODY.eye, z: a.pos.z };
      return { from, at: { x: from.x + f.x * 10, y: from.y + f.y * 10, z: from.z + f.z * 10 }, pov: a.id };
    }
    if (def.fixed) {
      const from = v3(def.fixed, 3);
      return { from, at: this.aimPoint(def.lookAt) || { x: 0, y: 1, z: 0 } };
    }
    if (def.orbit) {
      const c = typeof def.orbit === 'string' ? actor(def.orbit)?.pos : v3(def.orbit);
      if (!c) return null;
      const r = def.radius ?? 8, ang = (def.angle ?? 0) * DEG + t * (def.speed ?? 0.3);
      return { from: { x: c.x + Math.cos(ang) * r, y: (c.y || 0) + (def.height ?? 4), z: c.z + Math.sin(ang) * r }, at: { x: c.x, y: (c.y || 0) + 1.1, z: c.z } };
    }
    const a = actor(def.follow);
    if (!a) return null;
    const look = this.aimPoint(def.lookAt) || { x: a.pos.x - Math.sin(a.yaw) * 10, y: a.pos.y + 1.1, z: a.pos.z - Math.cos(a.yaw) * 10 };
    const dx = look.x - a.pos.x, dz = look.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
    const bx = -dx / d, bz = -dz / d, back = def.back ?? 3.6, side = def.side ?? 0.9;
    return {
      from: { x: a.pos.x + bx * back + bz * side, y: a.pos.y + (def.up ?? 2.3), z: a.pos.z + bz * back - bx * side },
      at: look,
    };
  }

  /** Camera for the current tick: { from, at, pov? }, eased from the previous shot when the cue asks. */
  camera() {
    if (!this.cam) return null;
    const cur = this.resolveCamera(this.cam.def);
    if (!cur) return null;
    const { prev, blend, start } = this.cam;
    if (!prev || !blend) return cur;
    const k = ease(Math.min(1, (this.sim.time - start) / blend));
    if (k >= 1) return cur;
    const mix = (p, q) => ({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), z: lerp(p.z, q.z, k) });
    return { from: mix(prev.from, cur.from), at: mix(prev.at, cur.at) };
  }

  /** Captions and speech bubbles on screen now. */
  overlay() {
    const t = this.sim.time;
    const live = this.captions.filter(c => t >= c.from && t < c.to);
    const subs = live.filter(c => c.style === 'subtitle');
    return {
      captions: [...live.filter(c => c.style !== 'subtitle'), ...subs.slice(-1)], // newest subtitle only
      bubbles: this.bubbles.filter(b => t >= b.from && t < b.to && this.sim.byId.get(b.actorId)?.alive),
    };
  }
}
