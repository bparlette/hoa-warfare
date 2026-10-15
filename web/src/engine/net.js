// Client-side networking for Call of Karen: HOA Warfare.
// Connects via WebSocket, manages 60Hz input transmission, buffers 20Hz world snapshots,
// computes round-trip latency, and performs client-side interpolation of remote actors.

export class NetClient {
  constructor(options = {}) {
    this.ws = null;
    this.actorId = null;
    this.team = null;
    this.roomCode = null;
    this.latency = 0;
    this.connected = false;
    this.inputSeq = 0;
    this.currentInput = {
      keys: { fwd: false, back: false, left: false, right: false, jump: false, fire: false },
      yaw: 0,
      pitch: 0,
      weaponSlot: 'primary',
    };
    this.snapshotBuffer = [];
    this.maxBufferLength = options.maxBufferLength || 30;
    this.interpolationDelay = options.interpolationDelay ?? 100; // ms
    this.inputInterval = null;
    this.pingInterval = null;
    this.onSnapshot = null;
    this.onConnect = null;
    this.onDisconnect = null;
  }

  /**
   * Connect to multiplayer server.
   * @param {string} url - WebSocket URL, e.g. ws://host/ws?room=code
   * @param {{ name?: string, faction?: string, team?: number, onSnapshot?: Function, onConnect?: Function, onDisconnect?: Function }} callbacks
   * @returns {Promise<{ actorId: string, team: number, roomCode: string }>}
   */
  connect(url, { name = 'Player', faction = 'karens', team, onSnapshot, onConnect, onDisconnect } = {}) {
    this.onSnapshot = onSnapshot;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;

    return new Promise((resolve, reject) => {
      try {
        const u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost');
        if (name && !u.searchParams.has('name')) u.searchParams.set('name', name);
        if (faction && !u.searchParams.has('faction')) u.searchParams.set('faction', faction);
        if (team !== undefined && !u.searchParams.has('team')) u.searchParams.set('team', String(team));

        const ws = new WebSocket(u.toString());
        this.ws = ws;

        let resolved = false;

        ws.onopen = () => {
          this.connected = true;
          this.startInputLoop();
          this.startPingLoop();
        };

        ws.onmessage = event => {
          try {
            const raw = typeof event.data === 'string' ? event.data : event.data.toString();
            const msg = JSON.parse(raw);
            this.handleMessage(msg);

            if (msg.type === 'init' && !resolved) {
              resolved = true;
              resolve({
                actorId: this.actorId,
                team: this.team,
                roomCode: this.roomCode,
              });
            }
          } catch (err) {
            console.error('NetClient message parse error:', err);
          }
        };

        ws.onclose = () => {
          this.connected = false;
          this.cleanup();
          this.onDisconnect?.();
        };

        ws.onerror = err => {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  handleMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'init') {
      this.actorId = msg.actorId;
      this.team = msg.team;
      this.roomCode = msg.roomCode;
      this.onConnect?.(msg);
    } else if (msg.type === 'snapshot') {
      const entry = {
        ...msg,
        receivedAt: performance.now(),
      };
      this.snapshotBuffer.push(entry);
      if (this.snapshotBuffer.length > this.maxBufferLength) {
        this.snapshotBuffer.shift();
      }
      this.onSnapshot?.(msg);
    } else if (msg.type === 'pong') {
      if (typeof msg.clientTime === 'number') {
        this.latency = Math.max(0, Date.now() - msg.clientTime);
      }
    }
  }

  /**
   * Set inputs to be sent on next tick.
   */
  setInput(inputOrKeys, yaw, pitch, weaponSlot) {
    if (inputOrKeys && typeof inputOrKeys === 'object' && inputOrKeys.keys) {
      this.currentInput = {
        keys: { ...this.currentInput.keys, ...inputOrKeys.keys },
        yaw: inputOrKeys.yaw ?? this.currentInput.yaw,
        pitch: inputOrKeys.pitch ?? this.currentInput.pitch,
        weaponSlot: inputOrKeys.weaponSlot ?? this.currentInput.weaponSlot,
      };
    } else if (inputOrKeys && typeof inputOrKeys === 'object') {
      this.currentInput = {
        keys: { ...this.currentInput.keys, ...inputOrKeys },
        yaw: yaw ?? this.currentInput.yaw,
        pitch: pitch ?? this.currentInput.pitch,
        weaponSlot: weaponSlot ?? this.currentInput.weaponSlot,
      };
    }
  }

  /**
   * Immediately update and send input packet.
   */
  sendInput(keys, yaw, pitch, weaponSlot) {
    this.setInput(keys, yaw, pitch, weaponSlot);
    this.sendCurrentInput();
  }

  sendCurrentInput() {
    if (!this.ws || this.ws.readyState !== 1) return; // 1 = OPEN
    this.inputSeq++;
    const packet = {
      type: 'input',
      seq: this.inputSeq,
      keys: {
        fwd: Boolean(this.currentInput.keys?.fwd),
        back: Boolean(this.currentInput.keys?.back),
        left: Boolean(this.currentInput.keys?.left),
        right: Boolean(this.currentInput.keys?.right),
        jump: Boolean(this.currentInput.keys?.jump),
        fire: Boolean(this.currentInput.keys?.fire),
        sprint: Boolean(this.currentInput.keys?.sprint),
        reload: Boolean(this.currentInput.keys?.reload),
        melee: Boolean(this.currentInput.keys?.melee),
        grenade: Boolean(this.currentInput.keys?.grenade),
      },
      yaw: this.currentInput.yaw || 0,
      pitch: this.currentInput.pitch || 0,
      weaponSlot: this.currentInput.weaponSlot || 'primary',
    };
    try {
      this.ws.send(JSON.stringify(packet));
    } catch {}
  }

  startInputLoop() {
    if (this.inputInterval) clearInterval(this.inputInterval);
    // 60Hz input transmission
    this.inputInterval = setInterval(() => {
      this.sendCurrentInput();
    }, 1000 / 60);
  }

  startPingLoop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    const sendPing = () => {
      if (this.ws && this.ws.readyState === 1) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
        } catch {}
      }
    };
    sendPing();
    this.pingInterval = setInterval(sendPing, 1000);
  }

  /**
   * Returns an interpolated world snapshot for smooth rendering of remote actors.
   * @param {number} [renderTime] - Render timestamp (server seconds or client ms).
   *                                If omitted, defaults to client time minus interpolationDelay.
   */
  getInterpolatedSnapshot(renderTime) {
    if (this.snapshotBuffer.length === 0) return null;
    if (this.snapshotBuffer.length === 1) return this.snapshotBuffer[0];

    const now = performance.now();
    let targetTime = renderTime;
    const useServerTime = typeof targetTime === 'number' && targetTime < 100000;

    if (targetTime === undefined || targetTime === null) {
      targetTime = now - this.interpolationDelay;
    }

    const getTime = snap => (useServerTime ? snap.time : snap.receivedAt);

    const first = this.snapshotBuffer[0];
    const last = this.snapshotBuffer[this.snapshotBuffer.length - 1];

    if (targetTime <= getTime(first)) return first;
    if (targetTime >= getTime(last)) return last;

    // Locate two adjacent snapshots surrounding targetTime
    let s0 = first;
    let s1 = last;
    for (let i = 0; i < this.snapshotBuffer.length - 1; i++) {
      const t0 = getTime(this.snapshotBuffer[i]);
      const t1 = getTime(this.snapshotBuffer[i + 1]);
      if (t0 <= targetTime && targetTime <= t1) {
        s0 = this.snapshotBuffer[i];
        s1 = this.snapshotBuffer[i + 1];
        break;
      }
    }

    const t0 = getTime(s0);
    const t1 = getTime(s1);
    const span = t1 - t0;
    const factor = span > 0 ? Math.max(0, Math.min(1, (targetTime - t0) / span)) : 0;

    const actors0 = new Map((s0.actors || []).map(a => [a.id, a]));
    const interpolatedActors = (s1.actors || []).map(a1 => {
      const a0 = actors0.get(a1.id);
      if (!a0) return { ...a1 };

      // Shortest angle wrap for yaw
      let dy = a1.yaw - a0.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;

      return {
        ...a1,
        x: a0.x + (a1.x - a0.x) * factor,
        y: a0.y + (a1.y - a0.y) * factor,
        z: a0.z + (a1.z - a0.z) * factor,
        yaw: a0.yaw + dy * factor,
        pitch: a0.pitch + (a1.pitch - a0.pitch) * factor,
      };
    });

    return {
      type: 'snapshot',
      seq: s1.seq,
      time:
        typeof s0.time === 'number' && typeof s1.time === 'number'
          ? s0.time + (s1.time - s0.time) * factor
          : s1.time,
      actors: interpolatedActors,
      projectiles: s1.projectiles || [],
      scores: s1.scores || [0, 0],
      events: s1.events || [],
      helicopters: s1.helicopters || [],
    };
  }

  cleanup() {
    if (this.inputInterval) {
      clearInterval(this.inputInterval);
      this.inputInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    this.cleanup();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connected = false;
  }

  close() {
    this.disconnect();
  }
}
