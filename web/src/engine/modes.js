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

export const MODES = { clash: Clash, receiptCheck: ReceiptCheck };

export function createMode(id, sim) {
  const M = MODES[id];
  if (!M) throw new Error(`unknown mode ${id}`);
  return new M(sim);
}
