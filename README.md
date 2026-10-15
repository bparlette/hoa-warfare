# Call of Karen: HOA Warfare

Comedy low-poly retro FPS. This repo holds the content (single source of truth), the engine-agnostic
voice/match logic, and a playable **web slice** of the non-Roblox (Steam-look) build.

## Play the web slice

```bash
npm run serve          # or: node tools/serve.mjs
# open http://localhost:8642/web/
```

Cul-de-Sac Clash (TDM to 40 or 5:00), 6v6 with bots, Phase 0 factions (Karens, Brain Rot, Frat House,
Clout Streamers). Click to lock the mouse.

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
npm test               # 25 tests: core rules + full seeded bot matches, killcam, camping, grenades
npm run lint           # 1.8-second rule + event coverage
node tools/shot.mjs "spectate=1&seed=7&voice=0" dist/shot.png 8   # needs serve running + Chrome
```
