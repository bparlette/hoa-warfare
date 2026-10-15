# Steamworks Integration & Desktop Wrapper Guide

**Game:** Call of Karen: HOA Warfare  
**Status:** P0 Desktop / Steam Launch Architecture  
**Target Platform:** Windows, macOS, Linux / Steam Deck (Proton & Native)

---

## 1. Overview & Architecture

Call of Karen: HOA Warfare packages its WebGL/Three.js tactical FPS engine into a native desktop application using an Electron wrapper with a secure Steamworks SDK bridge.

### Core Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Steam Client                           │
│  (Steam Overlay, Cloud Saves, Achievements, Community)      │
└──────────────────────────────▲──────────────────────────────┘
                               │ IPC / Native C++ Bindings
┌──────────────────────────────▼──────────────────────────────┐
│             Desktop Main Process (desktop/main.mjs)         │
│  • Window Management (1920x1080, Borderless Fullscreen)    │
│  • Loopback HTTP Server (127.0.0.1 - Zero CORS issues)      │
│  • Steamworks SDK Bridge (desktop/steamworks.js)            │
└──────────────────────────────▲──────────────────────────────┘
                               │ contextBridge / IPC
┌──────────────────────────────▼──────────────────────────────┐
│            Preload Sandbox (desktop/preload.cjs)            │
│  • Exposes window.SteamAPI to browser context               │
└──────────────────────────────▲──────────────────────────────┘
                               │ window.SteamAPI calls
┌──────────────────────────────▼──────────────────────────────┐
│           Game Engine & HUD (web/src/engine/)               │
│  • Match tracker triggers (kills, wins, streaks)           │
│  • In-game achievement toasts & stats synchronization       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Steam Direct App ID Setup

### 2.1 Development vs Production App ID

| Environment | App ID | Description |
|---|---|---|
| **Development / Staging** | `480` | Valve's default *Spacewar* test App ID. Used during development and automated tests before Steam Direct approval. |
| **Production Launch** | Allocated via Steam Direct | The unique App ID generated when paying the $100 Steam Direct fee for *Call of Karen: HOA Warfare*. |

### 2.2 `steam_appid.txt` Configuration

Steamworks requires a plaintext file named `steam_appid.txt` placed in the execution root directory alongside the application binary.

1. `tools/build_desktop.mjs` automatically generates `steam_appid.txt` with App ID `480` by default.
2. To specify a production App ID:
   ```bash
   node tools/build_desktop.mjs --appId=YOUR_APP_ID
   ```
   Or set the environment variable:
   ```bash
   export STEAM_APP_ID=YOUR_APP_ID
   npm run desktop
   ```

> [!IMPORTANT]
> The Steam desktop client must be running on your machine for native Steamworks features (achievements, overlay, cloud saves) to initialize. If Steam is not running or the app is run in a web browser, `SteamAPI` automatically activates **safe fallback / offline mode**, recording achievements in memory without throwing errors.

---

## 3. The 10 Launch Steam Achievements

The following 10 achievements are defined in `desktop/steamworks.js` and must be registered in the Steamworks Partner backend:

| API Key | Display Name | Description | In-Game Trigger Condition | Hidden? |
|---|---|---|---|---|
| `ACH_FIRST_FINE` | **First Citation** | Score your first kill. | `tracker.onKill`: Player records their 1st elimination. | No |
| `ACH_LAWN_ORDER` | **Lawn & Order** | Win a Cul-de-Sac Clash match. | Match end: Player team score > enemy team in `clash`. | No |
| `ACH_CASSEROLE_THIEF` | **Casserole Bandit** | Capture enemy casserole in Steal the Casserole. | `StealTheCasserole`: Deliver enemy dish to home lawn. | No |
| `ACH_HOA_PATROL` | **Neighborhood Watch** | Capture 3 zones in HOA Patrol. | `HoaPatrol`: Player captures 3 separate hardpoints. | No |
| `ACH_EVICTION` | **Eviction Notice** | Post or defuse notice in Evict the Block. | `EvictTheBlock`: Post notice on door or defuse notice. | No |
| `ACH_HELO_DOWN` | **Dad's Pride Grounded** | Shoot down Dad's Helicopter. | `helicopter.takeDamage`: Reduce streak HP to 0. | No |
| `ACH_STREAK_5` | **Overbearing HOA** | Call in Dad's Helicopter killstreak. | `tracker.onStreak(5)`: Reach a 5-kill streak. | No |
| `ACH_CAMP_SNITCH` | **Get Moving!** | Trigger a camping self-snitch. | `campingMonitor`: Stand still for >20 seconds. | No |
| `ACH_LAWSUIT` | **See You in Court** | Get a kill with a Lawsuit Grenade. | `sim`: Enemy eliminated with lawsuit explosive damage. | No |
| `ACH_TROPHY_HUNTER` | **Everyone Gets a Trophy** | Get a Participation Trophy melee kill. | `sim`: Enemy eliminated with trophy melee hit (`F` key / `B`). | No |

### 3.1 Steamworks Partner Portal Setup Steps

1. Log into [Steamworks Partner Portal](https://partner.steamgames.com/).
2. Select **Call of Karen: HOA Warfare** -> **Technical Tools** -> **Stats & Achievements**.
3. Under **Achievements**, click **New Achievement** for each of the 10 entries above.
4. Set the **API Name** exactly matching the keys above (e.g., `ACH_FIRST_FINE`).
5. Upload 256x256 PNG icons for both **Achieved** (full color) and **Unachieved** (monochrome/gray) states.
6. Click **Save** and publish changes to the Steam staging environment.

---

## 4. Desktop Wrapper Configuration

### 4.1 Window Specifications (`desktop/main.mjs`)
- **Default Resolution:** `1920x1080` (1080p Full HD).
- **Minimum Resolution:** `1280x720` (720p).
- **Aspect Ratio:** 16:9 responsive; scales automatically to 16:10 for Steam Deck (`1280x800`).
- **Menu Bar:** `autoHideMenuBar: true` (clean borderless presentation).
- **Fullscreen Mode:** Supported via `--fullscreen` launch flag or runtime toggle via `F11`.

### 4.2 Loopback Server vs `file://` Protocol
Loading WebGL games with Three.js, ES modules (`import`/`export`), and audio files over `file://` triggers Chromium CORS blocks.  
`desktop/main.mjs` starts a lightweight internal loopback HTTP server bound exclusively to `127.0.0.1` on an ephemeral port. This ensures:
- Zero CORS policy errors.
- Fast streaming of `.ogg` and `.webm` assets.
- Complete isolation from external network interfaces.

### 4.3 Preload API (`desktop/preload.cjs`)
Exposes `window.SteamAPI` to the web client using Electron's secure `contextBridge`:
```javascript
// Check Steam connection status
const status = window.SteamAPI.init();
console.log('Steam user:', status.personaName, 'ID:', status.steamId);

// Unlock achievement
window.SteamAPI.unlockAchievement('ACH_FIRST_FINE');

// Check achievement status
if (window.SteamAPI.isAchievementUnlocked('ACH_FIRST_FINE')) {
  console.log('Citation already issued!');
}

// List all 10 achievements
const allAchievements = window.SteamAPI.getAchievements();
```

---

## 5. Build & Packaging Instructions

### 5.1 Staging Desktop Assets
To stage the game files into `dist/desktop/`:
```bash
npm run desktop
# or directly:
node tools/build_desktop.mjs
```

### 5.2 Building Native Executables (electron-builder)
Install electron and electron-builder in your build environment:
```bash
npm install --save-dev electron electron-builder
```

#### Windows (`.exe`):
```bash
npx electron-builder --win --dir dist/desktop
```

#### macOS (`.app`):
```bash
npx electron-builder --mac --dir dist/desktop
```

#### Linux & Steam Deck (`AppImage` / native binary):
```bash
npx electron-builder --linux --dir dist/desktop
```

---

## 6. Steam Deck & Proton Verification Checklist

Call of Karen: HOA Warfare is designed to target **Steam Deck Verified** status on launch:

1. **Resolution & Display:**
   - 1280x800 native resolution supported without letterboxing.
   - Default UI scaling tested for handheld 7" screen.
2. **Controller Input:**
   - Full controller navigation enabled (`gamepad.js` handles sticks, triggers, and face buttons).
   - Virtual keyboard prompts when text entry is needed.
3. **Performance Target:**
   - Locked 60 FPS on standard Deck APU (utilizes procedural retro textures and draw-call batching).
4. **Proton Compatibility:**
   - Windows build runs out-of-the-box via Proton 8.0+ or native Linux Electron runtime.
