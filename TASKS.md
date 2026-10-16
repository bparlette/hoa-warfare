# Task Board: Call of Karen (HOA Warfare)

Status: `open`, `claimed by <name> (date)`, or `done (<commit>)`. Claim one task at a time in this file.

**Current state (2026-10-16):** 16 factions (4 cut: oldMoney, emoKids, mlmHuns, theaterKids). 209 tests passing (0 failures). Demo on itch.io live with 6 factions.

---

## Active Priorities (Assigned to Specialized Worker AIs)

### P0: Steam "Coming Soon" Page & App Registration
- [ ] Pay $100 Steam Direct fee and register app at partner.steamgames.com **(Owner)**
- [ ] Upload storefront assets from `assets/steam/` (7 files, all built) **(Owner)**
- [ ] Paste store copy from `docs/launch/store-copy.md` **(Owner)**
- [ ] Set status to "Coming Soon" — target 7k-10k wishlists **(Owner)**
- [ ] Update `data/demo.json` `steamUrl` with live numeric App ID URL **(Owner)**

### P0: Voice Generation & Manifest Verification — [Assigned: Muse]
- [ ] Run `tools/hoa_warfare_voice_studio.ipynb` in Colab for all 1,057 lines across 16 factions **(Muse)**
- [ ] Upload `.ogg` files to `web/vo/` via browser (never connector — corrupts binaries) **(Muse)**
- [ ] Update `web/vo/manifest.json` with file hashes, peak dB, and true durations **(Muse)**
- [ ] **STRICT**: Do NOT touch gun audio synthesis in `web/src/engine/audio.js` (owner directive 2026-10-16) **(Muse)**

### P1: itch.io Page Optimization — [Assigned: Moth]
- [x] Upload screenshots and GIFs (6 files live)
- [ ] Add YouTube trailer link once viral video is uploaded to YouTube **(Moth)**
- [ ] Fix duplicated description text on itch.io edit page using clean copy in `docs/launch/store-copy.md` **(Moth)**

### P1: CrazyGames Submission — [Assigned: Moth]
- [x] Format landscape (1280x720) and square (512x512, 256x256) cover assets into `assets/crazygames/` (Antigravity)
- [ ] Upload `assets/crazygames/cover_landscape_1280x720.jpg` and `cover_square_512x512.png` to CrazyGames dashboard **(Moth)**
- [ ] Submit for QA review **(Moth)**

### P1: Online Multiplayer Cloud Deployment — [Assigned: Claude]
- [ ] Deploy `server/multiplayer.mjs` to production container on Render / Fly.io **(Claude)**
- [ ] Update `data/demo.json` `serverUrl` with live deployed `wss://` endpoint **(Claude)**
- [ ] Verify connection handshake, rate limiting, and 20Hz snapshot sync over public WebSocket **(Claude)**

---

## Completed (2026-10-16)

- [x] **Cut 4 factions** — Removed oldMoney, emoKids, mlmHuns, theaterKids. 16 factions remain. (Moth)
- [x] **Chatter system** — Ambient team banter every 5s during silence, never interrupts action voices. `web/src/core/chatter.js` (Moth)
- [x] **Voice clipping fix** — 150ms startup + 250ms end padding on voice playback. (Moth)
- [x] **Alarm sound cuts** — Disabled car alarm, ping beeps; tamed hitmarker and reload. (Moth)
- [x] **WallStreetBets rewrite** — 53 lines converted from VC jargon to WSB degen voice. (Moth)
- [x] **Faction renames** — theGays→fabulous, vcBros→wallstreetBets. Drop "The" from 6 display names. (Moth)
- [x] **Remove "gay"** — WSB spotted line changed to "Bear spotted!" (Moth)
- [x] **Slur audit** — Zero slurs across all 1,057 lines. (Moth)
- [x] **README media section** — Documents itch.io/CrazyGames assets, links, branding rules. (Moth)
- [x] **3 custom maps** — Oakridge Cul-de-Sac, Shady Pines Pickleball Club, Sunset Strip Mall. (Mac side)
- [x] **5 game modes** — Cul-de-Sac Clash, Receipt Check, Evict the Block, HOA Patrol, Steal the Casserole. (Mac side)

---

## Removed (Should Not Be Done)

- [ ] ~~In-game 9:16 TikTok exporter button~~ — **REMOVED.** Owner rule: viral videos use external control code only, never code shipped in the game. Use `tools/viral-director/` instead.
- [ ] ~~20-faction references~~ — **CORRECTED.** Repo has 16 factions, not 20. All docs updated.

---

## Reference: Prior Work (2026-10-15 and earlier)

### Itch.io & CrazyGames Demo (done)
- [x] Packaging script (`npm run pack`)
- [x] Demo faction gating (6 factions: karens, tradwives, hoaDads, furries, trumpers, pickleballRetirees)
- [x] Steam wishlist funnel (CTA buttons, upsell modal)
- [x] Mobile controls, audio unlock, weapon tuning

### Steam Full Game (done)
- [x] Online multiplayer prototype (WebSocket server)
- [x] Native desktop wrapper + Steamworks integration
- [x] Steam store assets generated (`assets/steam/`)
- [x] Desktop distribution pipeline

### Content (done)
- [x] 16 factions with full voice line coverage
- [x] Rivalry system (46 rivalries)
- [x] Legal-safe alternates for brand names
- [x] Content audit: 0 problems
