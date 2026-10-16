// Voice output + synthesized SFX.
// Voice: recorded VO wins when web/vo/manifest.json lists the line ID (file = id with '.' -> '_' + .ogg);
// otherwise a browser TTS placeholder using each faction's pitch/rate from hoa_content.json.
// TTS is a single channel, so a higher-priority line (or own/killcam line) cuts the current one.

const PREFERRED = {
  karens: ['Karen', 'Samantha', 'Victoria'],
  brainRot: ['Junior', 'Kathy', 'Samantha'],
  fratHouse: ['Fred', 'Aaron', 'Alex', 'Daniel'],
  cloutStreamers: ['Ralph', 'Aaron', 'Alex'],
  valleyGirls: ['Princess', 'Samantha'],
};
const FEMALE = /samantha|victoria|karen|moira|tessa|fiona|kathy|princess|allison|ava|susan|zira|female|serena|kate/i;

/** Resolve the VO file URL for a line ID. Dots become underscores. */
export function voFileFor(lineId) {
  return `vo/${lineId.replace(/\./g, '_')}.ogg`;
}

// Padding around spoken lines so words aren't clipped at the edges:
// 150ms startup latency before the busy timer starts counting (audio
// element / TTS engine spin-up), 250ms tail after the estimated duration
// before the channel is marked free (files often end abruptly).
const VOICE_STARTUP_PAD = 0.15;
const VOICE_END_PAD = 0.25;

/**
 * Normalize a vo/manifest.json payload into {ids:Set, durations:Map}.
 * Accepts the legacy flat array of line IDs and the rich T11 schema
 * {version, lines:{<id>:{file,duration,...}}}.
 */
export function parseManifest(payload) {
  const ids = new Set();
  const durations = new Map();
  if (Array.isArray(payload)) {
    for (const id of payload) ids.add(id);
  } else if (payload && typeof payload === 'object') {
    const lines = payload.lines || payload;
    for (const [id, entry] of Object.entries(lines)) {
      if (typeof id !== 'string') continue;
      ids.add(id);
      if (entry && typeof entry.duration === 'number') durations.set(id, entry.duration);
    }
  }
  return { ids, durations };
}

export class Voice {
  constructor({ factions }) {
    this.factions = factions;
    this.enabled = true;
    this.manifest = new Set();
    this.durations = new Map();
    this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    this.voices = [];
    this.current = null; // {priority, until, audio?}
    if (this.synth) {
      const load = () => { this.voices = this.synth.getVoices().filter(v => /^en/i.test(v.lang)); };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
    fetch('vo/manifest.json').then(r => (r.ok ? r.json() : [])).then(payload => {
      const { ids, durations } = parseManifest(payload);
      this.manifest = ids;
      this.durations = durations;
    }).catch(() => {});
  }

  pickVoice(factionId) {
    if (!this.voices.length) return null;
    const pref = PREFERRED[factionId] || [];
    for (const name of pref) { const v = this.voices.find(v => v.name.startsWith(name)); if (v) return v; }
    const fem = this.factions[factionId]?.voice?.gender === 'f';
    return this.voices.find(v => FEMALE.test(v.name) === fem) || this.voices[0];
  }

  /**
   * @param {{text:string, lineId?:string, faction?:string, priority:number, volume?:number, force?:boolean, announcer?:boolean}} o
   * @returns {boolean} whether it started
   */
  say(o) {
    if (!this.enabled) return false;
    const now = performance.now() / 1000;
    const busy = this.current && now < this.current.until;
    if (busy && !o.force && o.priority <= this.current.priority) return false;
    this.stop();
    const text = o.text.replace(/\*[^*]*\*/g, ' ').trim();
    const est = Math.max(0.8, text.split(/\s+/).length / 3) + 0.3;
    if (o.lineId && this.manifest.has(o.lineId)) {
      const audio = new Audio(voFileFor(o.lineId));
      audio.volume = o.volume ?? 1;
      audio.play().catch(() => {});
      const dur = this.durations.get(o.lineId) ?? est;
      this.current = { priority: o.priority, until: now + VOICE_STARTUP_PAD + dur + VOICE_END_PAD, audio };
      return true;
    }
    if (!this.synth) return false;
    const u = new SpeechSynthesisUtterance(text);
    const fv = o.announcer ? { pitch: 0.7, rate: 1.0 } : this.factions[o.faction]?.voice || {};
    u.voice = o.announcer ? this.voices.find(v => /daniel|alex|fred/i.test(v.name)) || null : this.pickVoice(o.faction);
    u.pitch = Math.min(2, fv.pitch ?? 1);
    u.rate = Math.min(2, (fv.rate ?? 1) * 1.1);
    u.volume = o.volume ?? 1;
    this.synth.speak(u);
    this.current = { priority: o.priority, until: now + VOICE_STARTUP_PAD + est / u.rate + VOICE_END_PAD };
    return true;
  }

  /** True while a line (or the announcer) is still speaking. */
  isBusy() {
    const now = performance.now() / 1000;
    return !!(this.current && now < this.current.until);
  }

  stop() {
    if (this.current?.audio) this.current.audio.pause();
    if (this.synth?.speaking || this.synth?.pending) this.synth.cancel();
    this.current = null;
  }
}

export class Sfx {
  constructor() { this.ctx = null; this.enabled = true; this.slapbackDelay = null; this.slapbackGain = null; }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
        try {
          this.slapbackDelay = this.ctx.createDelay();
          this.slapbackDelay.delayTime.value = 0.075;
          this.slapbackGain = this.ctx.createGain();
          this.slapbackGain.gain.value = 0.22;
          this.slapbackDelay.connect(this.slapbackGain);
          this.slapbackGain.connect(this.master);
        } catch {}
      }
    }
    this.ctx?.resume();
  }
  echoSlapback(gainNode) {
    if (!this.ctx || !this.enabled || !gainNode) return null;
    if (!this.slapbackDelay) {
      try {
        this.slapbackDelay = this.ctx.createDelay();
        this.slapbackDelay.delayTime.value = 0.075;
        this.slapbackGain = this.ctx.createGain();
        this.slapbackGain.gain.value = 0.25;
        this.slapbackDelay.connect(this.slapbackGain);
        if (this.master) this.slapbackGain.connect(this.master);
      } catch {}
    }
    if (this.slapbackDelay) {
      try { gainNode.connect(this.slapbackDelay); } catch {}
    }
    return this.slapbackDelay;
  }
  tone({ type = 'square', f0 = 800, f1 = 200, dur = 0.08, vol = 0.3, delay = 0, slapback = false }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    if (slapback) this.echoSlapback(g);
    o.start(t); o.stop(t + dur + (slapback ? 0.35 : 0.02));
    return g;
  }
  noise(dur = 0.4, vol = 0.5) {
    if (!this.ctx || !this.enabled) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf; g.gain.value = vol;
    s.connect(g).connect(this.master);
    s.start();
    return s;
  }
  carAlarm(dur = 2.0, vol = 0.25) {
    return null; // Cut: high-pitch alarm removed per Cherie 2026-10-16
    if (!this.ctx || !this.enabled) return null;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    // 3 Hz alternation: 880Hz / 660Hz two-tone electronic horn
    const halfPeriod = 1 / 6;
    const steps = Math.floor(dur / halfPeriod);
    for (let i = 0; i < steps; i++) {
      const t = t0 + i * halfPeriod;
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.setValueAtTime(vol, t + halfPeriod - 0.02);
      gain.gain.setValueAtTime(vol * 0.08, t + halfPeriod - 0.005);
    }
    gain.gain.setValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur);
    return { osc, gain };
  }
  footstep(surface = 'grass') {
    if (!this.ctx || !this.enabled) return;
    const isTurf = !surface || surface === 'grass' || surface === 'turf';
    if (isTurf) {
      // Muffled turf rustle (low-pass smoothed noise)
      const dur = 0.07;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let filter = 0;
      for (let i = 0; i < n; i++) {
        filter = filter * 0.78 + (Math.random() * 2 - 1) * 0.22;
        d[i] = filter * (1 - i / n) ** 2;
      }
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = buf; g.gain.value = 0.16;
      s.connect(g).connect(this.master);
      s.start();
    } else {
      // Crisp click for asphalt/concrete
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(350, t + 0.025);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.03);

      const dur = 0.02;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
      const s = this.ctx.createBufferSource(), ng = this.ctx.createGain();
      s.buffer = buf; ng.gain.value = 0.1;
      s.connect(ng).connect(this.master);
      s.start(t);
    }
  }
  shot(vol = 1) { this.tone({ f0: 900, f1: 180, dur: 0.07, vol: 0.18 * vol, slapback: true }); }
  shotgun(vol = 1) { this.noise(0.18, 0.45 * vol); this.tone({ f0: 320, f1: 60, dur: 0.14, vol: 0.35 * vol, slapback: true }); }
  sniper(vol = 1) { this.tone({ type: 'sawtooth', f0: 1600, f1: 240, dur: 0.22, vol: 0.35 * vol, slapback: true }); this.noise(0.25, 0.3 * vol); }
  smg(vol = 1) { this.tone({ f0: 1100, f1: 260, dur: 0.05, vol: 0.16 * vol, slapback: true }); }
  lmg(vol = 1) { this.tone({ type: 'sawtooth', f0: 550, f1: 110, dur: 0.11, vol: 0.24 * vol, slapback: true }); }
  pistol(vol = 1) { this.tone({ f0: 950, f1: 280, dur: 0.06, vol: 0.19 * vol, slapback: true }); }
  hitmarker() { this.tone({ type: 'square', f0: 1200, f1: 1200, dur: 0.03, vol: 0.12 }); }
  hit() { this.tone({ type: 'triangle', f0: 1200, f1: 900, dur: 0.05, vol: 0.25 }); }
  headshot() { this.tone({ type: 'square', f0: 300, f1: 1400, dur: 0.12, vol: 0.25 }); }
  kill() { this.tone({ type: 'square', f0: 523, f1: 523, dur: 0.07, vol: 0.2 }); this.tone({ type: 'square', f0: 784, f1: 784, dur: 0.1, vol: 0.2, delay: 0.07 }); }
  hurt() { this.tone({ type: 'sawtooth', f0: 220, f1: 90, dur: 0.12, vol: 0.2 }); }
  boom() { this.noise(0.6, 0.6); this.tone({ type: 'sine', f0: 120, f1: 30, dur: 0.5, vol: 0.5 }); }
  boing() { this.tone({ type: 'sine', f0: 150, f1: 600, dur: 0.25, vol: 0.3 }); }
  reload() { this.tone({ type: 'square', f0: 800, f1: 700, dur: 0.03, vol: 0.08 }); this.tone({ type: 'square', f0: 600, f1: 550, dur: 0.03, vol: 0.08, delay: 0.5 }); }
  swing() { this.tone({ type: 'triangle', f0: 400, f1: 120, dur: 0.15, vol: 0.2 }); }
  clang() { this.tone({ type: 'square', f0: 1800, f1: 1600, dur: 0.18, vol: 0.2 }); }
  warn() { this.tone({ type: 'square', f0: 880, f1: 880, dur: 0.06, vol: 0.12 }); }

  setMute(muted) {
    this.enabled = !muted;
    if (this.master) this.master.gain.value = this.enabled ? 0.35 : 0;
    if (!this.enabled) this.stopAmbience();
    return !this.enabled;
  }

  toggleMute() {
    return this.setMute(this.enabled);
  }

  startAmbience() {
    if (!this.ctx || !this.enabled || this._ambienceNodes) return;
    try {
      const now = this.ctx.currentTime;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.04, now + 2);

      // Low warm suburban pad chord (F major 7 / C)
      const freqs = [130.81, 174.61, 220.00, 261.63];
      const oscs = freqs.map(f => {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.connect(g);
        o.start(now);
        return o;
      });

      g.connect(this.master);
      this._ambienceNodes = { g, oscs };
    } catch {}
  }

  stopAmbience() {
    if (!this._ambienceNodes || !this.ctx) return;
    try {
      const { g, oscs } = this._ambienceNodes;
      const now = this.ctx.currentTime;
      g.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      setTimeout(() => {
        try { for (const o of oscs) { o.stop(); o.disconnect(); } g.disconnect(); } catch {}
      }, 900);
    } catch {}
    this._ambienceNodes = null;
  }

  victory() {
    // Joyous 4-note victory flourish: C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((f, i) => {
      this.tone({ type: 'triangle', f0: f, f1: f * 1.01, dur: 0.22, vol: 0.28, delay: i * 0.11 });
    });
  }

  defeat() {
    // Somber descending 3-note eviction: Eb4, D4, C4
    const notes = [311.13, 293.66, 261.63];
    notes.forEach((f, i) => {
      this.tone({ type: 'sawtooth', f0: f, f1: f * 0.96, dur: 0.32, vol: 0.24, delay: i * 0.16 });
    });
  }

  ping(type = 'alert') {
    return; // Cut: high-pitch alarm beeps removed per Cherie 2026-10-16
  }
}
