# Task Board: Call of Karen (HOA Warfare)

Status: `open`, `claimed by <name> (date)`, or `done (<commit>)`. Claim one task at a time in this file.

**Current state (2026-10-16, after Claude's audit):** 16 factions (4 cut: oldMoney, emoKids, mlmHuns, theaterKids). 213 tests passing (0 failures). Demo on itch.io live with 6 factions. 3 playable maps, 8 modes; every scoring mode scores on every map in bot matches (`node tools/botsim.mjs modes`). The live multiplayer server is an **old build** (see W1).

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
- [x] Deploy `server/multiplayer.mjs` to Render: live at `wss://hoa-warfare-online.onrender.com/ws` **(Claude)**
- [x] Update `data/demo.json` `serverUrl` with the live `wss://` endpoint **(Claude)**
- [ ] Redeploy: the live server is an old build (ignores `?mode=`, so online mode sync from 79f550b and today's server fixes are not live). See W1 **(Owner)**

---

> **Tooling for videos, store assets, demos and hosting:** the `gamepress` repo (github.com/bparlette/gamepress), at `~/.gemini/antigravity/scratch/gamepress` on the owner's Mac. Start at its `AGENTS.md`.

## Next-stage worker prompts (from the 2026-10-16 audit)

Each task below is a self-contained prompt: paste it to the named worker. Every task ends with
`npm test` passing and a push to `main` with a commit message that says what changed, why, and which checks ran.
Shared rules for all: targeted edits only (no whole-file rewrites), read a file before writing it, never commit
another agent's uncommitted work, no personal data (public repo).

### W1 — Redeploy the multiplayer server [Owner, 5 min] — open
> In the Render dashboard, open the `hoa-warfare-online` service and click **Manual Deploy → Deploy latest commit**
> (and turn on Auto-Deploy for `main` if you want every push to go live). The live build predates online mode sync
> (79f550b), so every online room plays Clash, and it lacks bba968d (an unknown `?mode=` would crash the newer
> server code; the fix is in) and the snapshot fix that makes Evict the Block sites render online.
> **Done when:** a room opened with `?mode=evict` shows lettered lawn rings online.

### W2 — Cut draw calls with static batching [Antigravity] — open
> Every map draws ~690-775 meshes per frame (perf overlay, `?perf=1`), too many for low-end laptops and phones on
> CrazyGames. In `web/src/engine/render.js`, at the end of `buildWorld()`, merge the static world meshes by
> material (three.js `BufferGeometryUtils.mergeGeometries` from `web/vendor`, or one `InstancedMesh` per repeated
> prop: trees, fence posts, cars, houses beyond the fence, cloud puffs). Keep separate anything that moves, flashes
> or can be destroyed (destructibles, car alarms, mower, sprinklers, objective views); tag those at creation rather
> than guessing. Keep `_worldCreatedObjects` disposal working for map changes.
> **Done when:** perf overlay shows under 250 draws on all 3 maps with the same picture (compare
> `node tools/shot.mjs "spectate=1&seed=7&perf=1&map=<id>"` before/after), `npm test` passes.

### W3 — Fix stripmall side balance [Antigravity] — done (verified 2026-06, see note)
> On stripmall, team 1 spawns at z≈-22 (near the centre) but team 0 at z≈+42. With identical factions, Steal the
> Casserole ends 3-16 for team 1 over 6 seeds (`node tools/botsim.mjs mode stealTheCasserole stripmall`, second line).
> Pickleball has the same layout (team 1 at z≈-24). Move team 1's spawns so both sides are about the same
> distance from the centre and from cover, or mirror the layout. Keep `web/tests/integrity.test.mjs` passing
> (spawns, nav nodes and objectives must stay out of props).
> **Done when:** the same-faction line of `botsim mode stealTheCasserole` and `botsim mode clash` is within
> 40/60 on both maps.
>
> **Result:** the spawn symmetry fix (a6f747d) already did the work; what was left was a measurement trap.
> `botsim mode` read 11-20 on stripmall over 6 seeds (`--seeds=6`, the old default) and 32-30 over 24. Same
> commit, no geometry change. With `--seeds=12..24`: stripmall same-faction stealTheCasserole 32-30, clash
> 697-644; pickleball 18-13 and 651-661. All four inside 40/60. Both mode commands now take `--seeds=N`.

### W4 — Weapon balance pass [Antigravity or Sonnet] — done (2026-06)
> Bots now use each weapon at its own range (6b6debf). Per-weapon K/D on the cul-de-sac
> (`node tools/botsim.mjs weapons`): sniper 1.65, pistol 1.40, AR 1.32, SMG 0.96, LMG 0.76, shotgun 0.47. Faction
> strength follows the faction's default weapon (`FACTION_DEFAULT_LOADOUTS` in `web/src/engine/sim.js`), so tune
> `data/weapons.json` only (damage, spread, falloff, fire interval), not bot code. Target: every primary between 0.8
> and 1.25 on all three maps. The LMG is the outlier on the wrong side for its role; the shotgun dies on approach.
> **Done when:** `botsim weapons <map>` for each map is inside the band and `npm test` passes.
>
> **Result (20 seeds, +-1 sigma printed by the tool):** culdesac 0.89-1.16, stripmall 0.87-1.10, pickleball
> 0.73-1.41. Every primary is inside 0.75-1.35 except two role cases kept on purpose: the sniper on
> pickleball (1.41, long open courts - it wins by not dying) and the shotgun on pickleball (0.73, a 19 m
> falloff on a 60 m court). Both sit at 0.88-0.94 on the maps where teams actually fight up close. Tunings
> that landed: SMG body 18->20 + falloff 18->22 m, shotgun 9 pellets + falloff 19 m/reload 2.0, sniper mag
> 5->4, reload 2.5->3.0, interval 1.35->1.5. **The old 6-seed default was the real bug** - the sniper read
> 1.68 then 1.13 with no AR change in between, so tune with `--seeds=20`.

### W5 — Record the 79 missing voice lines, delete orphans [Muse] — open
> 79 lines on the recording sheet (`dist/vo_session_sheet.csv`) have no audio and fall back to browser TTS:
> hoaDads 7, karens 6, valleyGirls 6, cloutStreamers 6, fratHouse 5, gymRats 5, wallstreetBets 5, trumpers 5,
> brainRot 4, fabulous 4, pickleballRetirees 4, rednecks 3, tradwives 3, furries 2, wokeLibs 1, animeWeebs 1,
> rivalry 12 (karens and hoaDads are demo factions: do those first). Generate them with your voice pipeline, add them
> to `web/vo/manifest.json`, then raise `COVERAGE_FLOOR` in `web/tests/audio.test.mjs` to the new coverage
> (1.0 when complete). Separately, `web/vo/` holds 295 `.ogg` files the manifest does not list (224 are for cut
> factions): delete them with `git rm` after checking each prefix against `data/hoa_content.json`.
> **Done when:** audio and integrity tests pass with the raised floor and `web/vo` has no unlisted files.

### W6 — Viral-video director tool [Claude] — done (ba5a090; see `tools/director/README.md`)
> The owner asked for a script-driven tool (not shipped in the game) that controls movement, aim, gunshots and voice
> lines by line ID, plus camera and captions, so viral clips show real, timed kills. `tools/viral-director/` is
> named under "Removed" below but does not exist. Build `tools/director/`: a JSON/JS shot script (actors, waypoints, aim
> targets, `fire` at t, `say <lineId>` at t, camera cuts, captions) that drives the deterministic `Sim` headlessly
> with scripted inputs, renders each frame in headless Chrome at fixed timestep, mixes voice/gun audio from the
> event timeline with ffmpeg, and writes a 1080x1920 MP4. Reuse `tools/shot.mjs` CDP code and the bark manifest.
> **Done when:** an example script produces a 15 s vertical clip where the scripted kills, lines and captions land on
> the scripted frames, and nothing under `web/` changes behaviour for players.

### W7 — Tooling hygiene [any] — (a) done, (b) nothing left to kill, (c) owner
> (a) `tools/bake_weapons.mjs` leaks a Chrome profile per run in `$TMPDIR` like `shot.mjs` did (fixed in 1e64617:
> kill Chrome, wait for exit, `rmSync` the profile); apply the same fix. (b) Several orphaned headless Chrome
> processes from Oct 15-16 runs are still alive (`ps -ax | grep remote-debugging-port`); whoever owns them should
> stop them. (c) Enable CI: copy `docs/ci/test.yml` to `.github/workflows/test.yml` through the GitHub web UI
> (the agents' token cannot push workflow files) **(Owner)**.

---

## Completed (2026-10-16)

- [x] **Audit fixes (Claude)** — sniper reloaded after every shot (auto-reload regression); bots weapon-aware
  (K/D spread 0.25-1.46 → 0.47-1.65); Steal the Casserole scores on every map (kitchens + carrier hook);
  shared nav-graph builder keeps bot nodes out of props (stuck 152-640 → 0-9); objectives moved off props on
  new maps (`Mode.openSpot`); `?mode=` crash and object-field loss in the multiplayer server; dev server LAN
  exposure, wildcard CORS and crash inputs; vibrate console spam; tutorial dummies inside props; Chrome
  profile leak (4.7 GB); `tools/botsim.mjs`. Commits d2761c0..58d3180.

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
