import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODES } from '../src/engine/modes.js';
import { MAPS } from '../src/engine/map.js';

const challenges = JSON.parse(readFileSync(new URL('../../data/challenges.json', import.meta.url)));
const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const validFactions = new Set(Object.keys(content.factions).filter(f => content.factions[f].status !== 'draft'));

test('challenges.json: contains exactly 10 curated missions', () => {
  assert.equal(challenges.length, 10);
  const ids = new Set();
  for (const c of challenges) {
    assert.ok(c.id, 'challenge has an id');
    assert.ok(!ids.has(c.id), `duplicate challenge id: ${c.id}`);
    ids.add(c.id);
  }
});

test('challenges.json: all challenges reference valid maps, modes, and shipping factions', () => {
  for (const c of challenges) {
    assert.ok(c.title && c.title.length > 3, `challenge ${c.id} title valid`);
    assert.ok(c.briefing && c.briefing.length > 10, `challenge ${c.id} briefing valid`);
    assert.ok(MAPS[c.map], `challenge ${c.id} maps to valid MAP: ${c.map}`);
    assert.ok(MODES[c.mode], `challenge ${c.id} maps to valid MODE: ${c.mode}`);
    assert.ok(validFactions.has(c.playerFaction), `challenge ${c.id} valid playerFaction: ${c.playerFaction}`);
    assert.ok(validFactions.has(c.enemyFaction), `challenge ${c.id} valid enemyFaction: ${c.enemyFaction}`);
    assert.ok(c.reward && c.reward.xp > 0 && c.reward.title && c.reward.badge, `challenge ${c.id} has reward`);
  }
});

import { challengeApplies, challengeLocked, goalHit, challengePassed } from '../src/engine/challenges.js';

const weaponsData = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const DEMO_FACTIONS = ['karens', 'tradwives', 'hoaDads', 'furries', 'trumpers', 'pickleballRetirees'];

test('challenges.json: every rule and goal is one the game actually applies', () => {
  const RULES = new Set(['scoreLimit', 'timeLimit', 'difficulty', 'loadout', 'allies', 'enemies', 'mutators']);
  for (const c of challenges) {
    assert.ok(!c.modifiers, `${c.id}: no unimplemented modifiers`);
    for (const k of Object.keys(c.rules || {})) assert.ok(RULES.has(k), `${c.id}: rule ${k} is applied by game.js`);
    if (c.rules?.difficulty) assert.ok(['easy', 'medium', 'hard'].includes(c.rules.difficulty), `${c.id}: difficulty`);
    if (c.rules?.loadout) {
      const l = weaponsData.loadouts[c.rules.loadout];
      assert.ok(l, `${c.id}: loadout exists`);
      assert.ok(weaponsData.weapons[l.equipment]?.projectile, `${c.id}: equipment is throwable (leafBlower crashes throwGrenade)`);
    }
    if (c.goal) {
      assert.ok(['kills', 'headshots', 'airborneKills', 'roadkills'].includes(c.goal.stat), `${c.id}: goal stat`);
      assert.ok(c.goal.count > 0 && c.goal.label, `${c.id}: goal count/label`);
    }
  }
});

test('challenges: locked in the demo when they need a paid map or faction', () => {
  const maps = MAPS;
  const free = challenges.find(c => maps[c.map].freeInDemo && DEMO_FACTIONS.includes(c.playerFaction));
  const paid = challenges.find(c => !maps[c.map].freeInDemo);
  assert.ok(free && paid);
  assert.equal(challengeLocked(free, { demo: true, demoFactions: DEMO_FACTIONS, maps }), false);
  assert.equal(challengeLocked(paid, { demo: true, demoFactions: DEMO_FACTIONS, maps }), true);
  assert.equal(challengeLocked(paid, { demo: false, demoFactions: DEMO_FACTIONS, maps }), false);
});

test('challenges: only apply while their map and mode are selected', () => {
  const c = challenges[0];
  assert.ok(challengeApplies(c, { map: c.map, mode: c.mode }));
  assert.ok(!challengeApplies(c, { map: c.map, mode: 'loneWolf' }));
});

test('challenges: goals count the right kills; passing needs a win and the goal', () => {
  const mower = { stat: 'kills', weaponId: 'mower', count: 5 };
  assert.ok(goalHit(mower, { type: 'kill', killerId: 'you', weaponId: 'mower' }, 'you'));
  assert.ok(!goalHit(mower, { type: 'kill', killerId: 'you', weaponId: 'allowance' }, 'you'));
  assert.ok(!goalHit(mower, { type: 'kill', killerId: 'b1', weaponId: 'mower' }, 'you'));
  assert.ok(goalHit({ stat: 'headshots', count: 1 }, { type: 'kill', killerId: 'you', headshot: true }, 'you'));
  assert.ok(!goalHit({ stat: 'airborneKills', count: 1 }, { type: 'kill', killerId: 'you', killerAirborne: false }, 'you'));
  // run-overs count, not kills (the mower hits for 85)
  const runOver = { stat: 'roadkills', count: 5 };
  assert.ok(goalHit(runOver, { type: 'roadkill', killerId: 'you', targetId: 'b1' }, 'you'));
  assert.ok(!goalHit(runOver, { type: 'roadkill', killerId: 'b2', targetId: 'b1' }, 'you'));
  assert.ok(!goalHit(runOver, { type: 'kill', killerId: 'you', weaponId: 'allowance' }, 'you'));
  const c = { goal: mower };
  assert.ok(!challengePassed(c, { won: true, progress: 4 }));
  assert.ok(!challengePassed(c, { won: false, progress: 9 }));
  assert.ok(challengePassed(c, { won: true, progress: 5 }));
  assert.ok(challengePassed({}, { won: true }));
});
