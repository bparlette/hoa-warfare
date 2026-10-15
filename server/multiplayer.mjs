#!/usr/bin/env node
// Zero-external-dependency Node.js HTTP + WebSocket server for Call of Karen: HOA Warfare.
// Runs headless Sim instances at 60Hz and broadcasts 20Hz world snapshots to connected clients.

import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Sim } from '../web/src/engine/sim.js';
import { mulberry32 } from '../web/src/core/rng.js';

// Ensure addBot helper exists on Sim prototype
if (!Sim.prototype.addBot) {
  Sim.prototype.addBot = function ({ id, name, team, faction, loadout = 'default' } = {}) {
    return this.addActor({ id, name, team, faction, isBot: true, loadout });
  };
}

const content = JSON.parse(readFileSync(new URL('../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../data/weapons.json', import.meta.url)));
const shippingFactions = Object.keys(content.factions || {}).filter(
  id => !content.factions[id].status || content.factions[id].status !== 'draft'
);

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function computeWebSocketAccept(secWebSocketKey) {
  return crypto
    .createHash('sha1')
    .update((secWebSocketKey || '').trim() + WS_MAGIC_STRING)
    .digest('base64');
}

/**
 * Low-level RFC 6455 WebSocket frame sender (Server-to-Client unmasked frames).
 */
export function sendWebSocketFrame(socket, data, opcode = 0x1) {
  if (!socket || socket.destroyed || !socket.writable) return;
  const payload = Buffer.isBuffer(data)
    ? data
    : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {}
}

/**
 * Attaches RFC 6455 frame parser to a net.Socket.
 */
export function attachWebSocketParser(socket, { onMessage, onClose, onError }) {
  let buffer = Buffer.alloc(0);
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    onClose?.();
  }

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < offset + 2) break;
        payloadLen = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (buffer.length < offset + 8) break;
        const big = buffer.readBigUInt64BE(offset);
        payloadLen = Number(big);
        offset += 8;
      }

      let maskKey = null;
      if (masked) {
        if (buffer.length < offset + 4) break;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) break;

      const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
      buffer = buffer.subarray(offset + payloadLen);

      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      if (opcode === 0x8) {
        // Close frame
        sendWebSocketFrame(socket, payload, 0x8);
        try {
          socket.end();
        } catch {}
        cleanup();
        return;
      } else if (opcode === 0x9) {
        // Ping -> Pong
        sendWebSocketFrame(socket, payload, 0xa);
      } else if (opcode === 0x1) {
        // Text frame
        const str = payload.toString('utf8');
        try {
          onMessage?.(str);
        } catch (err) {
          onError?.(err);
        }
      }
    }
  });

  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', err => {
    onError?.(err);
    cleanup();
  });
}

/**
 * A multiplayer room managing a headless Sim instance, up to 8 player slots,
 * 60Hz physics stepping, and 20Hz snapshot broadcasts.
 */
export class Room {
  constructor(roomCode, { contentData = content, weaponsData = weapons, mode = 'clash', seed } = {}) {
    this.roomCode = roomCode;
    this.content = contentData;
    this.weapons = weaponsData;
    this.mode = mode;
    this.maxSlots = 8;
    this.nextPlayerSeq = 1;
    this.nextBotSeq = 1;
    this.tickSeq = 0;
    this.clients = new Map(); // socket -> { socket, actor, name, faction, team }
    this.bufferedEvents = [];

    const rng = mulberry32(seed ?? (Math.floor(Math.random() * 900000) + 100000));
    this.sim = new Sim({
      rules: this.content.rules,
      weapons: this.weapons,
      rng,
      mode: this.mode,
    });

    this.interval = null;
    this.startLoop();
  }

  startLoop() {
    if (this.interval) return;
    const dt = 1 / 60;
    this.interval = setInterval(() => {
      this.tick(dt);
    }, 1000 / 60);
  }

  stopLoop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick(dt = 1 / 60) {
    this.tickSeq++;
    this.sim.step(dt);

    const evs = this.sim.drainEvents();
    if (evs.length > 0) {
      this.bufferedEvents.push(...evs);
    }

    // 20Hz snapshot broadcast: every 3 ticks at 60Hz
    if (this.tickSeq % 3 === 0) {
      this.broadcastSnapshot();
    }
  }

  broadcastSnapshot() {
    if (this.clients.size === 0) {
      this.bufferedEvents = [];
      return;
    }

    const snap = this.sim.snapshot();
    const packet = {
      type: 'snapshot',
      seq: this.tickSeq,
      time: this.sim.time,
      actors: snap,
      projectiles: this.sim.grenades.map(g => ({
        ownerId: g.ownerId,
        team: g.team,
        weaponId: g.weaponId,
        pos: { x: g.pos.x, y: g.pos.y, z: g.pos.z },
        vel: { x: g.vel.x, y: g.vel.y, z: g.vel.z },
      })),
      scores: [...this.sim.score],
      events: [...this.bufferedEvents],
      helicopters: snap.helicopters || [],
    };

    this.bufferedEvents = [];
    const json = JSON.stringify(packet);

    for (const client of this.clients.values()) {
      sendWebSocketFrame(client.socket, json, 0x1);
    }
  }

  /**
   * Backfill missing slots with bots using sim.addBot(...) up to maxSlots (8).
   */
  backfillBots() {
    const names = this.content.playerNames || ['Bot_A', 'Bot_B', 'Bot_C', 'Bot_D', 'Bot_E', 'Bot_F', 'Bot_G', 'Bot_H'];
    while (this.sim.actors.length < this.maxSlots) {
      const team0Count = this.sim.actors.filter(a => a.team === 0).length;
      const team1Count = this.sim.actors.filter(a => a.team === 1).length;
      const botTeam = team0Count <= team1Count ? 0 : 1;
      const botSeq = this.nextBotSeq++;
      const botId = `bot_${botSeq}`;
      const botName = names[botSeq % names.length] || `Bot_${botSeq}`;
      const botFaction = botTeam === 0 ? 'karens' : (shippingFactions[botSeq % shippingFactions.length] || 'fratHouse');

      const bot = this.sim.addBot({
        id: botId,
        name: botName,
        team: botTeam,
        faction: botFaction,
      });

      if (this.sim.started) {
        this.sim.respawn(bot);
        this.sim.assignRoles();
      }
    }

    if (!this.sim.started && this.sim.actors.length > 0) {
      this.sim.start();
    }
  }

  addPlayer(socket, { name = 'Player', faction = 'karens', team } = {}) {
    // If room is full and has bots, remove one bot to make room for human player
    if (this.sim.actors.length >= this.maxSlots) {
      const botIndex = this.sim.actors.findIndex(a => a.isBot);
      if (botIndex >= 0) {
        const removed = this.sim.actors.splice(botIndex, 1)[0];
        this.sim.byId.delete(removed.id);
      }
    }

    let assignedTeam = team;
    if (assignedTeam !== 0 && assignedTeam !== 1) {
      const team0 = this.sim.actors.filter(a => a.team === 0).length;
      const team1 = this.sim.actors.filter(a => a.team === 1).length;
      assignedTeam = team0 <= team1 ? 0 : 1;
    }

    const actorId = `p_${this.nextPlayerSeq++}`;
    const actor = this.sim.addActor({
      id: actorId,
      name,
      team: assignedTeam,
      faction,
      isBot: false,
    });

    const client = {
      socket,
      actor,
      name,
      faction,
      team: assignedTeam,
    };
    this.clients.set(socket, client);

    this.backfillBots();

    if (this.sim.started) {
      this.sim.respawn(actor);
      this.sim.assignRoles();
    }

    return client;
  }

  removePlayer(socket) {
    const client = this.clients.get(socket);
    if (!client) return;

    this.clients.delete(socket);

    const actorIdx = this.sim.actors.findIndex(a => a.id === client.actor.id);
    if (actorIdx >= 0) {
      this.sim.actors.splice(actorIdx, 1);
      this.sim.byId.delete(client.actor.id);
    }

    if (this.clients.size > 0) {
      this.backfillBots();
    }
  }

  applyInput(socket, packet) {
    const client = this.clients.get(socket);
    if (!client || !client.actor || !packet) return;

    const actor = client.actor;
    const keys = packet.keys || {};
    const fwd = Boolean(keys.fwd);
    const back = Boolean(keys.back);
    const left = Boolean(keys.left);
    const right = Boolean(keys.right);
    const jump = Boolean(keys.jump);
    const fire = Boolean(keys.fire);

    const inp = actor.input;
    inp.forward = (fwd ? 1 : 0) - (back ? 1 : 0);
    inp.right = (right ? 1 : 0) - (left ? 1 : 0);
    inp.jump = jump;
    inp.fire = fire;
    if (keys.sprint !== undefined) inp.sprint = Boolean(keys.sprint);
    if (keys.reload) inp.reload = true;
    if (keys.melee) inp.melee = true;
    if (keys.grenade) inp.grenade = true;

    if (typeof packet.yaw === 'number' && !Number.isNaN(packet.yaw)) {
      inp.yaw = packet.yaw;
    }
    if (typeof packet.pitch === 'number' && !Number.isNaN(packet.pitch)) {
      inp.pitch = Math.max(-1.45, Math.min(1.45, packet.pitch));
    }
    if (packet.weaponSlot && typeof packet.weaponSlot === 'string') {
      inp.switchSlot = packet.weaponSlot;
    }
    actor.lastInputSeq = packet.seq;
  }

  close() {
    this.stopLoop();
    for (const client of this.clients.values()) {
      try {
        sendWebSocketFrame(client.socket, '', 0x8);
        client.socket.end();
      } catch {}
    }
    this.clients.clear();
  }
}

/**
 * Manages active multiplayer rooms by unique roomCode.
 */
export class RoomManager {
  constructor({ contentData = content, weaponsData = weapons } = {}) {
    this.content = contentData;
    this.weapons = weaponsData;
    this.rooms = new Map();
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  getOrCreateRoom(roomCode, options = {}) {
    let room = this.rooms.get(roomCode);
    if (!room) {
      room = new Room(roomCode, {
        contentData: this.content,
        weaponsData: this.weapons,
        ...options,
      });
      this.rooms.set(roomCode, room);
    }
    return room;
  }

  removeRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.close();
      this.rooms.delete(roomCode);
    }
  }

  closeAll() {
    for (const room of this.rooms.values()) {
      room.close();
    }
    this.rooms.clear();
  }
}

/**
 * Creates and starts the Node.js HTTP + WebSocket server.
 * Returns { server, roomManager, port, close() } and is thenable.
 */
export function createMultiplayerServer(port = 8080, options = {}) {
  const roomManager = new RoomManager(options);
  const activeSockets = new Set();

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'Call of Karen Multiplayer' }));
  });

  server.on('upgrade', (req, socket, head) => {
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = computeWebSocketAccept(key);
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n',
    ];
    socket.write(headers.join('\r\n'));

    const parsedUrl = new URL(req.url, 'http://localhost');
    const roomCode = parsedUrl.searchParams.get('room') || 'default';
    const name = parsedUrl.searchParams.get('name') || 'Player';
    const faction = parsedUrl.searchParams.get('faction') || 'karens';
    const team = parsedUrl.searchParams.has('team')
      ? parseInt(parsedUrl.searchParams.get('team'), 10)
      : undefined;

    const room = roomManager.getOrCreateRoom(roomCode);
    const client = room.addPlayer(socket, { name, faction, team });

    // Send init packet
    const initPacket = {
      type: 'init',
      actorId: client.actor.id,
      team: client.team,
      roomCode: room.roomCode,
      tickRate: 60,
      snapshotRate: 20,
    };
    sendWebSocketFrame(socket, JSON.stringify(initPacket), 0x1);

    attachWebSocketParser(socket, {
      onMessage(text) {
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }

        if (msg.type === 'input') {
          room.applyInput(socket, msg);
        } else if (msg.type === 'ping') {
          sendWebSocketFrame(
            socket,
            JSON.stringify({
              type: 'pong',
              clientTime: msg.clientTime,
              serverTime: Date.now(),
            }),
            0x1
          );
        }
      },
      onClose() {
        room.removePlayer(socket);
        activeSockets.delete(socket);
      },
      onError() {
        room.removePlayer(socket);
        activeSockets.delete(socket);
      },
    });
  });

  server.listen(port);

  const close = () => {
    roomManager.closeAll();
    for (const s of activeSockets) {
      try {
        s.destroy();
      } catch {}
    }
    activeSockets.clear();
    return new Promise(resolve => {
      try {
        server.closeAllConnections?.();
      } catch {}
      server.close(() => resolve());
    });
  };

  const result = {
    server,
    roomManager,
    close,
  };

  // Allow both `const res = createMultiplayerServer(...)` and `const res = await createMultiplayerServer(...)`
  const promise = new Promise(resolve => {
    if (server.listening) {
      resolve(result);
    } else {
      server.once('listening', () => resolve(result));
    }
  });

  return Object.assign(promise, result);
}

// Standalone execution: node server/multiplayer.mjs [port]
if (
  process.argv[1] &&
  (process.argv[1].endsWith('multiplayer.mjs') || process.argv[1].endsWith('multiplayer.js'))
) {
  const requestedPort = parseInt(process.argv[2], 10) || 8080;
  createMultiplayerServer(requestedPort).then(({ server }) => {
    const boundPort = server.address().port;
    console.log(`Call of Karen multiplayer server listening on ws://localhost:${boundPort}/ws`);
  });
}
