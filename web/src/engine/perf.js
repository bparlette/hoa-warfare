// ?perf=1 : frame-time overlay for performance work on phones and desktops.
// Shows fps, average and worst frame time over the last second, draw calls, triangles,
// live FX objects, quality tier and the adaptive resolution scale.

export class PerfOverlay {
  constructor(renderer) {
    this.r = renderer;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:60;font:11px/1.35 ui-monospace,monospace;color:#00e436;background:#000c;padding:4px 7px;pointer-events:none;white-space:pre';
    document.body.appendChild(this.el);
    this.frames = [];
    this.next = 0;
  }

  update(dt) {
    const now = performance.now();
    this.frames.push(dt * 1000);
    if (now < this.next) return;
    this.next = now + 500;
    const f = this.frames.splice(0);
    if (!f.length) return;
    const avg = f.reduce((a, b) => a + b, 0) / f.length, worst = Math.max(...f);
    const info = this.r.gl.info.render, q = this.r.quality;
    const px = this.r.gl.getPixelRatio();
    this.el.style.color = avg > 20 ? '#ff004d' : avg > 17.5 ? '#ffec27' : '#00e436';
    this.el.textContent =
      `${(1000 / avg).toFixed(0)} fps  avg ${avg.toFixed(1)} ms  worst ${worst.toFixed(1)} ms\n` +
      `draws ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k  fx ${this.r.fx.length}  splats ${this.r.splatCount}\n` +
      `tier ${q.tier}  ${this.r.retro ? '16-bit' : `px ${px.toFixed(2)} (scale ${q.scale.toFixed(2)})`}  shadow ${q.shadow}`;
  }
}
