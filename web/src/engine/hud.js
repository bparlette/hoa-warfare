// HUD, feed, killcam, scoreboard, and UI overlays for Call of Karen: HOA Warfare.

const KILLCAM_SEC = 3.2;
const KILLCAM_HOLD = 1.6;

export function wrapCanvasText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = String(text).split(' ');
  const lines = [];
  let currentLine = words[0] || '';
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx?.measureText ? ctx.measureText(currentLine + ' ' + word).width : (currentLine.length + word.length + 1) * 14;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function calculatePodium(actors) {
  if (!actors || !actors.length) {
    return { mvp: null, bottomFragger: null, worst: null };
  }
  const sortedMvp = [...actors].sort((a, b) => {
    const aKills = a.kills ?? a.score ?? 0;
    const bKills = b.kills ?? b.score ?? 0;
    const aDeaths = a.deaths ?? 0;
    const bDeaths = b.deaths ?? 0;
    return (bKills - aKills) || (aDeaths - bDeaths);
  });
  const sortedBottom = [...actors].sort((a, b) => {
    const aKills = a.kills ?? a.score ?? 0;
    const bKills = b.kills ?? b.score ?? 0;
    const aDeaths = a.deaths ?? 0;
    const bDeaths = b.deaths ?? 0;
    return (aKills - bKills) || (bDeaths - aDeaths);
  });
  const mvp = sortedMvp[0];
  const bottomFragger = sortedBottom[0];
  return { mvp, bottomFragger, worst: bottomFragger };
}

export const HOA_DEFAULT_VIOLATIONS = [
  { code: 'Code 4.12', desc: 'Uncut Kentucky Bluegrass (>2.5 inches)', fine: 150.00 },
  { code: 'Code 7.08', desc: 'Trash Can Left Out 14 Minutes Past Curbside Pickup', fine: 250.00 },
  { code: 'Code 9.01', desc: 'Weaponized Incompetence in Cul-de-Sac Clash', fine: 500.00 },
  { code: 'Code 12.3', desc: 'Unsanctioned Riding Lawn Mower Roadkill', fine: 1200.00 },
];

export function formatDoorbellTimestamp(time) {
  let hh = 14, mm = 22, ss = 31, ff = 18;
  if (time instanceof Date) {
    hh = time.getHours();
    mm = time.getMinutes();
    ss = time.getSeconds();
    ff = Math.floor((time.getMilliseconds() / 1000) * 30);
  } else if (typeof time === 'number' && time > 100000) {
    const d = new Date(time);
    hh = d.getHours();
    mm = d.getMinutes();
    ss = d.getSeconds();
    ff = Math.floor((d.getMilliseconds() / 1000) * 30);
  } else if (typeof time === 'number') {
    const totalSec = Math.floor(time);
    hh = Math.floor(totalSec / 3600) % 24;
    mm = Math.floor(totalSec / 60) % 60;
    ss = totalSec % 60;
    ff = Math.floor((time % 1) * 30);
  } else if (typeof Date !== 'undefined') {
    const d = new Date();
    hh = d.getHours();
    mm = d.getMinutes();
    ss = d.getSeconds();
    ff = Math.floor((d.getMilliseconds() / 1000) * 30);
  }
  const sH = String(hh).padStart(2, '0');
  const sM = String(mm).padStart(2, '0');
  const sS = String(ss).padStart(2, '0');
  const sF = String(ff).padStart(2, '0');
  return `${sH}:${sM}:${sS}:${sF}`;
}

export function exportHoaCitationCanvas(victim, killer, stats = {}, options = {}) {
  const canvas = (typeof document !== 'undefined' && document.createElement)
    ? document.createElement('canvas')
    : { width: 800, height: 1000 };
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return canvas;

  // Background: Official off-white / parchment legal document
  ctx.fillStyle = '#fcfbf7';
  ctx.fillRect?.(0, 0, 800, 1000);

  // Outer gold & navy border
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 6;
  ctx.strokeRect?.(20, 20, 760, 960);

  ctx.strokeStyle = '#1d2b53';
  ctx.lineWidth = 2;
  ctx.strokeRect?.(28, 28, 744, 944);

  // Corner rosettes
  ctx.fillStyle = '#d4af37';
  const corners = [[36, 36], [756, 36], [36, 956], [756, 956]];
  for (const [cx, cy] of corners) {
    ctx.beginPath?.();
    ctx.arc?.(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill?.();
  }

  // Gold HOA Seal
  ctx.save?.();
  ctx.strokeStyle = '#c59b27';
  ctx.fillStyle = '#fdf6e2';
  ctx.lineWidth = 3;
  ctx.beginPath?.();
  ctx.arc?.(400, 90, 42, 0, Math.PI * 2);
  ctx.fill?.();
  ctx.stroke?.();

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 1.5;
  ctx.beginPath?.();
  ctx.arc?.(400, 90, 36, 0, Math.PI * 2);
  ctx.stroke?.();

  ctx.fillStyle = '#c59b27';
  ctx.font = 'bold 18px serif';
  ctx.textAlign = 'center';
  ctx.fillText?.('★ ⌂ ★', 400, 94);
  ctx.restore?.();

  // Header Title
  ctx.fillStyle = '#1d2b53';
  ctx.font = 'bold 22px "Georgia", "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText?.('SHADY PINES CUL-DE-SAC HOA - OFFICIAL NOTICE OF VIOLATION', 400, 165);

  ctx.font = 'bold 12px monospace, sans-serif';
  ctx.fillStyle = '#7e2553';
  ctx.fillText?.('SUBDIVISION CODE ENFORCEMENT DIVISION · CUL-DE-SAC JURISDICTION', 400, 185);

  // Dividing Line
  ctx.strokeStyle = '#c2c3c7';
  ctx.lineWidth = 1;
  ctx.beginPath?.();
  ctx.moveTo?.(50, 200);
  ctx.lineTo?.(750, 200);
  ctx.stroke?.();

  // Case details block
  const caseNum = stats?.caseNumber || stats?.caseId || `HOA-2026-${Math.floor(100000 + (victim?.id ? String(victim.id).charCodeAt(0) * 1337 : 83719)) % 900000}`;
  const offenderName = victim?.name || stats?.offenderName || 'Offending Neighbor';
  const offenderFaction = options?.factions?.[victim?.faction]?.name || victim?.faction || stats?.faction || 'The Karens';
  const complainantName = killer?.name ? `${killer.name} (${options?.factions?.[killer.faction]?.name || killer.faction || 'HOA Enforcement'})` : 'Todd (HOA President)';
  const dateStr = stats?.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  // Details box background
  ctx.fillStyle = '#f4f0e6';
  ctx.fillRect?.(50, 215, 700, 110);
  ctx.strokeStyle = '#a28879';
  ctx.lineWidth = 1;
  ctx.strokeRect?.(50, 215, 700, 110);

  ctx.fillStyle = '#1d2b53';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText?.(`CASE NUMBER: ${caseNum}`, 65, 240);
  ctx.fillText?.(`DATE OF INFRACTION: ${dateStr}`, 450, 240);

  ctx.fillText?.(`OFFENDER: ${offenderName}`, 65, 270);
  ctx.fillText?.(`OFFENDING FACTION: ${offenderFaction}`, 450, 270);

  ctx.fillText?.(`REPORTING MEMBER: ${complainantName}`, 65, 300);
  ctx.fillText?.(`LOCATION: Front Lawn & Curbside`, 450, 300);

  // Itemized Bill Table Header
  ctx.fillStyle = '#1d2b53';
  ctx.fillRect?.(50, 345, 700, 32);

  ctx.fillStyle = '#fff1e8';
  ctx.font = 'bold 12px monospace';
  ctx.fillText?.('CODE', 65, 366);
  ctx.fillText?.('INFRACTION DESCRIPTION', 180, 366);
  ctx.textAlign = 'right';
  ctx.fillText?.('FINE AMOUNT', 735, 366);

  // Itemized violations
  const violations = stats?.violations || HOA_DEFAULT_VIOLATIONS;

  let y = 410;
  ctx.textAlign = 'left';
  violations.forEach((v, idx) => {
    if (idx % 2 === 1) {
      ctx.fillStyle = '#f8f6f0';
      ctx.fillRect?.(50, y - 24, 700, 38);
    }
    ctx.strokeStyle = '#e6e2d8';
    ctx.lineWidth = 1;
    ctx.beginPath?.();
    ctx.moveTo?.(50, y + 14);
    ctx.lineTo?.(750, y + 14);
    ctx.stroke?.();

    ctx.fillStyle = '#7e2553';
    ctx.font = 'bold 13px monospace';
    ctx.fillText?.(v.code, 65, y);

    ctx.fillStyle = '#291814';
    ctx.font = '13px "Arial", sans-serif';
    ctx.fillText?.(v.desc, 180, y);

    ctx.fillStyle = '#ff004d';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    const fineStr = `$${v.fine.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    ctx.fillText?.(fineStr, 735, y);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#83769c';
    ctx.font = '10px monospace';
    ctx.fillText?.(`${v.code}: ${v.desc}: ${fineStr}`, 180, y + 12);

    y += 44;
  });

  // Total summary box
  const totalFine = violations.reduce((s, v) => s + (v.fine || 0), 0);
  const totalFineStr = `$${totalFine.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  ctx.fillStyle = '#fff1e8';
  ctx.fillRect?.(50, y + 10, 700, 75);
  ctx.strokeStyle = '#ff004d';
  ctx.lineWidth = 2;
  ctx.strokeRect?.(50, y + 10, 700, 75);

  ctx.fillStyle = '#be1250';
  ctx.font = 'bold 18px "Arial Black", Impact, sans-serif';
  ctx.fillText?.(`Total Due Immediately: ${totalFineStr} (Late fee: $100/hour).`, 65, y + 42);

  ctx.fillStyle = '#7e2553';
  ctx.font = 'italic 12px serif';
  ctx.fillText?.('Failure to pay within 24 hours will result in immediate lawn foreclosure and HOA tribunal hearing.', 65, y + 68);

  // Legal / Satirical fine print
  const legalY = y + 115;
  ctx.fillStyle = '#5f574f';
  ctx.font = '10px monospace';
  ctx.fillText?.('PURSUANT TO SECTION 42-B OF THE SHADY PINES SUBDIVISION COVENANTS, CONDITIONS & RESTRICTIONS (CC&Rs):', 50, legalY);
  ctx.fillText?.('All residents agree to waive right to legal counsel in favor of HOA President judgment. Grass heights subject', 50, legalY + 16);
  ctx.fillText?.('to laser calibration. Weaponized lawn mowers and tactical garden hoses must remain parked inside garage by dusk.', 50, legalY + 30);

  // Signatures
  const sigY = legalY + 70;
  ctx.strokeStyle = '#1d2b53';
  ctx.lineWidth = 1.5;
  ctx.beginPath?.();
  ctx.moveTo?.(50, sigY + 35);
  ctx.lineTo?.(320, sigY + 35);
  ctx.moveTo?.(480, sigY + 35);
  ctx.lineTo?.(750, sigY + 35);
  ctx.stroke?.();

  ctx.fillStyle = '#1d2b53';
  ctx.font = 'bold 12px serif';
  ctx.fillText?.('Todd Henderson, HOA President & Lead Grass Inspector', 50, sigY + 52);
  ctx.fillText?.('Karen Bowman, Disciplinary Committee Chair', 480, sigY + 52);

  // Red rubber stamp: "FINAL NOTICE - EVICTION PENDING"
  ctx.save?.();
  ctx.translate?.(560, 680);
  ctx.rotate?.(-0.20);
  ctx.strokeStyle = '#ff004d';
  ctx.lineWidth = 5;
  ctx.strokeRect?.(-190, -35, 380, 70);
  ctx.strokeStyle = '#be1250';
  ctx.lineWidth = 1.5;
  ctx.strokeRect?.(-184, -29, 368, 58);

  ctx.fillStyle = '#ff004d';
  ctx.font = 'bold 22px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText?.('FINAL NOTICE - EVICTION PENDING', 0, 8);
  ctx.restore?.();

  // Bottom footer branding
  ctx.fillStyle = '#a28879';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText?.('CALL OF KAREN: HOA WARFARE · OFFICIAL CITATION NOTICE', 400, 975);

  return canvas;
}

function createFallbackElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      _classes: new Set(),
      add(...cs) { cs.forEach(c => this._classes.add(c)); },
      remove(...cs) { cs.forEach(c => this._classes.delete(c)); },
      contains(c) { return this._classes.has(c); },
      toggle(c, val) { if (val) this.add(c); else this.remove(c); },
    },
    children: [],
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    prepend(child) { child.parentNode = this; this.children.unshift(child); return child; },
    remove() {
      if (this.parentNode?.children) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
      }
    },
    querySelector(sel) {
      if (!sel) return null;
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        for (const c of this.children) {
          if (c.id === id) return c;
          const found = c.querySelector?.(sel);
          if (found) return found;
        }
        return null;
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        for (const c of this.children) {
          if (c.classList?.contains?.(cls)) return c;
          const found = c.querySelector?.(sel);
          if (found) return found;
        }
        return null;
      }
      return null;
    },
    querySelectorAll(sel) {
      const results = [];
      if (!sel) return results;
      const walk = (node) => {
        for (const c of node.children || []) {
          if (sel.startsWith('.') && c.classList?.contains?.(sel.slice(1))) results.push(c);
          walk(c);
        }
      };
      walk(this);
      return results;
    },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get firstChild() { return this.children[0] || null; },
    _textContent: '',
    get textContent() {
      if (this.children.length > 0) {
        return this.children.map(c => c.textContent).join(' ');
      }
      return this._textContent;
    },
    set textContent(v) {
      this._textContent = String(v);
    },
    innerHTML: '',
  };
}

export class Hud {
  constructor({ $, factions, weaponsData, perfOverlay, perfPosition = 'upper-right', quality } = {}) {
    this.$ = $ || (id => (typeof document !== 'undefined' ? document.getElementById(id) : null));
    this.factions = factions || {};
    this.weaponsData = weaponsData || { weapons: {} };
    this.bubbles = [];
    this.bannerT = null;
    this.killcam = null;
    this.isDoorbellCam = false;
    this._doorbellEl = null;
    this._hitmarkAnim = null;
    this.lastLoiterBeep = 0;

    const params = (typeof location !== 'undefined' && location?.search) ? new URLSearchParams(location.search) : null;
    this.perfOverlay = perfOverlay ?? (params ? params.get('perf') === '1' : false);
    this.perfPosition = perfPosition;
    this.quality = quality || (params ? params.get('quality') : null);

    this.perfMetrics = {
      fps: 0,
      frameTimeMs: 0,
      drawCalls: 0,
      activeActors: 0,
      totalActors: 0,
      qualityTier: 'high',
      isLowQuality: false,
      suggestions: [],
    };
    this._perfFrames = [];
    this._lastPerfTime = 0;
    this._lastRealTime = null;
    this._perfEl = null;
  }

  isLowQuality(state, renderer) {
    if (this.quality === 'low') return true;
    if (state?.quality === 'low') return true;
    if (renderer?.quality?.tier === 'low' || renderer?.quality === 'low') return true;
    if (typeof location !== 'undefined' && location?.search) {
      const q = new URLSearchParams(location.search).get('quality');
      if (q === 'low') return true;
    }
    return false;
  }

  applyQualityOptimizations(state, renderer) {
    const isLow = this.isLowQuality(state, renderer);
    if (isLow && renderer) {
      if (renderer.quality && typeof renderer.quality === 'object') {
        if (renderer.quality.shadow > 1024) {
          renderer.quality.shadow = 1024;
        }
        if (renderer.quality.maxSplats > 60) {
          renderer.quality.maxSplats = 60;
        }
      }
      if (renderer.sun?.shadow?.mapSize) {
        const targetShadow = renderer.quality?.shadow || 1024;
        if (renderer.sun.shadow.mapSize.x > targetShadow) {
          renderer.sun.shadow.mapSize.set(targetShadow, targetShadow);
        }
      }
    }
    return isLow;
  }

  setDoorbellCam(active, renderer) {
    this.isDoorbellCam = !!active;
    if (renderer) renderer.isDoorbellCam = !!active;
    this.updateDoorbellOverlay(!!active);
    return this.isDoorbellCam;
  }

  getDoorbellOverlayElement() {
    let el = this.$('doorbellOverlay') || this._doorbellEl;
    if (!el) {
      const isBrowser = typeof document !== 'undefined' && document.createElement;
      if (isBrowser) {
        el = document.createElement('div');
        el.id = 'doorbellOverlay';
        el.className = 'doorbell-cam-overlay hidden';
        const parent = this.$('hud') || (typeof document.body !== 'undefined' ? document.body : null);
        if (parent?.appendChild) parent.appendChild(el);
      } else {
        el = createFallbackElement('div');
        el.id = 'doorbellOverlay';
        el.className = 'doorbell-cam-overlay hidden';
      }
      this._doorbellEl = el;
    }
    if (el && !el._doorbellBuilt && (!el.children || el.children.length === 0)) {
      this._buildDoorbellOverlayHtml(el);
      el._doorbellBuilt = true;
    }
    return el;
  }

  _buildDoorbellOverlayHtml(el) {
    if (!el) return;
    const make = (tag, id, cls, text) => {
      let e = null;
      if (typeof document !== 'undefined' && document.createElement) {
        try { e = document.createElement(tag); } catch {}
      }
      if (!e || typeof e.appendChild !== 'function') {
        const fb = createFallbackElement(tag);
        if (e && typeof e === 'object') Object.assign(fb.style, e.style || {});
        e = fb;
      }
      if (!e.children) e.children = [];
      if (typeof e.appendChild !== 'function') {
        e.appendChild = function(child) { child.parentNode = this; this.children.push(child); return child; };
      }
      if (!e.classList || typeof e.classList.add !== 'function') {
        e.classList = {
          _classes: new Set(),
          add(...cs) { cs.forEach(c => this._classes.add(c)); },
          remove(...cs) { cs.forEach(c => this._classes.delete(c)); },
          contains(c) { return this._classes.has(c); },
          toggle(c, val) { if (val) this.add(c); else this.remove(c); },
        };
      }
      if (id) e.id = id;
      if (cls) {
        e.className = cls;
        cls.split(/\s+/).forEach(c => { if (c) e.classList.add(c); });
      }
      if (text !== null && text !== undefined) {
        e.textContent = text;
      }
      return e;
    };

    if (typeof el.appendChild !== 'function') {
      el.appendChild = function(child) { child.parentNode = this; if (!this.children) this.children = []; this.children.push(child); return child; };
    }
    if (!el.children) el.children = [];

    if (el.style) {
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '48';
      el.style.display = 'none';
    }

    // Subtle vignette / barrel distortion aesthetic overlay
    const vignette = make('div', 'doorbellVignette', 'doorbell-vignette');
    if (vignette.style) {
      vignette.style.position = 'absolute';
      vignette.style.inset = '0';
      vignette.style.pointerEvents = 'none';
      vignette.style.boxShadow = 'inset 0 0 130px rgba(0, 0, 0, 0.88), inset 0 0 50px rgba(0, 0, 0, 0.65)';
      vignette.style.background = 'radial-gradient(ellipse at center, transparent 48%, rgba(0, 15, 8, 0.12) 75%, rgba(0, 0, 0, 0.78) 100%)';
      vignette.style.border = '8px solid rgba(0, 0, 0, 0.45)';
      vignette.style.borderRadius = '28px / 18px';
    }
    el.appendChild(vignette);

    // Top Bar
    const topBar = make('div', 'doorbellTopBar', 'doorbell-top-bar');
    if (topBar.style) {
      topBar.style.position = 'absolute';
      topBar.style.top = '16px';
      topBar.style.left = '24px';
      topBar.style.right = '24px';
      topBar.style.display = 'flex';
      topBar.style.justifyContent = 'space-between';
      topBar.style.alignItems = 'center';
      topBar.style.fontFamily = 'monospace, "Courier New", sans-serif';
      topBar.style.fontSize = '14px';
      topBar.style.fontWeight = 'bold';
      topBar.style.letterSpacing = '1px';
      topBar.style.pointerEvents = 'none';
      topBar.style.zIndex = '2';
    }

    // Top left: REC ● [LIVE] with ticking timestamp
    const rec = make('div', 'doorbellRec', 'doorbell-rec');
    if (rec.style) {
      rec.style.color = '#00e436';
      rec.style.textShadow = '0 0 8px #00e436, 0 0 16px #ff004d';
      rec.style.display = 'flex';
      rec.style.alignItems = 'center';
      rec.style.gap = '8px';
    }
    const recTag = make('span', null, 'doorbell-rec-tag', 'REC');
    const recDot = make('span', null, 'doorbell-dot', '●');
    if (recDot.style) {
      recDot.style.color = '#ff004d';
      recDot.style.textShadow = '0 0 8px #ff004d';
    }
    const recLive = make('span', null, 'doorbell-live', '[LIVE]');
    const tsEl = make('span', 'doorbellTimestamp', 'doorbell-timestamp', formatDoorbellTimestamp());
    if (tsEl.style) {
      tsEl.style.color = '#fff1e8';
      tsEl.style.textShadow = '0 0 6px #000';
    }
    rec.appendChild(recTag);
    rec.appendChild(recDot);
    rec.appendChild(recLive);
    rec.appendChild(tsEl);
    topBar.appendChild(rec);

    // Top right: FRONT PORCH CAM #01 - 1080P HD · BATTERY 84%
    const info = make('div', 'doorbellCamInfo', 'doorbell-info', 'FRONT PORCH CAM #01 - 1080P HD · BATTERY 84%');
    if (info.style) {
      info.style.color = '#fff1e8';
      info.style.textShadow = '0 0 6px rgba(0, 0, 0, 0.9)';
    }
    topBar.appendChild(info);
    el.appendChild(topBar);

    // Center warning notification: ⚠️ MOTION DETECTED: UNAPPROVED NEIGHBOR ON PROPERTY
    const banner = make('div', 'doorbellMotionBanner', 'doorbell-motion-banner', '⚠️ MOTION DETECTED: UNAPPROVED NEIGHBOR ON PROPERTY');
    if (banner.style) {
      banner.style.position = 'absolute';
      banner.style.top = '22%';
      banner.style.left = '50%';
      banner.style.transform = 'translate(-50%, -50%)';
      banner.style.background = 'rgba(255, 0, 77, 0.88)';
      banner.style.color = '#fff1e8';
      banner.style.padding = '8px 22px';
      banner.style.border = '2px solid #ffec27';
      banner.style.borderRadius = '4px';
      banner.style.fontFamily = 'Impact, "Arial Black", sans-serif';
      banner.style.fontSize = '18px';
      banner.style.letterSpacing = '1px';
      banner.style.textAlign = 'center';
      banner.style.boxShadow = '0 0 20px rgba(255, 0, 77, 0.6), 4px 4px 0 #000';
      banner.style.pointerEvents = 'none';
      banner.style.zIndex = '2';
    }
    el.appendChild(banner);

    this._doorbellRec = rec;
    this._doorbellTs = tsEl;
    this._doorbellInfo = info;
    this._doorbellBanner = banner;
    el.textContent = `REC ● [LIVE] ${formatDoorbellTimestamp()} FRONT PORCH CAM #01 - 1080P HD · BATTERY 84% ⚠️ MOTION DETECTED: UNAPPROVED NEIGHBOR ON PROPERTY`;
  }

  updateDoorbellOverlay(active, time) {
    const el = this.getDoorbellOverlayElement();
    if (!el) return;
    if (!active) {
      if (el.style) el.style.display = 'none';
      el.classList?.add?.('hidden');
      return;
    }
    if (el.style) el.style.display = 'block';
    el.classList?.remove?.('hidden');

    const ts = formatDoorbellTimestamp(time);
    const tsEl = el.querySelector?.('#doorbellTimestamp') || this.$('doorbellTimestamp') || this._doorbellTs;
    if (tsEl) tsEl.textContent = ts;

    const recEl = el.querySelector?.('#doorbellRec') || this.$('doorbellRec') || this._doorbellRec;
    if (recEl) {
      recEl.textContent = `REC ● [LIVE] ${ts}`;
    }
    el.textContent = `REC ● [LIVE] ${ts} FRONT PORCH CAM #01 - 1080P HD · BATTERY 84% ⚠️ MOTION DETECTED: UNAPPROVED NEIGHBOR ON PROPERTY`;
  }

  _applySuburbanHudStyle(el) {
    if (!el || !el.style) return;
    const isRight = this.perfPosition === 'upper-right' || this.perfPosition === 'right';
    el.id = 'perfOverlay';
    el.className = 'hoa-perf-overlay suburban-hud';
    el.style.position = 'absolute';
    el.style.top = '12px';
    if (isRight) {
      el.style.right = '12px';
      el.style.left = '';
    } else {
      el.style.left = '12px';
      el.style.right = '';
    }
    el.style.zIndex = '100';
    el.style.fontFamily = 'ui-monospace, "SF Mono", "Courier New", monospace';
    el.style.fontSize = '11px';
    el.style.lineHeight = '1.35';
    el.style.background = 'rgba(17, 29, 53, 0.88)';
    el.style.color = '#00e436';
    el.style.border = '2px solid rgba(255, 241, 232, 0.8)';
    el.style.borderRadius = '4px';
    el.style.padding = '6px 10px';
    el.style.pointerEvents = 'none';
    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.6)';
    el.style.whiteSpace = 'pre';
  }

  getPerfOverlayElement() {
    let el = this.$('perfOverlay') || this.$('perfHud') || this._perfEl;
    if (!el) {
      if (typeof document !== 'undefined' && document.createElement) {
        el = document.createElement('div');
        const parent = this.$('hud') || (typeof document.body !== 'undefined' ? document.body : null);
        if (parent?.appendChild) parent.appendChild(el);
      } else {
        el = createFallbackElement('div');
      }
    }
    this._perfEl = el;
    if (el && !el._suburbanStyled) {
      this._applySuburbanHudStyle(el);
      el._suburbanStyled = true;
    }
    return el;
  }

  setPerfPosition(pos) {
    this.perfPosition = pos;
    const el = this.getPerfOverlayElement();
    if (el && el.style) {
      const isRight = pos === 'upper-right' || pos === 'right';
      el.style.right = isRight ? '12px' : '';
      el.style.left = isRight ? '' : '12px';
    }
  }

  updatePerfOverlay({ sim, renderer, state, realTime }) {
    const isLow = this.applyQualityOptimizations(state, renderer);
    const el = this.getPerfOverlayElement();
    if (!el) return;
    if (el.style) el.style.display = '';

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let dtMs = 16.6;
    if (this._lastRealTime != null && realTime != null && realTime > this._lastRealTime) {
      dtMs = Math.max(0.1, Math.min(200, (realTime - this._lastRealTime) * 1000));
    } else if (this._lastPerfTime > 0) {
      dtMs = Math.max(0.1, Math.min(200, now - this._lastPerfTime));
    }
    this._lastPerfTime = now;
    if (realTime != null) this._lastRealTime = realTime;

    this._perfFrames.push(dtMs);
    if (this._perfFrames.length > 60) this._perfFrames.shift();

    const avgMs = this._perfFrames.reduce((a, b) => a + b, 0) / this._perfFrames.length;
    const fps = avgMs > 0 ? 1000 / avgMs : 60;
    const drawCalls = renderer?.gl?.info?.render?.calls ?? renderer?.drawCalls ?? renderer?.info?.calls ?? 0;
    const activeActors = sim?.actors ? sim.actors.filter(a => a.alive).length : 0;
    const totalActors = sim?.actors ? sim.actors.length : 0;

    const suggestions = [];
    if (isLow) {
      suggestions.push('Low quality active: shadows capped to 1024, overlays limited');
    }
    if (fps < 30) {
      suggestions.push('FPS < 30: switch to 16-bit retro or lower resolution');
    }
    if (drawCalls > 120) {
      suggestions.push('Draw calls > 120: optimize static meshes');
    }

    this.perfMetrics = {
      fps,
      frameTimeMs: avgMs,
      drawCalls,
      activeActors,
      totalActors,
      qualityTier: isLow ? 'low' : 'high',
      isLowQuality: isLow,
      suggestions,
    };

    if (el.style) {
      el.style.color = fps >= 50 ? '#00e436' : fps >= 30 ? '#ffec27' : '#ff004d';
    }

    const suggestionText = suggestions.length ? `\nSUGGEST: ${suggestions[0]}` : '';
    const text =
      `HOA PERF MONITOR\n` +
      `FPS: ${fps.toFixed(0)}  (${avgMs.toFixed(1)} ms)\n` +
      `DRAWS: ${drawCalls} calls\n` +
      `ACTORS: ${activeActors} active / ${totalActors}\n` +
      `QUALITY: ${isLow ? 'LOW' : 'HIGH'}` +
      suggestionText;

    el.textContent = text;
  }

  getPerfStats() {
    return { ...this.perfMetrics };
  }

  /** Fine From Above gunship HUD: bracket reticle, battery countdown, and shell-ready light. */
  updateDroneOverlay(sim, me) {
    const on = !!(me?.alive && me.drone);
    if (!on && !this.droneEl) return;
    if (!this.droneEl) {
      const el = document.createElement('div');
      el.id = 'droneHud';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;font:bold 16px "Courier New",monospace;color:#fff;text-shadow:0 0 4px #000;display:none';
      el.innerHTML = '<div style="position:absolute;left:50%;top:50%;width:120px;height:120px;transform:translate(-50%,-50%);border:3px solid #fff;border-width:3px 0;opacity:.85"></div>'
        + '<div style="position:absolute;left:50%;top:50%;width:120px;height:120px;transform:translate(-50%,-50%);border:3px solid #fff;border-width:0 3px;clip-path:polygon(0 0,18% 0,18% 100%,0 100%,0 0,100% 0,100% 100%,82% 100%,82% 0);opacity:.85"></div>'
        + '<div style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;background:#fff"></div>'
        + '<div data-k="top" style="position:absolute;left:24px;top:160px;line-height:1.5"></div>'
        + '<div data-k="ready" style="position:absolute;left:50%;top:calc(50% + 80px);transform:translateX(-50%)"></div>';
      document.body.appendChild(el);
      this.droneEl = el;
    }
    this.droneEl.style.display = on ? 'block' : 'none';
    if (!on) return;
    const d = me.drone, left = Math.max(0, d.until - sim.time);
    this.droneEl.querySelector('[data-k="top"]').innerHTML = `FINE FROM ABOVE<br>HOA DRONE · WHITE-HOT<br>BATTERY ${left.toFixed(0).padStart(2, '0')}s`;
    this.droneEl.querySelector('[data-k="ready"]').textContent = sim.time >= d.nextShot ? '[ FINE READY ]' : '[ RELOADING ]';
  }

  showBanner(text, small = '') {
    const $ = this.$;
    const el = $('banner');
    if (!el) return;
    el.innerHTML = `${text}${small ? `<small>${small}</small>` : ''}`;
    el.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => el.classList.remove('on'), 1800);
  }

  hitmark(word, isHeadshot = false) {
    const h = this.$('hitmark');
    if (!h) return;
    const isHead = isHeadshot || word === '★' || word === 'BONK!';
    h.textContent = isHead ? '★' : '✕';
    h.style.color = isHead ? '#ffd700' : '#ff004d';
    h.style.textShadow = isHead
      ? '0 0 10px #ffec27, 2px 2px 0 #000, -2px -2px 0 #000'
      : '0 0 8px #ff004d, 2px 2px 0 #000, -2px -2px 0 #000';
    h.style.webkitTextStroke = '1.5px #000';
    h.style.fontSize = isHead ? '34px' : '28px';
    h.style.fontFamily = 'Impact, "Arial Black", sans-serif';
    h.style.fontWeight = '900';
    h.style.position = 'absolute';
    h.style.left = '50%';
    h.style.top = '50%';
    h.style.pointerEvents = 'none';
    h.style.zIndex = '50';
    h.style.letterSpacing = '0';
    h.style.animation = 'none';
    h.classList.add('on');
    if (h.animate) {
      if (this._hitmarkAnim) this._hitmarkAnim.cancel();
      this._hitmarkAnim = h.animate([
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1.45)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0.95, offset: 0.55 },
        { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 0 }
      ], {
        duration: 220,
        fill: 'forwards',
        easing: 'cubic-bezier(0.12, 0.9, 0.25, 1)'
      });
    }
  }

  flashVignette() {
    const v = this.$('vignette');
    if (!v) return;
    v.style.transition = 'none';
    v.style.opacity = 0.7;
    void v.offsetWidth;
    v.style.transition = 'opacity .5s';
    v.style.opacity = 0;
  }

  flashDamage(relAngle = 0) {
    this.flashVignette();
    const ind = this.$('dmgIndicator');
    if (!ind || !ind.style) return;
    ind.style.transition = 'none';
    ind.style.transform = `translate(-50%, -50%) rotate(${relAngle}rad)`;
    ind.style.opacity = '1';
    void ind.offsetWidth;
    ind.style.transition = 'opacity 0.45s cubic-bezier(0.1, 0.9, 0.2, 1)';
    ind.style.opacity = '0';
  }

  addFeed(k, sim, me) {
    const $ = this.$;
    const feed = $('feed');
    if (!feed) return;
    const isLow = this.quality === 'low';
    const cls = a => (a === me ? 'me' : a.team === me.team ? 'ally' : 'enemy');
    const v = sim.byId.get(k.victimId), kr = k.killerId ? sim.byId.get(k.killerId) : null;
    const tags = [
      k.firstBlood && 'FIRST BLOOD',
      k.headshot && 'HEADSHOT',
      k.melee && 'TROPHY',
      k.explosive && 'LAWSUIT',
      k.revenge && 'REVENGE',
      k.shutdown && 'SHUTDOWN',
      k.rapid >= 4 ? 'RAMPAGE' : k.rapid === 3 ? 'TRIPLE' : k.rapid === 2 ? 'DOUBLE' : null,
    ].filter(Boolean);
    const el = typeof document !== 'undefined' && document.createElement
      ? document.createElement('div')
      : createFallbackElement('div');
    el.className = 'k';
    const icon = this.weaponsData.weapons[k.weaponId]?.feedIcon || '🔫';
    el.innerHTML = kr
      ? `<span class="${cls(kr)}">${kr.name}</span> ${icon} <span class="${cls(v)}">${v.name}</span>${tags.length ? `<span class="tagx">${tags.join(' · ')}</span>` : ''}`
      : `<span class="${cls(v)}">${v.name}</span> played themselves`;
    feed.prepend(el);
    while (feed.children.length > (isLow ? 3 : 6)) feed.lastChild.remove();
    setTimeout(() => el.remove(), isLow ? 3500 : 6000);
  }

  addSub(b, channel) {
    const $ = this.$;
    const subs = $('subs');
    if (!subs) return;
    const isLow = this.quality === 'low';
    const el = typeof document !== 'undefined' && document.createElement
      ? document.createElement('div')
      : createFallbackElement('div');
    el.className = 's';
    const f = this.factions[b.faction]?.name || '';
    const col = this.factions[b.faction]?.look.accent || '#fff';
    el.innerHTML = `<b style="color:${col}">${b.name}</b> (${f}): ${b.text}<i>${b.lineId}${channel && channel !== 'world' ? ' · ' + channel : ''}</i>`;
    subs.appendChild(el);
    while (subs.children.length > (isLow ? 2 : 4)) subs.firstChild.remove();
    setTimeout(() => el.remove(), isLow ? 3000 : 4500);
  }

  addBubble(speaker, b, me, realTime) {
    const $ = this.$;
    const isLow = this.quality === 'low';
    const maxBubbles = isLow ? 2 : 6;
    while (this.bubbles.length >= maxBubbles) {
      const old = this.bubbles.shift();
      old?.el?.remove?.();
    }
    const old = this.bubbles.find(x => x.id === speaker.id);
    if (old) { old.el?.remove?.(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = typeof document !== 'undefined' && document.createElement
      ? document.createElement('div')
      : createFallbackElement('div');
    el.className = `bubble ${speaker.team === me.team ? 'ally' : 'enemy'}${b.priority >= 6 ? ' hot' : ''}`;
    el.innerHTML = `<b>${speaker.name}</b>${b.text}`;
    $('bubbles').appendChild(el);
    this.bubbles.push({ id: speaker.id, el, until: realTime + Math.max(1.8, b.duration + 0.8), pos: b.position, alive: speaker.alive });
  }

  startKillcam(kc, killEv, sim, renderer, frames, voice) {
    const $ = this.$;
    const deathT = sim.time;
    this.killcam = {
      ...kc, deathT, t: 0,
      frames: frames.filter(f => f.t >= deathT - KILLCAM_SEC && f.t <= deathT),
      killEv, spoke: false, shotIdx: 0,
    };
    if (kc.selfKill || !this.killcam.frames.length) {
      this.killcam = null;
      this.isDoorbellCam = false;
      if (renderer) renderer.isDoorbellCam = false;
      this.updateDoorbellOverlay(false);
      this.showBanner('YOU PLAYED YOURSELF', kc.line?.text || '');
      if (kc.line) voice.say({ text: kc.line.text, lineId: kc.line.id, faction: sim.actors.find(a => a.id === kc.victimId)?.faction, priority: 9, force: true });
      return;
    }
    if (renderer) renderer.isDoorbellCam = true;
    this.isDoorbellCam = true;
    this.updateDoorbellOverlay(true, deathT);

    for (const c of renderer.characters.values()) c.root.visible = false;
    const killer = sim.byId.get(kc.killerId);
    const victim = sim.byId.get(kc.victimId);
    $('killcam').classList.remove('hidden');
    $('kcWho').textContent = `${killer.name} · ${this.factions[killer.faction]?.name || killer.faction}${kc.headshot ? ' · HEADSHOT' : kc.melee ? ' · PARTICIPATION TROPHY' : ''}`;
    $('kcLine').textContent = '';

    let btnCitation = this.$('killcam')?.querySelector?.('#btnExportCitation') || $('btnExportCitation') || $('btnExportCitationKc');
    if (!btnCitation && $('killcam')) {
      const kcEl = $('killcam');
      const isBrowser = typeof document !== 'undefined' && document.createElement;
      btnCitation = isBrowser ? document.createElement('button') : createFallbackElement('button');
      btnCitation.id = 'btnExportCitation';
      btnCitation.className = 'btn-share btn-citation-kc';
      btnCitation.type = 'button';
      btnCitation.textContent = '📜 HOA CITATION';
      if (btnCitation.style) {
        btnCitation.style.position = 'absolute';
        btnCitation.style.top = '16px';
        btnCitation.style.right = '200px';
        btnCitation.style.zIndex = '50';
      }
      kcEl.appendChild(btnCitation);
    }
    if (btnCitation) {
      btnCitation.onclick = async (e) => {
        e?.stopPropagation?.();
        btnCitation.textContent = '⏳ ISSUING CITATION...';
        try {
          await this.shareCitation({ victim, killer, stats: { killEv } });
          btnCitation.textContent = '✓ CITATION SAVED!';
        } catch {
          btnCitation.textContent = '📜 HOA CITATION';
        }
        setTimeout(() => { if (btnCitation) btnCitation.textContent = '📜 HOA CITATION'; }, 2500);
      };
    }
  }

  updateKillcam(dt, sim, renderer, voice) {
    const $ = this.$;
    const kc = this.killcam;
    if (!kc) return;
    this.updateDoorbellOverlay(true, sim?.time);
    kc.t += dt;
    const pt = Math.min(kc.deathT, kc.deathT - KILLCAM_SEC + kc.t);
    let frame = kc.frames[0];
    for (const f of kc.frames) { if (f.t <= pt) frame = f; else break; }
    renderer.applySnapshot(frame.snap, dt, {});
    while (kc.shotIdx < kc.frames.length && kc.frames[kc.shotIdx].t <= pt) {
      for (const s of kc.frames[kc.shotIdx].shots) {
        const col = this.factions[sim.byId.get(s.id).faction].look.accent;
        renderer.tracer(s.from, s.to, col);
        renderer.impact(s.to, col);
      }
      kc.shotIdx++;
    }
    const ks = frame.snap.find(s => s.id === kc.killerId), vs = frame.snap.find(s => s.id === kc.victimId);
    if (ks && vs) renderer.chase(ks, vs.alive ? vs : kc.killEv?.victimPos || vs);
    if (kc.t >= KILLCAM_SEC && !kc.spoke) {
      kc.spoke = true;
      if (kc.killEv) renderer.spawnRagdoll(kc.victimId, kc.killEv);
      if (kc.line) {
        $('kcLine').textContent = `"${kc.line.text}"`;
        voice.say({ text: kc.line.text, lineId: kc.line.id, faction: sim.byId.get(kc.killerId).faction, priority: 10, force: true });
        this.addSub({ text: kc.line.text, lineId: kc.line.id, name: sim.byId.get(kc.killerId).name, faction: sim.byId.get(kc.killerId).faction }, 'killcam');
      }
    }
    if (kc.t >= KILLCAM_SEC + KILLCAM_HOLD) {
      this.killcam = null;
      $('killcam').classList.add('hidden');
      this.isDoorbellCam = false;
      if (renderer) renderer.isDoorbellCam = false;
      this.updateDoorbellOverlay(false);
    }
  }

  update007Meters(hp, maxHp = 100, armor = 100, maxArmor = 100) {
    const $ = this.$;
    const hpMeter = $('geHpMeter');
    const armorMeter = $('geArmorMeter');
    if (!hpMeter || !armorMeter) return;
    const hpCount = Math.max(0, Math.min(10, Math.ceil((hp / maxHp) * 10)));
    const armorCount = Math.max(0, Math.min(10, Math.ceil((armor / maxArmor) * 10)));
    for (let i = 0; i < 10; i++) {
      if (hpMeter.children[i]) hpMeter.children[i].classList.toggle('on', i < hpCount);
      if (armorMeter.children[i]) armorMeter.children[i].classList.toggle('on', i < armorCount);
    }
  }

  showRespawn(me, sim) {
    const t = Math.max(0, me.respawnAt - sim.time);
    if (t > 0 && !this.$('banner').classList.contains('on')) {
      this.showBanner('EVICTED', `Respawning in ${t.toFixed(1)}s`);
    }
  }

  renderBoard(el, sim, me) {
    const rows = [...sim.actors].sort((a, b) => a.team - b.team || b.kills - a.kills);
    el.innerHTML = `<table><tr><th>Player</th><th>Faction</th><th>K</th><th>D</th></tr>${rows.map(a =>
      `<tr class="t${a.team}${a === me ? ' me' : ''}"><td>${a.name}</td><td>${this.factions[a.faction]?.name || a.faction}</td><td>${a.kills}</td><td>${a.deaths}</td></tr>`).join('')}</table>`;
  }

  showEnd({ sim, me, library, rng, onAgain, onMenu, voice, isDemo, funnel = null, againLabel = 'RUN IT BACK' }) {
    const $ = this.$;
    if (typeof document !== 'undefined') document.exitPointerLock?.();
    const { mvp, bottomFragger } = this.calculatePodium(sim.actors);
    const worst = bottomFragger;
    const mvpLines = library.getLines(mvp.faction, 'rampage');
    const mvpLine = mvpLines.length ? mvpLines[Math.floor(rng() * mvpLines.length)].text : '';
    const won = sim.winner === me.team, draw = sim.winner === null;
    const isDemoMode = isDemo ?? (typeof window !== 'undefined' && (window.__HOA_DEMO__ === true || new URLSearchParams(window.location?.search || '').get('demo') === '1'));
    const demoCard = isDemoMode && (funnel ? funnel.endCard : true) ? `
      <div class="demo-end-card">
        <h3>THANKS FOR PLAYING THE CALL OF KAREN WEB DEMO!</h3>
        <p>The full game unlocks ${funnel ? funnel.pitch(Object.keys(this.factions).length) : 'every faction, weapon and mode'}.</p>
        <a data-steam="end_card" href="#" onclick="return false" class="btn-wishlist btn-wishlist-glow">★ WISHLIST ON STEAM ($4.99)</a>
      </div>` : '';
    $('endPanel').innerHTML = `<h1>${draw ? 'DRAW' : won ? 'BLOCK SECURED' : 'EVICTED'}<small>${sim.score[0]} - ${sim.score[1]}</small></h1>
      ${demoCard}
      <div class="podium">
        <div class="mvp podium-card podium-mower">
          <div class="podium-badge mvp-badge">👑 MATCH MVP</div>
          <div class="podium-name"><b>${mvp.name}</b></div>
          <div class="podium-faction">${this.factions[mvp.faction]?.name || mvp.faction} · ${mvp.kills}-${mvp.deaths}</div>
          <div class="mower-crowned">🚜 Crowned on the Golden Riding Mower (${mvp.kills} Kills)</div>
          <q>${mvpLine}</q>
        </div>
        <div class="shame stockades podium-card podium-stockades">
          <div class="podium-badge shame-badge">⛓️ SUBURBAN STOCKADES / SHAME PILLORY</div>
          <div class="shame-stamp">VIOLATION: WEAPONIZED INCOMPETENCE</div>
          <div class="podium-name"><b>${worst.name}</b></div>
          <div class="podium-faction">${this.factions[worst.faction]?.name || worst.faction}</div>
          <div class="shame-stats">${worst.kills} KILLS · ${worst.deaths} DEATHS</div>
          <div class="shame-notice">FORMAL HOA EVICTION NOTICE ISSUED TO BOTTOM FRAGGER</div>
          <q>${worst.name} went ${worst.kills}-and-${worst.deaths}. Participation trophy's in the mail.</q>
        </div>
      </div>
      <div id="endBoard" style="margin-top:12px"></div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:16px">
        <button id="again" style="margin-top:0">${againLabel}</button>
        <button id="endMenu" style="margin-top:0">MENU</button>
        <button id="btnShareScore" class="btn-share" style="margin-top:0">📋 SHARE SCORE</button>
        <button id="btnShareCard" class="btn-share" style="margin-top:0">📸 SAVE / SHARE CARD</button>
        <button id="btnSaveClip" class="btn-share" style="margin-top:0">🎥 SAVE CLIP</button>
        <button id="btnExportCitation" class="btn-share" style="margin-top:0">📜 HOA CITATION</button>
        ${!isDemoMode ? '<a data-steam="end_row" href="#" onclick="return false" class="btn-wishlist" style="margin-top:0">★ WISHLIST ON STEAM ($4.99)</a>' : ''}
      </div>`;
    this.renderBoard($('endBoard'), sim, me);
    $('end').classList.remove('hidden');
    funnel?.wireSteamLinks($('endPanel'));
    $('again').onclick = () => onAgain();
    $('endMenu').onclick = () => onMenu();
    // Demo: the Steam card is unskippable for a few seconds before RUN IT BACK / MENU unlock.
    const lock = isDemoMode && (funnel ? funnel.endCard : true) ? (funnel?.cfg.ctaLockSec ?? 4) : 0;
    if (lock > 0) {
      const again = $('again'), menu = $('endMenu');
      const labels = [again.textContent, menu.textContent];
      let left = lock;
      const tick = () => {
        again.disabled = menu.disabled = left > 0;
        again.textContent = left > 0 ? `${labels[0]} (${left})` : labels[0];
        if (left-- > 0) this.endLockTimer = setTimeout(tick, 1000);
      };
      clearTimeout(this.endLockTimer);
      tick();
    }
    const btnShare = $('btnShareScore');
    if (btnShare) {
      btnShare.onclick = async () => {
        const factionName = this.factions[me?.faction]?.name || 'a Karen';
        const text = funnel
          ? funnel.shareText({ kills: me?.kills || 0, deaths: me?.deaths || 0, factionName, won: sim.winner === me?.team, modeLabel: sim.mode?.constructor?.label })
          : `I went ${me?.kills || 0}-${me?.deaths || 0} as ${factionName} in Call of Karen: HOA Warfare! Play free: https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare`;
        const url = funnel ? funnel.shareLink() : 'https://homebrewgametrailers.itch.io/call-of-karen-hoa-warfare';
        const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
        // phones: the share sheet (TikTok, Messages, X) is the viral path; desktop: clipboard
        if (touch && typeof navigator !== 'undefined' && navigator.share) {
          try { await navigator.share({ title: 'Call of Karen: HOA Warfare', text, url }); return; } catch {}
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            btnShare.textContent = '✓ COPIED!';
            setTimeout(() => { if (btnShare) btnShare.textContent = '📋 SHARE SCORE'; }, 2200);
            return;
          } catch {}
        }
        if (typeof window !== 'undefined' && window.prompt) window.prompt('Copy your score to share:', text);
      };
    }
    const btnShareCard = $('btnShareCard');
    if (btnShareCard) {
      btnShareCard.onclick = async () => {
        btnShareCard.textContent = '⏳ GENERATING...';
        try {
          await this.shareScoreCard({ sim, me, won, draw, mvpLine, funnel });
          btnShareCard.textContent = '✓ CARD SAVED!';
        } catch {
          btnShareCard.textContent = '📸 SAVE / SHARE CARD';
        }
        setTimeout(() => { if (btnShareCard) btnShareCard.textContent = '📸 SAVE / SHARE CARD'; }, 2500);
      };
    }
    const btnSaveClip = $('btnSaveClip');
    if (btnSaveClip) {
      btnSaveClip.onclick = async () => {
        btnSaveClip.textContent = '⏳ EXPORTING CLIP...';
        const ok = await this.exportHighlightClip({ sim, me, won, draw, mvpLine, funnel });
        btnSaveClip.textContent = ok ? '✓ CLIP SAVED!' : '✓ SCORECARD SAVED!';
        setTimeout(() => { if (btnSaveClip) btnSaveClip.textContent = '🎥 SAVE CLIP'; }, 2500);
      };
    }
    const btnShareCitation = this.$('endPanel')?.querySelector?.('#btnExportCitation') || $('btnExportCitation');
    if (btnShareCitation) {
      btnShareCitation.onclick = async () => {
        btnShareCitation.textContent = '⏳ ISSUING CITATION...';
        try {
          await this.shareCitation({
            victim: bottomFragger || me,
            killer: mvp || me,
            stats: { score: me?.kills, deaths: me?.deaths, won, draw }
          });
          btnShareCitation.textContent = '✓ CITATION SAVED!';
        } catch {
          btnShareCitation.textContent = '📜 HOA CITATION';
        }
        setTimeout(() => { if (btnShareCitation) btnShareCitation.textContent = '📜 HOA CITATION'; }, 2500);
      };
    }
    voice.say({ text: `MVP: ${mvp.name}. ${mvpLine}`, priority: 9, force: true, announcer: true });
  }

  startClipRecorder(canvas) {
    try {
      if (!canvas?.captureStream || typeof MediaRecorder === 'undefined') return;
      this.stopClipRecorder();
      this._clipChunks = [];
      const stream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported?.('video/webm')
          ? 'video/webm'
          : '';
      this._recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      this._recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this._clipChunks.push(e.data);
          if (this._clipChunks.length > 8) this._clipChunks.shift();
        }
      };
      this._recorder.start(1000);
    } catch {}
  }

  stopClipRecorder() {
    try {
      if (this._recorder && this._recorder.state !== 'inactive') {
        this._recorder.stop();
      }
    } catch {}
    this._recorder = null;
  }

  async exportHighlightClip({ sim, me, won, draw, mvpLine, funnel }) {
    this.stopClipRecorder();
    if (this._clipChunks && this._clipChunks.length > 0 && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      try {
        const blob = new Blob(this._clipChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hoa-warfare-highlight-${me?.faction || 'clip'}.webm`;
        a.click?.();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return true;
      } catch {}
    }
    await this.shareScoreCard({ sim, me, won, draw, mvpLine, funnel });
    return false;
  }

  showAchievementToast(ach) {
    if (!ach) return;
    this.showBanner(`${ach.icon || '🏆'} ACHIEVEMENT: ${ach.name.toUpperCase()}`, ach.desc || '');
    this.popScore(`+100 XP · ${ach.name.toUpperCase()}`, true);
  }

  async renderScoreCardCanvas({ sim, me, won, draw, mvpLine }) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return canvas;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 800, 450);
    grad.addColorStop(0, '#0b1222');
    grad.addColorStop(1, '#162647');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 450);

    // Double HOA citation border
    ctx.strokeStyle = '#ffec27';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 776, 426);
    ctx.strokeStyle = 'rgba(255, 236, 39, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(20, 20, 760, 410);

    // Top header bar
    ctx.fillStyle = '#ffec27';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('CALL OF KAREN: HOA WARFARE  ·  OFFICIAL SUBURBAN CITATION', 36, 50);

    // Portrait frame on left
    ctx.fillStyle = '#0e172c';
    ctx.fillRect(36, 70, 230, 310);
    ctx.strokeStyle = '#ffec27';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 70, 230, 310);

    const factionKey = me?.faction || 'karens';
    const factionObj = this.factions?.[factionKey] || { name: 'The Karens', tagline: 'I want to speak to the board.' };
    if (typeof Image !== 'undefined') {
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try { ctx.drawImage(img, 42, 76, 218, 298); } catch {}
          resolve();
        };
        img.onerror = () => resolve();
        img.src = `assets/characters/${factionKey}.png`;
        setTimeout(resolve, 600);
      });
    }

    // Outcome Stamp & Score
    const statusText = draw ? 'COVENANT DRAW' : won ? 'BLOCK SECURED' : 'EVICTED';
    const statusColor = draw ? '#ffec27' : won ? '#00e436' : '#ff004d';
    ctx.fillStyle = statusColor;
    ctx.font = '900 42px Impact, "Arial Black", sans-serif';
    ctx.fillText(`${statusText}  (${sim?.score?.[0] ?? 0} - ${sim?.score?.[1] ?? 0})`, 290, 112);

    // Player & Faction
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px "Arial Black", sans-serif';
    ctx.fillText(`${me?.name || 'Homeowner'}  ·  ${factionObj.name}`, 290, 152);

    const weaponName = me?.weapons?.primary?.name || 'The Allowance';
    const modeLabel = sim?.mode?.constructor?.label || 'Cul-de-Sac Clash';
    ctx.fillStyle = '#29adff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`WEAPON: ${weaponName.toUpperCase()}   |   MODE: ${modeLabel.toUpperCase()}`, 290, 180);

    // K/D Stats Box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(290, 200, 470, 92);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeRect(290, 200, 470, 92);

    const kills = me?.kills ?? 0;
    const deaths = me?.deaths ?? 0;
    const kd = (kills / Math.max(1, deaths)).toFixed(2);
    ctx.fillStyle = '#ffec27';
    ctx.font = '900 34px Impact, "Arial Black", sans-serif';
    ctx.fillText(`${kills} FINES`, 312, 252);
    ctx.fillStyle = '#ff77a8';
    ctx.fillText(`${deaths} CITATIONS`, 465, 252);
    ctx.fillStyle = '#00e436';
    ctx.fillText(`${kd} K/D`, 650, 252);

    ctx.fillStyle = '#c2c3c7';
    ctx.font = '12px monospace';
    ctx.fillText('ENEMIES FINED', 312, 276);
    ctx.fillText('TIMES EVICTED', 465, 276);
    ctx.fillText('EFFICIENCY RATIO', 650, 276);

    // Quote
    const quote = (mvpLine || factionObj.tagline || 'See you at the next board meeting!').slice(0, 72);
    ctx.fillStyle = '#fff1e8';
    ctx.font = 'italic 15px Georgia, serif';
    ctx.fillText(`"${quote}"`, 290, 318);

    // MVP & Suburban Stockades Badges
    const actors = sim?.actors || (me ? [me] : []);
    const { mvp: matchMvp, bottomFragger: matchWorst } = this.calculatePodium(actors);
    const topPlayer = matchMvp || me;
    const shamedPlayer = matchWorst || me;

    // MVP Golden Mower Badge
    ctx.fillStyle = 'rgba(255, 236, 39, 0.14)';
    ctx.fillRect(290, 332, 230, 64);
    ctx.strokeStyle = '#ffec27';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(290, 332, 230, 64);

    ctx.fillStyle = '#ffec27';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('👑 MATCH MVP · GOLDEN MOWER', 298, 348);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Arial Black", sans-serif';
    ctx.fillText(`${topPlayer.name} · ${topPlayer.kills ?? 0} KILLS`, 298, 368);
    ctx.fillStyle = '#c2c3c7';
    ctx.font = '10px monospace';
    ctx.fillText('Crowned on Golden Riding Mower', 298, 385);

    // Suburban Stockades Shame Badge
    ctx.fillStyle = 'rgba(255, 0, 77, 0.16)';
    ctx.fillRect(530, 332, 230, 64);
    ctx.strokeStyle = '#ff004d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(530, 332, 230, 64);

    ctx.fillStyle = '#ff004d';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('⛓️ SUBURBAN STOCKADES / SHAME PILLORY', 538, 348);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "Arial Black", sans-serif';
    ctx.fillText(`${shamedPlayer.name} (${shamedPlayer.kills ?? 0}K · ${shamedPlayer.deaths ?? 0}D)`, 538, 368);
    ctx.fillStyle = '#ff77a8';
    ctx.font = 'bold 10px Impact, sans-serif';
    ctx.fillText('VIOLATION: WEAPONIZED INCOMPETENCE', 538, 385);

    // Footer CTA
    ctx.fillStyle = '#ffec27';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('PLAY FREE: homebrewgametrailers.itch.io/call-of-karen-hoa-warfare  ·  $4.99 ON STEAM', 36, 422);

    return canvas;
  }

  calculatePodium(actors) {
    return calculatePodium(actors);
  }

  getBottomFragger(actors) {
    return calculatePodium(actors).bottomFragger;
  }

  exportHoaCitationCanvas(victim, killer, stats, options = {}) {
    return exportHoaCitationCanvas(victim, killer, stats, { factions: this.factions, ...options });
  }

  async shareCitation({ victim, killer, stats, options } = {}) {
    const canvas = await this.exportHoaCitationCanvas(victim, killer, stats, options);
    if (!canvas) return false;
    return this.shareOrDownloadCanvas(canvas, 'hoa-violation-notice.png', 'SHADY PINES CUL-DE-SAC HOA - OFFICIAL NOTICE OF VIOLATION');
  }

  async shareOrDownloadCanvas(canvas, filename = 'hoa-warfare.png', title = 'Call of Karen: HOA Warfare') {
    if (!canvas) return false;
    const blob = await new Promise((resolve) => {
      if (canvas.toBlob) canvas.toBlob(resolve, 'image/png');
      else resolve(null);
    });

    if (blob && typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, files: [file] });
          return true;
        }
      } catch {}
    }

    if (typeof document !== 'undefined' && canvas.toDataURL) {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      a.click?.();
      return true;
    }
    return false;
  }

  async shareScoreCard({ sim, me, won, draw, mvpLine, funnel }) {
    const canvas = await this.renderScoreCardCanvas({ sim, me, won, draw, mvpLine });
    if (!canvas) return false;
    const factionName = this.factions?.[me?.faction]?.name || 'a Karen';
    const text = funnel
      ? funnel.shareText({ kills: me?.kills || 0, deaths: me?.deaths || 0, factionName, won, modeLabel: sim?.mode?.constructor?.label })
      : `I went ${me?.kills || 0}-${me?.deaths || 0} as ${factionName} in Call of Karen: HOA Warfare!`;

    return this.shareOrDownloadCanvas(canvas, `hoa-warfare-${me?.faction || 'scorecard'}.png`, text);
  }

  popScore(text, isGold = false) {
    const hud = this.$('hud');
    if (!hud || typeof document === 'undefined' || !document.createElement) return;
    const el = document.createElement('div');
    el.className = 'score-popup' + (isGold ? ' gold' : '');
    el.textContent = text;
    hud.appendChild(el);
    setTimeout(() => el.remove?.(), 950);
  }

  update({ sim, me, state, renderer, input, voice, sfx, library, radar, realTime }) {
    const $ = this.$;
    $('hud').classList.remove('hidden');
    this.updateDroneOverlay(sim, me);
    $('s0').textContent = sim.score[0];
    if ($('s1')) $('s1').textContent = sim.score[1];
    const modeClock = sim.mode?.clock?.();
    const left = Math.max(0, modeClock != null ? modeClock : sim.timeLimit - sim.time);
    $('clock').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    $('hpfill').style.width = `${me.alive ? me.hp : 0}%`;
    $('hpfill').style.background = me.hp < 25 ? '#ff004d' : me.hp < 60 ? '#ffa300' : '#00e436';
    const W = me.weapons;
    const activeW = (W && W[me.activeSlot]) || W.primary;
    $('wname').textContent = `${activeW.name}${me.activeSlot === 'secondary' ? ' [SECONDARY]' : ''}`;
    $('ammo').textContent = me.reloadUntil > 0 ? 'RELOADING' : `${me.ammo} / ${activeW.mag}`;
    $('nades').textContent = `${W.equipment ? `${W.equipment.name} x${me.grenades} [G]` : ''}${W.melee ? ` · ${W.melee.name.replace('The ', '')} [F]` : ''} · [Q/1/2] Swap`;
    const mh = sim.mode.hud(me);
    const diffLabel = state.difficulty === 'easy' ? 'EASY (3x HP · LOCK-ON)' : state.difficulty === 'hard' ? 'HARD (1x HP)' : 'MEDIUM (2x HP)';
    $('modes').innerHTML = `${sim.mode.constructor.label} · first to ${sim.scoreLimit} · ${diffLabel}${mh ? `<br>${mh}` : ''}<br>${state.script === 'steam' ? 'STEAM script' : 'CLEAN script'} · legal-safe ${library.legalSafe ? 'ON' : 'OFF'} · ${renderer?.retro ? '16-bit' : 'clean render'}${state.style007 ? ' · 007 GoldenEye' : ''}${voice?.enabled ? '' : ' · muted'}`;
    const ch = $('crosshair');
    if (ch) {
      ch.style.display = me.alive && !this.killcam && !state.spectate ? '' : 'none';
      const locked = !!input?.lockTarget;
      ch.textContent = locked ? '⊕' : '+';
      if (ch.style) {
        ch.style.color = locked ? '#00e436' : '';
        ch.style.transform = locked ? 'translate(-50%, -50%) scale(1.35)' : '';
      }
    }

    if (state.style007) {
      const hp = me.alive ? me.hp : 0;
      const sanity = me.campState?.secondsLeft != null ? (me.campState.secondsLeft / 5) * 100 : 100;
      this.update007Meters(hp, 100, Math.min(100, sanity));
    }

    const cs = me.campState;
    const warn = me.alive && cs.state === 'warning';
    $('loiter').classList.toggle('hidden', !warn);
    if (warn) {
      $('loiterT').textContent = Math.ceil(cs.secondsLeft);
      if (realTime - this.lastLoiterBeep > 1) { this.lastLoiterBeep = realTime; sfx?.warn?.(); }
    }
    if (!me.alive && !this.killcam) this.showRespawn(me, sim);
    if (radar) radar.render(sim, me, state.spectate);

    const isLow = this.applyQualityOptimizations(state, renderer);
    const maxDist = isLow ? 25 : 45;

    // speech bubbles follow their speaker (or stay where a dead speaker fell)
    this.bubbles = this.bubbles.filter(bb => {
      if (realTime > bb.until) { bb.el?.remove?.(); return false; }
      const a = sim.byId.get(bb.id);
      const p = a.alive ? a.pos : bb.pos;
      const far = renderer?.camera?.position ? Math.hypot(p.x - renderer.camera.position.x, p.z - renderer.camera.position.z) > maxDist : false;
      const s = (bb.id === me.id && !me.isBot) || this.killcam || far ? null : renderer?.toScreen?.(p, 2.35);
      if (bb.el && bb.el.style) bb.el.style.display = s ? '' : 'none';
      bb.screen = s;
      return true;
    });

    if (isLow) {
      // In low quality mode, avoid expensive layout reflows from offsetHeight/offsetWidth in a loop
      for (const bb of this.bubbles) {
        if (bb.screen && bb.el && bb.el.style) {
          bb.el.style.left = `${bb.screen.x}px`;
          bb.el.style.top = `${bb.screen.y}px`;
        }
      }
    } else {
      // stack overlapping bubbles upward (nearest speaker keeps its spot)
      const placed = [];
      for (const bb of this.bubbles.filter(b => b.screen).sort((a, b) => b.screen.y - a.screen.y)) {
        let { x, y } = bb.screen;
        const h = (bb.el?.offsetHeight || 0) + 4, w = bb.el?.offsetWidth || 0;
        for (let moved = true; moved;) {
          moved = false;
          for (const p of placed) if (Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < Math.max(p.h, h)) { y = p.y - p.h; moved = true; }
        }
        placed.push({ x, y, w, h });
        if (bb.el && bb.el.style) {
          bb.el.style.left = `${x}px`;
          bb.el.style.top = `${y}px`;
        }
      }
    }

    // High-performance FPS & Profiling overlay
    const perfActive = Boolean(this.perfOverlay || (typeof location !== 'undefined' && location?.search && new URLSearchParams(location.search).get('perf') === '1'));
    const perfEl = this.$('perfOverlay') || this.$('perfHud') || this._perfEl;
    if (perfActive) {
      this.updatePerfOverlay({ sim, renderer, state, realTime });
    } else if (perfEl && perfEl.style) {
      perfEl.style.display = 'none';
    }

    const doorbellActive = !!(this.isDoorbellCam || this.killcam || renderer?.isDoorbellCam);
    this.updateDoorbellOverlay(doorbellActive, sim?.time ?? realTime);

    $('board').classList.toggle('hidden', !input.scoreboard);
    if (input.scoreboard) this.renderBoard($('board'), sim, me);
  }

  reset() {
    for (const b of this.bubbles) b.el?.remove?.();
    this.bubbles = [];
    this.killcam = null;
    this.isDoorbellCam = false;
    this.updateDoorbellOverlay(false);
    clearTimeout(this.bannerT);
    this._perfFrames = [];
    this._lastPerfTime = 0;
    this._lastRealTime = null;
  }
}
