// Call of Karen: HOA Warfare — Electron Preload Script
// Exposes window.SteamAPI to the renderer world via contextBridge.

const ACHIEVEMENTS = [
  {
    id: 'ACH_FIRST_FINE',
    name: 'First Citation',
    description: 'Score your first kill.',
    icon: 'ach_first_fine'
  },
  {
    id: 'ACH_LAWN_ORDER',
    name: 'Lawn & Order',
    description: 'Win a Cul-de-Sac Clash match.',
    icon: 'ach_lawn_order'
  },
  {
    id: 'ACH_CASSEROLE_THIEF',
    name: 'Casserole Bandit',
    description: 'Capture enemy casserole in Steal the Casserole.',
    icon: 'ach_casserole_thief'
  },
  {
    id: 'ACH_HOA_PATROL',
    name: 'Neighborhood Watch',
    description: 'Capture 3 zones in HOA Patrol.',
    icon: 'ach_hoa_patrol'
  },
  {
    id: 'ACH_EVICTION',
    name: 'Eviction Notice',
    description: 'Post or defuse notice in Evict the Block.',
    icon: 'ach_eviction'
  },
  {
    id: 'ACH_HELO_DOWN',
    name: "Dad's Pride Grounded",
    description: "Shoot down Dad's Helicopter.",
    icon: 'ach_helo_down'
  },
  {
    id: 'ACH_STREAK_5',
    name: 'Overbearing HOA',
    description: "Call in Dad's Helicopter killstreak.",
    icon: 'ach_streak_5'
  },
  {
    id: 'ACH_CAMP_SNITCH',
    name: 'Get Moving!',
    description: 'Trigger a camping self-snitch.',
    icon: 'ach_camp_snitch'
  },
  {
    id: 'ACH_LAWSUIT',
    name: 'See You in Court',
    description: 'Get a kill with a Lawsuit Grenade.',
    icon: 'ach_lawsuit'
  },
  {
    id: 'ACH_TROPHY_HUNTER',
    name: 'Everyone Gets a Trophy',
    description: 'Get a Participation Trophy melee kill.',
    icon: 'ach_trophy_hunter'
  },
  {
    id: 'ACH_FINE_FROM_ABOVE',
    name: 'Fine From Above',
    description: 'Call in the HOA drone gunship with a 9-killstreak.',
    icon: 'ach_fine_from_above'
  },
  {
    id: 'ACH_GOLD_STANDARD',
    name: 'Gold Standard',
    description: 'Earn 24K Gold camo on any weapon.',
    icon: 'ach_gold_standard'
  },
  {
    id: 'ACH_REZONED',
    name: 'Re-Zoned',
    description: 'Reach Supreme HOA Board President and Re-Zone (Prestige).',
    icon: 'ach_rezoned'
  }
];

let electron = null;
try {
  electron = require('electron');
} catch {}

const contextBridge = electron?.contextBridge;
const ipcRenderer = electron?.ipcRenderer;

// In-memory fallback tracking for headless/renderer-only environments
const inMemoryUnlocked = new Set();
let inMemoryState = {
  initialized: true,
  success: true,
  steamId: '76561198000000000',
  personaName: 'CulDeSacWarrior',
  offline: true,
  appId: 480
};

const SteamAPIBridge = {
  isDesktop: true,
  ACHIEVEMENTS,

  init(appId) {
    if (ipcRenderer && typeof ipcRenderer.sendSync === 'function') {
      try {
        const res = ipcRenderer.sendSync('steam:init-sync', appId);
        if (res) inMemoryState = res;
        return inMemoryState;
      } catch {}
    }
    if (appId) inMemoryState.appId = Number(appId);
    return inMemoryState;
  },

  unlockAchievement(achId) {
    if (!achId || typeof achId !== 'string') return false;
    inMemoryUnlocked.add(achId);
    if (ipcRenderer && typeof ipcRenderer.send === 'function') {
      try {
        ipcRenderer.send('steam:unlockAchievement', achId);
      } catch {}
    }
    return true;
  },

  isAchievementUnlocked(achId) {
    if (!achId) return false;
    if (ipcRenderer && typeof ipcRenderer.sendSync === 'function') {
      try {
        return Boolean(ipcRenderer.sendSync('steam:isAchievementUnlocked-sync', achId));
      } catch {}
    }
    return inMemoryUnlocked.has(achId);
  },

  getAchievements() {
    return ACHIEVEMENTS.map(ach => ({
      ...ach,
      unlocked: SteamAPIBridge.isAchievementUnlocked(ach.id)
    }));
  },

  getStatus() {
    if (ipcRenderer && typeof ipcRenderer.sendSync === 'function') {
      try {
        const res = ipcRenderer.sendSync('steam:getStatus-sync');
        if (res) return res;
      } catch {}
    }
    return {
      ...inMemoryState,
      unlockedCount: inMemoryUnlocked.size,
      totalCount: ACHIEVEMENTS.length
    };
  }
};

// Expose safe API to the renderer window
if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
  contextBridge.exposeInMainWorld('SteamAPI', SteamAPIBridge);
} else if (typeof window !== 'undefined') {
  window.SteamAPI = SteamAPIBridge;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SteamAPI: SteamAPIBridge, ACHIEVEMENTS };
}
