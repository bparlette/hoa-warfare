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
  oldMoney: ['Daniel', 'Albert'],
  emoKids: ['Whisper', 'Alex'],
};
const FEMALE = /samantha|victoria|karen|moira|tessa|fiona|kathy|princess|allison|ava|susan|zira|female|serena|kate/i;

export class Voice {
  constructor({ factions }) {
    this.factions = factions;
    this.enabled = true;
    this.manifest = new Set();
    this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    this.voices = [];
    this.current = null; // {priority, until, audio?}
    if (this.synth) {
      const load = () => { this.voices = this.synth.getVoices().filter(v => /^en/i.test(v.lang)); };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
    fetch('vo/manifest.json').then(r => (r.ok ? r.json() : [])).then(ids => { this.manifest = new Set(ids); }).catch(() => {});
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
      const audio = new Audio(`vo/${o.lineId.replace(/\./g, '_')}.ogg`);
      audio.volume = o.volume ?? 1;
      audio.play().catch(() => {});
      this.current = { priority: o.priority, until: now + est, audio };
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
    this.current = { priority: o.priority, until: now + est / u.rate };
    return true;
  }

  stop() {
    if (this.current?.audio) this.current.audio.pause();
    if (this.synth?.speaking || this.synth?.pending) this.synth.cancel();
    this.current = null;
  }
}

export class Sfx {
  constructor() { this.ctx = null; this.enabled = true; }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination); }
    }
    this.ctx?.resume();
  }
  tone({ type = 'square', f0 = 800, f1 = 200, dur = 0.08, vol = 0.3, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
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
  }
  shot(vol = 1) { this.tone({ f0: 900, f1: 180, dur: 0.07, vol: 0.18 * vol }); }
  shotgun() { this.noise(0.18, 0.45); this.tone({ f0: 320, f1: 60, dur: 0.14, vol: 0.35 }); }
  sniper() { this.tone({ type: 'sawtooth', f0: 1600, f1: 240, dur: 0.22, vol: 0.35 }); this.noise(0.25, 0.3); }
  smg() { this.tone({ f0: 1100, f1: 260, dur: 0.05, vol: 0.16 }); }
  lmg() { this.tone({ type: 'sawtooth', f0: 550, f1: 110, dur: 0.11, vol: 0.24 }); }
  pistol() { this.tone({ f0: 950, f1: 280, dur: 0.06, vol: 0.19 }); }
  hitmarker() { this.tone({ type: 'square', f0: 2400, f1: 2400, dur: 0.03, vol: 0.18 }); }
  hit() { this.tone({ type: 'triangle', f0: 1200, f1: 900, dur: 0.05, vol: 0.25 }); }
  headshot() { this.tone({ type: 'square', f0: 300, f1: 1400, dur: 0.12, vol: 0.25 }); }
  kill() { this.tone({ type: 'square', f0: 523, f1: 523, dur: 0.07, vol: 0.2 }); this.tone({ type: 'square', f0: 784, f1: 784, dur: 0.1, vol: 0.2, delay: 0.07 }); }
  hurt() { this.tone({ type: 'sawtooth', f0: 220, f1: 90, dur: 0.12, vol: 0.2 }); }
  boom() { this.noise(0.6, 0.6); this.tone({ type: 'sine', f0: 120, f1: 30, dur: 0.5, vol: 0.5 }); }
  boing() { this.tone({ type: 'sine', f0: 150, f1: 600, dur: 0.25, vol: 0.3 }); }
  reload() { this.tone({ type: 'square', f0: 2000, f1: 1800, dur: 0.03, vol: 0.1 }); this.tone({ type: 'square', f0: 1500, f1: 1400, dur: 0.03, vol: 0.1, delay: 0.5 }); }
  swing() { this.tone({ type: 'triangle', f0: 400, f1: 120, dur: 0.15, vol: 0.2 }); }
  clang() { this.tone({ type: 'square', f0: 1800, f1: 1600, dur: 0.18, vol: 0.2 }); }
  warn() { this.tone({ type: 'square', f0: 880, f1: 880, dur: 0.06, vol: 0.12 }); }
}
