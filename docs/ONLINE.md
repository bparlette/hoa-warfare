# Online play

The web demo can run **8-player online matches**: real people on one cul-de-sac, bots in any empty seats. This guide covers trying it on your machine, putting the server online, and what it costs and risks.

## How it fits together

```
itch.io / CrazyGames / Newgrounds / GitHub Pages     your multiplayer server
        (static game files only)                      (a small Node program)
   browser  ──── wss://your-server/ws ───────────►    runs the real match,
   keys, mouse, touch  ◄── 20 snapshots/second ──     checks every shot and move
```

The portals only host static files, so the **server must live somewhere else**. It is one dependency-free Node file (`server/multiplayer.mjs`); it needs no database.

* The server is the referee. Your browser sends where you want to move and aim; the server decides what happens. Nobody can hand themselves health, speed or kills.
* Your own movement is predicted locally so it feels instant, then quietly corrected toward the server.
* Shots are lag-compensated: the server checks them against where you *saw* everyone, so hits register at normal internet pings.

## Try it on your computer (2 minutes)

```bash
npm run online:demo        # multiplayer server on :8080 (bots use only the demo factions)
npm run serve              # game on http://localhost:8642/web/?demo=1
```

Open the game in two browser tabs and press **QUICK MATCH ONLINE** in both: you are in the same room. **PLAY WITH FRIENDS** makes a 4-letter room code and an invite link (`COPY INVITE LINK` is in the pause menu).

* No second person handy? `npm run online:bot` adds a scripted player (`node tools/online_bot.mjs ROOM 3` adds three to room `ROOM`).
* On a phone on the same Wi-Fi: open `http://<your-computer's-LAN-IP>:8642/web/?demo=1`. The game finds the server on the same machine automatically.

## Put the server online

Any host that runs a Node or Docker app with WebSocket support works. The repo ships a `Dockerfile` and a `render.yaml`.

**Render (simplest, has a free tier):**
1. Push the repo to GitHub (it is already there).
2. Render dashboard → **New + → Blueprint** → choose `hoa-warfare`. It reads `render.yaml`.
3. When it is live you get `https://<name>.onrender.com`. Open it: you should see `{"status":"ok",...}`.
4. In `data/demo.json` set `"serverUrl": "wss://<name>.onrender.com/ws"`.
5. `npm run pack`, re-upload `dist/hoa-warfare-web-demo.zip` to itch.io / CrazyGames / Newgrounds, and push so GitHub Pages updates.

Fly.io, Railway, a VPS or a Raspberry Pi work the same way: run the container (or `node server/multiplayer.mjs`) and put it behind HTTPS.

**It must be `wss://` (HTTPS).** Portals are HTTPS pages, and browsers refuse plain `ws://` from them.

**Free tiers go to sleep** when idle, so the first player of the day waits while the server wakes up (up to about a minute). The game pings the server as soon as the menu opens and shows "Waking the server up…" so it is not mistaken for a crash. A small paid instance removes the wait.

### Settings (environment variables)

| Variable | What it does |
|---|---|
| `PORT` | Port to listen on (hosts set this for you). Default 8080. |
| `HOA_DEMO=1` | Bots use only the demo factions. Needed for the web demo: their voice lines are the only ones in the zip. |
| `HOA_TRUST_PROXY=1` | Behind a host's proxy, read the real player IP from `X-Forwarded-For` (otherwise every player looks like one IP and hits the per-IP limit). Already set in the Dockerfile and `render.yaml`. |
| `HOA_ALLOWED_ORIGINS` | Optional lock-down: comma-separated list of sites allowed to connect, e.g. `https://bparlette.github.io,https://html-classic.itch.zone`. Unset = any site (fine for a demo). The portals' exact iframe addresses can differ per game; if you set this and players cannot connect, check the server log for the rejected origin and add it. |

Limits live in `LIMITS` at the top of `server/multiplayer.mjs`: 40 rooms, 300 connections, 8 per IP, 4 KB per message, 150 messages/second per player, 30 s idle timeout.

## What it costs to run

Measured on a laptop with fake clients (`4 humans + 4 bots` per room):

| Rooms | Players | CPU |
|---|---|---|
| 5 | 20 | ~9% of one core |
| 30 | 120 | ~28% of one core |

Each player downloads about **26 KB/s (~90 MB per hour)**. A free or smallest paid instance comfortably runs a launch-day demo; the 300-connection cap is the first limit you would hit, then the CPU. If you outgrow one instance, raise the caps and the plan size, or run several servers (rooms are independent).

## Safety, for a server on the public internet

Built in and covered by tests (`web/tests/online.test.mjs`):
* Messages over 4 KB, unmasked or fragmented frames, and 1 TB size claims are refused before anything is buffered.
* Floods are dropped (150 messages/second), idle connections are closed after 30 s, slow clients are cut.
* Per-IP and total connection caps, a room cap, and empty rooms are closed (they would otherwise simulate bots forever).
* Player names and room codes are cleaned to letters/digits/space/`_ . -` (names are drawn into other players' screens); unknown factions fall back to Karens; NaN, Infinity and out-of-range inputs are clamped.
* The server decides everything that matters (movement, damage, ammo), so a modified client cannot cheat its way to wins.

Not built (worth adding before a big launch): accounts or bans, text chat, reporting, a leaderboard. Anyone can join a public Quick Match; names are not moderated beyond the character filter.

## CrazyGames, itch.io, Newgrounds

* **itch.io** and **Newgrounds** accept the zip as is, with `serverUrl` set. 
* **CrazyGames** reviews games before they go public and normally expects their SDK to be integrated (ad breaks, gameplay start/stop). Their rules on multiplayer, chat and edgy content are theirs to apply, so check their current developer guidelines before submitting. A private upload is a fine place to test.

## Known limits (honest list)

* Online matches are **Cul-de-Sac Clash** only (the other modes run offline against bots).
* Voice barks are chosen on each player's own device from the match events, so two players may hear different taunts for the same kill.
* Bandwidth could be cut roughly in half again with a binary format; JSON keeps it easy to debug.
* A browser tab in the background stops sending input, so that player stands still after half a second.
