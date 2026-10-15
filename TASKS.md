# Task Board: Call of Karen (HOA Warfare)

Status: `open`, `claimed by <name> (date)`, or `done (<commit>)`. Claim one task at a time in this file.

---

## 🧭 Engineering review + next work (Claude, 2026-10-15)

**Priority is the non-Roblox (Steam / web) build.** Roblox work is paused. Every task below targets the web slice first; Unity tasks wait until the owner says go.

### ⛔ Blocked on the owner (do not extend until decided)
- **R1: `theGays` and `trumpers` factions — owner decision (2026-10-15): KEEP both.** Viral and potentially offensive is the goal; hate-coded language is not. "Globalist down!" is retired (replaced with "Your stock options? SAD!"). **Rule for all writers:** jokes target the group's habits, taste and stereotypes; no dog-whistles, slurs, violence against the group, or lines that only land if you hate them. Real-person catchphrases still need legal review before Steam. Muse: regenerate VO only for the new line.

### What I changed in this pass
- **T18 Controller + phone/tablet touch (`web/src/engine/controls.js`) — done.** Keyboard/mouse, gamepad and touch now share one module. Fixed in T02:
  - controller-only (and touch) players were stuck on the pause screen forever, because play required mouse pointer lock;
  - stick look speed was per frame, so aim changed with FPS (now rad/s × dt, with a response curve);
  - the D-pad both moved you and switched weapons; now D-pad up/down = weapons only;
  - START/VIEW handling and the bogus `TabKey` check.
  - Added controller menu navigation (LB/RB faction, A deploy, START pause, A/B on the end screen), aim slowdown for pad and touch, and touch auto-fire while the crosshair is on an enemy.
  - Touch layout: floating left stick (edge = sprint), drag-to-look, FIRE with drag-aim, plus jump, reload, trophy, Lawsuit, swap, scores and pause buttons, a "turn sideways" screen, and safe-area insets.
  - `web/tests/controls.test.mjs` (5 tests); `MOBILE=1 TOUCH='[...]' node tools/shot.mjs` emulates a phone with real touch events.
- Menu key hints corrected: `[` / `]` toggle script and legal-safe (1/2 are weapon slots now).

### Review notes on recent work (fix these as part of your next task in that area)
1. **`game.js` is 800+ lines** mixing HUD, styles, gunbarrel, short recorder, killcam and menu. Split HUD into `hud.js` and the style system into `styles.js` before adding more UI. *(Antigravity)*
2. **King of the Lawn bots all rush the zone** (botGoal always returns it), so fights are one blob. Split roles: about 60% take or hold the zone, 40% flank or hunt. *(Opus)*
3. **No CI.** Agents push straight to `main` and only "run tests locally." Add a GitHub Action running `npm test` and `npm run lint`. *(Claude)*
4. **VO is TTS placeholder audio in git** (9 MB, 690 files). Fine for the prototype, but don't regenerate and re-commit full batches for small text changes (history bloat). Regenerate only changed IDs. Before Steam, confirm the TTS voices' licence allows commercial use, or replace with the human VO the GDD calls for. *(Muse)*
5. **Docs drift:** AGENTS.md says "28+ tests"; there are 53. Say "all tests" instead of a number. Commit messages are public: no real names or personal details.
6. **`audit` warnings: 28** (thin pools of 1 line for headshot/double kills in most factions). *(Muse)*

### Next work, by agent

**Claude (engineering lead)**
- C1: CI workflow (`.github/workflows/test.yml`): `npm test` + lint on every push.
- C2: **Online multiplayer prototype.** `sim.js` is deterministic and headless, so run it authoritatively in a Node WebSocket server. Clients send inputs and receive snapshots, with client-side prediction for your own movement and interpolation for others; bots fill empty slots. This is the biggest gap between the slice and a real game.
- C3: Performance budget for phones: shadow-map size by device, a frame-time HUD (`?perf=1`), and a 60 fps target on a mid-range phone.

**Antigravity (presentation + modes)**
- A1: Split `game.js` (review note 1). No behaviour changes; tests and screenshots identical.
- A2: **HOA Patrol** (Domination: pool, clubhouse, gazebo) and **Steal the Casserole** (CTF) on the `Mode` API in `modes.js`, each with a headless test like `receipt check` in `sim.test.mjs`.
- A3: Killstreak 5 **Dad's Helicopter**: sim-side entity (hp, path, targets), shoot-down → `streakDestroyed` bark, plus the renderer view. Streak rewards hook into `MatchTracker.streakEarned`.
- A4: Touch-friendly menus. Bigger hit targets in the faction picker and toggles; test with `MOBILE=1 node tools/shot.mjs`.

**Opus (systems, bots, balance)**
- O1: Bot roles per mode (review note 2) and a difficulty setting (reaction time, aim sigma, burst length) exposed as `?bots=easy|normal|hard`.
- O2: **Evict the Block** (Search & Destroy: one life, rounds, plant/defuse). It needs round structure in `sim.js` (round reset, no respawn, `mode.respawnDelay = Infinity`). Camping is exempt in this mode per the GDD.
- O3: Spawn safety. Add line-of-sight to the spawn score in `Sim.respawn` (never spawn in an enemy's view within 25 m), with a test that runs 1,000 respawns.
- O4: Map 2 **Clubhouse & Pool** (was T12) in a `maps/` registry with a selectable map. Needs a connected nav graph and the clipping test.

**Sonnet (weapons + factions in code)**
- S1: Weapon balance harness: `tools/ttk.mjs` prints time-to-kill at 5/15/30/60 m per weapon from `weapons.json`. Tune so no primary dominates every range. The sniper should not out-DPS the AR at 10 m.
- S2: Per-class viewmodels (`viewmodel` field already in `weapons.json`: smg, shotgun, sniper, lmg, pistol) in `render.js` `buildViewmodel`, built the same way as the blaster.
- S3: Silhouette pass for the 8 non-Phase-0 factions. Check with `?lineup=1`: at 16-bit resolution they currently blur together. Every faction needs one shape readable at 30 m (hat, prop or posture). Data only: `HEADWEAR` / `PROPS` in `character.js` + `look` in `hoa_content.json`.

**Muse (content + audit)**
- M1: Rivalry lines. Missing Phase 0 pairs first (`node tools/script_tools.mjs rivalry`), then the rest. Currently 18+6 of 182 directional pairs.
- M2: Fix the 28 thin pools in `node tools/script_tools.mjs audit` (2+ lines for kill/headshot/double in every faction).
- M3: After the owner decides R1, apply it (retire lines with `{"retired": true}`; never delete IDs) and re-run the VO pipeline only for changed IDs.
- M4: Monthly brain-rot patch format: a `data/patches/YYYY-MM.json` overlay merged by `ContentLibrary`. Spec the schema here first and Claude or Antigravity will wire it.
- Unity tasks T10/T15/T17 are **on hold** until the owner greenlights a Unity build; maps T12/T16 moved to Opus (O4).

---

## 🎯 High-Priority / Dedicated Tracks for Muse

### T10: Complete Unity C# Port of Core Engine (`unity/`) [L - Long Running / Tedious]
- **Owner**: Ideal for Muse
- **Contract**:
  - Port the engine-agnostic logic from `web/src/core/` 1:1 into C# under `unity/Assets/Scripts/Core/`:
    - `BarkDirector.cs` (priority queue, cooldown timers, killcam line resolution, 1.8s cutoff).
    - `AudioLimiter.cs` & `AnnouncerQueue.cs` (listener-side audio throttling, team vs self scope, 4s gap).
    - `CampingMonitor.cs` (sliding-window position tracking, strafe check, dash exemption, 17s warn / 20s snitch).
    - `MatchTracker.cs` (first blood, revenge, shutdowns, kill streaks, rapid kills).
    - `ShuffleBag.cs` & `Mulberry32Rng.cs`.
    - `ContentLibrary.cs` (JSON deserialization of `data/hoa_content.json`, clean vs steam script mode, legal-safe alternate swaps).
  - Add NUnit tests in `unity/Assets/Tests/` mirroring `web/tests/*.test.mjs` ensuring identical match output given the same seed.
- **Done when**: Unity test runner runs headless in CI/CLI and passes all core tests matching Node test suite.

### T11: Full Audio & VO Manifest Pipeline (`web/vo/`) [L - Long Running / Tedious]
- **Owner**: Muse — DONE (2026-10-15)
- **Contract**:
  - The content library now contains 691 voice lines across all 14 factions in `data/hoa_content.json`.
  - Export voice recording sheet: `node tools/script_tools.mjs csv > dist/vo_session_sheet.csv`.
  - Generate or assemble TTS/synthesized audio files (`.ogg` or `.wav`) for all line IDs (formatted as `<line_id with . -> _>.ogg`) using faction-specific pitch, speed, and character vocal profiles in `web/vo/`.
  - Create `web/vo/manifest.json` indexing every line ID, file path, audio duration, and volume trims.
  - When present, `web/src/engine/audio.js` automatically prefers real audio files over Web Speech TTS.
- **Done when**: Running the game with `web/vo/manifest.json` populated plays audio files for barks without fallback to generic browser TTS.
- **Delivered 2026-10-15**: 691/691 `.ogg` files in `web/vo/` (valid vorbis, one per recording-sheet row incl. `.alt`/rivalry IDs), rich `web/vo/manifest.json` (file/duration/text/faction/voice/pitch/rate/peak_db per line), deterministic resumable pipeline in `tools/vo_synth.mjs` (14-voice cast, rubberband pitch per faction metadata, 2 synth-text normalizations for backend-hostile tokens recorded as `synth_text`), `audio.js` accepts rich + legacy flat-array manifests and uses real durations for bark timing, `web/tests/audio.test.mjs` (8 tests). 39/39 tests pass, lint 0 problems.

### T12: Map 2: "The HOA Clubhouse & Pool" [M/L]
- **Owner**: moved to Opus as O4 (2026-10-15)
- **Contract**:
  - Author `web/src/engine/maps/clubhouse.js` (or export to `map.js` map registry).
  - Geometry:
    - Central Clubhouse: meeting room with conference tables, reception desk, kitchen, restrooms.
    - Community Pool: deep end, shallow end (water slow-down), diving board trampoline (high bounce), lounge chairs (low cover).
    - Tennis / Pickleball courts with chain-link fences.
    - Spawn pads for Team 0 (parking lot) and Team 1 (pool patio).
  - Fully connected navigation waypoint graph for bots (`sim.js` nav helpers).
- **Done when**: `web/tests/sim.test.mjs` passes bot match tests on the Clubhouse map without any bot clipping or disconnecting.

### T13: Content Expansion for Phase 1 Factions (`data/hoa_content.json`) [M - Tedious] - done (faa6c5b / Muse)
- Expanded barks for all 12 factions with spawn, victory, defeat, killcam, and campingWarn events (240 lines).
- Note: Antigravity has wired the engine runtime to fire all 5 events (`spawn` upon respawn, `campingWarn` at 17s dwell, dedicated `killcam` taunt during killcam playback, and `victory`/`defeat` on match end).

### T15: Unity Prefabs & Character Ragdoll Rigging (`unity/Assets/Prefabs/`) [L - Tedious]
- **Owner**: Ideal for Muse
- **Contract**:
  - Convert all 14 faction box models and headwear (`CharacterView` in `web/src/engine/character.js`) into Unity prefabs.
  - Set up BoxCollider / CapsuleCollider components matching `BODY` proportions (1.8m height, 0.42m radius, 1.62m eye/head sphere).
  - Add Unity Rigidbody ragdoll components on limbs (`torso`, `head`, `hipL`, `hipR`, `shoulderL`, `shoulderR`) that activate upon death with explosive/directional impulse.
- **Done when**: Unity test scene spawns any of the 14 factions and triggers a physical ragdoll collapse on death.

### T16: Map 3: "The Gated Community Gatehouse & Roundabout" (`web/src/engine/maps/gatehouse.js`) [M/L]
- **Owner**: Ideal for Muse
- **Contract**:
  - Author second expansion map: Security gatehouse, motorized arm barriers, roundabout, guard booth, resident RFID express lane, visitor lane with intercom post, perimeter brick/picket privacy walls.
  - Add spawn points, jump pads (trampolines disguised as decorative shrubbery or security barriers), and nav nodes.
- **Done when**: Map renders in web viewer and passes waypoint connectivity tests in `sim.test.mjs`.

### T17: Procedural Cel-Shaded Shader & Material Pipeline in Unity URP (`unity/Assets/Shaders/`) [M/L - Tedious]
- **Owner**: Ideal for Muse
- **Contract**:
  - Port procedural texture generators from `web/src/engine/textures.js` (pixel-art siding, brick, pickets, asphalt, concrete curb, leaves) into Unity URP Shader Graph or HLSL shaders.
  - Implement faction accent tinting and retro 16-bit dither / quantization pass.
- **Done when**: Materials in Unity match web visual fidelity.

---

## 🛠️ Systems & Engine Tasks

### T01: All 8 Launch Weapons Implementation (`data/weapons.json`) [S] - done (commit 799de79 / Antigravity)
- Added `allowance`, `sideHustle`, `divorceSettlement`, `trustFund`, `subdivision`, `permit`, `lawsuit`, and `participationTrophy` with TTK sanity, falloff, spread, pellets, and loadouts.

### T02: Controller / Gamepad Input Support (`web/src/engine/game.js`) [S] - done (Antigravity); superseded by T18 `controls.js` (Claude)
- Added Xbox / standard gamepad support via Gamepad API: left stick movement, right stick aiming, RT shoot, LT sprint, A jump, X reload, B/RB melee, LB grenade, Y swap weapon, D-pad primary/secondary.

### T03: Secondary Weapon Switching (Pistol Sidearm) [S] - done (Antigravity)
- Allows players to switch between primary weapon and secondary weapon (`permit`) using `Q`, `1`/`2`, Gamepad Y or D-pad.
- Implemented ammo banking per weapon slot, viewmodel switching, and unit tests in `sim.test.mjs`.

### T04: King of the Lawn (Hardpoint) Mode (`web/src/engine/modes.js`) [M] - done (Antigravity)
- Mode subclass `KingOfTheLawn` with rotating front lawns across the cul-de-sac every 60s.
- Team in zone scores 1 pt/s uncontested; contested stops scoring; players in zone are exempt from camping penalties.
- Animated 3D objective indicator mesh with pulsing lawn ring and team colors.

### T14: "The Gays" and "The Trumpers" Factions [M] - done (Antigravity)
- Added `theGays` ("The Gays", Tagline: "Architectural Digest or death.", look: `#2c2c54` / `#e8e1d0` / `#ff70a6`, hat: `designerShades`).
- Added `trumpers` ("The Trumpers", Tagline: "More yard flags than square footage.", look: `#1a2b4c` / `#e8d9b5` / `#d91424`, hat: `redHat`).
- Full coverage of all 26 required events (clean & steam lines, legal-safe alternates, all under 1.8s lint limit).
- Added 6 rivalry matchups (Karens, Trumpers, The Gays, VC Bros).

### T07: In-Game Mini-Map / Compass Radar (`web/src/engine/radar.js`) [M] - done (Antigravity)
- Circular player-centric rotating radar HUD overlay with North compass indicator.
- Map geometry: Cul-de-sac asphalt court, road corridor, perimeter boundary, and suburban houses.
- Objectives: King of the Lawn zone rings (pulsing owner colors) and dropped receipts.
- Entity tracking:
  - Local player vision cone & orientation arrow.
  - Friendly teammates in team blue/cyan.
  - Gunfire reveal: Enemies firing weapons blip red for 1.8s.
  - Camping snitch: Stationary campers (>20s) trigger pulsing red ping rings and radar reveals.
- Unit tests added in `web/tests/sim.test.mjs` (31/31 passing).

