// Web demo -> Steam funnel: one place for the Steam link, its tracking tags, the CTA wording and the
// share link. Settings come from data/demo.json; no DOM access except wireSteamLinks().
//
//   portal     where this copy of the demo is running (itch | crazygames | newgrounds | github | local),
//              from ?portal= or the hostname; becomes utm_source on every Steam link
//   steamLink  Steam store URL with UTM tags, or the fallback page while there is no Steam app yet

const DEFAULTS = { steamUrl: null, fallbackUrl: 'https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare', shareUrl: 'https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare', priceLabel: '$4.99', ctaLockSec: 4 };

export function detectPortal(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return 'local';
  const forced = new URLSearchParams(loc.search || '').get('portal');
  if (forced) return forced.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'local';
  const h = (loc.hostname || '').toLowerCase();
  if (h.endsWith('itch.zone') || h.endsWith('itch.io')) return 'itch';
  if (h.includes('crazygames')) return 'crazygames';
  if (h.includes('newgrounds') || h.includes('ungrounded')) return 'newgrounds';
  if (h.endsWith('github.io')) return 'github';
  return 'local';
}

export class Funnel {
  constructor(config = {}, portal = detectPortal()) {
    this.cfg = { ...DEFAULTS, ...config };
    this.portal = portal;
  }

  get live() { return !!this.cfg.steamUrl; }

  /** Steam store link tagged with where the click came from; fallback page until the app exists. */
  steamLink(placement = 'button') {
    const base = this.cfg.steamUrl || this.cfg.fallbackUrl;
    try {
      const u = new URL(base);
      u.searchParams.set('utm_source', this.portal);
      u.searchParams.set('utm_medium', 'web_demo');
      u.searchParams.set('utm_campaign', placement);
      return u.toString();
    } catch { return base; }
  }

  ctaLabel(short = false) {
    if (!this.live) return short ? '★ Coming soon to Steam' : '★ COMING SOON TO STEAM';
    return short ? '★ Wishlist on Steam' : `★ WISHLIST ON STEAM (${this.cfg.priceLabel})`;
  }

  /** What the full game unlocks. Only promise things that exist or are committed for launch. */
  pitch(factionCount) {
    return `all ${factionCount} fully voiced factions, every weapon and mode`;
  }

  shareText({ kills = 0, deaths = 0, factionName = 'a Karen', won = false, modeLabel = '' } = {}) {
    const result = won ? 'secured the block' : 'got evicted';
    return `I ${result} going ${kills}-${deaths} as ${factionName}${modeLabel ? ` in ${modeLabel}` : ''} in Call of Karen: HOA Warfare 🏡💥 Can you do better? Play free: ${this.shareLink()}`;
  }

  shareLink() {
    try {
      const u = new URL(this.cfg.shareUrl);
      u.searchParams.set('ref', 'share');
      return u.toString();
    } catch { return this.cfg.shareUrl; }
  }

  /** Point every Steam button in `root` (marked with data-steam="<placement>") at the tagged link. */
  wireSteamLinks(root = typeof document !== 'undefined' ? document : null) {
    if (!root?.querySelectorAll) return 0;
    let n = 0;
    for (const a of root.querySelectorAll('a[data-steam]')) {
      a.href = this.steamLink(a.dataset.steam || 'button');
      a.target = '_blank';
      a.rel = 'noopener';
      if (!a.dataset.keepLabel) a.textContent = a.classList.contains('btn-wishlist-small') ? this.ctaLabel(true) : this.ctaLabel();
      n++;
    }
    return n;
  }
}
