// Call of Karen: HOA Warfare — Steamworks SDK Integration Bridge
// Implements safe, fallback-friendly Steamworks SDK bridge.
// Connects to native greenworks / steamworks.js when available,
// or gracefully falls back to mock/offline mode for web and headless testing.

import { createRequire } from 'node:module';
import rawAchievements from '../data/achievements.json' with { type: 'json' };

// The Launch Steam Achievements for Call of Karen: HOA Warfare (single source of truth in data/achievements.json)
export const ACHIEVEMENTS = rawAchievements.map(a => ({
  id: a.id,
  name: a.name,
  description: a.description,
  icon: a.steamIcon
}));

export const ACHIEVEMENT_MAP = Object.freeze(
  Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]))
);

const MOCK_STEAM_ID = '76561198000000000';
const MOCK_PERSONA_NAME = 'CulDeSacWarrior';
const DEFAULT_APP_ID = 480; // Steam Spacewar development ID

/**
 * Steamworks Bridge providing universal API access with zero-crash fallbacks.
 */
export class SteamworksBridge {
  constructor(options = {}) {
    this.appId = options.appId || (typeof process !== 'undefined' && process.env?.STEAM_APP_ID ? Number(process.env.STEAM_APP_ID) : DEFAULT_APP_ID);
    this.initialized = false;
    this.offline = true;
    this.steamId = MOCK_STEAM_ID;
    this.personaName = MOCK_PERSONA_NAME;
    this.nativeClient = null;
    this.nativeType = null;
    this._unlockedAchievements = new Set();
    this.ACHIEVEMENTS = ACHIEVEMENTS;
    this.ACHIEVEMENT_MAP = ACHIEVEMENT_MAP;
  }

  /**
   * Initialize Steamworks connection or activate fallback mode.
   * @param {number} [appId] Optional Steam App ID override.
   * @returns {{ initialized: boolean, success: boolean, steamId: string, personaName: string, offline: boolean, appId: number }}
   */
  init(appId) {
    if (appId) {
      this.appId = Number(appId);
    }

    if (this.initialized) {
      return this.getStatus();
    }

    // Try loading native Steamworks SDKs if available
    const native = this._tryLoadNative(this.appId);
    if (native) {
      this.nativeClient = native.client;
      this.nativeType = native.type;
      this.initialized = true;
      this.offline = false;
      this.steamId = native.steamId || MOCK_STEAM_ID;
      this.personaName = native.personaName || MOCK_PERSONA_NAME;
      console.log(`[SteamAPI] Native Steamworks initialized (${this.nativeType}) for AppID ${this.appId}. User: ${this.personaName} (${this.steamId})`);
    } else {
      // Offline fallback mode
      this.initialized = true;
      this.offline = true;
      this.steamId = MOCK_STEAM_ID;
      this.personaName = MOCK_PERSONA_NAME;
      console.log(`[SteamAPI] Running in offline fallback mode for AppID ${this.appId}. User: ${this.personaName} (${this.steamId})`);
    }

    return this.getStatus();
  }

  /**
   * Unlock a Steam achievement and trigger notification popup.
   * @param {string} achId Achievement identifier (e.g. 'ACH_FIRST_FINE')
   * @returns {boolean} True if achievement was processed successfully.
   */
  unlockAchievement(achId) {
    if (!achId || typeof achId !== 'string') {
      console.warn(`[SteamAPI] Invalid achievement ID: ${achId}`);
      return false;
    }

    const def = ACHIEVEMENT_MAP[achId];
    if (!def) {
      console.warn(`[SteamAPI] Achievement ID not registered in launch list: "${achId}"`);
    }

    // If native client is active, dispatch to native SDK
    if (!this.offline && this.nativeClient) {
      try {
        if (this.nativeType === 'steamworks.js') {
          this.nativeClient.achievement.activate(achId);
          console.log(`[SteamAPI] Native achievement activated: ${achId}`);
          return true;
        } else if (this.nativeType === 'greenworks') {
          this.nativeClient.activateAchievement(achId, () => {
            console.log(`[SteamAPI] Greenworks achievement activated: ${achId}`);
          }, (err) => {
            console.warn(`[SteamAPI] Greenworks achievement activation failed: ${err}`);
          });
          return true;
        }
      } catch (err) {
        console.warn(`[SteamAPI] Failed native achievement activation for ${achId}:`, err);
      }
    }

    // Fallback in-memory tracking
    const wasUnlocked = this._unlockedAchievements.has(achId);
    this._unlockedAchievements.add(achId);
    if (!wasUnlocked) {
      const name = def?.name || achId;
      console.log(`[SteamAPI] Achievement unlocked: ${achId} ("${name}")`);
    }

    return true;
  }

  /**
   * Query status of an achievement.
   * @param {string} achId
   * @returns {boolean}
   */
  isAchievementUnlocked(achId) {
    if (!achId) return false;

    if (!this.offline && this.nativeClient) {
      try {
        if (this.nativeType === 'steamworks.js') {
          return Boolean(this.nativeClient.achievement.isActivated(achId));
        } else if (this.nativeType === 'greenworks') {
          let unlocked = false;
          this.nativeClient.getAchievement(achId, (isAchieved) => {
            unlocked = Boolean(isAchieved);
          });
          return unlocked;
        }
      } catch (err) {
        console.warn(`[SteamAPI] Native check failed for ${achId}:`, err);
      }
    }

    return this._unlockedAchievements.has(achId);
  }

  /**
   * Get all registered achievements with their unlocked state.
   * @returns {Array<object>}
   */
  getAchievements() {
    return ACHIEVEMENTS.map(ach => ({
      ...ach,
      unlocked: this.isAchievementUnlocked(ach.id)
    }));
  }

  /**
   * Lock/clear an achievement (useful for testing and reset flows).
   * @param {string} achId
   * @returns {boolean}
   */
  clearAchievement(achId) {
    if (!achId) return false;

    if (!this.offline && this.nativeClient) {
      try {
        if (this.nativeType === 'steamworks.js') {
          this.nativeClient.achievement.clear(achId);
        } else if (this.nativeType === 'greenworks') {
          this.nativeClient.clearAchievement(achId);
        }
      } catch {}
    }

    this._unlockedAchievements.delete(achId);
    return true;
  }

  /**
   * Reset all achievements and stats.
   * @returns {boolean}
   */
  resetAllStats() {
    this._unlockedAchievements.clear();
    return true;
  }

  /**
   * Returns current initialization and player status.
   */
  getStatus() {
    return {
      initialized: this.initialized,
      success: this.initialized,
      steamId: this.steamId,
      personaName: this.personaName,
      offline: this.offline,
      appId: this.appId,
      unlockedCount: this._unlockedAchievements.size,
      totalCount: ACHIEVEMENTS.length
    };
  }

  /**
   * Attempts to require steamworks.js or greenworks safely.
   * @private
   */
  _tryLoadNative(appId) {
    try {
      const require = createRequire(import.meta.url);

      // Attempt steamworks.js
      try {
        const steamworks = require('steamworks.js');
        if (steamworks && typeof steamworks.init === 'function') {
          const client = steamworks.init(appId);
          if (client) {
            const steamId = client.localplayer?.getSteamId?.()?.steamId64?.toString() || MOCK_STEAM_ID;
            const personaName = client.localplayer?.getName?.() || MOCK_PERSONA_NAME;
            return { type: 'steamworks.js', client, steamId, personaName };
          }
        }
      } catch {}

      // Attempt greenworks
      try {
        const greenworks = require('greenworks');
        if (greenworks && typeof greenworks.init === 'function') {
          if (greenworks.init()) {
            const user = greenworks.getSteamId?.() || {};
            const steamId = user.steamId || user.screenName || MOCK_STEAM_ID;
            const personaName = user.screenName || MOCK_PERSONA_NAME;
            return { type: 'greenworks', client: greenworks, steamId, personaName };
          }
        }
      } catch {}
    } catch {}

    return null;
  }
}

// Default singleton instance
export const SteamAPI = new SteamworksBridge();
export default SteamAPI;
