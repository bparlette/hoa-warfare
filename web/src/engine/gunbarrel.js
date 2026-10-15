// James Bond 007 Gun-Barrel Opening Intro sequence for Call of Karen: HOA Warfare.
// Features:
// - White tracking dots moving horizontally across the black screen
// - Rifled gunbarrel spiral iris tracking across the camera
// - Iris pauses in center, framing the cul-de-sac
// - Subpoena citation gunshot sound + red ink wash dripping down the lens
// - Instant skip on click or Space

export class GunbarrelIntro {
  constructor(canvas, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;
    this.active = false;
    this.t = 0;
    this.duration = 3.2;
    this.onComplete = null;
    this.shotFired = false;
  }

  start(onComplete) {
    this.active = true;
    this.t = 0;
    this.shotFired = false;
    this.onComplete = onComplete;
    this.canvas.classList.remove('hidden');
    this.resize();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.canvas.classList.add('hidden');
    if (this.onComplete) {
      const cb = this.onComplete;
      this.onComplete = null;
      cb();
    }
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.t >= this.duration) {
      this.stop();
      return;
    }

    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const progress = this.t / this.duration; // 0..1
    const cx = w / 2, cy = h / 2;

    // Phase 1: White tracking dots moving across screen (0.0s - 1.0s)
    // Phase 2: Iris stops in center (1.0s - 1.8s)
    // Phase 3: Gunshot + Red blood/ink wash drips down (1.8s - 3.2s)
    let irisX = cx;
    if (this.t < 1.0) {
      irisX = -120 + (cx + 120) * (this.t / 1.0);
    }

    // Outer black fill
    ctx.fillStyle = '#060b1a';
    ctx.fillRect(0, 0, w, h);

    const radius = Math.min(w, h) * 0.28;

    // Draw White Tracking Dots if before stop
    if (this.t < 1.0) {
      const numDots = 8;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < numDots; i++) {
        const dotX = irisX - 180 + i * 26;
        if (dotX > 0 && dotX < w) {
          ctx.beginPath();
          ctx.arc(dotX, cy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Cut out Gun-Barrel Iris (transparent hole to see 3D game)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(irisX, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Gun-Barrel Rifled Spirals around the Iris
    ctx.save();
    ctx.translate(irisX, cy);
    const numGrooves = 16;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    for (let i = 0; i < numGrooves; i++) {
      const angle = (i / numGrooves) * Math.PI * 2 + (this.t * 0.5);
      ctx.beginPath();
      const r1 = radius;
      const r2 = radius + Math.min(w, h) * 0.45;
      const x1 = Math.cos(angle) * r1, y1 = Math.sin(angle) * r1;
      const x2 = Math.cos(angle + 0.35) * r2, y2 = Math.sin(angle + 0.35) * r2;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // Inner iris ring
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Phase 3: Shot fired at t = 1.6s
    if (this.t >= 1.6 && !this.shotFired) {
      this.shotFired = true;
      if (this.sfx) this.sfx.warn();
    }

    // Red Ink / Blood Drip Wash (1.6s to 3.2s)
    if (this.t >= 1.6) {
      const dripProgress = (this.t - 1.6) / 1.6; // 0..1
      ctx.save();
      // Clip to inside iris
      ctx.beginPath();
      ctx.arc(irisX, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // Red wash pouring down
      const dripY = (cy - radius) + (radius * 2.2) * dripProgress;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
      ctx.beginPath();
      ctx.moveTo(irisX - radius - 20, cy - radius - 20);
      ctx.lineTo(irisX + radius + 20, cy - radius - 20);
      ctx.lineTo(irisX + radius + 20, dripY);

      // Scalloped wavy drip edge
      for (let x = irisX + radius; x >= irisX - radius; x -= 20) {
        const wave = Math.sin(x * 0.08 + this.t * 10) * 12;
        ctx.lineTo(x, dripY + wave);
      }
      ctx.closePath();
      ctx.fill();

      // "CITATION SERVED" stamp in center
      if (dripProgress > 0.35) {
        ctx.fillStyle = '#ffec27';
        ctx.font = 'bold 32px Impact, "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText('007: CITATION SERVED', irisX, cy);
        ctx.fillText('007: CITATION SERVED', irisX, cy);
      }
      ctx.restore();
    }
  }
}
