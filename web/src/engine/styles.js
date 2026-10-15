// Visual style profiles for Call of Karen: HOA Warfare.
// Controls retro filtering, body CSS classes, GoldenEye meters, etc.

export const STYLES = {
  modern: { id: 'modern', name: 'MODERN TACTICAL MODE', cls: 'style-modern', retro: false },
  '007': { id: '007', name: 'GOLDENEYE 007 MODE', cls: 'style-007', retro: true },
  cctv: { id: 'cctv', name: 'RING CAM CCTV SURVEILLANCE', cls: 'style-cctv', retro: false },
  vhs: { id: 'vhs', name: '1993 VHS EVIDENCE TAPE', cls: 'style-vhs', retro: true },
  noir: { id: 'noir', name: 'SUBPOENA NOIR MODE', cls: 'style-noir', retro: false },
  gameboy: { id: 'gameboy', name: 'GAME BOY 1989 DMG-01', cls: 'style-gameboy', retro: true },
};

export const STYLE_KEYS = Object.keys(STYLES);

export function getInitialStyle(params) {
  const p = params.get('style');
  if (p && STYLES[p]) return p;
  if (params.get('007') === '1') return '007';
  if (params.get('cctv') === '1') return 'cctv';
  if (params.get('vhs') === '1') return 'vhs';
  if (params.get('noir') === '1') return 'noir';
  if (params.get('gameboy') === '1') return 'gameboy';
  return 'modern';
}

export function init007Meters($ = id => document.getElementById(id)) {
  const hpMeter = $('geHpMeter');
  const armorMeter = $('geArmorMeter');
  if (hpMeter && !hpMeter.children.length) {
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.className = 'ge-seg on';
      hpMeter.appendChild(seg);
    }
  }
  if (armorMeter && !armorMeter.children.length) {
    for (let i = 0; i < 10; i++) {
      const seg = document.createElement('div');
      seg.className = 'ge-seg on';
      armorMeter.appendChild(seg);
    }
  }
}

export function applyStyle(styleKey, state, renderer, $ = id => document.getElementById(id)) {
  if (!STYLES[styleKey]) styleKey = 'modern';
  state.style = styleKey;
  for (const s of Object.values(STYLES)) {
    document.body.classList.remove(s.cls);
  }
  const cur = STYLES[styleKey];
  document.body.classList.add(cur.cls);
  if (styleKey === '007') init007Meters($);
  renderer.setRetro(cur.retro || state.retro);
  if ($('optStyle')) $('optStyle').value = styleKey;
  if ($('opt007')) $('opt007').checked = (styleKey === '007');
}

export function cycleStyle(state, renderer, $ = id => document.getElementById(id), onBanner = null) {
  const nextIdx = (STYLE_KEYS.indexOf(state.style) + 1) % STYLE_KEYS.length;
  const nextKey = STYLE_KEYS[nextIdx];
  applyStyle(nextKey, state, renderer, $);
  if (onBanner) onBanner(STYLES[nextKey].name);
}
