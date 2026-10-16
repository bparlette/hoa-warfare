// Persistent Career Progression, HOA Ranks, 24K Gold Weapon Mastery, & Live Achievement Toasts.
// Demo caps rank progression at Rank 5 ("Neighborhood Watch") and gates 24K Gold Weapon Skins behind the $4.99 Full Game.

const STORAGE_KEY = 'hoa.career.v1';

export const HOA_RANKS = [
  { rank: 1,  title: 'Probationary Renter',         xp: 0,     demoAllowed: true },
  { rank: 2,  title: 'Lawn Measurer',               xp: 150,   demoAllowed: true },
  { rank: 3,  title: 'Cul-de-Sac Snitch',           xp: 400,   demoAllowed: true },
  { rank: 4,  title: 'Junior Block Captain',        xp: 800,   demoAllowed: true },
  { rank: 5,  title: 'Neighborhood Watch',          xp: 1300,  demoAllowed: true },
  { rank: 6,  title: 'Bylaw Enforcer',              xp: 2000,  demoAllowed: false },
  { rank: 7,  title: 'Zoning Commissioner',         xp: 3000,  demoAllowed: false },
  { rank: 8,  title: 'Covenant Prelate',            xp: 4500,  demoAllowed: false },
  { rank: 9,  title: 'Gated Community Warlord',     xp: 6500,  demoAllowed: false },
  { rank: 10, title: 'Supreme HOA Board President', xp: 10000, demoAllowed: false },
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
};

function defaultProfile() {
  return {
    xp: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
    meleeKills: 0,
    grenadeKills: 0,
    wins: 0,
    matches: 0,
    helicoptersDestroyed: 0,
    weaponKills: {},
    factionKills: {},
    achievements: {},
    goldSkinEnabled: false,
  };
}

export class CareerProfile {
  constructor({ isDemo = false, onAchievement = null } = {}) {
    this.isDemo = isDemo;
    this.onAchievement = onAchievement;
    this.data = this.load();
  }

  load() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { ...defaultProfile(), ...parsed, weaponKills: parsed.weaponKills || {}, factionKills: parsed.factionKills || {}, achievements: parsed.achievements || {} };
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

  getRankInfo() {
    const xp = this.data.xp || 0;
    let current = HOA_RANKS[0];
    let next = null;
    for (let i = 0; i < HOA_RANKS.length; i++) {
      const r = HOA_RANKS[i];
      if (this.isDemo && !r.demoAllowed) {
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
    const demoCapped = this.isDemo && current.rank >= 5 && xp >= 1300;
    return {
      rank: current.rank,
      title: current.title,
      xp,
      nextRank: next,
      demoCapped,
    };
  }

  addXp(amount) {
    this.data.xp = Math.max(0, (this.data.xp || 0) + amount);
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
    if (weaponId) this.data.weaponKills[weaponId] = (this.data.weaponKills[weaponId] || 0) + 1;
    if (faction) this.data.factionKills[faction] = (this.data.factionKills[faction] || 0) + 1;

    this.addXp(headshot ? 35 : 25);
    this.unlockAchievement('ACH_FIRST_FINE');
    if (melee) this.unlockAchievement('ACH_TROPHY_HUNTER');
    if (explosive) this.unlockAchievement('ACH_LAWSUIT');
    if (streak >= 5) this.unlockAchievement('ACH_STREAK_5');
    this.save();
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
