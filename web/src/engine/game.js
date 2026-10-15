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

const PAUSE_HINT = { mouse: 'Click to keep fighting for the block.', pad: 'Press START or A to resume · VIEW to quit', touch: 'Tap anywhere to resume.' };

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FIXED = 1 / 60;
const KILLCAM_SEC = 3, KILLCAM_HOLD = 1.3;

const [content, weaponsData] = await Promise.all(['../data/hoa_content.json', '../data/weapons.json'].map(async u => (await fetch(u)).json()));
const factions = content.factions;
const phase0 = Object.keys(factions).filter(id => factions[id].phase0);

export const STYLES = {
  modern: { id: 'modern', name: 'MODERN TACTICAL MODE', cls: 'style-modern', retro: false },
  '007': { id: '007', name: 'GOLDENEYE 007 MODE', cls: 'style-007', retro: true },
  cctv: { id: 'cctv', name: 'RING CAM CCTV SURVEILLANCE', cls: 'style-cctv', retro: false },
  vhs: { id: 'vhs', name: '1993 VHS EVIDENCE TAPE', cls: 'style-vhs', retro: true },
  noir: { id: 'noir', name: 'SUBPOENA NOIR MODE', cls: 'style-noir', retro: false },
  gameboy: { id: 'gameboy', name: 'GAME BOY 1989 DMG-01', cls: 'style-gameboy', retro: true },
};
const STYLE_KEYS = Object.keys(STYLES);

function getInitialStyle() {
  const p = params.get('style');
  if (p && STYLES[p]) return p;
  if (params.get('007') === '1') return '007';
  if (params.get('cctv') === '1') return 'cctv';
  if (params.get('vhs') === '1') return 'vhs';
  if (params.get('noir') === '1') return 'noir';
  if (params.get('gameboy') === '1') return 'gameboy';
  return 'modern';
}

const state = {
  faction: params.get('faction') && factions[params.get('faction')] ? params.get('faction') : 'karens',
  script: params.get('script') === 'steam' ? 'steam' : 'clean',
  legalSafe: params.get('legal') !== '0',
  retro: params.get('retro') !== '0',
  style: getInitialStyle(),
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

function init007Meters() {
  const hpMeter = $('geHpMeter');
  const armorMeter = $('geArmorMeter');
  if (hpMeter && !hpMeter.children.length) {
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.className = 'ge-seg on';
      hpMeter.appendChild(seg);
    }
  }
  if (armorMeter && !armorMeter.children.length) {
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.className = 'ge-seg on';
      armorMeter.appendChild(seg);
    }
  }
}

function applyStyle(styleKey) {
  if (!STYLES[styleKey]) styleKey = 'modern';
  state.style = styleKey;
  for (const s of Object.values(STYLES)) {
    document.body.classList.remove(s.cls);
  }
  const cur = STYLES[styleKey];
  document.body.classList.add(cur.cls);
  if (styleKey === '007') init007Meters();
  renderer.setRetro(cur.retro || state.retro);
  if ($('optStyle')) $('optStyle').value = styleKey;
  if ($('opt007')) $('opt007').checked = (styleKey === '007');
}

function cycleStyle() {
  const nextIdx = (STYLE_KEYS.indexOf(state.style) + 1) % STYLE_KEYS.length;
  const nextKey = STYLE_KEYS[nextIdx];
  applyStyle(nextKey);
  if (game) game.showBanner(STYLES[nextKey].name);
}
applyStyle(state.style);

// ------------------------------------------------------------------ menu

function buildMenu() {
  const box = $('factions');
  box.innerHTML = '';
  for (const id of phase0) {
    const f = factions[id];
    const el = document.createElement('div');
    el.className = 'fc' + (id === state.faction ? ' sel' : '');
    el.innerHTML = `<div class="sw"><i style="background:${f.look.shirt}"></i><i style="background:${f.look.pants}"></i><i style="background:${f.look.accent}"></i></div><b>${f.name}</b><span>${f.tagline}</span>`;
    el.onclick = () => { state.faction = id; buildMenu(); };
    box.appendChild(el);
  }
  $('optSteam').checked = state.script === 'steam';
  $('optLegal').checked = state.legalSafe;
  $('optRetro').checked = state.retro;
  if ($('optStyle')) $('optStyle').value = state.style;
  if ($('opt007')) $('opt007').checked = state.style === '007';
  $('optVoice').checked = state.voice;
  $('optMode').innerHTML = Object.values(MODES).map(M => `<option value="${M.id}"${M.id === state.mode ? ' selected' : ''}>${M.label} (${M.parent})</option>`).join('');
}
$('optMode').onchange = e => { state.mode = e.target.value; };
if ($('optStyle')) $('optStyle').onchange = e => { applyStyle(e.target.value); };
$('optSteam').onchange = e => { state.script = e.target.checked ? 'steam' : 'clean'; };
$('optLegal').onchange = e => { state.legalSafe = e.target.checked; };
$('optRetro').onchange = e => { state.retro = e.target.checked; renderer.setRetro(state.retro); };
if ($('opt007')) $('opt007').onchange = e => { applyStyle(e.target.checked ? '007' : 'modern'); };
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
    this.sim = new Sim({ rules: content.rules, weapons: weaponsData, rng: this.rng, map: renderer.map, mode: state.mode });
    this.barks = new BarkSystem({ library: this.library, content, rng: this.rng, sim: this.sim });
    this.limiter = new AudioLimiter(content.rules.audioLimiter);
    voice.enabled = state.voice;

    const names = [...content.playerNames].sort(() => this.rng() - 0.5);
    const pickFaction = () => phase0[Math.floor(this.rng() * phase0.length)];
    this.me = this.sim.addActor({ id: 'you', name: 'You', team: 0, faction: state.faction, isBot: state.spectate });
    for (let i = 0; i < 11; i++) {
      const team = i < 5 ? 0 : 1;
      this.sim.addActor({ id: 'b' + i, name: names[i], team, faction: pickFaction(), isBot: true });
    }
    for (const a of this.sim.actors) renderer.ensureCharacter(a, 0);

    this.frames = [];
    this.killcam = null;
    this.bubbles = [];
    this.subs = [];
    this.feed = [];
    this.hearing = { priority: -1, until: 0 };
    this.banner = { until: 0 };
    this.realTime = 0;
    this.lastLoiterBeep = 0;
    this.radar = $('radar') ? new Radar($('radar')) : null;
    this.sim.start();
    this.handle(this.sim.drainEvents());
  }

  dispose() {
    for (const c of renderer.characters.values()) renderer.scene.remove(c.root);
    renderer.characters.clear();
    for (const r of renderer.ragdolls) r.dispose();
    renderer.ragdolls = [];
    for (const f of renderer.fx) renderer.scene.remove(f.obj);
    renderer.fx = [];
    if (renderer.casings) {
      for (const c of renderer.casings) {
        renderer.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
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
    const showPause = paused && !this.killcam && $('menu').classList.contains('hidden');
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

    if (this.killcam) this.updateKillcam(dt);
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
    renderer.updateFx(dt);
    renderer.render();
    this.updateHud();
  }

  handle(evs) {
    const sim = this.sim, me = this.me, now = sim.time;
    const out = this.barks.process(evs, now, me.id);
    const live = !this.killcam;
    for (const e of evs) {
      const a = e.id ? sim.byId.get(e.id) : null;
      switch (e.type) {
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
            this.hitmark(e.head ? '★' : '✕', !!e.head);
            sfx.hitmarker();
            if (e.head) sfx.headshot();
          }
          break;
        }
        case 'hurt':
          if (e.id === me.id) { this.flashVignette(); sfx.hurt(); }
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
        case 'matchEnd': setTimeout(() => this.showEnd(), 2500); break;
      }
    }
    for (const k of out.kills) this.addFeed(k);
    for (const b of out.barks) this.onBark(b, now);
    if (out.killcam) this.startKillcam(out.killcam, evs.find(e => e.type === 'kill' && e.victimId === me.id));
  }

  onBark(b, now) {
    const me = this.me;
    const speaker = this.sim.byId.get(b.speakerId);
    // Visual bubble for anything on screen; audio goes through the listener-side limiter.
    this.addBubble(speaker, b);
    if (b.isFatalToListener) return; // played isolated at the end of the killcam instead
    const listener = { id: me.id, team: me.team, position: me.pos };
    const verdict = this.limiter.evaluate({ ...b, position: b.position }, listener, now);
    if (!verdict.play) return;
    const started = voice.say({ text: b.text, lineId: b.lineId, faction: b.faction, priority: b.priority, volume: verdict.volume, force: verdict.channel === 'self' });
    if (started) this.hearing = { priority: b.priority, until: now + b.duration };
    this.addSub(b, verdict.channel);
  }

  // -------------------------------------------------------------- killcam

  startKillcam(kc, killEv) {
    const deathT = this.sim.time;
    this.killcam = { ...kc, deathT, t: 0, frames: this.frames.filter(f => f.t >= deathT - KILLCAM_SEC && f.t <= deathT), killEv, spoke: false, shotIdx: 0 };
    if (kc.selfKill || !this.killcam.frames.length) {
      this.killcam = null;
      this.showBanner('YOU PLAYED YOURSELF', kc.line?.text || '');
      if (kc.line) voice.say({ text: kc.line.text, lineId: kc.line.id, faction: this.me.faction, priority: 9, force: true });
      return;
    }
    for (const c of renderer.characters.values()) c.root.visible = false;
    const killer = this.sim.byId.get(kc.killerId);
    $('killcam').classList.remove('hidden');
    $('kcWho').textContent = `${killer.name} · ${factions[killer.faction].name}${kc.headshot ? ' · HEADSHOT' : kc.melee ? ' · PARTICIPATION TROPHY' : ''}`;
    $('kcLine').textContent = '';
  }

  updateKillcam(dt) {
    const kc = this.killcam;
    kc.t += dt;
    const pt = Math.min(kc.deathT, kc.deathT - KILLCAM_SEC + kc.t);
    let frame = kc.frames[0];
    for (const f of kc.frames) { if (f.t <= pt) frame = f; else break; }
    renderer.applySnapshot(frame.snap, dt, {});
    while (kc.shotIdx < kc.frames.length && kc.frames[kc.shotIdx].t <= pt) {
      for (const s of kc.frames[kc.shotIdx].shots) {
        const col = factions[this.sim.byId.get(s.id).faction].look.accent;
        renderer.tracer(s.from, s.to, col);
        renderer.impact(s.to, col);
      }
      kc.shotIdx++;
    }
    const ks = frame.snap.find(s => s.id === kc.killerId), vs = frame.snap.find(s => s.id === kc.victimId);
    if (ks && vs) renderer.chase(ks, vs.alive ? vs : kc.killEv?.victimPos || vs);
    if (kc.t >= KILLCAM_SEC && !kc.spoke) {
      kc.spoke = true;
      if (kc.killEv) renderer.spawnRagdoll(kc.victimId, kc.killEv);
      if (kc.line) {
        $('kcLine').textContent = `"${kc.line.text}"`;
        voice.say({ text: kc.line.text, lineId: kc.line.id, faction: this.sim.byId.get(kc.killerId).faction, priority: 10, force: true });
        this.addSub({ text: kc.line.text, lineId: kc.line.id, name: this.sim.byId.get(kc.killerId).name, faction: this.sim.byId.get(kc.killerId).faction }, 'killcam');
      }
    }
    if (kc.t >= KILLCAM_SEC + KILLCAM_HOLD) {
      this.killcam = null;
      $('killcam').classList.add('hidden');
    }
  }

  // -------------------------------------------------------------- HUD

  showBanner(text, small = '') {
    $('banner').innerHTML = `${text}${small ? `<small>${small}</small>` : ''}`;
    $('banner').classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => $('banner').classList.remove('on'), 1800);
  }

  hitmark(word, isHeadshot = false) {
    const h = $('hitmark');
    if (!h) return;
    const isHead = isHeadshot || word === '★' || word === 'BONK!';
    h.textContent = isHead ? '★' : '✕';
    h.style.color = isHead ? '#ffd700' : '#ff004d';
    h.style.textShadow = isHead
      ? '0 0 10px #ffec27, 2px 2px 0 #000, -2px -2px 0 #000'
      : '0 0 8px #ff004d, 2px 2px 0 #000, -2px -2px 0 #000';
    h.style.webkitTextStroke = '1.5px #000';
    h.style.fontSize = isHead ? '34px' : '28px';
    h.style.fontFamily = 'Impact, "Arial Black", sans-serif';
    h.style.fontWeight = '900';
    h.style.position = 'absolute';
    h.style.left = '50%';
    h.style.top = '50%';
    h.style.pointerEvents = 'none';
    h.style.zIndex = '50';
    h.style.letterSpacing = '0';
    h.style.animation = 'none';
    h.classList.remove('on');
    void h.offsetWidth;
    h.classList.add('on');
    if (h.animate) {
      if (this._hitmarkAnim) this._hitmarkAnim.cancel();
      this._hitmarkAnim = h.animate([
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1.45)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0.95, offset: 0.55 },
        { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 0 }
      ], {
        duration: 220,
        fill: 'forwards',
        easing: 'cubic-bezier(0.12, 0.9, 0.25, 1)'
      });
    }
  }

  flashVignette() {
    const v = $('vignette');
    v.style.transition = 'none'; v.style.opacity = 0.7; void v.offsetWidth;
    v.style.transition = 'opacity .5s'; v.style.opacity = 0;
  }

  addFeed(k) {
    const sim = this.sim, me = this.me;
    const cls = a => (a === me ? 'me' : a.team === me.team ? 'ally' : 'enemy');
    const v = sim.byId.get(k.victimId), kr = k.killerId ? sim.byId.get(k.killerId) : null;
    const tags = [k.firstBlood && 'FIRST BLOOD', k.headshot && 'HEADSHOT', k.melee && 'TROPHY', k.explosive && 'LAWSUIT', k.revenge && 'REVENGE', k.shutdown && 'SHUTDOWN', k.rapid >= 4 ? 'RAMPAGE' : k.rapid === 3 ? 'TRIPLE' : k.rapid === 2 ? 'DOUBLE' : null].filter(Boolean);
    const el = document.createElement('div');
    el.className = 'k';
    el.innerHTML = kr
      ? `<span class="${cls(kr)}">${kr.name}</span> ${weaponsData.weapons[k.weaponId]?.feedIcon || '🔫'} <span class="${cls(v)}">${v.name}</span>${tags.length ? `<span class="tagx">${tags.join(' · ')}</span>` : ''}`
      : `<span class="${cls(v)}">${v.name}</span> played themselves`;
    $('feed').prepend(el);
    while ($('feed').children.length > 6) $('feed').lastChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  addSub(b, channel) {
    const el = document.createElement('div');
    el.className = 's';
    const f = factions[b.faction]?.name || '';
    el.innerHTML = `<b style="color:${factions[b.faction]?.look.accent || '#fff'}">${b.name}</b> (${f}): ${b.text}<i>${b.lineId}${channel && channel !== 'world' ? ' · ' + channel : ''}</i>`;
    $('subs').appendChild(el);
    while ($('subs').children.length > 4) $('subs').firstChild.remove();
    setTimeout(() => el.remove(), 4500);
  }

  addBubble(speaker, b) {
    const old = this.bubbles.find(x => x.id === speaker.id);
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = document.createElement('div');
    el.className = `bubble ${speaker.team === this.me.team ? 'ally' : 'enemy'}${b.priority >= 6 ? ' hot' : ''}`;
    el.innerHTML = `<b>${speaker.name}</b>${b.text}`;
    $('bubbles').appendChild(el);
    this.bubbles.push({ id: speaker.id, el, until: this.realTime + Math.max(1.8, b.duration + 0.8), pos: b.position, alive: speaker.alive });
  }

  updateHud() {
    const sim = this.sim, me = this.me;
    $('hud').classList.remove('hidden');
    $('s0').textContent = sim.score[0];
    $('s1').textContent = sim.score[1];
    const left = Math.max(0, sim.timeLimit - sim.time);
    $('clock').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    $('hpfill').style.width = `${me.alive ? me.hp : 0}%`;
    $('hpfill').style.background = me.hp < 25 ? '#ff004d' : me.hp < 60 ? '#ffa300' : '#00e436';
    const W = me.weapons;
    const activeW = (W && W[me.activeSlot]) || W.primary;
    $('wname').textContent = `${activeW.name}${me.activeSlot === 'secondary' ? ' [SECONDARY]' : ''}`;
    $('ammo').textContent = me.reloadUntil > 0 ? 'RELOADING' : `${me.ammo} / ${activeW.mag}`;
    $('nades').textContent = `${W.equipment ? `${W.equipment.name} x${me.grenades} [G]` : ''}${W.melee ? ` · ${W.melee.name.replace('The ', '')} [F]` : ''} · [Q/1/2] Swap`;
    const mh = sim.mode.hud(me);
    $('modes').innerHTML = `${sim.mode.constructor.label} · first to ${sim.scoreLimit}${mh ? `<br>${mh}` : ''}<br>${state.script === 'steam' ? 'STEAM script' : 'CLEAN script'} · legal-safe ${this.library.legalSafe ? 'ON' : 'OFF'} · ${renderer.retro ? '16-bit' : 'clean render'}${state.style007 ? ' · 007 GoldenEye' : ''}${voice.enabled ? '' : ' · muted'}`;
    $('crosshair').style.display = me.alive && !this.killcam && !state.spectate ? '' : 'none';

    if (state.style007) {
      const hp = me.alive ? me.hp : 0;
      const sanity = me.campState?.secondsLeft != null ? (me.campState.secondsLeft / 5) * 100 : 100;
      this.update007Meters(hp, 100, Math.min(100, sanity));
    }

    const cs = me.campState;
    const warn = me.alive && cs.state === 'warning';
    $('loiter').classList.toggle('hidden', !warn);
    if (warn) {
      $('loiterT').textContent = Math.ceil(cs.secondsLeft);
      if (this.realTime - this.lastLoiterBeep > 1) { this.lastLoiterBeep = this.realTime; sfx.warn(); }
    }
    if (!me.alive && !this.killcam) this.showRespawn();
    if (this.radar) this.radar.render(sim, me, state.spectate);

    // speech bubbles follow their speaker (or stay where a dead speaker fell)
    this.bubbles = this.bubbles.filter(bb => {
      if (this.realTime > bb.until) { bb.el.remove(); return false; }
      const a = sim.byId.get(bb.id);
      const p = a.alive ? a.pos : bb.pos;
      const far = Math.hypot(p.x - renderer.camera.position.x, p.z - renderer.camera.position.z) > 45;
      const s = (bb.id === me.id && !me.isBot) || this.killcam || far ? null : renderer.toScreen(p, 2.35);
      bb.el.style.display = s ? '' : 'none';
      bb.screen = s;
      return true;
    });
    // stack overlapping bubbles upward (nearest speaker keeps its spot)
    const placed = [];
    for (const bb of this.bubbles.filter(b => b.screen).sort((a, b) => b.screen.y - a.screen.y)) {
      let { x, y } = bb.screen;
      const h = bb.el.offsetHeight + 4, w = bb.el.offsetWidth;
      for (let moved = true; moved;) {
        moved = false;
        for (const p of placed) if (Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < Math.max(p.h, h)) { y = p.y - p.h; moved = true; }
      }
      placed.push({ x, y, w, h });
      bb.el.style.left = `${x}px`; bb.el.style.top = `${y}px`;
    }
    $('board').classList.toggle('hidden', !input.scoreboard);
    if (input.scoreboard) this.renderBoard($('board'));
  }

  update007Meters(hp, maxHp = 100, armor = 100, maxArmor = 100) {
    const hpMeter = $('geHpMeter');
    const armorMeter = $('geArmorMeter');
    if (!hpMeter || !armorMeter) return;
    const hpCount = Math.max(0, Math.min(10, Math.ceil((hp / maxHp) * 10)));
    const armorCount = Math.max(0, Math.min(10, Math.ceil((armor / maxArmor) * 10)));
    for (let i = 0; i < 10; i++) {
      if (hpMeter.children[i]) hpMeter.children[i].classList.toggle('on', i < hpCount);
      if (armorMeter.children[i]) armorMeter.children[i].classList.toggle('on', i < armorCount);
    }
  }

  showRespawn() {
    const t = Math.max(0, this.me.respawnAt - this.sim.time);
    if (t > 0 && !$('banner').classList.contains('on')) this.showBanner('EVICTED', `Respawning in ${t.toFixed(1)}s`);
  }

  renderBoard(el) {
    const rows = [...this.sim.actors].sort((a, b) => a.team - b.team || b.kills - a.kills);
    el.innerHTML = `<table><tr><th>Player</th><th>Faction</th><th>K</th><th>D</th></tr>${rows.map(a =>
      `<tr class="t${a.team}${a === this.me ? ' me' : ''}"><td>${a.name}</td><td>${factions[a.faction].name}</td><td>${a.kills}</td><td>${a.deaths}</td></tr>`).join('')}</table>`;
  }

  showEnd() {
    document.exitPointerLock?.();
    const sim = this.sim, me = this.me;
    const sorted = [...sim.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const mvp = sorted[0], worst = sorted[sorted.length - 1];
    const mvpLines = this.library.getLines(mvp.faction, 'rampage');
    const mvpLine = mvpLines.length ? mvpLines[Math.floor(this.rng() * mvpLines.length)].text : '';
    const won = sim.winner === me.team, draw = sim.winner === null;
    $('endPanel').innerHTML = `<h1>${draw ? 'DRAW' : won ? 'BLOCK SECURED' : 'EVICTED'}<small>${sim.score[0]} - ${sim.score[1]}</small></h1>
      <div class="podium">
        <div class="mvp"><b>MVP: ${mvp.name}</b><br>${factions[mvp.faction].name} · ${mvp.kills}-${mvp.deaths}<q>${mvpLine}</q></div>
        <div><b>Bottom fragger: ${worst.name}</b><br>${factions[worst.faction].name}<q>${worst.name} went ${worst.kills}-and-${worst.deaths}. Participation trophy's in the mail.</q></div>
      </div>
      <div id="endBoard" style="margin-top:12px"></div>
      <button id="again">RUN IT BACK</button> <button id="endMenu">MENU</button>`;
    this.renderBoard($('endBoard'));
    $('end').classList.remove('hidden');
    $('again').onclick = () => startGame();
    $('endMenu').onclick = () => toMenu();
    voice.say({ text: `MVP: ${mvp.name}. ${mvpLine}`, priority: 9, force: true, announcer: true });
  }
}

// ------------------------------------------------------------------ input

const canvas = $('view');
const input = new Controls({ canvas, touchRoot: $('touch') });
const lock = () => input.lock();
canvas.addEventListener('click', () => { if (game && !game.sim.over && !state.spectate) lock(); sfx.unlock(); });
$('pause').addEventListener('click', e => { if (e.target.id !== 'toMenu') lock(); });
document.addEventListener('keydown', e => {
  if (e.code === 'KeyO' || e.code === 'Digit0') cycleStyle();
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
    if (step) { const i = phase0.indexOf(state.faction); state.faction = phase0[(i + step + phase0.length) % phase0.length]; buildMenu(); }
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
  const factionName = factions[state.faction]?.name || 'Karens';
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

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  input.pollPad();
  if (gunbarrel && gunbarrel.active) gunbarrel.update(dt);
  if (game) game.update(dt);
  else if (params.get('lineup') === '1') return;
  else { renderer.orbit(t / 1000); renderer.updateFx(dt); renderer.render(); }
  requestAnimationFrame(frame);
}
// ?lineup=1 : all 12 factions side by side for checking silhouettes (no match)
function showLineup() {
  $('menu').classList.add('hidden');
  const ids = Object.keys(factions);
  ids.forEach((f, i) => {
    const c = renderer.ensureCharacter({ id: 'lineup' + i, name: f, team: 0, faction: f }, 1);
    c.update({ x: (i - (ids.length - 1) / 2) * 1.05, y: 0, z: 8, yaw: Math.PI, pitch: 0, speed: 0, alive: true, onGround: true }, 0.016);
  });
  renderer.camera.position.set(0, 1.3, 12.6);
  renderer.camera.lookAt(0, 1.0, 8);
  renderer.viewmodel.visible = false;
  const loop = () => { renderer.render(); requestAnimationFrame(loop); };
  loop();
}
buildMenu();
if (params.get('lineup') === '1') showLineup();
else if (params.get('autostart') === '1' || state.spectate) startGame();
requestAnimationFrame(frame);
window.__hoa = { get game() { return game; }, renderer, state, input };
