// Progression v2: per-weapon camo challenges and Prestige ("Re-Zoning"). Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CareerProfile, CAMO_TIERS, CAMO_XP, HOA_RANKS, PRESTIGE_MAX } from '../src/engine/progression.js';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
beforeEach(() => store.clear());

const kills = (c, weaponId, n, headshot = false) => { for (let i = 0; i < n; i++) c.recordKill({ weaponId, headshot }); };

test('camo: tiers unlock in order from that weapon\'s kills and headshots', () => {
  const unlocked = [];
  const c = new CareerProfile({ onCamo: (w, t) => unlocked.push(`${w}:${t.id}`) });
  kills(c, 'allowance', CAMO_TIERS[0].kills - 1);
  assert.equal(c.camoFor('allowance'), null);
  kills(c, 'allowance', 1);
  assert.equal(c.camoFor('allowance').id, 'beige');
  kills(c, 'allowance', CAMO_TIERS[1].kills, false);
  assert.equal(c.camoFor('allowance').id, 'beige', 'mulch also needs headshots');
  kills(c, 'allowance', CAMO_TIERS[1].headshots, true);
  assert.equal(c.camoFor('allowance').id, 'mulch');
  assert.equal(c.camoFor('trustFund'), null, 'camo is per weapon');
  assert.deepEqual(unlocked, ['allowance:beige', 'allowance:mulch']);
});

test('camo: 24K Gold is earned in the full game and grants Gold Standard', () => {
  const c = new CareerProfile();
  const gold = CAMO_TIERS.at(-1);
  kills(c, 'trustFund', gold.headshots, true);
  kills(c, 'trustFund', gold.kills - gold.headshots);
  assert.equal(c.camoFor('trustFund').id, 'gold');
  assert.ok(c.profile.achievements.ACH_GOLD_STANDARD);
});

test('camo: the demo stops at Granite and shows gold as locked', () => {
  const c = new CareerProfile({ isDemo: true });
  kills(c, 'allowance', 300, true);
  assert.equal(c.camoFor('allowance').id, 'granite');
  const pr = c.camoProgress('allowance');
  assert.equal(pr.next, null);
  assert.equal(pr.lockedGold, true);
});

test('camo: each unlock pays XP', () => {
  const c = new CareerProfile();
  kills(c, 'permit', CAMO_TIERS[0].kills - 1);
  const before = c.profile.xp;
  kills(c, 'permit', 1);
  assert.equal(c.profile.xp - before, 25 + CAMO_XP);
});

test('prestige: only from the top rank in the full game; keeps camos, resets rank', () => {
  const demo = new CareerProfile({ isDemo: true });
  demo.addXp(HOA_RANKS.at(-1).xp);
  assert.equal(demo.canPrestige(), false, 'demo cannot prestige');
  store.clear();

  const c = new CareerProfile();
  kills(c, 'allowance', CAMO_TIERS[0].kills);
  assert.equal(c.canPrestige(), false, 'not yet top rank');
  c.addXp(HOA_RANKS.at(-1).xp);
  assert.equal(c.canPrestige(), true);
  assert.equal(c.prestige(), true);
  assert.equal(c.profile.prestige, 1);
  assert.equal(c.getRankInfo().rank, 1);
  assert.equal(c.profile.xp, 0);
  assert.equal(c.camoFor('allowance').id, 'beige', 'camos survive');
  assert.ok(c.profile.achievements.ACH_REZONED);
});

test('prestige: capped at PRESTIGE_MAX and persisted', () => {
  const c = new CareerProfile();
  for (let i = 0; i < PRESTIGE_MAX + 2; i++) { c.addXp(HOA_RANKS.at(-1).xp); c.prestige(); }
  assert.equal(c.profile.prestige, PRESTIGE_MAX);
  assert.equal(new CareerProfile().profile.prestige, PRESTIGE_MAX, 'reloaded from storage');
});

test('old v1 profiles load with empty camo data', () => {
  store.set('hoa.career.v1', JSON.stringify({ xp: 500, kills: 12, weaponKills: { allowance: 12 } }));
  const c = new CareerProfile();
  assert.equal(c.profile.prestige, 0);
  assert.deepEqual(c.profile.camos, {});
  assert.equal(c.camoProgress('allowance').kills, 12);
});

test('challenges: first clear pays the reward XP once', () => {
  const c = new CareerProfile();
  const ch = { id: 'challenge_x', reward: { xp: 500 } };
  assert.equal(c.completeChallenge(ch), true);
  assert.equal(c.profile.xp, 500);
  assert.equal(c.completeChallenge(ch), false);
  assert.equal(c.profile.xp, 500);
});
