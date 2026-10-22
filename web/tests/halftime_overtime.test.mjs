// Side fairness (coin-flip start + halftime swap) and casserole sudden death. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../src/core/rng.js';
import { buildMap } from '../src/engine/map.js';
import { Sim } from '../src/engine/sim.js';
import { MODES } from '../src/engine/modes.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));

function sim(mode, seed = 1, map = 'culdesac') {
  const s = new Sim({ rules: content.rules, weapons, rng: mulberry32(seed), mode, map: buildMap(map) });
  for (let i = 0; i < 12; i++) s.addActor({ id: 'p' + i, name: 'P' + i, team: i % 2, faction: 'karens' });
  s.start();
  return s;
}

test('halftime modes: starting sides are a coin flip across seeds', () => {
  for (const mode of ['clash', 'receiptCheck', 'hoaPatrol', 'wipeout']) {
    assert.equal(MODES[mode].HALFTIME, true, `${mode} opts in`);
    const south = new Set();
    for (let seed = 1; seed <= 16; seed++) south.add(sim(mode, seed).mode.spawnSide({ team: 0 }));
    assert.deepEqual([...south].sort(), [0, 1], `${mode}: team 0 starts on both sides`);
  }
});

test('halftime: sides swap once when a team reaches half the score limit', () => {
  const s = sim('clash');
  const before = s.mode.spawnSide({ team: 0 });
  s.drainEvents();
  s.addScore(0, s.scoreLimit / 2 - 1);
  assert.equal(s.mode.spawnSide({ team: 0 }), before, 'no swap before half');
  s.addScore(0, 1);
  assert.equal(s.mode.spawnSide({ team: 0 }), 1 - before, 'swapped at half');
  assert.equal(s.mode.spawnSide({ team: 1 }), before);
  assert.ok(s.drainEvents().some(e => e.type === 'halftime'));
  s.addScore(1, s.scoreLimit / 2);
  assert.equal(s.mode.spawnSide({ team: 0 }), 1 - before, 'only one swap');
});

test('non-halftime modes keep fixed sides', () => {
  for (const mode of ['stealTheCasserole', 'evictTheBlock', 'kingOfTheLawn']) {
    assert.ok(!MODES[mode].HALFTIME, `${mode} keeps its own side rules`);
  }
  assert.equal(sim('stealTheCasserole').mode.spawnSide({ team: 0 }), 0);
});

test('casserole: a tie on the clock goes to sudden death; next capture wins', () => {
  const s = sim('stealTheCasserole');
  s.addScore(0, 1); s.addScore(1, 1);
  const limit = s.timeLimit;
  s.time = limit - 1e-3;
  s.step(1 / 60);
  assert.ok(!s.over, 'tied match continues');
  assert.equal(s.timeLimit, limit + MODES.stealTheCasserole.OVERTIME_SEC);
  assert.equal(s.scoreLimit, 2);
  assert.ok(s.drainEvents().some(e => e.type === 'overtime'));
  s.addScore(1, 1);
  assert.ok(s.over);
  assert.equal(s.winner, 1);
});

test('casserole: a tie after overtime is a draw; a lead on the clock still wins', () => {
  const tie = sim('stealTheCasserole');
  tie.time = tie.timeLimit; tie.step(1 / 60);
  tie.time = tie.timeLimit; tie.step(1 / 60);
  assert.ok(tie.over);
  assert.equal(tie.winner, null);
  const lead = sim('stealTheCasserole');
  lead.addScore(0, 1);
  lead.time = lead.timeLimit; lead.step(1 / 60);
  assert.ok(lead.over);
  assert.equal(lead.winner, 0);
});
