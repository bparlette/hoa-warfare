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
- [ ] **Objective-mode balance.** Team 0 won every objective sim (Evict the Block 4-0 on culdesac and pickleball, Steal the Casserole 3-0). Root-cause with Haiku's multi-seed data; fix in `modes.js` / `map.js`.
- [ ] **Pickleball Steal the Casserole ends in 30 s** (kitchens ~18 m apart). Move kitchens; verify with `node tools/fairness.mjs`.
- [ ] **Stuck bots:** pickleball hoaPatrol (22), stripmall stealTheCasserole (22, times out 2-1), stripmall wipeout (12). Fix nav graph.
- [ ] **Create-a-class + perks:** primary pick + 1 perk, data-driven (`data/weapons.json`, new `data/perks.json`), server-validated in `server/multiplayer.mjs` (keep `online.test.mjs` green).
- [ ] **Progression v2:** weapon camo challenges (24K Gold earned, not a checkbox) + Prestige ("Re-Zoning"). Migrate `hoa.career.v1` safely; keep demo rank cap in `progression.js`.
- [ ] **Fine From Above as 9-killstreak:** wire `web/fine-from-above/` into the main game (`render.js`, `game.js`, `sim.js`, input via `controls.js`).
- [ ] **New map "Model Home Showcase"** (Nuketown-style): layout, spawns, navmesh, fairness, tests mirroring `stripmall`.
- [ ] **Mode cut to 5 core + weekly playlists** (keep Clash, King of the Lawn, Steal the Casserole, Evict the Block, Lone Wolf; rotate Wipeout, Receipt Check, HOA Patrol).
- [ ] **All new comedy text** (append-only IDs, must pass `node tools/script_tools.mjs audit` and the `AGENTS.md` content rule): perk names, camo tiers, Prestige titles, ~25 achievements, 10 challenge-mission briefings, voice-line scripts for Muse, store copy for the backup title.
- [ ] **Short specs for Haiku** (inputs, files, acceptance tests) for each Haiku build task below.

## Haiku: spec-driven builds and all mechanical work
Each build task needs an Opus spec first and is done only when its listed checks pass.
- [ ] **Multi-seed balance data for Opus (do first):** `botsim` every map x mode over 20 seeds; table of team-0 win %, avg match length, stuck count.
- [ ] **PC settings menu:** mouse sensitivity (hardcoded at `controls.js:11`), FOV slider, invert-Y, key rebinding, graphics preset. Persist to localStorage; input stays in `controls.js`. Done when `npm test` and `node tools/ui-audit.mjs` pass.
- [ ] **Single achievements source:** new `data/achievements.json` read by `web/src/engine/progression.js` and `desktop/steamworks.js` (descriptions currently disagree, e.g. HOA Patrol "a zone" vs "3 zones").
- [ ] **10 challenge missions** as data on existing maps/modes/mutators, from the Opus spec and text.
- [ ] Lobby UI for create-a-class, camos, Prestige, playlists, once Opus has landed each system.
- [ ] Controller glyphs + Steam Deck layout; verify `npm run desktop` builds.
- [ ] **Voice audit:** `web/vo/*.ogg` (1,680) vs `web/vo/manifest.json` (1,394) vs `data/hoa_content.json` IDs; missing + orphan list for Muse.
- [ ] **Validation after every merge:** `npm test`, `npm run lint`, `node tools/ui-audit.mjs`, `node tools/botsim.mjs modes`, `node tools/fairness.mjs`.
- [ ] Docs consistency (faction/mode/map counts in `README.md`, `TODO.md`, `docs/launch/store-copy.md`, root `index.html`); mark tasks `done (<commit>)`.

## Muse: voice only
**Do not touch gun audio synthesis in `web/src/engine/audio.js`** (owner directive 2026-10-16).
- [ ] W5: record missing lines, delete orphans (Haiku's audit list); finish `web/vo/manifest.json`.
- [ ] Record Opus's new lines: Fine From Above callouts, perk barks, camo-unlock and Prestige announcer.

## Argon: art only (skip if Argon cannot generate images)
- [ ] Capsule art that does not resemble the CoD logo, plus a set for the backup title (`assets/steam/`).
- [ ] Steam achievement icons (unlocked + locked), camo swatches, Prestige badges.
