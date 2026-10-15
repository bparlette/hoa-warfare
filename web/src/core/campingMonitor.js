// Camping self-snitch, rebuilt to be un-gameable.
//
// v4 C#: fixed anchor + 4.5 m radius, anchor RESET whenever you stepped outside -> tap A/D across
// the line every 18 s and you are immune. The review's "5 m box" has the same hole.
//
// v5 rule: "dwell" = seconds, within the last windowSec (24 s), that you spent within `radius` (4 m)
// of where you are NOW. Warn at 17 s, snitch at 20 s. Because it is a rolling time-weighted window,
// a 2-second dash out and back still leaves ~22 s of dwell -> snitched. Actually relocating
// (moving >4 m and staying there) naturally drains the dwell.
//
// Exempt: one-life modes (Evict the Block), active objective zones, dead players.
// damageResets=false by default (deliberate disagreement with the review: the camper who is
// farming kills from a corner is exactly who the joke is about). Flip it in hoa_content.json.

export class CampingMonitor {
  constructor({ radius = 4, windowSec = 24, warnSec = 17, snitchSec = 20, sampleSec = 0.25, cooldownSec = 30, damageResets = false } = {}) {
    Object.assign(this, { radius, windowSec, warnSec, snitchSec, sampleSec, cooldownSec, damageResets });
    this.samples = [];
    this.accum = 0;
    this.cooldownUntil = -Infinity;
  }

  reset() { this.samples.length = 0; this.accum = 0; }

  notifyDamageDealt() { if (this.damageResets) this.reset(); }

  /**
   * @returns {{state:'ok'|'warning'|'snitch', dwell:number, secondsLeft?:number, reason?:string}}
   */
  update(now, dt, pos, { exempt = false, alive = true } = {}) {
    if (!alive || exempt) {
      this.reset();
      return { state: 'ok', dwell: 0, reason: alive ? 'exempt' : 'dead' };
    }
    this.accum += dt;
    while (this.accum >= this.sampleSec) {
      this.accum -= this.sampleSec;
      this.samples.push({ t: now, x: pos.x, z: pos.z });
    }
    const cutoff = now - this.windowSec;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();

    if (now < this.cooldownUntil) return { state: 'ok', dwell: 0, reason: 'cooldown' };

    const r2 = this.radius * this.radius;
    let n = 0;
    for (const s of this.samples) {
      const dx = s.x - pos.x, dz = s.z - pos.z;
      if (dx * dx + dz * dz <= r2) n++;
    }
    const dwell = n * this.sampleSec;

    if (dwell >= this.snitchSec) {
      this.cooldownUntil = now + this.cooldownSec;
      this.reset();
      return { state: 'snitch', dwell };
    }
    if (dwell >= this.warnSec) return { state: 'warning', dwell, secondsLeft: this.snitchSec - dwell };
    return { state: 'ok', dwell };
  }
}
