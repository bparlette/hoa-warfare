import test from 'node:test';
import assert from 'node:assert/strict';

// Provide minimal headless DOM for textures.js pixelTex
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

const { CharacterView, Ragdoll } = await import('../src/engine/character.js');

test('character: procedural bullet flinch / stagger twists torso and recovers', () => {
  const c = new CharacterView({
    faction: 'hoaDads',
    look: { accent: '#29adff', hat: 'trucker', shirt: '#ffffff', pants: '#333333' },
    seed: 'flinch-test',
    team: 0,
    isLocalTeam: true,
  });

  // Base state: torso rotation at rest is 0
  assert.equal(c.torso.rotation.x, 0);
  assert.equal(c.torso.rotation.y, 0);
  assert.equal(c.torso.rotation.z, 0);

  // Take bullet damage: hit from the right (+x in world coords)
  const snapHit = {
    alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, onGround: true,
    hitAgo: 0, hitDir: { x: 1, y: 0, z: 0 },
  };
  c.update(snapHit, 0.016);

  // Torso should lean back (rotation.x > 0) and twist away from the right (rotation.y < 0)
  assert.ok(c.torso.rotation.x > 0.08, `expected lean back, got ${c.torso.rotation.x}`);
  assert.ok(c.torso.rotation.y < -0.08, `expected twist away, got ${c.torso.rotation.y}`);

  // After 0.12s, flinch has smoothly decayed but is still active
  const initialX = c.torso.rotation.x;
  const initialY = c.torso.rotation.y;
  snapHit.hitAgo = 0.12;
  c.update(snapHit, 0.016);
  assert.ok(c.torso.rotation.x < initialX && c.torso.rotation.x > 0, 'lean should smoothly decay');
  assert.ok(c.torso.rotation.y > initialY && c.torso.rotation.y < 0, 'twist should smoothly decay');

  // After 0.25s, flinch has fully recovered back to 0
  snapHit.hitAgo = 0.26;
  c.update(snapHit, 0.016);
  assert.equal(c.torso.rotation.x, 0);
  assert.equal(c.torso.rotation.y, 0);
  assert.equal(c.torso.rotation.z, 0);
});

test('character: headshot hat pop detaches headwear with upward/outward impulse and gravity tumble', () => {
  const c = new CharacterView({
    faction: 'karens',
    look: { accent: '#ff004d', hat: 'bob', shirt: '#ff004d', pants: '#111111' },
    seed: 'headshot-test',
    team: 1,
    isLocalTeam: false,
  });

  const dummyScene = { add: () => {}, remove: () => {} };

  // 1. Non-headshot death: hat stays attached, standard 6 pieces
  const rBody = c.ragdoll(dummyScene, { x: 1, z: 0 }, { headshot: false });
  assert.equal(rBody.pieces.length, 6);
  assert.equal(c.headwear.parent, c.head);
  assert.ok(!rBody.pieces.some(p => p.isHat));

  // 2. Headshot kill: hat pops off as debris piece
  const dir = { x: 1, y: 0, z: -0.5 };
  const rHead = c.ragdoll(dummyScene, dir, { headshot: true });

  // Hat is detached from the character's head
  assert.equal(c.headwear.parent, null);

  // Hat piece is added to ragdoll pieces
  assert.equal(rHead.pieces.length, 7);
  const hatPiece = rHead.pieces.find(p => p.isHat);
  assert.ok(hatPiece, 'hat debris piece exists');

  // Hat has upward impulse vy in range [4.5, 6.5]
  assert.ok(hatPiece.v.y >= 4.5 && hatPiece.v.y <= 6.6, `expected vy in [4.5, 6.5], got ${hatPiece.v.y}`);
  // Hat has outward impulse vx based on dir.x * 2.5 ± 0.75
  assert.ok(hatPiece.v.x >= 1.75 && hatPiece.v.x <= 3.25, `expected vx near 2.5, got ${hatPiece.v.x}`);
  // Rotational tumble is set
  assert.ok(hatPiece.w.x !== 0 || hatPiece.w.y !== 0 || hatPiece.w.z !== 0, 'rotational tumble present');

  // Tumbles with gravity in update
  const preY = hatPiece.obj.position.y;
  const preVy = hatPiece.v.y;
  rHead.update(0.1);
  assert.ok(hatPiece.v.y < preVy, 'gravity pulled velocity down');
  assert.ok(hatPiece.obj.position.y !== preY, 'position updated with velocity');

  // 3. Respawn re-attaches headwear when alive
  c.update({ alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, onGround: true }, 0.016);
  assert.equal(c.headwear.parent, c.head, 'headwear re-attached on respawn');
});
