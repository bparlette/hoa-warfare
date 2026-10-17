// Browser half of the director: renders a Stage (stage.js) with the game's own renderer, one frame per call,
// draws captions and speech bubbles, and mixes the clip's audio offline. Driven by direct.mjs over CDP:
//   director.load(script) -> { frames, fps, duration, map }
//   director.frame()      -> base64 JPEG of the next frame (sim advanced exactly 1/fps)
//   director.finish()     -> { log, errors }
//   director.renderAudio()-> base64 WAV of every gunshot, kill ding and voice line at its scripted time
import { Renderer } from '../../web/src/engine/render.js';
import { Sfx } from '../../web/src/engine/audio.js';
import { Stage, STEP } from './stage.js';

const json = async p => (await fetch(p)).json();
const [content, weapons, manifest] = await Promise.all([json('/data/hoa_content.json'), json('/data/weapons.json'), json('/web/vo/manifest.json')]);

const view = document.getElementById('view');
const out = document.getElementById('out');
const g = out.getContext('2d');
let stage, renderer, fps, frameNo = 0;

const SFX_CALL = { ar: 'shot', smg: 'smg', shotgun: 'shotgun', sniper: 'sniper', lmg: 'lmg', pistol: 'pistol', kill: 'kill', boom: 'boom' };
const FONT = '"Arial Black", Impact, "Helvetica Neue", sans-serif';

function wrap(text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawCaption(c) {
  const W = out.width, H = out.height;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (c.style === 'subtitle') {
    g.font = `bold 44px ${FONT}`;
    const lines = wrap(c.text, W - 160);
    lines.forEach((l, i) => {
      const y = H * 0.80 + i * 56;
      g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(l, W / 2, y);
      g.fillStyle = '#fff'; g.fillText(l, W / 2, y);
    });
  } else if (c.style === 'center') {
    g.font = `bold 92px ${FONT}`;
    const lines = wrap(c.text, W - 120);
    lines.forEach((l, i) => {
      const y = H * 0.45 + (i - (lines.length - 1) / 2) * 104;
      g.lineWidth = 16; g.strokeStyle = '#000'; g.strokeText(l, W / 2, y);
      g.fillStyle = '#ffec27'; g.fillText(l, W / 2, y);
    });
  } else {
    // top: the classic white meme box
    g.font = `bold 54px ${FONT}`;
    const lines = wrap(c.text, W - 200);
    const lh = 66, h = lines.length * lh + 50, y0 = c.style === 'bottom' ? H * 0.68 : H * 0.12;
    const w = Math.min(W - 80, Math.max(...lines.map(l => g.measureText(l).width)) + 80);
    g.fillStyle = '#fff'; roundRect((W - w) / 2, y0, w, h, 26); g.fill();
    g.fillStyle = '#000';
    lines.forEach((l, i) => g.fillText(l, W / 2, y0 + 25 + lh / 2 + i * lh));
  }
}

function drawBubble(b) {
  const a = stage.sim.byId.get(b.actorId);
  const p = a && renderer.toScreen(a.pos, 2.35);
  // speaker off screen: no bubble (the subtitle still carries the line)
  if (!p || p.x < 0 || p.x > view.clientWidth || p.y < 0 || p.y > view.clientHeight) return;
  const sx = out.width / view.clientWidth, sy = out.height / view.clientHeight;
  g.font = `bold 34px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = wrap(b.text, 520);
  const w = Math.max(...lines.map(l => g.measureText(l).width)) + 44, h = lines.length * 42 + 26;
  const x = Math.max(20 + w / 2, Math.min(out.width - 20 - w / 2, p.x * sx)), y = Math.max(40, p.y * sy - h - 18);
  g.fillStyle = 'rgba(255,255,255,0.96)'; roundRect(x - w / 2, y, w, h, 18); g.fill();
  g.beginPath(); g.moveTo(x - 14, y + h); g.lineTo(x + 14, y + h); g.lineTo(Math.max(x - 40, Math.min(x + 40, p.x * sx)), y + h + 22); g.fill();
  g.fillStyle = '#111';
  lines.forEach((l, i) => g.fillText(l, x, y + 13 + 21 + i * 42));
}

window.director = {
  load(script) {
    stage = new Stage({ script, content, weapons, manifest });
    fps = stage.script.fps;
    renderer = new Renderer(view, { map: stage.sim.map, factions: content.factions });
    renderer.quality.scale = 1;
    renderer.setRetro(!!stage.script.retro);
    for (const a of stage.sim.actors) renderer.ensureCharacter(a, stage.script.localTeam ?? 0);
    out.width = view.clientWidth; out.height = view.clientHeight;
    frameNo = 0;
    return { frames: Math.round(stage.script.duration * fps), fps, duration: stage.script.duration, map: stage.sim.map.id };
  },

  frame() {
    const dt = 1 / fps;
    const target = (frameNo + 1) / fps;
    while (stage.sim.time < target - 1e-9) {
      for (const e of stage.step()) {
        const a = e.id ? stage.sim.byId.get(e.id) : null;
        if (e.type === 'shot' && a) { const col = content.factions[a.faction]?.look?.accent || '#ffec27'; renderer.tracer(e.from, e.to, col); renderer.impact(e.to, col); }
        else if (e.type === 'kill') renderer.spawnRagdoll(e.victimId, e);
        else if (e.type === 'explosion') { renderer.explosion(e.pos); renderer.debris(e.pos, 18); }
      }
    }
    frameNo++;
    const sim = stage.sim, cam = stage.camera();
    renderer.applySnapshot(sim.snapshot(), dt, { hideId: cam?.pov || null, sim, now: sim.time });
    if (cam?.pov) {
      const me = sim.byId.get(cam.pov);
      renderer.firstPerson(me, dt, { moving: Math.hypot(me.vel.x, me.vel.z) > 1 && me.onGround, firing: sim.time < me.firingUntil, reloading: me.reloadUntil > 0, meleeAgo: sim.time - me.meleeAt, alive: me.alive, shotFired: false });
    } else if (cam) {
      renderer.chase(cam.from, cam.at, 0.0001);
      renderer.camera.position.set(cam.from.x, cam.from.y, cam.from.z);
      renderer.camera.lookAt(cam.at.x, cam.at.y, cam.at.z);
    } else renderer.orbit(sim.time);
    renderer.updateGrenades(sim.grenades);
    renderer.updateObjects(sim.mode.objects, 0);
    renderer.updateHelicopters(sim.helicopters, dt);
    renderer.updateFx(dt);
    renderer.render();

    g.drawImage(view, 0, 0, out.width, out.height);
    const { captions, bubbles } = stage.overlay();
    for (const b of bubbles) drawBubble(b);
    for (const c of captions) drawCaption(c);
    return out.toDataURL('image/jpeg', 0.92).split(',')[1];
  },

  finish() { return { log: stage.log, errors: stage.errors }; },

  async renderAudio() {
    const rate = 48000, dur = stage.script.duration;
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);
    const mix = ctx.createDynamicsCompressor();
    mix.connect(ctx.destination);
    // The game's synth (Sfx) schedules at ctx.currentTime; give it a clock we control so each sound lands
    // at its event time inside one offline render.
    let clock = 0;
    const sfx = new Sfx();
    sfx.ctx = new Proxy(ctx, { get(t, p) { if (p === 'currentTime') return clock; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
    sfx.master = ctx.createGain();
    sfx.master.gain.value = 0.5;
    sfx.master.connect(mix);
    const voices = new Map();
    for (const cue of stage.audio) {
      if (cue.kind === 'voice' && !voices.has(cue.file)) {
        const buf = await (await fetch(`/web/vo/${cue.file}`)).arrayBuffer();
        voices.set(cue.file, await ctx.decodeAudioData(buf));
      }
    }
    for (const cue of stage.audio) {
      if (cue.t >= dur) continue;
      if (cue.kind === 'voice') {
        const src = ctx.createBufferSource(), gain = ctx.createGain();
        src.buffer = voices.get(cue.file); gain.gain.value = 1.15 * cue.vol;
        src.connect(gain).connect(mix);
        src.start(cue.t);
      } else if (SFX_CALL[cue.name]) {
        clock = cue.t;
        sfx[SFX_CALL[cue.name]](cue.vol);
      }
    }
    const buf = await ctx.startRendering();
    // 16-bit PCM WAV
    const n = buf.length, ch = buf.numberOfChannels, bytes = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); bytes.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVEfmt '); bytes.setUint32(16, 16, true);
    bytes.setUint16(20, 1, true); bytes.setUint16(22, ch, true); bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * ch * 2, true);
    bytes.setUint16(32, ch * 2, true); bytes.setUint16(34, 16, true); str(36, 'data'); bytes.setUint32(40, n * ch * 2, true);
    const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) bytes.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
    let bin = '';
    const u8 = new Uint8Array(bytes.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(bin);
  },
};
