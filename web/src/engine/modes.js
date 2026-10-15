// Game modes. A mode owns scoring, win conditions and objective objects; the sim calls these hooks.
// Add a mode: subclass Mode, register it in MODES, give its objects a view in render.js OBJECT_VIEWS,
// and a test in web/tests/sim.test.mjs. No three.js / DOM here (runs headless).
//
// Objects in `this.objects` are plain data: { id, kind, pos:{x,y,z}, team?, radius?, ... }.
// The renderer draws them by `kind`; the HUD reads `hud()`.

export class Mode {
  static id = 'base';
  static label = 'Base';
  static parent = '';
  constructor(sim) {
    this.sim = sim;
    this.objects = [];
    this.nextObjectId = 1;
  }
  /** Defaults the sim uses unless the caller overrides them. */
  static defaults = { scoreLimit: 40, timeLimit: 300 };
  onStart() {}
  /** Called after the kill event is emitted. killer is null for self-kills. */
  onKill(ev, killer, victim) {}
  update(dt) {}
  /** Objective zones / one-life modes exempt players from the camping snitch. */
  campingExempt(actor) { return false; }
  /** Where a bot with no visible enemy should head ({x,z}) or null for default roaming. */
  botGoal(actor) { return null; }
  /**
   * Role for the i-th of n bots on a team: 'objective' (plays the mode's botGoal) or 'hunter'
   * (hunts players; in objective modes it flanks the ring around the objective). Default: any mode
   * that overrides botGoal gets a 50/50 split; override this to tune it.
   */
  botRole(actor, i, n) { return this.botGoal !== Mode.prototype.botGoal && i < Math.ceil(n / 2) ? 'objective' : 'hunter'; }
  /** Which map spawn set (0 = south street, 1 = north greenbelt) this actor uses. */
  spawnSide(actor) { return actor.team; }
  respawnDelay(actor) { return actor.isBot ? 3 : 4.5; }
  /** Short HUD line, or null. */
  hud(localActor) { return null; }
  spawnObject(o) { const obj = { id: this.nextObjectId++, ...o }; this.objects.push(obj); return obj; }
}

/** TDM: a kill is a point. */
export class Clash extends Mode {
  static id = 'clash';
  static label = 'Cul-de-Sac Clash';
  static parent = 'TDM';
  onKill(ev, killer) { if (killer) this.sim.addScore(killer.team, 1); }
}

/**
 * Kill Confirmed: kills drop a receipt. Enemy picks it up = point ("confirmed"),
 * victim's team picks it up = denied. Kills alone score nothing.
 */
export class ReceiptCheck extends Mode {
  static id = 'receiptCheck';
  static label = 'Receipt Check';
  static parent = 'Kill Confirmed';
  static defaults = { scoreLimit: 25, timeLimit: 300 };
  static PICKUP_R = 1.3;
  static LIFETIME = 30;

  onKill(ev, killer, victim) {
    this.spawnObject({
      kind: 'receipt', team: victim.team, victimName: victim.name,
      pos: { x: ev.victimPos.x, y: 0, z: ev.victimPos.z }, expiresAt: this.sim.time + ReceiptCheck.LIFETIME,
    });
  }

  update() {
    const sim = this.sim;
    this.objects = this.objects.filter(r => {
      if (sim.time >= r.expiresAt) return false;
      for (const a of sim.actors) {
        if (!a.alive || Math.hypot(a.pos.x - r.pos.x, a.pos.z - r.pos.z) > ReceiptCheck.PICKUP_R || a.pos.y > 1.5) continue;
        if (a.team !== r.team) {
          sim.emit({ type: 'receiptConfirmed', id: a.id, objectId: r.id, victimName: r.victimName });
          sim.addScore(a.team, 1);
        } else {
          sim.emit({ type: 'receiptDenied', id: a.id, objectId: r.id, victimName: r.victimName });
        }
        return false;
      }
      return true;
    });
  }

  botGoal(actor) {
    let best = null, bd = 30;
    for (const r of this.objects) {
      const d = Math.hypot(r.pos.x - actor.pos.x, r.pos.z - actor.pos.z);
      if (d < bd) { bd = d; best = r.pos; }
    }
    return best;
  }

  botRole(actor, i, n) { return i < Math.ceil(n / 2) ? 'objective' : 'hunter'; }

  hud() { return `${this.objects.length} receipt${this.objects.length === 1 ? '' : 's'} on the ground · grab enemy receipts to score`; }
}

/**
 * King of the Lawn (Hardpoint): rotating front lawns across the cul-de-sac.
 * Hold the active zone uncontested to score 1 pt/sec. Objective players are camping-exempt.
 */
export class KingOfTheLawn extends Mode {
  static id = 'kingOfTheLawn';
  static label = 'King of the Lawn';
  static parent = 'Hardpoint';
  static defaults = { scoreLimit: 100, timeLimit: 360 };
  static ZONE_RADIUS = 5.2;
  static ROTATE_SEC = 50;
  static ZONES = [
    { name: 'Gazebo Greenbelt', pos: { x: 0, y: 0, z: -32 } },
    { name: 'Cul-de-Sac Circle', pos: { x: 0, y: 0, z: 0 } },
    { name: 'East Front Lawn', pos: { x: 18, y: 0, z: 10 } },
    { name: 'West Front Lawn', pos: { x: -18, y: 0, z: 10 } },
    { name: 'South Driveway', pos: { x: 0, y: 0, z: 32 } },
  ];

  constructor(sim) {
    super(sim);
    this.zoneIndex = 0;
    this.rotateAt = 0;
    this.scoreTick = 0;
    this.ownerTeam = null;
    this.contested = false;
  }

  onStart() {
    this.setZone(0);
  }

  setZone(idx) {
    this.zoneIndex = idx % KingOfTheLawn.ZONES.length;
    this.rotateAt = this.sim.time + KingOfTheLawn.ROTATE_SEC;
    const def = KingOfTheLawn.ZONES[this.zoneIndex];
    this.objects = [{
      id: this.nextObjectId++, kind: 'lawnZone',
      pos: { ...def.pos }, radius: KingOfTheLawn.ZONE_RADIUS,
      name: def.name, ownerTeam: null, contested: false,
    }];
    // stable object (bots compare goals by identity); radius lets objective bots stop at the edge
    this.goal = { x: def.pos.x, z: def.pos.z, radius: KingOfTheLawn.ZONE_RADIUS };
    this.ownerTeam = null;
    this.contested = false;
    this.sim.emit({ type: 'hardpointRotated', name: def.name, pos: { ...def.pos } });
  }

  get zoneObj() { return this.objects[0]; }

  isInside(actor) {
    const z = this.zoneObj;
    if (!z || !actor.alive || actor.pos.y > 2.5) return false;
    return Math.hypot(actor.pos.x - z.pos.x, actor.pos.z - z.pos.z) <= z.radius;
  }

  campingExempt(actor) {
    return this.isInside(actor);
  }

  botRole(actor, i, n) { return i < Math.round(n * 0.6) ? 'objective' : 'hunter'; }

  botGoal(actor) {
    return this.zoneObj ? this.goal : null;
  }

  update(dt) {
    const sim = this.sim;
    if (sim.time >= this.rotateAt) {
      this.setZone(this.zoneIndex + 1);
      return;
    }

    const t0 = sim.actors.filter(a => a.team === 0 && this.isInside(a)).length;
    const t1 = sim.actors.filter(a => a.team === 1 && this.isInside(a)).length;

    this.contested = t0 > 0 && t1 > 0;
    if (this.contested) {
      this.ownerTeam = null;
    } else if (t0 > 0) {
      this.ownerTeam = 0;
    } else if (t1 > 0) {
      this.ownerTeam = 1;
    } else {
      this.ownerTeam = null;
    }

    const zo = this.zoneObj;
    if (zo) {
      zo.ownerTeam = this.ownerTeam;
      zo.contested = this.contested;
    }

    this.scoreTick += dt;
    if (this.scoreTick >= 1.0) {
      this.scoreTick -= 1.0;
      if (this.ownerTeam !== null && !this.contested) {
        sim.addScore(this.ownerTeam, 1);
      }
    }
  }

  hud(localActor) {
    const z = this.zoneObj;
    if (!z) return null;
    const secLeft = Math.max(0, Math.ceil(this.rotateAt - this.sim.time));
    const status = this.contested
      ? '<b style="color:#ffec27">CONTESTED</b>'
      : this.ownerTeam === null
      ? 'UNOCCUPIED'
      : this.ownerTeam === localActor?.team
      ? '<b style="color:#29adff">CONTROLLED</b>'
      : '<b style="color:#ff004d">ENEMY CONTROLLED</b>';
    return `${z.name} · ${status} (moves in ${secLeft}s)`;
  }
}

/**
 * Search & Destroy: one life per round. Attackers post an Eviction Notice at one of two lawns
 * (stand on the site to post it, 3 s); defenders tear it down (stand on it, 5 s). Round ends when a
 * side is wiped out, the notice is torn down, or it "takes effect" (fuse). First to 4 rounds; sides
 * swap after round 3. The notice carrier drops it on death; any attacker picks it up by touch.
 * Planting and defusing are automatic while standing still enough inside the radius, so it works the
 * same for mouse, controller, touch and bots.
 */
export class EvictTheBlock extends Mode {
  static id = 'evictTheBlock';
  static label = 'Evict the Block';
  static parent = 'Search & Destroy';
  static defaults = { scoreLimit: 4, timeLimit: 1500 };
  static SITES = [
    { name: 'West Lawn', letter: 'A', x: -16, z: -12 },
    { name: 'East Lawn', letter: 'B', x: 16, z: -12 },
  ];
  static SITE_R = 2.6; static PLANT_SEC = 3; static DEFUSE_SEC = 5; static DEFUSE_R = 1.6;
  static FUSE_SEC = 35; static ROUND_SEC = 100; static POST_SEC = 4; static HALFTIME_AFTER = 3;

  constructor(sim) {
    super(sim);
    this.round = 0;
    this.attackers = 1; // team posting the notice; defenders spawn nearer the lawns
    this.goals = EvictTheBlock.SITES.map(s => ({ x: s.x, z: s.z, radius: EvictTheBlock.SITE_R * 0.8 }));
  }

  respawnDelay() { return Infinity; } // one life: everyone returns at the next round
  campingExempt() { return true; }
  spawnSide(actor) { return actor.team === this.attackers ? 0 : 1; } // attackers south street, defenders north
  // defenders all hold the lawns; attackers mostly escort the notice, the rest flank the target lawn
  botRole(actor, i, n) { return actor.team !== this.attackers || i < Math.ceil(n * 0.67) ? 'objective' : 'hunter'; }

  onStart() { this.startRound(true); }

  startRound(first = false) {
    const E = EvictTheBlock, sim = this.sim;
    this.round++;
    if (this.round === E.HALFTIME_AFTER + 1) { this.attackers = 1 - this.attackers; sim.assignRoles(); sim.emit({ type: 'halftime' }); }
    if (!first) sim.resetRound();
    this.phase = 'live';
    this.roundEndsAt = sim.time + E.ROUND_SEC;
    this.planted = null; this.plantProgress = 0; this.defuseProgress = 0;
    this.lastAliveSaid = new Set();
    this.siteIdx = Math.floor(sim.rng() * E.SITES.length); // the site attacking bots go for this round
    // the notice goes to a human attacker or an objective-role bot (a hunter would never post it)
    const atk = sim.actors.filter(a => a.team === this.attackers);
    const pool = atk.filter(a => !a.brain || a.brain.role === 'objective');
    const from = pool.length ? pool : atk;
    this.carrierId = from.length ? from[Math.floor(sim.rng() * from.length)].id : null;
    this.dropped = null;
    this.sync();
    if (!first) sim.emit({ type: 'roundStart', round: this.round, attackers: this.attackers }); // round 1: Sim.start emits it
  }

  onKill(ev, killer, victim) {
    if (victim.id === this.carrierId) { this.carrierId = null; this.dropped = { x: ev.victimPos.x, y: 0, z: ev.victimPos.z }; }
  }

  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    this.phase = 'post';
    this.postUntil = this.sim.time + EvictTheBlock.POST_SEC;
    this.sim.emit({ type: 'roundEnd', round: this.round, winner, reason });
    this.sim.addScore(winner, 1);
  }

  alive(team) { return this.sim.actors.filter(a => a.alive && a.team === team); }

  update(dt) {
    const E = EvictTheBlock, sim = this.sim;
    if (this.phase === 'post') {
      if (sim.time >= this.postUntil && !sim.over) this.startRound();
      return;
    }
    const atk = this.attackers, def = 1 - atk;
    // carrier pickup
    if (!this.carrierId && this.dropped && !this.planted) {
      const p = this.alive(atk).find(a => Math.hypot(a.pos.x - this.dropped.x, a.pos.z - this.dropped.z) < 1.4);
      if (p) { this.carrierId = p.id; this.dropped = null; }
    }
    const carrier = this.carrierId ? sim.byId.get(this.carrierId) : null;
    // posting the notice
    if (!this.planted && carrier?.alive) {
      const site = E.SITES.find(s => Math.hypot(carrier.pos.x - s.x, carrier.pos.z - s.z) <= E.SITE_R);
      if (site && Math.hypot(carrier.vel.x, carrier.vel.z) < 3) {
        this.plantProgress += dt;
        if (this.plantProgress >= E.PLANT_SEC) {
          this.planted = { x: carrier.pos.x, y: 0, z: carrier.pos.z, site: site.letter, at: sim.time, goal: { x: carrier.pos.x, z: carrier.pos.z, radius: 0.8 } };
          this.carrierId = null;
          sim.emit({ type: 'objectiveBark', id: carrier.id, what: 'noticePosted', site: site.letter });
        }
      } else this.plantProgress = Math.max(0, this.plantProgress - dt * 2);
    }
    // tearing it down
    if (this.planted) {
      const d = this.alive(def).find(a => Math.hypot(a.pos.x - this.planted.x, a.pos.z - this.planted.z) <= E.DEFUSE_R && Math.hypot(a.vel.x, a.vel.z) < 3);
      if (d) {
        this.defuseProgress += dt;
        if (this.defuseProgress >= E.DEFUSE_SEC) { sim.emit({ type: 'objectiveBark', id: d.id, what: 'noticeTornDown' }); this.endRound(def, 'torn down'); return; }
      } else this.defuseProgress = 0;
      if (sim.time - this.planted.at >= E.FUSE_SEC) { sim.emit({ type: 'noticeTookEffect', pos: { ...this.planted } }); this.endRound(atk, 'evicted'); return; }
    }
    // eliminations and the clock
    const a = this.alive(atk).length, d = this.alive(def).length;
    if (d === 0) { this.endRound(atk, 'wiped'); return; }
    if (a === 0 && !this.planted) { this.endRound(def, 'wiped'); return; }
    if (!this.planted && sim.time >= this.roundEndsAt) { this.endRound(def, 'time'); return; }
    for (const team of [0, 1]) {
      const left = this.alive(team);
      if (left.length === 1 && !this.lastAliveSaid.has(team) && sim.actors.filter(x => x.team === team).length > 1) {
        this.lastAliveSaid.add(team);
        sim.emit({ type: 'lastAlive', id: left[0].id });
      }
    }
    this.sync();
  }

  /** Mode objects for the renderer and radar. */
  sync() {
    const E = EvictTheBlock;
    this.objects = E.SITES.map((s, i) => ({ id: 'site' + s.letter, kind: 'evictSite', pos: { x: s.x, y: 0, z: s.z }, radius: E.SITE_R, letter: s.letter, active: this.planted?.site === s.letter, attackers: this.attackers }));
    const carrier = this.carrierId ? this.sim.byId.get(this.carrierId) : null;
    const at = this.planted || this.dropped || (carrier?.alive ? { x: carrier.pos.x, y: 2.3, z: carrier.pos.z } : null);
    if (at) this.objects.push({ id: 'notice', kind: 'evictNotice', pos: { x: at.x, y: at.y || 0, z: at.z }, planted: !!this.planted, carried: !this.planted && !this.dropped });
  }

  botGoal(actor) {
    const atk = actor.team === this.attackers;
    if (this.phase !== 'live') return null;
    if (this.planted) return this.planted.goal; // attackers guard it, defenders tear it down
    if (atk) {
      if (this.dropped) return this.dropped.goal ??= { x: this.dropped.x, z: this.dropped.z, radius: 0.5 };
      return this.goals[this.siteIdx];
    }
    // defenders split between the two lawns
    const team = this.sim.actors.filter(a => a.team === actor.team);
    return this.goals[team.indexOf(actor) % this.goals.length];
  }

  hud(local) {
    const E = EvictTheBlock, sim = this.sim;
    const side = local && local.team === this.attackers ? 'ATTACK: post the notice' : 'DEFEND: protect the lawns';
    let s = `Round ${this.round} · ${side}`;
    if (this.phase === 'post') return `${s} · round over`;
    if (this.planted) s += ` · NOTICE ON ${this.planted.site}: ${Math.max(0, Math.ceil(E.FUSE_SEC - (sim.time - this.planted.at)))}s`;
    else s += ` · ${Math.max(0, Math.ceil(this.roundEndsAt - sim.time))}s`;
    if (this.plantProgress > 0 && !this.planted) s += ` · posting ${Math.round(100 * this.plantProgress / E.PLANT_SEC)}%`;
    if (this.defuseProgress > 0) s += ` · tearing down ${Math.round(100 * this.defuseProgress / E.DEFUSE_SEC)}%`;
    if (local && local.id === this.carrierId) s += ' · YOU HAVE THE NOTICE';
    return s;
  }
}

export const MODES = { clash: Clash, receiptCheck: ReceiptCheck, kingOfTheLawn: KingOfTheLawn, evictTheBlock: EvictTheBlock };

export function createMode(id, sim) {
  const M = MODES[id];
  if (!M) throw new Error(`unknown mode ${id}`);
  return new M(sim);
}
