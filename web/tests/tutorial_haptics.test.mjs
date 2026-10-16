// Unit tests for SuburbanTutorial Mode and Mobile Haptics. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Sim } from '../src/engine/sim.js';
import { MODES, MODE_ALIASES, resolveModeId, createMode, SuburbanTutorial } from '../src/engine/modes.js';
import { triggerHaptic, HAPTIC_PATTERNS, Controls } from '../src/engine/controls.js';
import { mulberry32 } from '../src/core/rng.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

test('SuburbanTutorial mode: registered in MODES and aliases', () => {
  assert.equal(MODES.tutorial, SuburbanTutorial);
  assert.equal(MODES.range, SuburbanTutorial);
  assert.equal(MODES.firingRange, SuburbanTutorial);
  assert.equal(resolveModeId('tutorial'), 'tutorial');
  assert.equal(resolveModeId('range'), 'tutorial');
  assert.equal(resolveModeId('firingRange'), 'tutorial');

  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), mode: 'tutorial' });
  const mode = createMode('tutorial', sim);
  assert.ok(mode instanceof SuburbanTutorial);
  assert.equal(mode.constructor.id, 'tutorial');
  assert.equal(mode.constructor.label, 'Suburban Tutorial');
  assert.equal(mode.constructor.parent, 'Firing Range');

  const modeFromRange = createMode('range', sim);
  assert.ok(modeFromRange instanceof SuburbanTutorial);
  const modeFromFiringRange = createMode('firingRange', sim);
  assert.ok(modeFromFiringRange instanceof SuburbanTutorial);
});

test('SuburbanTutorial mode: initializes safe practice zone, infinite ammo, and 4 progressive drills', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), mode: 'tutorial' });
  const player = sim.addActor({ id: 'player_1', name: 'HOA Recruit', team: 0, faction: 'karens', isBot: false });
  sim.start();

  const mode = sim.mode;
  assert.ok(mode instanceof SuburbanTutorial);
  assert.equal(mode.step, 1);
  assert.equal(mode.completed, false);

  // Player spawned in safe practice zone facing north
  assert.equal(player.pos.z, 25);
  assert.equal(player.yaw, Math.PI);
  assert.equal(player.alive, true);

  // Targets initialized: 3 cardboard cutout HOA violators
  assert.equal(mode.targets.length, 3);
  assert.ok(mode.targets.some(t => t.name.includes('Karen')));
  assert.ok(mode.targets.some(t => t.name.includes('Dad')));
  assert.ok(mode.targets.some(t => t.name.includes('VC Bro')));

  // Weeds row initialized
  assert.equal(mode.weeds.length, 3);

  // Riding lawn mower is present
  const mower = sim.vehicles?.find(v => v.isMower || v.id.includes('mower'));
  assert.ok(mower, 'mower vehicle exists in simulation');

  // Infinite ammo check: shooting drains ammo, update refills it
  player.ammo = 5;
  mode.update(0.1);
  const w = sim.activeWeapon(player);
  assert.equal(player.ammo, w.mag, 'player ammo is kept replenished');
  assert.ok(player.grenades >= 2, 'player grenades are kept replenished');

  // Camping snitch exempt in practice zone
  assert.equal(mode.campingExempt(player), true);

  // HUD gives clear instructions
  const hudText = mode.hud(player);
  assert.ok(hudText.includes('DRILL 1/4'));
  assert.ok(hudText.includes('Grass Height Meter'));
});

test('SuburbanTutorial mode: progresses through all 4 drills to completion and awards certification banner', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), mode: 'tutorial' });
  const player = sim.addActor({ id: 'you', name: 'HOA Cadet', team: 0, faction: 'hoaDads', isBot: false });
  sim.start();
  const mode = sim.mode;

  // Track events emitted by sim
  const events = [];
  const origEmit = sim.emit.bind(sim);
  sim.emit = (ev) => { events.push(ev); origEmit(ev); };

  // Step 1: Movement Drill -> Walk across lawn to inspect grass height meter
  assert.equal(mode.step, 1);
  player.pos.x = mode.grassMeter.pos.x;
  player.pos.z = mode.grassMeter.pos.z;
  mode.update(0.1);
  assert.equal(mode.step, 2, 'advanced to Drill 2 after grass inspection');
  assert.ok(events.some(e => e.type === 'drillComplete' && e.drill === 1));

  // Step 2: Target Practice -> Shoot 3 cardboard cutout HOA violators
  assert.equal(mode.step, 2);
  const hudStep2 = mode.hud(player);
  assert.ok(hudStep2.includes('DRILL 2/4'));
  assert.ok(hudStep2.includes('cardboard cutout'));

  // Eliminate all 3 target dummies
  for (const t of mode.targets) {
    mode.hitTarget(t.id);
  }
  assert.equal(mode.step, 3, 'advanced to Drill 3 after shooting all 3 dummies');
  assert.ok(events.some(e => e.type === 'drillComplete' && e.drill === 2));

  // Step 3: Suburban Ordinance -> Throw Lawsuit Grenade to bounce on driveway
  assert.equal(mode.step, 3);
  const hudStep3 = mode.hud(player);
  assert.ok(hudStep3.includes('DRILL 3/4'));
  assert.ok(hudStep3.includes('Lawsuit Grenade'));

  sim.throwGrenade(player);
  assert.ok(sim.grenades.length > 0);
  mode.update(0.1);
  assert.equal(mode.step, 4, 'advanced to Drill 4 after throwing/bouncing grenade');
  assert.ok(events.some(e => e.type === 'drillComplete' && e.drill === 3));

  // Step 4: Heavy Machinery -> Mount riding mower and run over row of weeds
  assert.equal(mode.step, 4);
  const hudStep4 = mode.hud(player);
  assert.ok(hudStep4.includes('DRILL 4/4'));
  assert.ok(hudStep4.includes('riding lawn mower'));

  const mower = mode.mower;
  assert.ok(mower);
  player.pos.x = mower.pos.x;
  player.pos.z = mower.pos.z;
  const entered = sim.enterVehicle(player, mower.id);
  assert.equal(entered, true);
  assert.equal(player.inVehicle, mower.id);

  // Run over each weed in the row
  for (const weed of mode.weeds) {
    mower.pos.x = weed.pos.x;
    mower.pos.z = weed.pos.z;
    mode.update(0.1);
  }

  // Completion verification
  assert.equal(mode.completed, true, 'tutorial marked completed');
  assert.equal(sim.over, true, 'sim match ends on certification');
  assert.ok(mode.bonusXpAwarded, 'bonus XP awarded');
  assert.ok(sim.score[0] >= 100, 'score awarded to player team');

  // Verify "HOA BOARD CERTIFICATION PASSED" banner
  const bannerEv = events.find(e => e.type === 'tutorialComplete' || (e.type === 'hardpointRotated' && e.name.includes('CERTIFICATION PASSED')));
  assert.ok(bannerEv, 'emitted certification passed banner event');
  if (bannerEv.banner) {
    assert.equal(bannerEv.banner, 'HOA BOARD CERTIFICATION PASSED');
  }

  // HUD displays completion message inviting player to Cul-de-Sac Clash
  const completedHud = mode.hud(player);
  assert.ok(completedHud.includes('HOA BOARD CERTIFICATION PASSED'));
  assert.ok(completedHud.includes('Cul-de-Sac Clash'));
});

test('Mobile Haptics: triggerHaptic handles unsupported environments gracefully', () => {
  // In Node.js testing environment, navigator is undefined or doesn't have vibrate
  const result = triggerHaptic('fire');
  assert.equal(result, false, 'gracefully returns false without throwing');
  assert.equal(triggerHaptic('unknown'), false);
});

test('Mobile Haptics: triggerHaptic calls navigator.vibrate with expected patterns', () => {
  const calls = [];
  const fakeVibrate = (pattern) => {
    calls.push(pattern);
    return true;
  };

  const nav = typeof globalThis.navigator !== 'undefined' ? globalThis.navigator : (globalThis.navigator = {});
  const origVibrate = nav.vibrate;
  try {
    Object.defineProperty(nav, 'vibrate', {
      value: fakeVibrate,
      configurable: true,
      writable: true,
    });

    // fire: subtle 12ms pulse
    assert.equal(triggerHaptic('fire'), true);
    assert.deepEqual(calls[calls.length - 1], HAPTIC_PATTERNS.fire);
    assert.equal(HAPTIC_PATTERNS.fire, 12);

    // hit: 25ms tactile bump
    assert.equal(triggerHaptic('hit'), true);
    assert.deepEqual(calls[calls.length - 1], HAPTIC_PATTERNS.hit);
    assert.equal(HAPTIC_PATTERNS.hit, 25);

    // kill: double pulse [30, 40, 50]
    assert.equal(triggerHaptic('kill'), true);
    assert.deepEqual(calls[calls.length - 1], [30, 40, 50]);

    // explosion / roadkill: heavy rumble [60, 30, 80]
    assert.equal(triggerHaptic('explosion'), true);
    assert.deepEqual(calls[calls.length - 1], [60, 30, 80]);

    assert.equal(triggerHaptic('roadkill'), true);
    assert.deepEqual(calls[calls.length - 1], [60, 30, 80]);

    // damage: sharp pulse [40]
    assert.equal(triggerHaptic('damage'), true);
    assert.deepEqual(calls[calls.length - 1], [40]);

    // Controls instance method also works
    const controls = new Controls({ canvas: {} });
    assert.equal(controls.triggerHaptic('hit'), true);
  } finally {
    if (origVibrate !== undefined) {
      Object.defineProperty(nav, 'vibrate', { value: origVibrate, configurable: true, writable: true });
    } else {
      delete nav.vibrate;
    }
  }
});

test('web/index.html includes TUTORIAL / FIRING RANGE button and mode selector', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  // Check #btnTutorial button
  assert.ok(html.includes('id="btnTutorial"'), 'index.html contains #btnTutorial button');
  assert.ok(html.includes('TUTORIAL') && html.includes('FIRING RANGE'), 'index.html contains TUTORIAL / FIRING RANGE button text');

  // Check mode selector
  assert.ok(html.includes('id="optMode"'), 'index.html contains #optMode select');
});
