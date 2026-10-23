// The tutorial must be finishable by driving it, not by setting its step. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { buildMap } from '../src/engine/map.js';
import { Sim, yawTo } from '../src/engine/sim.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

test('tutorial drill 4: mount the mower and mow all three weeds by steering', () => {
  const sim = new Sim({ rules: content.rules, weapons, rng: mulberry32(1), mode: 'tutorial', map: buildMap('culdesac') });
  const me = sim.addActor({ id: 'you', name: 'You', team: 0, faction: 'karens', isBot: false });
  sim.start();
  const md = sim.mode;
  md.step = 4;
  const mower = md.mower;
  Object.assign(me.pos, { x: mower.pos.x + 1.5, y: 0, z: mower.pos.z });
  assert.ok(sim.enterVehicle(me), 'player standing next to the tutorial mower can mount it');
  for (let i = 0; i < 60 * 40 && !md.completed; i++) {
    const w = md.weeds.find(x => !x.cut);
    if (w) {
      const dy = wrap(yawTo(w.pos.x - mower.pos.x, w.pos.z - mower.pos.z) - mower.yaw);
      me.input.right = dy > 0.08 ? -1 : dy < -0.08 ? 1 : 0;
      me.input.forward = 1;
    }
    sim.step(1 / 60);
    sim.drainEvents();
  }
  assert.ok(md.weeds.every(w => w.cut), `weeds cut: ${md.weeds.filter(w => w.cut).length}/3, mower at ${mower.pos.x.toFixed(1)},${mower.pos.z.toFixed(1)}`);
  assert.ok(md.completed, 'tutorial completes after the last weed');
});
