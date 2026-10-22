// Menu modes: five core modes plus one weekly featured mode. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, CORE_MODES, ROTATING_MODES, menuModes, weeklyMode, WEEK_MS } from '../src/engine/modes.js';

test('playlists: five core modes, every rotating mode still exists', () => {
  assert.equal(CORE_MODES.length, 5);
  for (const id of [...CORE_MODES, ...ROTATING_MODES]) assert.ok(MODES[id], id);
  assert.ok(!CORE_MODES.some(id => ROTATING_MODES.includes(id)));
});

test('playlists: the featured mode rotates weekly through every rotating mode', () => {
  const seen = new Set();
  for (let w = 0; w < ROTATING_MODES.length; w++) seen.add(weeklyMode(w));
  assert.deepEqual([...seen].sort(), [...ROTATING_MODES].sort());
  assert.equal(weeklyMode(5), weeklyMode(5 + ROTATING_MODES.length));
  assert.equal(weeklyMode(-1), ROTATING_MODES[ROTATING_MODES.length - 1]);
});

test('playlists: the menu is the core five then this week\'s mode', () => {
  const ids = menuModes(7);
  assert.equal(ids.length, 6);
  assert.deepEqual(ids.slice(0, 5), CORE_MODES);
  assert.equal(ids[5], weeklyMode(7));
  assert.equal(menuModes(Math.floor(Date.now() / WEEK_MS)).length, 6);
});
