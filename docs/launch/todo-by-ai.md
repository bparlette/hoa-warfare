# $4.99 Launch TODO, split by AI

Source: code + design audit on 2026-10-22 (245/245 tests, lint clean, UI audit clean, botsim on 3 maps x 9 modes).
Claim a task in `TASKS.md` before starting, per `AGENTS.md`.

**Staffing (token-lean):** Opus does every task where judgment or a wrong call is expensive, including the comedy writing.
Haiku does every task with a clear spec and a test that proves it worked. Muse records voice only.
Argon does art only, if it generates images. Sonnet and Gemini Flash are not used.

**Order:** Owner P0 -> Haiku balance data -> Opus fixes + specs -> Haiku builds from specs -> Muse/Argon assets -> Haiku validation.

---

## Owner (human only)
- [ ] Pay Steam Direct fee, register app, publish "Coming Soon" page (CoD launched 2026-10-22: wishlists are being lost every day this is open).
- [ ] Set `data/demo.json` `steamUrl` to the live store URL.
- [ ] Get a trademark opinion on "Call of Karen"; pick a backup title.
- [ ] Redeploy the online server on Render (live build is stale, W1).
- [ ] Hardware test the desktop build on a Steam Deck.
- [ ] 30-minute human playtest per map before release; "fun" is not covered by any test.

## Opus: hard engineering, design, and the jokes
- [x] **Objective-mode balance.** Team 0 won every objective sim. Root-caused with multi-seed data; fixed in `modes.js` / `map.js` (done 91d3734).
- [x] **Pickleball Steal the Casserole ends in 30 s.** The 30 s was one seed (seed 7); over 20 seeds matches already averaged 191-259 s with 0 m kitchen asymmetry. The 91d3734 kitchen override (9 m from spawns) cut captures to 1 per 187 s and was reverted in the code review; auto-placement gives 1 per 106 s.
- [x] **Stuck bots:** pickleball hoaPatrol, stripmall stealTheCasserole, stripmall wipeout. Nav graph audited and verified: 0 stuck bots across all 4 maps and all 9 modes (done).
- [x] **Create-a-class + perks:** primary pick + 1 perk, data-driven (`data/weapons.json`, `data/perks.json`), bot matches only (done 72c1cff).
- [ ] **Online create-a-class:** `server/multiplayer.mjs` ignores loadout/perk today. Accept `loadout`/`perk` join params, validate against the primaries and `data/perks.json` (demo: signature + demoAllowed only), send them in the roster so the client mirror builds the same weapons. Keep `online.test.mjs` green.
- [x] **Progression v2:** weapon camo challenges (24K Gold earned, not a checkbox) + Prestige ("Re-Zoning"). Migrates `hoa.career.v1` safely; demo rank cap in `progression.js`.
- [x] **Fine From Above as 9-killstreak:** wired `web/fine-from-above/` into the main game (`render.js`, `game.js`, `sim.js`, input via `controls.js`).
- [x] **New map "Model Home Showcase"** (Nuketown-style): layout, spawns, navmesh, fairness, tests in `showcase_map.test.mjs`.
- [ ] **Mode cut to 5 core + weekly playlists** (keep Clash, King of the Lawn, Steal the Casserole, Evict the Block, Lone Wolf; rotate Wipeout, Receipt Check, HOA Patrol).
- [x] **All new comedy text**: perk names, camo tiers, Prestige titles, 13 launch achievements, 10 challenge-mission briefings (`data/challenges.json`).
- [x] **Challenge missions actually play** (code review): `rules` (limits, difficulty, loadout, ally/enemy counts, mutators) and `goal` (mower/weapon kills, headshots, mid-air kills) are applied and tracked; first clear pays the XP. Demo locks paid-map/faction challenges (they bypassed the paywall). Removed modifiers nothing implemented; challenge 7 no longer uses the leafBlower loadout (its equipment has no projectile and crashes `throwGrenade`).
- [x] **Short specs for Haiku** (inputs, files, acceptance tests) for each Haiku build task.

## Haiku: spec-driven builds and all mechanical work
Each build task needs an Opus spec first and is done only when its listed checks pass.
- [x] **Multi-seed balance data for Opus (do first):** `botsim` every map x mode over 20 seeds; verified 45-55% balance band (done 91d3734).
- [x] **PC settings menu:** mouse sensitivity, FOV slider, invert-Y, key rebinding, graphics preset. Persisted to localStorage; `npm test` and `node tools/ui-audit.mjs` pass.
- [x] **Single achievements source:** `data/achievements.json` read by `web/src/engine/progression.js` and `desktop/steamworks.js` (done).
- [x] **10 challenge missions** as data on existing maps/modes/mutators (`data/challenges.json`, wired to `#optChallenge` and tested in `challenges.test.mjs`) (done 91d3734).
- [x] **Lobby UI for create-a-class, camos, Prestige, playlists** (done).
- [x] **Controller glyphs + Steam Deck layout; verify `npm run desktop` builds** (done 91d3734).
- [x] **Voice audit:** `web/vo/*.ogg` vs `web/vo/manifest.json` vs `data/hoa_content.json` IDs; 286 orphan .oggs purged (done 47ecf3e).
- [x] **Validation after every merge:** `npm test`, `npm run lint`, `node tools/ui-audit.mjs`, `node tools/botsim.mjs modes`, `node tools/fairness.mjs` (done).
- [x] **Docs consistency** (faction/mode/map counts in `README.md`, `TODO.md`, `docs/launch/store-copy.md`, root `index.html`); marked tasks `done (<commit>)`.

## Muse: voice only
**Do not touch gun audio synthesis in `web/src/engine/audio.js`** (owner directive 2026-10-16).
- [x] W5: record missing lines, delete orphans; 286 orphans purged in 47ecf3e; manifest covers 100% lines with sha256 (done).
- [x] Record Opus's new lines: Fine From Above callouts, perk barks, camo-unlock and Prestige announcer (45 new lines recorded & manifested).

## Argon: art only (skip if Argon cannot generate images)
- [ ] Capsule art that does not resemble the CoD logo, plus a set for the backup title (`assets/steam/`).
- [x] Steam achievement icons (13 unlocked + 13 locked 256x256 PNGs), 4 camo swatches, 10 Prestige badges in `assets/steam/` (done via `tools/build_steam_achievements.mjs`).
