import test from 'node:test';
import assert from 'node:assert/strict';

// Provide minimal headless DOM for textures and Three.js in Node
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      width: 16,
      height: 16,
      getContext: () => ({
        fillStyle: '#000000',
        fillRect: () => {},
      }),
    }),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
  };
}

const THREE = await import('../vendor/three.module.min.js');
const { Renderer, MUZZLE_OFFSETS } = await import('../src/engine/render.js');

function createMockRenderer() {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 400);
  const muzzleLight = new THREE.PointLight('#ffec27', 0, 15);
  camera.add(muzzleLight);

  const mock = {
    camera,
    muzzleLight,
    vmMeshes: {},
    muzzleOffsets: MUZZLE_OFFSETS,
    currentVmType: 'blaster',
    switchTimer: 0,
    bob: 0,
    kick: 0,
  };

  mock.buildViewmodel = Renderer.prototype.buildViewmodel.bind(mock);
  mock.setWeapon = Renderer.prototype.setWeapon.bind(mock);
  mock.getMuzzleOffset = Renderer.prototype.getMuzzleOffset.bind(mock);

  mock.buildViewmodel();
  return mock;
}

test('viewmodel: buildViewmodel generates all 6 weapon models (blaster, smg, shotgun, sniper, lmg, pistol)', () => {
  const r = createMockRenderer();
  const expectedWeapons = ['blaster', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol'];

  for (const name of expectedWeapons) {
    assert.ok(r.vmMeshes[name], `Weapon viewmodel '${name}' must exist in vmMeshes`);
    assert.ok(r.vmMeshes[name] instanceof THREE.Group, `'${name}' must be a THREE.Group`);
    assert.ok(r.viewmodel.children.includes(r.vmMeshes[name]), `Viewmodel group must contain '${name}'`);
  }

  assert.equal(Object.keys(r.vmMeshes).length, 6, 'Exactly 6 weapon models must be generated');
});

test('viewmodel: each model has valid Three.js mesh geometries and non-empty children', () => {
  const r = createMockRenderer();
  const weaponNames = ['blaster', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol'];

  for (const name of weaponNames) {
    const model = r.vmMeshes[name];
    assert.ok(model.children.length > 0, `Weapon '${name}' must have non-empty children (got ${model.children.length})`);

    // Verify each child is a valid Three.js mesh with non-empty BufferGeometry
    for (let i = 0; i < model.children.length; i++) {
      const child = model.children[i];
      assert.ok(child instanceof THREE.Mesh, `Child ${i} of '${name}' should be a THREE.Mesh`);
      assert.ok(child.geometry, `Child ${i} of '${name}' must have a geometry`);
      assert.ok(child.geometry instanceof THREE.BufferGeometry, `Geometry of child ${i} in '${name}' must be BufferGeometry`);

      const posAttr = child.geometry.attributes.position;
      assert.ok(posAttr, `Geometry of child ${i} in '${name}' must have position attribute`);
      assert.ok(posAttr.count > 0, `Position attribute of child ${i} in '${name}' must have vertices (count > 0)`);
      assert.ok(child.material, `Child ${i} of '${name}' must have a material`);
    }
  }
});

test('viewmodel: setWeapon correctly toggles visibility so only the active weapon is visible', () => {
  const r = createMockRenderer();
  const weaponNames = ['blaster', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol'];

  for (const activeWeapon of weaponNames) {
    r.setWeapon(activeWeapon);

    for (const name of weaponNames) {
      if (name === activeWeapon) {
        assert.equal(r.vmMeshes[name].visible, true, `'${name}' should be visible when setWeapon('${activeWeapon}') is called`);
      } else {
        assert.equal(r.vmMeshes[name].visible, false, `'${name}' should be hidden when setWeapon('${activeWeapon}') is called`);
      }
    }
    assert.equal(r.currentVmType, activeWeapon, `currentVmType should be '${activeWeapon}'`);
  }

  // Also verify class alias 'ar' maps to 'blaster'
  r.setWeapon('ar');
  assert.equal(r.vmMeshes.blaster.visible, true, "'blaster' should be visible when setWeapon('ar') is called");
  assert.equal(r.vmMeshes.smg.visible, false);
  assert.equal(r.vmMeshes.shotgun.visible, false);
  assert.equal(r.vmMeshes.sniper.visible, false);
  assert.equal(r.vmMeshes.lmg.visible, false);
  assert.equal(r.vmMeshes.pistol.visible, false);
});

test('viewmodel: each weapon class and viewmodel has defined muzzle coordinates', () => {
  const r = createMockRenderer();
  const weaponClasses = ['ar', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol'];
  const viewmodels = ['blaster', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol'];

  // Verify viewmodel mesh muzzlePos properties
  for (const vmName of viewmodels) {
    const mesh = r.vmMeshes[vmName];
    assert.ok(mesh.muzzlePos, `Model '${vmName}' must have defined muzzlePos`);
    assert.equal(typeof mesh.muzzlePos.x, 'number', `'${vmName}' muzzlePos.x must be a number`);
    assert.equal(typeof mesh.muzzlePos.y, 'number', `'${vmName}' muzzlePos.y must be a number`);
    assert.equal(typeof mesh.muzzlePos.z, 'number', `'${vmName}' muzzlePos.z must be a number`);
    assert.ok(mesh.muzzlePos.z < 0, `'${vmName}' muzzlePos.z must extend forward (-z) towards barrel tip`);
  }

  // Verify getMuzzleOffset works for both weapon class and viewmodel names
  for (const cls of weaponClasses) {
    const m = r.getMuzzleOffset(cls);
    assert.ok(m, `Weapon class '${cls}' must return defined muzzle offset`);
    assert.equal(typeof m.x, 'number');
    assert.equal(typeof m.y, 'number');
    assert.equal(typeof m.z, 'number');
    assert.ok(m.z < 0, `Class '${cls}' muzzle offset z must point down-range`);
  }

  // Verify exported MUZZLE_OFFSETS dictionary
  for (const name of [...weaponClasses, ...viewmodels]) {
    assert.ok(MUZZLE_OFFSETS[name], `MUZZLE_OFFSETS must have entry for '${name}'`);
    assert.equal(typeof MUZZLE_OFFSETS[name].x, 'number');
    assert.equal(typeof MUZZLE_OFFSETS[name].y, 'number');
    assert.equal(typeof MUZZLE_OFFSETS[name].z, 'number');
  }
});

test('viewmodel: dynamic muzzle flash and light align with the selected weapon barrel tip', () => {
  const r = createMockRenderer();

  // Test pistol: short barrel (z ~ -0.18)
  r.setWeapon('pistol');
  assert.equal(r.flash.position.z, MUZZLE_OFFSETS.pistol.z);
  assert.equal(r.flash.position.y, MUZZLE_OFFSETS.pistol.y);

  // Test sniper: long barrel (z ~ -0.65)
  r.setWeapon('sniper');
  assert.equal(r.flash.position.z, MUZZLE_OFFSETS.sniper.z);
  assert.equal(r.flash.position.y, MUZZLE_OFFSETS.sniper.y);

  // Test shotgun: twin barrels (z ~ -0.41)
  r.setWeapon('shotgun');
  assert.equal(r.flash.position.z, MUZZLE_OFFSETS.shotgun.z);
  assert.equal(r.flash.position.y, MUZZLE_OFFSETS.shotgun.y);

  // Test LMG: heavy barrel (z ~ -0.57)
  r.setWeapon('lmg');
  assert.equal(r.flash.position.z, MUZZLE_OFFSETS.lmg.z);
  assert.equal(r.flash.position.y, MUZZLE_OFFSETS.lmg.y);

  // Muzzle light should be positioned in camera space aligned with viewmodel muzzle
  const expectedLightZ = r.viewmodel.position.z + MUZZLE_OFFSETS.lmg.z * r.viewmodel.scale.z;
  assert.ok(Math.abs(r.muzzleLight.position.z - expectedLightZ) < 1e-4, 'muzzleLight Z should align with barrel tip');
});

test('viewmodel: weapon switching triggers smooth transition timer', () => {
  const r = createMockRenderer();
  r.switchTimer = 0;
  r.setWeapon('shotgun');
  assert.ok(r.switchTimer > 0, 'setWeapon should activate switchTimer for smooth transition');
});
