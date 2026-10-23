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
  const nodes = buildNavGraph(boxes, half.flatMap(([x, z]) => x === 0 ? [[x, z]] : [[x, z], [-x, z]]), { maxLink: 20, stepH: 0.45 });
  // Team 1's walk to the circle detours round the gazebo (47.6 m vs 40 m), so team 0 nearly always
  // took the opening King of the Lawn zone. Nudge it toward team 1.
  const zonePos = { 'Cul-de-Sac Circle': { x: 0, z: -4 } };
  // Steal the Casserole: the walking-distance rule put team 1's kitchen behind the gazebo at
  // (-5, -19.5) against team 0's (0, 16) on the open road, and team 1 won 29/40 matches (77 captures
  // to 36). Mirrored kitchens 32 m apart are even (68 to 66) and see more captures.
  const kitchenPos = { 0: { x: 0, y: 0, z: 16 }, 1: { x: 0, y: 0, z: -16 } };
  return {
    boxes,
    spawns,
    nodes,
    zonePos,
    kitchenPos,
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
/**
 * Bot nav graph from hand-placed points: dedupes them, pushes any point that sits inside a solid box
 * (car, net, mailbox... anything taller than a walkable step) out to the nearest free spot, links
 * every pair within maxLink metres that has a clear, body-wide line (stepH: tallest thing a link may
 * cross, bots jump it), and drops points that end up unfreeable or unlinked.
 */
export function buildNavGraph(boxes, coords, { maxLink = 20, stepH = 0.45, clearance = 0.6 } = {}) {
  const solid = boxes.filter(b => b.maxY > 0.45 && b.minY <= 1.8);
  const hit = (x, z) => solid.find(b => x > b.minX - clearance && x < b.maxX + clearance && z > b.minZ - clearance && z < b.maxZ + clearance);
  let nodes = [];
  const seen = new Set();
  for (let [x, z] of coords) {
    for (let tries = 0, b; (b = hit(x, z)) && tries < 4; tries++) {
      const exits = [[b.minX - clearance - 0.05, z], [b.maxX + clearance + 0.05, z], [x, b.minZ - clearance - 0.05], [x, b.maxZ + clearance + 0.05]]
        .sort((p, q) => Math.hypot(p[0] - x, p[1] - z) - Math.hypot(q[0] - x, q[1] - z));
      [x, z] = exits.find(([ex, ez]) => !hit(ex, ez)) || exits[0];
    }
    if (hit(x, z)) continue;
    const k = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (!seen.has(k)) { seen.add(k); nodes.push({ x, z, links: [] }); }
  }
  const link = () => {
    for (const n of nodes) n.links = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d <= maxLink && segmentClear(boxes, a.x, a.z, b.x, b.z, 0.55, stepH)) {
          a.links.push({ to: j, d });
          b.links.push({ to: i, d });
        }
      }
    }
  };
  link();
  if (nodes.some(n => !n.links.length)) { nodes = nodes.filter(n => n.links.length); link(); }
  return nodes;
}

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

/**
 * Walking distance from one nav node to every other node, in metres (Dijkstra over `links`).
 * Modes that place objectives need this: a map's spawns are rarely the same walk apart even when
 * they look symmetric on the grid, and objectives dropped at "45% of the way to the centre" land
 * wildly differently on each side (stripmall's kitchens were 13.6 m and 29.5 m from their own
 * spawns, so one team defended and attacked over a third of the distance of the other).
 */
export function navDistances(nodes, from) {
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity), done = new Array(n).fill(false);
  if (from < 0 || from >= n) return dist;
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const { to: v, d } of nodes[u].links) if (dist[u] + d < dist[v]) dist[v] = dist[u] + d;
  }
  return dist;
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

  const { minX, maxX, minZ, maxZ } = BOUNDS;

  // 1. Club Perimeter Privacy Hedges & Enclosure Wall
  box(0, minZ - 0.5, maxX - minX + 2, 1, 2.8, 'wall');
  box(0, maxZ + 0.5, maxX - minX + 2, 1, 2.8, 'wall');
  box(minX - 0.5, 0, 1, maxZ - minZ, 2.8, 'wall');
  box(maxX + 0.5, 0, 1, maxZ - minZ, 2.8, 'wall');

  // Outer privacy hedges
  box(-36, 0, 1.2, 54, 2.2, 'hedge');
  box(36, 0, 1.2, 54, 2.2, 'hedge');

  // 2. The Grand Clubhouse & Viewing Terrace (North)
  box(0, -38, 28, 10, 6.2, 'clubhouse', { face: 's', color: '#f7f4ea', id: 0 });
  box(-21, -37, 10, 8, 4.6, 'house', { face: 's', color: '#ede7d8', id: 1 });
  box(21, -37, 10, 8, 4.6, 'house', { face: 's', color: '#ede7d8', id: 2 });

  // Covered Veranda / Terrace with pillars
  box(0, -28, 26, 6, 0.35, 'verandaRoof', { minY: 3.2 });
  for (const px of [-11, -4, 4, 11]) {
    box(px, -28, 0.4, 0.4, 3.2, 'post');
  }

  // Veranda dining & spectator props
  const glassTables = [
    { id: 'pb_table_1', kind: 'glassTable', pos: { x: -8, y: 0, z: -27 }, hp: 20, maxHp: 20, destroyed: false },
    { id: 'pb_table_2', kind: 'glassTable', pos: { x: 8, y: 0, z: -27 }, hp: 20, maxHp: 20, destroyed: false },
    { id: 'pb_table_3', kind: 'glassTable', pos: { x: 0, y: 0, z: -27 }, hp: 20, maxHp: 20, destroyed: false },
    { id: 'pb_table_4', kind: 'glassTable', pos: { x: -28, y: 0, z: 24 }, hp: 20, maxHp: 20, destroyed: false },
    { id: 'pb_table_5', kind: 'glassTable', pos: { x: 28, y: 0, z: 24 }, hp: 20, maxHp: 20, destroyed: false },
  ];
  for (const t of glassTables) {
    box(t.pos.x, t.pos.z, 1.8, 1.8, 0.85, 'glassTable', { id: t.id, hp: t.hp, maxHp: t.maxHp, destroyed: t.destroyed });
  }

  const rocketPropane = [
    { id: 'pb_propane_1', kind: 'rocketPropane', pos: { x: -14, y: 0.5, z: -27 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
    { id: 'pb_propane_2', kind: 'rocketPropane', pos: { x: 14, y: 0.5, z: -27 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
    { id: 'pb_propane_3', kind: 'rocketPropane', pos: { x: 0, y: 0.5, z: 20 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
  ];
  for (const p of rocketPropane) {
    box(p.pos.x, p.pos.z, 0.6, 0.6, 1.1, 'rocketPropane', { id: p.id, hp: p.hp, maxHp: p.maxHp, triggered: false, destroyed: false });
  }

  // 3. 4 Regulation Pickleball Courts (Center Arena)
  // West Courts: Court 1 (NW: z = -9), Court 2 (SW: z = 9), Center X = -16
  // East Courts: Court 3 (NE: z = -9), Court 4 (SE: z = 9), Center X = 16
  const courts = [
    { id: 1, cx: -16, cz: -9 },
    { id: 2, cx: -16, cz: 9 },
    { id: 3, cx: 16, cz: -9 },
    { id: 4, cx: 16, cz: 9 },
  ];

  for (const c of courts) {
    // Jumpable regulation net across court width (0.9m high)
    box(c.cx, c.cz, 9.4, 0.25, 0.9, 'pickleNet');
    // Net support side posts
    box(c.cx - 4.8, c.cz, 0.2, 0.2, 1.05, 'post');
    box(c.cx + 4.8, c.cz, 0.2, 0.2, 1.05, 'post');
  }

  // Court Windscreens & Dividing Wire Fences (with wide gateways for fluid traversal)
  // Horizontal dividing fence between North and South courts (leaves wide center/outer gaps)
  box(-16, 0, 7.2, 0.2, 1.1, 'courtFence');
  box(16, 0, 7.2, 0.2, 1.1, 'courtFence');

  // Outer sideline windscreens
  box(-22, -9, 0.2, 11, 1.1, 'courtFence');
  box(-22, 9, 0.2, 11, 1.1, 'courtFence');
  box(22, -9, 0.2, 11, 1.1, 'courtFence');
  box(22, 9, 0.2, 11, 1.1, 'courtFence');

  // Inner promenade windscreens (leaves wide open entrances at center and ends)
  box(-10.5, -9, 0.2, 10, 1.1, 'courtFence');
  box(-10.5, 9, 0.2, 10, 1.1, 'courtFence');
  box(10.5, -9, 0.2, 10, 1.1, 'courtFence');
  box(10.5, 9, 0.2, 10, 1.1, 'courtFence');

  // Spectator Bleachers on outer sidelines
  box(-26, -8, 2.2, 6, 1.4, 'bleachers');
  box(-26, 8, 2.2, 6, 1.4, 'bleachers');
  box(26, -8, 2.2, 6, 1.4, 'bleachers');
  box(26, 8, 2.2, 6, 1.4, 'bleachers');

  // Umpire High Chairs in court gaps
  box(-6, 0, 1.2, 1.2, 2.1, 'umpireStand');
  box(6, 0, 1.2, 1.2, 2.1, 'umpireStand');

  // 4. Golf Cart Stalls & Pro Shop Plaza (South: z = 22 to 46)
  // Pro Shop & Equipment Shed (South-West)
  box(-22, 34, 12, 10, 4.4, 'house', { face: 'e', color: '#f5ebe0', id: 3 });

  // Electric Golf Carts (Crouch/Stand Tactical Cover)
  const golfCarts = [
    { x: -8, z: 26, w: 2.0, d: 3.6, color: '#ffffff' },
    { x: 8, z: 28, w: 2.0, d: 3.6, color: '#2a6f47' },
    { x: -12, z: 36, w: 3.6, d: 2.0, color: '#e8f4f8' },
    { x: 12, z: 36, w: 2.0, d: 3.6, color: '#3f7b37' },
    { x: 0, z: 32, w: 3.6, d: 2.0, color: '#1e3d59' },
    { x: -28, z: -18, w: 2.0, d: 3.6, color: '#ffffff' },
    { x: 28, z: -18, w: 2.0, d: 3.6, color: '#2a6f47' },
  ];
  for (const gc of golfCarts) {
    box(gc.x, gc.z, gc.w, gc.d, 1.75, 'car', { color: gc.color, isCar: true, isGolfCart: true });
  }

  // Tennis/pickleball ball recycling bins & towel hampers
  box(-4, 24, 0.7, 0.7, 1.1, 'trash');
  box(4, 24, 0.7, 0.7, 1.1, 'trash');
  box(-3, -22, 0.7, 0.7, 1.1, 'trash');
  box(3, -22, 0.7, 0.7, 1.1, 'trash');

  // Mailbox & HOA Rules board at entrance
  const mailboxes = [
    { id: 'pb_board_1', kind: 'mailbox', pos: { x: -4, y: 0, z: 42 }, hp: 25, maxHp: 25, destroyed: false },
    { id: 'pb_board_2', kind: 'mailbox', pos: { x: 4, y: 0, z: 42 }, hp: 25, maxHp: 25, destroyed: false },
  ];
  for (const mb of mailboxes) {
    box(mb.pos.x, mb.pos.z, 0.4, 0.4, 1.3, 'mailbox', { id: mb.id, hp: mb.hp, maxHp: mb.maxHp, destroyed: mb.destroyed });
  }

  // Trampoline in family lawn corner
  box(28, 35, 3.2, 3.2, 0.9, 'trampoline');

  // Palm trees and decorative landscape trees
  const trees = [
    [-32, -38], [32, -38], [-32, 40], [32, 40],
    [-4, -14], [4, -14], [-4, 14], [4, 14],
    [-34, -20], [34, -20], [-34, 20], [34, 20],
  ];
  trees.forEach(([x, z]) => box(x, z, 0.6, 0.6, 3.4, 'tree'));

  // Lawn sprinklers around putting green fringe
  const pbSprinklerNodes = [
    [-28, -26], [28, -26], [-28, 26], [28, 26],
    [-10, 22], [10, 22], [0, 44], [0, -22],
  ];
  const sprinklers = pbSprinklerNodes.map(([x, z], id) => Object.assign([x, z], {
    id: `pb_sprinkler_${id + 1}`,
    index: id,
    kind: 'sprinkler',
    pos: { x, y: 0, z },
    x,
    y: 0,
    z,
    radius: 2.6,
    arc: Math.PI,
    active: true,
    isSprinkler: true,
  }));

  const destructibles = [...mailboxes, ...glassTables, ...rocketPropane];

  // Spawns: Team 0 = South Cart Plaza, Team 1 = North Clubhouse Terrace
  const spawns = {
    0: [[-6, 24], [-2, 24], [2, 24], [6, 24], [-10, 23], [10, 23], [-18, 25], [18, 25]],
    1: [[-6, -24], [-2, -24], [2, -24], [6, -24], [-10, -23], [10, -23], [-18, -25], [18, -25]],
  };

  // Nav nodes covering the courts, promenades, bleacher flanks, and plazas
  const nodeCoords = [
    // North Terrace & Clubhouse Overlook
    [0, -24], [-6, -24], [6, -24], [-12, -24], [12, -24], [-18, -24], [18, -24],
    // Central Spine Walkway
    [0, -18], [0, -9], [0, 0], [0, 9], [0, 18], [0, 24],
    // West Court 1 (NW: [-16, -9]) & Gateways
    [-16, -18], [-16, -14], [-16, -9], [-16, -4], [-16, -1], [-9, -9], [-23, -9],
    // West Court 2 (SW: [-16, 9]) & Gateways
    [-16, 1], [-16, 4], [-16, 9], [-16, 14], [-16, 18], [-9, 9], [-23, 9],
    // West Sideline Flank & Bleachers
    [-28, -18], [-28, -9], [-28, 0], [-28, 9], [-28, 18],
    // East Court 3 (NE: [16, -9]) & Gateways
    [16, -18], [16, -14], [16, -9], [16, -4], [16, -1], [9, -9], [23, -9],
    // East Court 4 (SE: [16, 9]) & Gateways
    [16, 1], [16, 4], [16, 9], [16, 14], [16, 18], [9, 9], [23, 9],
    // East Sideline Flank & Bleachers
    [28, -18], [28, -9], [28, 0], [28, 9], [28, 18],
    // South Cart Plaza & Pro Shop
    [0, 28], [-8, 28], [8, 28], [0, 36], [-8, 36], [8, 36], [-16, 36], [16, 36],
    [-8, 42], [8, 42], [0, 44],
  ];

  const nodes = buildNavGraph(boxes, nodeCoords, { maxLink: 22, stepH: 1.15 });

  // Balanced, point-symmetric objective positions across the center court net:
  // Center, North terrace, South plaza, East court promontory, West court promontory.
  const zonePos = {
    'Cul-de-Sac Circle': { x: 0, z: 0 },
    'Gazebo Greenbelt': { x: 0, z: -20 },
    'South Driveway': { x: 0, z: 20 },
    'Northeast Front Lawn': { x: 16, z: 0 },
    'West Front Lawn': { x: -16, z: 0 },
    // HOA Patrol: the cul-de-sac spots put A behind team 1's spawn and C out on a flank
    'Gazebo': { x: 0, z: -20 }, 'Clubhouse': { x: 0, z: 0 }, 'Pool Patio': { x: 0, z: 20 },
  };
  const zoneNames = {
    'Cul-de-Sac Circle': 'Center Court Net', 'Gazebo Greenbelt': 'Clubhouse Terrace', 'South Driveway': 'Golf Cart Plaza',
    'Northeast Front Lawn': 'East Courts', 'West Front Lawn': 'West Courts',
    'Gazebo': 'Clubhouse Terrace', 'Clubhouse': 'Center Court', 'Pool Patio': 'Golf Cart Plaza',
  };
  // Steal the Casserole: the auto rule put the kitchens 18 m apart on this small map, and a player who
  // grabbed the dish sprinted it home in 2 s (a 3-0 in 35 s). 26 m apart keeps bot matches even
  // (11/7/2 over 20 seeds) and the first capture near 70 s. The 30 m tried in 91d3734 starved bots.
  const kitchenPos = { 0: { x: 0, y: 0, z: 13 }, 1: { x: 0, y: 0, z: -13 } };


  return {
    id: 'pickleball',
    name: 'Shady Pines Pickleball Club',
    label: 'Shady Pines Pickleball Club',
    boxes,
    spawns,
    nodes,
    zonePos,
    zoneNames,
    kitchenPos,
    bounds: BOUNDS,
    court: { x: 0, z: 0, r: 16 },
    street: { minX: -8, maxX: 8, minZ: 22, maxZ: 48 },
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

export function buildStripMall() {
  const boxes = [];
  function box(cx, cz, w, d, h, kind, extra = {}) {
    const minY = extra.minY ?? 0;
    const b = {
      cx, cz, w, d, h,
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      minY, maxY: minY + h,
      kind,
      ...extra,
    };
    boxes.push(b);
    return b;
  }

  const { minX, maxX, minZ, maxZ } = BOUNDS;

  // 1. Strip Mall Boundary Walls (North back wall, East & West perimeter)
  box(0, minZ - 0.5, maxX - minX + 2, 1, 3.8, 'wall'); // North service alley wall
  box(minX - 0.5, 0, 1, maxZ - minZ, 3.2, 'wall');    // West drive-thru wall
  box(maxX + 0.5, 0, 1, maxZ - minZ, 3.2, 'wall');    // East loading dock wall
  // South perimeter wall leaves a wide 28m open boulevard entrance in the center
  box(-30, maxZ + 0.5, 32, 1, 2.2, 'wall');
  box(30, maxZ + 0.5, 32, 1, 2.2, 'wall');

  // 2. North Retail Buildings
  // Anchor Supermarket: "Wholesome Harvest Organic Market" (West-North)
  // Two wings leaving an open automatic glass sliding entrance in between (from x = -13 to -9)
  box(-27, -36, 26, 14, 6.2, 'supermarket', { face: 's', color: '#e8dec8', id: 'sm_west' });
  box(-1, -36, 14, 14, 6.2, 'supermarket', { face: 's', color: '#e8dec8', id: 'sm_east' });
  // Overhanging Entrance Canopy / Awning
  box(-11, -27.5, 12, 4, 0.4, 'awning', { minY: 3.8, color: '#2d6a4f' });
  box(-16, -27.5, 0.4, 0.4, 3.8, 'post');
  box(-6, -27.5, 0.4, 0.4, 3.8, 'post');

  // Boutique Retail Strip (East-North: "Pure Pilates", "Artisanal Drip Coffee", "Chic Spa")
  // Lower building with accessible rooftop sniper terrace (height 4.2m)
  box(24, -36, 22, 12, 4.2, 'boutique', { face: 's', color: '#f5ebe0', id: 'boutique_main' });
  // Boutique Shop Canvas Awnings over front sidewalk
  box(18, -28.5, 8, 2.5, 0.35, 'awning', { minY: 3.2, color: '#7f4f24' });
  box(28, -28.5, 8, 2.5, 0.35, 'awning', { minY: 3.2, color: '#2b2d42' });

  // Accessible Rooftop Sniper Perch & Cover:
  // Access Ramp on the East side (ascends from ground to roof at height 2.2m)
  box(38, -26, 3.2, 8, 2.2, 'ramp', { color: '#4a4e69' });
  // Rooftop Industrial HVAC Condenser Units (Cover on the roof)
  box(20, -35, 2.4, 3.2, 1.4, 'hvac', { minY: 4.2, color: '#8d99ae' });
  box(28, -35, 2.4, 3.2, 1.4, 'hvac', { minY: 4.2, color: '#8d99ae' });
  // Rooftop Parapet Safety Fence
  box(24, -29.8, 22, 0.25, 0.9, 'courtFence', { minY: 4.2 });
  box(13, -36, 0.25, 12, 0.9, 'courtFence', { minY: 4.2 });

  // Commercial Delivery Bay & Loading Dock (Far East: x = 32 to 44, z = -44 to -28)
  // Semi-truck Freight Container / Trailer
  box(38, -40, 3.2, 9, 3.2, 'container', { color: '#1d3557' });
  // Heavy Commercial Steel Dumpsters
  box(33, -32, 2.4, 1.6, 1.5, 'dumpster', { color: '#283618', id: 'dumpster_east' });
  box(-41, -28, 2.4, 1.6, 1.5, 'dumpster', { color: '#283618', id: 'dumpster_west' });
  // Cargo Wooden Crates / Pallets for cover
  box(42, -32, 1.8, 1.8, 1.2, 'crate', { color: '#bc6c25' });
  box(42, -34, 1.8, 1.8, 2.2, 'crate', { color: '#bc6c25' });

  // 3. West Drive-Thru Corridor (x = -44 to -34, z = -24 to 16)
  // Drive-Thru Order Menu Speaker Post & Canopy
  box(-38, -12, 0.8, 1.4, 2.2, 'mailbox', { id: 'sm_drivethru_menu', hp: 40, maxHp: 40, destroyed: false });
  // Steel Crash Bollards protecting the corner
  box(-38, 2, 0.35, 0.35, 1.1, 'post');
  box(-38, 12, 0.35, 0.35, 1.1, 'post');

  // 4. Center Parking Lot: Shopping Cart Corrals & Luxury SUVs
  // 2 Shopping Cart Corrals (metal tubular frames with rows of carts)
  box(-16, 4, 2.4, 5.4, 1.15, 'cartCorral');
  box(16, 4, 2.4, 5.4, 1.15, 'cartCorral');

  // Parked Luxury Suburban SUVs and Crossovers (tactical waist-high & head-high cover)
  const suvFleet = [
    // North Parking Row (z = -8)
    { x: -24, z: -8, w: 2.3, d: 4.6, color: '#d8d8d8' }, // Tesla Model X (Silver)
    { x: -8,  z: -8, w: 2.3, d: 4.6, color: '#1c1c1e' }, // Range Rover (Black)
    { x: 8,   z: -8, w: 2.3, d: 4.6, color: '#1b263b' }, // Suburban Minivan (Navy)
    { x: 24,  z: -8, w: 2.3, d: 4.6, color: '#f8f9fa' }, // Lexus RX (White)
    // South Parking Row (z = 18)
    { x: -24, z: 18, w: 2.3, d: 4.6, color: '#6b1d2f' }, // Porsche Cayenne (Burgundy)
    { x: -8,  z: 18, w: 2.3, d: 4.6, color: '#d4af37' }, // Cadillac Escalade (Champagne)
    { x: 8,   z: 18, w: 2.3, d: 4.6, color: '#2d4a22' }, // Jeep Wagoneer (Green)
    { x: 24,  z: 18, w: 2.3, d: 4.6, color: '#2b2d42' }, // Charcoal Crossover
  ];
  for (const suv of suvFleet) {
    box(suv.x, suv.z, suv.w, suv.d, 1.85, 'car', { color: suv.color, isCar: true, isSuv: true });
  }

  // Parking Island Curbs / Planters separating lanes
  box(0, -6, 2.2, 10, 0.35, 'post', { color: '#a0a0a0' });
  box(0, 16, 2.2, 10, 0.35, 'post', { color: '#a0a0a0' });

  // 5. South Plaza: EV Charging Stations & Monument Entrance
  // 4 EV Supercharging Kiosks
  const evChargers = [
    { x: -20, z: 32 }, { x: -12, z: 32 },
    { x: 12, z: 32 },  { x: 20, z: 32 },
  ];
  for (const ev of evChargers) {
    box(ev.x, ev.z, 0.6, 0.6, 1.6, 'evCharger');
  }

  // Strip Mall Monument Entrance Sign (South Center)
  box(0, 42, 6.4, 1.4, 2.8, 'house', { face: 's', color: '#d4c7b0', id: 0 });

  // Amazon / HOA Package Parcel Locker Bank
  const parcelLockers = [
    { id: 'sm_locker_1', kind: 'mailbox', pos: { x: -8, y: 0, z: 38 }, hp: 35, maxHp: 35, destroyed: false },
    { id: 'sm_locker_2', kind: 'mailbox', pos: { x: 8, y: 0, z: 38 }, hp: 35, maxHp: 35, destroyed: false },
    { id: 'sm_kiosk_1',  kind: 'mailbox', pos: { x: -3, y: 0, z: -22 }, hp: 25, maxHp: 25, destroyed: false },
    { id: 'sm_kiosk_2',  kind: 'mailbox', pos: { x: 3, y: 0, z: -22 }, hp: 25, maxHp: 25, destroyed: false },
  ];
  for (const pl of parcelLockers) {
    box(pl.pos.x, pl.pos.z, 0.5, 0.5, 1.4, 'mailbox', { id: pl.id, hp: pl.hp, maxHp: pl.maxHp, destroyed: pl.destroyed });
  }

  // Outdoor Cafe Glass Tables outside boutique coffee shop
  const glassTables = [
    { id: 'sm_table_1', kind: 'glassTable', pos: { x: 16, y: 0, z: -22 }, hp: 20, maxHp: 20, destroyed: false },
    { id: 'sm_table_2', kind: 'glassTable', pos: { x: 22, y: 0, z: -22 }, hp: 20, maxHp: 20, destroyed: false },
    { id: 'sm_table_3', kind: 'glassTable', pos: { x: 28, y: 0, z: -22 }, hp: 20, maxHp: 20, destroyed: false },
    { id: 'sm_table_4', kind: 'glassTable', pos: { x: 34, y: 0, z: -22 }, hp: 20, maxHp: 20, destroyed: false },
  ];
  for (const t of glassTables) {
    box(t.pos.x, t.pos.z, 1.6, 1.6, 0.85, 'glassTable', { id: t.id, hp: t.hp, maxHp: t.maxHp, destroyed: t.destroyed });
  }

  // Rocket Propane Tanks (Stored near delivery bay and outdoor patio display)
  const rocketPropane = [
    { id: 'sm_propane_1', kind: 'rocketPropane', pos: { x: 34, y: 0.5, z: -24 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
    { id: 'sm_propane_2', kind: 'rocketPropane', pos: { x: 42, y: 0.5, z: -26 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
    { id: 'sm_propane_3', kind: 'rocketPropane', pos: { x: -34, y: 0.5, z: 28 }, hp: 30, maxHp: 30, triggered: false, destroyed: false },
  ];
  for (const p of rocketPropane) {
    box(p.pos.x, p.pos.z, 0.6, 0.6, 1.1, 'rocketPropane', { id: p.id, hp: p.hp, maxHp: p.maxHp, triggered: false, destroyed: false });
  }

  // Ornamental Palm / Landscape Trees on islands and perimeter
  const trees = [
    [-34, -40], [34, -40], [-34, 40], [34, 40],
    [0, -8], [0, -2], [0, 14], [0, 20],
    [-28, 38], [28, 38], [-40, 0], [42, 0],
  ];
  trees.forEach(([x, z]) => box(x, z, 0.6, 0.6, 3.6, 'tree'));

  // Commercial Sprinklers on parking lot landscape strips
  const smSprinklerNodes = [
    [0, -5], [0, 17], [-28, 36], [28, 36],
    [-36, -34], [36, 34], [-40, -4], [40, -4],
  ];
  const sprinklers = smSprinklerNodes.map(([x, z], id) => Object.assign([x, z], {
    id: `sm_sprinkler_${id + 1}`,
    index: id,
    kind: 'sprinkler',
    pos: { x, y: 0, z },
    x, y: 0, z,
    radius: 2.6,
    arc: Math.PI,
    active: true,
    isSprinkler: true,
  }));

  const destructibles = [...parcelLockers, ...glassTables, ...rocketPropane];

  // Spawns: Team 0 = South Entrance & EV Stalls, Team 1 = North Storefront Promenade & Loading Bay
  // [x, z, yaw]: the +-8 pair faced a parked car 1.7 m away; they look past it toward the lot instead
  // (moving them out from behind the car exposed the spawn and swung casserole to 1/39)
  const spawns = {
    0: [[-8, 22, -0.6], [-4, 22], [4, 22], [8, 22, 0.6], [-18, 22], [18, 22], [28, 24], [34, 18]],
    1: [[-8, -22], [-4, -22], [4, -22], [8, -22], [-18, -22], [18, -22], [28, -24], [34, -18]],
  };

  // Nav nodes covering the entire map
  const nodeCoords = [
    // North Storefront Sidewalk & Cafe Terrace
    [-24, -22], [-18, -22], [-11, -22], [-4, -22], [4, -22], [11, -22], [18, -22], [24, -22], [30, -22], [36, -22],
    // Loading Dock & Freight Area
    [34, -28], [34, -36], [42, -28], [42, -38],
    // West Drive-Thru Corridor
    [-38, -22], [-38, -12], [-38, 0], [-38, 12], [-38, 24],
    // North Parking Aisle
    [-30, -14], [-16, -14], [0, -14], [16, -14], [30, -14],
    // Mid Parking Crossings (Between SUV rows)
    [-30, 4], [-24, 4], [-8, 4], [0, 4], [8, 4], [24, 4], [30, 4],
    // South Parking Aisle
    [-30, 24], [-16, 24], [0, 24], [16, 24], [30, 24],
    // South Plaza & EV Supercharger Row
    [-20, 34], [-12, 34], [0, 34], [12, 34], [20, 34],
    // Southern Entrance Boulevard
    [-8, 42], [-4, 43], [4, 43], [8, 42], [0, 44],
  ];

  const nodes = buildNavGraph(boxes, nodeCoords, { maxLink: 22, stepH: 1.15 });

  return {
    id: 'stripmall',
    // King of the Lawn opener: at the shared (0,0) team 0 took 70% of the opening zone and won 33 of
    // 40 seeds. Measured, not walk-modelled (the coarse nav graph mispredicts here): 24/16 at (7,-2).
    zonePos: { 'Cul-de-Sac Circle': { x: 7, z: -2 } },
    zoneNames: {
      'Cul-de-Sac Circle': 'Center Lot', 'Clubhouse': 'Center Lot', 'Gazebo Greenbelt': 'North Lot', 'Gazebo': 'North Lot',
      'South Driveway': 'South Lot', 'Pool Patio': 'South Lot', 'Northeast Front Lawn': 'East Lot', 'West Front Lawn': 'West Lot',
    },
    name: 'Sunset Strip Mall Parking Lot',
    label: 'Sunset Strip Mall Parking Lot',
    boxes,
    spawns,
    nodes,
    bounds: BOUNDS,
    court: { x: 0, z: 6, r: 18 },
    street: { minX: -14, maxX: 14, minZ: 26, maxZ: 48 },
    trees,
    sprinklers,
    sprinklerNodes: sprinklers,
    mailboxes: parcelLockers,
    glassTables,
    rocketPropane,
    rocketPropanes: rocketPropane,
    destructibles,
  };
}

/**
 * Model Home Showcase: two show homes face each other across one street, Nuketown-style. Small
 * (60 x 72 m) and point-symmetric: every solid at (x, z) has a twin at (-x, -z), so neither spawn
 * is the better side. The exact centre is kept open because it is the one spot equally far from
 * both spawns, which is where the centre objectives go (zonePos).
 */
export function buildModelHomeShowcase() {
  const B = { minX: -30, maxX: 30, minZ: -36, maxZ: 36 };
  const boxes = [];
  const box = (x, z, w, d, h, kind, extra = {}) => {
    const minY = extra.minY ?? 0;
    const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY, maxY: minY + h, kind, ...(kind === 'car' ? { isCar: true } : {}), ...extra };
    boxes.push(b);
    return b;
  };
  // Twin a solid through the centre.
  const pair = (x, z, w, d, h, kind, extra = {}, extra2 = extra) => { box(x, z, w, d, h, kind, extra); box(-x, -z, w, d, h, kind, extra2); };

  box(0, B.minZ - 0.5, B.maxX - B.minX + 2, 1, 2.6, 'wall');
  box(0, B.maxZ + 0.5, B.maxX - B.minX + 2, 1, 2.6, 'wall');
  box(B.minX - 0.5, 0, 1, B.maxZ - B.minZ, 2.6, 'wall');
  box(B.maxX + 0.5, 0, 1, B.maxZ - B.minZ, 2.6, 'wall');

  // The two model homes, front doors facing across the street
  box(0, 17, 14, 9, 5, 'house', { face: 'n', color: '#f2e6a6', id: 0 });
  box(0, -17, 14, 9, 5, 'house', { face: 's', color: '#b9d4e8', id: 1 });

  // Street: parked cars either side of an open centre
  pair(-5, -1.3, 4.4, 2, 1.5, 'car', { color: '#d9483b' }, { color: '#3b6fd9' });
  pair(17, 1.6, 4.4, 2, 1.5, 'car', { color: '#f2f2f2' }, { color: '#5a5a5a' });

  // Front yards: low hedges, bins, mailboxes
  pair(-6, 10, 5, 1, 1.2, 'hedge');
  pair(7, 10.5, 3, 1, 1.2, 'hedge');
  pair(11, 9, 0.7, 0.7, 1.1, 'trash');

  // Side-yard fences (jumpable) split each backyard from its flank lane
  pair(19, 18, 0.2, 10, 1.0, 'fence');
  pair(-19, 18, 0.2, 10, 1.0, 'fence');
  // Flank cover
  pair(-26, -5, 1, 5, 1.3, 'hedge');
  pair(24, -2, 2, 4.4, 1.5, 'car', { color: '#3a5a4a' }, { color: '#8a3a3a' });

  // Backyards: trampoline, bin
  pair(-10, 27, 3, 3, 0.9, 'trampoline');
  pair(14, 30, 0.7, 0.7, 1.1, 'trash');

  const trees = [[-24, 8], [24, -8], [24, 24], [-24, -24], [-15, 31], [15, -31]];
  trees.forEach(([x, z]) => box(x, z, 0.6, 0.6, 3.2, 'tree'));

  const prop = (id, kind, x, z, hp, extra = {}) => ({ id, kind, pos: { x, y: kind === 'rocketPropane' ? 0.5 : 0, z }, hp, maxHp: hp, destroyed: false, ...extra });
  const mailboxes = [prop('mailbox_s', 'mailbox', 3, 8, 25), prop('mailbox_n', 'mailbox', -3, -8, 25)];
  const glassTables = [prop('glassTable_s', 'glassTable', 8, 28, 20), prop('glassTable_n', 'glassTable', -8, -28, 20)];
  const rocketPropane = [prop('propane_s', 'rocketPropane', -16, 29, 30, { triggered: false }), prop('propane_n', 'rocketPropane', 16, -29, 30, { triggered: false })];
  for (const mb of mailboxes) box(mb.pos.x, mb.pos.z, 0.35, 0.35, 1.2, 'mailbox', { id: mb.id, hp: mb.hp, maxHp: mb.maxHp, destroyed: false });

  const sprinklers = [[-6, 7], [6, -7], [12, 13], [-12, -13]].map(([x, z], id) => Object.assign([x, z], {
    id: `showcase_sprinkler_${id + 1}`, index: id, kind: 'sprinkler', pos: { x, y: 0, z }, x, y: 0, z, radius: 2.4, arc: Math.PI, active: true, isSprinkler: true,
  }));

  // Team 0 = south backyard, team 1 = north backyard (mirrored)
  const south = [[-8, 31], [-4, 32], [0, 32], [4, 32], [8, 31], [-13, 33], [13, 33], [0, 29]];
  const spawns = { 0: south, 1: south.map(([x, z]) => [-x, -z]) };

  const xs = [-26, -18, -11, -4, 0, 4, 11, 18, 26], zs = [-32, -26, -18, -11, -6, 0, 6, 11, 18, 26, 32];
  const nodes = buildNavGraph(boxes, xs.flatMap(x => zs.map(z => [x, z])), { maxLink: 14, stepH: 0.45 });

  // Objective spots: centre zones on the open middle, home zones in the backyards, side zones as a mirrored pair.
  const zonePos = {
    'Cul-de-Sac Circle': { x: 0, z: 0 }, 'Clubhouse': { x: 0, z: 0 },
    'Gazebo Greenbelt': { x: 0, z: -25 }, 'Gazebo': { x: 0, z: -25 },
    'South Driveway': { x: 0, z: 25 }, 'Pool Patio': { x: 0, z: 25 },
    'Northeast Front Lawn': { x: 15, z: -8 }, 'West Front Lawn': { x: -15, z: 8 },
  };
  const zoneNames = {
    'Cul-de-Sac Circle': 'Open House Street', 'Clubhouse': 'Open House Street',
    'Gazebo Greenbelt': 'North Backyard', 'Gazebo': 'North Backyard',
    'South Driveway': 'South Backyard', 'Pool Patio': 'South Backyard',
    'Northeast Front Lawn': 'North Front Lawn', 'West Front Lawn': 'South Front Lawn',
  };

  return {
    boxes, spawns, nodes, zonePos, zoneNames,
    bounds: B,
    street: { minX: B.minX, maxX: B.maxX, minZ: -4, maxZ: 4 },
    court: { x: 0, z: 0, r: 4 },
    trees, sprinklers, sprinklerNodes: sprinklers,
    mailboxes, glassTables, rocketPropane, rocketPropanes: rocketPropane,
    destructibles: [...mailboxes, ...glassTables, ...rocketPropane],
  };
}

export const MAPS = {
  culdesac:   { id: 'culdesac',   label: 'Oakridge Cul-de-Sac',                name: 'Oakridge Cul-de-Sac',                demoAllowed: true,  freeInDemo: true,  build: buildCulDeSac },
  // Shady Pines Pickleball Club: Full custom layout with 4 tournament courts, nets, clubhouse, golf carts, bleachers!
  pickleball: { id: 'pickleball', label: 'Shady Pines Pickleball Club',        name: 'Shady Pines Pickleball Club',        demoAllowed: false, freeInDemo: false, wip: false, tagline: '4 neon courts and luxury golf carts!', build: buildPickleballClub },
  // Sunset Strip Mall Parking Lot: Supermarket & boutique storefronts, delivery docks, SUV corridors & EV superchargers!
  stripmall:  { id: 'stripmall',  label: 'Sunset Strip Mall Parking Lot',      name: 'Sunset Strip Mall Parking Lot',      demoAllowed: false, freeInDemo: false, wip: false, tagline: 'Dense SUV lanes and rooftop sniper perches!', build: buildStripMall },
  showcase:   { id: 'showcase',   label: 'Model Home Showcase',                name: 'Model Home Showcase',                demoAllowed: false, freeInDemo: false, wip: false, tagline: 'Two show homes, one street, zero escape.', build: buildModelHomeShowcase },
};

export function buildMap(mapId = 'culdesac') {
  const entry = MAPS[mapId] && !MAPS[mapId].wip ? MAPS[mapId] : MAPS.culdesac;
  const m = entry.build();
  m.id = entry.id;
  m.label = entry.label;
  return m;
}


