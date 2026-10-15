// Cul-de-Sac: the Phase 0 signature map. Pure data + geometry, no three.js, so the sim and tests
// can use it headlessly. Units are metres. x = east, z = south (toward the street), y = up.
// Every solid is an axis-aligned box {minX,maxX,minY,maxY,minZ,maxZ,kind,...}. The renderer
// decides what each `kind` looks like; the sim only cares about the box.

export const BOUNDS = { minX: -44, maxX: 44, minZ: -48, maxZ: 48 };
export const COURT = { x: 0, z: 0, r: 13 };
export const STREET = { minX: -5, maxX: 5, minZ: 0, maxZ: 48 };

export function buildCulDeSac() {
  const boxes = [];
  const box = (x, z, w, d, h, kind, extra = {}) => {
    const minY = extra.minY ?? 0;
    const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY, maxY: minY + h, kind, ...extra };
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
  box(-7.5, 5, 2, 4.4, 1.5, 'car', { color: '#d9483b' });
  box(8, -6, 4.4, 2, 1.5, 'car', { color: '#3b6fd9' });
  box(0, -7, 3, 3, 0.9, 'trampoline');
  box(-9, -14, 5, 1.2, 1.6, 'hedge');
  box(9, -14, 5, 1.2, 1.6, 'hedge');
  box(11.5, 7.5, 0.7, 0.7, 1.1, 'trash');
  box(-12, -4, 0.7, 0.7, 1.1, 'trash');
  for (const [x, z] of [[-6.2, 10], [6.2, 12], [-13.5, 16], [13.5, -16]]) box(x, z, 0.35, 0.35, 1.2, 'mailbox');

  // Street + south spawn cover
  box(3, 30, 2, 4.4, 1.5, 'car', { color: '#f2f2f2' });
  box(-3.5, 21, 2, 4.4, 1.5, 'car', { color: '#5a5a5a' });
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

  return { boxes, spawns, nodes, bounds: BOUNDS, court: COURT, street: STREET, trees };
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
