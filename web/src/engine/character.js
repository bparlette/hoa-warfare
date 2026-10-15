// Low-poly faction characters (boxes + pixel textures) and the comedy ragdoll.
// Proportions match sim.js BODY: 1.8 m tall, head centre at 1.62 m.
import * as THREE from '../../vendor/three.module.min.js';
import { shirtTex, pantsTex, faceTex, shade } from './textures.js';

const SKINS = ['#f1c7a5', '#d9a47e', '#a8714a', '#6e4a32', '#f6d8c0'];
const boxGeo = new Map();
function geo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!boxGeo.has(k)) boxGeo.set(k, new THREE.BoxGeometry(w, h, d));
  return boxGeo.get(k);
}
const mat = (o) => new THREE.MeshLambertMaterial(o);

function part(w, h, d, material, y = 0) {
  const m = new THREE.Mesh(geo(w, h, d), material);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------------------------
// RIG (the "prefab"). Every faction shares this hierarchy; only data below changes per faction.
//
//   root (Group)            feet at origin, rotation.y = yaw, -z = facing
//   └ body                  bobs while running
//     ├ hipL / hipR         (±0.13, 0.80, 0)   leg box + shoe hang along -y; rotation.x = stride
//     ├ torso               box 0.56 x 0.62 x 0.30 centred at y 1.10  (shirt texture)
//     ├ head (Group)        y 1.62; head box 0.38 x 0.40 x 0.38, face texture on -z; HEADWEAR parts
//     ├ shoulderL / R       (±0.37, 1.36, 0)   arm hangs along -y, hand at y -0.56; rotation.x aims
//     │  └ gun (on R)       barrel along the arm; PROPS attach to handL / handR
//     └ marker              team diamond at y 2.15
//
// Hitboxes live in sim.js BODY and must stay in sync with these proportions:
//   body cylinder r 0.42 from y 0 to 1.42, head sphere r 0.25 at y 1.62.
// Ragdoll: on death each of torso, head, hipL, hipR, shoulderL, shoulderR becomes a free piece
// (Ragdoll class below). No skinning, no bones, so a new faction never needs rig work.
//
// Part spec used by HEADWEAR and PROPS:
//   { s: 'box'|'cyl'|'torus', size: [...three.js geometry args], at: [x,y,z], rot?: [x,y,z],
//     c: 'accent'|'shirt'|'pants'|'#hex', glow?: '#hex', glowI?: number }
// HEADWEAR parts are children of the head (origin = head centre, -z = face).
// PROPS add `hand: 'L'|'R'` and are children of that shoulder (arm along -y, hand at y -0.56).
// Pick headwear with `look.hat` in hoa_content.json; PROPS are keyed by faction id.
// ---------------------------------------------------------------------------------------------

export const HEADWEAR = {
  backwardsCap: [
    { s: 'box', size: [0.4, 0.1, 0.4], at: [0, 0.22, 0], c: 'accent' },
    { s: 'box', size: [0.3, 0.03, 0.18], at: [0, 0.18, 0.27], c: 'accent' }, // brim faces backwards
  ],
  hoodPhones: [
    { s: 'box', size: [0.46, 0.44, 0.44], at: [0, 0.02, 0.04], c: 'shirt' },
    { s: 'box', size: [0.08, 0.16, 0.16], at: [-0.25, 0, 0], c: 'accent' },
    { s: 'box', size: [0.08, 0.16, 0.16], at: [0.25, 0, 0], c: 'accent' },
    { s: 'box', size: [0.5, 0.05, 0.08], at: [0, 0.25, 0], c: 'accent' },
  ],
  bob: [
    { s: 'box', size: [0.44, 0.14, 0.44], at: [0, 0.18, 0], c: '#e3c46a' },
    { s: 'box', size: [0.44, 0.34, 0.12], at: [0, -0.02, 0.18], c: '#e3c46a' },
    { s: 'box', size: [0.1, 0.3, 0.3], at: [-0.22, 0, 0.02], c: '#e3c46a' }, // the asymmetric bob
    { s: 'box', size: [0.06, 0.18, 0.26], at: [0.2, 0.06, 0.04], c: '#e3c46a' },
    { s: 'box', size: [0.36, 0.05, 0.06], at: [0, 0.27, -0.1], c: '#141414' }, // sunglasses on head
  ],
  ringLight: [
    { s: 'torus', size: [0.34, 0.045, 4, 10], at: [0, 0.05, 0.42], c: 'accent', glow: '#ffffff', glowI: 0.7 },
    { s: 'box', size: [0.42, 0.1, 0.42], at: [0, 0.2, 0], c: '#1d1d1d' },
  ],
  trucker: [
    { s: 'box', size: [0.42, 0.12, 0.42], at: [0, 0.22, 0], c: 'accent' },
    { s: 'box', size: [0.32, 0.03, 0.2], at: [0, 0.17, -0.28], c: 'accent' },
  ],
  whiteCap: [
    { s: 'box', size: [0.42, 0.12, 0.42], at: [0, 0.22, 0], c: '#ffffff' },
    { s: 'box', size: [0.32, 0.03, 0.2], at: [0, 0.17, -0.28], c: '#ffffff' },
  ],
  beret: [{ s: 'cyl', size: [0.26, 0.26, 0.07, 8], at: [0.04, 0.22, 0], rot: [0, 0, 0.2], c: 'accent' }],
  ponytail: [
    { s: 'box', size: [0.42, 0.1, 0.42], at: [0, 0.2, 0], c: '#f0d27a' },
    { s: 'box', size: [0.12, 0.3, 0.12], at: [0, 0.02, 0.26], c: '#f0d27a' },
  ],
  fringe: [
    { s: 'box', size: [0.42, 0.12, 0.42], at: [0, 0.2, 0], c: '#111111' },
    { s: 'box', size: [0.26, 0.2, 0.04], at: [-0.08, 0.06, -0.21], c: '#111111' },
  ],
  sweaterCane: [{ s: 'box', size: [0.4, 0.06, 0.4], at: [0, 0.2, 0], c: '#e6e6e6' }],
  designerShades: [
    { s: 'box', size: [0.42, 0.1, 0.42], at: [0, 0.2, 0], c: '#1c1c1c' },
    { s: 'box', size: [0.38, 0.08, 0.08], at: [0, 0.06, -0.21], c: '#141414' },
    { s: 'box', size: [0.06, 0.12, 0.12], at: [0, 0.26, -0.1], c: 'accent' },
  ],
  redHat: [
    { s: 'box', size: [0.42, 0.12, 0.42], at: [0, 0.22, 0], c: '#d91424' },
    { s: 'box', size: [0.32, 0.03, 0.2], at: [0, 0.17, -0.28], c: '#d91424' },
    { s: 'box', size: [0.24, 0.07, 0.02], at: [0, 0.23, -0.21], c: '#ffffff' },
  ],
  stringer: [
    // Gym Rats: backwards sweatband with messy spikes, lifting headphones around neck
    { s: 'box', size: [0.42, 0.08, 0.42], at: [0, 0.12, 0], c: 'accent' },
    { s: 'box', size: [0.12, 0.18, 0.12], at: [0, 0.28, -0.04], rot: [-0.2, 0.1, 0], c: '#2b1d0c' },
    { s: 'box', size: [0.1, 0.15, 0.1], at: [-0.1, 0.26, 0.04], rot: [0.1, 0, 0.25], c: '#2b1d0c' },
    { s: 'box', size: [0.1, 0.16, 0.1], at: [0.1, 0.27, 0.02], rot: [0, 0.1, -0.22], c: '#2b1d0c' },
    { s: 'box', size: [0.12, 0.14, 0.1], at: [0, 0.24, 0.12], rot: [0.3, 0, 0], c: '#2b1d0c' },
    { s: 'torus', size: [0.24, 0.035, 6, 12], at: [0, -0.21, 0.02], rot: [Math.PI / 2, 0, 0], c: '#141414' },
    { s: 'cyl', size: [0.07, 0.07, 0.06, 8], at: [-0.22, -0.19, -0.02], rot: [0, 0, Math.PI / 2], c: '#2a2a2a' },
    { s: 'cyl', size: [0.07, 0.07, 0.06, 8], at: [0.22, -0.19, -0.02], rot: [0, 0, Math.PI / 2], c: '#2a2a2a' },
    { s: 'torus', size: [0.05, 0.012, 4, 8], at: [-0.25, -0.19, -0.02], rot: [0, Math.PI / 2, 0], c: 'accent' },
    { s: 'torus', size: [0.05, 0.012, 4, 8], at: [0.25, -0.19, -0.02], rot: [0, Math.PI / 2, 0], c: 'accent' },
  ],
  vest: [
    // VC Bros: sleek high-tech fleece collar, slicked back hair, and wireless AirPods in ears
    { s: 'box', size: [0.42, 0.12, 0.44], at: [0, 0.21, 0.02], c: '#221b18' },
    { s: 'box', size: [0.4, 0.16, 0.08], at: [0, 0.09, 0.2], c: '#221b18' },
    { s: 'box', size: [0.43, 0.03, 0.28], at: [0, 0.25, 0], c: '#382e28' },
    { s: 'box', size: [0.44, 0.14, 0.12], at: [0, -0.16, 0.18], c: 'accent' },
    { s: 'box', size: [0.12, 0.14, 0.36], at: [-0.21, -0.16, 0.02], c: 'accent' },
    { s: 'box', size: [0.12, 0.14, 0.36], at: [0.21, -0.16, 0.02], c: 'accent' },
    { s: 'box', size: [0.03, 0.14, 0.04], at: [0, -0.16, -0.18], c: '#e0e0e0' },
    { s: 'box', size: [0.04, 0.04, 0.04], at: [-0.21, -0.02, -0.02], c: '#ffffff' },
    { s: 'cyl', size: [0.015, 0.015, 0.07, 6], at: [-0.21, -0.06, -0.02], rot: [0.15, 0, -0.1], c: '#ffffff' },
    { s: 'box', size: [0.04, 0.04, 0.04], at: [0.21, -0.02, -0.02], c: '#ffffff' },
    { s: 'cyl', size: [0.015, 0.015, 0.07, 6], at: [0.21, -0.06, -0.02], rot: [0.15, 0, 0.1], c: '#ffffff' },
  ],
  beanieTote: [
    // Woke Libs: knit rolled-cuff fisherman beanie in accent color with round tortoise-shell spectacles
    { s: 'box', size: [0.42, 0.16, 0.42], at: [0, 0.25, 0], c: 'accent' },
    { s: 'box', size: [0.46, 0.08, 0.46], at: [0, 0.17, 0], c: 'accent' },
    { s: 'box', size: [0.42, 0.08, 0.42], at: [0, 0.1, 0.02], c: '#483526' },
    { s: 'torus', size: [0.065, 0.018, 4, 10], at: [-0.09, 0.02, -0.21], c: '#663d14' },
    { s: 'torus', size: [0.065, 0.018, 4, 10], at: [0.09, 0.02, -0.21], c: '#663d14' },
    { s: 'box', size: [0.06, 0.02, 0.02], at: [0, 0.03, -0.21], c: '#663d14' },
    { s: 'box', size: [0.02, 0.02, 0.18], at: [-0.19, 0.03, -0.11], c: '#663d14' },
    { s: 'box', size: [0.02, 0.02, 0.18], at: [0.19, 0.03, -0.11], c: '#663d14' },
  ],
  messyBun: [
    // MLM Huns: voluminous top messy bun held by an oversized pastel scrunchie and large hoop earrings
    { s: 'box', size: [0.44, 0.14, 0.44], at: [0, 0.18, 0], c: '#c8955a' },
    { s: 'box', size: [0.42, 0.24, 0.08], at: [0, 0.02, 0.19], c: '#c8955a' },
    { s: 'torus', size: [0.15, 0.06, 6, 12], at: [0, 0.28, -0.02], rot: [Math.PI / 2, 0, 0], c: '#ffb3c6' },
    { s: 'sphere', size: [0.18, 8, 8], at: [0, 0.38, -0.02], c: '#c8955a' },
    { s: 'box', size: [0.05, 0.14, 0.04], at: [0.12, 0.38, 0.08], rot: [0.2, 0.2, -0.3], c: '#caa066' },
    { s: 'torus', size: [0.075, 0.015, 4, 10], at: [-0.21, -0.1, 0], c: '#e5b80b' },
    { s: 'torus', size: [0.075, 0.015, 4, 10], at: [0.21, -0.1, 0], c: '#e5b80b' },
  ],
  fursuitHead: [
    // Furries: oversized mascot animal head with pointed ears, snout, and expressive eyes in accent color
    { s: 'box', size: [0.48, 0.44, 0.46], at: [0, 0.04, 0.02], c: '#f0f0f0' },
    { s: 'box', size: [0.14, 0.24, 0.1], at: [-0.18, 0.34, 0.02], rot: [0, 0, 0.25], c: 'accent' },
    { s: 'box', size: [0.08, 0.18, 0.02], at: [-0.17, 0.33, -0.04], rot: [0, 0, 0.25], c: '#ff9ebb' },
    { s: 'box', size: [0.14, 0.24, 0.1], at: [0.18, 0.34, 0.02], rot: [0, 0, -0.25], c: 'accent' },
    { s: 'box', size: [0.08, 0.18, 0.02], at: [0.17, 0.33, -0.04], rot: [0, 0, -0.25], c: '#ff9ebb' },
    { s: 'box', size: [0.24, 0.18, 0.22], at: [0, -0.04, -0.3], c: '#ffffff' },
    { s: 'box', size: [0.08, 0.06, 0.05], at: [0, 0.02, -0.42], c: '#ff70a6' },
    { s: 'box', size: [0.12, 0.14, 0.02], at: [-0.14, 0.08, -0.22], c: 'accent', glow: 'accent', glowI: 0.6 },
    { s: 'box', size: [0.12, 0.14, 0.02], at: [0.14, 0.08, -0.22], c: 'accent', glow: 'accent', glowI: 0.6 },
    { s: 'box', size: [0.04, 0.04, 0.02], at: [-0.13, 0.11, -0.23], c: '#ffffff' },
    { s: 'box', size: [0.04, 0.04, 0.02], at: [0.13, 0.11, -0.23], c: '#ffffff' },
  ],
  catEarsHeadset: [
    // The Weeb Mods: over-ear gaming headset with luminous cat ears on the headband and a boom mic
    { s: 'box', size: [0.46, 0.05, 0.1], at: [0, 0.25, 0], c: '#181820' },
    { s: 'cyl', size: [0.09, 0.09, 0.07, 8], at: [-0.22, 0.02, 0], rot: [0, 0, Math.PI / 2], c: '#181820' },
    { s: 'torus', size: [0.07, 0.015, 4, 8], at: [-0.25, 0.02, 0], rot: [0, Math.PI / 2, 0], c: 'accent', glow: 'accent', glowI: 0.8 },
    { s: 'cyl', size: [0.09, 0.09, 0.07, 8], at: [0.22, 0.02, 0], rot: [0, 0, Math.PI / 2], c: '#181820' },
    { s: 'torus', size: [0.07, 0.015, 4, 8], at: [0.25, 0.02, 0], rot: [0, Math.PI / 2, 0], c: 'accent', glow: 'accent', glowI: 0.8 },
    { s: 'cone', size: [0.08, 0.18, 4], at: [-0.13, 0.35, 0], rot: [0, Math.PI / 4, 0.18], c: 'accent', glow: 'accent', glowI: 0.9 },
    { s: 'cone', size: [0.08, 0.18, 4], at: [0.13, 0.35, 0], rot: [0, Math.PI / 4, -0.18], c: 'accent', glow: 'accent', glowI: 0.9 },
    { s: 'cyl', size: [0.015, 0.015, 0.22, 4], at: [-0.18, -0.06, -0.12], rot: [0.8, -0.4, 0], c: '#111111' },
    { s: 'sphere', size: [0.03, 6, 6], at: [-0.11, -0.13, -0.2], c: 'accent', glow: 'accent', glowI: 1.0 },
  ],
  headscarfBraid: [
    // Tradwives: floral/linen pastoral headscarf tied over a long side braid resting over the shoulder
    { s: 'box', size: [0.44, 0.14, 0.44], at: [0, 0.2, 0.02], c: '#f4ede2' },
    { s: 'box', size: [0.42, 0.32, 0.1], at: [0, -0.02, 0.2], c: '#f4ede2' },
    { s: 'box', size: [0.45, 0.04, 0.12], at: [0, 0.19, -0.15], c: 'accent' },
    { s: 'box', size: [0.1, 0.08, 0.06], at: [0, -0.19, -0.16], c: 'accent' },
    { s: 'cyl', size: [0.05, 0.055, 0.22, 6], at: [0.22, -0.06, 0.06], rot: [0.15, 0, -0.2], c: '#d8aa72' },
    { s: 'cyl', size: [0.045, 0.05, 0.22, 6], at: [0.24, -0.24, -0.02], rot: [0.35, 0, 0.1], c: '#caa066' },
    { s: 'cyl', size: [0.035, 0.045, 0.16, 6], at: [0.22, -0.38, -0.08], rot: [0.2, 0, 0], c: '#caa066' },
    { s: 'box', size: [0.07, 0.04, 0.06], at: [0.22, -0.44, -0.09], c: 'accent' },
  ],
  visorSweatband: [
    // Pickleball Retirees: oversized neon tennis sun visor with terrycloth wrist sweatband and bifocal sunglasses
    { s: 'box', size: [0.43, 0.07, 0.43], at: [0, 0.13, 0], c: '#ffffff' },
    { s: 'box', size: [0.44, 0.04, 0.44], at: [0, 0.16, 0], c: 'accent' },
    { s: 'box', size: [0.44, 0.03, 0.26], at: [0, 0.14, -0.29], rot: [0.18, 0, 0], c: 'accent' },
    { s: 'box', size: [0.38, 0.08, 0.08], at: [0, 0.03, -0.21], c: '#1a1a1a' },
    { s: 'box', size: [0.34, 0.04, 0.02], at: [0, 0.01, -0.24], c: '#ffaa00', glow: '#ffaa00', glowI: 0.4 },
    { s: 'box', size: [0.28, 0.015, 0.02], at: [0, -0.01, -0.245], c: '#ffffff' },
  ],
  default: [{ s: 'box', size: [0.4, 0.08, 0.4], at: [0, 0.2, 0], c: '#3a2a20' }],
};

export const PROPS = {
  brainRot: [{ hand: 'L', s: 'box', size: [0.24, 0.32, 0.03], at: [0, -0.5, -0.12], c: '#222222', glow: '#7ff7ff', glowI: 0.6 }], // the iPad
  cloutStreamers: [{ hand: 'L', s: 'box', size: [0.08, 0.15, 0.02], at: [0, -0.58, -0.1], c: '#111111', glow: '#e8f4ff', glowI: 0.5 }], // phone, always filming
  wokeLibs: [
    { hand: 'L', s: 'cyl', size: [0.015, 0.015, 0.4, 4], at: [0, -0.32, -0.04], c: '#d8c8b0' },
    { hand: 'L', s: 'box', size: [0.1, 0.36, 0.3], at: [-0.04, -0.54, -0.02], c: '#d8c8b0' },
    { hand: 'L', s: 'box', size: [0.02, 0.16, 0.18], at: [-0.1, -0.54, -0.02], c: 'accent' },
  ],
  mlmHuns: [
    { hand: 'L', s: 'cyl', size: [0.07, 0.06, 0.14, 8], at: [0, -0.62, -0.08], c: '#f7cad0' },
    { hand: 'L', s: 'cyl', size: [0.09, 0.08, 0.18, 8], at: [0, -0.48, -0.08], c: '#f7cad0' },
    { hand: 'L', s: 'cyl', size: [0.095, 0.095, 0.03, 8], at: [0, -0.38, -0.08], c: '#ffffff' },
    { hand: 'L', s: 'box', size: [0.03, 0.18, 0.06], at: [0, -0.48, -0.16], c: '#f7cad0' },
    { hand: 'L', s: 'cyl', size: [0.012, 0.012, 0.14, 6], at: [0, -0.3, -0.06], rot: [0.15, 0, 0], c: '#e0f2fe' },
  ],
  pickleballRetirees: [
    { hand: 'L', s: 'cyl', size: [0.09, 0.09, 0.06, 8], at: [0, -0.48, 0], c: 'accent' },
    { hand: 'L', s: 'cyl', size: [0.022, 0.022, 0.16, 6], at: [0, -0.56, -0.04], rot: [Math.PI / 2, 0, 0], c: '#ffffff' },
    { hand: 'L', s: 'box', size: [0.02, 0.26, 0.18], at: [0, -0.56, -0.22], c: '#1f2937' },
    { hand: 'L', s: 'box', size: [0.024, 0.28, 0.02], at: [0, -0.56, -0.31], c: 'accent' },
  ],
  tradwives: [
    { hand: 'L', s: 'box', size: [0.24, 0.14, 0.22], at: [0, -0.58, -0.1], c: '#a27035' },
    { hand: 'L', s: 'torus', size: [0.11, 0.015, 4, 10], at: [0, -0.5, -0.1], c: '#8c5e28' },
    { hand: 'L', s: 'box', size: [0.26, 0.04, 0.24], at: [0, -0.51, -0.1], c: '#ffffff' },
    { hand: 'L', s: 'sphere', size: [0.09, 8, 8], at: [0, -0.48, -0.1], c: '#d49b53' },
  ],
  animeWeebs: [
    { hand: 'L', s: 'cyl', size: [0.025, 0.025, 0.75, 6], at: [0, -0.52, -0.05], rot: [0.3, 0, 0], c: '#332211' },
    { hand: 'L', s: 'box', size: [0.22, 0.24, 0.34], at: [0, -0.84, -0.16], c: '#2b2b36' },
    { hand: 'L', s: 'box', size: [0.24, 0.08, 0.16], at: [0, -0.84, -0.16], c: 'accent', glow: 'accent', glowI: 0.8 },
  ],
  furries: [
    { attach: 'waist', s: 'cyl', size: [0.07, 0.09, 0.2, 6], at: [0, 0.86, 0.22], rot: [-0.6, 0, 0], c: 'accent' },
    { attach: 'waist', s: 'sphere', size: [0.15, 8, 8], at: [0, 0.98, 0.38], c: 'accent' },
    { attach: 'waist', s: 'sphere', size: [0.12, 8, 8], at: [0, 1.14, 0.44], c: '#ffffff' },
  ],
  gymRats: [
    { hand: 'L', s: 'cyl', size: [0.065, 0.055, 0.22, 8], at: [0, -0.54, -0.08], c: '#e2e8f0' },
    { hand: 'L', s: 'cyl', size: [0.07, 0.07, 0.04, 8], at: [0, -0.42, -0.08], c: 'accent' },
    { hand: 'L', s: 'box', size: [0.03, 0.04, 0.03], at: [0, -0.38, -0.06], c: '#1e293b' },
    { hand: 'L', s: 'torus', size: [0.035, 0.012, 4, 8], at: [0, -0.56, -0.08], c: '#94a3b8' },
  ],
  vcBros: [
    { hand: 'L', s: 'box', size: [0.04, 0.32, 0.24], at: [0, -0.52, -0.06], rot: [0, 0, 0.1], c: '#1e293b' },
    { hand: 'L', s: 'box', size: [0.045, 0.08, 0.1], at: [-0.01, -0.52, -0.06], c: 'accent' },
    { hand: 'L', s: 'box', size: [0.015, 0.14, 0.08], at: [-0.025, -0.44, -0.04], c: '#0f172a', glow: '#38bdf8', glowI: 0.5 },
  ],
  hoaDads: [
    { attach: 'headwear', s: 'box', size: [0.28, 0.04, 0.06], at: [0, 0.21, -0.26], c: '#b8860b' },
    { attach: 'headwear', s: 'box', size: [0.1, 0.03, 0.02], at: [-0.08, 0.21, -0.29], c: '#a5f3fc', glow: '#a5f3fc', glowI: 0.4 },
    { attach: 'headwear', s: 'box', size: [0.1, 0.03, 0.02], at: [0.08, 0.21, -0.29], c: '#a5f3fc', glow: '#a5f3fc', glowI: 0.4 },
  ],
  rednecks: [
    { attach: 'headwear', s: 'box', size: [0.34, 0.025, 0.04], at: [0, 0.16, -0.38], c: '#ffd700', glow: '#ffd700', glowI: 0.3 },
    { attach: 'headwear', s: 'box', size: [0.3, 0.03, 0.02], at: [0, 0.19, -0.28], c: '#ffd700' },
  ],
};

export function buildParts(parent, specs, look = {}) {
  for (const p of specs) {
    const color = (p.c === 'accent' || p.c === 'shirt' || p.c === 'pants') ? (look[p.c] || '#ffffff') : (p.c || '#ffffff');
    const g = p.s === 'cyl' ? new THREE.CylinderGeometry(...p.size)
      : p.s === 'torus' ? new THREE.TorusGeometry(...p.size)
      : p.s === 'sphere' ? new THREE.SphereGeometry(...p.size)
      : p.s === 'cone' ? new THREE.ConeGeometry(...p.size)
      : geo(...p.size);
    const emissive = (p.glow === 'accent' || p.glow === 'shirt' || p.glow === 'pants') ? (look[p.glow] || '#ffffff') : p.glow;
    const matOpts = { color };
    if (emissive) {
      matOpts.emissive = emissive;
      matOpts.emissiveIntensity = p.glowI ?? 0.6;
    }
    if (p.opacity !== undefined) {
      matOpts.transparent = true;
      matOpts.opacity = p.opacity;
    }
    const m = new THREE.Mesh(g, mat(matOpts));
    m.position.set(...p.at);
    if (p.rot) m.rotation.set(...p.rot);
    m.castShadow = true;
    parent.add(m);
  }
}

export class CharacterView {
  constructor({ faction, look, seed, team, isLocalTeam }) {
    this.faction = faction;
    this.team = team;
    const skin = SKINS[Math.abs(hashStr(seed)) % SKINS.length];
    const skinM = mat({ color: skin });
    const shirtM = mat({ map: shirtTex(look, seed) });
    const pantsM = mat({ map: pantsTex(look) });
    const faceM = mat({ map: faceTex(faction, skin) });
    const shoeM = mat({ color: faction === 'hoaDads' ? '#ffffff' : '#2a2a2a' });

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.legs = [-1, 1].map(s => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13, 0.8, 0);
      const leg = part(0.2, 0.72, 0.24, pantsM, -0.38);
      const shoe = part(0.22, 0.1, 0.3, shoeM, -0.75); shoe.position.z = -0.03;
      hip.add(leg, shoe);
      this.body.add(hip);
      return hip;
    });
    this.torso = part(0.56, 0.62, 0.3, shirtM, 1.1);
    this.body.add(this.torso);
    this.head = new THREE.Group();
    this.head.position.y = 1.62;
    const headMats = [skinM, skinM, skinM, skinM, skinM, faceM];
    const headMesh = new THREE.Mesh(geo(0.38, 0.4, 0.38), headMats);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.headwear = new THREE.Group();
    this.headwear.name = 'headwear';
    buildParts(this.headwear, HEADWEAR[look.hat] || HEADWEAR.default, look);
    this.head.add(this.headwear);
    this.body.add(this.head);

    this.arms = [-1, 1].map(s => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.37, 1.36, 0);
      sh.add(part(0.16, 0.56, 0.18, shirtM, -0.24));
      const hand = part(0.15, 0.13, 0.15, skinM, -0.56);
      sh.add(hand);
      this.body.add(sh);
      return sh;
    });

    // Toy blaster: orange tip so nobody confuses it with a real gun
    this.gun = new THREE.Group();
    this.gun.add(part(0.1, 0.14, 0.55, mat({ color: shade(look.accent, -0.2) })));
    const tip = part(0.11, 0.11, 0.08, mat({ color: '#ff6c24' })); tip.position.z = -0.3; this.gun.add(tip);
    const grip = part(0.07, 0.15, 0.08, mat({ color: '#333' }), -0.12); grip.position.z = 0.12; this.gun.add(grip);
    this.gun.rotation.x = -Math.PI / 2; // barrel (-z) along the arm (-y)
    this.gun.position.set(0, -0.66, 0.02);
    this.arms[1].add(this.gun);

    for (const p of PROPS[faction] || []) {
      const target = (p.attach === 'head' || p.attach === 'headwear') ? this.headwear
        : (p.attach === 'body' || p.attach === 'waist') ? this.body
        : (p.attach === 'torso') ? this.torso
        : this.arms[p.hand === 'R' ? 1 : 0];
      buildParts(target, [p], look);
    }

    // Shadows only from the big silhouette parts (torso, legs, head). Hands, shoes, hats, props and
    // gun pieces add a shadow draw each but are invisible in a 1-2k shadow map. ~16 -> 4 casters.
    const casters = new Set([this.torso, headMesh, ...this.legs.map(h => h.children[0])]);
    this.body.traverse(o => { if (o.isMesh) o.castShadow = casters.has(o); });

    // Team marker for friendlies; enemies get a red one only when snitched
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: isLocalTeam ? '#29adff' : '#ff004d', depthTest: !isLocalTeam ? false : true }));
    this.marker.position.y = 2.15;
    this.marker.renderOrder = 10;
    this.marker.visible = isLocalTeam;
    this.isLocalTeam = isLocalTeam;
    this.root.add(this.marker);

    this.phase = 0;
    this.recoil = 0;
    this.meleeT = 1;
  }

  /** snap = sim snapshot entry */
  update(snap, dt, { revealed = false, firing = false, meleeAgo = 9, hitAgo, hitDir } = {}) {
    const s = snap;
    this.root.visible = s.alive;
    if (!s.alive) return;
    if (this.headwear && this.headwear.parent !== this.head) {
      this.head.add(this.headwear);
    }
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.yaw;
    const sp = Math.min(s.speed / 7, 1);
    this.phase += dt * (4 + s.speed * 1.6);
    const swing = Math.sin(this.phase) * 0.8 * sp;
    if (s.onGround) {
      this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * sp;
    } else {
      this.legs[0].rotation.x = 0.6; this.legs[1].rotation.x = -0.3;
    }
    if (firing) this.recoil = 1;
    this.recoil = Math.max(0, this.recoil - dt * 10);
    const aim = Math.PI / 2 + s.pitch * 0.9;
    this.arms[1].rotation.x = aim + this.recoil * 0.12;
    this.arms[0].rotation.x = aim - 0.15;
    this.arms[0].rotation.z = -0.35;
    this.arms[0].position.z = -0.05;
    this.head.rotation.x = s.pitch * 0.5;
    if (meleeAgo < 0.35) {
      const k = Math.sin((meleeAgo / 0.35) * Math.PI);
      this.arms[0].rotation.x = aim + k * 1.2;
      this.arms[0].rotation.z = -0.35 - k * 0.6;
    }

    // Procedural Bullet Flinch / Stagger
    const hAgo = hitAgo !== undefined ? hitAgo : (s.hitAgo !== undefined ? s.hitAgo : Infinity);
    const hDir = hitDir || s.hitDir;
    if (hAgo < 0.25) {
      const k = 1 - (hAgo / 0.25);
      const ease = Math.sin(k * Math.PI * 0.5);
      const yaw = s.yaw || 0;
      const hx = hDir?.x ?? 0;
      const hz = hDir?.z ?? 0;
      // Local X: positive means hit impulse is moving towards character's right
      const localX = hx * Math.cos(yaw) - hz * Math.sin(yaw);
      const twistSign = Math.abs(localX) > 0.05 ? Math.sign(localX) : 1;
      this.torso.rotation.x = 0.12 * ease; // leaning back slightly
      this.torso.rotation.y = -twistSign * 0.12 * ease; // twist torso slightly away from hit direction
      this.torso.rotation.z = -twistSign * 0.04 * ease;
    } else {
      this.torso.rotation.set(0, 0, 0);
    }

    this.marker.visible = this.isLocalTeam || revealed;
    this.marker.rotation.y += dt * 3;
  }

  /** Split into independent boxes and fling them. Returns a Ragdoll that owns the pieces. */
  ragdoll(scene, dir, { headshot = false, explosive = false } = {}) {
    const impulse = dir || { x: 0, y: 0, z: 0 };
    this.root.updateMatrixWorld(true);
    const pieces = [];
    const take = (obj, mass = 1) => {
      const g = new THREE.Group();
      obj.matrixWorld.decompose(g.position, g.quaternion, g.scale);
      const clone = obj.clone(true);
      clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.set(1, 1, 1);
      g.add(clone);
      scene.add(g);
      const power = explosive ? 9 : 4;
      const up = explosive ? 5 : 2;
      pieces.push({
        obj: g,
        v: new THREE.Vector3(impulse.x * power * mass + (Math.random() - 0.5) * 2, up * mass + Math.random() * 2, impulse.z * power * mass + (Math.random() - 0.5) * 2),
        w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        half: 0.12,
      });
    };

    if (headshot && this.headwear && this.headwear.children.length > 0) {
      const g = new THREE.Group();
      this.headwear.matrixWorld.decompose(g.position, g.quaternion, g.scale);
      const clone = this.headwear.clone(true);
      clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.set(1, 1, 1);
      g.add(clone);
      scene.add(g);
      const dx = (dir && dir.x) || 0;
      const dz = (dir && dir.z) || 0;
      pieces.push({
        obj: g,
        v: new THREE.Vector3(
          dx * 2.5 + (Math.random() - 0.5) * 1.5,
          4.5 + Math.random() * 2,
          dz * 2.5 + (Math.random() - 0.5) * 1.5
        ),
        w: new THREE.Vector3(
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 16
        ),
        half: 0.08,
        isHat: true,
      });
      this.head.remove(this.headwear);
    }

    take(this.torso, 1);
    take(this.head, headshot ? 2.2 : 1.2);
    this.legs.forEach(l => take(l, 0.9));
    this.arms.forEach(a => take(a, 1.1));
    this.root.visible = false;
    return new Ragdoll(scene, pieces);
  }
}

export class Ragdoll {
  constructor(scene, pieces) { this.scene = scene; this.pieces = pieces; this.age = 0; }
  update(dt) {
    this.age += dt;
    for (const p of this.pieces) {
      p.v.y -= 20 * dt;
      p.obj.position.addScaledVector(p.v, dt);
      if (p.obj.position.y < p.half) {
        p.obj.position.y = p.half;
        p.v.y = Math.abs(p.v.y) > 2 ? -p.v.y * 0.35 : 0;
        p.v.x *= 0.7; p.v.z *= 0.7; p.w.multiplyScalar(0.6);
      }
      p.obj.rotation.x += p.w.x * dt; p.obj.rotation.y += p.w.y * dt; p.obj.rotation.z += p.w.z * dt;
      if (this.age > 5) p.obj.position.y -= dt * 0.4; // sink away
    }
    if (this.age > 6.5) { this.dispose(); return false; }
    return true;
  }
  dispose() { for (const p of this.pieces) this.scene.remove(p.obj); this.pieces = []; }
}

function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
