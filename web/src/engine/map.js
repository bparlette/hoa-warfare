// Cul-de-Sac: the Phase 0 signature map. Pure data + geometry, no three.js, so the sim and tests
// can use it headlessly. Units are metres. x = east, z = south (toward the street), y = up.
// Every solid is an axis-aligned box {minX,maxX,minY,maxY,minZ,maxZ,kind,...}. The renderer
// decides what each `kind` looks like; the sim only cares about the box.

export const BOUNDS = { minX: -44, maxX: 44, minZ: -48, maxZ: 48 };
export const COURT = { x: 0, z: 0, r: 13 };
export const STREET = { minX: -5, maxX: 5, minZ: 0, maxZ: 48 };

export const SPRINKLER_NODES = [
  [-18, -4], [-18, 4],    // House 0 lawn (west)
  [18, -4], [18, 4],      // House 1 lawn (east)
  [-15, -16], [-21, -16], // House 2 lawn (northwest)
  [15, -16], [21, -16],   // House 3 lawn (northeast)
  [-13, 20], [-13, 28],   // House 4 lawn (southwest)
  [13, 20], [13, 28],     // House 5 lawn (southeast)
];

export const MAILBOX_PROPS = [
  { id: 'mailbox_1', kind: 'mailbox', pos: { x: -6.2, y: 0, z: 10 }, hp: 25, maxHp: 25, destroyed: false },
  { id: 'mailbox_2', kind: 'mailbox', pos: { x: 6.2, y: 0, z: 12 }, hp: 25, maxHp: 25, destroyed: false },
  { id: 'mailbox_3', kind: 'mailbox', pos: { x: -13.5, y: 0, z: 16 }, hp: 25, maxHp: 25, destroyed: false },
  { id: 'mailbox_4', kind: 'mailbox', pos: { x: 13.5, y: 0, z: -16 }, hp: 25, maxHp: 25, destroyed: false },
];

export const GLASS_TABLE_PROPS = [
  { id: 'glassTable_1', kind: 'glassTable', pos: { x: 0, y: 0, z: -32 }, hp: 20, maxHp: 20, destroyed: false },
  { id: 'glassTable_2', kind: 'glassTable', pos: { x: -28, y: 0, z: -14 }, hp: 20, maxHp: 20, destroyed: false },
  { id: 'glassTable_3', kind: 'glassTable', pos: { x: 28, y: 0, z: -14 }, hp: 20, maxHp: 20, destroyed: false },
];

export const ROCKET_PROPANE_PROPS = [
  { id: 'propane_1', kind: 'rocketPropane', pos: { x: -2.0, y: 0.5, z: -34 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
  { id: 'propane_2', kind: 'rocketPropane', pos: { x: -25, y: 0.5, z: -15 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
  { id: 'propane_3', kind: 'rocketPropane', pos: { x: 25, y: 0.5, z: -15 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
];

export function createSprinklers() {
  return SPRINKLER_NODES.map(([x, z], id) => Object.assign([x, z], {
    id: `sprinkler_${id + 1}`,
    index: id,
    kind: 'sprinkler',
    pos: { x, y: 0, z },
    x,
    y: 0,
    z,
    radius: 2.5,
    arc: Math.PI,
    active: true,
    isSprinkler: true,
  }));
}

export const sprinklers = createSprinklers();
export const SPRINKLERS = sprinklers;
export const mailboxes = MAILBOX_PROPS.map(m => ({ ...m, pos: { ...m.pos } }));
export const MAILBOXES = mailboxes;
export const glassTables = GLASS_TABLE_PROPS.map(g => ({ ...g, pos: { ...g.pos } }));
export const GLASS_TABLES = glassTables;
export const glassPatioTables = glassTables;
export const rocketPropane = ROCKET_PROPANE_PROPS.map(p => ({ ...p, pos: { ...p.pos } }));
export const ROCKET_PROPANE = rocketPropane;
export const rocketPropanes = rocketPropane;
export const destructibles = [...mailboxes, ...glassTables, ...rocketPropane];

export function buildCulDeSac() {
  const boxes = [];
  const box = (x, z, w, d, h, kind, extra = {}) => {
    const minY = extra.minY ?? 0;
    const isCar = kind === 'car' || extra.isCar ? true : undefined;
    const b = {
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY, maxY: minY + h,
      kind,
      ...(isCar ? { isCar: true } : {}),
      ...extra,
    };
    boxes.push(b);
    return b;
  };

  // Perimeter privacy fence
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  box(0, minZ - 0.5, maxX - minX + 2, 1, 2.6, 'wall');
  box(0, maxZ + 0.5, maxX - minX + 2, 1, 2.6, 'wall');
  box(minX - 0.5, 0, 1, maxZ - minZ, 2.6, 'wall');
  box(maxX + 0.5, 0, 1, maxZ - minZ, 2.6, 'wall');

  // Houses ring the court; `face` is the side with the front door / garage
  const houses = [
    [-27, 0, 10, 14, 'e', '#e8d9b5'], [27, 0, 10, 14, 'w', '#b9d4e8'],
    [-17, -23, 12, 10, 's', '#d7e3c3'], [17, -23, 12, 10, 's', '#f0c9b8'],
    [-19, 24, 10, 12, 'e', '#e3d3e8'], [19, 24, 10, 12, 'w', '#f2e6a6'],
  ];
  houses.forEach(([x, z, w, d, face, color], i) => box(x, z, w, d, 5, 'house', { face, color, id: i }));

  // Yard fences (jumpable) leave a lane behind the side houses
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) box(sx * 41, sz * 12, 6, 0.2, 1.0, 'fence');
    box(sx * 33, -34, 0.2, 8, 1.0, 'fence');
    box(sx * 33, 36, 0.2, 8, 1.0, 'fence');
  }

  // Court cover
  box(-7.5, 5, 2, 4.4, 1.5, 'car', { color: '#d9483b', isCar: true });
  box(8, -6, 4.4, 2, 1.5, 'car', { color: '#3b6fd9', isCar: true });
  box(0, -7, 3, 3, 0.9, 'trampoline');
  box(-9, -14, 5, 1.2, 1.6, 'hedge');
  box(9, -14, 5, 1.2, 1.6, 'hedge');
  box(11.5, 7.5, 0.7, 0.7, 1.1, 'trash');
  const mailboxes = MAILBOX_PROPS.map(m => ({ ...m, pos: { ...m.pos } }));
  const glassTables = GLASS_TABLE_PROPS.map(g => ({ ...g, pos: { ...g.pos } }));
  const rocketPropane = ROCKET_PROPANE_PROPS.map(p => ({ ...p, pos: { ...p.pos } }));
  const destructibles = [...mailboxes, ...glassTables, ...rocketPropane];

  for (const mb of mailboxes) {
    box(mb.pos.x, mb.pos.z, 0.35, 0.35, 1.2, 'mailbox', {
      id: mb.id,
      hp: mb.hp,
      maxHp: mb.maxHp,
      destroyed: mb.destroyed,
    });
  }

  // Street + south spawn cover
  box(3, 30, 2, 4.4, 1.5, 'car', { color: '#f2f2f2', isCar: true });
  box(-3.5, 21, 2, 4.4, 1.5, 'car', { color: '#5a5a5a', isCar: true });
  box(-9, 36, 0.7, 0.7, 1.1, 'trash');
  box(9, 33, 0.7, 0.7, 1.1, 'trash');

  // North greenbelt: gazebo + hedges
  for (const dx of [-2.5, 2.5]) for (const dz of [-2.5, 2.5]) box(dx, -32 + dz, 0.3, 0.3, 2.8, 'post');
  box(0, -32, 6.2, 6.2, 0.35, 'gazeboRoof', { minY: 2.8 });
  box(-7, -39, 6, 1, 1.4, 'hedge');
  box(7, -39, 6, 1, 1.4, 'hedge');

  // Backyard trees (trunks are solid, canopies are decoration)
  const trees = [[-38, -28], [38, -28], [-38, 30], [38, 30], [-38, 0], [38, 0], [-26, -40], [26, -40], [-28, 41], [28, 41], [-12, -44], [12, 44]];
  trees.forEach(([x, z]) => box(x, z, 0.6, 0.6, 3.2, 'tree'));

  // Lawn sprinkler nodes placed across residential front lawns
  const sprinklers = createSprinklers();

  // Spawns: team 0 = south street end, team 1 = north greenbelt
  const spawns = {
    0: [[-6, 42], [-2, 43], [2, 43], [6, 42], [-10, 40], [10, 40], [-16, 44], [16, 44]],
    1: [[-6, -43], [-2, -44], [2, -44], [6, -43], [-10, -42], [10, -42], [-18, -44], [18, -44]],
  };

  // Bot navigation nodes (east side mirrored from west), auto-linked by clear line of sight
  const half = [
    [0, 0], [0, 12], [0, -12], [0, 20], [0, 30], [0, 40], [0, -20], [0, -27], [0, -42],
    [8, 8], [8, -9], [12, 0], [-6, -34], [-8, -43], [-8, 40],
    [-27, -12], [-27, 12], [-36, -18], [-37, -6], [-37, 6], [-36, 18],
    [-32, -30], [-20, -38], [-32, 30], [-20, 40], [-10, 26], [-10, -19],
  ];
  const nodes = [];
  const seen = new Set();
  for (const [x, z] of half) {
    for (const p of x === 0 ? [[x, z]] : [[x, z], [-x, z]]) {
      const k = p.join(',');
      if (!seen.has(k)) { seen.add(k); nodes.push({ x: p[0], z: p[1], links: [] }); }
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d <= 20 && segmentClear(boxes, a.x, a.z, b.x, b.z, 0.55, 0.45)) {
        a.links.push({ to: j, d });
        b.links.push({ to: i, d });
      }
    }
  }
  return {
    boxes,
    spawns,
    nodes,
    bounds: BOUNDS,
    court: COURT,
    street: STREET,
    trees,
    sprinklers,
    sprinklerNodes: sprinklers,
    mailboxes,
    glassTables,
    rocketPropane,
    rocketPropanes: rocketPropane,
    destructibles,
  };
}

/** True if a disc of `radius` can slide from (ax,az) to (bx,bz) without hitting a box taller than `stepH`. */
export function segmentClear(boxes, ax, az, bx, bz, radius = 0, stepH = 0.45) {
  const dx = bx - ax, dz = bz - az;
  for (const b of boxes) {
    if (b.maxY <= stepH || b.minY > 1.8) continue;
    // slab test in 2D against the box grown by radius
    let t0 = 0, t1 = 1;
    const lo = [b.minX - radius, b.minZ - radius], hi = [b.maxX + radius, b.maxZ + radius];
    const o = [ax, az], v = [dx, dz];
    let hit = true;
    for (let k = 0; k < 2; k++) {
      if (Math.abs(v[k]) < 1e-9) {
        if (o[k] < lo[k] || o[k] > hi[k]) { hit = false; break; }
      } else {
        let ta = (lo[k] - o[k]) / v[k], tb = (hi[k] - o[k]) / v[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return false;
  }
  return true;
}

/** Ray vs box (3D slab). Returns distance along unit `dir` or Infinity. */
export function rayBox(o, dir, b, maxT = Infinity) {
  let t0 = 0, t1 = maxT;
  const lo = [b.minX, b.minY, b.minZ], hi = [b.maxX, b.maxY, b.maxZ];
  const oo = [o.x, o.y, o.z], dd = [dir.x, dir.y, dir.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dd[k]) < 1e-9) {
      if (oo[k] < lo[k] || oo[k] > hi[k]) return Infinity;
    } else {
      let ta = (lo[k] - oo[k]) / dd[k], tb = (hi[k] - oo[k]) / dd[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

/** Ray vs the ground plane y=0 (the map has no holes). */
export function rayGround(o, dir, maxT = Infinity) {
  if (dir.y >= -1e-9) return Infinity;
  const t = -o.y / dir.y;
  return t >= 0 && t <= maxT ? t : Infinity;
}

/** Shortest path over nav nodes (Dijkstra; ~45 nodes so no heap needed). */
export function findPath(nodes, from, to) {
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const { to: v, d } of nodes[u].links) {
      if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = [];
  for (let u = to; u >= 0; u = prev[u]) path.unshift(u);
  return path;
}

export function nearestNode(nodes, boxes, x, z) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
    if (d < bd && segmentClear(boxes, x, z, nodes[i].x, nodes[i].z, 0.3, 0.45)) { bd = d; best = i; }
  }
  if (best >= 0) return best;
  for (let i = 0; i < nodes.length; i++) {
    const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function buildPickleballClub() {
  const base = buildCulDeSac();
  // Customize cover with Pickleball nets & golf carts
  for (const b of base.boxes) {
    if (b.kind === 'house') b.color = '#f0f5e8';
    if (b.kind === 'car') b.color = '#e6f2ff';
    if (b.kind === 'fence') b.color = '#1e7cb8';
  }
  base.id = 'pickleball';
  base.name = 'Shady Pines Pickleball Club';
  return base;
}

export function buildStripMall() {
  const base = buildCulDeSac();
  // Customize cover with Strip Mall stucco & luxury SUVs
  for (const b of base.boxes) {
    if (b.kind === 'house') b.color = '#e6ccb2';
    if (b.kind === 'car') b.color = '#2b2d42';
  }
  base.id = 'stripmall';
  base.name = 'Sunset Strip Mall & Whole Foods Lot';
  return base;
}

export const MAPS = {
  culdesac:   { id: 'culdesac',   label: 'Oakridge Cul-de-Sac',                name: 'Oakridge Cul-de-Sac',                demoAllowed: true,  freeInDemo: true,  build: buildCulDeSac },
  pickleball: { id: 'pickleball', label: 'Shady Pines Pickleball Club',        name: 'Shady Pines Pickleball Club',        demoAllowed: false, freeInDemo: false, tagline: '4 neon courts and luxury golf carts!', build: buildPickleballClub },
  stripmall:  { id: 'stripmall',  label: 'Sunset Strip Mall Parking Lot',      name: 'Sunset Strip Mall Parking Lot',      demoAllowed: false, freeInDemo: false, tagline: 'Dense SUV lanes and rooftop sniper perches!', build: buildStripMall },
};

export function buildMap(mapId = 'culdesac') {
  const entry = MAPS[mapId] || MAPS.culdesac;
  const m = entry.build();
  m.id = entry.id;
  m.label = entry.label;
  return m;
}


