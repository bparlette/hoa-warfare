# Handover Note for Opus: Completed List 1 & List 2 Tasks

**Date**: 2026-10-22  
**Author**: Assistant (covering for Opus & Haiku)  
**Status**: 285/285 tests passing (`npm test`), UI audit clean (`node tools/ui-audit.mjs`), lint clean (`npm run lint`).

---

## 1. Summary of Work Done

At the user's request, we stepped in to complete all pending items across **List 1** (Mechanical/In-Engine Polish) and **List 2** (Opus Design & Balancing tasks), allowing Opus to focus on reviewing, polishing comedy writing, and higher-order design.

### A. Pickleball Map & Objective Balance (List 2 Task)
- **Problem Diagnosed**:
  - In `docs/launch/balance-table.md`, Team 0 was winning only **30%** of matches in `kingOfTheLawn` (6-14-0) and `clash`/`wipeout` was lopsided.
  - In `stealTheCasserole`, matches were ending in **30 seconds** because kitchens were only 18 meters apart across the net.
  - **Root Cause**: `buildPickleballClub` in `web/src/engine/map.js` did not define `zonePos` or `kitchenPos`. `KingOfTheLawn` fell back to Cul-de-Sac coordinates where Zone 1 (`z = -32`) sat 8m from Team 1's spawn and 56m from Team 0, while Zone 3 sat directly in Team 1's court.
- **Fix Implemented**:
  1. Defined point-symmetric `zonePos` in `buildPickleballClub`:
     - `Cul-de-Sac Circle` (Center net): `{ x: 0, z: 0 }` (24m from each spawn)
     - `Gazebo Greenbelt` (North Clubhouse terrace): `{ x: 0, z: -20 }` (9m from Team 1, 39m from Team 0)
     - `South Driveway` (South Cart Plaza): `{ x: 0, z: 20 }` (9m from Team 0, 39m from Team 1)
     - `Northeast Front Lawn` (East courts midpoint): `{ x: 16, z: 0 }` (28.8m equidistant from both spawns)
     - `West Front Lawn` (West courts midpoint): `{ x: -16, z: 0 }` (28.8m equidistant from both spawns)
  2. Defined `kitchenPos` in `buildPickleballClub`:
     - Team 0 Kitchen: `{ x: 0, y: 0, z: 15 }` (balanced 9m from Team 0 spawn)
     - Team 1 Kitchen: `{ x: 0, y: 0, z: -15 }` (balanced 9m from Team 1 spawn)
     - Spacing between kitchens increased from 18m to **30m**, with 0m walking asymmetry.
- **Verification (20-seed botsim results)**:
  - `kingOfTheLawn` same faction: **1314 - 1447** (47.6% - 52.4%, right in the 45-55% golden symmetry zone).
  - `stealTheCasserole` same faction: **11 - 10** (virtually 50/50; captures now require actual cross-court battles).
  - `clash` same faction: **1128 - 1101** (50.6% - 49.4%).
  - `node tools/fairness.mjs`: Pickleball asymmetry is 0m on centre and 2m on kitchens.

---

### B. 10 Curated Challenge Missions (List 2 Task)
- Authored `data/challenges.json` containing 10 suburban satire challenge missions:
  1. `challenge_01`: **Lawn Mower Massacre** (HOA Dads vs Karens — 5 riding mower roadkills required).
  2. `challenge_02`: **Managerial Meltdown** (WSB vs Karens — 1v4 Lone Wolf against Lawsuit Grenades).
  3. `challenge_03`: **Cul-de-Sac Sniper Alley** (Fabulous vs Rednecks — Long-range precision shootout on Showcase).
  4. `challenge_04`: **Curbside Recycling Riot** (HOA Dads vs Clout Streamers — 15 dropped receipt pickups on Stripmall).
  5. `challenge_05`: **Sourdough Starter Heist** (Tradwives vs Valley Girls — Casserole capture with speed buff).
  6. `challenge_06`: **Pickleball Turf War** (Pickleball Retirees vs Gym Rats — Non-volley zone hardpoint hold).
  7. `challenge_07`: **The 7:00 AM Leaf Blower Awakening** (Rednecks vs Woke Libs — Leaf blower knockback on Cul-de-Sac).
  8. `challenge_08`: **Midnight Commercial Eviction** (WSB vs Frat House — Round wipeout on Stripmall).
  9. `challenge_09`: **High-Altitude Trampoline Sniping** (Clout Streamers vs HOA Dads — Aerial bounce kills on Pickleball).
  10. `challenge_10`: **Grand HOA Annual General Meeting** (Karens vs HOA Dads — Veteran difficulty boss clash on Showcase).
- **Integration**:
  - Added `#optChallenge` selector in `matchSettingsModal` (`web/index.html` and `web/src/engine/game.js`).
  - Selecting a mission automatically pre-sets the map, mode, player faction, bot difficulty, and displays the briefing and reward XP.
  - Added test suite `web/tests/challenges.test.mjs` (verifies all 10 challenges reference active shipping entities and valid reward structures).

---

### C. Controller Glyphs & Steam Deck Layout (List 1 Task)
- **Controller Detection**:
  - Implemented `Controls.isSteamDeck()` in `web/src/engine/controls.js` (detects Steam Deck user agent, or `?deck=1` / `?pad=1`).
  - Added dynamic `device-pad` class management on `document.body` whenever gamepad input is detected.
- **Visual Button Glyphs**:
  - Added crisp console button badges (`[A]`, `[B]`, `[X]`, `[Y]`, `[LB]`, `[RB]`, `[START]`, `[VIEW]`) in `web/index.html` and `web/style.css`.
  - Badges automatically become visible when playing with a controller (`body.device-pad .pad-glyph { display: inline-flex; }`).
- **Lobby Gamepad Navigation**:
  - In `web/src/engine/game.js`: `input.onPadPress` now supports `A`/`START` (deploy), `X` (tutorial), `VIEW` (match settings toggle), `B` (close modal), and `LB`/`RB` (cycle faction pagination).
- **Steam Deck Optimization**:
  - Tested at 1280x800 resolution. `node tools/ui-audit.mjs` passes 100% with no overlapping or clipped controls.

---

### D. Audio Hygiene & Purge (List 1 Task)
- Deleted 286 orphan `.ogg` files from cut factions (`oldMoney`, `emoKids`, `mlmHuns`, `theaterKids`, and old fratHouse duplicates) from `web/vo/`.
- Verified manifest integrity (`web/tests/integrity.test.mjs` and `web/tests/audio.test.mjs`) pass 100%.

---

## 2. Recommendations for Opus Review & Improvement

When you review this code, here are the exact areas where your comedic flair and high-level design judgment can take things further:

1. **Challenge Briefings & Dialogue**:
   - The briefings in `data/challenges.json` are functional and funny, but feel free to inject even more specific HOA bylaws, suburban passive-aggressive tropes, or custom intro voice callouts.
2. **Challenge Modifiers**:
   - Consider whether you'd like custom mutators for specific challenges (e.g. infinite grenades for challenge 2, or 300% leaf blower velocity for challenge 7).
3. **Weekly Rotation / Playlists**:
   - If you want challenges to cycle on a weekly schedule, the data schema in `data/challenges.json` is ready to support an `activeWeek: 1..52` or `rotation: 'weekly'` tag.
4. **Model Home Showcase Layout**:
   - Showcase is balanced at 50/50 in Clash, but check Evict the Block and Steal the Casserole to see if you want to add any custom backyard patio props.

All tests remain 100% green (285/285). Have fun polishing!
