// HUD, feed, killcam, scoreboard, and UI overlays for Call of Karen: HOA Warfare.

const KILLCAM_SEC = 3.2;
const KILLCAM_HOLD = 1.6;

export const SUBURBAN_SHORTS_MEMES = [
  "WHEN YOU DON'T MOW ON SATURDAY AT 7AM",
  "POV: YOU PARKED ON THE STREET AFTER 9PM",
  "HOA PRESIDENT SPOTTED A 3-INCH WEED",
  "WHEN THE TRADWIFE CATCHES YOU WITH STORE-BOUGHT BREAD",
  "POV: YOU DIDN'T SEPARATE THE RECYCLING",
  "WHEN THE LAWN IS 2.6 INCHES INSTEAD OF 2.5",
  "POV: YOUR TRASH CAN WAS OUT 10 MINUTES PAST DAWN",
  "WHEN SOMEONE USES STORE-BOUGHT POTATO SALAD AT THE BLOCK PARTY",
];

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

export function exportShortsCanvas(victim, killer, barkLine, options = {}) {
  const canvas = (typeof document !== 'undefined' && document.createElement)
    ? document.createElement('canvas')
    : { width: 720, height: 1280 };
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return canvas;

  const vName = victim?.name || 'Offending Neighbor';
  const vFaction = options?.factions?.[victim?.faction]?.name || victim?.faction || 'The Karens';
  const kName = killer?.name || 'HOA President';
  const kFaction = options?.factions?.[killer?.faction]?.name || killer?.faction || 'The HOA Dads';
  const weapon = killer?.weapons?.primary?.name || options?.weaponName || 'The Allowance';
  const line = (typeof barkLine === 'string' ? barkLine : barkLine?.text) || "I WANT TO SPEAK TO YOUR MANAGER!";

  // 1. 9:16 Vertical background gradient
  const grad = ctx.createLinearGradient?.(0, 0, 720, 1280) || '#0b1222';
  if (typeof grad === 'object' && grad.addColorStop) {
    grad.addColorStop(0, '#090d19');
    grad.addColorStop(0.25, '#131e36');
    grad.addColorStop(0.75, '#1a2849');
    grad.addColorStop(1, '#080c16');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 720, 1280);

  // Outer framing / yellow TikTok hazard accents
  ctx.strokeStyle = '#ffec27';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 696, 1256);

  // 2. Top meme banner in bold Impact font
  const headline = options?.headline || SUBURBAN_SHORTS_MEMES[Math.floor(Math.random() * SUBURBAN_SHORTS_MEMES.length)];
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(36, 40, 648, 170);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 40, 648, 170);

  // Red tag above headline
  ctx.fillStyle = '#ff004d';
  ctx.fillRect(50, 48, 240, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('🚨 SUBURBAN CODE VIOLATION', 58, 66);

  // Headline in Impact
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 34px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  const headlineLines = wrapCanvasText(ctx, headline, 610);
  const startHdrY = 110 + (headlineLines.length > 1 ? 0 : 15);
  for (let i = 0; i < headlineLines.length; i++) {
    ctx.fillText(headlineLines[i], 360, startHdrY + i * 40);
  }

  // 3. Center frame: High-impact crop of match/killcam action with player badges and weapon icon
  const frameX = 36, frameY = 240, frameW = 648, frameH = 648;
  ctx.fillStyle = '#0e172a';
  ctx.fillRect(frameX, frameY, frameW, frameH);

  const srcCanvas = options?.sourceCanvas || (typeof document !== 'undefined' ? document.querySelector('canvas:not([id="gunbarrel"])') : null);
  if (srcCanvas && srcCanvas !== canvas && srcCanvas.width > 0 && srcCanvas.height > 0 && ctx.drawImage) {
    try {
      const minDim = Math.min(srcCanvas.width, srcCanvas.height);
      const sx = (srcCanvas.width - minDim) / 2;
      const sy = (srcCanvas.height - minDim) / 2;
      ctx.drawImage(srcCanvas, sx, sy, minDim, minDim, frameX, frameY, frameW, frameH);
    } catch {}
  } else {
    // High-impact tactical arena background
    ctx.strokeStyle = 'rgba(255, 236, 39, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(frameX + 30, frameY + 30, frameW - 60, frameH - 60);
    // Crosshair target
    ctx.strokeStyle = 'rgba(255, 0, 77, 0.45)';
    ctx.lineWidth = 3;
    if (ctx.beginPath && ctx.arc && ctx.stroke) {
      ctx.beginPath();
      ctx.arc(360, frameY + frameH / 2, 140, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(360, frameY + frameH / 2, 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 0, 77, 0.7)';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⊕', 360, frameY + frameH / 2 + 12);
  }

  // Center frame heavy border
  ctx.strokeStyle = '#ff004d';
  ctx.lineWidth = 6;
  ctx.strokeRect(frameX, frameY, frameW, frameH);

  // Live Killcam badge at top of center frame
  ctx.fillStyle = '#ff004d';
  ctx.fillRect(frameX + 16, frameY + 16, 210, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('🔴 LIVE KILLCAM FEED', frameX + 26, frameY + 38);

  // Badges: Eliminator & Target
  // Killer badge (bottom left of frame)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.fillRect(frameX + 16, frameY + frameH - 120, 280, 52);
  ctx.strokeStyle = '#00e436';
  ctx.lineWidth = 2;
  ctx.strokeRect(frameX + 16, frameY + frameH - 120, 280, 52);

  ctx.fillStyle = '#00e436';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('👑 ELIMINATOR', frameX + 26, frameY + frameH - 104);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px "Arial Black", sans-serif';
  ctx.fillText(`${kName} (${kFaction})`, frameX + 26, frameY + frameH - 84);

  // Victim badge (bottom right of frame)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.fillRect(frameX + frameW - 296, frameY + frameH - 120, 280, 52);
  ctx.strokeStyle = '#ff004d';
  ctx.lineWidth = 2;
  ctx.strokeRect(frameX + frameW - 296, frameY + frameH - 120, 280, 52);

  ctx.fillStyle = '#ff004d';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('💀 CITATION TARGET', frameX + frameW - 286, frameY + frameH - 104);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px "Arial Black", sans-serif';
  ctx.fillText(`${vName} (${vFaction})`, frameX + frameW - 286, frameY + frameH - 84);

  // Weapon Badge & Icon (centered bottom of frame)
  ctx.fillStyle = 'rgba(17, 29, 53, 0.92)';
  ctx.fillRect(frameX + 130, frameY + frameH - 58, 388, 44);
  ctx.strokeStyle = '#ffec27';
  ctx.lineWidth = 2;
  ctx.strokeRect(frameX + 130, frameY + frameH - 58, 388, 44);

  ctx.fillStyle = '#ffec27';
  ctx.font = 'bold 15px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🎯 WEAPON: ${weapon.toUpperCase()}`, 360, frameY + frameH - 30);

  // 4. Bottom subtitle box: Killer's savage voice line in large bold yellow text with heavy black stroke
  const subBoxX = 36, subBoxY = 918, subBoxW = 648, subBoxH = 220;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
  ctx.fillRect(subBoxX, subBoxY, subBoxW, subBoxH);
  ctx.strokeStyle = '#ffec27';
  ctx.lineWidth = 3;
  ctx.strokeRect(subBoxX, subBoxY, subBoxW, subBoxH);

  // Speaker tag
  ctx.fillStyle = '#29adff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`SAVAGE BARK · ${kName.toUpperCase()}:`, subBoxX + 20, subBoxY + 32);

  // Killer line in large bold yellow text with heavy black stroke
  ctx.font = '900 38px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  const subtitleLines = wrapCanvasText(ctx, `"${line}"`, 590);
  const startSubY = subBoxY + 84 + (subtitleLines.length > 2 ? -10 : subtitleLines.length === 1 ? 25 : 0);
  for (let i = 0; i < subtitleLines.length; i++) {
    const textY = startSubY + i * 46;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    if (ctx.strokeText) ctx.strokeText(subtitleLines[i], 360, textY);
    ctx.fillStyle = '#ffec27';
    ctx.fillText(subtitleLines[i], 360, textY);
  }

  // 5. Watermark badge: "CALL OF KAREN: HOA WARFARE - WISHLIST ON STEAM ($4.99)"
  const wmX = 36, wmY = 1170, wmW = 648, wmH = 64;
  ctx.fillStyle = '#171a21';
  ctx.fillRect(wmX, wmY, wmW, wmH);
  ctx.strokeStyle = '#66c0f4';
  ctx.lineWidth = 3;
  ctx.strokeRect(wmX, wmY, wmW, wmH);

  ctx.fillStyle = '#66c0f4';
  ctx.font = '900 18px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CALL OF KAREN: HOA WARFARE - WISHLIST ON STEAM ($4.99)', 360, wmY + 40);

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
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get firstChild() { return this.children[0] || null; },
    innerHTML: '',
    textContent: '',
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
      this.showBanner('YOU PLAYED YOURSELF', kc.line?.text || '');
      if (kc.line) voice.say({ text: kc.line.text, lineId: kc.line.id, faction: sim.actors.find(a => a.id === kc.victimId)?.faction, priority: 9, force: true });
      return;
    }
    for (const c of renderer.characters.values()) c.root.visible = false;
    const killer = sim.byId.get(kc.killerId);
    const victim = sim.byId.get(kc.victimId);
    $('killcam').classList.remove('hidden');
    $('kcWho').textContent = `${killer.name} · ${this.factions[killer.faction]?.name || killer.faction}${kc.headshot ? ' · HEADSHOT' : kc.melee ? ' · PARTICIPATION TROPHY' : ''}`;
    $('kcLine').textContent = '';

    const btnShort = this.$('killcam')?.querySelector?.('#btnExportShort') || $('btnExportShort') || $('btnExportShortKc');
    if (btnShort) {
      btnShort.onclick = async (e) => {
        e?.stopPropagation?.();
        btnShort.textContent = '⏳ GENERATING...';
        try {
          await this.shareShort({ victim, killer, barkLine: kc.line?.text || kc.line });
          btnShort.textContent = '✓ SHORT SAVED!';
        } catch {
          btnShort.textContent = '📱 9:16 TIKTOK / REEL';
        }
        setTimeout(() => { if (btnShort) btnShort.textContent = '📱 9:16 TIKTOK / REEL'; }, 2500);
      };
    }
  }

  updateKillcam(dt, sim, renderer, voice) {
    const $ = this.$;
    const kc = this.killcam;
    if (!kc) return;
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
        <button id="btnExportShort" class="btn-share" style="margin-top:0">📱 9:16 TIKTOK / REEL</button>
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
    const btnShareShort = this.$('endPanel')?.querySelector?.('#btnExportShort') || $('btnExportShort');
    if (btnShareShort) {
      btnShareShort.onclick = async () => {
        btnShareShort.textContent = '⏳ GENERATING...';
        try {
          await this.shareShort({
            victim: bottomFragger || me,
            killer: mvp || me,
            barkLine: mvpLine || 'I WANT TO SPEAK TO YOUR MANAGER!'
          });
          btnShareShort.textContent = '✓ SHORT SAVED!';
        } catch {
          btnShareShort.textContent = '📱 9:16 TIKTOK / REEL';
        }
        setTimeout(() => { if (btnShareShort) btnShareShort.textContent = '📱 9:16 TIKTOK / REEL'; }, 2500);
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

  exportShortsCanvas(victim, killer, barkLine, options = {}) {
    return exportShortsCanvas(victim, killer, barkLine, { factions: this.factions, ...options });
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

  async shareShort({ victim, killer, barkLine, options } = {}) {
    const canvas = await this.exportShortsCanvas(victim, killer, barkLine, options);
    if (!canvas) return false;
    return this.shareOrDownloadCanvas(canvas, 'hoa-warfare-short.png', 'Call of Karen: HOA Warfare - 9:16 Short');
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

    $('board').classList.toggle('hidden', !input.scoreboard);
    if (input.scoreboard) this.renderBoard($('board'), sim, me);
  }

  reset() {
    for (const b of this.bubbles) b.el?.remove?.();
    this.bubbles = [];
    this.killcam = null;
    clearTimeout(this.bannerT);
    this._perfFrames = [];
    this._lastPerfTime = 0;
    this._lastRealTime = null;
  }
}
