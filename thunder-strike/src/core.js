class Pool {
  constructor(size, factory) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) this.items[i] = factory();
    this.cursor = 0;
  }
  acquire() {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const it = this.items[idx];
      if (!it.active) {
        this.cursor = (idx + 1) % n;
        it.active = true;
        return it;
      }
    }
    return null;
  }
  forEach(fn) {
    const arr = this.items;
    for (let i = 0; i < arr.length; i++) if (arr[i].active) fn(arr[i], i);
  }
  clear() {
    const arr = this.items;
    for (let i = 0; i < arr.length; i++) arr[i].active = false;
  }
}

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

class SpatialGrid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
    this.mark = 0;
  }
  clear() { this.map.clear(); }
  insert(e) {
    const c = this.cell;
    const x0 = Math.floor((e.x - e.w / 2) / c), x1 = Math.floor((e.x + e.w / 2) / c);
    const y0 = Math.floor((e.y - e.h / 2) / c), y1 = Math.floor((e.y + e.h / 2) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = cx * 4096 + cy;
        let a = this.map.get(k);
        if (!a) { a = []; this.map.set(k, a); }
        a.push(e);
      }
    }
  }
  query(x, y, r, out) {
    out.length = 0;
    this.mark++;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.map.get(cx * 4096 + cy);
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const e = a[i];
          if (e._mark === this.mark) continue;
          e._mark = this.mark;
          out.push(e);
        }
      }
    }
    return out;
  }
}

// HUD 布局：按安全区 + 屏幕底部对齐，不再写死 1334 的设计高度。
// 微信端 view.padTop/padBottom 由安全区换算，web 端为 0，两端表现一致。
function uiLayout(view) {
  const base = CONFIG.ui;
  const padT = view.padTop || 0;
  const padB = view.padBottom || 0;
  const h0 = CONFIG.design.height;
  const safeTop = Math.max(base.safeTop, padT + 20);
  return {
    safeTop: safeTop,
    bottom: view.h - padB,
    bomb: {
      x: view.w - (CONFIG.design.width - base.bombBtn.x),
      y: view.h - padB - (h0 - base.bombBtn.y),
      r: base.bombBtn.r
    },
    // 手机没有 P 键，暂停必须是可点的
    pause: {
      x: view.w - (CONFIG.design.width - base.pauseBtn.x),
      y: safeTop + 22,
      r: base.pauseBtn.r
    }
  };
}

class GameLoop {
  constructor(tick) {
    this.tick = tick;
    this.running = false;
    this.last = 0;
    this._step = this.step.bind(this);
  }
  step(ts) {
    if (!this.running) return;
    const t = ts === undefined ? Platform.now() : ts;
    let dt = t - this.last;
    this.last = t;
    if (!(dt > 0)) dt = 16;
    if (dt > 33) dt = 33;
    this.tick(dt);
    Platform.raf(this._step);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = Platform.now();
    Platform.raf(this._step);
  }
  stop() { this.running = false; }
  // 从后台回来重新对齐时间基准，避免第一帧 dt 爆掉
  resync() { this.last = Platform.now(); }
  resume() {
    this.resync();
    if (this.running) return;
    this.running = true;
    Platform.raf(this._step);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Pool: Pool, SpatialGrid: SpatialGrid, GameLoop: GameLoop, aabb: aabb, uiLayout: uiLayout };
}
