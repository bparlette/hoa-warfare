// Listener-side Global Match Audio Limiter (review section 7). The v4 C# claimed this existed
// but never implemented it. Runs once per bark per LOCAL listener (each client decides what IT hears).
//   A) own barks: always
//   B) the bark of whoever just killed you: always, on the isolated killcam channel
//   C) everything else: within hearingRadius (12 m), team-scoped events only for your team,
//      and at most 1 external bark every externalGapSec (4 s)

export class AudioLimiter {
  constructor({ hearingRadius = 12, externalGapSec = 4 } = {}) {
    this.radius = hearingRadius;
    this.gap = externalGapSec;
    this.lastExternalAt = -Infinity;
    this.log = [];
  }

  /**
   * @param {{speakerId:string, speakerTeam:number, position:{x:number,y:number,z:number}, scope:'world'|'team', isFatalToListener?:boolean, text?:string}} bark
   * @param {{id:string, team:number, position:{x:number,y:number,z:number}}} listener
   */
  evaluate(bark, listener, now) {
    let result;
    if (bark.speakerId === listener.id) {
      result = { play: true, channel: 'self', volume: 1, reason: 'own-bark' };
    } else if (bark.isFatalToListener) {
      result = { play: true, channel: 'killcam', volume: 1, reason: 'fatal-bark' };
    } else if (bark.scope === 'team' && bark.speakerTeam !== listener.team) {
      result = { play: false, reason: 'team-local' };
    } else {
      const dx = bark.position.x - listener.position.x;
      const dy = bark.position.y - listener.position.y;
      const dz = bark.position.z - listener.position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > this.radius) result = { play: false, reason: 'out-of-range', distance: d };
      else if (now - this.lastExternalAt < this.gap) result = { play: false, reason: 'external-gap', distance: d };
      else {
        this.lastExternalAt = now;
        result = { play: true, channel: 'world', volume: 1 - 0.7 * (d / this.radius), reason: 'in-range', distance: d };
      }
    }
    this.log.push({ t: now, speaker: bark.speakerId, text: bark.text || '', ...result });
    if (this.log.length > 40) this.log.shift();
    return result;
  }
}

// Announcer queue. Fixes a v4 rule collision: "barks never talk over the announcer" + an announcer
// "First Blood!" would silence every First Blood bark. Rule here: the announcer WAITS while the
// local player is hearing a priority >= yieldToPriority line, and barks duck while it speaks.
export class AnnouncerQueue {
  constructor({ yieldToPriority = 7, wordsPerSecond = 3.2 } = {}) {
    this.queue = [];
    this.busyUntil = 0;
    this.yieldToPriority = yieldToPriority;
    this.wps = wordsPerSecond;
  }
  push(text) { this.queue.push(text); }
  isBusy(now) { return now < this.busyUntil; }
  /** @returns {string|null} line to speak now */
  update(now, listenerHearingPriority) {
    if (this.isBusy(now) || this.queue.length === 0) return null;
    if (listenerHearingPriority >= this.yieldToPriority) return null;
    const text = this.queue.shift();
    this.busyUntil = now + Math.max(1, text.split(/\s+/).length / this.wps + 0.3);
    return text;
  }
}
