# Task Board: Call of Karen (HOA Warfare)

Status: `open`, `claimed by <name> (date)`, or `done (<commit>)`. Claim one task at a time in this file.

**Current state (2026-10-16):** 16 factions (4 cut: oldMoney, emoKids, mlmHuns, theaterKids). 159 tests passing. Demo on itch.io live with 6 factions.

---

## Active Priorities

### P0: Steam "Coming Soon" Page
- [ ] Pay $100 Steam Direct fee and register app at partner.steamgames.com **(owner)**
- [ ] Upload storefront assets from `assets/steam/` (7 files, all built)
- [ ] Paste store copy from `docs/launch/store-copy.md`
- [ ] Set status to "Coming Soon" — target 7k-10k wishlists
- [ ] Update `data/demo.json` `steamUrl` with live App ID URL

### P0: Voice Generation (Full Run)
- [ ] Run `tools/hoa_warfare_voice_studio.ipynb` in Colab for all 1,057 lines across 16 factions
- [ ] Upload `.ogg` files to `web/vo/` via browser (never connector — corrupts binaries)
- [ ] Update `web/vo/manifest.json`
- [ ] **Do NOT touch gun sounds** (owner directive 2026-10-16)

### P1: itch.io Page Optimization
- [x] Upload screenshots and GIFs (6 files live)
- [ ] Add YouTube trailer link (need viral video uploaded to YouTube first)
- [ ] Fix duplicated description text

### P1: CrazyGames Submission
- [ ] Fix landscape + square cover upload (currently failing)
- [ ] Submit for QA review

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
