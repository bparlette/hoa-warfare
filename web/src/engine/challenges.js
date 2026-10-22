// Challenge missions (data/challenges.json): engine-agnostic rules, so they run in Node tests.

/** A challenge only applies while its map and mode are still the selected ones. */
export function challengeApplies(c, { map, mode }) {
  return !!c && c.map === map && c.mode === mode;
}

/** Locked in the free demo when it needs a paid map or a non-demo faction. */
export function challengeLocked(c, { demo, demoFactions, maps }) {
  return !!demo && (!maps[c.map]?.freeInDemo || !demoFactions.includes(c.playerFaction));
}

/** Does this sim event count toward the challenge goal for player `meId`? */
export function goalHit(goal, ev, meId) {
  if (!goal || ev.type !== 'kill' || ev.killerId !== meId) return false;
  if (goal.weaponId && ev.weaponId !== goal.weaponId) return false;
  if (goal.stat === 'headshots') return !!ev.headshot;
  if (goal.stat === 'airborneKills') return !!ev.killerAirborne;
  return true;
}

/** Passed: the player's side won and the goal (if any) was reached. */
export function challengePassed(c, { won, progress = 0 }) {
  return !!won && (!c.goal || progress >= c.goal.count);
}
