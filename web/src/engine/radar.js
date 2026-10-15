// In-game minimap / compass radar for HOA Warfare.
// Renders to a 2D canvas overlay in the HUD.
// Features:
// - Rotating player-centric radar (forward is UP) with north indicator
// - Cul-de-Sac circular court + road outline
// - Suburban lots and house footprints
// - Objective zones (King of the Lawn) pulsing with team color
// - Dropped receipts (Receipt Check)
// - Friendly teammates (blue/cyan dots with orientation pips)
// - Enemy dots:
//    - Visible when shooting (firingUntil / revealedUntil)
//    - Red skull / ping when snitched for camping (>20s)
//    - Spectator sees all
// - Local player dot + vision cone

export class Radar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.center = this.size / 2;
    this.radius = this.size / 2 - 3;
    this.rangeM = 38; // range in meters from player to edge of radar
    this.scale = this.radius / this.rangeM;
  }

  render(sim, me, spectate = false) {
    const ctx = this.ctx;
    const sz = this.size, c = this.center, r = this.radius, sc = this.scale;
    const now = sim.time;

    ctx.clearRect(0, 0, sz, sz);

    // Circular clipping mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = '#111d35ee';
    ctx.fillRect(0, 0, sz, sz);

    // Player position and yaw
    const px = me ? me.pos.x : 0;
    const pz = me ? me.pos.z : 0;
    const yaw = me ? me.yaw : 0;

    // Transform: center on player, rotate so facing direction (-yaw) is UP
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(yaw);
    ctx.scale(sc, sc);
    ctx.translate(-px, -pz);

    // 1. Draw Map Geometry (Court, Street, Houses)
    // Asphalt court (Cul-de-sac circle)
    ctx.fillStyle = '#1d2b53';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();

    // Street corridor
    ctx.fillRect(-5, 0, 10, 48);

    // Perimeter boundary line
    ctx.strokeStyle = '#29adff33';
    ctx.lineWidth = 1;
    ctx.strokeRect(-44, -48, 88, 96);

    // Houses
    ctx.fillStyle = '#0a1020cc';
    ctx.strokeStyle = '#fff1e844';
    ctx.lineWidth = 0.5;
    const houses = [
      [-27, 0, 10, 14], [27, 0, 10, 14],
      [-17, -23, 12, 10], [17, -23, 12, 10],
      [-19, 24, 10, 12], [19, 24, 10, 12],
    ];
    for (const [hx, hz, hw, hd] of houses) {
      ctx.fillRect(hx - hw / 2, hz - hd / 2, hw, hd);
      ctx.strokeRect(hx - hw / 2, hz - hd / 2, hw, hd);
    }

    // 2. Draw Mode Objectives (e.g. King of the Lawn zone or Receipts)
    if (sim.mode && sim.mode.objects) {
      for (const obj of sim.mode.objects) {
        if (obj.kind === 'receipt') {
          ctx.fillStyle = '#ffec27';
          ctx.beginPath();
          ctx.arc(obj.pos.x, obj.pos.z, 0.9, 0, Math.PI * 2);
          ctx.fill();
        } else if (obj.kind === 'zone') {
          const pulse = 1 + 0.12 * Math.sin(now * 6);
          ctx.strokeStyle = obj.owner === me.team ? '#29adff' : obj.owner === (1 - me.team) ? '#ff004d' : '#ffec27';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(obj.pos.x, obj.pos.z, obj.radius * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle + '33';
          ctx.fill();
        }
      }
    }

    // 3. Draw Actors (Teammates & Enemies)
    for (const a of sim.actors) {
      if (!a.alive || a.id === me?.id) continue;
      const isAlly = a.team === me?.team;
      const revealed = spectate || isAlly || (a.revealedUntil && a.revealedUntil > now) || (a.campState?.state === 'snitch');

      if (!revealed) continue;

      const ax = a.pos.x, az = a.pos.z;
      const dist = Math.hypot(ax - px, az - pz);
      if (dist > this.rangeM * 1.5) continue;

      ctx.save();
      ctx.translate(ax, az);

      if (isAlly) {
        // Teammate: cyan dot
        ctx.fillStyle = '#29adff';
        ctx.beginPath();
        ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Enemy: red dot
        const snitched = a.campState?.state === 'snitch';
        if (snitched) {
          // Snitched camper: pulsing ping ring!
          const ping = (now * 4) % 1;
          ctx.strokeStyle = '#ff004d';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(0, 0, 1.5 + ping * 3.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#ffec27';
        } else {
          ctx.fillStyle = '#ff004d';
        }
        ctx.beginPath();
        ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore(); // restore transform

    // 4. Draw Center Local Player (at c, c)
    if (me && me.alive) {
      // Vision cone
      ctx.fillStyle = 'rgba(255, 236, 39, 0.16)';
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r * 0.45, -Math.PI / 2 - 0.38, -Math.PI / 2 + 0.38);
      ctx.closePath();
      ctx.fill();

      // Player arrow
      ctx.fillStyle = '#ffec27';
      ctx.beginPath();
      ctx.moveTo(c, c - 5);
      ctx.lineTo(c + 4, c + 4);
      ctx.lineTo(c, c + 2);
      ctx.lineTo(c - 4, c + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore(); // restore clipping

    // 5. Radar Chrome & Compass
    // Outer ring with camping indicator glow
    ctx.strokeStyle = me?.campState?.state === 'warning' ? '#ffa300' : me?.campState?.state === 'snitch' ? '#ff004d' : '#fff1e8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();

    // North indicator on perimeter
    // North is at world (0, -1), which is rotated by -yaw:
    const northAngle = -yaw - Math.PI / 2;
    const nx = c + Math.cos(northAngle) * (r - 7);
    const ny = c + Math.sin(northAngle) * (r - 7);
    ctx.fillStyle = '#ff004d';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    // Range rings
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(c, c, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs lines
    ctx.beginPath();
    ctx.moveTo(c, c - r); ctx.lineTo(c, c + r);
    ctx.moveTo(c - r, c); ctx.lineTo(c + r, c);
    ctx.stroke();
  }
}
