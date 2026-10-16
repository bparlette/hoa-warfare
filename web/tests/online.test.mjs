// Online play: server hardening, protocol, lifecycle, lag compensation, and a full client session
// against a real server. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { createMultiplayerServer, Room, RoomManager, sanitizeName, sanitizeRoomCode, readDemoFactions, LIMITS } from '../../server/multiplayer.mjs';
import { OnlineSession, cleanName } from '../src/engine/online.js';
import { NetClient } from '../src/engine/net.js';
import { Sim } from '../src/engine/sim.js';
import { mulberry32 } from '../src/core/rng.js';

const content = JSON.parse(readFileSync(new URL('../../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../../data/weapons.json', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const url = (port, q = '') => `ws://127.0.0.1:${port}/ws?${q}`;

/** Raw HTTP upgrade request so we can send odd headers; resolves with the status line. */
function rawUpgrade(port, path, headers = {}, { keepOpen = false } = {}) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1', () => {
      const h = { Host: `127.0.0.1:${port}`, Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13', ...headers };
      s.write(`GET ${path} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    });
    s.once('data', d => { const line = d.toString().split('\r\n')[0]; if (!keepOpen) s.destroy(); resolve(keepOpen ? { line, socket: s } : line); });
    s.on('error', () => resolve('error'));
  });
}

/** Browser-style masked client frame. */
function maskedFrame(payload, opcode = 0x1) {
  const body = Buffer.from(payload);
  const key = Buffer.from([1, 2, 3, 4]);
  let header;
  if (body.length < 126) header = Buffer.from([0x80 | opcode, 0x80 | body.length]);
  else { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 0x80 | 126; header.writeUInt16BE(body.length, 2); }
  const masked = Buffer.from(body.map((b, i) => b ^ key[i % 4]));
  return Buffer.concat([header, key, masked]);
}

// ------------------------------------------------------------------ sanitising

test('names and room codes are sanitised (names are rendered into other players\' HUD)', () => {
  assert.equal(sanitizeName('<img src=x onerror=alert(1)>'), 'img srcx onerror', 'markup characters removed, cut to 16');
  assert.equal(sanitizeName('  Karen   Queen  '), 'Karen Queen');
  assert.equal(sanitizeName('A'.repeat(40)).length, 16);
  assert.equal(sanitizeName(''), 'Player');
  assert.equal(sanitizeName(null), 'Player');
  assert.equal(sanitizeName('Zoë 王'), 'Zoë 王');
  assert.equal(sanitizeRoomCode('../etc/passwd'), 'etcpasswd');
  assert.equal(sanitizeRoomCode('ab cd!'), 'abcd');
  assert.equal(cleanName('<b>x</b>'), 'bxb', 'the client applies the same rule');
  assert.ok(!/[<>&"']/.test(sanitizeName('a<b>&"\'c')));
});

// ------------------------------------------------------------------ hardening

test('server refuses bad handshakes, wrong origins, and floods of connections from one IP', async () => {
  const srv = await createMultiplayerServer(0, { allowedOrigins: ['https://good.example'], maxPerIp: 2 });
  const port = srv.server.address().port;
  try {
    assert.match(await rawUpgrade(port, '/ws', { 'Sec-WebSocket-Version': '8' }), /400/, 'wrong websocket version');
    assert.match(await rawUpgrade(port, '/ws', { Origin: 'https://evil.example' }), /403/, 'origin not allowed');
    const ok = await rawUpgrade(port, '/ws?room=a', { Origin: 'https://good.example' }, { keepOpen: true });
    assert.match(ok.line, /101/);
    const ok2 = await rawUpgrade(port, '/ws?room=b', { Origin: 'https://good.example' }, { keepOpen: true });
    assert.match(ok2.line, /101/);
    assert.match(await rawUpgrade(port, '/ws?room=c', { Origin: 'https://good.example' }), /429/, 'third connection from the same IP');
    ok.socket.destroy(); ok2.socket.destroy();
    await sleep(100);
    assert.match(await rawUpgrade(port, '/ws?room=d', { Origin: 'https://good.example' }), /101/, 'slot frees when a socket closes');
  } finally { await srv.close(); }
});

test('oversized, unmasked and fragmented frames close the connection instead of growing memory', async () => {
  const srv = await createMultiplayerServer(0);
  const port = srv.server.address().port;
  try {
    const closeCode = async frame => {
      const { socket } = await rawUpgrade(port, '/ws?room=frames', {}, { keepOpen: true });
      const code = new Promise(resolve => socket.on('data', d => { if ((d[0] & 0x0f) === 0x8 && d.length >= 4) resolve(d.readUInt16BE(2)); }));
      socket.write(frame);
      const r = await Promise.race([code, sleep(500).then(() => 'none')]);
      socket.destroy();
      return r;
    };
    // the first data event also carries the init packet; wait for a close frame specifically
    assert.equal(await closeCode(maskedFrame('x'.repeat(5000))), 1009, 'message over 4 KB');
    assert.equal(await closeCode(Buffer.from([0x81, 0x01, 0x78])), 1002, 'client frames must be masked');
    const frag = maskedFrame('{"type":"ping"}'); frag[0] = 0x01; // FIN bit cleared
    assert.equal(await closeCode(frag), 1003, 'fragmented message');
    const huge = Buffer.concat([Buffer.from([0x81, 0xff]), Buffer.alloc(8), Buffer.alloc(4)]); huge.writeBigUInt64BE(2n ** 40n, 2);
    assert.equal(await closeCode(huge), 1009, 'claimed 1 TB payload is refused before buffering');
  } finally { await srv.close(); }
});

test('hostile input is clamped: NaN/Infinity angles, out-of-range sticks, bad weapon slot, odd faction and name', async () => {
  const srv = await createMultiplayerServer(0);
  const port = srv.server.address().port;
  try {
    const ws = new WebSocket(url(port, `room=hostile&name=${encodeURIComponent('<script>alert(1)</script>')}&faction=notAFaction`));
    const msgs = [];
    ws.onmessage = e => msgs.push(JSON.parse(e.data));
    await new Promise(r => { ws.onopen = r; });
    await sleep(50);
    const init = msgs.find(m => m.type === 'init');
    const me = init.players.find(p => p.id === init.actorId);
    assert.equal(me.name, 'scriptalert1scri', 'markup stripped, cut to 16');
    assert.equal(me.faction, 'karens', 'unknown faction falls back instead of crashing other clients');
    ws.send(JSON.stringify({ type: 'input', seq: 1, keys: { fire: true }, mv: [1e9, -Infinity], yaw: 1e300, pitch: 99, weaponSlot: 'bfg' }));
    ws.send('{"type":"input","seq":2,"yaw":null,"pitch":"x","keys":7,"mv":"no"}');
    ws.send('not json');
    ws.send('null');
    await sleep(250);
    const room = srv.roomManager.getRoom('hostile');
    const a = [...room.clients.values()][0].actor;
    assert.ok(Number.isFinite(a.pos.x + a.pos.y + a.pos.z + a.yaw + a.pitch), 'position and angles stay finite');
    assert.ok(Math.abs(a.input.pitch) <= 1.45 && Math.abs(a.input.forward) <= 1 && Math.abs(a.input.right) <= 1);
    assert.notEqual(a.input.switchSlot, 'bfg');
    ws.close();
  } finally { await srv.close(); }
});

test('a client that floods messages is rate limited, not simulated', async () => {
  const srv = await createMultiplayerServer(0);
  const port = srv.server.address().port;
  try {
    const { socket } = await rawUpgrade(port, '/ws?room=flood', {}, { keepOpen: true });
    const room = srv.roomManager.getRoom('flood');
    let seen = 0;
    const orig = room.applyInput.bind(room);
    room.applyInput = (s, p) => { seen++; orig(s, p); };
    const frame = maskedFrame(JSON.stringify({ type: 'input', seq: 1, keys: {} }));
    for (let i = 0; i < 1000; i++) socket.write(frame);
    await sleep(300);
    socket.destroy();
    assert.ok(seen <= LIMITS.maxMsgPerSec + 5, `processed ${seen} of 1000`);
    assert.ok(seen > 50, 'but normal traffic gets through');
  } finally { await srv.close(); }
});

// ------------------------------------------------------------------ rooms

test('quick match fills one public room first; full rooms and the room cap refuse politely', async () => {
  const srv = await createMultiplayerServer(0, { maxRooms: 2, maxPerIp: 30 });
  const port = srv.server.address().port;
  const clients = [];
  try {
    const roomOf = async () => { const s = await OnlineSession.join({ url: url(port, 'room=auto&name=P'), NetClientClass: NetClient }); clients.push(s); return s.roomCode; };
    const a = await roomOf(), b = await roomOf();
    assert.equal(a, b, 'second quick-matcher lands in the same room');
    assert.match(a, /^Q-/);
    for (let i = 0; i < 6; i++) await roomOf();
    const ninth = await roomOf();
    assert.notEqual(ninth, a, 'a full room (8 humans) sends the next player to a new room');
    // direct join of a full room is refused with 'room_full'
    await assert.rejects(OnlineSession.join({ url: url(port, `room=${a}&name=X`) }), /room_full/);
    // third distinct room exceeds the cap of 2
    await assert.rejects(OnlineSession.join({ url: url(port, 'room=custom&name=X'), timeoutMs: 1500 }));
  } finally { for (const c of clients) c.close(); await srv.close(); }
});

test('empty rooms are closed (an empty room would simulate bots forever)', async () => {
  const mgr = new RoomManager();
  const room = mgr.getOrCreateRoom('lonely');
  const fake = { writable: true, destroyed: false, writableLength: 0, write() {}, end() {}, destroy() {} };
  room.addPlayer(fake, { name: 'Solo' });
  assert.equal(mgr.reapEmpty(performance.now() + 60000), 0, 'occupied rooms stay');
  room.removePlayer(fake);
  assert.equal(mgr.reapEmpty(performance.now() + 1000, 5000), 0, 'within the grace period');
  assert.equal(mgr.reapEmpty(performance.now() + 6000, 5000), 1);
  assert.equal(mgr.rooms.size, 0);
  assert.equal(room.interval, null, 'its simulation timer is stopped');
});

test('bots only use demo factions when the server runs in demo mode (their voice lines ship in the demo zip)', async () => {
  const demo = readDemoFactions();
  assert.ok(demo?.length >= 4, `demo factions: ${demo}`);
  const srv = await createMultiplayerServer(0, { demo: true });
  const port = srv.server.address().port;
  try {
    const s = await OnlineSession.join({ url: url(port, 'room=demo&name=P&faction=karens') });
    const bots = s.players.filter(p => p.bot);
    assert.ok(bots.length >= 6);
    assert.ok(bots.every(b => demo.includes(b.faction)), bots.map(b => b.faction).join());
    s.close();
  } finally { await srv.close(); }
});

// ------------------------------------------------------------------ a full client session

function newMirror() {
  return new Sim({ rules: content.rules, weapons, rng: mulberry32(1) });
}

test('client session: roster, prediction tracks the server, remote players move, shots echo back', async () => {
  const srv = await createMultiplayerServer(0, { restartMs: 400 });
  const port = srv.server.address().port;
  let session;
  try {
    session = await OnlineSession.join({ url: url(port, 'room=session&name=Tester&faction=karens') });
    const sim = newMirror();
    const me = session.buildMirror(sim);
    assert.equal(sim.actors.length, 8);
    assert.equal(me.id, session.actorId);
    assert.equal(sim.actors.filter(a => a.team === me.team).length, 4, 'teams are balanced 4v4');

    // drive the client like the game loop does: 60 fps, run forward, fire
    const room = srv.roomManager.getRoom('session');
    const serverMe = [...room.clients.values()][0].actor;
    const botStart = new Map();
    const echoes = [], local = [];
    let maxErr = 0, maxDt = 0;
    const t0 = performance.now();
    let last = t0;
    while (performance.now() - t0 < 2500) {
      await sleep(16);
      const now = performance.now(); const dt = (now - last) / 1000; last = now; maxDt = Math.max(maxDt, dt);
      const elapsed = (now - t0) / 1000;
      me.input.forward = elapsed > 0.8 ? 1 : 0; // wait out spawn protection etc, then run
      me.input.sprint = true;
      me.input.yaw = me.team === 0 ? 0 : Math.PI;
      me.input.fire = elapsed > 1.5;
      session.step(dt, true);
      for (const e of session.takeEvents()) { if (e.type === 'shot' && e.echo) echoes.push(e); if (e.type === 'localShot') local.push(e); }
      for (const a of sim.actors) if (a.isBot !== undefined && a.id.startsWith('bot_') && !botStart.has(a.id)) botStart.set(a.id, { x: a.pos.x, z: a.pos.z });
      if (me.alive && elapsed > 1.2) maxErr = Math.max(maxErr, Math.hypot(me.pos.x - serverMe.pos.x, me.pos.z - serverMe.pos.z));
    }
    assert.ok(me.alive, 'we spawned');
    assert.ok(me.hp > 0 && me.ammo > 0 && me.grenades === 2, `server stats applied: hp ${me.hp} ammo ${me.ammo} gr ${me.grenades}`);
    const bot = sim.actors.find(a => a.id.startsWith('bot_'));
    const moved = Math.hypot(bot.pos.x - botStart.get(bot.id).x, bot.pos.z - botStart.get(bot.id).z);
    assert.ok(moved > 1, `remote bots move in the mirror (${moved.toFixed(1)} m)`);
    assert.ok(maxErr < 3, `prediction stays near the server (max ${maxErr.toFixed(2)} m)`);
    assert.ok(local.length >= 3, `trigger pulls play instantly, before the server answers (${local.length})`);
    assert.ok(echoes.length >= 1, `the server's shot events still arrive for tracers and hit markers (${echoes.length})`);
    assert.ok(session.latency < 200);
    assert.ok(sim.time > 1, 'mirror clock follows the server');
  } finally { session?.close(); await srv.close(); }
});

test('roster follows joins and leaves; a finished match restarts with a fresh mirror', async () => {
  const srv = await createMultiplayerServer(0, { restartMs: 300 });
  const port = srv.server.address().port;
  const a = await OnlineSession.join({ url: url(port, 'room=roster&name=Alice') });
  const sim = newMirror();
  a.buildMirror(sim);
  const botsBefore = a.players.filter(p => p.bot).length;
  try {
    const b = await OnlineSession.join({ url: url(port, 'room=roster&name=Bob') });
    await sleep(120);
    let change = a.syncRoster();
    assert.ok(change && !change.reset);
    assert.deepEqual(change.added.map(x => x.name), ['Bob']);
    assert.equal(sim.actors.length, 8, 'Bob took a bot\'s seat');
    assert.equal(a.players.filter(p => p.bot).length, botsBefore - 1);

    b.close();
    await sleep(150);
    change = a.syncRoster();
    assert.deepEqual(change.removed.length, 1, 'only Bob left');
    assert.equal(change.added.length, 1, 'a bot refilled his seat');
    assert.equal(sim.actors.length, 8);
    assert.ok(!sim.actors.some(x => x.name === 'Bob'));

    // end the match: the server announces it, waits restartMs, then sends a new roster
    const room = srv.roomManager.getRoom('roster');
    room.sim.end(0);
    await sleep(100);
    a.step(0.016, true);
    assert.ok(a.takeEvents().some(e => e.type === 'matchEnd'), 'matchEnd event reaches the client');
    assert.equal(sim.over, true);
    await sleep(500);
    change = a.syncRoster();
    assert.ok(change?.reset, 'new match: mirror rebuilt');
    assert.equal(sim.over, false);
    assert.equal(room.matchNumber, 2);
    assert.equal(a.me.id, a.actorId, 'same player id across matches');
  } finally { a.close(); await srv.close(); }
});

// ------------------------------------------------------------------ lag compensation

test('lag compensation: a shot at where the shooter SAW a moving target hits; aiming at its current position misses', () => {
  const room = new Room('lag', { restartMs: 99999 });
  room.stopLoop();
  const fake = () => ({ writable: true, destroyed: false, writableLength: 0, write() {}, end() {}, destroy() {} });
  const cA = room.addPlayer(fake(), { name: 'Shooter', team: 0 });
  const cB = room.addPlayer(fake(), { name: 'Target', team: 1 });
  room.sim.actors = room.sim.actors.filter(a => !a.isBot); // just the two of them
  for (const a of room.sim.actors) a.spawnProtectUntil = 0;
  const A = cA.actor, B = cB.actor;
  Object.assign(A.pos, { x: 0, y: 0, z: 25 });
  Object.assign(B.pos, { x: -3, y: 0, z: 10 });
  A.input.yaw = 0; A.input.forward = 0; A.input.right = 0;
  B.input.yaw = 0; B.input.right = 1; B.input.sprint = false; // strafes +x at walking speed
  cA.rtt = 200; // rewind = 0.1 + 0.1 = 0.2 s
  for (let i = 0; i < 60; i++) { room.tick(1 / 60); A.input.forward = 0; Object.assign(A.pos, { x: 0, z: 25 }); }
  const rewound = room.frameAt(room.sim.time - 0.2).get(B.id);
  const now = [B.pos.x, B.pos.y, B.pos.z];
  assert.ok(now[0] - rewound[0] > 0.7, `target really moved (${(now[0] - rewound[0]).toFixed(2)} m in 0.2 s)`);

  const shoot = (tx, tz) => {
    A.yaw = Math.atan2(-(tx - A.pos.x), -(tz - A.pos.z));
    A.pitch = Math.atan2(1.1 - 1.6, Math.hypot(tx - A.pos.x, tz - A.pos.z));
    A.nextShotAt = 0; A.reloadUntil = 0; A.ammo = 30;
    room.sim.drainEvents();
    const hpBefore = B.hp;
    room.sim.fire(A);
    return B.hp < hpBefore;
  };
  assert.ok(shoot(now[0], now[2]) === false, 'aiming at the target\'s CURRENT position misses (it is not there from the shooter\'s view)');
  B.hp = 100;
  assert.ok(shoot(rewound[0], rewound[2]), 'aiming at where the shooter saw it hits');
  assert.equal(B.pos.x, now[0], 'positions are restored after the shot');
  room.close();
});

test('a background tab (no inputs for 0.5 s) stops walking and firing', () => {
  const room = new Room('stale', {});
  room.stopLoop();
  const fake = { writable: true, destroyed: false, writableLength: 0, write() {}, end() {}, destroy() {} };
  const c = room.addPlayer(fake, { name: 'AFK' });
  c.actor.input.forward = 1; c.actor.input.fire = true;
  c.lastInputAt = performance.now() - 2000;
  room.tick(1 / 60);
  assert.equal(c.actor.input.forward, 0);
  assert.equal(c.actor.input.fire, false);
  room.close();
});
