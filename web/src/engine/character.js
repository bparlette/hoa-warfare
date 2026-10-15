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

/** Faction-specific headwear. Phase 0 factions get the most love; the rest get a readable silhouette. */
function addHeadwear(head, look, faction) {
  const accent = mat({ color: look.accent });
  const shirt = mat({ color: look.shirt });
  const hair = (c) => mat({ color: c });
  switch (look.hat) {
    case 'backwardsCap': {
      head.add(part(0.4, 0.1, 0.4, accent, 0.22));
      const brim = part(0.3, 0.03, 0.18, accent, 0.18); brim.position.z = 0.27; head.add(brim);
      break;
    }
    case 'hoodPhones': {
      const hood = part(0.46, 0.44, 0.44, shirt, 0.02); hood.position.z = 0.04; head.add(hood);
      for (const s of [-1, 1]) { const p = part(0.08, 0.16, 0.16, accent, 0.0); p.position.x = s * 0.25; head.add(p); }
      head.add(part(0.5, 0.05, 0.08, accent, 0.25));
      break;
    }
    case 'bob': {
      const h = hair('#e3c46a');
      head.add(part(0.44, 0.14, 0.44, h, 0.18));
      const back = part(0.44, 0.34, 0.12, h, -0.02); back.position.z = 0.18; head.add(back);
      const side = part(0.1, 0.3, 0.3, h, 0.0); side.position.set(-0.22, 0, 0.02); head.add(side); // the asymmetric bob
      const side2 = part(0.06, 0.18, 0.26, h, 0.06); side2.position.set(0.2, 0.06, 0.04); head.add(side2);
      const shades = part(0.36, 0.05, 0.06, mat({ color: '#141414' }), 0.27); shades.position.z = -0.1; head.add(shades);
      break;
    }
    case 'ringLight': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 4, 10), mat({ color: look.accent, emissive: '#ffffff', emissiveIntensity: 0.7 }));
      ring.position.set(0, 0.05, 0.42);
      head.add(ring);
      head.add(part(0.42, 0.1, 0.42, hair('#1d1d1d'), 0.2));
      break;
    }
    case 'trucker': case 'whiteCap': {
      const c = look.hat === 'whiteCap' ? mat({ color: '#ffffff' }) : accent;
      head.add(part(0.42, 0.12, 0.42, c, 0.22));
      const brim = part(0.32, 0.03, 0.2, c, 0.17); brim.position.z = -0.28; head.add(brim);
      break;
    }
    case 'beret': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 8), accent);
      b.position.set(0.04, 0.22, 0); b.rotation.z = 0.2; head.add(b);
      break;
    }
    case 'ponytail': {
      const h = hair('#f0d27a');
      head.add(part(0.42, 0.1, 0.42, h, 0.2));
      const tail = part(0.12, 0.3, 0.12, h, 0.02); tail.position.z = 0.26; head.add(tail);
      break;
    }
    case 'fringe': {
      const h = hair('#111111');
      head.add(part(0.42, 0.12, 0.42, h, 0.2));
      const f = part(0.26, 0.2, 0.04, h, 0.06); f.position.set(-0.08, 0.06, -0.21); head.add(f);
      break;
    }
    case 'sweaterCane':
      head.add(part(0.4, 0.06, 0.4, hair('#e6e6e6'), 0.2));
      break;
    default:
      head.add(part(0.4, 0.08, 0.4, hair('#3a2a20'), 0.2));
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
    addHeadwear(this.head, look, faction);
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

    if (faction === 'brainRot') { // the iPad glow
      const tab = part(0.24, 0.32, 0.03, mat({ color: '#222', emissive: '#7ff7ff', emissiveIntensity: 0.6 }), -0.5);
      tab.position.z = -0.12; this.arms[0].add(tab);
    }
    if (faction === 'cloutStreamers') {
      const phone = part(0.08, 0.15, 0.02, mat({ color: '#111', emissive: '#e8f4ff', emissiveIntensity: 0.5 }), -0.58);
      phone.position.z = -0.1; this.arms[0].add(phone);
    }

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

  /** s = sim snapshot entry */
  update(s, dt, { revealed = false, firing = false, meleeAgo = 9 } = {}) {
    this.root.visible = s.alive;
    if (!s.alive) return;
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
    this.marker.visible = this.isLocalTeam || revealed;
    this.marker.rotation.y += dt * 3;
  }

  /** Split into independent boxes and fling them. Returns a Ragdoll that owns the pieces. */
  ragdoll(scene, impulse, { headshot = false, explosive = false } = {}) {
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
