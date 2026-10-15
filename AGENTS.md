# Agent Collaboration Guide: Call of Karen (HOA Warfare)

Welcome! This repo is actively co-developed by autonomous agents (Opus — engineering lead, Sonnet, Muse, Antigravity) and human contributors. Current next-work queue per agent: top of `TASKS.md`.
Follow these rules so everyone can work in parallel without stepping on toes or breaking builds.

## 1. Golden Rules
- **Run `npm test` before every push.** All unit and headless simulation tests must stay green (`npm test`; also `npm run lint`).
- **Append-only content IDs (`data/hoa_content.json`).** Line IDs (e.g. `karens.firstBlood.c.0`) are permanently stable for audio voice recording. Never delete or reorder existing array indices; always append new lines.
- **Engine-agnostic core (`web/src/core/`).** The logic in `web/src/core/` (BarkDirector, CampingMonitor, AudioLimiter, MatchTracker, ShuffleBag) must NEVER depend on Three.js, DOM, or browser globals so it can run headlessly in Node tests and port 1:1 to C#/Unity.
- **Single Source of Truth for Weapons (`data/weapons.json`).** `sim.js` reads weapon properties directly from this file. Add or rebalance weapons by editing `data/weapons.json`, not by hardcoding logic in `sim.js`.
- **Public repo.** No real names, personal details, keys or local paths in files or commit messages.
- **Shared working copy.** Several agents edit this checkout at the same time. Re-read a file right before changing it (never write from a stale buffer), write atomically (temp file + rename), and stage only your own hunks (`git add -p`-style or by building the blob from `HEAD`). Never `git stash`, `checkout --` or `reset --hard` files you didn't change.
- **JSON formatting.** `data/*.json` is 2-space indented (`JSON.stringify(x, null, 2)` / Python `indent=2, ensure_ascii=False`). Re-indenting a whole file makes every other agent's merge conflict.
- **Content rule (owner, 2026-10-15).** Edgy identity factions are allowed (e.g. The Gays, The Trumpers) and every group gets roasted equally. Never: dog-whistles ("globalist", etc.), slurs, calls for violence against a group, or lines that only work as hate. Brand names need a legal-safe `alt`. Run `node tools/script_tools.mjs audit` before committing content.
- **Input.** All player input goes through `web/src/engine/controls.js` (keyboard/mouse, gamepad, touch). Don't add input listeners elsewhere.
- **Claim tasks before starting.** Edit `TASKS.md` in your first commit to mark a task `claimed by <AgentName> (YYYY-MM-DD)`, then mark `done (<commit>)` when complete.

## 2. Testing & Running
```bash
# Run all headless test suites
npm test

# Run the local development server (web slice)
npm run serve
# Open http://localhost:8642/web/

# Run script tools (linting, CSV generation for voice sheets, stats)
node tools/script_tools.mjs lint
node tools/script_tools.mjs stats
node tools/script_tools.mjs csv > dist/vo_session_sheet.csv

# Take headless automated screenshot/smoke test (requires Chrome)
node tools/shot.mjs "spectate=1&seed=7" dist/smoke.png 5
```

## 3. Architecture & Ownership Domains
- **Core Simulation**: `web/src/core/` and `web/src/engine/sim.js`, `map.js`, `modes.js`.
- **Presentation**: `web/src/engine/render.js`, `character.js`, `textures.js`, `audio.js`, `game.js`, `controls.js`.
- **Unity C# Port**: `unity/` (clean room port of `web/src/core/`).
- **Data & Voice Content**: `data/hoa_content.json`, `data/weapons.json`, `web/vo/`.
