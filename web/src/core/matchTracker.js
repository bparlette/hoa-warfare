// Match bookkeeping + kill -> bark-candidate resolution.
// Candidate order is derived from event priorities in hoa_content.json, never hard-coded,
// so design can re-rank events without touching code.

export class MatchTracker {
  constructor({ events, rules }) {
    this.events = events;
    this.rules = rules;
    this.firstBloodClaimed = false;
    this.stats = new Map();
  }

  stat(id) {
    if (!this.stats.has(id)) this.stats.set(id, { kills: 0, deaths: 0, streak: 0, killTimes: [], lastKillerId: null });
    return this.stats.get(id);
  }

  sortByPriority(list) {
    return [...new Set(list)].sort((a, b) => this.events[b].priority - this.events[a].priority);
  }

  /**
   * @param {{killerId:string|null, victimId:string, headshot?:boolean, melee?:boolean, now:number}} k
   */
  registerKill({ killerId, victimId, headshot = false, melee = false, now }) {
    const victim = this.stat(victimId);
    const victimStreakBefore = victim.streak;
    victim.deaths++;
    victim.streak = 0;
    victim.killTimes.length = 0;

    if (!killerId || killerId === victimId) {
      victim.lastKillerId = null;
      return { selfKill: true, killerEvents: [], victimEvent: 'selfKill', streakEarned: null };
    }

    const killer = this.stat(killerId);
    victim.lastKillerId = killerId;

    const isRevenge = killer.lastKillerId === victimId;
    if (isRevenge) killer.lastKillerId = null;
    const isShutdown = victimStreakBefore >= this.rules.shutdownMinStreak;

    killer.kills++;
    killer.streak++;
    killer.killTimes = killer.killTimes.filter(t => now - t <= this.rules.multiKillWindowSec);
    killer.killTimes.push(now);
    const rapid = killer.killTimes.length;

    const firstBlood = !this.firstBloodClaimed;
    this.firstBloodClaimed = true;
    const streakEarned = this.rules.streakThresholds.includes(killer.streak) ? killer.streak : null;

    const c = ['kill', 'rivalry'];
    if (streakEarned) c.push('ownStreak');
    if (firstBlood) c.push('firstBlood');
    if (rapid >= 4) c.push('rampage'); else if (rapid === 3) c.push('triple'); else if (rapid === 2) c.push('double');
    if (isRevenge) c.push('revenge');
    if (isShutdown) c.push('shutdown');
    if (melee) c.push('melee');
    if (headshot) c.push('headshot');

    return {
      selfKill: false,
      killerEvents: this.sortByPriority(c),
      victimEvent: melee ? 'humiliated' : null,
      streakEarned, firstBlood, isRevenge, isShutdown, rapid, victimStreakBefore,
    };
  }
}
