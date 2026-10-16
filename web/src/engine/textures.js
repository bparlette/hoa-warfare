// Procedural pixel-art textures (tiny canvases, nearest filtering). Placeholder art that already
// reads as "16-bit" under the palette shader; swap for hand-painted PNGs of the same sizes later.
import * as THREE from '../../vendor/three.module.min.js';

const cache = new Map();

function hashRng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) | 0;
  return () => { s = (s * 1103515245 + 12345) | 0; return ((s >>> 16) & 0x7fff) / 0x7fff; };
}

export function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f >= 0) c.lerp(new THREE.Color(1, 1, 1), f); else c.multiplyScalar(1 + f);
  return '#' + c.getHexString();
}

export function pixelTex(key, w, h, draw, repeat = null) {
  const k = key + (repeat ? `@${repeat[0]}x${repeat[1]}` : '');
  if (cache.has(k)) return cache.get(k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const px = (x, y, c, ww = 1, hh = 1) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
  draw(px, w, h, hashRng(key), g);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  cache.set(k, t);
  return t;
}

const noise = (base, amt) => (px, w, h, r) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, shade(base, (r() - 0.5) * amt));
};

export const T = {
  grass: rep => pixelTex('grass', 32, 32, (px, w, h, r) => {
    // Alternating lawn mower mowing stripes (lighter #48873f and darker #3f7b37 green)
    for (let y = 0; y < h; y++) {
      const stripe = Math.floor(y / 8) % 2 === 0;
      const base = stripe ? '#48873f' : '#3f7b37';
      for (let x = 0; x < w; x++) {
        px(x, y, shade(base, (r() - 0.5) * 0.14));
      }
    }
    // Manicured turf blade flecks & highlights
    for (let i = 0; i < 40; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#63a84e', 1, 2);
    for (let i = 0; i < 24; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#336329', 1, 2);
  }, rep),
  asphalt: rep => pixelTex('asphalt', 32, 32, (px, w, h, r) => {
    noise('#4b4d54', 0.14)(px, w, h, r);
    // Subtle aggregate gravel & tar road noise
    for (let i = 0; i < 36; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#62656d');
    for (let i = 0; i < 28; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#323439');
    for (let i = 0; i < 14; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#797c85');
    // Subtle curb edge markings and asphalt seams
    for (let x = 0; x < w; x++) {
      if (r() > 0.45) px(x, 0, shade('#585a62', 0.1));
      if (r() > 0.75) px(x, h - 1, '#2c2e33');
    }
  }, rep),
  concrete: rep => pixelTex('concrete', 32, 32, (px, w, h, r) => {
    noise('#c9c4b8', 0.08)(px, w, h, r);
    px(0, 0, '#a8a397', w, 1); px(0, 0, '#a8a397', 1, h);
    px(0, 1, '#dfdace', w, 1);
  }, rep),
  siding: (color, rep) => pixelTex('siding' + color, 32, 32, (px, w, h, r) => {
    for (let y = 0; y < h; y++) {
      const boardShadow = y % 8 === 7 ? -0.22 : (y % 8 === 0 ? 0.08 : 0);
      for (let x = 0; x < w; x++) px(x, y, shade(color, boardShadow + (r() - 0.5) * 0.04));
    }
  }, rep),
  roof: (color, rep) => pixelTex('roof' + color, 32, 32, (px, w, h, r) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const off = Math.floor(y / 8) % 2 ? 4 : 0;
      px(x, y, shade(color, y % 8 === 7 || (x + off) % 8 === 0 ? -0.25 : (r() - 0.5) * 0.08));
    }
  }, rep),
  window: () => pixelTex('window', 32, 32, (px) => {
    px(0, 0, '#f4f1ea', 32, 32);
    px(2, 2, '#d8d2c5', 28, 28);
    px(4, 4, '#5a94c4', 24, 24);
    // Warm interior curtains & sky reflection
    px(4, 4, '#8fc5ed', 24, 10);
    px(5, 5, '#cce8fa', 8, 8);
    px(4, 4, '#f7f3e8', 4, 24);
    px(24, 4, '#f7f3e8', 4, 24);
    // Colonial window muntin bars
    px(15, 3, '#f4f1ea', 2, 26);
    px(3, 15, '#f4f1ea', 26, 2);
    px(0, 29, '#c9c4b8', 32, 3);
  }),
  garage: () => pixelTex('garage', 32, 32, (px, w, h) => {
    for (let y = 0; y < h; y++) px(0, y, y % 6 === 5 ? '#c8c3b6' : '#ece7da', w, 1);
    for (let p = 0; p < 4; p++) {
      const x0 = 2 + p * 7;
      px(x0, 3, '#5a94c4', 5, 4);
      px(x0, 3, '#a8d8f8', 2, 2);
      for (const y0 of [10, 17, 24]) {
        px(x0, y0, '#d8d3c6', 5, 4);
        px(x0 + 1, y0 + 1, '#f4f1ea', 3, 2);
      }
    }
  }),
  door: color => pixelTex('door' + color, 16, 32, (px) => {
    px(0, 0, '#f4f1ea', 16, 32);
    px(1, 1, color, 14, 30);
    // Upper fanlight glass & recessed panels
    px(3, 3, '#8fc5ed', 10, 6);
    px(7, 3, '#f4f1ea', 2, 6);
    px(3, 11, shade(color, -0.22), 4, 8);
    px(9, 11, shade(color, -0.22), 4, 8);
    px(3, 21, shade(color, -0.22), 4, 8);
    px(9, 21, shade(color, -0.22), 4, 8);
    // Brass handle & kickplate
    px(12, 16, '#ffec27', 2, 3);
    px(2, 29, '#d4af37', 12, 2);
  }),
  picket: rep => pixelTex('picket', 16, 16, (px) => {
    px(0, 0, '#f6f4ee', 16, 16);
    px(6, 0, '#c9c6bd', 2, 16);
    px(14, 0, '#c9c6bd', 2, 16);
    px(0, 0, '#ffffff', 16, 2);
    px(0, 4, '#e6e2d8', 16, 2);
    px(0, 12, '#e6e2d8', 16, 2);
  }, rep),
  privacy: rep => pixelTex('privacy', 32, 32, (px, w, h, r) => {
    for (let x = 0; x < w; x++) {
      const c = shade('#9b6b43', (r() - 0.5) * 0.12 + (x % 8 === 7 ? -0.28 : 0));
      px(x, 0, c, 1, h);
    }
    px(0, 8, '#6e4a2c', w, 2);
    px(0, 24, '#6e4a2c', w, 2);
  }, rep),
  hedge: rep => pixelTex('hedge', 32, 32, (px, w, h, r) => {
    noise('#2f7a35', 0.32)(px, w, h, r);
    for (let i = 0; i < 35; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#4fa047', 2, 2);
    for (let i = 0; i < 20; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#1e5222', 2, 2);
  }, rep),
  leaves: color => pixelTex('leaves' + color, 32, 32, (px, w, h, r) => {
    noise(color, 0.3)(px, w, h, r);
    for (let i = 0; i < 28; i++) px(Math.floor(r() * w), Math.floor(r() * h), shade(color, 0.22), 2, 2);
  }),
  bark: () => pixelTex('bark', 16, 32, (px, w, h, r) => {
    for (let x = 0; x < w; x++) px(x, 0, shade('#6b4a2e', (r() - 0.5) * 0.25 + (x % 4 === 0 ? -0.22 : 0)), 1, h);
  }),
  car: color => pixelTex('car' + color, 32, 32, (px, w, h, r) => {
    noise(color, 0.05)(px, w, h, r);
    px(0, 0, shade(color, 0.28), w, 4);
    px(0, 18, shade(color, -0.18), w, 2);
    px(0, 20, '#2b2b2b', w, 3);
  }),
  receipt: () => pixelTex('receipt', 16, 24, (px) => {
    px(0, 0, '#fff1e8', 16, 24);
    for (let y = 4; y < 20; y += 3) px(2, y, '#5f574f', 6 + (y % 6 ? 5 : 2), 2);
    px(2, 20, '#ff004d', 12, 2);
  }),
  stripe: () => pixelTex('stripe', 8, 32, (px) => { px(0, 0, '#55575e', 8, 32); px(2, 0, '#e8c547', 4, 16); }),
};

/** 32x32 Shirt texture: base colour, collar, buttons/seam, pocket, and faction trim. */
export function shirtTex(look, seed) {
  return pixelTex('shirt' + look.shirt + look.accent + seed, 32, 32, (px, w, h) => {
    for (let y = 0; y < h; y++) {
      const grad = y > 22 ? -0.12 : (y < 6 ? 0.05 : 0);
      for (let x = 0; x < w; x++) {
        px(x, y, shade(look.shirt, grad + ((x + y) % 2 && y > 18 ? -0.03 : 0)));
      }
    }
    // Collar & neckline trim
    px(0, 0, look.accent, w, 3);
    px(11, 2, shade(look.accent, -0.15), 10, 4);
    px(14, 3, '#fff1e8', 4, 5);
    // Subtle vertical placket & chest pocket
    px(15, 6, shade(look.shirt, -0.14), 2, 22);
    px(19, 10, shade(look.shirt, -0.16), 6, 6);
    px(19, 10, look.accent, 6, 2);
    // Belt at waist
    px(0, 29, '#222228', w, 3);
    px(14, 29, '#e8c547', 4, 3);
    if (look.hat === 'vest') {
      px(0, 0, look.accent, 9, h - 3);
      px(23, 0, look.accent, 9, h - 3);
      px(15, 0, '#c2c3c7', 2, h - 3);
    }
    if (look.hat === 'sweaterCane') {
      px(0, 3, look.accent, w, 5);
      px(10, 8, look.accent, 4, 8);
      px(18, 8, look.accent, 4, 8);
    }
    if (look.hat === 'stringer') {
      px(7, 0, shade(look.shirt, 0.3), 4, h - 3);
      px(21, 0, shade(look.shirt, 0.3), 4, h - 3);
    }
  });
}

export function pantsTex(look) {
  return pixelTex('pants' + look.pants, 16, 32, (px, w, h) => {
    for (let y = 0; y < h; y++) {
      const cuff = y >= h - 3 ? -0.35 : (y % 8 === 0 ? -0.05 : 0);
      px(0, y, shade(look.pants, cuff), w, 1);
    }
    // Side seam & knee crease detail
    px(0, 0, shade(look.pants, -0.16), 2, h);
    px(w - 2, 0, shade(look.pants, -0.16), 2, h);
    px(3, 15, shade(look.pants, 0.08), w - 6, 2);
  });
}

/** 32x32 high-detail expressive faces with sclera, pupils, eye catchlights, brows, and mouths. */
export function faceTex(faction, skin) {
  return pixelTex('face' + faction + skin, 32, 32, (pxRaw) => {
    const px = (x, y, c, ww = 1, hh = 1) => pxRaw(x * 4, y * 4, c, ww * 4, hh * 4);
    pxRaw(0, 0, skin, 32, 32);
    // Subtle cheek & forehead shading
    pxRaw(0, 0, shade(skin, 0.05), 32, 6);
    pxRaw(0, 26, shade(skin, -0.08), 32, 6);
    const eye = '#181820';
    const eyes = () => {
      // Crisp 32x32 eyes with white sclera, dark iris, and bright catchlight
      pxRaw(6, 11, '#ffffff', 6, 5);
      pxRaw(20, 11, '#ffffff', 6, 5);
      pxRaw(8, 11, eye, 4, 5);
      pxRaw(20, 11, eye, 4, 5);
      pxRaw(9, 12, '#ffffff', 1, 1);
      pxRaw(21, 12, '#ffffff', 1, 1);
    };
    switch (faction) {
      case 'karens': eyes(); px(1, 2, '#3a2a20', 2, 1); px(5, 2, '#3a2a20', 2, 1); px(3, 6, '#c2185b', 2, 1); px(1, 4, '#e8a0a0'); px(6, 4, '#e8a0a0'); break;
      case 'brainRot': px(2, 3, '#7ff7ff'); px(5, 3, '#7ff7ff'); px(3, 6, eye, 2, 1); px(0, 7, '#5b6ee1', 8, 1); break;
      case 'fratHouse': eyes(); px(2, 6, '#ffffff', 4, 1); px(2, 5, eye); px(5, 5, eye); break;
      case 'cloutStreamers': eyes(); px(2, 6, eye, 4, 1); px(1, 2, '#fff', 1, 1); px(4, 6, '#ffffff', 1, 1); break;
      case 'emoKids': px(0, 1, '#141414', 5, 4); px(5, 3, eye); px(3, 6, eye, 2, 1); break;
      case 'oldMoney': eyes(); px(5, 3, '#e8c547'); px(2, 6, '#e8e1d0', 4, 1); break;
      case 'gymRats': eyes(); px(2, 6, '#ffffff', 4, 1); px(1, 2, eye, 2, 1); px(5, 2, eye, 2, 1); break;
      case 'theaterKids': eyes(); px(2, 5, eye, 4, 2); px(3, 6, '#9c1f2f', 2, 1); break;
      case 'hoaDads': px(1, 3, '#111', 6, 1); px(2, 6, '#7b5a3a', 4, 1); break;
      case 'vcBros': eyes(); px(3, 6, eye, 3, 1); break;
      case 'valleyGirls': eyes(); px(3, 6, '#ff77a8', 2, 1); px(1, 2, eye); px(6, 2, eye); break;
      case 'rednecks': eyes(); px(1, 5, '#8a5a2e', 6, 3); px(3, 6, eye, 2, 1); break;
      case 'theGays': eyes(); px(1, 2, '#2d1e18', 2, 1); px(5, 2, '#2d1e18', 2, 1); px(3, 6, '#e05688', 2, 1); break;
      case 'trumpers': eyes(); px(2, 2, '#e0aa38', 4, 1); px(3, 6, eye, 2, 1); break;
      case 'wokeLibs': eyes(); px(3, 5, '#c25a3a', 2, 1); px(3, 6, eye, 2, 1); px(2, 4, '#e89090'); px(5, 4, '#e89090'); break;
      case 'mlmHuns': eyes(); px(2, 2, '#2b1b17'); px(5, 2, '#2b1b17'); px(2, 6, '#e91e63', 4, 1); px(1, 4, '#f48fb1'); px(6, 4, '#f48fb1'); break;
      case 'furries': eyes(); px(3, 4, '#ff70a6', 2, 1); px(1, 5, '#222', 2, 1); px(5, 5, '#222', 2, 1); px(3, 6, '#222', 2, 1); break;
      case 'animeWeebs': eyes(); px(1, 4, '#ff4f9a', 2, 1); px(5, 4, '#ff4f9a', 2, 1); px(3, 5, '#ffffff', 2, 1); px(3, 6, eye, 2, 1); break;
      case 'tradwives': eyes(); px(1, 4, '#e57373', 2, 1); px(5, 4, '#e57373', 2, 1); px(2, 6, '#d32f2f', 4, 1); break;
      case 'pickleballRetirees': eyes(); px(3, 3, '#ffffff', 2, 2); px(2, 6, '#8d6e63', 4, 1); break;
      default: eyes(); px(3, 6, eye, 2, 1);
    }
  });
}
