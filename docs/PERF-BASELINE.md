# Performance baseline: draw calls, triangle and frame budget

Measured with the fixed `tools/shot.mjs` on headless Chrome (Metal/ANGLE). Headless fps is **not**
the number a player sees - it is a stable, repeatable yardstick for before/after comparisons.

## How to measure

```sh
node tools/serve.mjs &                     # serves the web slice on :8642
node tools/shot.mjs "spectate=1&seed=7" /tmp/perf.png 10
```

Every shot run now prints a `perf:` line next to the console log and the screenshot:

```
perf: {"fps":17.6,"frames":176,"calls":719,"tris":47288,"programs":8,"textures":78,"geoms":316}
```

`calls` / `tris` come from `THREE.WebGLRenderer.info.render` via `window.__hoa.renderer.gl`.

## Baseline (seed 7, 10 s runs)

| Query | Draw calls | Triangles | Geometries | Headless fps |
|---|---|---|---|---|
| `spectate=1&seed=7` (full match) | 719 | 47.3k | 316 | ~18 |
| `demo=1&seed=7` | 108 | 18.9k | 63 | ~22 |
| `map=stripmall&seed=3` | n/a | n/a | n/a | ~21 |

## Where the draw calls go (spectate)

Scene audit of `spectate=1&seed=7`:

| Bucket | Meshes | Notes |
|---|---|---|
| Characters | 41 per character x ~16 | 4 shadow casters each (already trimmed from ~16) |
| Static world | 63 after merge | `mergeStatic()` collapses 331 world meshes -> 63 |
| Viewmodel | ~96 meshes total | Only the active weapon is visible (`setWeapon`), ~16 drawn |
| Sprites / badges | 12 | team markers |

So the frame is **character-bound**: cost scales linearly with the number of characters in play,
not with map detail. The world is already batched.

## Next lever (not done yet - needs a visual regression pass)

To get character cost down, the 41 meshes per character have to shrink. The safe shape of that work:

1. Merge leaf meshes that hang off the same animated node (ears / nose / hands / hat pieces /
   gun parts) into one mesh per animated node.
2. Do **not** introduce a shared per-colour material cache to make that merge possible: materials in
   `character.js` are per-character on purpose (damage flash, gold skin, team accents), so sharing
   them would leak one character's flash onto every other character.

Step 1 is the piece worth doing, and it should be validated by screenshot diff (the viewmodel and
character silhouettes are the two things players look at every frame).

## Fixed in this pass

- `Game.update()` threw `ReferenceError: sim is not defined` on every frame, so the canvas stayed
  blank (11 KB blank screenshot). Update now aliases `sim`, and the slice renders a full match
  (590 KB screenshot, 719 draws, 120+ frames advanced).

## Draw-call breakdown (measured 2026-10-19)

Measured with `node tools/shot.mjs "spectate=1&seed=7&perf=1&map=<id>"` on the
current build: **culdesac ~640, pickleball ~700-770, stripmall ~775-800 draws**
(variation is bot spread and frustum culling, not the map).

Where they go on stripmall (`renderer.worldDraws` + a scene walk):

| bucket | meshes | notes |
|---|---|---|
| characters (12 bots) | ~475 | 33-39 meshes each, ~65 tris each |
| static world after `mergeStatic` | 80 | it already collapses 425 -> 80 |
| fx / transparent / dynamic props | ~240 | 83 fx meshes, casserole, rings, mower, sprites |

So **static batching is already done** and W2's "under 250" is not reachable by
batting the map: the world is 80 draws and the characters are 475.

Why the characters cannot be batched: a character is 33 parts but only ~13
distinct appearances, and the parts that share an appearance live under
*different* bones (left hand and right hand, hip and shoulder). Merging them
per bone was implemented and measured at 798 -> 776 draws (2%), i.e. not worth
the code, so it is not in the tree. The real cost is one draw per small part per
bot, which needs one of:

1. **Character LOD** - hide sub-15 cm detail (ears, nose, shoe caps, weapon
   trim, headwear) beyond ~18 m, where it is sub-pixel anyway. Cheapest real win,
   no art change, but it only pays off when bots are far, and on these maps they
   are often close.
2. **One material atlas per character** (all parts share a texture, so the
   rigid parts of a bone merge into one draw). Needs the character art rebuilt
   around an atlas; that is a project, not a task.
3. **FX pooling** - the ~240 fx/transparent draws are short-lived particles that
   each own a mesh; one pooled InstancedMesh per effect type would remove most
   of them.

Until one of those lands, phone-tier performance should be judged on *tris*
(~50k, fine) and on the quality tier (`?quality=low`), not on the 250 number.

## Measurement trap: a stale server reports believable numbers

`tools/shot.mjs` used to trust whatever answered on 8642. A leftover
`node tools/serve.mjs` from an **older checkout** (`~/Games/hoa-warfare`) was
answering there, so a run could silently measure a different build - it reported
`calls: 0` with a `sim is not defined` exception out of a long-fixed `update()`.
`shot.mjs` now compares the served `web/src/engine/game.js` against this
checkout and refuses to run otherwise. If it fails, `pkill -f "tools/serve.mjs 8642"`
and start the server from this repo.
