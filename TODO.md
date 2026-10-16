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

### Day 1–2: Persistent Career Progression, HOA Ranks & Golden Unlocks
- [ ] **Persistent Career Profile (`localStorage` + Steam Cloud sync)**:
  - [ ] Track lifetime Fines (Kills), Citations (Deaths), Matches Won, Casseroles Stolen, and Helicopters Grounded per faction.
  - [ ] Implement **HOA Rank Progression** (Rank 1 *Renter* → Rank 10 *Block Captain* → Rank 25 *Covenant Enforcer* → Rank 50 *Supreme Board President*).
- [ ] **Weapon Mastery & Golden HOA Cosmetics**:
  - [ ] Unlock **24K Gold Clipboard / Golden Gun Skins** and **Platinum Subdivision Visors** at 25 / 50 / 100 kills with each weapon class.
  - [ ] Add a **Career Dossier & Cosmetics Locker** tab to the lobby menu.
- [ ] **Live In-Game Achievement Toast Popups**:
  - [ ] Connect `desktop/steamworks.js` achievement triggers (`ACH_FIRST_FINE`, `ACH_LAWN_ORDER`, `ACH_CASSEROLE_THIEF`, `ACH_HELO_DOWN`, etc.) to live in-game HUD toast notifications with sound effects.

### Day 3–4: 2 New Suburban Battleground Maps + Map Voting
- [ ] **Map 1 — *Oakridge Cul-de-Sac* (Flagship Map Polish)**:
  - [ ] Add destructible lawn ornaments (pink flamingos, garden gnomes, white picket fence panels) that shatter when shot.
- [ ] **Map 2 — *Shady Pines Country Club & Pickleball Courts***:
  - [ ] 4 fenced neon-blue pickleball courts, sand traps, golf carts for cover, clubhouse pro-shop interior, and patio umbrellas.
- [ ] **Map 3 — *Sunset Strip Mall & Whole Foods Parking Lot***:
  - [ ] Dense SUV/minivan parking lanes, shopping cart corrals, drive-thru coffee kiosk, and rooftop sniper perch.
- [ ] **Lobby & Post-Match Map Selector / Voting**:
  - [ ] Allow players to pick the map in the lobby and vote on the next map during the Match End screen.

### Day 5: Full Killstreak Suite (3 / 5 / 7) & Destructible Suburban Chaos
- [ ] **3-Killstreak — *Ring Doorbell UAV Sweep***:
  - [ ] Temporarily reveals all enemy positions and facing directions on the minimap radar for 15 seconds with a `"Motion detected at the front yard"` voice chime.
- [ ] **5-Killstreak — *Dad's RC Patrol Helicopter* (Polish)**:
  - [ ] Add dual searchlight cone and loudspeaker HOA violation warnings while orbiting.
- [ ] **7-Killstreak — *Autonomous Riding Lawn Mower Stampede***:
  - [ ] Summons 3 high-speed runaway robotic lawn mowers that patrol the asphalt and mow down enemies on contact.
- [ ] **Interactive Suburban Hazards**:
  - [ ] **Shootable Parked Cars**: Shooting a car triggers a flashing 3D headlight strobe + pulsing car alarm (`sfx.carAlarm()`) that masks footsteps.
  - [ ] **Exploding Propane BBQ Grills**: Backyard grills detonate in a fiery grease explosion when damaged, launching nearby combatants.

### Day 6: Viral Clip Exporter & Party Room Mutators
- [ ] **Instant Killcam Highlight Recorder (`🎥 SAVE CLIP`)**:
  - [ ] Record the last 6 seconds of canvas + audio via `MediaRecorder` so players can export a `.webm` / `.mp4` clip of their final killcam or multi-kill directly from the Match End screen.
- [ ] **Private Squad Room Codes & Party Mutators**:
  - [ ] Add 1-click **"INVITE FRIENDS (COPY ROOM LINK)"** in the lobby (`?room=KAREN1`).
  - [ ] Add custom match mutators for streamers & friend groups:
    - [ ] *Big Head Mode* (2.5× head scale + guaranteed hat-pop physics)
    - [ ] *Divorce Settlement Only* (Shotguns + Knockback)
    - [ ] *Low-Gravity Backyard Trampoline Mode*
    - [ ] *Turbo Speed (2× Sprint)*

### Day 7: Steam ($4.99) & Itch.io Paid Build Packaging & Launch Prep
- [ ] **Desktop Electron / Steam Packaging (`npm run desktop`)**:
  - [ ] Build standalone Windows (`.exe`), macOS (`.app`/`.dmg`), and Linux/SteamOS binaries via `tools/build_desktop.mjs`.
  - [ ] Verify gamepad / Steam Deck controller navigation in lobby and HUD.
- [ ] **Dual-Tier Itch.io & Steam Store Release**:
  - [ ] Keep `dist/hoa-warfare-web-demo.zip` (6 factions, 1 map) live as the free browser hook on Itch.io & Steam Demo.
  - [ ] Upload the full 20-faction, 3-map, full-killstreak build as the **$4.99 Full Purchase** on Steam and Itch.io.
