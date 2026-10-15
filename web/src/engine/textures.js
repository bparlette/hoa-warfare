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
  grass: rep => pixelTex('grass', 16, 16, (px, w, h, r) => {
    noise('#5aa03c', 0.22)(px, w, h, r);
    for (let i = 0; i < 14; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#7cc24e');
    for (let i = 0; i < 6; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#3f7d2c');
  }, rep),
  asphalt: rep => pixelTex('asphalt', 16, 16, (px, w, h, r) => {
    noise('#55575e', 0.18)(px, w, h, r);
    for (let i = 0; i < 5; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#6d7079');
  }, rep),
  concrete: rep => pixelTex('concrete', 16, 16, (px, w, h, r) => {
    noise('#c9c4b8', 0.1)(px, w, h, r);
    px(0, 0, '#a8a397', w, 1); px(0, 0, '#a8a397', 1, h);
  }, rep),
  siding: (color, rep) => pixelTex('siding' + color, 16, 16, (px, w, h, r) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, shade(color, y % 4 === 3 ? -0.18 : (r() - 0.5) * 0.05));
  }, rep),
  roof: (color, rep) => pixelTex('roof' + color, 16, 16, (px, w, h, r) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const off = Math.floor(y / 4) % 2 ? 2 : 0;
      px(x, y, shade(color, y % 4 === 3 || (x + off) % 4 === 0 ? -0.25 : (r() - 0.5) * 0.1));
    }
  }, rep),
  window: () => pixelTex('window', 8, 8, (px) => {
    px(0, 0, '#f4f1ea', 8, 8); px(1, 1, '#7fb6e0', 6, 6); px(1, 1, '#b9dcf5', 2, 2); px(4, 1, '#f4f1ea', 1, 6); px(1, 4, '#f4f1ea', 6, 1);
  }),
  garage: () => pixelTex('garage', 16, 16, (px, w, h) => {
    for (let y = 0; y < h; y++) px(0, y, y % 3 === 2 ? '#c8c3b6' : '#ece7da', w, 1);
    px(3, 2, '#7fb6e0', 2, 1); px(7, 2, '#7fb6e0', 2, 1); px(11, 2, '#7fb6e0', 2, 1);
  }),
  door: color => pixelTex('door' + color, 8, 16, (px) => {
    px(0, 0, color, 8, 16); px(1, 1, shade(color, -0.2), 6, 6); px(1, 9, shade(color, -0.2), 6, 6); px(6, 8, '#e8c547', 1, 1);
  }),
  picket: rep => pixelTex('picket', 8, 8, (px) => {
    px(0, 0, '#f6f4ee', 8, 8); px(3, 0, '#c9c6bd', 1, 8); px(7, 0, '#c9c6bd', 1, 8); px(0, 0, '#ffffff', 8, 1);
  }, rep),
  privacy: rep => pixelTex('privacy', 16, 16, (px, w, h, r) => {
    for (let x = 0; x < w; x++) { const c = shade('#9b6b43', (r() - 0.5) * 0.15 + (x % 4 === 3 ? -0.25 : 0)); px(x, 0, c, 1, h); }
    px(0, 5, '#6e4a2c', w, 1);
  }, rep),
  hedge: rep => pixelTex('hedge', 16, 16, (px, w, h, r) => {
    noise('#2f7a35', 0.35)(px, w, h, r);
    for (let i = 0; i < 10; i++) px(Math.floor(r() * w), Math.floor(r() * h), '#4fa047');
  }, rep),
  leaves: color => pixelTex('leaves' + color, 16, 16, (px, w, h, r) => {
    noise(color, 0.35)(px, w, h, r);
  }),
  bark: () => pixelTex('bark', 8, 16, (px, w, h, r) => {
    for (let x = 0; x < w; x++) px(x, 0, shade('#6b4a2e', (r() - 0.5) * 0.3 + (x % 3 === 0 ? -0.2 : 0)), 1, h);
  }),
  car: color => pixelTex('car' + color, 16, 16, (px, w, h, r) => {
    noise(color, 0.06)(px, w, h, r);
    px(0, 0, shade(color, 0.25), w, 2);
    px(0, 10, '#2b2b2b', w, 1);
  }),
  receipt: () => pixelTex('receipt', 8, 12, (px) => {
    px(0, 0, '#fff1e8', 8, 12);
    for (let y = 2; y < 10; y += 2) px(1, y, '#5f574f', 3 + (y % 4 ? 3 : 1), 1);
    px(1, 10, '#ff004d', 6, 1);
    px(0, 11, '#c2c3c7', 1, 1); px(2, 11, '#c2c3c7', 1, 1); px(4, 11, '#c2c3c7', 1, 1); px(6, 11, '#c2c3c7', 1, 1);
  }),
  stripe: () => pixelTex('stripe', 4, 16, (px) => { px(0, 0, '#55575e', 4, 16); px(1, 0, '#e8c547', 2, 8); }),
};

/** Shirt texture: base colour, accent trim, a little dithered shading. */
export function shirtTex(look, seed) {
  return pixelTex('shirt' + look.shirt + look.accent + seed, 8, 8, (px, w, h, r) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, shade(look.shirt, (y > 5 ? -0.12 : 0) + ((x + y) % 2 && y > 4 ? -0.05 : 0)));
    px(0, 0, look.accent, w, 1);
    if (look.hat === 'vest') { px(0, 0, look.accent, 2, h); px(6, 0, look.accent, 2, h); }
    if (look.hat === 'sweaterCane') px(0, 1, look.accent, w, 1);
    if (look.hat === 'stringer') { px(2, 0, shade(look.shirt, 0.3), 1, h); px(5, 0, shade(look.shirt, 0.3), 1, h); }
  });
}

export function pantsTex(look) {
  return pixelTex('pants' + look.pants, 4, 8, (px, w, h) => {
    for (let y = 0; y < h; y++) px(0, y, shade(look.pants, y === h - 1 ? -0.4 : (y % 3 === 0 ? -0.06 : 0)), w, 1);
  });
}

/** 8x8 faces. Each faction gets one readable feature at 16-bit resolution. */
export function faceTex(faction, skin) {
  return pixelTex('face' + faction + skin, 8, 8, (px) => {
    px(0, 0, skin, 8, 8);
    const eye = '#1d1d24';
    const eyes = () => { px(2, 3, eye); px(5, 3, eye); };
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
      default: eyes(); px(3, 6, eye, 2, 1);
    }
  });
}
