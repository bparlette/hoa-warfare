// Detail LOD: sub-16 cm character parts (ears, nose, shoe caps, weapon trim) are
// hidden past 13 m, where they are about a pixel wide on a phone. This is the
// only draw-call cut on characters that exists without rebuilding the art, so
// it must never hide something that matters: animated parts, transparent parts
// and body-sized parts all stay. See web/src/engine/lod.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { updateDetailLod, detailPartCount } from '../src/engine/lod.js';

const tiny = () => new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial());
const big = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial());

function makeView() {
  const root = new THREE.Group();
  const head = big(); // animated by field reference
  const ear = tiny();
  const nose = tiny();
  const torso = big();
  head.add(ear, nose);
  root.add(head, torso);
  const view = { root, head, torso };
  return { view, head, ear, nose, torso };
}

const at = (x, y = 0, z = 0) => new THREE.Vector3(x, y, z);

test('detail LOD hides sub-pixel parts past 13 m and shows them up close', () => {
  const { view, ear, nose, torso } = makeView();
  assert.equal(detailPartCount(view), 2, 'the ear and the nose are the detail parts');

  updateDetailLod(view, at(40));
  assert.equal(ear.visible, false, 'far away the ear is not drawn');
  assert.equal(nose.visible, false, 'nor the nose');
  assert.equal(torso.visible, true, 'the body always draws');

  updateDetailLod(view, at(3));
  assert.equal(ear.visible, true, 'walking up brings the detail back');
  assert.equal(nose.visible, true, 'both parts come back');
});

test('detail LOD never hides a part the view animates by field reference', () => {
  const { view, head } = makeView();
  // The head itself is body-sized, but assert the rule directly: any mesh held
  // on the view is skipped, even if it is tiny.
  const small = tiny();
  view.gun = small;
  view.root.add(small);
  assert.equal(detailPartCount(view), 2, 'the animated part is not counted as detail');
  updateDetailLod(view, at(50));
  assert.equal(small.visible, true, 'an animated part is never hidden');
  assert.equal(head.visible, true, 'and the head still draws');
});

test('detail LOD leaves transparent parts alone so they keep their own sort', () => {
  const view = { root: new THREE.Group() };
  const ghost = tiny();
  ghost.material.transparent = true;
  ghost.material.opacity = 0.4;
  view.root.add(ghost);
  updateDetailLod(view, at(60));
  assert.equal(ghost.visible, true, 'a ghost silhouette is not detail');
});

test('detail LOD is a no-op until the character crosses the threshold', () => {
  const { view, ear } = makeView();
  assert.equal(updateDetailLod(view, at(2)), 2, 'first call applies and reports the part count');
  assert.equal(updateDetailLod(view, at(4)), 0, 'still near: no work');
  assert.equal(updateDetailLod(view, at(30)), 2, 'crossing out applies once');
  assert.equal(updateDetailLod(view, at(31)), 0, 'still far: no work');
  assert.equal(ear.visible, false, 'and it stays hidden');
});
