// Persistent Career Progression, HOA Ranks, 24K Gold Weapon Mastery, & Live Achievement Toasts.
// Demo caps rank progression at Rank 5 ("Neighborhood Watch") and gates 24K Gold Weapon Skins behind the $4.99 Full Game.

const STORAGE_KEY = 'hoa.career.v1';

// Hard cap on demo progression. Enforced here (not just in the UI) so a tampered
// localStorage profile or a flipped window.__HOA_DEMO__ can never surface ranks 6-10.
export const DEMO_MAX_RANK = 5;

export const HOA_RANKS = [
  { rank: 1,  title: 'Probationary Renter',         badge: '🌱', xp: 0,     demoAllowed: true },
  { rank: 2,  title: 'Lawn Measurer',               badge: '📏', xp: 150,   demoAllowed: true },
  { rank: 3,  title: 'Cul-de-Sac Snitch',           badge: '👁️', xp: 400,   demoAllowed: true },
  { rank: 4,  title: 'Junior Block Captain',        badge: '📋', xp: 800,   demoAllowed: true },
  { rank: 5,  title: 'Neighborhood Watch',          badge: '🛡️', xp: 1300,  demoAllowed: true },
  { rank: 6,  title: 'Bylaw Enforcer',              badge: '⚖️', xp: 2000,  demoAllowed: false },
  { rank: 7,  title: 'Zoning Commissioner',         badge: '🏛️', xp: 3000,  demoAllowed: false },
  { rank: 8,  title: 'Covenant Prelate',            badge: '📜', xp: 4500,  demoAllowed: false },
  { rank: 9,  title: 'Gated Community Warlord',     badge: '⚔️', xp: 6500,  demoAllowed: false },
  { rank: 10, title: 'Supreme HOA Board President', badge: '👑', xp: 10000, demoAllowed: false },
];

export const ACHIEVEMENTS = {
  ACH_FIRST_FINE:     { id: 'ACH_FIRST_FINE',     name: 'First Citation',         desc: 'Issue your first fine (kill) in the cul-de-sac.', icon: '📋' },
  ACH_LAWN_ORDER:     { id: 'ACH_LAWN_ORDER',     name: 'Lawn & Order',           desc: 'Win a match and secure the block.', icon: '🏆' },
  ACH_CASSEROLE_THIEF:{ id: 'ACH_CASSEROLE_THIEF',name: 'Casserole Bandit',       desc: 'Capture the enemy casserole in Steal the Casserole.', icon: '🥘' },
  ACH_HOA_PATROL:     { id: 'ACH_HOA_PATROL',     name: 'Neighborhood Watch',     desc: 'Capture a patrol zone in HOA Patrol.', icon: '🚩' },
  ACH_EVICTION:       { id: 'ACH_EVICTION',       name: 'Eviction Notice',        desc: 'Post or tear down an eviction notice.', icon: '📄' },
  ACH_HELO_DOWN:      { id: 'ACH_HELO_DOWN',      name: "Dad's Pride Grounded",   desc: "Shoot down Dad's RC Patrol Helicopter.", icon: '🚁' },
  ACH_STREAK_5:       { id: 'ACH_STREAK_5',       name: 'Overbearing HOA',        desc: "Earn a 5-killstreak and call in Dad's Helicopter.", icon: '⭐' },
  ACH_CAMP_SNITCH:    { id: 'ACH_CAMP_SNITCH',    name: 'Get Moving!',            desc: 'Trigger a loitering self-snitch citation.', icon: '🚨' },
  ACH_LAWSUIT:        { id: 'ACH_LAWSUIT',        name: 'See You in Court',       desc: 'Eliminate an opponent with a Lawsuit grenade.', icon: '⚖️' },
  ACH_TROPHY_HUNTER:  { id: 'ACH_TROPHY_HUNTER',  name: 'Everyone Gets a Trophy', desc: 'Eliminate an opponent with the Participation Trophy melee.', icon: '🥇' },
  ACH_FINE_FROM_ABOVE:{ id: 'ACH_FINE_FROM_ABOVE',name: 'Fine From Above',        desc: 'Call in the HOA drone gunship with a 9-killstreak.', icon: '🛸' },
  ACH_GOLD_STANDARD:  { id: 'ACH_GOLD_STANDARD',  name: 'Gold Standard',          desc: 'Earn 24K Gold camo on any weapon.', icon: '✨' },
  ACH_REZONED:        { id: 'ACH_REZONED',        name: 'Re-Zoned',               desc: 'Reach Supreme HOA Board President and Re-Zone (Prestige).', icon: '🏚️' },
};

// Per-weapon camo, earned with that weapon's kills and headshots. Gold needs the full game.
export const CAMO_TIERS = [
  { id: 'beige',   name: 'HOA-Approved Beige', kills: 25,  headshots: 0,  color: 0xd8c8a0 },
  { id: 'mulch',   name: 'Fresh Mulch',        kills: 60,  headshots: 10, color: 0x6b4a2b },
  { id: 'granite', name: 'Granite Countertop', kills: 120, headshots: 25, color: 0x9a9a9a },
  { id: 'gold',    name: '24K Gold',           kills: 200, headshots: 50, color: 0xffd700, fullGameOnly: true },
];
export const CAMO_XP = 250;
export const PRESTIGE_MAX = 10;

function defaultProfile() {
  return {
    xp: 0,
    rank: 1,
    kills: 0,
    deaths: 0,
    headshots: 0,
    meleeKills: 0,
    grenadeKills: 0,
    wins: 0,
    matches: 0,
    helicoptersDestroyed: 0,
    weaponKills: {},
    weaponHeadshots: {},
    camos: {},
    prestige: 0,
    factionKills: {},
    achievements: {},
    goldSkinEnabled: false,
  };
}

export class CareerProfile {
  constructor({ isDemo = false, maxRank = DEMO_MAX_RANK, onAchievement = null, onRankUp = null, onCamo = null } = {}) {
    this.isDemo = isDemo;
    this.maxRank = Math.max(1, Math.min(HOA_RANKS.length, maxRank));
    this.onAchievement = onAchievement;
    this.onRankUp = onRankUp;
    this.onCamo = onCamo;
    this.data = this.load();
    this.syncRank();
  }

  get profile() {
    return this.data;
  }

  load() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            ...defaultProfile(), ...parsed,
            weaponKills: parsed.weaponKills || {}, weaponHeadshots: parsed.weaponHeadshots || {}, camos: parsed.camos || {},
            factionKills: parsed.factionKills || {}, achievements: parsed.achievements || {},
          };
        }
      }
    } catch {}
    return defaultProfile();
  }

  save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      }
    } catch {}
  }

  syncRank() {
    const rInfo = this.getRankInfo();
    this.data.rank = rInfo.rank;
  }

  getRankInfo() {
    const xp = this.data.xp || 0;
    const cap = this.isDemo ? this.maxRank : HOA_RANKS.length;
    let current = HOA_RANKS[0];
    let next = null;
    for (let i = 0; i < HOA_RANKS.length; i++) {
      const r = HOA_RANKS[i];
      if (r.rank > cap || (this.isDemo && !r.demoAllowed)) {
        next = r;
        break;
      }
      if (xp >= r.xp) {
        current = r;
        next = HOA_RANKS[i + 1] || null;
      } else {
        next = r;
        break;
      }
    }
    const demoCapped = this.isDemo && current.rank >= cap && xp >= (HOA_RANKS[cap - 1]?.xp ?? 0);
    return {
      current,
      rank: current.rank,
      title: current.title,
      badge: current.badge,
      xp,
      nextRank: next,
      demoCapped,
      cappedInDemo: demoCapped,
    };
  }

  awardXp(amount) {
    return this.addXp(amount);
  }

  addXp(amount) {
    const oldRank = this.getRankInfo().current;
    this.data.xp = Math.max(0, (this.data.xp || 0) + amount);
    this.syncRank();
    const newRank = this.getRankInfo().current;
    if (newRank.rank > oldRank.rank && this.onRankUp) {
      this.onRankUp(newRank);
    }
    this.save();
  }

  unlockAchievement(achId) {
    const def = ACHIEVEMENTS[achId];
    if (!def || this.data.achievements[achId]) return false;
    this.data.achievements[achId] = Date.now();
    this.addXp(100);
    try {
      if (typeof window !== 'undefined' && window.SteamAPI?.unlockAchievement) {
        window.SteamAPI.unlockAchievement(achId);
      }
    } catch {}
    if (this.onAchievement) this.onAchievement(def);
    this.save();
    return true;
  }

  recordKill({ faction, weaponId, headshot = false, melee = false, explosive = false, streak = 1 } = {}) {
    this.data.kills = (this.data.kills || 0) + 1;
    if (headshot) this.data.headshots = (this.data.headshots || 0) + 1;
    if (melee) this.data.meleeKills = (this.data.meleeKills || 0) + 1;
    if (explosive) this.data.grenadeKills = (this.data.grenadeKills || 0) + 1;
    if (weaponId) {
      this.data.weaponKills[weaponId] = (this.data.weaponKills[weaponId] || 0) + 1;
      if (headshot) this.data.weaponHeadshots[weaponId] = (this.data.weaponHeadshots[weaponId] || 0) + 1;
      this.checkCamo(weaponId);
    }
    if (faction) this.data.factionKills[faction] = (this.data.factionKills[faction] || 0) + 1;

    this.addXp(headshot ? 35 : 25);
    this.unlockAchievement('ACH_FIRST_FINE');
    if (melee) this.unlockAchievement('ACH_TROPHY_HUNTER');
    if (explosive) this.unlockAchievement('ACH_LAWSUIT');
    if (streak >= 5) this.unlockAchievement('ACH_STREAK_5');
    this.save();
  }

  /** Camo tiers this build can earn: the demo stops below gold. */
  camoTiers() { return this.isDemo ? CAMO_TIERS.filter(t => !t.fullGameOnly) : CAMO_TIERS; }

  /** Highest camo earned on a weapon, or null. */
  camoFor(weaponId) {
    const id = this.data.camos[weaponId];
    return this.camoTiers().find(t => t.id === id) || null;
  }

  /** Progress toward the next camo on a weapon: { current, next, kills, headshots }. */
  camoProgress(weaponId) {
    const current = this.camoFor(weaponId);
    const tiers = this.camoTiers();
    const next = tiers[current ? tiers.indexOf(current) + 1 : 0] || null;
    return { current, next, kills: this.data.weaponKills[weaponId] || 0, headshots: this.data.weaponHeadshots[weaponId] || 0, lockedGold: this.isDemo };
  }

  checkCamo(weaponId) {
    const kills = this.data.weaponKills[weaponId] || 0, headshots = this.data.weaponHeadshots[weaponId] || 0;
    const tiers = this.camoTiers();
    let idx = tiers.indexOf(this.camoFor(weaponId));
    while (tiers[idx + 1] && kills >= tiers[idx + 1].kills && headshots >= tiers[idx + 1].headshots) {
      const tier = tiers[++idx];
      this.data.camos[weaponId] = tier.id;
      this.addXp(CAMO_XP);
      if (this.onCamo) this.onCamo(weaponId, tier);
      if (tier.id === 'gold') this.unlockAchievement('ACH_GOLD_STANDARD');
    }
  }

  /** Prestige ("Re-Zoning"): full game only, from the top rank. Camos and achievements stay. */
  canPrestige() {
    return !this.isDemo && this.getRankInfo().rank === HOA_RANKS.length && (this.data.prestige || 0) < PRESTIGE_MAX;
  }

  prestige() {
    if (!this.canPrestige()) return false;
    this.data.prestige = (this.data.prestige || 0) + 1;
    this.data.xp = 0;
    this.syncRank();
    this.unlockAchievement('ACH_REZONED');
    this.data.xp = 0;
    this.syncRank();
    this.save();
    return true;
  }

  recordDeath() {
    this.data.deaths = (this.data.deaths || 0) + 1;
    this.save();
  }

  recordMatchEnd({ won = false } = {}) {
    this.data.matches = (this.data.matches || 0) + 1;
    if (won) {
      this.data.wins = (this.data.wins || 0) + 1;
      this.addXp(120);
      this.unlockAchievement('ACH_LAWN_ORDER');
    } else {
      this.addXp(50);
    }
    this.save();
  }
}
