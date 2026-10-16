#!/usr/bin/env node
// Zero-external-dependency Node.js HTTP + WebSocket server for Call of Karen: HOA Warfare.
// Runs headless Sim rooms at a fixed 60 Hz and broadcasts 20 Hz world snapshots.
//
// Run:   node server/multiplayer.mjs [port]        (PORT env also works)
// Env:   HOA_ALLOWED_ORIGINS=https://a.com,https://b.com   only accept browsers from these origins
//        HOA_TRUST_PROXY=1     behind Render/Fly/nginx: take the client IP from X-Forwarded-For
//        HOA_DEMO=1            bots only use the web-demo factions (their voice lines ship in the demo zip)
//
// Protocol (JSON text frames)
//   client -> server  input {seq, keys:{fwd,back,left,right,jump,fire,sprint,reload,melee,grenade},
//                            mv:[forward,right] (analog -1..1, optional), yaw, pitch, weaponSlot}
//                     ping {clientTime, rtt}
//   server -> client  init {actorId, team, roomCode, players[], ...}   once, after joining
//                     roster {players[], newMatch}                      whenever someone joins/leaves or a match restarts
//                     snapshot {seq, time, actors[], stats[], projectiles[], scores, events[], over, restartIn}
//                     pong {clientTime, serverTime}    error {code}
//
// Safety: message size/rate caps, origin allowlist, per-IP and total connection caps, room cap, names and
// room codes sanitised, factions validated, empty rooms closed, slow clients dropped.

import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Sim } from '../web/src/engine/sim.js';
import { mulberry32 } from '../web/src/core/rng.js';

export const LIMITS = {
  maxMessageBytes: 4096,     // client -> server; a real input packet is ~250 bytes
  maxBufferBytes: 16384,
  maxMsgPerSec: 150,         // 60 Hz inputs + pings, with headroom
  idleTimeoutMs: 30000,
  maxRooms: 40,
  maxConnections: 300,
  maxPerIp: 8,
  matchRestartMs: 12000,
  emptyRoomGraceMs: 5000,
  maxSocketBacklog: 512 * 1024,
  inputStaleMs: 500,
};
const INTERP_S = 0.1;          // clients render other players this far in the past
const MAX_REWIND_S = 0.3;      // lag compensation never rewinds further than this
const HISTORY_TICKS = 30;      // 0.5 s of positions at 60 Hz

const content = JSON.parse(readFileSync(new URL('../data/hoa_content.json', import.meta.url)));
const weapons = JSON.parse(readFileSync(new URL('../data/weapons.json', import.meta.url)));
const shippingFactions = Object.keys(content.factions || {}).filter(
  id => !content.factions[id].status || content.factions[id].status !== 'draft'
);

/** The web demo's faction list, read from web/src/engine/game.js so there is one source of truth. */
export function readDemoFactions() {
  try {
    const src = readFileSync(new URL('../web/src/engine/game.js', import.meta.url), 'utf8');
    const m = src.match(/DEMO_FACTIONS\s*=\s*(\[[^\]]*\])/);
    return m ? JSON.parse(m[1].replace(/'/g, '"')).filter(id => shippingFactions.includes(id)) : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ sanitising (never trust the client)

/** Names end up in other players' HUD; keep letters, digits, space, _ . - only. */
export function sanitizeName(raw) {
  const s = String(raw ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s || 'Player';
}
export function sanitizeRoomCode(raw) {
  return String(raw ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
}
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = v => typeof v === 'number' && Number.isFinite(v);

// ------------------------------------------------------------------ WebSocket framing (RFC 6455)

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function computeWebSocketAccept(secWebSocketKey) {
  return crypto
    .createHash('sha1')
    .update((secWebSocketKey || '').trim() + WS_MAGIC_STRING)
    .digest('base64');
}

/** Server-to-client (unmasked) frame. */
export function sendWebSocketFrame(socket, data, opcode = 0x1) {
  if (!socket || socket.destroyed || !socket.writable) return;
  const payload = Buffer.isBuffer(data)
    ? data
    : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | (opcode & 0x0f);
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {}
}

/** Send a close frame with a status code, then end the socket. */
export function closeWebSocket(socket, code = 1000) {
  const body = Buffer.alloc(2);
  body.writeUInt16BE(code, 0);
  sendWebSocketFrame(socket, body, 0x8);
  try { socket.end(); } catch {}
}

/**
 * Attaches an RFC 6455 frame parser to a net.Socket. Clients must mask frames, messages are capped at
 * maxPayload bytes, and fragmented messages are not accepted (a browser never fragments our small JSON).
 */
export function attachWebSocketParser(socket, { onMessage, onClose, onError, maxPayload = LIMITS.maxMessageBytes, maxBuffer = LIMITS.maxBufferBytes }) {
  let buffer = Buffer.alloc(0);
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    onClose?.();
    // The http server allows half-open sockets, so when the client just goes away (tab closed, network
    // drop) we must close our side too, otherwise the socket leaks. destroySoon flushes a pending close frame.
    try { socket.destroySoon(); } catch {}
  }
  function reject(code) {
    closeWebSocket(socket, code);
    cleanup();
  }

  socket.on('data', chunk => {
    if (closed) return;
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const fin = (firstByte & 0x80) !== 0;
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
        if (big > BigInt(maxPayload)) return reject(1009);
        payloadLen = Number(big);
        offset += 8;
      }
      if (payloadLen > maxPayload) return reject(1009);
      if (!masked) return reject(1002);
      if (!fin || opcode === 0x0) return reject(1003);

      if (buffer.length < offset + 4) break;
      const maskKey = buffer.subarray(offset, offset + 4);
      offset += 4;
      if (buffer.length < offset + payloadLen) break;

      const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
      buffer = buffer.subarray(offset + payloadLen);
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];

      if (opcode === 0x8) {
        closeWebSocket(socket, 1000);
        cleanup();
        return;
      } else if (opcode === 0x9) {
        sendWebSocketFrame(socket, payload.subarray(0, 125), 0xa);
      } else if (opcode === 0x1) {
        try {
          onMessage?.(payload.toString('utf8'));
        } catch (err) {
          onError?.(err);
        }
      }
      // binary and pong frames are ignored
    }
    // whatever is left is one incomplete frame (<= maxPayload + header); anything bigger is abuse
    if (buffer.length > maxBuffer) reject(1009);
  });

  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', err => {
    onError?.(err);
    cleanup();
  });
}

// ------------------------------------------------------------------ rooms

/**
 * A multiplayer room: one headless Sim, up to 8 seats (humans, the rest bots), fixed 60 Hz physics,
 * 20 Hz snapshots, lag-compensated shooting, automatic match restart.
 */
export class Room {
  constructor(roomCode, { contentData = content, weaponsData = weapons, mode = 'clash', seed, botFactions, quick = false, restartMs = LIMITS.matchRestartMs } = {}) {
    this.roomCode = roomCode;
    this.content = contentData;
    this.weapons = weaponsData;
    this.mode = mode;
    this.quick = quick;
    this.restartMs = restartMs;
    this.botFactions = botFactions?.length ? botFactions : shippingFactions;
    this.maxSlots = 8;
    this.nextPlayerSeq = 1;
    this.nextBotSeq = 1;
    this.tickSeq = 0;
    this.matchNumber = 1;
    this.restartAt = null;
    this.emptySince = performance.now();
    this.clients = new Map(); // socket -> { socket, actor, name, faction, team, rtt }
    this.clientByActor = new Map();
    this.bufferedEvents = [];
    this.history = [];
    this.sim = this.makeSim(seed);
    this.accum = 0;
    this.lastPump = performance.now();
    this.interval = null;
    this.startLoop();
  }

  makeSim(seed) {
    const sim = new Sim({
      rules: this.content.rules,
      weapons: this.weapons,
      rng: mulberry32(seed ?? Math.floor(Math.random() * 900000) + 100000),
      mode: this.mode,
    });
    this.installLagCompensation(sim);
    return sim;
  }

  /**
   * Lag compensation. A shot is resolved against where the shooter SAW everyone: the other actors are
   * rewound by half the shooter's round trip plus the interpolation delay for the duration of the ray.
   */
  installLagCompensation(sim) {
    const fire = sim.fire.bind(sim);
    sim.fire = actor => {
      const client = this.clientByActor.get(actor.id);
      const rewind = client ? clamp((client.rtt || 0) / 2000 + INTERP_S, 0, MAX_REWIND_S) : 0;
      const frame = rewind > 0 ? this.frameAt(sim.time - rewind) : null;
      if (!frame) return fire(actor);
      const saved = [];
      for (const other of sim.actors) {
        const p = other !== actor && frame.get(other.id);
        if (!p) continue;
        saved.push([other, other.pos.x, other.pos.y, other.pos.z]);
        other.pos.x = p[0]; other.pos.y = p[1]; other.pos.z = p[2];
      }
      try {
        return fire(actor);
      } finally {
        for (const [o, x, y, z] of saved) { o.pos.x = x; o.pos.y = y; o.pos.z = z; }
      }
    };
  }

  recordHistory() {
    const frame = new Map();
    for (const a of this.sim.actors) if (a.alive) frame.set(a.id, [a.pos.x, a.pos.y, a.pos.z]);
    this.history.push({ t: this.sim.time, frame });
    if (this.history.length > HISTORY_TICKS) this.history.shift();
  }

  frameAt(t) {
    let best = null;
    for (const h of this.history) { if (h.t <= t) best = h; else break; }
    return best?.frame ?? this.history[0]?.frame ?? null;
  }

  startLoop() {
    if (this.interval) return;
    this.lastPump = performance.now();
    // Fixed timestep with an accumulator: the simulation clock keeps real time even when the event loop
    // stalls (setInterval alone drifts and would slow the whole match down under load).
    this.interval = setInterval(() => this.pump(), 8);
  }

  pump() {
    const now = performance.now();
    this.accum = Math.min(0.25, this.accum + (now - this.lastPump) / 1000);
    this.lastPump = now;
    const dt = 1 / 60;
    while (this.accum >= dt) {
      this.accum -= dt;
      this.tick(dt);
    }
  }

  stopLoop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick(dt = 1 / 60) {
    this.tickSeq++;
    // A background tab stops sending inputs; don't let that player run on (or keep firing) forever.
    const now = performance.now();
    for (const c of this.clients.values()) {
      if (now - (c.lastInputAt ?? now) > LIMITS.inputStaleMs) {
        const inp = c.actor.input;
        inp.forward = 0; inp.right = 0; inp.fire = false; inp.jump = false; inp.sprint = false;
      }
    }
    this.sim.step(dt);
    this.recordHistory();

    const evs = this.sim.drainEvents();
    if (evs.length > 0) this.bufferedEvents.push(...evs);

    if (this.sim.over) {
      if (this.restartAt === null) this.restartAt = performance.now() + this.restartMs;
      else if (performance.now() >= this.restartAt) this.restartMatch();
    }

    if (this.tickSeq % 3 === 0) this.broadcastSnapshot();
  }

  /** New match in the same room: same people, same ids, new Sim. */
  restartMatch() {
    this.matchNumber++;
    this.restartAt = null;
    this.history = [];
    this.clientByActor.clear();
    this.nextBotSeq = 1;
    this.sim = this.makeSim();
    for (const client of this.clients.values()) {
      client.actor = this.sim.addActor({ id: client.actorId, name: client.name, team: client.team, faction: client.faction, isBot: false });
      this.clientByActor.set(client.actorId, client);
    }
    this.backfillBots();
    this.broadcastRoster({ newMatch: true });
  }

  rosterPlayers() {
    return this.sim.actors.map(a => ({ id: a.id, name: a.name, team: a.team, faction: a.faction, bot: a.isBot }));
  }

  rosterPacket({ newMatch = false } = {}) {
    return {
      type: 'roster',
      newMatch,
      matchNumber: this.matchNumber,
      mode: this.mode,
      scoreLimit: this.sim.scoreLimit,
      timeLimit: this.sim.timeLimit,
      players: this.rosterPlayers(),
    };
  }

  broadcastRoster({ newMatch = false, except = null } = {}) {
    const json = JSON.stringify(this.rosterPacket({ newMatch }));
    for (const client of this.clients.values()) if (client.socket !== except) this.send(client, json);
  }

  send(client, json) {
    const s = client.socket;
    if (s.writableLength > LIMITS.maxSocketBacklog) { s.destroy(); return; } // too slow to keep up
    sendWebSocketFrame(s, json, 0x1);
  }

  /** Compact per-actor state the client needs for its HUD and scoreboard. */
  statsFor(a) {
    const w = this.sim.activeWeapon(a);
    const client = this.clientByActor.get(a.id);
    const rv = a.revealedUntil - this.sim.time;
    return {
      id: a.id,
      hp: Math.round(a.hp),
      ammo: a.ammo,
      mag: w?.mag ?? 0,
      gr: a.grenades,
      slot: a.activeSlot,
      rl: a.reloadUntil > 0,
      k: a.kills,
      d: a.deaths,
      st: a.streak,
      cs: a.campState?.state ?? 'ok',
      csl: a.campState?.secondsLeft ?? 0,
      rv: rv > 0 ? +rv.toFixed(1) : 0,
      ack: client ? client.actor.lastInputSeq ?? 0 : 0,
    };
  }

  broadcastSnapshot() {
    if (this.clients.size === 0) {
      this.bufferedEvents = [];
      return;
    }
    const sim = this.sim;
    const packet = {
      type: 'snapshot',
      seq: this.tickSeq,
      time: sim.time,
      actors: sim.snapshot(),
      stats: sim.actors.map(a => this.statsFor(a)),
      projectiles: sim.grenades.map(g => ({
        ownerId: g.ownerId,
        team: g.team,
        weaponId: g.weaponId,
        pos: { x: g.pos.x, y: g.pos.y, z: g.pos.z },
        vel: { x: g.vel.x, y: g.vel.y, z: g.vel.z },
      })),
      scores: [...sim.score],
      events: this.bufferedEvents,
      over: sim.over,
      winner: sim.winner,
      restartIn: this.restartAt === null ? null : Math.max(0, +((this.restartAt - performance.now()) / 1000).toFixed(1)),
      helicopters: [],
    };
    this.bufferedEvents = [];
    const json = JSON.stringify(packet);
    for (const client of this.clients.values()) this.send(client, json);
  }

  /** Fill empty seats with bots (they are removed again as humans join). */
  backfillBots() {
    const names = this.content.playerNames || ['Bot_A', 'Bot_B', 'Bot_C', 'Bot_D', 'Bot_E', 'Bot_F', 'Bot_G', 'Bot_H'];
    while (this.sim.actors.length < this.maxSlots) {
      const team0Count = this.sim.actors.filter(a => a.team === 0).length;
      const team1Count = this.sim.actors.filter(a => a.team === 1).length;
      const botTeam = team0Count <= team1Count ? 0 : 1;
      const botSeq = this.nextBotSeq++;
      const bot = this.sim.addBot({
        id: `bot_${botSeq}`,
        name: sanitizeName(names[botSeq % names.length] || `Bot ${botSeq}`),
        team: botTeam,
        faction: this.botFactions[(botSeq * 5 + botTeam) % this.botFactions.length],
      });
      if (this.sim.started) {
        this.sim.respawn(bot);
        this.sim.assignRoles();
      }
    }
    if (!this.sim.started && this.sim.actors.length > 0) this.sim.start();
  }

  humanCount() { return this.clients.size; }
  isFull() { return this.clients.size >= this.maxSlots; }

  /** @returns the client record, or null when every seat has a human. */
  addPlayer(socket, { name = 'Player', faction = 'karens', team } = {}) {
    if (this.isFull()) return null;
    name = sanitizeName(name);
    if (!this.botFactions.includes(faction) && !shippingFactions.includes(faction)) faction = 'karens';

    const humans = [0, 1].map(t => [...this.clients.values()].filter(c => c.team === t).length);
    const assignedTeam = team === 0 || team === 1 ? team : (humans[0] <= humans[1] ? 0 : 1);

    // Seats are full of bots: give the newcomer a bot's seat, preferring a bot on their team.
    if (this.sim.actors.length >= this.maxSlots) {
      const bots = this.sim.actors.filter(a => a.isBot);
      const drop = bots.find(a => a.team === assignedTeam) || bots[0];
      if (drop) {
        this.sim.actors.splice(this.sim.actors.indexOf(drop), 1);
        this.sim.byId.delete(drop.id);
      }
    }

    const actorId = `p_${this.nextPlayerSeq++}`;
    const actor = this.sim.addActor({ id: actorId, name, team: assignedTeam, faction, isBot: false });
    const client = { socket, actor, actorId, name, faction, team: assignedTeam, rtt: 0, lastInputAt: performance.now() };
    this.clients.set(socket, client);
    this.clientByActor.set(actorId, client);
    this.emptySince = null;

    this.backfillBots();
    if (this.sim.started) {
      this.sim.respawn(actor);
      this.sim.assignRoles();
    }
    this.broadcastRoster({ except: socket });
    return client;
  }

  removePlayer(socket) {
    const client = this.clients.get(socket);
    if (!client) return;
    this.clients.delete(socket);
    this.clientByActor.delete(client.actorId);

    const idx = this.sim.actors.findIndex(a => a.id === client.actorId);
    if (idx >= 0) {
      this.sim.actors.splice(idx, 1);
      this.sim.byId.delete(client.actorId);
    }
    if (this.clients.size > 0) {
      this.backfillBots();
      this.broadcastRoster();
    } else {
      this.emptySince = performance.now();
    }
  }

  applyInput(socket, packet) {
    const client = this.clients.get(socket);
    if (!client || !client.actor || !packet || typeof packet !== 'object') return;
    client.lastInputAt = performance.now();

    const inp = client.actor.input;
    const keys = packet.keys && typeof packet.keys === 'object' ? packet.keys : {};
    const mv = Array.isArray(packet.mv) ? packet.mv : null; // analog stick / touch stick

    inp.forward = mv && finite(mv[0]) ? clamp(mv[0], -1, 1) : (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0);
    inp.right = mv && finite(mv[1]) ? clamp(mv[1], -1, 1) : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    inp.jump = !!keys.jump;
    inp.fire = !!keys.fire;
    inp.sprint = !!keys.sprint;
    if (keys.reload) inp.reload = true;
    if (keys.melee) inp.melee = true;
    if (keys.grenade) inp.grenade = true;

    if (finite(packet.yaw)) inp.yaw = wrapAngle(packet.yaw);
    if (finite(packet.pitch)) inp.pitch = clamp(packet.pitch, -1.45, 1.45);
    if (packet.weaponSlot === 'primary' || packet.weaponSlot === 'secondary') inp.switchSlot = packet.weaponSlot;
    if (Number.isSafeInteger(packet.seq)) client.actor.lastInputSeq = packet.seq;
  }

  close() {
    this.stopLoop();
    for (const client of this.clients.values()) {
      try { closeWebSocket(client.socket, 1001); } catch {}
    }
    this.clients.clear();
    this.clientByActor.clear();
  }
}

/** Active rooms by code, with quick-match lobbies and caps. */
export class RoomManager {
  constructor({ contentData = content, weaponsData = weapons, botFactions, maxRooms = LIMITS.maxRooms, restartMs } = {}) {
    this.content = contentData;
    this.weapons = weaponsData;
    this.botFactions = botFactions;
    this.maxRooms = maxRooms;
    this.restartMs = restartMs;
    this.rooms = new Map();
    this.nextQuick = 1;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  canCreate() { return this.rooms.size < this.maxRooms; }

  /** @returns the room, or null when it would have to be created and the server is at its room cap. */
  getOrCreateRoom(roomCode, options = {}) {
    let room = this.rooms.get(roomCode);
    if (!room) {
      if (!this.canCreate()) return null;
      room = new Room(roomCode, {
        contentData: this.content,
        weaponsData: this.weapons,
        botFactions: this.botFactions,
        restartMs: this.restartMs,
        ...options,
      });
      this.rooms.set(roomCode, room);
    }
    return room;
  }

  /** Quick Match: the fullest public room with a free seat, else a new one. */
  quickMatchRoom() {
    let best = null;
    for (const r of this.rooms.values()) {
      if (r.quick && !r.isFull() && (!best || r.humanCount() > best.humanCount())) best = r;
    }
    if (best) return best;
    return this.getOrCreateRoom(`Q-${this.nextQuick++}`, { quick: true });
  }

  removeRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.close();
      this.rooms.delete(roomCode);
    }
  }

  /** Close rooms that have been empty past the grace period (an empty room would simulate bots forever). */
  reapEmpty(now = performance.now(), graceMs = LIMITS.emptyRoomGraceMs) {
    let n = 0;
    for (const [code, room] of this.rooms) {
      if (room.clients.size === 0 && room.emptySince !== null && now - room.emptySince > graceMs) {
        this.removeRoom(code);
        n++;
      }
    }
    return n;
  }

  playerCount() {
    let n = 0;
    for (const r of this.rooms.values()) n += r.clients.size;
    return n;
  }

  closeAll() {
    for (const room of this.rooms.values()) room.close();
    this.rooms.clear();
  }
}

// ------------------------------------------------------------------ HTTP + WebSocket server

/**
 * Creates and starts the HTTP + WebSocket server. Returns { server, roomManager, close() } and is thenable.
 * options: { allowedOrigins:[...]|null, trustProxy, demo, botFactions, maxConnections, maxPerIp, maxRooms }
 */
export function createMultiplayerServer(port = 8080, options = {}) {
  const botFactions = options.botFactions ?? (options.demo ? readDemoFactions() : null) ?? undefined;
  const roomManager = new RoomManager({ ...options, botFactions });
  const activeSockets = new Set();
  const perIp = new Map();
  const allowedOrigins = options.allowedOrigins?.length ? new Set(options.allowedOrigins) : null;
  const maxConnections = options.maxConnections ?? LIMITS.maxConnections;
  const maxPerIp = options.maxPerIp ?? LIMITS.maxPerIp;

  const ipOf = req => {
    if (options.trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress || 'unknown';
  };

  const server = http.createServer((req, res) => {
    // Health check for hosting platforms; also a friendly page if someone opens the URL in a browser.
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'ok', server: 'Call of Karen Multiplayer', rooms: roomManager.rooms.size, players: roomManager.playerCount() }));
  });

  const refuse = (socket, status, text) => {
    try { socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch {}
    socket.destroy();
  };

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
      return refuse(socket, 400, 'Bad Request');
    }
    const origin = req.headers.origin;
    if (allowedOrigins && origin && !allowedOrigins.has(origin)) return refuse(socket, 403, 'Forbidden');
    if (activeSockets.size >= maxConnections) return refuse(socket, 503, 'Service Unavailable');
    const ip = ipOf(req);
    if ((perIp.get(ip) || 0) >= maxPerIp) return refuse(socket, 429, 'Too Many Requests');

    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return refuse(socket, 400, 'Bad Request'); }
    const requested = sanitizeRoomCode(url.searchParams.get('room'));
    const isQuick = !requested || requested.toLowerCase() === 'auto';
    const room = isQuick ? roomManager.quickMatchRoom() : roomManager.getOrCreateRoom(requested);
    if (!room) return refuse(socket, 503, 'Service Unavailable');

    activeSockets.add(socket);
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeSockets.delete(socket);
      const n = (perIp.get(ip) || 1) - 1;
      if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
    };
    socket.on('close', release);

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${computeWebSocketAccept(key)}`,
      '\r\n',
    ].join('\r\n'));
    socket.setNoDelay(true);
    socket.setTimeout(LIMITS.idleTimeoutMs, () => socket.destroy());

    const team = url.searchParams.has('team') ? parseInt(url.searchParams.get('team'), 10) : undefined;
    const client = room.addPlayer(socket, {
      name: url.searchParams.get('name') || 'Player',
      faction: url.searchParams.get('faction') || 'karens',
      team,
    });
    if (!client) {
      sendWebSocketFrame(socket, JSON.stringify({ type: 'error', code: 'room_full' }), 0x1);
      closeWebSocket(socket, 1013);
      return;
    }

    sendWebSocketFrame(socket, JSON.stringify({
      type: 'init',
      actorId: client.actor.id,
      team: client.team,
      roomCode: room.roomCode,
      quick: room.quick,
      tickRate: 60,
      snapshotRate: 20,
      matchNumber: room.matchNumber,
      mode: room.mode,
      scoreLimit: room.sim.scoreLimit,
      timeLimit: room.sim.timeLimit,
      restartMs: room.restartMs,
      players: room.rosterPlayers(),
    }), 0x1);

    let windowStart = performance.now();
    let windowCount = 0;
    const leave = () => {
      release();
      room.removePlayer(socket);
    };

    attachWebSocketParser(socket, {
      onMessage(text) {
        const now = performance.now();
        if (now - windowStart >= 1000) { windowStart = now; windowCount = 0; }
        if (++windowCount > LIMITS.maxMsgPerSec) return; // flooding: drop, don't process
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'input') {
          room.applyInput(socket, msg);
        } else if (msg.type === 'ping') {
          const c = room.clients.get(socket);
          if (c && finite(msg.rtt)) c.rtt = clamp(msg.rtt, 0, 1000);
          sendWebSocketFrame(socket, JSON.stringify({ type: 'pong', clientTime: msg.clientTime, serverTime: Date.now() }), 0x1);
        }
      },
      onClose: leave,
      onError: leave,
    });
  });

  server.listen(port, options.host);
  const reaper = setInterval(() => roomManager.reapEmpty(), 2000);
  reaper.unref?.();

  const close = () => {
    clearInterval(reaper);
    roomManager.closeAll();
    for (const s of activeSockets) {
      try { s.destroy(); } catch {}
    }
    activeSockets.clear();
    return new Promise(resolve => {
      try { server.closeAllConnections?.(); } catch {}
      server.close(() => resolve());
    });
  };

  const result = { server, roomManager, close };
  // Allow both `const res = createMultiplayerServer(...)` and `const res = await createMultiplayerServer(...)`
  const promise = new Promise(resolve => {
    if (server.listening) resolve(result);
    else server.once('listening', () => resolve(result));
  });
  return Object.assign(promise, result);
}

// Standalone execution: node server/multiplayer.mjs [port]
if (process.argv[1] && /multiplayer\.m?js$/.test(process.argv[1])) {
  const port = parseInt(process.argv[2], 10) || parseInt(process.env.PORT, 10) || 8080;
  createMultiplayerServer(port, {
    allowedOrigins: (process.env.HOA_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    trustProxy: process.env.HOA_TRUST_PROXY === '1',
    demo: process.env.HOA_DEMO === '1',
  }).then(({ server }) => {
    console.log(`Call of Karen multiplayer server listening on ws://localhost:${server.address().port}/ws`);
  });
}
