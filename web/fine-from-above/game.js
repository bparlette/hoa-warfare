/* FINE FROM ABOVE — HOA enforcement drone, AC-130 "Death From Above" parody.
   Top-down thermal gun-cam over a suburban cul-de-sac. Find HOA violations
   glowing hot, click/tap to drop a FINE on them. 60-second round.
   ?auto=1 (or ?bot=1) = bot plays for video capture. No dependencies. */
(function () {
'use strict';

var cv = document.getElementById('cv');
var ctx = cv.getContext('2d');
var W = 540, H = 960;
var Q = new URLSearchParams(location.search);
var BOT = Q.has('auto') || Q.has('bot');

function fit() {
  var s = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = (W * s) + 'px';
  cv.style.height = (H * s) + 'px';
}
addEventListener('resize', fit); fit();

var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/* ---------------- audio: tiny synthesized radio / fire / stamp ---------------- */
var AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume().catch(function () {});
  return AC;
}
function beep(f0, f1, dur, type, vol) {
  var ac = audio(); if (!ac) return;
  var o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f0, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ac.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur + 0.02);
}
function thud() {
  var ac = audio(); if (!ac) return;
  var o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(110, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.18);
  g.gain.setValueAtTime(0.22, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.22);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.25);
}
function radioClick() { beep(1400, 900, 0.05, 'square', 0.05); }
function fireSfx() { beep(900, 220, 0.12, 'sawtooth', 0.07); }
function stampSfx() { thud(); beep(300, 90, 0.1, 'square', 0.06); }

/* ---------------- plots: 6 houses around the cul-de-sac ----------------
   house rect (hx,hy,hw,hh), lawn rect (lx,ly,lw,lh), driveway rect (dx,dy,dw,dh) */
var ROAD = { x: 270, y: 740, r: 145 };
var PLOTS = [
  { hx: 40,  hy: 110, hw: 100, hh: 75,  lx: 28,  ly: 200, lw: 124, lh: 84,  dx: 78,  dy: 284, dw: 30, dh: 120 },
  { hx: 220, hy: 80,  hw: 100, hh: 75,  lx: 208, ly: 170, lw: 124, lh: 84,  dx: 255, dy: 254, dw: 30, dh: 130 },
  { hx: 400, hy: 110, hw: 100, hh: 75,  lx: 388, ly: 200, lw: 124, lh: 84,  dx: 432, dy: 284, dw: 30, dh: 120 },
  { hx: 30,  hy: 380, hw: 100, hh: 75,  lx: 18,  ly: 470, lw: 124, lh: 84,  dx: 68,  dy: 554, dw: 30, dh: 60 },
  { hx: 410, hy: 380, hw: 100, hh: 75,  lx: 398, ly: 470, lw: 124, lh: 84,  dx: 442, dy: 554, dw: 30, dh: 60 },
  { hx: 220, hy: 872, hw: 100, hh: 70,  lx: 208, ly: 788, lw: 124, lh: 70,  dx: 255, dy: 858, dw: 30, dh: 14 },
];
/* ambient parked cars (not violations) */
var PARKED = [
  { x: 190, y: 700, a: 0.4 }, { x: 350, y: 780, a: -0.3 }, { x: 270, y: 640, a: 1.2 },
];
/* trees */
var TREES = [];
(function () {
  var spots = [[10, 60], [530, 60], [10, 300], [530, 300], [150, 640], [390, 640], [60, 880], [480, 880], [270, 40]];
  for (var i = 0; i < spots.length; i++) TREES.push({ x: spots[i][0] + rnd(-8, 8), y: spots[i][1] + rnd(-8, 8), r: rnd(16, 26) });
})();

/* ---------------- violation types ---------------- */
var VTYPES = {
  lawn:  { label: 'UNMOWED LAWN',      fine: 50 },
  trash: { label: 'TRASH CANS OUT',    fine: 75 },
  car:   { label: 'CAR ON GRASS',      fine: 150 },
  xmas:  { label: 'XMAS LIGHTS (OCT)', fine: 100 },
  rv:    { label: 'RV IN DRIVEWAY',    fine: 200 },
  dog:   { label: 'DOG OFF LEASH',     fine: 125 },
  weeds: { label: 'WEEDS IN DRIVEWAY', fine: 40 },
  pool:  { label: 'UNPERMITTED POOL',  fine: 300 },
};
var SPAWN_KEYS = ['lawn', 'trash', 'car', 'xmas', 'rv', 'dog', 'weeds', 'pool'];

/* ---------------- chatter ---------------- */
var CHATTER_INTRO = [
  'HOA Actual, this is Drone 1. On station.',
  'Copy Drone 1. Fines free. I repeat, FINES FREE.',
  'Covenant enforcement is a go. Light \'em up.',
];
var CHATTER_FINE = [
  'Fine issued. Violation cited.',
  'Splash one. Target cited.',
  'That is gonna leave a mark on their HOA record.',
  'Copy. Citation delivered.',
  'Another one for the ledger.',
  'Direct hit. The covenants hold.',
];
var CHATTER_TYPE = {
  trash: 'Trash cans at the curb on a Tuesday. Bold.',
  car: 'Vehicle on the grass. That is a paddlin\'.',
  xmas: 'Christmas lights in October. It is not even Halloween.',
  lawn: 'That lawn has not been mowed since the Bush administration.',
  rv: 'RV in the driveway. Section 4, paragraph 2.',
  dog: 'Unleashed dog. Repeat, unleashed dog.',
  weeds: 'Weeds in the driveway. The audacity.',
  pool: 'Unpermitted pool. Somebody is getting a letter.',
};
var CHATTER_COMBO = [
  'They are stacking violations like cordwood!',
  'This neighborhood is a gold mine.',
  'Keep it coming, Drone 1.',
  'HOA Actual is smiling right now.',
];
var CHATTER_AMBIENT = [
  'Scanning sector 7. Lawns look... mostly compliant.',
  'Drone 1, be advised: the Hendersons painted their door teal.',
  'Noted. Teal is a tier-3 offense. Stand by.',
  'Covenant section 9: no boats visible from the street.',
  'Copy that. Eyes on the boats.',
  'Reminder: fines double after the third offense.',
  'Beautiful night for enforcement.',
];
var CHATTER_TIME = [
  '30 seconds. Make them count.',
  '10 seconds. Light \'em up.',
];
var CHATTER_END = [
  'Round complete. Returning to HOA Actual.',
  'Outstanding work. The covenants are safe tonight.',
];

/* ---------------- state ---------------- */
var state = 'title'; // title | play | over
var targets = [];    // active violations
var tracers = [];    // fine projectiles
var stamps = [];     // CITED stamps
var popups = [];     // floating +$ texts
var log = [];        // chatter log {text, born, shown}
var elapsed = 0, timeLeft = 60, ROUND = 60;
var fines = 0, collected = 0, combo = 0, comboT = 0, bestCombo = 0;
var spawnT = 0, ambientT = 8, said30 = false, said10 = false;
var ret = { x: W / 2, y: H / 2 };       // reticle
var fireCD = 0, whiteHot = true;
var shake = 0, flash = 0;
var titleT = 0, overT = 0;
var noiseCv = null;

function say(text) {
  radioClick();
  log.push({ text: text, born: perfT, shown: 0 });
  if (log.length > 4) log.shift();
}
function ambientChatter() { say(pick(CHATTER_AMBIENT)); }

/* ---------------- spawning ---------------- */
function plotAnchor(p, kind) {
  // anchor point + radius for a violation of given kind on plot p
  switch (kind) {
    case 'lawn':  return { x: p.lx + p.lw / 2, y: p.ly + p.lh / 2, r: 34 };
    case 'trash': return { x: p.lx + p.lw - 12, y: p.ly + p.lh + 6, r: 26 };
    case 'car':   return { x: p.lx + 30, y: p.ly + p.lh / 2, r: 34 };
    case 'xmas':  return { x: p.hx + p.hw / 2, y: p.hy + p.hh / 2, r: 44 };
    case 'rv':    return { x: p.dx + p.dw / 2, y: p.dy + p.dh / 2 + 20, r: 36 };
    case 'dog':   return { x: p.lx + p.lw / 2, y: p.ly + p.lh / 2, r: 24 };
    case 'weeds': return { x: p.dx + p.dw / 2, y: p.dy + p.dh - 8, r: 24 };
    case 'pool':  return { x: p.lx + p.lw - 30, y: p.ly + 24, r: 30 };
  }
  return { x: p.lx, y: p.ly, r: 30 };
}
function spawnViolation(forceKind) {
  if (targets.length >= 10) return;
  var kind = forceKind || pick(SPAWN_KEYS);
  // find a plot without this kind active
  var options = [];
  for (var i = 0; i < PLOTS.length; i++) {
    var taken = false;
    for (var j = 0; j < targets.length; j++) {
      if (targets[j].plot === i && targets[j].kind === kind) { taken = true; break; }
    }
    if (!taken) options.push(i);
  }
  if (!options.length) return;
  var pi = pick(options);
  var a = plotAnchor(PLOTS[pi], kind);
  targets.push({
    kind: kind, plot: pi, x: a.x, y: a.y, r: a.r,
    born: perfT, cited: false, citeT: 0,
    wx: rnd(0, TAU), // wander phase (dog)
    label: VTYPES[kind].label, fine: VTYPES[kind].fine,
  });
}
function startRound() {
  state = 'play';
  targets = []; tracers = []; stamps = []; popups = []; log = [];
  elapsed = 0; timeLeft = ROUND;
  fines = 0; collected = 0; combo = 0; comboT = 0; bestCombo = 0;
  spawnT = 0; ambientT = 7; said30 = false; said10 = false;
  fireCD = 0; shake = 0; flash = 0;
  spawnViolation('lawn'); spawnViolation('trash'); spawnViolation('car'); spawnViolation('xmas');
  var i = 0;
  (function intro() {
    if (i < CHATTER_INTRO.length && state === 'play') { say(CHATTER_INTRO[i]); i++; setTimeout(intro, 1400); }
  })();
}

/* ---------------- firing ---------------- */
function fireAt(x, y) {
  if (state !== 'play' || fireCD > 0) return;
  fireCD = 0.35;
  fireSfx();
  // find target under point
  var hit = null, best = 1e9;
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (t.cited) continue;
    var d = Math.hypot(t.x - x, t.y - y);
    if (d < t.r + 14 && d < best) { best = d; hit = t; }
  }
  var sx = ret.x, sy = ret.y - 40;
  tracers.push({ x0: sx, y0: sy, x1: x, y1: y, t: 0, dur: 0.22, hit: hit });
  if (hit) {
    setTimeout(function () { cite(hit); }, 230);
  } else {
    setTimeout(function () { if (state === 'play') say(pick(['Negative. No violation there.', 'That lawn is compliant. Stand by.', 'Clean miss. Recalibrating.'])); }, 300);
  }
}
function cite(t) {
  if (t.cited || state !== 'play') return;
  t.cited = true; t.citeT = 0;
  fines++;
  combo++; comboT = 3; if (combo > bestCombo) bestCombo = combo;
  var bonus = (combo - 1) * 25;
  var amount = t.fine + bonus;
  collected += amount;
  stampSfx();
  shake = Math.min(6, 2 + combo * 0.5); flash = 0.35;
  stamps.push({ x: t.x, y: t.y, t: 0, rot: rnd(-0.25, 0.25) });
  popups.push({ x: t.x, y: t.y - 30, text: '+$' + amount, t: 0, col: '#ff5a5a' });
  say(pick(CHATTER_FINE));
  if (CHATTER_TYPE[t.kind] && Math.random() < 0.6) {
    (function (k) { setTimeout(function () { if (state === 'play') say(CHATTER_TYPE[k]); }, 900); })(t.kind);
  }
  if (combo >= 3 && combo % 3 === 0) {
    (function () { setTimeout(function () { if (state === 'play') say(pick(CHATTER_COMBO)); }, 1600); })();
    popups.push({ x: W / 2, y: H * 0.35, text: 'x' + combo + ' COMBO', t: 0, col: '#ffd34d', big: true });
  }
}

/* ---------------- input ---------------- */
function toGame(e) {
  var r = cv.getBoundingClientRect();
  var cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
  var cy = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
  return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
}
cv.addEventListener('pointermove', function (e) { var p = toGame(e); ret.x = p.x; ret.y = p.y; });
cv.addEventListener('pointerdown', function (e) {
  e.preventDefault(); audio();
  var p = toGame(e); ret.x = p.x; ret.y = p.y;
  if (state === 'title') { startRound(); return; }
  if (state === 'over' && overT > 1.2) { startRound(); return; }
  fireAt(p.x, p.y);
});
addEventListener('keydown', function (e) {
  if (e.key === 'h' || e.key === 'H') whiteHot = !whiteHot;
  if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') startRound();
});

/* ---------------- update ---------------- */
var perfT = 0, lastTs = 0;
function update(dt) {
  perfT += dt;
  if (state === 'title') { titleT += dt; if (BOT) startRound(); return; }
  if (state === 'over') {
    overT += dt;
    for (var i = stamps.length - 1; i >= 0; i--) { stamps[i].t += dt; }
    if (BOT && overT > 4) startRound();
    return;
  }
  // play
  elapsed += dt; timeLeft = Math.max(0, ROUND - elapsed);
  fireCD = Math.max(0, fireCD - dt);
  shake = Math.max(0, shake - dt * 14);
  flash = Math.max(0, flash - dt * 2.2);

  if (timeLeft <= 30 && !said30) { said30 = true; say(CHATTER_TIME[0]); }
  if (timeLeft <= 10 && !said10) { said10 = true; say(CHATTER_TIME[1]); }
  if (timeLeft <= 0) {
    state = 'over'; overT = 0;
    say(CHATTER_END[0]);
    setTimeout(function () { say(CHATTER_END[1]); }, 1500);
    beep(520, 180, 0.7, 'sawtooth', 0.08);
    return;
  }

  // escalating spawns
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = Math.max(1.2, 4 - elapsed * 0.05);
    spawnViolation();
  }
  ambientT -= dt;
  if (ambientT <= 0) { ambientT = rnd(7, 12); ambientChatter(); }

  // combo decay
  comboT -= dt;
  if (comboT <= 0) combo = 0;

  // targets
  for (var k = targets.length - 1; k >= 0; k--) {
    var t = targets[k];
    if (t.kind === 'dog' && !t.cited) {
      t.wx += dt * 1.7;
      var p = PLOTS[t.plot];
      t.x = p.lx + p.lw / 2 + Math.sin(t.wx) * (p.lw / 2 - 20);
      t.y = p.ly + p.lh / 2 + Math.cos(t.wx * 1.3) * (p.lh / 2 - 16);
    }
    if (t.cited) {
      t.citeT += dt;
      if (t.citeT > 2.2) targets.splice(k, 1);
    }
  }
  // tracers
  for (var m = tracers.length - 1; m >= 0; m--) {
    tracers[m].t += dt;
    if (tracers[m].t > tracers[m].dur + 0.1) tracers.splice(m, 1);
  }
  for (var s = stamps.length - 1; s >= 0; s--) { stamps[s].t += dt; if (stamps[s].t > 3) stamps.splice(s, 1); }
  for (var q = popups.length - 1; q >= 0; q--) { popups[q].t += dt; if (popups[q].t > 1.6) popups.splice(q, 1); }
  for (var l = 0; l < log.length; l++) {
    var L = log[l];
    var want = Math.min(L.text.length, (perfT - L.born) * 30);
    L.shown = want;
  }

  // BOT: seek nearest uncited violation and fire
  if (BOT) {
    var bn = null, bd = 1e9;
    for (var b = 0; b < targets.length; b++) {
      var tb = targets[b];
      if (tb.cited) continue;
      var dd = Math.hypot(tb.x - ret.x, tb.y - ret.y);
      if (dd < bd) { bd = dd; bn = tb; }
    }
    if (bn) {
      ret.x += (bn.x - ret.x) * Math.min(1, dt * 6);
      ret.y += (bn.y - ret.y) * Math.min(1, dt * 6);
      if (bd < 14 && fireCD <= 0) fireAt(bn.x, bn.y);
    } else {
      ret.x += (W / 2 + Math.sin(perfT * 0.5) * 160 - ret.x) * Math.min(1, dt * 2);
      ret.y += (H / 2 + Math.cos(perfT * 0.4) * 220 - ret.y) * Math.min(1, dt * 2);
    }
  }
}

/* ---------------- thermal rendering ---------------- */
function hot() { return whiteHot ? '#ffffff' : '#0a0a0a'; }
function hotDim() { return whiteHot ? '#8a8a8a' : '#3a3a3a'; }

function drawNoise() {
  if (!noiseCv) {
    noiseCv = document.createElement('canvas');
    noiseCv.width = 180; noiseCv.height = 320;
  }
  var nctx = noiseCv.getContext('2d');
  var img = nctx.createImageData(180, 320);
  for (var i = 0; i < img.data.length; i += 4) {
    var v = (Math.random() * 26) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  ctx.save(); ctx.globalAlpha = 0.5; ctx.drawImage(noiseCv, 0, 0, W, H); ctx.restore();
}

function drawScene() {
  var t = perfT;
  var ox = Math.sin(t * 0.1) * 6, oy = Math.cos(t * 0.13) * 6; // slow drone drift
  ctx.save();
  if (shake > 0) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  ctx.translate(ox, oy);

  // ground
  ctx.fillStyle = '#060606'; ctx.fillRect(-20, -20, W + 40, H + 40);
  // lawns
  for (var i = 0; i < PLOTS.length; i++) {
    var p = PLOTS[i];
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(p.lx, p.ly, p.lw, p.lh);
    ctx.fillStyle = '#101010'; ctx.fillRect(p.dx, p.dy, p.dw, p.dh); // driveway
    // house: warm gray body
    ctx.fillStyle = '#232323'; ctx.fillRect(p.hx, p.hy, p.hw, p.hh);
    ctx.fillStyle = '#2e2e2e'; ctx.fillRect(p.hx - 4, p.hy - 8, p.hw + 8, 14); // roof lip
    // hot chimney dot
    ctx.fillStyle = hotDim();
    ctx.beginPath(); ctx.arc(p.hx + p.hw - 18, p.hy + 16, 4, 0, TAU); ctx.fill();
  }
  // cul-de-sac road bulb + entrance street
  ctx.fillStyle = '#161616';
  ctx.beginPath(); ctx.arc(ROAD.x, ROAD.y, ROAD.r, 0, TAU); ctx.fill();
  ctx.fillRect(ROAD.x - 55, ROAD.y, 110, H - ROAD.y + 20);
  ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.setLineDash([18, 22]);
  ctx.beginPath(); ctx.moveTo(ROAD.x, ROAD.y + 40); ctx.lineTo(ROAD.x, H + 10); ctx.stroke();
  ctx.setLineDash([]);
  // parked cars (dim, compliant)
  for (var c = 0; c < PARKED.length; c++) {
    var pc = PARKED[c];
    ctx.save(); ctx.translate(pc.x, pc.y); ctx.rotate(pc.a);
    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(-22, -10, 44, 20);
    ctx.fillStyle = hotDim(); ctx.fillRect(12, -8, 8, 16); // warm engine
    ctx.restore();
  }
  // trees
  for (var tr = 0; tr < TREES.length; tr++) {
    var T = TREES[tr];
    ctx.fillStyle = '#0e0e0e';
    ctx.beginPath(); ctx.arc(T.x, T.y, T.r, 0, TAU); ctx.fill();
  }

  // ---- violations: white-hot pulsing ----
  var pulse = 0.72 + 0.28 * Math.sin(t * 6);
  ctx.save();
  ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
  for (var v = 0; v < targets.length; v++) {
    var tg = targets[v];
    if (tg.cited) continue;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = hot();
    drawViolation(tg, t);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // stamps (CITED)
  for (var s2 = 0; s2 < stamps.length; s2++) {
    var st = stamps[s2];
    var k = Math.min(1, st.t / 0.18);
    var sc = 1.6 - 0.6 * k;
    ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.rot); ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(1.6 - st.t * 0.5, 0, 1);
    ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 4;
    ctx.strokeRect(-52, -20, 104, 40);
    ctx.fillStyle = '#ff3b3b';
    ctx.font = '900 26px Courier New, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CITED', 0, 2);
    ctx.restore();
  }
  ctx.restore(); // drift

  // tracers (screen space)
  for (var m2 = 0; m2 < tracers.length; m2++) {
    var tr2 = tracers[m2];
    var f = Math.min(1, tr2.t / tr2.dur);
    var hx = tr2.x0 + (tr2.x1 - tr2.x0) * f, hy = tr2.y0 + (tr2.y1 - tr2.y0) * f;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(tr2.x0, tr2.y0); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // popups
  ctx.textAlign = 'center';
  for (var q2 = 0; q2 < popups.length; q2++) {
    var pp = popups[q2];
    var a = clamp(1.4 - pp.t, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = pp.big ? '900 34px Courier New, monospace' : '900 22px Courier New, monospace';
    ctx.fillStyle = pp.col;
    ctx.fillText(pp.text, pp.x, pp.y - pp.t * 44);
    ctx.globalAlpha = 1;
  }

  drawNoise();

  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (var sl = 0; sl < H; sl += 4) ctx.fillRect(0, sl, W, 1);

  // vignette
  var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // muzzle flash on fire
  if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }

  drawReticle(t);
  drawHUD(t);
  if (state === 'title') drawTitle(t);
  if (state === 'over') drawOver(t);
}

function drawViolation(tg, t) {
  var x = tg.x, y = tg.y;
  switch (tg.kind) {
    case 'lawn': // tall grass tufts
      for (var i = 0; i < 9; i++) {
        var gx = x - 28 + (i % 3) * 28 + Math.sin(i * 7) * 6, gy = y - 20 + ((i / 3) | 0) * 22;
        ctx.fillRect(gx - 2, gy - 14, 4, 18);
      }
      break;
    case 'trash': // two cans
      ctx.fillRect(x - 16, y - 14, 14, 24); ctx.fillRect(x + 2, y - 14, 14, 24);
      ctx.fillRect(x - 18, y - 18, 18, 5); ctx.fillRect(x, y - 18, 18, 5);
      break;
    case 'car': // car silhouette on grass
      ctx.save(); ctx.translate(x, y); ctx.rotate(0.35);
      ctx.fillRect(-26, -12, 52, 24); ctx.fillRect(-14, -18, 26, 36);
      ctx.restore();
      break;
    case 'xmas': // blinking roof outline
      if (Math.sin(t * 9) > -0.2) {
        var p = PLOTS[tg.plot];
        ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
        ctx.strokeRect(p.hx - 6, p.hy - 10, p.hw + 12, p.hh + 16);
        ctx.setLineDash([]);
      }
      break;
    case 'rv': // big box
      ctx.fillRect(x - 30, y - 16, 60, 32);
      ctx.fillRect(x - 30, y - 24, 60, 8);
      break;
    case 'dog': // hot blob + wagging tail line
      ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 10) * 0.6);
      ctx.fillRect(8, -2, 14, 4);
      ctx.restore();
      break;
    case 'weeds':
      for (var w = 0; w < 5; w++) ctx.fillRect(x - 18 + w * 9, y - 12, 3, 16);
      break;
    case 'pool': // ellipse
      ctx.beginPath(); ctx.ellipse(x, y, 26, 16, 0.3, 0, TAU); ctx.fill();
      break;
  }
}

function drawReticle(t) {
  var x = ret.x, y = ret.y, s = 34;
  // nearest target lock
  var lock = null, bd = 1e9;
  if (state === 'play') {
    for (var i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (tg.cited) continue;
      var d = Math.hypot(tg.x - x, tg.y - y);
      if (d < bd) { bd = d; lock = tg; }
    }
  }
  var locked = lock && bd < lock.r + 26;
  ctx.strokeStyle = locked ? '#ff3b3b' : '#ffffff';
  ctx.lineWidth = 3;
  // corner brackets
  var b = 12;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s + b); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + b, y - s);
  ctx.moveTo(x + s - b, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + b);
  ctx.moveTo(x + s, y + s - b); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - b, y + s);
  ctx.moveTo(x - s + b, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - b);
  ctx.stroke();
  // crosshair ticks
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
  ctx.stroke();
  ctx.font = '700 13px Courier New, monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = locked ? '#ff3b3b' : '#ffffff';
  var rng = (400 + ((x * 7 + y * 13) | 0) % 300);
  ctx.fillText('RNG ' + rng + 'm', x + s + 8, y - 6);
  if (locked) {
    ctx.fillStyle = '#ff3b3b';
    ctx.fillText('LOCK: ' + lock.label, x + s + 8, y + 12);
    ctx.fillText('FINE $' + lock.fine, x + s + 8, y + 30);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SCANNING', x + s + 8, y + 12);
  }
}

function drawHUD(t) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  // top-left: unit + thermal mode
  ctx.font = '700 15px Courier New, monospace';
  ctx.fillText('HOA DRONE-1 // THERMAL', 14, 30);
  ctx.font = '700 13px Courier New, monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText(whiteHot ? 'WHITE HOT' : 'BLACK HOT', 14, 50);
  ctx.fillText('[H] POLARITY', 14, 68);
  // top-center: timer
  ctx.textAlign = 'center';
  ctx.fillStyle = timeLeft <= 10 && state === 'play' ? '#ff3b3b' : '#fff';
  ctx.font = '900 30px Courier New, monospace';
  if (state === 'play') ctx.fillText('T-' + Math.ceil(timeLeft) + 's', W / 2, 36);
  // top-right: fines + $
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = '900 20px Courier New, monospace';
  ctx.fillText('FINES ' + fines, W - 14, 30);
  ctx.fillStyle = '#ffd34d';
  ctx.fillText('$' + collected, W - 14, 54);
  if (combo >= 2) {
    ctx.fillStyle = '#ff9f1c';
    ctx.font = '900 18px Courier New, monospace';
    ctx.fillText('x' + combo + ' COMBO', W - 14, 78);
  }
  // chatter log bottom-left
  ctx.textAlign = 'left';
  ctx.font = '700 14px Courier New, monospace';
  var ly = H - 14 - (log.length - 1) * 22;
  for (var i = 0; i < log.length; i++) {
    var L = log[i];
    var age = perfT - L.born;
    ctx.globalAlpha = clamp(1.2 - age * 0.06, 0.15, 1);
    ctx.fillStyle = '#7dff8a';
    var txt = L.text.slice(0, Math.floor(L.shown));
    ctx.fillText('> ' + txt, 14, ly + i * 22);
  }
  ctx.globalAlpha = 1;
  // REC dot
  if (state === 'play') {
    if (Math.sin(t * 5) > 0) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(W - 24, H - 24, 7, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = '700 13px Courier New, monospace'; ctx.textAlign = 'right';
    ctx.fillText('REC', W - 38, H - 19);
  }
}

function drawTitle(t) {
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '900 44px Courier New, monospace';
  ctx.fillText('FINE FROM', W / 2, H * 0.34);
  ctx.fillText('ABOVE', W / 2, H * 0.34 + 52);
  ctx.fillStyle = '#7dff8a';
  ctx.font = '700 16px Courier New, monospace';
  ctx.fillText('HOA DRONE-1 // THERMAL GUN-CAM', W / 2, H * 0.34 + 92);
  ctx.fillStyle = '#aaa';
  ctx.font = '400 15px Courier New, monospace';
  ctx.fillText('Violations glow hot. Tap one', W / 2, H * 0.52);
  ctx.fillText('to drop a FINE on it.', W / 2, H * 0.52 + 24);
  ctx.fillText('Chain fines fast for combos.', W / 2, H * 0.52 + 48);
  if (Math.sin(t * 4) > -0.2) {
    ctx.fillStyle = '#fff';
    ctx.font = '900 20px Courier New, monospace';
    ctx.fillText(BOT ? 'AUTO-ENFORCEMENT ENGAGED' : 'TAP TO START PATROL', W / 2, H * 0.68);
  }
}

function drawOver(t) {
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '900 36px Courier New, monospace';
  ctx.fillText('PATROL COMPLETE', W / 2, H * 0.3);
  ctx.font = '700 20px Courier New, monospace';
  ctx.fillStyle = '#ffd34d';
  ctx.fillText('FINES ISSUED: ' + fines, W / 2, H * 0.3 + 52);
  ctx.fillText('TOTAL COLLECTED: $' + collected, W / 2, H * 0.3 + 84);
  ctx.fillStyle = '#ff9f1c';
  ctx.fillText('BEST COMBO: x' + Math.max(1, bestCombo), W / 2, H * 0.3 + 116);
  ctx.fillStyle = '#7dff8a';
  ctx.font = '400 15px Courier New, monospace';
  ctx.fillText('The covenants are safe tonight.', W / 2, H * 0.3 + 156);
  if (overT > 1.2 && Math.sin(t * 4) > -0.2 && !BOT) {
    ctx.fillStyle = '#fff';
    ctx.font = '900 18px Courier New, monospace';
    ctx.fillText('TAP TO FLY AGAIN', W / 2, H * 0.62);
  }
}

/* ---------------- main loop ---------------- */
function frame(ts) {
  var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  update(dt);
  drawScene();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})();
