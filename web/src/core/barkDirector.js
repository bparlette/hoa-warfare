import { ShuffleBag } from './shuffleBag.js';

// Per-speaker voice brain. Implements GDD v4 section 2 rules, bug-fixed:
//  * Priority interrupt: a strictly higher priority line interrupts the line being spoken.
//  * Cooldowns are PER TIER (~5s). A tier on cooldown never blocks a different tier.
//    (v4 C# compared against a stale _currentPlayingPriority that never reset, so after one
//     First Blood every lower line was judged against priority 7 forever.)
//  * Chance failure = deliberate silence. Only "no content" or "tier cooldown" falls through
//    to the next candidate, otherwise the 40% generic-kill chance would be meaningless.
//  * Never talks over the announcer (ducking).
//  * Killcam lines are drawn separately so the victim ALWAYS hears something, even when the
//    live bark lost its 40% roll (v4 hole: "killcam is the design center" but 60% were silent).

const FALLTHROUGH = new Set(['no-lines', 'tier-cooldown']);

export class BarkDirector {
  constructor({ library, faction, rng, isAnnouncerBusy = () => false }) {
    this.library = library;
    this.faction = faction;
    this.rng = rng;
    this.isAnnouncerBusy = isAnnouncerBusy;
    this.bag = new ShuffleBag(rng);
    this.playingUntil = 0;
    this.currentPriority = -1;
    this.currentLine = null;
    this.tierCooldownUntil = new Map();
  }

  isSpeaking(now) { return now < this.playingUntil; }

  stop(now) {
    this.playingUntil = now;
    this.currentPriority = -1;
    this.currentLine = null;
  }

  request(eventId, now, { victimFaction = null, skipChance = false } = {}) {
    const ev = this.library.events[eventId];
    if (!ev) return { ok: false, reason: 'unknown-event', eventId };
    if (this.isAnnouncerBusy(now)) return { ok: false, reason: 'announcer-ducking', eventId };

    const p = ev.priority;
    const speaking = this.isSpeaking(now);
    if (speaking && p <= this.currentPriority) return { ok: false, reason: 'speaking-higher-or-equal', eventId };
    if ((this.tierCooldownUntil.get(p) ?? -Infinity) > now) return { ok: false, reason: 'tier-cooldown', eventId };

    const lines = this.library.getLines(this.faction, eventId, victimFaction);
    if (lines.length === 0) return { ok: false, reason: 'no-lines', eventId };
    if (!skipChance && this.rng() > ev.chance) return { ok: false, reason: 'chance', eventId };

    const key = `${this.library.script}|${this.library.legalSafe}|${eventId}|${victimFaction}`;
    const line = this.bag.draw(key, lines);
    const duration = this.library.durationOf(line);
    const interrupted = speaking ? this.currentLine : null;

    this.playingUntil = now + duration;
    this.currentPriority = p;
    this.currentLine = line;
    const rules = this.library.rules;
    this.tierCooldownUntil.set(p, now + (p <= 1 ? rules.lowTierCooldownSec : rules.barkCooldownSec));

    return { ok: true, eventId, line, priority: p, duration, interrupted, scope: ev.scope };
  }

  /** Try candidates in priority order (already sorted by MatchTracker). */
  requestFirst(candidates, now, ctx = {}) {
    let last = { ok: false, reason: 'no-candidates' };
    for (const eventId of candidates) {
      last = this.request(eventId, now, ctx);
      if (last.ok || !FALLTHROUGH.has(last.reason)) return last;
    }
    return last;
  }

  /** Line for the victim's isolated killcam. Ignores chance/cooldowns; never returns null if any content exists. */
  killcamLine(candidates, { victimFaction = null } = {}) {
    for (const eventId of candidates) {
      const lines = this.library.getLines(this.faction, eventId, victimFaction);
      if (lines.length) {
        const key = `killcam|${this.library.script}|${this.library.legalSafe}|${eventId}|${victimFaction}`;
        return { eventId, line: this.bag.draw(key, lines) };
      }
    }
    return null;
  }
}
