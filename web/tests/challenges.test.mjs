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
