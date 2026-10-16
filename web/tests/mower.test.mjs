import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { Sim } from '../src/engine/sim.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

test('mower: initialization in sim and snapshot', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(42) });
  assert.ok(Array.isArray(sim.vehicles), 'sim.vehicles should be an array');
  assert.equal(sim.vehicles.length, 1, 'should have 1 driveable mower initialized');

  const mower = sim.vehicles[0];
  assert.equal(mower.id, 'mower_driveable');
  assert.deepEqual(mower.pos, { x: -10, y: 0, z: 6 });
  assert.equal(mower.yaw, 0);
  assert.equal(mower.speed, 0);
  assert.equal(mower.maxSpeed, 14);
  assert.equal(mower.reverseSpeed, -5);
  assert.equal(mower.driverId, null);
  assert.equal(mower.hp, 250);
  assert.equal(mower.maxHp, 250);
  assert.equal(mower.isMower, true);
  assert.equal(mower.alive, true);

  const snap = sim.snapshot();
  assert.ok(Array.isArray(snap.vehicles), 'snapshot should include vehicles');
  const snapMower = snap.vehicles.find(v => v.id === 'mower_driveable');
  assert.ok(snapMower, 'mower should exist in snapshot');
  assert.equal(snapMower.hp, 250);
  assert.equal(snapMower.isMower, true);
  assert.equal(snapMower.alive, true);
});

test('mower: actor entering and exiting mower with enterVehicle / exitVehicle', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(42) });
  const a1 = sim.addActor({ id: 'a1', name: 'Actor 1', team: 0, faction: 'karens', isBot: false });
  const a2 = sim.addActor({ id: 'a2', name: 'Actor 2', team: 0, faction: 'karens', isBot: false });
  sim.start();

  const mower = sim.vehicles[0];
  assert.ok(mower);

  // Too far (> 3.0m)
  a1.pos.x = 20;
  a1.pos.z = 20;
  const enteredFar = sim.enterVehicle(a1);
  assert.equal(enteredFar, false, 'cannot enter when > 3m away');
  assert.equal(mower.driverId, null);
  assert.equal(a1.inVehicle, null);

  // Close to mower (within 3.0m)
  a1.pos.x = -10;
  a1.pos.z = 7;
  const enteredClose = sim.enterVehicle(a1);
  assert.equal(enteredClose, true, 'can enter within 3m');
  assert.equal(mower.driverId, a1.id);
  assert.equal(a1.inVehicle, mower.id);

  // Second actor cannot enter occupied mower
  a2.pos.x = -10;
  a2.pos.z = 7;
  const secondEnter = sim.enterVehicle(a2);
  assert.equal(secondEnter, false, 'second actor cannot enter occupied mower');
  assert.equal(mower.driverId, a1.id);

  // Exit vehicle
  const exited = sim.exitVehicle(a1);
  assert.equal(exited, true, 'exitVehicle should succeed');
  assert.equal(mower.driverId, null, 'mower driverId should be cleared');
  assert.equal(a1.inVehicle, null, 'actor inVehicle should be cleared');
  assert.ok(Math.hypot(a1.pos.x - mower.pos.x, a1.pos.z - mower.pos.z) > 0.5, 'actor should dismount next to mower');
});

test('mower: driving accelerates, turns yaw, and syncs driver position', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(42) });
  const driver = sim.addActor({ id: 'driver', name: 'Driver', team: 0, faction: 'hoaDads', isBot: false });
  sim.start();

  const mower = sim.vehicles[0];
  driver.pos.x = mower.pos.x;
  driver.pos.z = mower.pos.z;
  sim.enterVehicle(driver);

  const initialZ = mower.pos.z;
  assert.equal(mower.speed, 0);

  // Accelerate forward
  driver.input.forward = 1;
  sim.step(0.2);

  assert.ok(mower.speed > 0, `mower should accelerate forward (speed: ${mower.speed})`);
  assert.ok(mower.speed <= mower.maxSpeed, 'speed should not exceed maxSpeed');
  assert.ok(mower.pos.z < initialZ, 'moving forward with yaw 0 should decrease z');
  assert.equal(driver.pos.x, mower.pos.x, 'driver X should be synced to mower');
  assert.equal(driver.pos.z, mower.pos.z, 'driver Z should be synced to mower');

  // Steering right changes yaw
  const prevYaw = mower.yaw;
  driver.input.right = 1;
  sim.step(0.2);

  assert.notEqual(mower.yaw, prevYaw, 'steering input should change yaw');
  assert.equal(driver.yaw, mower.yaw, 'driver yaw should stay synced to mower yaw');
});

test('mower: roadkill collision inflicts damage and knockback on enemy actor', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(42) });
  const driver = sim.addActor({ id: 'driver', name: 'Driver', team: 0, faction: 'hoaDads', isBot: false });
  const enemy = sim.addActor({ id: 'enemy', name: 'Enemy', team: 1, faction: 'karens', isBot: false });
  sim.start();

  const mower = sim.vehicles[0];
  mower.pos.x = 0;
  mower.pos.z = 0;
  mower.yaw = 0; // facing -z
  driver.pos.x = 0;
  driver.pos.z = 0;
  sim.enterVehicle(driver);

  // Speed > 4 m/s
  mower.speed = 10;
  enemy.spawnProtectUntil = 0;
  enemy.hp = 100;
  enemy.pos.x = 0;
  enemy.pos.z = -0.5; // directly in front of mower (< 1.8m collision radius)

  sim.drainEvents();
  sim.step(0.05);

  assert.equal(enemy.hp, 15, 'roadkill should inflict exactly 85 damage (100 - 85 = 15)');
  assert.ok(enemy.vel.z < -10, `enemy should have heavy knockback velocity facing forward (vel.z: ${enemy.vel.z})`);

  const roadkills = sim.drainEvents().filter(e => e.type === 'roadkill');
  assert.equal(roadkills.length, 1, 'should emit roadkill event');
  assert.equal(roadkills[0].killerId, driver.id);
  assert.equal(roadkills[0].targetId, enemy.id);
  assert.equal(roadkills[0].vehicle, 'mower');
});

test('mower: explosion on lethal damage dismounts/kills driver and deals radial damage', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(42) });
  const driver = sim.addActor({ id: 'driver', name: 'Driver', team: 0, faction: 'hoaDads', isBot: false });
  const enemyNearby = sim.addActor({ id: 'foe', name: 'Foe', team: 1, faction: 'karens', isBot: false });
  const bystanderFar = sim.addActor({ id: 'far', name: 'Far', team: 1, faction: 'karens', isBot: false });
  sim.start();

  const mower = sim.vehicles[0];
  mower.pos.x = 0;
  mower.pos.z = 0;
  driver.pos.x = 0;
  driver.pos.z = 0;
  sim.enterVehicle(driver);

  enemyNearby.pos.x = 2; // 2m away (within 5m radial damage)
  enemyNearby.pos.z = 0;
  enemyNearby.hp = 100;
  enemyNearby.spawnProtectUntil = 0;

  bystanderFar.pos.x = 20; // 20m away (outside 5m radial damage)
  bystanderFar.pos.z = 0;
  bystanderFar.hp = 100;
  bystanderFar.spawnProtectUntil = 0;

  sim.drainEvents();

  // Inflict lethal damage to mower
  sim.damageVehicle(mower, 250);

  assert.equal(mower.alive, false, 'mower should be dead');
  assert.equal(mower.hp, 0, 'mower hp should be 0');
  assert.equal(driver.inVehicle, null, 'driver should be dismounted');
  assert.equal(driver.alive, false, 'driver should be killed by 100 lethal explosion damage');
  assert.equal(driver.hp, 0, 'driver hp should be 0');

  // Radial damage to nearby enemy (100 * (1 - 2/5) = 60 damage -> hp: 100 - 60 = 40)
  assert.ok(enemyNearby.hp < 100, `nearby enemy should take radial damage (hp: ${enemyNearby.hp})`);
  assert.equal(Math.round(enemyNearby.hp), 40, 'nearby enemy should take 60 damage');
  assert.equal(bystanderFar.hp, 100, 'bystander outside 5m should take no damage');

  const events = sim.drainEvents();
  const destroyed = events.find(e => e.type === 'vehicleDestroyed');
  assert.ok(destroyed, 'should emit vehicleDestroyed event');
  assert.equal(destroyed.vehicle, 'mower');

  const explosions = events.filter(e => e.type === 'explosion');
  assert.ok(explosions.length > 0, 'should emit explosion event');
});
