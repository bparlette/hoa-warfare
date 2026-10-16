// Ambient chatter: fills dead air with quiet background banter.
// Engine-agnostic (no DOM/Three.js): the game wires it into the tick,
// requests the bark through the actor's BarkDirector, and voices it via
// the normal voice queue. Chatter NEVER interrupts action voices.
//
// Rules (per Cherie 2026-10-16):
//  * Fires only after `silenceSec` (default 5s) with no voice line playing.
//  * Requires the voice channel idle AND the bark queue empty.
//  * Alternates teams for back-and-forth feel.
//  * Uses existing low-priority ambient events (spotted p0, spawn p2) with
//    skipChance, voiced quietly (volume 0.6) by the game layer.
//  * `notifyVoicePlayed(now)` must be called whenever ANY voice line
//    (bark or announcer) actually starts, resetting the silence timer.

const CHATTER_EVENTS = ['spotted', 'spawn'];

export class ChatterDirector {
  constructor({ rng, silenceSec = 5.0 } = {}) {
    this.rng = rng;
    this.silenceSec = silenceSec;
    this.lastVoiceTime = -Infinity;
    this.lastTeam = null;
  }

  /** Call whenever any voice line actually starts playing. Resets the silence timer. */
  notifyVoicePlayed(now) {
    this.lastVoiceTime = now;
  }

  /**
   * @param {number} now game clock (same clock passed to notifyVoicePlayed)
   * @param {{actors:object[], isVoiceBusy:()=>boolean}} ctx actors need {id, team, alive}
   * @returns {{actor:object, eventId:string}|null} chatter candidate, or null if not silent
   */
  maybeChatter(now, { actors, isVoiceBusy }) {
    if (now - this.lastVoiceTime <= this.silenceSec) return null;
    if (isVoiceBusy()) return null;
    const alive = (actors || []).filter(a => a.alive);
    if (!alive.length) return null;
    const teams = [...new Set(alive.map(a => a.team))];
    let team;
    if (teams.length > 1) {
      const others = teams.filter(t => t !== this.lastTeam);
      team = others[Math.floor(this.rng() * others.length)];
    } else {
      team = teams[0];
    }
    const pool = alive.filter(a => a.team === team);
    const actor = pool[Math.floor(this.rng() * pool.length)];
    this.lastTeam = team;
    const eventId = CHATTER_EVENTS[Math.floor(this.rng() * CHATTER_EVENTS.length)];
    return { actor, eventId };
  }
}
