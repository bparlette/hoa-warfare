// three.js presentation layer: Cul-de-Sac scene, characters, FX, first-person viewmodel, killcam
// camera, and the hybrid-retro post pass (low-res render target -> 32-colour palette + Bayer dither,
// point-filtered upscale). Toggle `retro` off to preview the clean look the Roblox build gets.
import * as THREE from '../../vendor/three.module.min.js';
import { T, shade } from './textures.js';
import { CharacterView } from './character.js';
import { BODY, forwardOf } from './sim.js';

THREE.ColorManagement.enabled = false;

// PICO-8 + its "secret" palette: 32 bright, warm colours that read as suburban 16-bit
export const PALETTE = [
  '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
  '#291814', '#111d35', '#422136', '#125359', '#742f29', '#49333b', '#a28879', '#f3ef7d',
  '#be1250', '#ff6c24', '#a8e72e', '#00b543', '#065ab5', '#754665', '#ff6e59', '#ff9d81',
];

const RETRO_FRAG = `
uniform sampler2D tDiffuse;
uniform vec3 palette[32];
uniform vec2 lowRes;
uniform float dither;
varying vec2 vUv;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 cell = floor(vUv * lowRes);
  vec3 c = texture2D(tDiffuse, (cell + 0.5) / lowRes).rgb;
  c += (bayer4(cell) - 0.5) * dither;
  vec3 best = palette[0];
  float bd = 1e9;
  for (int i = 0; i < 32; i++) {
    vec3 d = c - palette[i];
    float e = dot(d * d, vec3(2.0, 4.0, 3.0));
    if (e < bd) { bd = e; best = palette[i]; }
  }
  gl_FragColor = vec4(best, 1.0);
}`;
const PASS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class Renderer {
  constructor(canvas, { map, factions }) {
    this.canvas = canvas;
    this.map = map;
    this.factions = factions;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.BasicShadowMap;
    this.retro = true;
    this.lowHeight = 216;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#5ec4ff');
    this.scene.fog = new THREE.Fog('#a8dcff', 55, 130);
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 400);
    this.scene.add(this.camera);

    this.muzzleLight = new THREE.PointLight('#ffec27', 0, 15);
    this.camera.add(this.muzzleLight);

    this.rt = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        palette: { value: PALETTE.map(h => new THREE.Color(h)) },
        lowRes: { value: new THREE.Vector2(16, 16) },
        dither: { value: 0.09 },
      },
      vertexShader: PASS_VERT, fragmentShader: RETRO_FRAG, depthTest: false, depthWrite: false,
    }));
    this.postScene = new THREE.Scene();
    this.postScene.add(this.post);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.characters = new Map();
    this.ragdolls = [];
    this.fx = [];
    this.casings = [];
    this.camRecoil = 0;
    this.buildLights();
    this.buildWorld();
    this.buildViewmodel();
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setPixelRatio(this.retro ? 1 : Math.min(window.devicePixelRatio, 2));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const lh = this.lowHeight, lw = Math.round(lh * w / h);
    this.rt.setSize(lw, lh);
    this.post.material.uniforms.lowRes.value.set(lw, lh);
  }

  setRetro(on) { this.retro = on; this.resize(); }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#dff4ff', '#6a8d4a', 1.8));
    const sun = new THREE.DirectionalLight('#fff3d6', 2.1);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 140;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
  }

  buildWorld() {
    const S = this.scene, map = this.map;
    const add = (m, { cast = true, receive = true } = {}) => { m.castShadow = cast; m.receiveShadow = receive; S.add(m); return m; };
    const lam = (o) => new THREE.MeshLambertMaterial(o);
    const { minX, maxX, minZ, maxZ } = map.bounds;

    const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(240, 240), lam({ map: T.grass([60, 60]) })), { cast: false });
    ground.rotation.x = -Math.PI / 2;
    // Beyond the fence: more suburb (cheap flat-coloured houses so the horizon isn't empty)
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = 75 + (i % 3) * 9;
      const h = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 10), lam({ color: shade(['#e8d9b5', '#b9d4e8', '#f0c9b8', '#d7e3c3'][i % 4], -0.05) }));
      h.position.set(Math.cos(a) * r, 3, Math.sin(a) * r); h.rotation.y = -a; S.add(h);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(8.5, 3, 4), lam({ color: '#7e4a3a' }));
      roof.position.set(h.position.x, 7.5, h.position.z); roof.rotation.y = -a + Math.PI / 4; S.add(roof);
    }

    const court = add(new THREE.Mesh(new THREE.CircleGeometry(map.court.r, 20), lam({ map: T.asphalt([6, 6]) })), { cast: false });
    court.rotation.x = -Math.PI / 2; court.position.y = 0.02;
    const curb = add(new THREE.Mesh(new THREE.RingGeometry(map.court.r, map.court.r + 1.6, 20), lam({ map: T.concrete([8, 1]) })), { cast: false });
    curb.rotation.x = -Math.PI / 2; curb.position.y = 0.025;
    const st = map.street;
    const street = add(new THREE.Mesh(new THREE.PlaneGeometry(st.maxX - st.minX, st.maxZ - st.minZ), lam({ map: T.asphalt([2, 9]) })), { cast: false });
    street.rotation.x = -Math.PI / 2; street.position.set(0, 0.021, (st.minZ + st.maxZ) / 2);
    for (let z = 16; z < 48; z += 4) {
      const dash = add(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.6), lam({ color: '#e8c547' })), { cast: false });
      dash.rotation.x = -Math.PI / 2; dash.position.set(0, 0.03, z);
    }
    for (const sx of [-1, 1]) {
      const walk = add(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 34), lam({ map: T.concrete([1, 17]) })), { cast: false });
      walk.rotation.x = -Math.PI / 2; walk.position.set(sx * 6, 0.022, 31);
    }

    for (const b of map.boxes) this.buildBox(b, lam, add);
    for (const [x, z] of map.trees) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), lam({ map: T.leaves(['#3f8f3a', '#5aa03c', '#2f7a35'][Math.abs(Math.round(x + z)) % 3]), flatShading: true }));
      c.position.set(x, 4.6, z);
      add(c);
    }
  }

  buildBox(b, lam, add) {
    const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, cz = (b.minZ + b.maxZ) / 2;
    const box = (material, ww = w, hh = h, dd = d, y = cy, x = cx, z = cz) => {
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), material));
      m.position.set(x, y, z);
      return m;
    };
    switch (b.kind) {
      case 'house': {
        box(lam({ map: T.siding(b.color, [Math.max(w, d) / 3, h / 3]) }));
        // gable roof: ridge along the long side
        const along = w >= d ? 'x' : 'z';
        const span = along === 'x' ? d : w, len = (along === 'x' ? w : d) + 0.8;
        const shape = new THREE.Shape([new THREE.Vector2(-span / 2 - 0.5, 0), new THREE.Vector2(span / 2 + 0.5, 0), new THREE.Vector2(0, 2.6)]);
        const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
        g.translate(0, 0, -len / 2);
        const roof = add(new THREE.Mesh(g, lam({ map: T.roof(['#7e4a3a', '#4a5a7e', '#5a5a5a', '#8a3a3a', '#3a5a4a', '#6a5a3a'][b.id % 6], [0.3, 0.3]), flatShading: true })));
        roof.position.set(cx, b.maxY, cz);
        if (along === 'x') roof.rotation.y = Math.PI / 2;
        // facade on the face side: door, garage, windows
        const n = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
        const faceW = n[0] ? d : w;
        const fx = cx + n[0] * (w / 2 + 0.03), fz = cz + n[1] * (d / 2 + 0.03);
        const tang = n[0] ? [0, 1] : [1, 0];
        const plate = (tex, pw, ph, off, y) => {
          const m = add(new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), lam({ map: tex })), { cast: false });
          m.position.set(fx + tang[0] * off, y, fz + tang[1] * off);
          m.rotation.y = Math.atan2(n[0], n[1]);
        };
        plate(T.garage(), 3.4, 2.4, -faceW / 2 + 2.3, 1.2);
        plate(T.door(['#a8323a', '#2b3f66', '#3a5a4a'][b.id % 3]), 1.1, 2.1, 0.8, 1.05);
        plate(T.window(), 1.3, 1.3, faceW / 2 - 1.8, 1.7);
        plate(T.window(), 1.3, 1.3, -faceW / 2 + 1.6, 3.8);
        plate(T.window(), 1.3, 1.3, faceW / 2 - 1.8, 3.8);
        // driveway toward the court
        const dw = add(new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5), lam({ map: T.concrete([2, 3]) })), { cast: false });
        dw.rotation.x = -Math.PI / 2;
        dw.rotation.z = Math.atan2(n[0], n[1]);
        dw.position.set(fx + tang[0] * (-faceW / 2 + 2.3) + n[0] * 2.5, 0.015, fz + tang[1] * (-faceW / 2 + 2.3) + n[1] * 2.5);
        break;
      }
      case 'wall': box(lam({ map: T.privacy([Math.max(w, d) / 2, 1]) })); break;
      case 'fence': box(lam({ map: T.picket([Math.max(w, d) / 0.8, 1]) })); break;
      case 'hedge': box(lam({ map: T.hedge([Math.max(w, d) / 2, 1]) })); break;
      case 'car': {
        const c = b.color, long = d > w;
        box(lam({ map: T.car(c) }), w, 0.8, d, 0.55);
        box(lam({ color: shade(c, -0.1) }), long ? w * 0.9 : w * 0.55, 0.6, long ? d * 0.55 : d * 0.9, 1.2);
        box(lam({ color: '#9fd0ef' }), long ? w * 0.92 : w * 0.4, 0.4, long ? d * 0.4 : d * 0.92, 1.2);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const ox = long ? sx * w / 2 : sx * (w / 2 - 0.7), oz = long ? sz * (d / 2 - 0.7) : sz * d / 2;
          box(lam({ color: '#1b1b1b' }), long ? 0.25 : 0.6, 0.6, long ? 0.6 : 0.25, 0.3, cx + ox, cz + oz);
        }
        break;
      }
      case 'trampoline': {
        const top = add(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.08, 12), lam({ color: '#1b1b1b' })));
        top.position.set(cx, b.maxY, cz);
        const rim = add(new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.1, 4, 12), lam({ color: '#29adff' })));
        rim.rotation.x = Math.PI / 2; rim.position.set(cx, b.maxY, cz);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          box(lam({ color: '#c2c3c7' }), 0.08, h, 0.08, h / 2, cx + Math.cos(a) * w * 0.45, cz + Math.sin(a) * w * 0.45);
        }
        break;
      }
      case 'trash': {
        const m = add(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2 * 0.9, h, 8), lam({ color: '#2f6b3a' })));
        m.position.set(cx, cy, cz);
        break;
      }
      case 'mailbox':
        box(lam({ color: '#6b4a2e' }), 0.12, h, 0.12);
        box(lam({ color: '#1d2b53' }), 0.3, 0.3, 0.5, b.maxY);
        break;
      case 'post': box(lam({ color: '#f6f4ee' })); break;
      case 'gazeboRoof': {
        const r = add(new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 1.6, 4), lam({ map: T.roof('#4a7e5a', [0.3, 0.3]), flatShading: true })));
        r.position.set(cx, b.maxY + 0.6, cz); r.rotation.y = Math.PI / 4;
        box(lam({ color: '#f6f4ee' }));
        break;
      }
      case 'tree': box(lam({ map: T.bark() })); break;
      default: box(lam({ color: '#ff00ff' }));
    }
  }

  buildViewmodel() {
    const vm = new THREE.Group();
    const lam = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || '#000', emissiveIntensity: e ? 0.4 : 0 });
    this.vmMeshes = {};

    // 1. Blaster / AR (The Allowance)
    const blaster = new THREE.Group();
    const bBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.5), lam('#29adff'));
    const bTop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), lam('#ffec27'));
    bTop.position.set(0, 0.08, 0.02);
    const bTip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), lam('#ff6c24', '#ff6c24'));
    bTip.position.z = -0.27;
    const bGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), lam('#1d2b53'));
    bGrip.position.set(0, -0.1, 0.13); bGrip.rotation.x = 0.3;
    const bDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), lam('#ff77a8'));
    bDrum.rotation.z = Math.PI / 2; bDrum.position.set(0, -0.02, -0.08);
    blaster.add(bBody, bTop, bTip, bGrip, bDrum);
    this.vmMeshes.blaster = blaster;

    // 2. SMG (The Side Hustle)
    const smg = new THREE.Group();
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), lam('#008751'));
    const sMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06), lam('#ab5236'));
    sMag.position.set(0, -0.11, -0.04); sMag.rotation.x = 0.2;
    const sGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), lam('#1d2b53'));
    sGrip.position.set(0, -0.09, 0.11); sGrip.rotation.x = 0.35;
    const sComp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), lam('#00e436', '#00e436'));
    sComp.rotation.x = Math.PI / 2; sComp.position.z = -0.2;
    smg.add(sBody, sMag, sGrip, sComp);
    smg.visible = false;
    this.vmMeshes.smg = smg;

    // 3. Shotgun (The Divorce Settlement)
    const shotgun = new THREE.Group();
    const shBarL = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.52, 8), lam('#5f574f'));
    shBarL.rotation.x = Math.PI / 2; shBarL.position.set(-0.035, 0.03, -0.12);
    const shBarR = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.52, 8), lam('#5f574f'));
    shBarR.rotation.x = Math.PI / 2; shBarR.position.set(0.035, 0.03, -0.12);
    const shPump = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), lam('#8a4820'));
    shPump.position.set(0, -0.02, -0.12);
    const shStock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.26), lam('#8a4820'));
    shStock.position.set(0, -0.06, 0.18); shStock.rotation.x = -0.15;
    shotgun.add(shBarL, shBarR, shPump, shStock);
    shotgun.visible = false;
    this.vmMeshes.shotgun = shotgun;

    // 4. Sniper (The Trust Fund)
    const sniper = new THREE.Group();
    const snBar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.75, 8), lam('#1d2b53'));
    snBar.rotation.x = Math.PI / 2; snBar.position.set(0, 0.02, -0.22);
    const snScope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 10), lam('#29adff', '#1d2b53'));
    snScope.rotation.x = Math.PI / 2; snScope.position.set(0, 0.1, 0.02);
    const snBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.38), lam('#e8c547'));
    snBody.position.set(0, 0, 0.08);
    const snGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), lam('#1d2b53'));
    snGrip.position.set(0, -0.1, 0.14); snGrip.rotation.x = 0.3;
    sniper.add(snBar, snScope, snBody, snGrip);
    sniper.visible = false;
    this.vmMeshes.sniper = sniper;

    // 5. LMG (The Subdivision)
    const lmg = new THREE.Group();
    const lBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55), lam('#4a7e5a'));
    const lDrum = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), lam('#2f6b3a'));
    lDrum.position.set(0, -0.14, 0.02);
    const lBar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), lam('#373737'));
    lBar.rotation.x = Math.PI / 2; lBar.position.set(0, 0.02, -0.32);
    const lGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.07), lam('#1d2b53'));
    lGrip.position.set(0, -0.09, 0.2); lGrip.rotation.x = 0.25;
    lmg.add(lBody, lDrum, lBar, lGrip);
    lmg.visible = false;
    this.vmMeshes.lmg = lmg;

    // 6. Pistol (The Building Permit)
    const pistol = new THREE.Group();
    const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.24), lam('#c2c3c7'));
    pSlide.position.set(0, 0.04, -0.04);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), lam('#292831'));
    pGrip.position.set(0, -0.06, 0.05); pGrip.rotation.x = 0.32;
    pistol.add(pSlide, pGrip);
    pistol.visible = false;
    this.vmMeshes.pistol = pistol;

    vm.add(blaster, smg, shotgun, sniper, lmg, pistol);

    // The Participation Trophy (melee)
    this.trophy = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.12, 8), lam('#e8c547', '#806010'));
    cup.position.y = 0.16;
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), lam('#e8c547'));
    stem.position.y = 0.05;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), lam('#5f574f'));
    this.trophy.add(cup, stem, base);
    this.trophy.position.set(-0.28, -0.35, -0.45);
    this.trophy.visible = false;
    this.camera.add(this.trophy);
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: '#ffec27' }));
    this.flash.position.z = -0.33;
    this.flash.visible = false;
    vm.add(this.flash);
    vm.position.set(0.2, -0.19, -0.55);
    vm.scale.setScalar(0.5);
    this.vmBase = vm.position.clone();
    this.viewmodel = vm;
    this.camera.add(vm);
    this.currentVmType = 'blaster';
    this.bob = 0;
    this.kick = 0;
  }

  setWeapon(viewmodelName) {
    const target = this.vmMeshes[viewmodelName] || this.vmMeshes.blaster;
    for (const [k, m] of Object.entries(this.vmMeshes)) {
      m.visible = (m === target);
    }
  }

  ensureCharacter(actor, localTeam) {
    let c = this.characters.get(actor.id);
    if (!c) {
      const f = this.factions[actor.faction];
      c = new CharacterView({ faction: actor.faction, look: f.look, seed: actor.name, team: actor.team, isLocalTeam: actor.team === localTeam });
      this.characters.set(actor.id, c);
      this.scene.add(c.root);
    }
    return c;
  }

  /** Apply a snapshot (live or killcam) to character views. */
  applySnapshot(snap, dt, { hideId = null, sim = null, now = 0 } = {}) {
    for (const s of snap) {
      const c = this.characters.get(s.id);
      if (!c) continue;
      const a = sim?.byId.get(s.id);
      c.update(s, dt, { firing: s.firing, revealed: a ? a.revealedUntil > now : false, meleeAgo: a ? now - a.meleeAt : 9 });
      if (s.id === hideId) c.root.visible = false;
    }
  }

  spawnRagdoll(id, ev) {
    const c = this.characters.get(id);
    if (!c || !c.root.visible) return;
    const d = ev.dir || { x: 0, z: 0 };
    this.ragdolls.push(c.ragdoll(this.scene, d, { headshot: ev.headshot, explosive: ev.explosive }));
    this.splat(ev.victimPos, this.factions[this.characters.get(ev.killerId)?.faction]?.look.accent || '#ff004d', 1.1);
  }

  // ---------------------------------------------------------------- FX

  tracer(from, to, color = '#ffec27') {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y - 0.12, from.z), new THREE.Vector3(to.x, to.y, to.z)]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true }));
    this.scene.add(l);
    this.fx.push({ obj: l, life: 0.07, max: 0.07 });
  }

  splat(p, color, size = 0.25) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(size, 6), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6;
    m.position.set(p.x, Math.max(0.04, p.y < 0.2 ? 0.04 : p.y), p.z);
    this.scene.add(m);
    this.fx.push({ obj: m, life: 8, max: 8, fade: 2 });
  }

  impact(p, color) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color }));
    m.position.set(p.x, p.y, p.z);
    this.scene.add(m);
    this.fx.push({ obj: m, life: 0.25, max: 0.25, grow: 2 });
    if (p.y < 0.1) this.splat(p, color, 0.18);
  }

  explosion(p) {
    for (const [c, s, life] of [['#ffec27', 1, 0.35], ['#ff6c24', 2.6, 0.5], ['#fff1e8', 4.5, 0.25]]) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true }));
      m.position.set(p.x, p.y + 0.3, p.z);
      this.scene.add(m);
      this.fx.push({ obj: m, life, max: life, grow: s * 5 });
    }
    this.splat(p, '#ff77a8', 2.2);
  }

  /** Draw mode objects (receipts, flags, zones...) by kind. Add a builder to OBJECT_VIEWS for new kinds. */
  updateObjects(objects, localTeam) {
    this.objectMeshes ??= new Map();
    const live = new Set();
    for (const o of objects) {
      live.add(o.id);
      let m = this.objectMeshes.get(o.id);
      if (!m) {
        const build = OBJECT_VIEWS[o.kind];
        if (!build) continue;
        m = build(o, localTeam);
        this.scene.add(m);
        this.objectMeshes.set(o.id, m);
      }
      m.position.set(o.pos.x, o.pos.y, o.pos.z);
      m.userData.update?.(m, o, performance.now() / 1000);
    }
    for (const [id, m] of this.objectMeshes) if (!live.has(id)) { this.scene.remove(m); this.objectMeshes.delete(id); }
  }

  updateGrenades(grenades) {
    this.grenadeMeshes ??= [];
    while (this.grenadeMeshes.length < grenades.length) {
      const g = new THREE.Group();
      const brief = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.1), new THREE.MeshLambertMaterial({ color: '#5a3a22' }));
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), new THREE.MeshLambertMaterial({ color: '#e8c547' }));
      handle.position.y = 0.15;
      g.add(brief, handle);
      this.scene.add(g);
      this.grenadeMeshes.push(g);
    }
    this.grenadeMeshes.forEach((m, i) => {
      const g = grenades[i];
      m.visible = !!g;
      if (g) { m.position.set(g.pos.x, g.pos.y, g.pos.z); m.rotation.x += 0.3; m.rotation.y += 0.2; }
    });
  }

  spawnCasing() {
    this.casings ??= [];
    const geo = new THREE.BoxGeometry(0.015, 0.035, 0.015);
    const mat = new THREE.MeshLambertMaterial({ color: '#c49a45', transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    // Viewmodel ejection port in camera space
    const spawnPos = new THREE.Vector3(0.18, -0.15, -0.35);
    spawnPos.applyEuler(this.camera.rotation);
    spawnPos.add(this.camera.position);
    mesh.position.copy(spawnPos);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    // Eject to the right (+x), slightly up (+y), backward (+z) in camera space
    const ejectVel = new THREE.Vector3(
      1.8 + Math.random() * 0.8,
      1.2 + Math.random() * 0.5,
      0.8 + Math.random() * 0.5
    );
    ejectVel.applyEuler(this.camera.rotation);

    const rotVel = new THREE.Vector3(
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 25
    );

    this.scene.add(mesh);
    this.casings.push({
      mesh,
      vel: ejectVel,
      rotVel,
      life: 1.5,
      max: 1.5,
    });
  }

  updateCasings(dt) {
    if (!this.casings) this.casings = [];
    this.casings = this.casings.filter(c => {
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        return false;
      }
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);

      if (c.mesh.position.y <= 0.02) {
        c.mesh.position.y = 0.02;
        c.vel.y = -c.vel.y * 0.35;
        c.vel.x *= 0.65;
        c.vel.z *= 0.65;
        c.rotVel.multiplyScalar(0.65);
        if (Math.abs(c.vel.y) < 0.1) {
          c.vel.set(0, 0, 0);
          c.rotVel.set(0, 0, 0);
        }
      }

      c.mesh.rotation.x += c.rotVel.x * dt;
      c.mesh.rotation.y += c.rotVel.y * dt;
      c.mesh.rotation.z += c.rotVel.z * dt;

      if (c.life < 0.5) {
        c.mesh.material.opacity = Math.max(0, c.life / 0.5);
      }
      return true;
    });
  }

  updateFx(dt) {
    this.fx = this.fx.filter(f => {
      f.life -= dt;
      if (f.life <= 0) { this.scene.remove(f.obj); f.obj.geometry.dispose(); f.obj.material.dispose(); return false; }
      const k = f.life / f.max;
      if (f.grow) f.obj.scale.setScalar(1 + (1 - k) * f.grow);
      if (f.fade) f.obj.material.opacity = Math.min(1, f.life / f.fade);
      else if (f.obj.material.transparent) f.obj.material.opacity = k;
      return true;
    });
    this.ragdolls = this.ragdolls.filter(r => r.update(dt));
    this.updateCasings(dt);
  }

  // ---------------------------------------------------------------- cameras

  firstPerson(a, dt, { moving, firing, reloading, meleeAgo, alive, shotFired }) {
    const activeW = a.weapons?.[a.activeSlot || 'primary'] || a.weapons?.primary;
    const interval = activeW?.intervalSec || 0.1;
    let isNewShot = false;
    if (shotFired !== undefined) {
      isNewShot = shotFired;
    } else if (firing) {
      this.shotTimer = (this.shotTimer || 0) - dt;
      if (!this.wasFiring || this.shotTimer <= 0) {
        isNewShot = true;
        this.shotTimer = interval;
      }
    }
    this.wasFiring = !!firing;

    if (isNewShot) {
      this.camRecoil = Math.min(0.04, (this.camRecoil || 0) + 0.016);
      this.spawnCasing();
    }
    this.camRecoil = Math.max(0, (this.camRecoil || 0) - dt * 0.22);

    this.camera.position.set(a.pos.x, a.pos.y + BODY.eye, a.pos.z);
    this.camera.rotation.set(a.pitch + this.camRecoil, a.yaw, 0, 'YXZ');
    this.viewmodel.visible = alive;
    const vmType = activeW?.viewmodel || 'blaster';
    if (this.currentVmType !== vmType) {
      this.currentVmType = vmType;
      this.setWeapon(vmType);
    }
    this.bob += dt * (moving ? 9 : 2);
    if (firing) {
      if (this.muzzleLight) this.muzzleLight.intensity = 3.5;
      this.kick = 1;
      this.flash.visible = Math.random() < 0.7;
    } else {
      this.flash.visible = false;
    }
    if (this.muzzleLight) {
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 25);
    }
    this.kick = Math.max(0, this.kick - dt * 12);
    const vm = this.viewmodel;
    const amp = moving ? 0.018 : 0.004;
    vm.position.set(this.vmBase.x + Math.cos(this.bob) * amp, this.vmBase.y + Math.abs(Math.sin(this.bob)) * amp - (reloading ? 0.18 : 0), this.vmBase.z + this.kick * 0.05);
    vm.rotation.set(this.kick * 0.12 + (reloading ? -0.6 : 0), 0, reloading ? 0.5 : 0);
    const swinging = meleeAgo < 0.35;
    this.trophy.visible = swinging;
    if (swinging) {
      const k = Math.sin((meleeAgo / 0.35) * Math.PI);
      this.trophy.position.set(-0.28 + k * 0.3, -0.35 + k * 0.15, -0.45 - k * 0.2);
      this.trophy.rotation.set(-k * 1.2, 0, k * 0.6);
    }
  }

  /** Over-the-shoulder camera behind `from`, looking at `at` (killcam / spectator). */
  chase(from, at, dist = 3.2) {
    if (this.muzzleLight) this.muzzleLight.intensity = 0;
    const dx = at.x - from.x, dz = at.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const back = { x: -dx / d, z: -dz / d };
    this.camera.position.set(from.x + back.x * dist + back.z * 0.8, from.y + 2.4, from.z + back.z * dist - back.x * 0.8);
    this.camera.lookAt(at.x, at.y + 1.1, at.z);
    this.viewmodel.visible = false;
    this.trophy.visible = false;
  }

  orbit(t) {
    if (this.muzzleLight) this.muzzleLight.intensity = 0;
    const r = 38;
    this.camera.position.set(Math.cos(t * 0.08) * r, 22, Math.sin(t * 0.08) * r);
    this.camera.lookAt(0, 0, 0);
    this.viewmodel.visible = false;
  }

  render() {
    if (this.retro) {
      this.gl.setRenderTarget(this.rt);
      this.gl.render(this.scene, this.camera);
      this.gl.setRenderTarget(null);
      this.gl.render(this.postScene, this.postCam);
    } else {
      this.gl.setRenderTarget(null);
      this.gl.render(this.scene, this.camera);
    }
  }

  /** World -> CSS pixel position (for speech bubbles / hit markers). null if behind camera. */
  toScreen(p, yOff = 0) {
    const v = new THREE.Vector3(p.x, p.y + yOff, p.z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * this.canvas.clientWidth, y: (1 - v.y) / 2 * this.canvas.clientHeight };
  }
}

export { forwardOf };

// Mode object views, keyed by object.kind (see modes.js). Each returns an Object3D; optional
// userData.update(mesh, object, timeSec) animates it.
export const OBJECT_VIEWS = {
  receipt(o, localTeam) {
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.02), new THREE.MeshBasicMaterial({ map: T.receipt() }));
    paper.position.y = 0.7;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 12), new THREE.MeshBasicMaterial({ color: o.team === localTeam ? '#29adff' : '#ff004d', side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    g.add(paper, ring);
    g.userData.update = (m, obj, t) => { paper.rotation.y = t * 2.5; paper.position.y = 0.7 + Math.sin(t * 3) * 0.08; };
    return g;
  },
  lawnZone(o, localTeam) {
    const g = new THREE.Group();
    const r = o.radius || 5.2;
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r + 0.15, 32), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;

    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), new THREE.MeshLambertMaterial({ color: '#5f574f' }));
    flagPole.position.y = 1.4;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.03), new THREE.MeshLambertMaterial({ color: '#ffec27' }));
    flag.position.set(0.44, 2.3, 0);

    g.add(ring, flagPole, flag);
    g.userData.update = (m, obj, t) => {
      const col = obj.contested
        ? '#ffec27'
        : obj.ownerTeam === null
        ? '#00e436'
        : obj.ownerTeam === localTeam
        ? '#29adff'
        : '#ff004d';
      ringMat.color.set(col);
      flag.material.color.set(col);
      ringMat.opacity = 0.55 + 0.35 * Math.sin(t * (obj.contested ? 10 : 4));
      flag.rotation.y = Math.sin(t * 2) * 0.2;
    };
    return g;
  },
};
