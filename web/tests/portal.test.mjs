// CrazyGames integration (web/src/engine/portal.js) and the store-link rule (funnel.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Portal } from '../src/engine/portal.js';
import { Funnel } from '../src/engine/funnel.js';

/** Minimal stand-in for window.CrazyGames.SDK that records calls. */
function fakeSdk({ environment = 'crazygames', instant = false, invite = null, user = { username: 'SingingCheese.TLNU' } } = {}) {
  const calls = [];
  const rec = name => (...a) => { calls.push([name, ...a]); };
  const sdk = {
    environment,
    init: async () => calls.push(['init']),
    game: {
      gameplayStart: rec('gameplayStart'), gameplayStop: rec('gameplayStop'), happytime: rec('happytime'),
      loadingStart: rec('loadingStart'), loadingStop: rec('loadingStop'),
      isInstantMultiplayer: instant,
      getInviteParam: k => (k === 'room' ? invite : null),
      inviteLink: p => `https://www.crazygames.com/game/call-of-karen?room=${p.room}`,
      updateRoom: rec('updateRoom'), leftRoom: rec('leftRoom'),
      addJoinRoomListener: cb => { sdk._join = cb; },
    },
    user: { isUserAccountAvailable: true, getUser: async () => user },
  };
  return { sdk, calls };
}

const fakeWin = sdk => ({ CrazyGames: { SDK: sdk } });

test('off CrazyGames: no script is loaded and every call is a harmless no-op', async () => {
  let appended = 0;
  const p = new Portal('itch', { win: {}, doc: { head: { appendChild: () => appended++ }, createElement: () => ({}) } });
  assert.equal(await p.init(), false);
  p.gameplayStart(); p.gameplayStop(); p.happytime(); p.updateRoom('ABCD', true); p.leftRoom();
  assert.equal(await p.username(), null);
  assert.equal(p.inviteLink('ABCD'), null);
  assert.equal(p.instantMultiplayer, false);
  assert.equal(appended, 0, 'no third-party script on other portals');
});

test('CrazyGames: lifecycle calls are de-duplicated, username and multiplayer flows go through the SDK', async () => {
  const { sdk, calls } = fakeSdk({ instant: true, invite: 'WXYZ' });
  const p = new Portal('crazygames', { win: fakeWin(sdk), doc: { head: { appendChild() {} }, createElement: () => ({}) } });
  assert.equal(await p.init(), true);
  p.gameplayStart(); p.gameplayStart(); p.gameplayStop(); p.gameplayStop();
  assert.deepEqual(calls.filter(c => c[0].startsWith('gameplay')).map(c => c[0]), ['gameplayStart', 'gameplayStop'], 'one call per real change (called every frame)');
  assert.equal(await p.username(), 'SingingCheese.TLNU');
  assert.equal(p.instantMultiplayer, true);
  assert.equal(p.invitedRoom(), 'WXYZ');
  assert.match(p.inviteLink('ABCD'), /crazygames\.com.*room=ABCD/);
  p.updateRoom('ABCD', true);
  assert.deepEqual(calls.find(c => c[0] === 'updateRoom')[1], { roomId: 'ABCD', isJoinable: true, inviteParams: { room: 'ABCD' } });
  let joined = null;
  p.onJoinRoom(r => { joined = r; });
  sdk._join({ room: 'QRST' });
  assert.equal(joined, 'QRST');
});

test('CrazyGames SDK on a non-whitelisted domain ("disabled") is treated as absent', async () => {
  const { sdk } = fakeSdk({ environment: 'disabled' });
  const p = new Portal('crazygames', { win: fakeWin(sdk), doc: { head: { appendChild() {} }, createElement: () => ({}) } });
  assert.equal(await p.init(), false);
  assert.equal(await p.username(), null);
});

test('store links: CrazyGames allows Steam only on the main menu, on desktop; other portals anywhere', () => {
  const cg = new Funnel({}, 'crazygames');
  assert.equal(cg.allowsStoreLink('menu', { touch: false }), true);
  assert.equal(cg.allowsStoreLink('menu', { touch: true }), false, 'no store links on mobile');
  for (const p of ['end_card', 'pause', 'locked_faction', 'end_row']) assert.equal(cg.allowsStoreLink(p, { touch: false }), false, p);
  const itch = new Funnel({}, 'itch');
  for (const p of ['menu', 'end_card', 'pause', 'locked_faction']) assert.equal(itch.allowsStoreLink(p, { touch: true }), true, p);
  // hidden buttons
  const mk = placement => ({ dataset: { steam: placement }, classList: { contains: () => false }, style: {}, href: '', textContent: '', removeAttribute() {} });
  const els = [mk('end_card'), mk('pause')];
  cg.wireSteamLinks({ querySelectorAll: () => els });
  assert.ok(els.every(e => e.style.display === 'none'));
});
