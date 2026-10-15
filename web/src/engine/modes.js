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

  botGoal(actor) {
    const z = this.zoneObj;
    return z ? z.pos : null;
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

export const MODES = { clash: Clash, receiptCheck: ReceiptCheck, kingOfTheLawn: KingOfTheLawn };

export function createMode(id, sim) {
  const M = MODES[id];
  if (!M) throw new Error(`unknown mode ${id}`);
  return new M(sim);
}
