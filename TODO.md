# Call of Karen: HOA Warfare — Full Game ($4.99) 1-Week Roadmap & TODOs

## Phase 1: Tonight's Demo Deployment & Mobile/Itch.io Polish (COMPLETED)
- [x] **Fix Broken `[?]` Character Images in Itch.io Demo Zip**: Updated `tools/package_demo.mjs` to bundle `web/assets/characters/*.png` and `manifest.webmanifest` into `dist/hoa-warfare-web-demo.zip`.
- [x] **Eliminate Portrait Phone Blocker (`#rotate`)**: Disabled the blocking `"Turn your phone sideways to defend the block"` overlay in `web/style.css` so mobile players can play immediately in either portrait or landscape.
- [x] **Full-Bleed Lobby & Unclipped `▶ DEPLOY NOW` Button**: Updated `.lobby-container`, `.lobby-center`, and `#factions.factions-grid-2x3` in `web/style.css` to flex dynamically inside any mobile screen or itch.io iframe height without cutting off the bottom action bar.
- [x] **iOS Itch.io Iframe Breakout Fullscreen**: Enhanced `tryEnterFullscreen` in `web/src/engine/game.js` so tapping `⛶ FULLSCREEN` on iPhone inside an itch.io iframe breaks out to the full browser viewport.
- [x] **20-Faction Weapons, Distinct Audio & 3D World/Character Detail**:
  - [x] Assigned unique primary weapons across all 20 factions in `data/hoa_content.json` and displayed weapon badges on all character cards.
  - [x] Synthesized caliber-accurate weapon audio in `web/src/engine/audio.js`.
  - [x] Upgraded 3D character meshes (rounded limbs/caps, ears, nose, neck, hands, 3rd-person faction weapons) in `web/src/engine/character.js` and suburban world props (cylindrical wheels, multi-sphere trees, chimneys, clouds) in `web/src/engine/render.js`.
- [x] **Item 4 — Root Promo Page (`index.html`) 20-Faction Lineup Update**: Updated `index.html` to showcase `web/assets/faction_lineup_20.jpg` and all 20 playable factions with portraits and signature weapons.
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
  - [x] Full $4.99 Purchase features (14 additional factions, Maps 2 & 3, 7-killstreak Mower Stampede, Ranks 6–10, 24K Gold Skins, Party Mutators) wired with Demo gating modal and Steam CTA upsell.
