// Input math for controller + touch (DOM-free parts of web/src/engine/controls.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deadzone, stickLook, touchStick, readGamepad, aimAssist, PAD, LOOK } from '../src/engine/controls.js';
import { Sim } from '../src/engine/sim.js';
import { mulberry32 } from '../src/core/rng.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

function fakePad({ axes = [0, 0, 0, 0], down = [] } = {}) {
  return { axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) };
}

test('deadzone: radial, rescaled to reach 1, no drift inside', () => {
  assert.deepEqual(deadzone(0.1, 0.1), { x: 0, y: 0, m: 0 });
  const full = deadzone(1, 0);
  assert.ok(near(full.x, 1) && near(full.m, 1));
  const diag = deadzone(Math.SQRT1_2, Math.SQRT1_2);
  assert.ok(near(Math.hypot(diag.x, diag.y), 1, 1e-6), 'diagonals reach full speed too');
});

test('stick look is framerate independent and slowed by aim assist', () => {
  let a = 0;
  for (let i = 0; i < 30; i++) a += stickLook(1, 0, 1 / 30).dYaw;   // 1 s at 30 fps
  let b = 0;
  for (let i = 0; i < 144; i++) b += stickLook(1, 0, 1 / 144).dYaw; // 1 s at 144 fps
  assert.ok(near(a, b, 1e-9) && near(a, -LOOK.padYawRate, 1e-9), `${a} vs ${b}`);
  assert.ok(Math.abs(stickLook(0.4, 0, 1).dYaw) < Math.abs(stickLook(0.8, 0, 1).dYaw) / 2, 'response curve: fine aim near centre');
  assert.ok(near(stickLook(1, 0, 1, 0.45).dYaw, -LOOK.padYawRate * 0.45));
});

test('touch stick: small wobble ignored, edge sprints, clamps to the ring', () => {
  assert.deepEqual(touchStick(3, 2, 60), { forward: 0, right: 0, sprint: false });
  const up = touchStick(0, -60, 60);
  assert.ok(near(up.forward, 1) && up.sprint);
  const far = touchStick(300, 0, 60);
  assert.ok(near(far.right, 1) && far.sprint, 'dragging past the ring stays at full speed');
  assert.ok(!touchStick(0, -30, 60).sprint);
});

test('gamepad: buttons fire once per press, sticks map to move', () => {
  const prev = new Map();
  let r = readGamepad(fakePad({ down: [PAD.X] }), prev);
  assert.ok(r.pressed.X && r.active);
  r = readGamepad(fakePad({ down: [PAD.X] }), prev);
  assert.ok(!r.pressed.X, 'held X does not re-trigger reload');
  r = readGamepad(fakePad({ axes: [0, -1, 0, 0], down: [PAD.RT] }), prev);
  assert.ok(near(r.forward, 1) && r.held.fire);
  r = readGamepad(fakePad({ axes: [0.05, 0.05, 0.05, 0.05] }), prev);
  assert.ok(!r.active, 'stick drift inside the deadzone does not steal the device');
});

test('aim assist: sticky on a visible enemy, nothing through walls or behind you', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(1) });
  const me = sim.addActor({ id: 'me', name: 'Me', team: 0, faction: 'karens', isBot: false });
  const foe = sim.addActor({ id: 'foe', name: 'Foe', team: 1, faction: 'fratHouse', isBot: false });
  sim.start();
  Object.assign(me.pos, { x: 0, y: 0, z: 20 }); me.yaw = 0; me.pitch = 0;
  Object.assign(foe.pos, { x: 0, y: 0, z: 8 });            // 12 m straight ahead (open court)
  let a = aimAssist(sim, me);
  assert.equal(a.slow, 0.45);
  assert.ok(a.onTarget);
  me.yaw = 0.2;                                             // ~2.4 m off to the side
  a = aimAssist(sim, me);
  assert.ok(!a.onTarget);
  me.yaw = Math.PI;                                         // facing away
  assert.equal(aimAssist(sim, me).slow, 1);
  Object.assign(me.pos, { x: -27, y: 0, z: 12 }); me.yaw = 0;  // west house between us and the foe
  Object.assign(foe.pos, { x: -27, y: 0, z: -12 });
  assert.equal(aimAssist(sim, me).slow, 1, 'no assist through a house');
});
