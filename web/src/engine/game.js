// Web slice entry point: menu -> 6v6 Cul-de-Sac Clash vs bots, first-person, retro render.
// URL params: ?seed=N  ?faction=karens  ?script=steam  ?legal=0  ?retro=0  ?voice=0
//             ?autostart=1 (skip menu)  ?spectate=1 (you are a bot; chase cam; for demos/screenshots)
import { ContentLibrary } from '../core/content.js';
import { AudioLimiter } from '../core/audioLimiter.js';
import { mulberry32 } from '../core/rng.js';
import { Sim } from './sim.js';
import { MODES } from './modes.js';
import { BarkSystem } from './barks.js';
import { Renderer } from './render.js';
import { Voice, Sfx } from './audio.js';
import { buildCulDeSac } from './map.js';
import { Radar } from './radar.js';
import { GunbarrelIntro } from './gunbarrel.js';
import { Controls, aimAssist } from './controls.js';
import { PerfOverlay } from './perf.js';
import { STYLES, getInitialStyle, applyStyle, cycleStyle } from './styles.js';
import { Hud } from './hud.js';

export { STYLES };

const PAUSE_HINT = { mouse: 'Click to keep fighting for the block.', pad: 'Press START or A to resume · VIEW to quit', touch: 'Tap anywhere to resume.' };

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FIXED = 1 / 60;
const KILLCAM_SEC = 3.2;

const [content, weaponsData] = await Promise.all(['../data/hoa_content.json', '../data/weapons.json'].map(async u => (await fetch(u)).json()));
const factions = content.factions;
const shippingFactions = Object.keys(factions).filter(id => !factions[id].status || factions[id].status !== 'draft');

const state = {
  faction: params.get('faction') && factions[params.get('faction')] ? params.get('faction') : 'karens',
  script: params.get('script') === 'steam' ? 'steam' : 'clean',
  legalSafe: params.get('legal') !== '0',
  retro: params.get('retro') !== '0',
  style: getInitialStyle(params),
  get style007() { return this.style === '007'; },
  set style007(v) { this.style = v ? '007' : 'modern'; },
  voice: params.get('voice') !== '0',
  spectate: params.get('spectate') === '1',
  mode: MODES[params.get('mode')] ? params.get('mode') : 'clash',
};

const renderer = new Renderer($('view'), { map: buildCulDeSac(), factions });
renderer.setRetro(state.retro);
const voice = new Voice({ factions });
const sfx = new Sfx();
let game = null;

const gunbarrel = $('gunbarrel') ? new GunbarrelIntro($('gunbarrel'), sfx) : null;
if (gunbarrel) {
  $('gunbarrel').addEventListener('click', () => gunbarrel.stop());
  window.addEventListener('keydown', e => {
    if (gunbarrel.active && (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter')) {
      gunbarrel.stop();
    }
  });
}

applyStyle(state.style, state, renderer, $);

// ------------------------------------------------------------------ menu

let menuPage = 0;
const FACTIONS_PER_PAGE = 8;

function buildMenu() {
  const box = $('factions');
  const pag = $('factionPagination');
  if (!box) return;

  const totalPages = Math.ceil(shippingFactions.length / FACTIONS_PER_PAGE);
  const curIdx = shippingFactions.indexOf(state.faction);
  if (curIdx >= 0) {
    menuPage = Math.floor(curIdx / FACTIONS_PER_PAGE);
  }
  menuPage = Math.max(0, Math.min(totalPages - 1, menuPage));

  function renderPage() {
    box.innerHTML = '';
    const startIdx = menuPage * FACTIONS_PER_PAGE;
    const pageFactions = shippingFactions.slice(startIdx, startIdx + FACTIONS_PER_PAGE);
    for (const id of pageFactions) {
      const f = factions[id];
      const el = document.createElement('div');
      el.className = 'fc' + (id === state.faction ? ' sel' : '');
      el.innerHTML = `<div class="sw"><i style="background:${f.look.shirt}"></i><i style="background:${f.look.pants}"></i><i style="background:${f.look.accent}"></i></div><b>${f.name}</b><span>${f.tagline}</span>`;
      el.onclick = () => { state.faction = id; buildMenu(); };
      box.appendChild(el);
    }
    if (pag) {
      const start = startIdx + 1;
      const end = Math.min(shippingFactions.length, (menuPage + 1) * FACTIONS_PER_PAGE);
      pag.innerHTML = `
        <button type="button" class="page-btn" id="fcPrev" ${menuPage === 0 ? 'disabled' : ''} aria-label="Previous factions">◀ Prev</button>
        <span>${start}–${end} of ${shippingFactions.length}</span>
        <button type="button" class="page-btn" id="fcNext" ${menuPage >= totalPages - 1 ? 'disabled' : ''} aria-label="Next factions">Next ▶</button>
      `;
      const prevBtn = $('fcPrev');
      const nextBtn = $('fcNext');
      if (prevBtn) prevBtn.onclick = (e) => { e.stopPropagation(); if (menuPage > 0) { menuPage--; renderPage(); } };
      if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); if (menuPage < totalPages - 1) { menuPage++; renderPage(); } };
    }
  }

  renderPage();

  $('optSteam').checked = state.script === 'steam';
  $('optLegal').checked = state.legalSafe;
  $('optRetro').checked = state.retro;
  if ($('optStyle')) $('optStyle').value = state.style;
  if ($('opt007')) $('opt007').checked = state.style === '007';
  $('optVoice').checked = state.voice;
  $('optMode').innerHTML = Object.values(MODES).map(M => `<option value="${M.id}"${M.id === state.mode ? ' selected' : ''}>${M.label} (${M.parent})</option>`).join('');
}
$('optMode').onchange = e => { state.mode = e.target.value; };
if ($('optStyle')) $('optStyle').onchange = e => { applyStyle(e.target.value, state, renderer, $); };
$('optSteam').onchange = e => { state.script = e.target.checked ? 'steam' : 'clean'; };
$('optLegal').onchange = e => { state.legalSafe = e.target.checked; };
$('optRetro').onchange = e => { state.retro = e.target.checked; renderer.setRetro(state.retro); };
if ($('opt007')) $('opt007').onchange = e => { applyStyle(e.target.checked ? '007' : 'modern', state, renderer, $); };
$('optVoice').onchange = e => { state.voice = e.target.checked; };
$('deploy').onclick = () => startGame();
$('toMenu').onclick = () => toMenu();

function toMenu() {
  if (game) game.dispose();
  game = null;
  document.exitPointerLock?.();
  for (const id of ['hud', 'pause', 'end']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  buildMenu();
}

// ------------------------------------------------------------------ game

class Game {
  constructor() {
    const seed = Number(params.get('seed')) || (Date.now() % 100000);
    this.rng = mulberry32(seed);
    this.library = new ContentLibrary(content, { script: state.script, legalSafe: state.legalSafe });
    this.sim = new Sim({ rules: content.rules, weapons: weaponsData, rng: this.rng, map: renderer.map, mode: state.mode, botDifficulty: params.get('bots') || 'normal' });
    this.barks = new BarkSystem({ library: this.library, content, rng: this.rng, sim: this.sim });
    this.limiter = new AudioLimiter(content.rules.audioLimiter);
    this.hud = new Hud({ $, factions, weaponsData });
    voice.enabled = state.voice;

    const names = [...content.playerNames].sort(() => this.rng() - 0.5);
    const pickFaction = () => shippingFactions[Math.floor(this.rng() * shippingFactions.length)];
    this.me = this.sim.addActor({ id: 'you', name: 'You', team: 0, faction: state.faction, isBot: state.spectate });
    for (let i = 0; i < 11; i++) {
      const team = i < 5 ? 0 : 1;
      this.sim.addActor({ id: 'b' + i, name: names[i], team, faction: pickFaction(), isBot: true });
    }
    for (const a of this.sim.actors) renderer.ensureCharacter(a, 0);

    this.frames = [];
    this.hearing = { priority: -1, until: 0 };
    this.realTime = 0;
    this.radar = $('radar') ? new Radar($('radar')) : null;
    this.meFiredThisStep = false;
    this.sim.start();
    this.handle(this.sim.drainEvents());
  }

  showBanner(text, small = '') { this.hud.showBanner(text, small); }

  dispose() {
    this.hud.reset();
    for (const c of renderer.characters.values()) renderer.scene.remove(c.root);
    renderer.characters.clear();
    for (const r of renderer.ragdolls) r.dispose();
    renderer.ragdolls = [];
    for (const f of renderer.fx) renderer.scene.remove(f.obj);
    renderer.fx = [];
    if (renderer.casings) {
      for (const c of renderer.casings) {
        renderer.scene.remove(c.mesh);
        c.mesh.material.dispose();
      }
      renderer.casings = [];
    }
    renderer.updateGrenades([]);
    renderer.updateObjects([], 0);
    $('bubbles').innerHTML = ''; $('feed').innerHTML = ''; $('subs').innerHTML = '';
    voice.stop();
  }

  // -------------------------------------------------------------- per-frame

  update(dt) {
    this.realTime += dt;
    const sim = this.sim;
    const paused = !state.spectate && !input.engaged && !sim.over;
    const showPause = paused && !this.hud.killcam && $('menu').classList.contains('hidden');
    $('pause').classList.toggle('hidden', !showPause);
    if (showPause) $('pauseHint').textContent = PAUSE_HINT[input.device];
    document.body.classList.toggle('touch-mode', input.device === 'touch');
    if (!paused) {
      if (!this.me.isBot) {
        const assist = input.device === 'mouse' ? { slow: 1, onTarget: false } : aimAssist(sim, this.me);
        input.assist = assist.slow;
        input.onTarget = assist.onTarget;
        input.apply(this.me, dt);
      }
      this.acc = Math.min((this.acc || 0) + dt, FIXED * 5);
      while (this.acc >= FIXED) {
        this.acc -= FIXED;
        sim.step(FIXED);
        const evs = sim.drainEvents();
        this.frames.push({ t: sim.time, snap: sim.snapshot(), shots: evs.filter(e => e.type === 'shot') });
        while (this.frames.length && this.frames[0].t < sim.time - KILLCAM_SEC - 1) this.frames.shift();
        this.handle(evs);
      }
    }

    const ann = this.barks.updateAnnouncer(sim.time, sim.time < this.hearing.until ? this.hearing.priority : -1);
    if (ann) { voice.say({ text: ann, priority: 9, force: true, announcer: true }); this.showBanner(ann); }

    if (this.hud.killcam) this.hud.updateKillcam(dt, sim, renderer, voice);
    else {
      renderer.applySnapshot(sim.snapshot(), dt, { hideId: this.me.isBot ? null : this.me.id, sim, now: sim.time });
      const me = this.me;
      if (state.spectate) {
        const t = this.me.brain?.target;
        if (me.alive) renderer.chase(me.pos, t?.alive ? t.pos : { x: me.pos.x - Math.sin(me.yaw) * 10, y: me.pos.y, z: me.pos.z - Math.cos(me.yaw) * 10 });
        else renderer.orbit(sim.time);
      } else if (me.alive) {
        renderer.firstPerson(me, dt, {
          moving: Math.hypot(me.vel.x, me.vel.z) > 1 && me.onGround, firing: sim.time < me.firingUntil,
          reloading: me.reloadUntil > 0, meleeAgo: sim.time - me.meleeAt, alive: true,
          shotFired: this.meFiredThisStep,
        });
        this.meFiredThisStep = false;
      } else {
        renderer.chase({ x: me.pos.x, y: me.pos.y + 4, z: me.pos.z + 3 }, me.pos, 4);
      }
    }
    renderer.updateGrenades(sim.grenades);
    renderer.updateObjects(sim.mode.objects, this.me.team);
    renderer.updateHelicopters(sim.helicopters, dt);
    renderer.updateFx(dt);
    renderer.render();
    this.hud.update({ sim, me: this.me, state, renderer, input, voice, sfx, library: this.library, radar: this.radar, realTime: this.realTime });
  }

  handle(evs) {
    const sim = this.sim, me = this.me, now = sim.time;
    const out = this.barks.process(evs, now, me.id);
    const live = !this.hud.killcam;
    for (const e of evs) {
      const a = e.id ? sim.byId.get(e.id) : null;
      switch (e.type) {
        case 'heloShot': {
          const col = '#ffec27';
          if (live) { renderer.tracer(e.from, e.to, col); renderer.impact(e.to, col); }
          const d = Math.hypot(e.from.x - me.pos.x, e.from.z - me.pos.z);
          if (d < 50) sfx.shot(0.7 * (1 - d / 50));
          break;
        }
        case 'streakDestroyed': {
          if (live) {
            renderer.explosion(e.pos);
            renderer.debris(e.pos, 18);
          }
          break;
        }
        case 'shot': {
          const col = factions[a.faction].look.accent;
          if (live) { renderer.tracer(e.from, e.to, col); renderer.impact(e.to, col); }
          const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z);
          const wdef = weaponsData.weapons[e.weaponId];
          const playShot = () => {
            if (wdef?.class === 'shotgun') sfx.shotgun();
            else if (wdef?.class === 'sniper') sfx.sniper();
            else if (wdef?.class === 'smg') sfx.smg();
            else if (wdef?.class === 'lmg') sfx.lmg();
            else if (wdef?.class === 'pistol') sfx.pistol();
            else sfx.shot(1);
          };
          if (a === me) {
            playShot();
            this.meFiredThisStep = true;
          } else if (d < 40) sfx.shot(0.6 * (1 - d / 40));
          if (a === me && e.hitId && sim.byId.get(e.hitId).team !== me.team) {
            this.hud.hitmark(e.head ? '★' : '✕', !!e.head);
            sfx.hitmarker();
            if (e.head) sfx.headshot();
          }
          break;
        }
        case 'hurt':
          if (e.id === me.id) { this.hud.flashVignette(); sfx.hurt(); }
          break;
        case 'kill': {
          if (live) renderer.spawnRagdoll(e.victimId, e);
          else renderer.splat(e.victimPos, '#ff004d', 1.1);
          if (e.killerId === me.id) { sfx.kill(); this.showBanner(e.headshot ? 'HEADSHOT' : e.melee ? 'TROPHY KILL' : '+1 EVICTION'); }
          break;
        }
        case 'explosion': if (live) renderer.explosion(e.pos); sfx.boom(); break;
        case 'boing': if (a === me || Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) < 20) sfx.boing(); break;
        case 'reload': if (a === me) sfx.reload(); break;
        case 'swing': if (a === me) sfx.swing(); break;
        case 'switchWeapon':
          if (a === me) {
            sfx.reload();
            const w = me.weapons[e.slot];
            if (w?.viewmodel && renderer.setWeapon) renderer.setWeapon(w.viewmodel);
          }
          break;
        case 'campingSnitch': this.showBanner(a === me ? 'YOU SNITCHED ON YOURSELF' : `${a.name} snitched on themselves`, a === me ? 'Enemies can see you for 6s. Move!' : ''); break;
        case 'receiptConfirmed': if (a === me) { sfx.kill(); this.showBanner('RECEIPT CONFIRMED', `${e.victimName} has been processed`); } break;
        case 'receiptDenied': if (a === me) { sfx.reload(); this.showBanner('RETURN DENIED', `saved ${e.victimName}'s receipt`); } break;
        case 'hardpointRotated': this.showBanner('NEW LAWN ACTIVE', e.name); break;
        case 'matchEnd':
          setTimeout(() => this.hud.showEnd({
            sim, me, library: this.library, rng: this.rng,
            onAgain: () => startGame(), onMenu: () => toMenu(), voice,
          }), 2500);
          break;
      }
    }
    for (const k of out.kills) this.hud.addFeed(k, sim, me);
    for (const b of out.barks) this.onBark(b, now);
    if (out.killcam) this.hud.startKillcam(out.killcam, evs.find(e => e.type === 'kill' && e.victimId === me.id), sim, renderer, this.frames, voice);
  }

  onBark(b, now) {
    const me = this.me;
    const speaker = this.sim.byId.get(b.speakerId);
    this.hud.addBubble(speaker, b, me, this.realTime);
    if (b.isFatalToListener) return;
    const listener = { id: me.id, team: me.team, position: me.pos };
    const verdict = this.limiter.evaluate({ ...b, position: b.position }, listener, now);
    if (!verdict.play) return;
    const started = voice.say({ text: b.text, lineId: b.lineId, faction: b.faction, priority: b.priority, volume: verdict.volume, force: verdict.channel === 'self' });
    if (started) this.hearing = { priority: b.priority, until: now + b.duration };
    this.hud.addSub(b, verdict.channel);
  }
}

// ------------------------------------------------------------------ input

const canvas = $('view');
const input = new Controls({ canvas, touchRoot: $('touch') });
const lock = () => input.lock();
canvas.addEventListener('click', () => { if (game && !game.sim.over && !state.spectate) lock(); sfx.unlock(); });
$('pause').addEventListener('click', e => { if (e.target.id !== 'toMenu') lock(); });
document.addEventListener('keydown', e => {
  if (e.code === 'KeyO' || e.code === 'Digit0') cycleStyle(state, renderer, $, name => { if (game) game.showBanner(name); });
  if (!game) return;
  if (e.code === 'KeyP') { state.retro = !state.retro; renderer.setRetro(state.retro); }
  if (e.code === 'KeyM') { voice.enabled = !voice.enabled; if (!voice.enabled) voice.stop(); }
  if (e.code === 'BracketLeft') { state.script = state.script === 'steam' ? 'clean' : 'steam'; game.library.setScript(state.script); game.showBanner(state.script === 'steam' ? 'STEAM SCRIPT' : 'CLEAN SCRIPT'); }
  if (e.code === 'BracketRight') { state.legalSafe = !state.legalSafe; game.library.setLegalSafe(state.legalSafe); game.showBanner(`LEGAL-SAFE ${state.legalSafe ? 'ON' : 'OFF'}`); }
});

// Controller navigation outside gameplay: menu (A deploy, LB/RB or D-pad faction), pause (START resume,
// VIEW quit), end screen (A run it back, B menu). In-game START pauses.
input.onPadPress = pr => {
  sfx.unlock();
  const menuOpen = !$('menu').classList.contains('hidden');
  const endOpen = !$('end').classList.contains('hidden');
  if (menuOpen) {
    const step = (pr.RB || pr.RIGHT ? 1 : 0) - (pr.LB || pr.LEFT ? 1 : 0);
    if (step) {
      const i = shippingFactions.indexOf(state.faction);
      state.faction = shippingFactions[(i + step + shippingFactions.length) % shippingFactions.length];
      buildMenu();
    }
    if (pr.A || pr.START) startGame();
  } else if (endOpen) {
    if (pr.A) startGame();
    if (pr.B) toMenu();
  } else if (game) {
    if (pr.START) input.userPaused = !input.userPaused;
    else if (input.userPaused && pr.VIEW) toMenu();
    else if (input.userPaused && pr.A) input.userPaused = false;
  }
};
window.addEventListener('resize', () => renderer.resize());

function setupShortRecorder() {
  const header = document.createElement('div');
  header.className = 'short-top-header';
  header.innerHTML = `
    <div class="short-badge">🔴 CUL-DE-SAC WARFARE</div>
    <div class="short-title">WHEN AN HOA BOARD MEMBER SNAPS 💀</div>
    <div class="short-sub">Call of Karen: HOA Warfare</div>
  `;
  document.body.appendChild(header);

  const footer = document.createElement('div');
  footer.className = 'short-bottom-tag';
  footer.innerHTML = `🔥 CALL OF KAREN: HOA WARFARE #shorts #gaming`;
  document.body.appendChild(footer);

  try {
    const stream = renderer.canvas.captureStream(60);
    const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const buf = await blob.arrayBuffer();
      await fetch('/api/save_clip', { method: 'POST', body: buf });
      window.__RECORDING_DONE = true;
      console.log('__SHORT_RECORDING_DONE__');
    };
    rec.start();
    const durSec = Number(params.get('dur')) || 15;
    setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, durSec * 1000);
  } catch (err) {
    console.error('Short recording error:', err);
  }
}

function startGame() {
  if (game) game.dispose();
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  sfx.unlock();
  input.resetLook(0);
  input.userPaused = false;
  if (input.device === 'touch') { document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); }
  game = new Game();
  if (params.get('short') === '1' && !window.__shortStarted) {
    window.__shortStarted = true;
    setupShortRecorder();
  }
  if (state.style007 && gunbarrel && !window.__introPlayed && params.get('short') !== '1') {
    window.__introPlayed = true;
    gunbarrel.start(() => {
      if (!state.spectate) lock();
    });
  } else {
    if (!state.spectate) lock();
  }
}

// ------------------------------------------------------------------ loop

const perf = params.get('perf') === '1' ? new PerfOverlay(renderer) : null;
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  input.pollPad();
  renderer.adapt(dt);
  perf?.update(dt);
  if (gunbarrel && gunbarrel.active) gunbarrel.update(dt);
  if (game) game.update(dt);
  else if (params.get('lineup') === '1') return;
  else { renderer.orbit(t / 1000); renderer.updateFx(dt); renderer.render(); }
  requestAnimationFrame(frame);
}

// ?lineup=1 : all factions side by side for checking silhouettes (no match)
function showLineup() {
  $('menu').classList.add('hidden');
  const ids = Object.keys(factions);
  const rows = [ids.filter(f => factions[f].status !== 'draft'), ids.filter(f => factions[f].status === 'draft')];
  rows.forEach((row, r) => row.forEach((f, i) => {
    const c = renderer.ensureCharacter({ id: 'lineup' + f, name: f, team: 0, faction: f }, 1);
    c.update({ x: (i - (row.length - 1) / 2) * 1.05, y: 0, z: 8 - r * 2.4, yaw: Math.PI, pitch: 0, speed: 0, alive: true, onGround: true }, 0.016);
  }));
  renderer.camera.position.set(0, 4.2, 14.2);
  renderer.camera.lookAt(0, 0.9, 6.8);
  renderer.viewmodel.visible = false;
  const loop = () => { renderer.render(); requestAnimationFrame(loop); };
  loop();
}

buildMenu();
if (params.get('lineup') === '1') showLineup();
else if (params.get('autostart') === '1' || state.spectate) startGame();
requestAnimationFrame(frame);
window.__hoa = { get game() { return game; }, renderer, state, input };
