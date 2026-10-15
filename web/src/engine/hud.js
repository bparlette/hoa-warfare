// HUD, feed, killcam, scoreboard, and UI overlays for Call of Karen: HOA Warfare.

const KILLCAM_SEC = 3.2;
const KILLCAM_HOLD = 1.6;

export class Hud {
  constructor({ $, factions, weaponsData }) {
    this.$ = $ || (id => document.getElementById(id));
    this.factions = factions;
    this.weaponsData = weaponsData;
    this.bubbles = [];
    this.bannerT = null;
    this.killcam = null;
    this._hitmarkAnim = null;
    this.lastLoiterBeep = 0;
  }

  showBanner(text, small = '') {
    const $ = this.$;
    const el = $('banner');
    if (!el) return;
    el.innerHTML = `${text}${small ? `<small>${small}</small>` : ''}`;
    el.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => el.classList.remove('on'), 1800);
  }

  hitmark(word, isHeadshot = false) {
    const h = this.$('hitmark');
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
    const v = this.$('vignette');
    if (!v) return;
    v.style.transition = 'none';
    v.style.opacity = 0.7;
    void v.offsetWidth;
    v.style.transition = 'opacity .5s';
    v.style.opacity = 0;
  }

  addFeed(k, sim, me) {
    const $ = this.$;
    const feed = $('feed');
    if (!feed) return;
    const cls = a => (a === me ? 'me' : a.team === me.team ? 'ally' : 'enemy');
    const v = sim.byId.get(k.victimId), kr = k.killerId ? sim.byId.get(k.killerId) : null;
    const tags = [
      k.firstBlood && 'FIRST BLOOD',
      k.headshot && 'HEADSHOT',
      k.melee && 'TROPHY',
      k.explosive && 'LAWSUIT',
      k.revenge && 'REVENGE',
      k.shutdown && 'SHUTDOWN',
      k.rapid >= 4 ? 'RAMPAGE' : k.rapid === 3 ? 'TRIPLE' : k.rapid === 2 ? 'DOUBLE' : null,
    ].filter(Boolean);
    const el = document.createElement('div');
    el.className = 'k';
    const icon = this.weaponsData.weapons[k.weaponId]?.feedIcon || '🔫';
    el.innerHTML = kr
      ? `<span class="${cls(kr)}">${kr.name}</span> ${icon} <span class="${cls(v)}">${v.name}</span>${tags.length ? `<span class="tagx">${tags.join(' · ')}</span>` : ''}`
      : `<span class="${cls(v)}">${v.name}</span> played themselves`;
    feed.prepend(el);
    while (feed.children.length > 6) feed.lastChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  addSub(b, channel) {
    const $ = this.$;
    const subs = $('subs');
    if (!subs) return;
    const el = document.createElement('div');
    el.className = 's';
    const f = this.factions[b.faction]?.name || '';
    const col = this.factions[b.faction]?.look.accent || '#fff';
    el.innerHTML = `<b style="color:${col}">${b.name}</b> (${f}): ${b.text}<i>${b.lineId}${channel && channel !== 'world' ? ' · ' + channel : ''}</i>`;
    subs.appendChild(el);
    while (subs.children.length > 4) subs.firstChild.remove();
    setTimeout(() => el.remove(), 4500);
  }

  addBubble(speaker, b, me, realTime) {
    const $ = this.$;
    const old = this.bubbles.find(x => x.id === speaker.id);
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = document.createElement('div');
    el.className = `bubble ${speaker.team === me.team ? 'ally' : 'enemy'}${b.priority >= 6 ? ' hot' : ''}`;
    el.innerHTML = `<b>${speaker.name}</b>${b.text}`;
    $('bubbles').appendChild(el);
    this.bubbles.push({ id: speaker.id, el, until: realTime + Math.max(1.8, b.duration + 0.8), pos: b.position, alive: speaker.alive });
  }

  startKillcam(kc, killEv, sim, renderer, frames, voice) {
    const $ = this.$;
    const deathT = sim.time;
    this.killcam = {
      ...kc, deathT, t: 0,
      frames: frames.filter(f => f.t >= deathT - KILLCAM_SEC && f.t <= deathT),
      killEv, spoke: false, shotIdx: 0,
    };
    if (kc.selfKill || !this.killcam.frames.length) {
      this.killcam = null;
      this.showBanner('YOU PLAYED YOURSELF', kc.line?.text || '');
      if (kc.line) voice.say({ text: kc.line.text, lineId: kc.line.id, faction: sim.actors.find(a => a.id === kc.victimId)?.faction, priority: 9, force: true });
      return;
    }
    for (const c of renderer.characters.values()) c.root.visible = false;
    const killer = sim.byId.get(kc.killerId);
    $('killcam').classList.remove('hidden');
    $('kcWho').textContent = `${killer.name} · ${this.factions[killer.faction].name}${kc.headshot ? ' · HEADSHOT' : kc.melee ? ' · PARTICIPATION TROPHY' : ''}`;
    $('kcLine').textContent = '';
  }

  updateKillcam(dt, sim, renderer, voice) {
    const $ = this.$;
    const kc = this.killcam;
    if (!kc) return;
    kc.t += dt;
    const pt = Math.min(kc.deathT, kc.deathT - KILLCAM_SEC + kc.t);
    let frame = kc.frames[0];
    for (const f of kc.frames) { if (f.t <= pt) frame = f; else break; }
    renderer.applySnapshot(frame.snap, dt, {});
    while (kc.shotIdx < kc.frames.length && kc.frames[kc.shotIdx].t <= pt) {
      for (const s of kc.frames[kc.shotIdx].shots) {
        const col = this.factions[sim.byId.get(s.id).faction].look.accent;
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
        voice.say({ text: kc.line.text, lineId: kc.line.id, faction: sim.byId.get(kc.killerId).faction, priority: 10, force: true });
        this.addSub({ text: kc.line.text, lineId: kc.line.id, name: sim.byId.get(kc.killerId).name, faction: sim.byId.get(kc.killerId).faction }, 'killcam');
      }
    }
    if (kc.t >= KILLCAM_SEC + KILLCAM_HOLD) {
      this.killcam = null;
      $('killcam').classList.add('hidden');
    }
  }

  update007Meters(hp, maxHp = 100, armor = 100, maxArmor = 100) {
    const $ = this.$;
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

  showRespawn(me, sim) {
    const t = Math.max(0, me.respawnAt - sim.time);
    if (t > 0 && !this.$('banner').classList.contains('on')) {
      this.showBanner('EVICTED', `Respawning in ${t.toFixed(1)}s`);
    }
  }

  renderBoard(el, sim, me) {
    const rows = [...sim.actors].sort((a, b) => a.team - b.team || b.kills - a.kills);
    el.innerHTML = `<table><tr><th>Player</th><th>Faction</th><th>K</th><th>D</th></tr>${rows.map(a =>
      `<tr class="t${a.team}${a === me ? ' me' : ''}"><td>${a.name}</td><td>${this.factions[a.faction].name}</td><td>${a.kills}</td><td>${a.deaths}</td></tr>`).join('')}</table>`;
  }

  showEnd({ sim, me, library, rng, onAgain, onMenu, voice }) {
    const $ = this.$;
    document.exitPointerLock?.();
    const sorted = [...sim.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const mvp = sorted[0], worst = sorted[sorted.length - 1];
    const mvpLines = library.getLines(mvp.faction, 'rampage');
    const mvpLine = mvpLines.length ? mvpLines[Math.floor(rng() * mvpLines.length)].text : '';
    const won = sim.winner === me.team, draw = sim.winner === null;
    $('endPanel').innerHTML = `<h1>${draw ? 'DRAW' : won ? 'BLOCK SECURED' : 'EVICTED'}<small>${sim.score[0]} - ${sim.score[1]}</small></h1>
      <div class="podium">
        <div class="mvp"><b>MVP: ${mvp.name}</b><br>${this.factions[mvp.faction].name} · ${mvp.kills}-${mvp.deaths}<q>${mvpLine}</q></div>
        <div><b>Bottom fragger: ${worst.name}</b><br>${this.factions[worst.faction].name}<q>${worst.name} went ${worst.kills}-and-${worst.deaths}. Participation trophy's in the mail.</q></div>
      </div>
      <div id="endBoard" style="margin-top:12px"></div>
      <button id="again">RUN IT BACK</button> <button id="endMenu">MENU</button>`;
    this.renderBoard($('endBoard'), sim, me);
    $('end').classList.remove('hidden');
    $('again').onclick = () => onAgain();
    $('endMenu').onclick = () => onMenu();
    voice.say({ text: `MVP: ${mvp.name}. ${mvpLine}`, priority: 9, force: true, announcer: true });
  }

  update({ sim, me, state, renderer, input, voice, sfx, library, radar, realTime }) {
    const $ = this.$;
    $('hud').classList.remove('hidden');
    $('s0').textContent = sim.score[0];
    const modeClock = sim.mode?.clock?.();
    const left = Math.max(0, modeClock != null ? modeClock : sim.timeLimit - sim.time);
    $('clock').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    $('hpfill').style.width = `${me.alive ? me.hp : 0}%`;
    $('hpfill').style.background = me.hp < 25 ? '#ff004d' : me.hp < 60 ? '#ffa300' : '#00e436';
    const W = me.weapons;
    const activeW = (W && W[me.activeSlot]) || W.primary;
    $('wname').textContent = `${activeW.name}${me.activeSlot === 'secondary' ? ' [SECONDARY]' : ''}`;
    $('ammo').textContent = me.reloadUntil > 0 ? 'RELOADING' : `${me.ammo} / ${activeW.mag}`;
    $('nades').textContent = `${W.equipment ? `${W.equipment.name} x${me.grenades} [G]` : ''}${W.melee ? ` · ${W.melee.name.replace('The ', '')} [F]` : ''} · [Q/1/2] Swap`;
    const mh = sim.mode.hud(me);
    $('modes').innerHTML = `${sim.mode.constructor.label} · first to ${sim.scoreLimit}${mh ? `<br>${mh}` : ''}<br>${state.script === 'steam' ? 'STEAM script' : 'CLEAN script'} · legal-safe ${library.legalSafe ? 'ON' : 'OFF'} · ${renderer.retro ? '16-bit' : 'clean render'}${state.style007 ? ' · 007 GoldenEye' : ''}${voice.enabled ? '' : ' · muted'}`;
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
      if (realTime - this.lastLoiterBeep > 1) { this.lastLoiterBeep = realTime; sfx.warn(); }
    }
    if (!me.alive && !this.killcam) this.showRespawn(me, sim);
    if (radar) radar.render(sim, me, state.spectate);

    // speech bubbles follow their speaker (or stay where a dead speaker fell)
    this.bubbles = this.bubbles.filter(bb => {
      if (realTime > bb.until) { bb.el.remove(); return false; }
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
    if (input.scoreboard) this.renderBoard($('board'), sim, me);
  }

  reset() {
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
    this.killcam = null;
    clearTimeout(this.bannerT);
  }
}
