// Glue between sim events and the core voice logic (MatchTracker -> BarkDirector -> AnnouncerQueue).
// Engine-agnostic: produces bark records; the game decides what the local player hears
// (AudioLimiter) and how it is voiced (VO file or TTS placeholder) and shown (speech bubble).

import { BarkDirector } from '../core/barkDirector.js';
import { MatchTracker } from '../core/matchTracker.js';
import { AnnouncerQueue } from '../core/audioLimiter.js';

export class BarkSystem {
  constructor({ library, content, rng, sim }) {
    this.library = library;
    this.content = content;
    this.rng = rng;
    this.sim = sim;
    this.tracker = new MatchTracker({ events: library.events, rules: library.rules });
    this.announcer = new AnnouncerQueue({});
    this.directors = new Map();
  }

  director(actor) {
    let d = this.directors.get(actor.id);
    if (!d) {
      d = new BarkDirector({ library: this.library, faction: actor.faction, rng: this.rng, isAnnouncerBusy: now => this.announcer.isBusy(now) });
      this.directors.set(actor.id, d);
    }
    return d;
  }

  bark(actor, result, extra = {}) {
    if (!result?.ok) return null;
    return {
      speakerId: actor.id, speakerTeam: actor.team, faction: actor.faction, name: actor.name,
      position: { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z },
      scope: result.scope, text: result.line.text, lineId: result.line.id, eventId: result.eventId,
      priority: result.priority, duration: result.duration, interrupted: result.interrupted?.id ?? null, ...extra,
    };
  }

  /**
   * @param {object[]} events drained from Sim
   * @param {string|null} localId the listening player (killcam lines are resolved for them)
   * @returns {{barks:object[], kills:object[], announcer:string[], killcam:object|null}}
   */
  process(events, now, localId = null) {
    const out = { barks: [], kills: [], announcer: [], killcam: null };
    const A = this.content.announcer;
    const push = b => { if (b) out.barks.push(b); };
    const sim = this.sim;

    for (const ev of events) {
      const actor = ev.id ? sim.byId.get(ev.id) : null;
      switch (ev.type) {
        case 'roundStart':
          for (const a of sim.actors) push(this.bark(a, this.director(a).request('roundStart', now)));
          this.announcer.push(A.roundStart);
          break;
        case 'reload': push(this.bark(actor, this.director(actor).request('reload', now))); break;
        case 'spotted': push(this.bark(actor, this.director(actor).request('spotted', now))); break;
        case 'lowHealth': push(this.bark(actor, this.director(actor).request('lowHealth', now))); break;
        case 'campingSnitch':
          push(this.bark(actor, this.director(actor).request('campingSnitch', now, { skipChance: true }), { snitch: true }));
          break;
        case 'kill': this.onKill(ev, now, localId, out); break;
        case 'receiptConfirmed':
        case 'receiptDenied':
          push(this.bark(actor, this.director(actor).request('objective', now)));
          break;
        case 'matchEnd': {
          const local = sim.byId.get(localId);
          if (ev.winner === null) this.announcer.push('Draw. Everyone loses.');
          else this.announcer.push(local && ev.winner !== local.team ? A.defeat : A.victory);
          break;
        }
      }
    }
    return out;
  }

  onKill(ev, now, localId, out) {
    const sim = this.sim;
    const victim = sim.byId.get(ev.victimId);
    const killer = ev.killerId ? sim.byId.get(ev.killerId) : null;
    const res = this.tracker.registerKill({ killerId: ev.killerId, victimId: ev.victimId, headshot: ev.headshot, melee: ev.melee, now });
    const feed = { ...ev, firstBlood: !!res.firstBlood, revenge: !!res.isRevenge, shutdown: !!res.isShutdown, rapid: res.rapid || 0, streakEarned: res.streakEarned };
    out.kills.push(feed);

    if (res.selfKill) {
      const b = this.bark(victim, this.director(victim).request('selfKill', now, { skipChance: true }));
      if (b) out.barks.push(b);
      if (victim.id === localId) out.killcam = { killerId: victim.id, victimId: victim.id, selfKill: true, line: b ? { id: b.lineId, text: b.text } : null };
      return;
    }

    const kd = this.director(killer);
    const r = kd.requestFirst(res.killerEvents, now, { victimFaction: victim.faction });
    const kb = this.bark(killer, r, { isFatalToListener: victim.id === localId, victimId: victim.id });
    if (kb) out.barks.push(kb);

    if (res.victimEvent) {
      const vb = this.bark(victim, this.director(victim).request(res.victimEvent, now, { skipChance: true }));
      if (vb) out.barks.push(vb);
    }

    if (victim.id === localId) {
      // Killcam rule: the victim ALWAYS hears the killer, even if the live bark lost its chance roll.
      const line = kb ? { id: kb.lineId, text: kb.text, eventId: kb.eventId } : (() => {
        const k = kd.killcamLine(res.killerEvents, { victimFaction: victim.faction });
        return k ? { id: k.line.id, text: k.line.text, eventId: k.eventId } : null;
      })();
      out.killcam = { killerId: killer.id, victimId: victim.id, line, headshot: ev.headshot, melee: ev.melee };
    }

    if (res.streakEarned === 5) {
      this.announcer.push(this.content.announcer.streak5);
      const enemies = sim.actors.filter(a => a.alive && a.team !== killer.team);
      if (enemies.length) {
        const who = enemies[Math.floor(this.rng() * enemies.length)];
        const b = this.bark(who, this.director(who).request('enemyStreak', now));
        if (b) out.barks.push(b);
      }
    }
  }

  /** Call once per frame after process(); returns an announcer line to speak now, or null. */
  updateAnnouncer(now, localHearingPriority) { return this.announcer.update(now, localHearingPriority); }
}
