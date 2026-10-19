// Regression test for the free web demo package (tools/package_demo.mjs).
//
// The demo used to ship the ENTIRE paid game: the full data/hoa_content.json (16 factions) plus a
// game.js where the one and only gate was <script>window.__HOA_DEMO__ = true;</script>. Deleting
// that line in DevTools unlocked the $4.99 build. This test actually RUNS the packer and inspects
// what it wrote, so a future refactor cannot silently put the paid content back in the zip.
//
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEMO_FACTIONS } from '../src/engine/game.js';
import { Funnel } from '../src/engine/funnel.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEMO = new URL('../../dist/demo/', import.meta.url);
const fullContent = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url), 'utf8'));
const demoConfig = JSON.parse(readFileSync(new URL('../../data/demo.json', import.meta.url), 'utf8'));

// Paid = every shipped faction that is not in the demo. Computed, not hardcoded, so a faction
// added later is covered automatically.
const PAID_FACTIONS = Object.keys(fullContent.factions).filter(id => !DEMO_FACTIONS.includes(id));

let packed = false;
function packOnce() {
  if (packed) return;
  execFileSync('node', ['tools/package_demo.mjs', '--no-zip'], { cwd: ROOT, stdio: 'pipe' });
  packed = true;
}

const readDemoData = name => readFileSync(new URL(`data/${name}`, DEMO), 'utf8');

test('the packer ships demo content only (no paid factions, no full content file)', () => {
  assert.ok(PAID_FACTIONS.length > 0, 'the demo must actually exclude some factions for this test to mean anything');
  packOnce();

  assert.equal(existsSync(new URL('data/hoa_content.json', DEMO)), false, 'the full content file must not be in the demo pack');

  const content = JSON.parse(readDemoData('demo_content.json'));
  assert.equal(content.__demo, true, 'demo_content.json carries the build marker');
  assert.deepEqual(Object.keys(content.factions).sort(), [...DEMO_FACTIONS].sort(), 'exactly the demo factions ship');
  for (const id of PAID_FACTIONS) {
    assert.equal(content.factions[id], undefined, `paid faction ${id} must not be in the demo content`);
  }
  // Rivalry quips name two factions; a quip that names a paid faction would leak it.
  for (const r of content.rivalry) {
    assert.ok(DEMO_FACTIONS.includes(r.killer) && DEMO_FACTIONS.includes(r.victim), `rivalry ${JSON.stringify(r)} names a paid faction`);
  }
  // Design notes (angle / joke mines / rivalsFirst) describe the paid game and nothing reads them.
  for (const [id, faction] of Object.entries(content.factions)) {
    assert.equal(faction.brief, undefined, `${id} must not ship its design brief`);
  }
});

test('no paid faction id appears in any shipped data file', () => {
  packOnce();
  for (const file of readdirSync(new URL('data/', DEMO))) {
    const body = readDemoData(file);
    for (const id of PAID_FACTIONS) {
      assert.ok(!body.includes(`"${id}"`), `paid faction ${id} leaks into data/${file}`);
    }
  }
});

test('the demo build is a compile-time constant, not a client flag', () => {
  packOnce();
  const game = readFileSync(new URL('src/engine/game.js', DEMO), 'utf8');
  assert.match(game, /export const DEMO_BUILD = true;/, 'the packer must rewrite the DEMO_BUILD marker');
  assert.ok(!game.includes('export const DEMO_BUILD = false;'), 'the shipped demo must not keep DEMO_BUILD false');
  assert.match(game, /'data\/demo_content\.json'/, 'the demo loads the whitelisted content file');
  // Only a comment may mention the paid file: no string literal may point at it.
  assert.ok(!/['"][^'"]*hoa_content\.json['"]/.test(game), 'no shipped code path may load hoa_content.json');
  // Paid features must be gated on the build constant, so a DevTools flip of the flag cannot
  // re-enable them.
  assert.match(game, /goldSkin: !DEMO_BUILD && !isDemo/, 'gold skin gate is build-based');
  assert.match(game, /shotgunsOnly: !DEMO_BUILD && !isDemo/, 'mutator gates are build-based');
  assert.match(game, /map: !DEMO_BUILD && !isDemo/, 'paid maps are gated on the build');
});

test('the end-of-match Steam card cannot be made skippable', () => {
  assert.ok(demoConfig.ctaLockSec >= 3, 'data/demo.json must keep ctaLockSec >= 3');
  // A future edit to demo.json (or a portal override) must not drop the lock below 3s.
  assert.equal(new Funnel({ ctaLockSec: 0 }).cfg.ctaLockSec, 3);
  assert.equal(new Funnel({ ctaLockSec: 2 }).cfg.ctaLockSec, 3);
  assert.equal(new Funnel({ ctaLockSec: 9 }).cfg.ctaLockSec, 9);
  assert.equal(new Funnel({ ctaLockSec: 'nonsense' }).cfg.ctaLockSec, 4);
});
