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
  /** Round or objective clock in seconds left, or null to fall back to the match clock. */
  clock() { return null; }
  /** Short HUD line, or null. */
  hud(localActor) { return null; }
  spawnObject(o) { const obj = { id: this.nextObjectId++, ...o }; this.objects.push(obj); return obj; }
}

/** TDM: a kill is a point. */
export class Clash extends Mode {
  static id = 'clash';
  static label = 'Cul-de-Sac Clash';
  static parent = 'TDM';
  static defaults = { scoreLimit: 60, timeLimit: 600 };
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
 * HOA Patrol (Domination): 3 capture zones (Gazebo, Clubhouse, Pool).
 * Holding zones accumulates points every second. Contested zones freeze capture and points.
 * Players inside zones are camping-exempt.
 */
export class HoaPatrol extends Mode {
  static id = 'hoaPatrol';
  static label = 'HOA Patrol';
  static parent = 'Domination';
  static defaults = { scoreLimit: 120, timeLimit: 360 };
  static CAP_SEC = 3.0;
  static ZONES = [
    { letter: 'A', name: 'Gazebo', pos: { x: 0, y: 0, z: -32 }, radius: 5.2 },
    { letter: 'B', name: 'Clubhouse', pos: { x: 0, y: 0, z: 0 }, radius: 5.5 },
    { letter: 'C', name: 'Pool Patio', pos: { x: 18, y: 0, z: 22 }, radius: 5.2 },
  ];

  constructor(sim) {
    super(sim);
    this.scoreTick = 0;
  }

  onStart() {
    this.objects = HoaPatrol.ZONES.map((def) => ({
      id: this.nextObjectId++,
      kind: 'patrolZone',
      letter: def.letter,
      name: def.name,
      pos: { ...def.pos },
      radius: def.radius,
      ownerTeam: null,
      contested: false,
      cappingTeam: null,
      capProgress: 0,
    }));
  }

  isInside(actor, z) {
    if (!z || !actor.alive || actor.pos.y > 2.5) return false;
    return Math.hypot(actor.pos.x - z.pos.x, actor.pos.z - z.pos.z) <= z.radius;
  }

  campingExempt(actor) {
    return this.objects.some(z => z.kind === 'patrolZone' && this.isInside(actor, z));
  }

  botGoal(actor) {
    let best = null, bestDist = Infinity;
    for (const z of this.objects) {
      if (z.kind !== 'patrolZone') continue;
      const d = Math.hypot(z.pos.x - actor.pos.x, z.pos.z - actor.pos.z);
      const weight = (z.ownerTeam !== actor.team || z.contested) ? 1.0 : 2.5;
      const score = d * weight;
      if (score < bestDist) {
        bestDist = score;
        best = z.pos;
      }
    }
    return best;
  }

  update(dt) {
    const sim = this.sim;
    for (const z of this.objects) {
      if (z.kind !== 'patrolZone') continue;
      const t0 = sim.actors.filter(a => a.team === 0 && this.isInside(a, z)).length;
      const t1 = sim.actors.filter(a => a.team === 1 && this.isInside(a, z)).length;
      z.contested = t0 > 0 && t1 > 0;

      if (z.contested) {
        // Contested halts capping
      } else if (t0 > 0) {
        if (z.ownerTeam === 0) {
          z.cappingTeam = null;
          z.capProgress = 1;
        } else {
          z.cappingTeam = 0;
          z.capProgress += dt / HoaPatrol.CAP_SEC;
          if (z.capProgress >= 1) {
            z.ownerTeam = 0;
            z.capProgress = 1;
            sim.emit({ type: 'zoneCaptured', letter: z.letter, name: z.name, team: 0 });
          }
        }
      } else if (t1 > 0) {
        if (z.ownerTeam === 1) {
          z.cappingTeam = null;
          z.capProgress = 1;
        } else {
          z.cappingTeam = 1;
          z.capProgress += dt / HoaPatrol.CAP_SEC;
          if (z.capProgress >= 1) {
            z.ownerTeam = 1;
            z.capProgress = 1;
            sim.emit({ type: 'zoneCaptured', letter: z.letter, name: z.name, team: 1 });
          }
        }
      } else {
        if (z.ownerTeam === null && z.capProgress > 0) {
          z.capProgress = Math.max(0, z.capProgress - dt / (HoaPatrol.CAP_SEC * 1.5));
          if (z.capProgress === 0) z.cappingTeam = null;
        }
      }
    }

    this.scoreTick += dt;
    if (this.scoreTick >= 1.0) {
      this.scoreTick -= 1.0;
      for (const z of this.objects) {
        if (z.kind === 'patrolZone' && z.ownerTeam !== null && !z.contested) {
          sim.addScore(z.ownerTeam, 1);
        }
      }
    }
  }

  hud(localActor) {
    const zones = this.objects.filter(o => o.kind === 'patrolZone');
    const parts = zones.map(z => {
      const col = z.contested ? '#ffec27' : z.ownerTeam === null ? '#c2c3c7' : z.ownerTeam === localActor?.team ? '#29adff' : '#ff004d';
      const status = z.contested ? '!' : z.ownerTeam === null ? (z.capProgress > 0 ? `${Math.round(z.capProgress * 100)}%` : '-') : (z.ownerTeam === localActor?.team ? 'DEF' : 'ATK');
      return `<b style="color:${col}">[${z.letter}: ${status}]</b>`;
    });
    return `HOA Patrol · ${parts.join(' ')}`;
  }
}

/**
 * Steal the Casserole (Capture the Flag):
 * Each team has a hot casserole at their cul-de-sac base.
 * Infiltrate enemy base, snatch the dish, bring it home while your casserole is safe!
 * Dropped casseroles can be recovered by friendly touch or return automatically after 30s.
 */
export class StealTheCasserole extends Mode {
  static id = 'stealTheCasserole';
  static label = 'Steal the Casserole';
  static parent = 'CTF';
  static defaults = { scoreLimit: 3, timeLimit: 360 };
  static BASES = [
    { team: 0, pos: { x: 0, y: 0, z: -35 }, name: 'North Kitchen' },
    { team: 1, pos: { x: 0, y: 0, z: 35 }, name: 'South Kitchen' },
  ];
  static PICKUP_R = 1.6;
  static CAPTURE_R = 2.4;
  static RETURN_TIMEOUT = 30;

  constructor(sim) {
    super(sim);
  }

  onStart() {
    this.objects = [
      { id: this.nextObjectId++, kind: 'casseroleBase', team: 0, pos: { ...StealTheCasserole.BASES[0].pos }, radius: StealTheCasserole.CAPTURE_R },
      { id: this.nextObjectId++, kind: 'casseroleBase', team: 1, pos: { ...StealTheCasserole.BASES[1].pos }, radius: StealTheCasserole.CAPTURE_R },
      {
        id: this.nextObjectId++, kind: 'casserole', team: 0,
        homePos: { ...StealTheCasserole.BASES[0].pos },
        pos: { ...StealTheCasserole.BASES[0].pos },
        state: 'home',
        carrierId: null,
        droppedAt: 0,
      },
      {
        id: this.nextObjectId++, kind: 'casserole', team: 1,
        homePos: { ...StealTheCasserole.BASES[1].pos },
        pos: { ...StealTheCasserole.BASES[1].pos },
        state: 'home',
        carrierId: null,
        droppedAt: 0,
      },
    ];
  }

  getCasserole(team) {
    return this.objects.find(o => o.kind === 'casserole' && o.team === team);
  }

  getBase(team) {
    return this.objects.find(o => o.kind === 'casseroleBase' && o.team === team);
  }

  onKill(ev, killer, victim) {
    for (const c of this.objects) {
      if (c.kind === 'casserole' && c.carrierId === victim.id) {
        c.carrierId = null;
        c.state = 'dropped';
        c.pos = { x: ev.victimPos.x, y: 0, z: ev.victimPos.z };
        c.droppedAt = this.sim.time;
        this.sim.emit({ type: 'casseroleDropped', team: c.team, pos: { ...c.pos }, victimId: victim.id });
      }
    }
  }

  campingExempt(actor) {
    for (const o of this.objects) {
      if (o.kind === 'casserole' && o.carrierId === actor.id) return true;
      if (o.kind === 'casseroleBase' && o.team === actor.team) {
        if (Math.hypot(actor.pos.x - o.pos.x, actor.pos.z - o.pos.z) < 6.0) return true;
      }
    }
    return false;
  }

  botGoal(actor) {
    const myCasserole = this.getCasserole(actor.team);
    const enemyCasserole = this.getCasserole(1 - actor.team);
    const myBase = this.getBase(actor.team);

    if (enemyCasserole?.carrierId === actor.id) {
      return myBase?.pos || null;
    }
    if (myCasserole?.state === 'carried' && myCasserole.carrierId) {
      const carrier = this.sim.byId.get(myCasserole.carrierId);
      if (carrier && carrier.alive) return carrier.pos;
    }
    if (myCasserole?.state === 'dropped') {
      return myCasserole.pos;
    }
    return enemyCasserole?.pos || null;
  }

  update(dt) {
    const sim = this.sim;
    const now = sim.time;

    for (const c of this.objects) {
      if (c.kind !== 'casserole') continue;

      if (c.state === 'carried') {
        const carrier = sim.byId.get(c.carrierId);
        if (!carrier || !carrier.alive) {
          c.carrierId = null;
          c.state = 'dropped';
          c.droppedAt = now;
          continue;
        }
        c.pos = { x: carrier.pos.x, y: carrier.pos.y + 0.6, z: carrier.pos.z };

        const myBase = this.getBase(carrier.team);
        const myCasserole = this.getCasserole(carrier.team);
        if (myBase && myCasserole && myCasserole.state === 'home') {
          const distToBase = Math.hypot(carrier.pos.x - myBase.pos.x, carrier.pos.z - myBase.pos.z);
          if (distToBase <= StealTheCasserole.CAPTURE_R) {
            sim.addScore(carrier.team, 1);
            sim.emit({ type: 'casseroleCaptured', team: carrier.team, carrierId: carrier.id });
            c.state = 'home';
            c.carrierId = null;
            c.pos = { ...c.homePos };
          }
        }
      } else if (c.state === 'dropped') {
        if (now - c.droppedAt >= StealTheCasserole.RETURN_TIMEOUT) {
          c.state = 'home';
          c.pos = { ...c.homePos };
          sim.emit({ type: 'casseroleReturned', team: c.team, reason: 'timeout' });
          continue;
        }

        for (const a of sim.actors) {
          if (!a.alive) continue;
          const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z);
          if (d <= StealTheCasserole.PICKUP_R && a.pos.y < 2.0) {
            if (a.team === c.team) {
              c.state = 'home';
              c.pos = { ...c.homePos };
              sim.emit({ type: 'casseroleReturned', team: c.team, actorId: a.id });
              break;
            } else {
              c.state = 'carried';
              c.carrierId = a.id;
              sim.emit({ type: 'casseroleTaken', team: a.team, actorId: a.id, casseroleTeam: c.team });
              break;
            }
          }
        }
      } else if (c.state === 'home') {
        for (const a of sim.actors) {
          if (!a.alive || a.team === c.team) continue;
          const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z);
          if (d <= StealTheCasserole.PICKUP_R && a.pos.y < 2.0) {
            c.state = 'carried';
            c.carrierId = a.id;
            sim.emit({ type: 'casseroleTaken', team: a.team, actorId: a.id, casseroleTeam: c.team });
            break;
          }
        }
      }
    }
  }

  hud(localActor) {
    const myC = this.getCasserole(localActor?.team ?? 0);
    const enemyC = this.getCasserole(1 - (localActor?.team ?? 0));
    if (!myC || !enemyC) return null;

    const myStatus = myC.state === 'home' ? '<b style="color:#29adff">SAFE AT BASE</b>' : myC.state === 'carried' ? '<b style="color:#ff004d">STOLEN!</b>' : '<b style="color:#ffa300">DROPPED</b>';
    const enemyStatus = enemyC.state === 'carried' ? (enemyC.carrierId === localActor?.id ? '<b style="color:#00e436">YOU HAVE IT! RETURN HOME!</b>' : '<b style="color:#29adff">CARRIED</b>') : enemyC.state === 'dropped' ? '<b style="color:#ffec27">DROPPED</b>' : '<b style="color:#c2c3c7">AT ENEMY BASE</b>';

    return `Our Casserole: ${myStatus} · Enemy Casserole: ${enemyStatus}`;
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
      const carrier = this.carrierId ? this.sim.byId.get(this.carrierId) : null;
      // O2b: If actor is not the carrier and carrier is advancing, escort the carrier within 7m!
      if (carrier && carrier.id !== actor.id && carrier.alive) {
        const distToCarrier = Math.hypot(carrier.pos.x - actor.pos.x, carrier.pos.z - actor.pos.z);
        if (distToCarrier > 7) {
          return { x: carrier.pos.x, z: carrier.pos.z, radius: 3.5 };
        }
      }
      return this.goals[this.siteIdx];
    }
    // defenders split between the two lawns and hold defensive positions
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

  clock() {
    const sim = this.sim;
    if (this.phase === 'post') return 0;
    if (this.planted) return Math.max(0, EvictTheBlock.FUSE_SEC - (sim.time - this.planted.at));
    return Math.max(0, this.roundEndsAt - sim.time);
  }
}

/**
 * Lone Wolf: 1 Player vs. The Entire Rival Faction.
 * Get Off My Lawn! Player has infinite respawns until all enemy reinforcements are dead!
 */
export class LoneWolf extends Mode {
  static id = 'loneWolf';
  static label = 'Lone Wolf: Get Off My Lawn!';
  static parent = '1 vs Faction';
  static defaults = { scoreLimit: 30, timeLimit: 900 };

  constructor(sim) {
    super(sim);
    this.enemiesLeft = 30; // 30 enemy lives to wipe out
  }

  onStart() {
    const player = this.sim.actors.find(a => a.team === 0);
    if (player) {
      player.maxHp = 200;
      player.hp = 200;
    }
  }

  onKill(ev, killer, victim) {
    if (killer) {
      this.sim.addScore(killer.team, 1);
      if (killer.team === 0 && killer.alive) {
        killer.hp = Math.min(killer.maxHp || 200, killer.hp + 35);
        this.sim.emit({ type: 'heal', actorId: killer.id, amount: 35 });
      }
    }
    if (victim && victim.team === 1) {
      this.enemiesLeft--;
      if (this.enemiesLeft <= 0) {
        this.enemiesLeft = 0;
        const living = this.sim.actors.filter(a => a.team === 1 && a.alive);
        if (living.length === 0) this.sim.end(0);
      }
    }
  }

  update() {
    if (this.enemiesLeft <= 0 && !this.sim.over) {
      const living = this.sim.actors.filter(a => a.team === 1 && a.alive);
      if (living.length === 0) this.sim.end(0);
    }
  }

  respawnDelay(actor) {
    if (actor.team === 0) return 2.5; // Player has INFINITE RESPAWNS
    if (this.enemiesLeft <= 0) return Infinity; // Enemies stop respawning once ticket pool is 0
    return 2.0;
  }

  hud(localActor) {
    if (localActor?.team === 0) {
      const living = this.sim.actors.filter(a => a.team === 1 && a.alive).length;
      const count = Math.max(0, this.enemiesLeft + living);
      return count === 0 ? 'ALL ENEMIES WIPED OUT!' : `ENEMIES REMAINING: ${count} · DEFEND YOUR LAWN`;
    }
    return null;
  }
}

/**
 * Suburban Wipeout: 6v6 Team Elimination.
 * Friendly squad has infinite respawns. Eliminate all 40 enemy reinforcements to win!
 */
export class SuburbanWipeout extends Mode {
  static id = 'wipeout';
  static label = 'Suburban Wipeout: Enemy Elimination';
  static parent = 'Elimination';
  static defaults = { scoreLimit: 40, timeLimit: 900 };

  constructor(sim) {
    super(sim);
    this.enemyTickets = 40;
  }

  onKill(ev, killer, victim) {
    if (killer) this.sim.addScore(killer.team, 1);
    if (victim && victim.team === 1) {
      this.enemyTickets--;
      if (this.enemyTickets <= 0) {
        this.enemyTickets = 0;
        const living = this.sim.actors.filter(a => a.team === 1 && a.alive);
        if (living.length === 0) this.sim.end(0);
      }
    }
  }

  update() {
    if (this.enemyTickets <= 0 && !this.sim.over) {
      const living = this.sim.actors.filter(a => a.team === 1 && a.alive);
      if (living.length === 0) this.sim.end(0);
    }
  }

  respawnDelay(actor) {
    if (actor.team === 0) return 2.5; // Infinite friendly respawn
    if (this.enemyTickets <= 0) return Infinity; // Enemies stay dead once tickets depleted
    return 2.5;
  }

  hud() {
    const living = this.sim.actors.filter(a => a.team === 1 && a.alive).length;
    const count = Math.max(0, this.enemyTickets + living);
    return count > 0 ? `ENEMIES LEFT: ${count}` : 'HUNT DOWN FINAL ENEMIES!';
  }
}

export const MODES = {
  clash: Clash,
  wipeout: SuburbanWipeout,
  receiptCheck: ReceiptCheck,
  kingOfTheLawn: KingOfTheLawn,
  evictTheBlock: EvictTheBlock,
  hoaPatrol: HoaPatrol,
  stealTheCasserole: StealTheCasserole,
  loneWolf: LoneWolf,
};

export const MODE_ALIASES = {
  patrol: 'hoaPatrol',
  casserole: 'stealTheCasserole',
  kotl: 'kingOfTheLawn',
  receipt: 'receiptCheck',
  evict: 'evictTheBlock',
  lonewolf: 'loneWolf',
  survival: 'loneWolf',
  elimination: 'wipeout',
};

export function resolveModeId(id) {
  return MODE_ALIASES[id] || id;
}

export function createMode(id, sim) {
  const canonical = resolveModeId(id);
  const M = MODES[canonical];
  if (!M) throw new Error(`unknown mode ${id}`);
  return new M(sim);
}


