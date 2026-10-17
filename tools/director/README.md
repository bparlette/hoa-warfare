# Director: scripted gameplay clips for social video

Video tooling, not game code: nothing under `web/` imports it. A shot script says exactly who moves where,
who aims at whom, when shots are fired, which voice line plays when, where the camera is, and what the
captions say. The director runs it on the real game simulation and renderer and writes a vertical MP4.

```sh
node tools/director/direct.mjs tools/director/scripts/hoa-ambush.mjs --dry   # timeline only, ~1 s
node tools/director/direct.mjs tools/director/scripts/hoa-ambush.mjs         # dist/director/hoa-ambush.mp4
```

- **Output:** 1080x1920, 30 fps H.264, AAC loudness-normalised to -14 LUFS (TikTok/Reels/Shorts), plus
  `<name>.timeline.json` listing every hit, kill, voice line and arrival with its time.
- **Deterministic:** the sim advances exactly 1/fps per rendered frame, so a script always gives the same clip,
  however slow the machine. `--dry` runs the same simulation without rendering: check kills land where you
  want before spending a minute rendering.
- **Audio:** every gunshot (per weapon class), kill ding, explosion and voice line is mixed offline at its exact
  time; voice lines come from `web/vo/manifest.json` by line ID (`--dry` lists the nearest IDs on a typo).
- **Needs:** Google Chrome and ffmpeg.

The cue reference is the header of `stage.js`; `scripts/hoa-ambush.mjs` is a worked example. Tips:
fire with `head: true` for headshots; give the shooter a moment of `aim` before `fire` so the turn reads on
camera; keep the shooter off-centre with the follow camera's `side` so the target stays visible.
