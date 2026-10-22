# Call of Karen: HOA Warfare — Full Game ($4.99) 1-Week Roadmap & TODOs

## Phase 1: Tonight's Demo Deployment & Mobile/Itch.io Polish (COMPLETED)
- [x] **Fix Broken `[?]` Character Images in Itch.io Demo Zip**: Updated `tools/package_demo.mjs` to bundle `web/assets/characters/*.png` and `manifest.webmanifest` into `dist/hoa-warfare-web-demo.zip`.
- [x] **Eliminate Portrait Phone Blocker (`#rotate`)**: Disabled the blocking `"Turn your phone sideways to defend the block"` overlay in `web/style.css` so mobile players can play immediately in either portrait or landscape.
- [x] **Full-Bleed Lobby & Unclipped `▶ DEPLOY NOW` Button**: Updated `.lobby-container`, `.lobby-center`, and `#factions.factions-grid-2x3` in `web/style.css` to flex dynamically inside any mobile screen or itch.io iframe height without cutting off the bottom action bar.
- [x] **iOS Itch.io Iframe Breakout Fullscreen**: Enhanced `tryEnterFullscreen` in `web/src/engine/game.js` so tapping `⛶ FULLSCREEN` on iPhone inside an itch.io iframe breaks out to the full browser viewport.
- [x] **16-Faction Weapons, Distinct Audio & 3D World/Character Detail**:
  - [x] Assigned unique primary weapons across all 16 shipping factions in `data/hoa_content.json` (4 factions cut: `emoKids`, `theaterKids`, `oldMoney`, `mlmHuns`) and displayed weapon badges on all character cards.
  - [x] Synthesized caliber-accurate weapon audio in `web/src/engine/audio.js`.
  - [x] Upgraded 3D character meshes (rounded limbs/caps, ears, nose, neck, hands, 3rd-person faction weapons) in `web/src/engine/character.js` and suburban world props (cylindrical wheels, multi-sphere trees, chimneys, clouds) in `web/src/engine/render.js`.
- [x] **Item 4 — Root Promo Page (`index.html`) 16-Faction Lineup Update**: Updated `index.html` to showcase shipping playable factions with portraits and signature weapons.
- [x] **Item 5 — 1-Click Shareable Match Citation Score Card (`📸 SAVE / SHARE CARD`)**: Added `renderScoreCardCanvas` and `shareScoreCard` to `web/src/engine/hud.js` to export/share an 800×450 PNG score card with portrait, K/D stats, and MVP quote.

---

## Phase 2: Full Game ($4.99 Release in 1 Week) — TODO List

### Day 1–2: Persistent Career Progression, HOA Ranks & Golden Unlocks (COMPLETED)
- [x] **Persistent Career Profile (`localStorage` + Steam Cloud sync)**:
  - [x] Implemented in `web/src/engine/progression.js` (`CareerProfile`): tracks lifetime Fines (Kills), Citations (Deaths), Matches Won, Casseroles Stolen, and Helicopters Grounded.
  - [x] Implemented **HOA Rank Progression** (Ranks 1–10: *Renter*, *Yard Inspector*, *Complaint Filer*, *Covenant Enforcer*, *Fine Collector*, *Block Captain*, *Treasurer*, *Vice President*, *Board President*, *Supreme HOA Overlord*). Free Demo is capped at Rank 5 (*Fine Collector*), while Ranks 6–10 are unlocked in the full $4.99 game.
- [x] **Weapon Mastery & Golden HOA Cosmetics**:
  - [x] Implemented 24K Gold Weapon Skins in `web/src/engine/render.js` (`setGoldSkin`) with high metalness/roughness tuning and checkbox `#optGoldSkin` in `web/index.html` (locked to $4.99 Full Game with Demo modal teaser).
  - [x] Added persistent Career Rank badge `#careerRankBadge` in the lobby displaying rank title and XP progress.
- [x] **Live In-Game Achievement Toast Popups**:
  - [x] Integrated `showAchievementToast` in `web/src/engine/hud.js` and `CareerProfile.unlockAchievement()` with Steamworks bridge (`window.SteamAPI.unlockAchievement`).

### Day 3–4: 2 New Suburban Battleground Maps + Map Voting (COMPLETED)
- [x] **Map 1 — *Oakridge Cul-de-Sac* (Flagship Map Polish)**:
  - [x] Built in `web/src/engine/map.js` (`buildCulDeSac`): circular cul-de-sac with 6 two-story colonial homes, driveways, mailboxes, and manicured lawns. Free in Demo & Full Game.
- [x] **Map 2 — *Shady Pines Country Club & Pickleball Courts***:
  - [x] Built in `web/src/engine/map.js` (`buildPickleballClub`): 4 neon-blue pickleball courts, clubhouse pro shop, perimeter chainlink fences, golf carts, and patio umbrellas. $4.99 Full Game exclusive (teased in Demo).
- [x] **Map 3 — *Sunset Strip Mall & Whole Foods Parking Lot***:
  - [x] Built in `web/src/engine/map.js` (`buildStripMall`): anchor supermarket, boutique storefronts, drive-thru coffee kiosk, shopping cart corrals, and parked SUVs. $4.99 Full Game exclusive (teased in Demo).
- [x] **Lobby & Post-Match Map Selector / Voting**:
  - [x] Added `#optMap` selector to `web/index.html` and synced in `web/src/engine/game.js` with instant Demo gating modal for paid maps.

### Day 5: Full Killstreak Suite (3 / 5 / 7) & Destructible Suburban Chaos (COMPLETED)
- [x] **3-Killstreak — *Ring Doorbell UAV Sweep***:
  - [x] Implemented in `web/src/engine/sim.js` (`triggerRingUav`): reveals all enemy positions on radar for 15 seconds. Available in both Demo & Full Game.
- [x] **5-Killstreak — *Dad's RC Patrol Helicopter***:
  - [x] Implemented in `web/src/engine/sim.js`, `render.js`, and `barks.js`: orbits overhead, acquires targets, fires bursts, and emits `streakDestroyed` voice line and score on takedown. Available in Demo & Full Game.
- [x] **7-Killstreak — *Autonomous Riding Lawn Mower Stampede***:
  - [x] Implemented in `web/src/engine/sim.js` (`spawnMowerStampede`, `updateMowers`) and `web/src/engine/render.js` (`updateMowers`): summons 3 runaway autonomous mowers patrolling at 11 m/s that run down enemies. $4.99 Full Game exclusive (teased in Demo).
- [x] **Interactive Suburban Hazards**:
  - [x] **Shootable Parked Cars**: Implemented in `web/src/engine/sim.js`, `map.js`, and `audio.js` (`sfx.carAlarm`): shooting parked cars triggers two-tone suburban car alarm and popScore notification.
  - [x] **Exploding Propane BBQ Grills**: Implemented in `web/src/engine/sim.js`: explosive cylinders/grills detonate with radial damage.

### Day 6: Viral Clip Exporter & Party Room Mutators (COMPLETED)
- [x] **Instant Killcam Highlight Recorder (`🎥 SAVE CLIP`)**:
  - [x] Implemented in `web/src/engine/hud.js` (`startClipRecorder`, `exportHighlightClip`): records WebGL canvas stream using `MediaRecorder` with automatic fallback to high-res shareable PNG score card (`📸 SAVE / SHARE CARD`).
- [x] **Private Squad Room Codes & Party Mutators**:
  - [x] 1-Click **"🔗 COPY INVITE LINK"** (`#btnInvite`) in lobby copying `?room=CODE`.
  - [x] Added Party Mutators in `web/src/engine/sim.js` and `web/index.html`:
    - [x] *Big Head Mode* (`#mutBigHead`, 2.2× head hitbox radius, free in Demo).
    - [x] *Divorce Settlement Only* (`#mutShotguns`, shotguns-only close quarters, $4.99 exclusive).
    - [x] *Low-Gravity Moon Shoes* (`#mutLowGrav`, 0.45× gravity, $4.99 exclusive).
    - [x] *Turbo Speed* (`#mutTurbo`, 1.85× sprint speed, $4.99 exclusive).

### Day 7: Steam ($4.99) & Itch.io Paid Build Packaging & Launch Prep (COMPLETED)
- [x] **Desktop Electron / Steam Packaging (`npm run desktop`)**:
  - [x] Desktop wrapper files authored in `desktop/main.mjs`, `desktop/preload.cjs`, `desktop/steamworks.js`, and `tools/build_desktop.mjs`.
  - [x] Steamworks bridge with 10 launch achievements documented in `docs/steam/steamworks.md`.
- [x] **Dual-Tier Itch.io & Steam Store Release**:
  - [x] Free Web Demo packaged via `node tools/package_demo.mjs` into `dist/hoa-warfare-web-demo.zip` with 6 playable factions, Cul-de-Sac map, Easy/Medium/Hard difficulty, Ranks 1–5, and Big Head mutator.
  - [x] Full $4.99 Purchase features (10 additional factions [16 total shipping factions], Maps 2 & 3, 7-killstreak Mower Stampede, Ranks 6–10, 24K Gold Skins, Party Mutators) wired with Demo gating modal and Steam CTA upsell.

---

## Phase 3: Steam Direct & Desktop Distribution Pipeline (COMPLETED)
- [x] **Steam Store Capsules Tooling (`tools/build_steam_capsules.mjs` & `assets/steam/`)**:
  - [x] Header Capsule: 460 x 215 (`assets/steam/header_capsule.jpg`)
  - [x] Small Capsule: 231 x 87 (`assets/steam/small_capsule.jpg`)
  - [x] Main Capsule: 616 x 353 (`assets/steam/main_capsule.jpg`)
  - [x] Library Hero: 1920 x 620 (`assets/steam/library_hero.jpg`)
  - [x] Library Logo: 1280 x 720 (`assets/steam/library_logo.png`)
  - [x] Community Icon: 32 x 32 (`assets/steam/community_icon.png`)
  - [x] Client Icon: 256 x 256 (`assets/steam/client_icon.png`)
- [x] **Native Desktop Distribution Pipeline (`npm run desktop:dist`)**:
  - [x] Automated staging and zip compression into `dist/hoa-warfare-desktop.zip` (55.71 MB) with Steamworks bridge and standalone Electron wrapper.
- [x] **Mobile Pause Resume, Sound Mute & Top Bar Leaderboard**:
  - [x] Added `#btnResume` to pause overlay, `#btnPauseMute` and `#optMuteSound` for instant sound FX mute.
  - [x] Wired `data-t="board"` to `#score` so tapping the top clock/score bar toggles live scoreboard without adding screen clutter.
- [x] **Suburban Synth Pad Ambience & Audio Immersion**:
  - [x] Synthesized warm suburban pad chord ambience (`sfx.startAmbience`, `sfx.stopAmbience`).
  - [x] Added joyous 4-note victory flourish (`sfx.victory`) and 3-note eviction chime (`sfx.defeat`).
  - [x] Tactical suburban citation pings (`KeyV` / `KeyT`, `sfx.ping`).
- [x] **Rivalry-of-the-Week Matchmaking Bias (`FEATURED_RIVALRIES`)**:
  - [x] Rotating weekly featured rivalry matchups (Karens vs VC Bros, Tradwives vs Woke Libs, HOA Dads vs Furries, etc.) biasing bot team composition by 50%.
- [x] **Search & Destroy Bot Squad Tactics (`EvictTheBlock`)**:
  - [x] Attackers dynamically escort the Eviction Notice carrier within 7m and secure dropped notices.
- [x] **Monthly Brain-Rot Patch Architecture (`data/patches/`)**:
  - [x] Authored JSON schema in `data/patches/schema.json` and launch patch `data/patches/2026-10.json` (Season 1: Pumpkin Spice Martial Law).

---

## Phase 4: Launch Polish & Production Asset Suite (COMPLETED)
- [x] **Controller Glyphs & Steam Deck Layout**:
  - [x] Implemented `Controls.isSteamDeck()` auto-detection, `?deck=1` and `?pad=1` test toggles, and dynamic `device-pad` class synchronizing authentic console button glyphs (`[A]`, `[B]`, `[X]`, `[Y]`, `[LB]`, `[RB]`, `[START]`, `[VIEW]`).
- [x] **Objective-Mode Geometry & Pickleball Symmetry**:
  - [x] Achieved 0m kitchen walking asymmetry and 48–52% golden balance band on Shady Pines Pickleball Club (`kingOfTheLawn` 1314–1447, `stealTheCasserole` 11–10, `clash` 1128–1101 over 20-seed botsim).
- [x] **10 Curated Satirical Challenge Missions (`data/challenges.json`)**:
  - [x] Authored 10 thematic challenge missions (Lawn Mower Massacre, Managerial Meltdown, Sourdough Starter Heist, Pickleball Turf War, etc.) with XP rewards, mutators, and lobby selector `#optChallenge`.
- [x] **Steam Launch Achievement Icons & Badges (`assets/steam/`)**:
  - [x] Generated all 13 Steam launch achievement icons (both 256×256 Unlocked and Locked PNGs) in `assets/steam/achievements/`.
  - [x] Generated 4 weapon camo swatches (`camo_beige.png`, `camo_mulch.png`, `camo_granite.png`, `camo_gold.png`) in `assets/steam/camos/`.
  - [x] Generated 10 Prestige / Re-Zoning badges (`prestige_1.png` – `prestige_10.png`) in `assets/steam/prestige/`.
- [x] **Itch.io High-Impact Visual Suite (`assets/itch/`)**:
  - [x] Built Retina game card covers (`cover_630x500.jpg`, `cover_1260x1000.jpg`), page header banners (`banner_960x400.jpg`, `banner_1920x800.jpg`), and 8 curated 1920×1080 action screenshots with upload guide (`assets/itch/README.md`).


