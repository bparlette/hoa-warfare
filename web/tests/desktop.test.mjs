// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SteamAPI, SteamworksBridge, ACHIEVEMENTS, ACHIEVEMENT_MAP } from '../../desktop/steamworks.js';
import { WINDOW_CONFIG, startLoopbackServer } from '../../desktop/main.mjs';

const EXPECTED_ACHIEVEMENT_KEYS = [
  'ACH_FIRST_FINE',
  'ACH_LAWN_ORDER',
  'ACH_CASSEROLE_THIEF',
  'ACH_HOA_PATROL',
  'ACH_EVICTION',
  'ACH_HELO_DOWN',
  'ACH_STREAK_5',
  'ACH_CAMP_SNITCH',
  'ACH_LAWSUIT',
  'ACH_TROPHY_HUNTER',
  'ACH_FINE_FROM_ABOVE',
  'ACH_GOLD_STANDARD',
  'ACH_REZONED'
];

test('desktop: SteamAPI mock/fallback initializes safely', () => {
  const bridge = new SteamworksBridge({ appId: 480 });
  assert.equal(bridge.initialized, false);

  const status = bridge.init();
  assert.equal(status.initialized, true);
  assert.equal(status.success, true);
  assert.equal(status.offline, true);
  assert.equal(status.appId, 480);
  assert.ok(typeof status.steamId === 'string' && status.steamId.length > 0);
  assert.ok(typeof status.personaName === 'string' && status.personaName.length > 0);

  // Idempotency check: re-initializing returns current status without throwing
  const status2 = bridge.init(480);
  assert.equal(status2.initialized, true);
  assert.equal(status2.steamId, status.steamId);

  // Default singleton instance test
  const defaultStatus = SteamAPI.init();
  assert.equal(defaultStatus.initialized, true);
  assert.ok(SteamAPI.getStatus().initialized);
});

test('desktop: achievement unlocking and querying works without errors', () => {
  const bridge = new SteamworksBridge({ appId: 480 });
  bridge.init();
  bridge.resetAllStats();

  // Initially locked
  assert.equal(bridge.isAchievementUnlocked('ACH_FIRST_FINE'), false);
  assert.equal(bridge.isAchievementUnlocked('ACH_LAWN_ORDER'), false);

  // Unlock first achievement
  const unlockResult = bridge.unlockAchievement('ACH_FIRST_FINE');
  assert.equal(unlockResult, true);
  assert.equal(bridge.isAchievementUnlocked('ACH_FIRST_FINE'), true);
  assert.equal(bridge.isAchievementUnlocked('ACH_LAWN_ORDER'), false);

  // Idempotent unlock
  const unlockResultAgain = bridge.unlockAchievement('ACH_FIRST_FINE');
  assert.equal(unlockResultAgain, true);
  assert.equal(bridge.isAchievementUnlocked('ACH_FIRST_FINE'), true);

  // Unlock second achievement
  bridge.unlockAchievement('ACH_CAMP_SNITCH');
  assert.equal(bridge.isAchievementUnlocked('ACH_CAMP_SNITCH'), true);

  // getAchievements returns updated statuses
  const all = bridge.getAchievements();
  assert.equal(all.length, ACHIEVEMENTS.length);
  const firstFine = all.find(a => a.id === 'ACH_FIRST_FINE');
  const campSnitch = all.find(a => a.id === 'ACH_CAMP_SNITCH');
  const lawnOrder = all.find(a => a.id === 'ACH_LAWN_ORDER');

  assert.equal(firstFine.unlocked, true);
  assert.equal(campSnitch.unlocked, true);
  assert.equal(lawnOrder.unlocked, false);

  // Clear specific achievement
  bridge.clearAchievement('ACH_FIRST_FINE');
  assert.equal(bridge.isAchievementUnlocked('ACH_FIRST_FINE'), false);
  assert.equal(bridge.isAchievementUnlocked('ACH_CAMP_SNITCH'), true);

  // Reset all
  bridge.resetAllStats();
  assert.equal(bridge.isAchievementUnlocked('ACH_CAMP_SNITCH'), false);
  assert.equal(bridge.getStatus().unlockedCount, 0);

  // Graceful handling of invalid achievement IDs
  assert.equal(bridge.unlockAchievement(''), false);
  assert.equal(bridge.unlockAchievement(null), false);
  assert.equal(bridge.isAchievementUnlocked(''), false);
  assert.equal(bridge.isAchievementUnlocked(null), false);
});

test('desktop: every achievement definition is valid with name, description, and ID', () => {
  assert.equal(ACHIEVEMENTS.length, 13, 'Launch Steam Achievements');

  const seenIds = new Set();
  for (const ach of ACHIEVEMENTS) {
    assert.ok(typeof ach.id === 'string' && ach.id.startsWith('ACH_'), `Achievement id must start with ACH_: ${ach.id}`);
    assert.ok(typeof ach.name === 'string' && ach.name.trim().length > 0, `Achievement must have name: ${ach.id}`);
    assert.ok(typeof ach.description === 'string' && ach.description.trim().length > 0, `Achievement must have description: ${ach.id}`);
    assert.ok(!seenIds.has(ach.id), `Duplicate achievement ID found: ${ach.id}`);
    seenIds.add(ach.id);
  }

  // Ensure all 10 required keys are present
  for (const expectedKey of EXPECTED_ACHIEVEMENT_KEYS) {
    assert.ok(ACHIEVEMENT_MAP[expectedKey], `Missing expected achievement: ${expectedKey}`);
    assert.equal(ACHIEVEMENT_MAP[expectedKey].id, expectedKey);
  }

  // Verify specific launch achievement content
  assert.equal(ACHIEVEMENT_MAP.ACH_FIRST_FINE.name, 'First Citation');
  assert.equal(ACHIEVEMENT_MAP.ACH_FIRST_FINE.description, 'Score your first kill.');

  assert.equal(ACHIEVEMENT_MAP.ACH_LAWN_ORDER.name, 'Lawn & Order');
  assert.equal(ACHIEVEMENT_MAP.ACH_LAWN_ORDER.description, 'Win a Cul-de-Sac Clash match.');

  assert.equal(ACHIEVEMENT_MAP.ACH_CASSEROLE_THIEF.name, 'Casserole Bandit');
  assert.equal(ACHIEVEMENT_MAP.ACH_CASSEROLE_THIEF.description, 'Capture enemy casserole in Steal the Casserole.');

  assert.equal(ACHIEVEMENT_MAP.ACH_HOA_PATROL.name, 'Neighborhood Watch');
  assert.equal(ACHIEVEMENT_MAP.ACH_HOA_PATROL.description, 'Capture 3 zones in HOA Patrol.');

  assert.equal(ACHIEVEMENT_MAP.ACH_EVICTION.name, 'Eviction Notice');
  assert.equal(ACHIEVEMENT_MAP.ACH_EVICTION.description, 'Post or defuse notice in Evict the Block.');

  assert.equal(ACHIEVEMENT_MAP.ACH_HELO_DOWN.name, "Dad's Pride Grounded");
  assert.equal(ACHIEVEMENT_MAP.ACH_HELO_DOWN.description, "Shoot down Dad's Helicopter.");

  assert.equal(ACHIEVEMENT_MAP.ACH_STREAK_5.name, 'Overbearing HOA');
  assert.equal(ACHIEVEMENT_MAP.ACH_STREAK_5.description, "Call in Dad's Helicopter killstreak.");

  assert.equal(ACHIEVEMENT_MAP.ACH_CAMP_SNITCH.name, 'Get Moving!');
  assert.equal(ACHIEVEMENT_MAP.ACH_CAMP_SNITCH.description, 'Trigger a camping self-snitch.');

  assert.equal(ACHIEVEMENT_MAP.ACH_LAWSUIT.name, 'See You in Court');
  assert.equal(ACHIEVEMENT_MAP.ACH_LAWSUIT.description, 'Get a kill with a Lawsuit Grenade.');

  assert.equal(ACHIEVEMENT_MAP.ACH_TROPHY_HUNTER.name, 'Everyone Gets a Trophy');
  assert.equal(ACHIEVEMENT_MAP.ACH_TROPHY_HUNTER.description, 'Get a Participation Trophy melee kill.');

  assert.equal(ACHIEVEMENT_MAP.ACH_FINE_FROM_ABOVE.name, 'Fine From Above');
  assert.equal(ACHIEVEMENT_MAP.ACH_FINE_FROM_ABOVE.description, 'Call in the HOA drone gunship with a 9-killstreak.');

  assert.equal(ACHIEVEMENT_MAP.ACH_GOLD_STANDARD.name, 'Gold Standard');
  assert.equal(ACHIEVEMENT_MAP.ACH_GOLD_STANDARD.description, 'Earn 24K Gold camo on any weapon.');

  assert.equal(ACHIEVEMENT_MAP.ACH_REZONED.name, 'Re-Zoned');
  assert.equal(ACHIEVEMENT_MAP.ACH_REZONED.description, 'Reach Supreme HOA Board President and Re-Zone (Prestige).');
});

test('desktop: Steam achievement icon PNG assets exist and match schema', () => {
  for (const ach of ACHIEVEMENTS) {
    const unlockedPath = resolve(`assets/steam/achievements/${ach.icon}.png`);
    const lockedPath = resolve(`assets/steam/achievements/${ach.icon}_locked.png`);
    assert.ok(existsSync(unlockedPath), `Unlocked achievement icon must exist: ${unlockedPath}`);
    assert.ok(existsSync(lockedPath), `Locked achievement icon must exist: ${lockedPath}`);
  }
});

test('desktop: wrapper configuration defines 1920x1080 default, fullscreen option, autoHideMenuBar', () => {
  assert.equal(WINDOW_CONFIG.width, 1920);
  assert.equal(WINDOW_CONFIG.height, 1080);
  assert.equal(WINDOW_CONFIG.autoHideMenuBar, true);
  assert.ok('fullscreen' in WINDOW_CONFIG);
  assert.ok(WINDOW_CONFIG.webPreferences.preload.endsWith('preload.cjs'));
  assert.equal(WINDOW_CONFIG.webPreferences.contextIsolation, true);
  assert.equal(WINDOW_CONFIG.webPreferences.nodeIntegration, false);
});

test('desktop: preload script exists and exports required achievements and API', () => {
  const preloadPath = resolve('desktop/preload.cjs');
  assert.ok(existsSync(preloadPath), 'preload.cjs must exist in desktop/');

  const preloadContent = readFileSync(preloadPath, 'utf8');
  assert.ok(preloadContent.includes('exposeInMainWorld'), 'preload.cjs must use exposeInMainWorld');
  assert.ok(preloadContent.includes('SteamAPI'), 'preload.cjs must expose SteamAPI');
  for (const key of EXPECTED_ACHIEVEMENT_KEYS) {
    assert.ok(preloadContent.includes(key), `preload.cjs must reference ${key}`);
  }
});

test('desktop: internal loopback server starts on ephemeral port without CORS issues', async () => {
  const { server, port, url } = await startLoopbackServer(0);
  assert.ok(port > 0);
  assert.ok(url.startsWith(`http://127.0.0.1:${port}`));

  // Fetch index.html through loopback
  const res = await fetch(url);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('Call of Karen'));

  // Clean shutdown
  await new Promise(r => server.close(r));
});
