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
  - The content library now contains 691 voice lines across all 14 factions in `data/hoa_content.json`.
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

### T02: Controller / Gamepad Input Support (`web/src/engine/game.js`) [S] - done (Antigravity)
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
