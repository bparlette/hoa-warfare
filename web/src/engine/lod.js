// Detail LOD for characters.
//
// A CharacterView is 33-39 meshes and a third of them are tiny detail: ears, a
// nose, shoe toe caps, a scope, a magazine, hair tufts. At 15 m a nose is about
// one pixel wide on a phone (390 px tall frame, 16 cm part), so drawing it costs
// a draw call for nothing. Measured on stripmall with every sub-16 cm part
// hidden: 798 -> 546 draw calls, -11k tris.
//
// So: cache the tiny parts once per character, then hide them past a distance.
// Nothing here touches anything the view animates by field reference, anything
// transparent (sorting), or anything that casts a real shadow silhouette.
const DETAIL_RADIUS = 0.16; // metres; 16 cm is <= ~2 px beyond 12 m
const DETAIL_DISTANCE = 13; // hide detail past this many metres

const cache = new WeakMap();

function partsOf(view, radius) {
  let parts = cache.get(view);
  if (parts) return parts;
  const animated = new Set();
  for (const v of Object.values(view)) if (v && v.isMesh) animated.add(v);
  parts = [];
  view.root.traverse(o => {
    if (!o.isMesh || animated.has(o)) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.transparent) return;
    const g = o.geometry;
    if (!g) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const s = Math.max(o.scale.x, o.scale.y, o.scale.z);
    if ((g.boundingSphere?.radius ?? 1) * s > radius) return;
    parts.push(o);
  });
  cache.set(view, parts);
  return parts;
}

/**
 * Show or hide a character's sub-pixel detail based on distance to the camera.
 * Cheap enough for the per-frame loop: it early-outs until the distance crosses
 * the threshold in either direction.
 */
export function updateDetailLod(view, cameraPos, radius = DETAIL_RADIUS, distance = DETAIL_DISTANCE) {
  if (!view?.root || !cameraPos) return 0;
  const dy = view.root.position.distanceTo(cameraPos);
  const near = dy <= distance;
  if (view.detailLodNear === near) return 0;
  view.detailLodNear = near;
  const parts = partsOf(view, radius);
  for (const p of parts) p.visible = near;
  return parts.length;
}

/** Number of detail parts a character has (for the perf tool / tests). */
export function detailPartCount(view, radius = DETAIL_RADIUS) {
  return partsOf(view, radius).length;
}
