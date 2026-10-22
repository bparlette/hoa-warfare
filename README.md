# Call of Karen: HOA Warfare

Comedy low-poly retro FPS. This repo holds the content (single source of truth), the engine-agnostic
voice/match logic, and a playable **web slice** of the non-Roblox (Steam-look) build.

> **🚀 Steam Deploy Plan**: See [**DEPLOY.md**](DEPLOY.md) for the "Coming Soon" store page, wishlist funnel, and $4.99 release strategy.

## Play the web slice

```bash
npm run serve          # or: node tools/serve.mjs
# open http://localhost:8642/web/
```

Cul-de-Sac Clash (TDM to 40 or 5:00), 6v6 with bots across 16 shipping factions, 4 maps
(Oakridge Cul-de-Sac, Shady Pines Pickleball Club, Sunset Strip Mall, Model Home Showcase),
and 8 tactical modes + Suburban Firing Range tutorial. Click to lock the mouse.

| Key | Action |
|---|---|
| WASD / mouse / click | move / aim / fire *The Allowance* |
| Space, Shift | jump (try the trampoline), sprint |
| R | reload |
| F | *The Participation Trophy* melee (one-hit, victim gets a "humiliated" line) |
| G | throw *The Lawsuit* (briefcase grenade; yes, it can kill you) |
| Tab | scoreboard |
| 1 / 2 | Clean <-> Steam script / legal-safe mode, live |
| P | 16-bit render on/off (off = what the Roblox build looks like) |
| M | mute voices |

URL params: `?seed=N&faction=karens&script=steam&legal=0&retro=0&voice=0&autostart=1&spectate=1`
(`spectate=1` makes you a bot with a chase cam, for demos and screenshots).

Voices are browser TTS placeholders using each faction's pitch/rate. Recorded VO takes over
automatically: drop `<line_id with . -> _>.ogg` files in `web/vo/` and list the line IDs in
`web/vo/manifest.json`. `node tools/script_tools.mjs csv > dist/vo_session_sheet.csv` makes the
recording sheet with matching file names.

## Store Media & Branding

This section documents exactly what images, videos, GIFs, and descriptions are live on each storefront, so any agent can keep them in sync.

### itch.io (Demo — Public)
- **Page:** https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare
- **Edit:** https://itch.io/game/edit/5164539
- **Cover:** `web/assets/badge.png` (military shield with crosshair — official logo)
- **Secondary logo:** `web/assets/logo.png` (pixel-art Karen mascot — wide displays only)
- **Screenshots:** 3 gameplay stills from viral renders (`~/workspace/itch_media/shot1.png`, `shot2.png`, `shot3.png`)
- **GIFs:** 3 kill-shot GIFs (`~/workspace/itch_media/karen_kill.gif`, `trumper_kill.gif`, `tradwife_kill.gif`)
- **Trailer:** YouTube embed (pending — viral video upload)
- **Tagline:** "Satirical suburban tactical FPS — coming soon."
- **Description:** Multiplayer promo + feature list (see edit page)

### itch.io (Full Game — Coming Soon / Preorder)
- **Page:** https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare-full
- **Edit:** https://itch.io/game/edit/5166220
- **Price:** $4.99 — no files uploaded yet, no payment method configured
- **Status:** Public (Coming Soon) — followers get launch notifications

### CrazyGames (Draft)
- **Dashboard:** https://developer.crazygames.com/games/f297f3d3-eeaa-40bd-a670-2e9ae903bba9
- **Display name:** `homebrewgametrailers`
- **Category:** Shooting — **Tags:** `3D`, `FPS`, `Battle`, `Gun`, `Meme`
- **Assets:** `assets/crazygames/` (`cover_landscape_1280x720.jpg`, `cover_square_512x512.png`, `cover_square_256x256.png`)
- **Status:** Cover assets formatted to exact portal dimensions; ready for QA submission

### Branding Rules (owner-locked)
- Only two logos in repo: `web/assets/badge.png` (official) and `web/assets/logo.png` (secondary)
- No "Parlette" / "bparlette" / GitHub URLs in any files delivered to itch.io or CrazyGames
- Wishlist/Steam buttons are inert until a Steam page exists

## Layout

```
data/hoa_content.json      all lines, events, tuning (append-only line arrays = stable VO IDs)
web/src/core/              engine-agnostic logic (port 1:1 to C#): content, bark director,
                           audio limiter + announcer queue, camping monitor, match tracker
web/src/engine/
  map.js                   Cul-de-Sac geometry, nav graph, ray helpers (no three.js)
  sim.js                   movement, hitscan, melee, grenades, scoring, respawn, camping, bots (no three.js)
  barks.js                 sim events -> MatchTracker -> BarkDirector -> announcer; killcam line resolution
  render.js                three.js scene, FX, viewmodel, killcam camera, 16-bit post pass
  character.js             low-poly faction characters + comedy ragdolls
  textures.js              procedural pixel textures (placeholders for hand-painted art)
  audio.js                 VO/TTS voice channel + synthesized SFX
  game.js                  menu, loop, input, HUD, killcam replay, end-of-match podium
web/tests/                 npm test: core logic + headless full-match sim tests
tools/                     script_tools (lint/csv/stats), serve, shot (headless Chrome screenshots)
```

## The 16-bit look

The scene renders to a low-res target (216 px tall), then a post pass maps every pixel to a fixed
32-colour palette with 4x4 Bayer dithering and point-filtered upscaling (`render.js`, `RETRO_FRAG`).
Lights use three.js r160 physical intensities. Same technique ports directly to a Unity URP
render feature or a Godot `SubViewport` + canvas shader.

## Checks

```bash
npm test               # 286 tests: core rules + full seeded bot matches, killcam, camping, grenades, maps, modes, achievements
npm run lint           # 1.8-second rule + event coverage
node tools/shot.mjs "spectate=1&seed=7&voice=0" dist/shot.png 8   # needs serve running + Chrome
```
