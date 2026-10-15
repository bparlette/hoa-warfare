# Task Board: Call of Karen (HOA Warfare)

Status: `open`, `claimed by <name> (date)`, or `done (<commit>)`. Claim one task at a time in this file.

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
- **Owner**: Ideal for Muse
- **Contract**:
  - The content library contains 348 voice lines across all 12 factions in `data/hoa_content.json`.
  - Export voice recording sheet: `node tools/script_tools.mjs csv > dist/vo_session_sheet.csv`.
  - Generate or assemble TTS/synthesized audio files (`.ogg` or `.wav`) for all line IDs (formatted as `<line_id with . -> _>.ogg`) using faction-specific pitch, speed, and character vocal profiles in `web/vo/`.
  - Create `web/vo/manifest.json` indexing every line ID, file path, audio duration, and volume trims.
  - When present, `web/src/engine/audio.js` automatically prefers real audio files over Web Speech TTS.
- **Done when**: Running the game with `web/vo/manifest.json` populated plays audio files for barks without fallback to generic browser TTS.

### T12: Map 2: "The HOA Clubhouse & Pool" [M/L]
- **Owner**: Ideal for Muse
- **Contract**:
  - Author `web/src/engine/maps/clubhouse.js` (or export to `map.js` map registry).
  - Geometry:
    - Central Clubhouse: meeting room with conference tables, reception desk, kitchen, restrooms.
    - Community Pool: deep end, shallow end (water slow-down), diving board trampoline (high bounce), lounge chairs (low cover).
    - Tennis / Pickleball courts with chain-link fences.
    - Spawn pads for Team 0 (parking lot) and Team 1 (pool patio).
  - Fully connected navigation waypoint graph for bots (`sim.js` nav helpers).
- **Done when**: `web/tests/sim.test.mjs` passes bot match tests on the Clubhouse map without any bot clipping or disconnecting.

### T13: Content Expansion for Phase 1 Factions (`data/hoa_content.json`) [M - Tedious]
- **Owner**: Open / Muse
- **Contract**:
  - Expand barks for the 8 secondary factions (Old Money, Rednecks, Gym Rats, Theater Kids, VC Bros, HOA Dads, Emo Kids, Valley Girls).
  - Maintain the append-only rule (never change existing array indices).
  - Ensure every faction has full coverage across all events: `firstBlood`, `revenge`, `shutdown`, `multikill_double/triple/quad`, `campingWarn`, `campingSnitch`, `humiliated`, `killcam`, `spawn`, `defeat`, `victory`.
  - Run `node tools/script_tools.mjs lint` to enforce the 1.8-second rule and legal-safe alternates.
- **Done when**: `node tools/script_tools.mjs lint` passes with 0 errors across all 12 factions.

---

## 🛠️ Systems & Engine Tasks

### T01: All 8 Launch Weapons Implementation (`data/weapons.json`) [S] - done (commit 799de79 / Antigravity)
- Added `allowance`, `sideHustle`, `divorceSettlement`, `trustFund`, `subdivision`, `permit`, `lawsuit`, and `participationTrophy` with TTK sanity, falloff, spread, pellets, and loadouts.

### T02: Controller / Gamepad Input Support (`web/src/engine/game.js`) [S] - done (Antigravity)
- Added Xbox / standard gamepad support via Gamepad API: left stick movement, right stick aiming, RT shoot, LT sprint, A jump, X reload, B/RB melee, LB grenade, Y toggle 16-bit.

### T03: Secondary Weapon Switching (Pistol Sidearm) [S] - open
- **Contract**: Allow players to switch between primary weapon and `permit` (pistol sidearm) using `Q`, `1/2` or D-pad Up/Down.

### T04: King of the Lawn (Hardpoint) Mode (`web/src/engine/modes.js`) [M] - open
- **Contract**:
  - Mode subclass `KingOfTheLawn`.
  - Moving objective zone (front lawns across the cul-de-sac) that rotates every 60s.
  - Team in zone earns 1 pt per second uncontested. Contested = locked.
  - Objective zones exempt players inside from the camping monitor.
