// Headless unit tests for Call of Karen multiplayer prototype.
// Tests server startup, WebSocket protocol, input advancement, bot backfill, snapshot broadcasting, and shutdown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayerServer, RoomManager } from '../../server/multiplayer.mjs';
import { NetClient } from '../src/engine/net.js';

test('multiplayer: createMultiplayerServer spins up on an ephemeral port (port 0)', async () => {
  const { server, roomManager, close } = await createMultiplayerServer(0);
  assert.ok(server.listening, 'Server should be listening');
  const port = server.address().port;
  assert.ok(port > 0, `Expected valid ephemeral port, got ${port}`);
  assert.ok(roomManager instanceof RoomManager, 'Expected RoomManager instance');
  await close();
  assert.equal(server.listening, false, 'Server should no longer be listening');
});

test('multiplayer: WebSocket client connects and receives init packet with assigned actorId and team', async () => {
  const { server, close } = await createMultiplayerServer(0);
  const port = server.address().port;

  const client = new NetClient();
  let connectCallbackFired = false;

  const initData = await client.connect(`ws://localhost:${port}/ws?room=init_test&name=KarenQueen&faction=karens`, {
    onConnect: (msg) => {
      connectCallbackFired = true;
      assert.ok(msg.actorId, 'init packet should contain actorId');
      assert.ok(msg.team === 0 || msg.team === 1, 'init packet should contain team 0 or 1');
    },
  });

  assert.ok(connectCallbackFired, 'onConnect callback should have been called');
  assert.ok(initData.actorId, 'Promise should resolve with actorId');
  assert.ok(initData.team === 0 || initData.team === 1, 'Promise should resolve with valid team');
  assert.equal(client.actorId, initData.actorId);
  assert.equal(client.team, initData.team);
  assert.equal(client.roomCode, 'init_test');

  client.disconnect();
  await close();
});

test('multiplayer: Client sends input packet and server advances actor position', async () => {
  const { server, roomManager, close } = await createMultiplayerServer(0);
  const port = server.address().port;

  const client = new NetClient();
  const { actorId } = await client.connect(`ws://localhost:${port}/ws?room=input_test&name=Speeder&faction=karens`);

  const room = roomManager.getRoom('input_test');
  assert.ok(room, 'Room input_test should exist');
  const actor = room.sim.byId.get(actorId);
  assert.ok(actor, 'Actor should exist in room simulation');

  // Record initial position
  const startX = actor.pos.x;
  const startZ = actor.pos.z;

  // Send input: move forward with yaw 0
  client.sendInput({ fwd: true }, 0, 0, 'primary');

  // Allow multiple 60Hz ticks to process input and advance movement
  await new Promise(r => setTimeout(r, 120));

  const distanceMoved = Math.hypot(actor.pos.x - startX, actor.pos.z - startZ);
  assert.ok(distanceMoved > 0.05, `Actor should have moved forward, moved: ${distanceMoved.toFixed(4)}m`);

  client.disconnect();
  await close();
});

test('multiplayer: Server backfills missing slots with bots', async () => {
  const { server, roomManager, close } = await createMultiplayerServer(0);
  const port = server.address().port;

  const client = new NetClient();
  await client.connect(`ws://localhost:${port}/ws?room=bots_test&name=LonePlayer&faction=karens&team=0`);

  const room = roomManager.getRoom('bots_test');
  assert.ok(room, 'Room bots_test should exist');

  // Up to 8 player slots total
  assert.equal(room.sim.actors.length, 8, 'Room should have exactly 8 actors backfilled');

  const humanActors = room.sim.actors.filter(a => !a.isBot);
  const botActors = room.sim.actors.filter(a => a.isBot);

  assert.equal(humanActors.length, 1, 'Should have exactly 1 human player');
  assert.equal(botActors.length, 7, 'Should have backfilled 7 bots');

  const team0Count = room.sim.actors.filter(a => a.team === 0).length;
  const team1Count = room.sim.actors.filter(a => a.team === 1).length;
  assert.equal(team0Count, 4, 'Team 0 should have 4 combatants (4v4)');
  assert.equal(team1Count, 4, 'Team 1 should have 4 combatants (4v4)');

  client.disconnect();
  await close();
});

test('multiplayer: Server broadcasts 20Hz snapshots and NetClient buffers/interpolates', async () => {
  const { server, close } = await createMultiplayerServer(0);
  const port = server.address().port;

  const snapshots = [];
  const client = new NetClient();

  await client.connect(`ws://localhost:${port}/ws?room=snap_test&name=Watcher`, {
    onSnapshot: (snap) => snapshots.push(snap),
  });

  // Wait 250ms (at 20Hz, expect ~5 snapshots)
  await new Promise(r => setTimeout(r, 250));

  assert.ok(snapshots.length >= 3, `Expected at least 3 snapshots at 20Hz, received ${snapshots.length}`);

  const sample = snapshots[0];
  assert.equal(sample.type, 'snapshot');
  assert.ok(typeof sample.seq === 'number', 'Snapshot must have sequence number');
  assert.ok(typeof sample.time === 'number', 'Snapshot must have time');
  assert.ok(Array.isArray(sample.actors), 'Snapshot must include actors');
  assert.ok(Array.isArray(sample.projectiles), 'Snapshot must include projectiles');
  assert.ok(Array.isArray(sample.scores), 'Snapshot must include scores');
  assert.ok(Array.isArray(sample.events), 'Snapshot must include events');

  // Test client interpolation
  const interpAuto = client.getInterpolatedSnapshot();
  assert.ok(interpAuto, 'Interpolated snapshot should be returned');
  assert.ok(Array.isArray(interpAuto.actors), 'Interpolated snapshot should have actors array');
  assert.equal(interpAuto.actors.length, 8, 'Interpolated actors should match room size');

  const interpFixed = client.getInterpolatedSnapshot(sample.time);
  assert.ok(interpFixed, 'Explicit renderTime interpolation should work');

  // Verify latency is exposed
  assert.ok(typeof client.latency === 'number' && client.latency >= 0, 'Client latency must be exposed');

  client.disconnect();
  await close();
});

test('multiplayer: Clean shutdown and disconnect handling', async () => {
  const { server, roomManager, close } = await createMultiplayerServer(0);
  const port = server.address().port;

  const client1 = new NetClient();
  const client2 = new NetClient();

  let c1Disconnected = false;
  await client1.connect(`ws://localhost:${port}/ws?room=dc_test&name=User1`, {
    onDisconnect: () => { c1Disconnected = true; },
  });
  await client2.connect(`ws://localhost:${port}/ws?room=dc_test&name=User2`);

  const room = roomManager.getRoom('dc_test');
  assert.equal(room.clients.size, 2, 'Room should have 2 connected clients');

  // Disconnect client 1
  client1.disconnect();
  await new Promise(r => setTimeout(r, 60));

  assert.equal(room.clients.size, 1, 'Room should now have 1 client');
  assert.equal(room.sim.actors.length, 8, 'Slot was backfilled with bot so total remains 8');

  // Clean shutdown of server
  await close();
  client2.disconnect();

  assert.equal(server.listening, false, 'Server closed cleanly');
});

test('multiplayer: room initializes with requested game mode and broadcasts mode objectives', async () => {
  const { server, roomManager, close } = await createMultiplayerServer(0);
  const port = server.address().port;

  const client = new NetClient();
  let receivedSnapshot = null;

  const initData = await client.connect(`ws://localhost:${port}/ws?room=patrol_test&name=OfficerKaren&faction=karens&mode=patrol`, {
    onSnapshot: (snap) => {
      if (snap.objects && snap.objects.length > 0 && !receivedSnapshot) {
        receivedSnapshot = snap;
      }
    },
  });

  assert.equal(initData.init?.mode, 'patrol', 'init packet should specify requested mode');
  const room = roomManager.getRoom('patrol_test');
  assert.ok(room, 'Room patrol_test should exist');
  assert.equal(room.mode, 'patrol', 'Room simulation should be configured with patrol mode');

  // Wait for snapshot broadcast containing mode objectives
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (receivedSnapshot) {
        clearInterval(check);
        resolve();
      }
    }, 20);
    setTimeout(() => { clearInterval(check); resolve(); }, 1000);
  });

  assert.ok(receivedSnapshot, 'Client should receive a snapshot with mode objectives');
  assert.ok(receivedSnapshot.objects.length >= 3, 'Patrol mode should have 3 patrol zones');
  const zoneKinds = receivedSnapshot.objects.map(o => o.kind);
  assert.ok(zoneKinds.includes('patrolZone'), 'Snapshot objects should include patrolZone');

  client.disconnect();
  await close();
});

