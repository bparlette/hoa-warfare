// Online play: a thin client over the authoritative server (server/multiplayer.mjs).
//
// The server runs the real match. This module keeps a LOCAL MIRROR of it, a normal Sim that is never
// stepped, only written into, so the renderer, HUD, radar and voice code work unchanged:
//   * other players     interpolated from snapshots, 100 ms in the past, on the server clock
//   * your own player   client-side prediction (your inputs run through Sim.move immediately), then
//                       gently corrected toward the server using the input sequence the server acknowledged
//   * hp / ammo / K-D   copied from the server's stats (never predicted, the server is the authority)
//   * events            shots, kills, spawns... queued in order and fed to the normal event handler
// No DOM access here, so it runs headless in Node tests.

import { NetClient } from './net.js';
import { createMode, MODES } from './modes.js';

export const INTERP_DELAY = 0.1;     // seconds; must match INTERP_S in the server's lag compensation
const SNAP_DISTANCE = 2.0;           // metres of disagreement above which we teleport to the server position
const CORRECTION = 0.15;             // fraction of the error removed per snapshot (20 Hz) when below that
const HISTORY = 180;                 // predicted positions kept for reconciliation (3 s of inputs)

/** Same rule as the server: letters, digits, space, _ . - only. Names are rendered into the HUD. */
export const cleanName = n => String(n ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player';

export class OnlineSession {
  /**
   * Connect and join a room. `room` is a code, or 'auto' for Quick Match.
   * @throws Error with .message 'room_full' | 'timeout' | 'closed' when joining fails
   */
  static async join({ url, name = 'Player', faction = 'karens', loadout, perk, timeoutMs = 6000, NetClientClass = NetClient, knownFactions = null } = {}) {
    const session = new OnlineSession(new NetClientClass());
    session.knownFactions = knownFactions; // ids this build can draw; anything else falls back to karens instead of crashing
    const res = await session.net.connect(url, {
      name, faction, loadout, perk, timeoutMs,
      onRoster: msg => session.onRoster(msg),
      onSnapshot: msg => session.onSnapshot(msg),
      onDisconnect: () => { session.connected = false; },
      onError: msg => { session.lastError = msg; },
    });
    session.connected = true;
    session.init = res.init;
    session.actorId = res.actorId;
    session.team = res.team;
    session.roomCode = res.roomCode;
    session.players = res.init?.players || [];
    session.restartMs = res.init?.restartMs ?? 12000;
    return session;
  }

  constructor(net) {
    this.net = net;
    this.connected = false;
    this.sim = null;
    this.me = null;
    this.players = [];
    this.events = [];
    this.pendingRoster = null;
    this.history = [];
    this.lastAckSeq = -1;
    this.prevFire = false;
    this.nextLocalShot = 0;
    this.wasAlive = false;
    this.lastError = null;
    this.knownFactions = null;
    this.over = false;
    this.restartIn = null;
    net.onInputSent = seq => {
      if (!this.me) return;
      this.history.push({ seq, x: this.me.pos.x, y: this.me.pos.y, z: this.me.pos.z });
      if (this.history.length > HISTORY) this.history.shift();
    };
  }

  get latency() { return Math.round(this.net.latency || 0); }
  get roomLabel() { return this.roomCode; }
  /** Link people can open to join this room directly. */
  inviteLink(base) {
    try {
      const u = new URL(base);
      u.searchParams.set('room', this.roomCode);
      u.searchParams.delete('seed');
      return u.toString();
    } catch { return `${base}?room=${this.roomCode}`; }
  }

  // ---------------------------------------------------------------- mirror construction

  /** Fill an (unstepped) Sim with the room's roster and return the local player's actor. */
  buildMirror(sim) {
    this.sim = sim;
    sim.actors.length = 0;
    sim.byId.clear();
    for (const p of this.players) this.addMirrorActor(p);
    sim.started = true;
    sim.over = false;
    sim.winner = null;
    if (this.init?.mode && MODES[this.init.mode] && sim.mode?.constructor?.id !== this.init.mode) {
      sim.mode = createMode(this.init.mode, sim);
    }
    this.me = sim.byId.get(this.actorId) || null;
    this.events.length = 0;
    this.history.length = 0;
    this.over = false;
    return this.me;
  }

  addMirrorActor(p) {
    if (this.sim.byId.has(p.id)) return this.sim.byId.get(p.id);
    const faction = !this.knownFactions || this.knownFactions.includes(p.faction) ? p.faction : 'karens';
    // the server already validated primary/perk; anything this build cannot resolve falls back to the faction default
    const loadout = this.sim.weapons.loadouts?.[p.primary] ? p.primary : 'default';
    const a = this.sim.addActor({ id: p.id, name: cleanName(p.name), team: p.team === 1 ? 1 : 0, faction, loadout, perk: p.perk || null, isBot: false });
    a.alive = false;
    return a;
  }

  onRoster(msg) {
    this.players = msg.players || [];
    // merged: several rosters can arrive between two frames; a restart wins over plain joins/leaves
    this.pendingRoster = { newMatch: !!(msg.newMatch || this.pendingRoster?.newMatch) };
  }

  /**
   * Apply roster changes to the mirror. Call once per frame before step().
   * @returns {{added:object[], removed:string[], reset:boolean}|null}
   */
  syncRoster() {
    const change = this.pendingRoster;
    if (!change || !this.sim) return null;
    this.pendingRoster = null;
    const sim = this.sim;
    if (change.newMatch) {
      const removed = sim.actors.map(a => a.id);
      this.buildMirror(sim);
      return { added: [...sim.actors], removed, reset: true };
    }
    const ids = new Set(this.players.map(p => p.id));
    const removed = sim.actors.filter(a => !ids.has(a.id)).map(a => a.id);
    for (const id of removed) { sim.byId.delete(id); }
    sim.actors = sim.actors.filter(a => ids.has(a.id));
    const added = [];
    for (const p of this.players) if (!sim.byId.has(p.id)) added.push(this.addMirrorActor(p));
    return { added, removed, reset: false };
  }

  // ---------------------------------------------------------------- snapshots and events

  onSnapshot(msg) {
    if (msg.events?.length) for (const e of msg.events) this.events.push(e);
    this.over = !!msg.over;
    this.restartIn = msg.restartIn ?? null;
  }

  /** Events since the last call, in server order. Events about unknown actors are dropped. */
  takeEvents() {
    const sim = this.sim;
    const out = [];
    for (const e of this.events) {
      if (e.id && !sim.byId.has(e.id)) continue;
      if (e.type === 'kill' && e.victimId && !sim.byId.has(e.victimId)) continue;
      if (e.type === 'swing') { const a = sim.byId.get(e.id); if (a) a.meleeAt = sim.time; }
      // limits only arrive with init/roster, so the HUD clock would sit at 0:00 through overtime
      if (e.type === 'overtime') { sim.timeLimit += e.seconds; sim.scoreLimit = Math.max(...sim.score) + 1; }
      // our own shot was already played locally when we pulled the trigger; keep this one for tracer + hit marker
      if (e.type === 'shot' && e.id === this.me?.id) out.push({ ...e, echo: true });
      else out.push(e);
    }
    this.events.length = 0;
    return out;
  }

  // ---------------------------------------------------------------- per frame

  /**
   * @param {number} dt frame time in seconds
   * @param {boolean} active false while paused/menu: sends a neutral input so you don't keep walking
   * Local intent comes from me.input (written by Controls.apply, same as offline play).
   */
  step(dt, active = true) {
    const { sim, me, net } = this;
    if (!sim || !me) return;
    const inp = me.input;
    const latest = net.latest;

    // 1) send intent
    const cur = net.currentInput;
    if (active) {
      cur.move = [inp.forward || 0, inp.right || 0];
      cur.keys = { jump: !!inp.jump, fire: !!inp.fire, sprint: !!inp.sprint };
      cur.yaw = inp.yaw; cur.pitch = inp.pitch;
      if (inp.reload) net.press('reload');
      if (inp.melee) net.press('melee');
      if (inp.grenade) net.press('grenade');
      if (inp.switchSlot) cur.weaponSlot = inp.switchSlot;
    } else {
      cur.move = [0, 0];
      cur.keys = {};
      cur.yaw = inp.yaw; cur.pitch = inp.pitch;
    }
    inp.reload = inp.melee = inp.grenade = false; // consumed (the mirror never steps, so nothing else clears them)
    inp.switchSlot = null;

    // 2) what the server says
    const sample = net.sample(INTERP_DELAY);
    if (latest) this.applyServerState(latest, sample, dt);

    // 3) predicted own movement + immediate fire feedback
    if (me.alive && active) {
      me.input.yaw = cur.yaw; me.input.pitch = cur.pitch;
      sim.move(me, dt);
      sim.drainEvents(); // local-only events (e.g. trampoline boing); the server's copy arrives as a real event
      this.predictFire(active);
    } else {
      this.prevFire = false;
    }
  }

  applyServerState(latest, sample, dt) {
    const { sim, me } = this;
    sim.time = sample?.time ?? latest.time;
    sim.score = latest.scores || sim.score;
    sim.grenades = latest.projectiles || [];
    sim.over = !!latest.over;
    sim.winner = latest.winner ?? null;
    if (latest.helicopters) sim.helicopters = latest.helicopters;
    if (latest.objects && sim.mode) sim.mode.objects = latest.objects;

    const stats = this.net.statsById;
    const lastById = new Map(latest.actors.map(a => [a.id, a]));
    const viewById = new Map((sample?.actors || latest.actors).map(a => [a.id, a]));

    for (const a of sim.actors) {
      const st = stats.get(a.id);
      if (st) {
        a.hp = st.hp; a.ammo = st.ammo; a.grenades = st.gr; a.kills = st.k; a.deaths = st.d; a.streak = st.st ?? 0;
        const slot = st.slot ?? 'primary';
        if (a.weapons?.[slot]) a.activeSlot = slot;
        a.reloadUntil = st.rl ? sim.time + 1 : 0;
        a.campState = { state: st.cs ?? 'ok', secondsLeft: st.csl ?? 0, dwell: 0 };
        a.revealedUntil = st.rv > 0 ? sim.time + st.rv : 0;
      }
      if (a === me) { this.reconcile(latest, lastById.get(a.id), st); continue; }

      const v = viewById.get(a.id);
      if (!v) continue;
      a.alive = !!v.alive;
      a.pos.x = v.x; a.pos.y = v.y; a.pos.z = v.z;
      a.yaw = v.yaw; a.pitch = v.pitch;
      a.vel.x = v.speed || 0; a.vel.z = 0;
      a.onGround = v.onGround !== false;
      a.firingUntil = v.firing ? sim.time + 0.12 : 0;
      a.hitAgo = v.hitAgo ?? Infinity;
      a.hitDir = v.hitDir || { x: 0, y: 0, z: 0 };
    }
  }

  /**
   * Own player. Prediction already moved us; compare with where the server had us at the moment it
   * processed the input it last acknowledged, and nudge the difference away (or snap if it is large).
   */
  reconcile(latest, server, st) {
    const { me, sim } = this;
    if (!server) return;
    const wasAlive = me.alive;
    me.alive = !!server.alive;
    me.hitAgo = server.hitAgo ?? Infinity;
    me.hitDir = server.hitDir || { x: 0, y: 0, z: 0 };
    me.firingUntil = server.firing ? sim.time + 0.12 : 0;

    const respawned = me.alive && !this.wasAlive;
    this.wasAlive = me.alive;
    if (!me.alive || respawned || wasAlive !== me.alive) {
      // dead bodies and fresh spawns: the server is the only truth
      me.pos.x = server.x; me.pos.y = server.y; me.pos.z = server.z;
      me.vel.x = me.vel.y = me.vel.z = 0;
      me.onGround = true;
      this.history.length = 0;
      this.lastAckSeq = -1;
      if (respawned) { me.yaw = server.yaw; }
      return;
    }
    const ack = st?.ack ?? 0;
    if (ack <= 0 || ack === this.lastAckSeq) return; // only act once per new acknowledgement
    this.lastAckSeq = ack;
    let h = null;
    for (const e of this.history) { if (e.seq <= ack) h = e; else break; }
    if (!h) return;
    const ex = server.x - h.x, ey = server.y - h.y, ez = server.z - h.z;
    const err = Math.hypot(ex, ey, ez);
    if (err > SNAP_DISTANCE) {
      me.pos.x = server.x; me.pos.y = server.y; me.pos.z = server.z;
      me.vel.x = me.vel.y = me.vel.z = 0;
      this.history.length = 0;
    } else if (err > 0.02) {
      me.pos.x += ex * CORRECTION; me.pos.y += ey * CORRECTION; me.pos.z += ez * CORRECTION;
      for (const e of this.history) { e.x += ex * CORRECTION; e.y += ey * CORRECTION; e.z += ez * CORRECTION; }
    }
  }

  /** Gun sound and viewmodel kick the instant you pull the trigger, not a round trip later. */
  predictFire(active) {
    const { sim, me } = this;
    const w = me.weapons?.[me.activeSlot];
    const fire = !!(active && me.input.fire && me.alive && w && w.fire === 'hitscan' && me.ammo > 0 && me.reloadUntil <= 0);
    const edge = fire && !this.prevFire;
    this.prevFire = !!(active && me.input.fire);
    if (!fire) return;
    const now = performance.now() / 1000;
    if (now < this.nextLocalShot) return;
    if (!w.auto && !edge) return;
    this.nextLocalShot = now + (w.intervalSec || 0.1);
    this.events.push({ type: 'localShot', id: me.id, weaponId: w.id, t: sim.time });
  }

  close() {
    this.net.disconnect();
    this.connected = false;
  }
}
