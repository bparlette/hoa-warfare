// Unified input: keyboard + mouse, gamepad (W3C "standard" mapping: Xbox / PlayStation / Switch Pro),
// and phone/tablet touch (floating move stick, drag-to-look, on-screen buttons).
// The pure helpers at the top have no DOM access and are unit-tested in web/tests/controls.test.mjs.
//
// Device rules
//  * The last device that produced real input is `device` ('mouse' | 'pad' | 'touch').
//  * Mouse play needs pointer lock; pad and touch never do. `engaged` decides whether the match runs.
//  * Stick and touch look are framerate-independent (rad/s * dt) and get aim slowdown from `assist`.

export const LOOK = {
  mouseSens: 0.0022,      // rad per pixel of mouse movement
  padYawRate: 3.4,        // rad/s at full stick deflection
  padPitchRate: 2.4,
  padCurve: 2,            // response exponent: fine aim near centre, fast turns at the edge
  touchSens: 0.0062,      // rad per CSS pixel dragged
  maxPitch: 1.45,
  invertY: false,         // invert vertical mouse look
  fov: 75,                // base horizontal-derived vertical FOV
  graphics: 'high',       // 'high' | 'low' (renderer.setQualityTier)
  keyBindings: {
    forward: 'KeyW',
    back: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    sprint: 'ShiftLeft',
    reload: 'KeyR',
    melee: 'KeyF',
    grenade: 'KeyG',
    interact: 'KeyE',
    switchToggle: 'KeyQ',
    slotPrimary: 'Digit1',
    slotSecondary: 'Digit2',
    scoreboard: 'Tab',
  },
};

const SETTINGS_KEY = 'hoa.pc_settings.v1';

export function loadPcSettings() {
  if (typeof localStorage === 'undefined') return LOOK;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return LOOK;
    const data = JSON.parse(raw);
    if (typeof data.mouseSens === 'number' && Number.isFinite(data.mouseSens)) LOOK.mouseSens = data.mouseSens;
    if (typeof data.invertY === 'boolean') LOOK.invertY = data.invertY;
    if (typeof data.fov === 'number' && Number.isFinite(data.fov)) LOOK.fov = data.fov;
    if (data.graphics === 'high' || data.graphics === 'low') LOOK.graphics = data.graphics;
    if (data.keyBindings && typeof data.keyBindings === 'object') {
      Object.assign(LOOK.keyBindings, data.keyBindings);
    }
  } catch {}
  return LOOK;
}

export function savePcSettings(patch = {}) {
  if (typeof patch.mouseSens === 'number') LOOK.mouseSens = patch.mouseSens;
  if (typeof patch.invertY === 'boolean') LOOK.invertY = patch.invertY;
  if (typeof patch.fov === 'number') LOOK.fov = patch.fov;
  if (patch.graphics === 'high' || patch.graphics === 'low') LOOK.graphics = patch.graphics;
  if (patch.keyBindings && typeof patch.keyBindings === 'object') {
    Object.assign(LOOK.keyBindings, patch.keyBindings);
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        mouseSens: LOOK.mouseSens,
        invertY: LOOK.invertY,
        fov: LOOK.fov,
        graphics: LOOK.graphics,
        keyBindings: LOOK.keyBindings,
      }));
    } catch {}
  }
}

export const DEFAULT_KEY_BINDINGS = Object.freeze({ ...LOOK.keyBindings });

/** Rebind an action. A key already used by another action swaps onto this action's old key. */
export function rebindKey(action, code) {
  const kb = LOOK.keyBindings;
  if (!(action in kb) || typeof code !== 'string' || !code) return false;
  const clash = Object.keys(kb).find(k => k !== action && kb[k] === code);
  if (clash) kb[clash] = kb[action];
  kb[action] = code;
  savePcSettings({ keyBindings: kb });
  return true;
}

export function resetKeyBindings() {
  Object.assign(LOOK.keyBindings, DEFAULT_KEY_BINDINGS);
  savePcSettings({ keyBindings: LOOK.keyBindings });
}

/** Settings menu "press a key": the next key press goes to `cb(code)`, or `cb(null)` on Escape. */
export function captureNextKey(cb) {
  const h = e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    cb(e.code === 'Escape' ? null : e.code);
  };
  window.addEventListener('keydown', h, { capture: true, once: true });
}

/** "KeyW" -> "W", "Digit1" -> "1", "ShiftLeft" -> "L-Shift". */
export function keyLabel(code) {
  return String(code || '').replace(/^Key/, '').replace(/^Digit/, '').replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, (_, k, s) => `${s[0]}-${k === 'Control' ? 'Ctrl' : k}`);
}

// Automatically load on import if running in browser
if (typeof window !== 'undefined') {
  loadPcSettings();
}
export const STICK_DEADZONE = 0.15;

/** Radial deadzone with rescale, so output still reaches 1 at full deflection and has no diagonal bias. */
export function deadzone(x, y, dz = STICK_DEADZONE) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0, m: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k, m: Math.min(1, (m - dz) / (1 - dz)) };
}

/** Look stick -> yaw/pitch deltas for this frame. */
export function stickLook(x, y, dt, assist = 1) {
  const s = deadzone(x, y);
  if (!s.m) return { dYaw: 0, dPitch: 0 };
  const curved = Math.pow(s.m, LOOK.padCurve) / s.m;
  return { dYaw: -s.x * curved * LOOK.padYawRate * dt * assist, dPitch: -s.y * curved * LOOK.padPitchRate * dt * assist };
}

/** Virtual stick drag (pixels from where the thumb landed) -> move intent. Edge of the ring = sprint. */
export function touchStick(dx, dy, radius) {
  const m = Math.hypot(dx, dy);
  if (m < radius * 0.12) return { forward: 0, right: 0, sprint: false };
  const k = Math.min(m, radius) / m;
  return { forward: -dy * k / radius, right: dx * k / radius, sprint: m >= radius * 0.95 };
}

// Standard Gamepad mapping indices
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/**
 * Read one gamepad frame. `prev` is a Map<buttonIndex, bool> owned by the caller (edge detection).
 * Returns held state + one-frame `pressed` edges. Pure apart from mutating `prev`.
 */
export function readGamepad(gp, prev) {
  const btn = i => { const b = gp.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
  const pressed = {};
  for (const [name, i] of Object.entries(PAD)) {
    const now = btn(i);
    if (now && !prev.get(i)) pressed[name] = true;
    prev.set(i, now);
  }
  const move = deadzone(gp.axes[0] || 0, gp.axes[1] || 0);
  const look = { x: gp.axes[2] || 0, y: gp.axes[3] || 0 };
  const held = {
    fire: btn(PAD.RT), sprint: btn(PAD.L3) || btn(PAD.LT), jump: btn(PAD.A), board: btn(PAD.VIEW),
  };
  const active = move.m > 0 || Math.hypot(look.x, look.y) > STICK_DEADZONE || Object.keys(pressed).length > 0 || held.fire;
  return { forward: -move.y, right: move.x, look, held, pressed, active };
}

// ------------------------------------------------------------------------------------------------

export class Controls {
  static isSteamDeck() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/Valve Steam Gamepad|SteamDeck|SteamOS/i.test(ua)) return true;
    if (typeof window !== 'undefined' && window.location?.search) {
      try {
        const q = new URLSearchParams(window.location.search);
        if (q.get('deck') === '1' || q.get('pad') === '1') return true;
      } catch {}
    }
    return false;
  }

  syncDeviceClasses() {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('device-pad', this.device === 'pad');
      document.body.classList.toggle('device-mouse', this.device === 'mouse');
      document.body.classList.toggle('device-touch', this.device === 'touch');
    }
  }

  setDevice(device) {
    if (this.device !== device) {
      this.device = device;
      this.syncDeviceClasses();
    }
  }

  /**
   * @param {{canvas:HTMLCanvasElement, touchRoot?:HTMLElement}} o
   * Callbacks (assign): onPadPress(pressedMap, inGame) for menu/pause navigation.
   */
  constructor({ canvas, touchRoot = null }) {
    this.canvas = canvas;
    const isTouch = typeof matchMedia !== 'undefined' && matchMedia?.('(pointer: coarse)')?.matches;
    this.device = Controls.isSteamDeck() ? 'pad' : (isTouch ? 'touch' : 'mouse');
    this.locked = false;
    this.userPaused = false;
    this.keys = new Set();
    this.mouseFire = false;
    this.yaw = 0; this.pitch = 0;
    this.pending = {};           // one-shot actions: reload, melee, grenade, switchSlot
    this.padPrev = new Map();
    this.pad = null;             // last gamepad read
    this.assist = 1;             // aim slowdown multiplier set by the game each frame
    this.autoFire = true;        // touch only: fire automatically while the crosshair is on an enemy
    this.onTarget = false;
    this.touch = { stick: null, look: new Map(), fire: false, jump: false, board: false, move: { forward: 0, right: 0, sprint: false } };
    this.onPadPress = null;
    this.syncDeviceClasses();
    if (typeof document !== 'undefined') this.bindMouseKeys();
    if (touchRoot) this.bindTouch(touchRoot);
  }

  get engaged() {
    if (this.userPaused) return false;
    return this.device === 'mouse' ? this.locked : true;
  }
  get scoreboard() { return this.keys.has('Tab') || !!this.pad?.held.board || this.touch.board; }

  lock() {
    if (this.device !== 'mouse') { this.userPaused = false; return; }
    try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
  }
  resetLook(yaw = 0) { this.yaw = yaw; this.pitch = 0; }

  // ---------------------------------------------------------------- keyboard + mouse
  bindMouseKeys() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) { this.setDevice('mouse'); this.userPaused = false; }
      else this.mouseFire = false;
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.yaw -= e.movementX * LOOK.mouseSens;
      const pitchDelta = e.movementY * LOOK.mouseSens * (LOOK.invertY ? -1 : 1);
      this.pitch = clampPitch(this.pitch - pitchDelta);
    });
    document.addEventListener('mousedown', e => { if (this.locked && e.button === 0) this.mouseFire = true; });
    document.addEventListener('mouseup', e => { if (e.button === 0) this.mouseFire = false; });
    document.addEventListener('keydown', e => {
      const kb = LOOK.keyBindings;
      if (e.code === (kb.scoreboard || 'Tab')) e.preventDefault();
      this.keys.add(e.code);
      if ([kb.forward || 'KeyW', kb.left || 'KeyA', kb.back || 'KeyS', kb.right || 'KeyD'].includes(e.code) && this.device !== 'mouse') this.setDevice('mouse');
      const p = this.pending;
      if (e.code === (kb.reload || 'KeyR')) p.reload = true;
      if (e.code === (kb.melee || 'KeyF') || e.code === 'KeyV') p.melee = true;
      if (e.code === (kb.grenade || 'KeyG')) p.grenade = true;
      if (e.code === (kb.interact || 'KeyE')) p.interact = true;
      if (e.code === (kb.switchToggle || 'KeyQ')) p.switchSlot = 'toggle';
      if (e.code === (kb.slotPrimary || 'Digit1')) p.switchSlot = 'primary';
      if (e.code === (kb.slotSecondary || 'Digit2')) p.switchSlot = 'secondary';
    });
    document.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; });
  }

  // ---------------------------------------------------------------- touch
  bindTouch(root) {
    this.touchRoot = root;
    const stickBase = root.querySelector('.t-stick'), stickKnob = root.querySelector('.t-knob');
    const R = 60;
    const isTouch = e => e.pointerType === 'touch' || e.pointerType === 'pen';

    const dismissLookHint = () => {
      const hint = root.querySelector('#touchLookHint');
      if (hint && !hint.classList.contains('hidden-hint')) {
        hint.classList.add('hidden-hint');
      }
    };

    root.addEventListener('pointerdown', e => {
      if (!isTouch(e)) return;
      this.setDevice('touch');
      this.userPaused = false;
      dismissLookHint();
      const btn = e.target.closest('[data-t]');
      if (btn) return; // buttons handle themselves
      e.preventDefault();
      try { root.setPointerCapture?.(e.pointerId); } catch {}
      if (e.clientX < innerWidth * 0.42 && !this.touch.stick) {
        this.touch.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        stickBase.style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`;
        stickKnob.style.transform = 'translate(-50%,-50%)';
      } else {
        this.touch.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    }, { passive: false });
    root.addEventListener('pointermove', e => {
      if (!isTouch(e)) return;
      const t = this.touch;
      if (t.stick?.id === e.pointerId) {
        const dx = e.clientX - t.stick.x0, dy = e.clientY - t.stick.y0;
        t.move = touchStick(dx, dy, R);
        const m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
        stickKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
        stickBase.classList.toggle('sprint', t.move.sprint);
      } else if (t.look.has(e.pointerId)) {
        const p = t.look.get(e.pointerId);
        this.lookBy(e.clientX - p.x, e.clientY - p.y);
        p.x = e.clientX; p.y = e.clientY;
      }
    });
    const end = e => {
      const t = this.touch;
      if (t.stick?.id === e.pointerId) { t.stick = null; t.move = { forward: 0, right: 0, sprint: false }; stickBase.style.display = 'none'; }
      t.look.delete(e.pointerId);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);

    // Buttons: data-t="fire|jump|reload|melee|grenade|swap|board|pause|interact". FIRE also aims while held (drag).
    let interactBtn = root.querySelector('#touchInteract') || root.querySelector('[data-t="interact"]');
    if (!interactBtn && typeof document !== 'undefined') {
      interactBtn = document.createElement('button');
      interactBtn.id = 'touchInteract';
      interactBtn.className = 't-btn t-interact';
      interactBtn.dataset.t = 'interact';
      interactBtn.setAttribute('aria-label', 'Drive / Exit Mower');
      interactBtn.textContent = '🚜';
      interactBtn.style.cssText = 'display:none;position:absolute;bottom:115px;right:155px;width:56px;height:56px;border-radius:50%;background:rgba(46,125,50,0.9);color:#ffeb3b;font-size:24px;border:2px solid #ffeb3b;z-index:90;touch-action:none;align-items:center;justify-content:center;';
      root.appendChild(interactBtn);
    }
    this.touchInteractBtn = interactBtn;

    const touchButtons = new Set([
      ...root.querySelectorAll('[data-t]'),
      ...(typeof document !== 'undefined' ? document.querySelectorAll('[data-t="board"]') : []),
    ]);
    for (const el of touchButtons) {
      const kind = el.dataset.t;
      let last = null;
      el.addEventListener('pointerdown', e => {
        if (!isTouch(e)) return;
        e.preventDefault(); e.stopPropagation();
        this.setDevice('touch');
        dismissLookHint();
        try { el.setPointerCapture?.(e.pointerId); } catch {}
        el.classList.add('on');
        last = { x: e.clientX, y: e.clientY };
        if (kind === 'fire') this.touch.fire = true;
        else if (kind === 'jump') this.touch.jump = true;
        else if (kind === 'board') this.touch.board = true;
        else if (kind === 'pause') this.userPaused = true;
        else if (kind === 'swap') this.pending.switchSlot = 'toggle';
        else this.pending[kind] = true;
      }, { passive: false });
      el.addEventListener('pointermove', e => {
        if (kind !== 'fire' || !last) return;
        this.lookBy(e.clientX - last.x, e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY };
      });
      const up = () => {
        el.classList.remove('on');
        last = null;
        if (kind === 'fire') this.touch.fire = false;
        if (kind === 'jump') this.touch.jump = false;
        if (kind === 'board') this.touch.board = false;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('touchend', up);
    }
  }

  lookBy(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const clampedDx = Math.max(-120, Math.min(120, dx));
    const clampedDy = Math.max(-120, Math.min(120, dy));
    const s = LOOK.touchSens * this.assist;
    this.yaw -= clampedDx * s;
    this.pitch = clampPitch(this.pitch - clampedDy * s);
  }

  // ---------------------------------------------------------------- per frame

  /** Poll the gamepad (call every frame, in menus too). Returns this frame's pressed edges or null. */
  pollPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const gp = pads.find(p => p && p.connected && p.mapping === 'standard') || pads.find(p => p && p.connected);
    if (!gp) { this.pad = null; return null; }
    this.pad = readGamepad(gp, this.padPrev);
    if (this.pad.active) this.setDevice('pad');
    const pr = this.pad.pressed;
    if (Object.keys(pr).length && this.onPadPress) this.onPadPress(pr);
    return pr;
  }

  /** Write this frame's intent into actor.input. */
  apply(a, dt, sim = null) {
    const k = this.keys, inp = a.input, pad = this.pad, t = this.touch;
    const kb = LOOK.keyBindings;
    const fwdKey = kb.forward || 'KeyW', backKey = kb.back || 'KeyS', leftKey = kb.left || 'KeyA', rightKey = kb.right || 'KeyD';
    let fwd = (k.has(fwdKey) || k.has('ArrowUp') ? 1 : 0) - (k.has(backKey) || k.has('ArrowDown') ? 1 : 0);
    let right = (k.has(rightKey) || k.has('ArrowRight') ? 1 : 0) - (k.has(leftKey) || k.has('ArrowLeft') ? 1 : 0);
    let jump = k.has(kb.jump || 'Space'), sprint = k.has(kb.sprint || 'ShiftLeft') || k.has('ShiftRight');
    let fire = this.mouseFire;

    if (pad) {
      fwd += pad.forward; right += pad.right;
      jump ||= pad.held.jump; sprint ||= pad.held.sprint; fire ||= pad.held.fire;
      const l = stickLook(pad.look.x, pad.look.y, dt, this.assist);
      this.yaw += l.dYaw;
      this.pitch = clampPitch(this.pitch + l.dPitch);
      const pr = pad.pressed;
      if (pr.X) this.pending.reload = true;
      if (pr.B || pr.RB || pr.R3) this.pending.melee = true;
      if (pr.LB) this.pending.grenade = true;
      if (pr.Y) this.pending.switchSlot = 'toggle';
      if (pr.UP) this.pending.switchSlot = 'primary';
      if (pr.DOWN) this.pending.switchSlot = 'secondary';
    }
    if (this.device === 'touch') {
      fwd += t.move.forward; right += t.move.right;
      sprint ||= t.move.sprint; jump ||= t.jump;
      const w = a.weapons?.[a.activeSlot || 'primary'];
      const wantFire = t.fire || (this.autoFire && this.onTarget);
      fire ||= (wantFire && w && !w.auto && a.triggerHeld) ? false : wantFire;
    }

    inp.forward = Math.max(-1, Math.min(1, fwd));
    inp.right = Math.max(-1, Math.min(1, right));
    inp.jump = jump;
    inp.sprint = sprint;
    inp.fire = fire && a.alive;
    const p = this.pending;
    if (p.reload) inp.reload = true;
    if (p.melee) inp.melee = true;
    if (p.grenade) inp.grenade = true;
    if (p.interact) {
      inp.interact = true;
      const s = sim || this.sim;
      if (s && typeof s.enterVehicle === 'function') {
        if (a.inVehicle) s.exitVehicle(a);
        else s.enterVehicle(a);
      }
    }
    if (p.switchSlot) inp.switchSlot = p.switchSlot === 'toggle' ? (a.activeSlot === 'primary' ? 'secondary' : 'primary') : p.switchSlot;
    this.pending = {};
    const vechs = sim?.vehicles || this.sim?.vehicles;
    if (vechs) this.updateVehicleInteraction(a, vechs);
    if (!a.alive) this.resetLook(a.team === 0 ? 0 : Math.PI);
    if (this.lockTarget && a.alive) {
      let dyaw = this.lockTarget.yaw - this.yaw;
      while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      const pull = Math.min(1, dt * 16);
      this.yaw += dyaw * pull;
      this.pitch = clampPitch(this.pitch + (this.lockTarget.pitch - this.pitch) * pull);
    }
    inp.yaw = this.yaw;
    inp.pitch = this.pitch;
  }

  updateVehicleInteraction(actor, vehicles = []) {
    if (!this.touchInteractBtn || !actor) return;
    const isNearOrIn = actor.inVehicle || vehicles.some(v => v.alive && (!v.driverId || v.driverId === actor.id) && Math.hypot(v.pos.x - actor.pos.x, v.pos.z - actor.pos.z) <= 3.0);
    if (isNearOrIn) {
      this.touchInteractBtn.style.display = 'flex';
      this.touchInteractBtn.textContent = actor.inVehicle ? '🚪' : '🚜';
    } else {
      this.touchInteractBtn.style.display = 'none';
    }
  }

  triggerHaptic(type) {
    return triggerHaptic(type);
  }
}

function clampPitch(p) { return Math.max(-LOOK.maxPitch, Math.min(LOOK.maxPitch, p)); }

/**
 * Mobile Haptics & Vibration Feedback:
 * - fire: subtle 12ms pulse.
 * - hit: 25ms tactile bump.
 * - kill: double pulse [30, 40, 50].
 * - explosion / roadkill: heavy rumble [60, 30, 80].
 * - damage: sharp pulse [40].
 */
export const HAPTIC_PATTERNS = {
  fire: 12,
  hit: 25,
  kill: [30, 40, 50],
  explosion: [60, 30, 80],
  roadkill: [60, 30, 80],
  damage: [40],
};

/**
 * Trigger mobile haptic / vibration feedback using navigator.vibrate.
 * Gracefully checks navigator?.vibrate support so desktop browsers never throw errors.
 */
export function triggerHaptic(type) {
  if (typeof navigator === 'undefined' || typeof navigator?.vibrate !== 'function') {
    return false;
  }
  // browsers block (and log an error for) vibrate before the first tap: spectating or the attract
  // screen would spam the console
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  const pattern = HAPTIC_PATTERNS[type] ?? (Array.isArray(type) || typeof type === 'number' ? type : null);
  if (pattern === null || pattern === undefined) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/**
 * Aim helper for pad/touch (and Easy Mode auto lock-on for all devices):
 * angular distance from the crosshair to the nearest visible enemy chest.
 * Returns { slow: multiplier for look speed, onTarget: crosshair is on them, locked?: boolean, lockYaw?: number, lockPitch?: number }.
 */
export function aimAssist(sim, me, { cone = 0.09, hitCone = 0.035, range = 45, lockOn = false, lockRange = 28, lockCone = 0.55 } = {}) {
  if (!me.alive) return { slow: 1, onTarget: false, locked: false, lockYaw: null, lockPitch: null };
  if (lockOn && typeof sim.findLockOnTarget === 'function') {
    const lock = sim.findLockOnTarget(me, { maxRange: lockRange, maxCone: lockCone });
    if (lock) {
      return { slow: 0.35, onTarget: true, locked: true, lockYaw: lock.yaw, lockPitch: lock.pitch, target: lock.actor };
    }
  }
  const eye = { x: me.pos.x, y: me.pos.y + 1.6, z: me.pos.z };
  const c = Math.cos(me.pitch);
  const f = { x: -Math.sin(me.yaw) * c, y: Math.sin(me.pitch), z: -Math.cos(me.yaw) * c };
  let best = Infinity, bestD = 0;
  for (const e of sim.actors) {
    if (!e.alive || e.team === me.team) continue;
    // nearest point on the standing body (shins to head) at the height the crosshair ray passes
    const hd = Math.hypot(e.pos.x - eye.x, e.pos.z - eye.z);
    const rayY = eye.y + Math.tan(me.pitch) * hd;
    const t = { x: e.pos.x, y: Math.max(e.pos.y + 0.3, Math.min(e.pos.y + 1.8, rayY)), z: e.pos.z };
    const dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > range || d < 0.5) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dy * f.y + dz * f.z) / d)));
    // widen the cone a little up close so strafing targets stay sticky
    const allowed = cone + 0.6 / d;
    if (ang < allowed && ang < best && sim.lineClear(eye, t)) { best = ang; bestD = d; }
  }
  if (best === Infinity) return { slow: 1, onTarget: false, locked: false, lockYaw: null, lockPitch: null };
  // on target = within the body's angular half-width (0.42 m hit radius) plus a small margin
  return { slow: 0.45, onTarget: best < Math.max(hitCone, Math.atan(0.42 / bestD)), locked: false, lockYaw: null, lockPitch: null };
}

