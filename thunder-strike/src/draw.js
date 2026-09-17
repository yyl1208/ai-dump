// 小游戏 canvas 不认 system-ui / -apple-system，统一走 Platform.font()
const FONT = Platform.font();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// 个别老版本基础库的 canvas 没有 ellipse，用「缩放 + arc」兜底
function ellipsePath(ctx, x, y, rx, ry, a0, a1) {
  if (ctx.ellipse) { ctx.ellipse(x, y, rx, ry, 0, a0, a1); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(ry ? rx / ry : 1, 1);
  ctx.arc(0, 0, ry || rx, a0, a1);
  ctx.restore();
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

const Draw = {
  initStars(view) {
    const arr = [];
    for (let i = 0; i < CONFIG.background.starCount; i++) {
      const layer = i % 3;
      arr.push({
        x: Math.random() * view.w,
        y: Math.random() * view.h,
        s: layer === 0 ? 1 : layer === 1 ? 1.6 : 2.4,
        v: 0.35 + layer * 0.4,
        a: 0.22 + layer * 0.26
      });
    }
    return arr;
  },

  background(ctx, view, stars, dt) {
    const grad = ctx.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, CONFIG.colors.bg0);
    grad.addColorStop(1, CONFIG.colors.bg1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);

    const sp = CONFIG.background.speed;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.y += sp * s.v * dt / 1000;
      if (s.y > view.h) { s.y = -4; s.x = Math.random() * view.w; }
      ctx.fillStyle = 'rgba(200,220,255,' + s.a + ')';
      ctx.fillRect(s.x, s.y, s.s, s.s * 2.2);
    }
  },

  option(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    const f = 6 + Math.sin(t / 34) * 2;
    ctx.fillStyle = 'rgba(120,230,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(-4, 8); ctx.lineTo(0, 8 + f); ctx.lineTo(4, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = CONFIG.colors.side;
    poly(ctx, [0, -14, 6, 2, 10, 11, 0, 7, -10, 11, -6, 2]);
    ctx.fill();
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ellipsePath(ctx, 0, -3, 2, 4, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  },

  player(ctx, p) {
    if (p.isInv() && Math.floor(p.t / 90) % 2 === 0) return;
    const t = p.t;

    if (p.options > 0) {
      const o = CONFIG.option;
      if (p.options >= 2) Draw.option(ctx, p.x - o.offsetX, p.y + o.offsetY, t);
      Draw.option(ctx, p.x + o.offsetX, p.y + o.offsetY, t);
    }

    // 擦弹圈已移除：只保留道具拾取范围的一圈淡痕，让引擎线的收益看得见
    const pr = p.pickRadius();
    ctx.strokeStyle = 'rgba(127,231,255,0.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pr, 0, 6.2832);
    ctx.stroke();

    if (p.shieldT > 0) {
      const a = p.shieldT < 1200 ? (Math.floor(t / 90) % 2 === 0 ? 0.75 : 0.25) : 0.6;
      ctx.strokeStyle = 'rgba(138,255,193,' + a + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 40, 0, 6.2832);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(138,255,193,' + (a * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 46, 0, 6.2832);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(p.x, p.y);

    const f = 12 + Math.sin(t / 38) * 4;
    ctx.fillStyle = 'rgba(120,230,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(-7, 15); ctx.lineTo(0, 15 + f); ctx.lineTo(7, 15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,226,150,0.95)';
    ctx.beginPath();
    ctx.moveTo(-3.5, 15); ctx.lineTo(0, 15 + f * 0.55); ctx.lineTo(3.5, 15);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = CONFIG.colors.playerDark;
    poly(ctx, [0, -26, 9, -2, 25, 12, 26, 22, 8, 17, 0, 24, -8, 17, -26, 22, -25, 12, -9, -2]);
    ctx.fill();

    ctx.fillStyle = CONFIG.colors.player;
    poly(ctx, [0, -22, 6, 0, 0, 13, -6, 0]);
    ctx.fill();

    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ellipsePath(ctx, 0, -6, 3.2, 6.5, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,86,104,0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, 6.2832);
    ctx.fill();
  },

  enemy(ctx, e) {
    const w = e.w / 2, h = e.h / 2;

    // 蓄力（狙击 / 光束塔）时画预警瞄准线
    if (e.charge === 1 && e.aimX !== undefined) {
      ctx.strokeStyle = 'rgba(255,93,108,' + (0.35 + Math.sin(e.t / 60) * 0.3).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 12]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.aimX, e.aimY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.move === 'dive') ctx.rotate(e.angle - 1.5708);

    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.cfg.color;
    const dark = e.flash > 0 ? '#ffffff' : 'rgba(10,10,30,0.45)';
    const sh = e.cfg.shape || 'craft';

    if (sh === 'blade') {
      // 刃形：尖三角，杂兵轮廓
      poly(ctx, [0, h, w, -h, 0, -h * 0.35, -w, -h]);
      ctx.fill();
    } else if (sh === 'craft') {
      // 战机：梯形机身 + 座舱
      poly(ctx, [0, h, w, h * 0.15, w * 0.55, -h, -w * 0.55, -h, -w, h * 0.15]);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(-w * 0.42, -h * 0.25, w * 0.84, h * 0.55);
    } else if (sh === 'gem') {
      // 菱形：织网 / 幻影
      poly(ctx, [0, h, w * 0.95, 0, 0, -h, -w * 0.95, 0]);
      ctx.fill();
      ctx.fillStyle = 'rgba(10,10,30,0.4)';
      poly(ctx, [0, h * 0.5, w * 0.4, 0, 0, -h * 0.5, -w * 0.4, 0]);
      ctx.fill();
    } else if (sh === 'arrow') {
      // 箭头：突击系，高速感
      poly(ctx, [0, h, w * 0.8, -h * 0.2, 0, -h * 0.5, -w * 0.8, -h * 0.2]);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-2, -h * 0.4, 4, h * 0.9);
    } else if (sh === 'block') {
      // 方块：重装 / 炮艇
      roundRect(ctx, -w, -h, e.w, e.h, 8);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(-w * 0.6, -h * 0.5, w * 1.2, h * 0.6);
    } else if (sh === 'hex') {
      // 六边形：狙击 / 布网
      poly(ctx, [-w * 0.55, -h, w * 0.55, -h, w, 0, w * 0.55, h, -w * 0.55, h, -w, 0]);
      ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#2a2f52';
      ctx.fillRect(-3, h * 0.2, 6, h * 1.1);
    } else if (sh === 'disc') {
      // 圆盘：旋涡 / 尘埃
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.95, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.5, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.72, e.t / 300, e.t / 300 + 3.6);
      ctx.stroke();
    } else if (sh === 'pod') {
      // 炮台：机身 + 两侧炮管
      roundRect(ctx, -w, -h, e.w, e.h, 8);
      ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#3a4068';
      ctx.fillRect(-w - 14, -6, 16, 14);
      ctx.fillRect(w - 2, -6, 16, 14);
      ctx.fillStyle = dark;
      ctx.fillRect(-w * 0.6, -h * 0.5, w * 1.2, h * 0.6);
    } else if (sh === 'tower') {
      // 塔形：迫击 / 光束塔 / 磁轨炮
      poly(ctx, [-w * 0.8, h, -w * 0.5, -h * 0.6, w * 0.5, -h * 0.6, w * 0.8, h]);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(-w * 0.35, -h * 0.35, w * 0.7, h * 0.9);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#eaffff';
      ctx.fillRect(-w * 0.18, -h * 1.1, w * 0.36, h * 0.6);
    } else if (sh === 'mothership') {
      // 母舰：宽体 + 甲板 + 引擎
      poly(ctx, [-w, -h * 0.4, -w * 0.6, -h, w * 0.6, -h, w, -h * 0.4, w * 0.8, h, -w * 0.8, h]);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(-w * 0.55, -h * 0.35, w * 1.1, h * 0.8);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#eaffff';
      ctx.fillRect(-w * 0.3, h * 0.45, w * 0.6, 6);
    } else if (sh === 'crate') {
      // 补给舱：金色物资箱 + 呼吸光环。刻意避开所有敌机的红/橙/绿色系，
      // 让玩家在满屏红弹里也能一眼锁定"这个要打"。
      const pulse = 0.5 + Math.sin(e.t / 180) * 0.5;
      ctx.fillStyle = 'rgba(255,209,102,' + (0.16 + pulse * 0.24).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(w, h) * (1.28 + pulse * 0.2), 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.cfg.color;
      roundRect(ctx, -w, -h, e.w, e.h, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,40,10,0.55)';
      ctx.fillRect(-w * 0.78, -h * 0.16, w * 1.56, h * 0.32);
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#fff6dc';
      ctx.fillRect(-w * 0.16, -h * 0.16, w * 0.32, h * 0.32);
    } else {
      poly(ctx, [-w, 0, -w * 0.55, -h, w * 0.55, -h, w, 0, w * 0.55, h, -w * 0.55, h]);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(-w * 0.38, -h * 0.32, w * 0.76, h * 0.64);
    }

    // trait: shield —— 护盾环，破盾前是硬目标
    if (e.shieldHp > 0) {
      ctx.strokeStyle = 'rgba(160,220,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(w, h) * 1.15, 0, 6.2832);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160,220,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(w, h) * 1.35, 0, 6.2832);
      ctx.stroke();
    }
    ctx.restore();

    if (!e.isBoss && e.maxHp > 3) {
      const bw = e.w, bh = 4;
      const bx = e.x - bw / 2, by = e.y - e.h / 2 - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#7dff9b';
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
    }
  },

  boss(ctx, b) {
    const w = b.w / 2, h = b.h / 2;
    const hit = b.flash > 0;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(-w, -h, b.w, b.h);

    ctx.fillStyle = hit ? '#ffffff' : '#2b2f52';
    if (b.key === 'sentinel') {
      poly(ctx, [0, h, w * 0.62, h * 0.35, w, -h * 0.35, w * 0.5, -h, -w * 0.5, -h, -w, -h * 0.35, -w * 0.62, h * 0.35]);
      ctx.fill();
      ctx.strokeStyle = hit ? '#ffffff' : '#6f79b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.82, b.t / 600, b.t / 600 + 4.6);
      ctx.stroke();
    } else if (b.key === 'leviathan') {
      poly(ctx, [0, h, w, h * 0.1, w * 0.8, -h * 0.6, w * 0.34, -h, -w * 0.34, -h, -w * 0.8, -h * 0.6, -w, h * 0.1]);
      ctx.fill();
      ctx.fillStyle = hit ? '#ffffff' : '#232748';
      ctx.fillRect(-w * 0.95, h * 0.15, w * 0.5, h * 0.7);
      ctx.fillRect(w * 0.45, h * 0.15, w * 0.5, h * 0.7);
    } else {
      poly(ctx, [0, h, w * 0.9, h * 0.2, w, -h * 0.5, w * 0.55, -h, -w * 0.55, -h, -w, -h * 0.5, -w * 0.9, h * 0.2]);
      ctx.fill();
      ctx.fillStyle = hit ? '#ffffff' : '#1b1f3d';
      ctx.fillRect(-w * 0.86, -h * 0.1, w * 0.42, h * 0.9);
      ctx.fillRect(w * 0.44, -h * 0.1, w * 0.42, h * 0.9);
    }
    ctx.restore();

    ctx.fillStyle = hit ? '#ffffff' : '#3a4068';
    const px = b.key === 'sentinel' ? w * 0.72 : w * 0.82;
    const py = h * 0.05;
    roundRect(ctx, b.x - px - 16, b.y + py, 32, 46, 6);
    ctx.fill();
    roundRect(ctx, b.x + px - 16, b.y + py, 32, 46, 6);
    ctx.fill();

    const core = b.rage ? '#ff2d55' : ['#ffd166', '#ff9a4d', '#ff5d6c'][b.phase - 1];
    const puls = 1 + Math.sin(b.t / (b.rage ? 90 : 180)) * (b.rage ? 0.22 : 0.12);
    ctx.fillStyle = hit ? '#ffffff' : core;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 26 * puls, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 12 * puls, 0, 6.2832);
    ctx.fill();
    if (!hit) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 34 * puls, 0, 6.2832);
      ctx.stroke();
    }
  },

  // ---- 玩家子弹：按弹型区分外观 ----
  bulletPlayer(ctx, b) {
    const x = b.x, y = b.y;

    if (b.kind === 'laser') {
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fillRect(x - b.w / 2 - 4, y - b.h / 2, b.w + 8, b.h);
      ctx.fillStyle = 'rgba(180,240,255,0.85)';
      ctx.fillRect(x - b.w / 2, y - b.h / 2, b.w, b.h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - b.w / 4, y - b.h / 2, b.w / 2, b.h);
      return;
    }

    if (b.kind === 'wave') {
      ctx.fillStyle = 'rgba(201,139,255,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, b.w * 0.95, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#e7c7ff';
      ctx.beginPath();
      ctx.arc(x, y, b.w * 0.5, 0, 6.2832);
      ctx.fill();
      return;
    }

    if (b.kind === 'homing') {
      ctx.fillStyle = 'rgba(127,231,255,0.28)';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(x, y + i * 7, b.w * 0.5 * (1 - i * 0.22), 0, 6.2832);
        ctx.fill();
      }
      ctx.fillStyle = '#9ffcff';
      ctx.beginPath();
      ctx.arc(x, y, b.w * 0.5, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, b.w * 0.22, 0, 6.2832);
      ctx.fill();
      return;
    }

    if (b.kind === 'boom') {
      const blink = Math.floor(b.t / 90) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(255,209,102,0.45)' : 'rgba(255,107,122,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, b.w, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = blink ? '#ffd166' : '#ff8a5e';
      ctx.beginPath();
      ctx.arc(x, y, b.w * 0.45, 0, 6.2832);
      ctx.fill();
      return;
    }

    ctx.fillStyle = b.dmg > 1 ? CONFIG.colors.bulletBig : CONFIG.colors.bullet;
    ctx.fillRect(x - b.w / 2, y - b.h / 2, b.w, b.h);
  },

  // ---- 敌方子弹：大玉慢而粗，小玉快而细，画法和判定半径一致 ----
  bulletEnemy(ctx, b) {
    const r = b.r;

    if (b.kind === 'homing') {
      ctx.fillStyle = 'rgba(255,93,108,0.30)';
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(b.x - b.vx / 600 * i * 9, b.y - b.vy / 600 * i * 9, r * (1 - i * 0.22), 0, 6.2832);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,214,102,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 1, 0, 6.2832);
      ctx.stroke();
      ctx.fillStyle = CONFIG.colors.enemyBullet;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.85, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.36, 0, 6.2832);
      ctx.fill();
      return;
    }

    if (b.kind === 'accel') {
      ctx.fillStyle = 'rgba(180,140,255,0.35)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 1.5, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#d9c2ff';
      ctx.fillRect(b.x - r * 0.4, b.y - r * 1.7, r * 0.8, r * 3.4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.7, 0, 6.2832);
      ctx.fill();
      return;
    }

    if (b.kind === 'boom') {
      const blink = Math.floor(b.t / 110) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(201,139,255,0.40)' : 'rgba(255,209,102,0.40)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 1.35, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = blink ? '#c98bff' : '#ffd166';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#fff3d0';
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.4, 0, 6.2832);
      ctx.fill();
      return;
    }

    // 常规弹：外圈软光晕 + 实心核心，越大压迫感越强
    ctx.fillStyle = 'rgba(255,93,108,0.28)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 1.28, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = CONFIG.colors.enemyBullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = CONFIG.colors.enemyBulletCore;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.48, 0, 6.2832);
    ctx.fill();
    if (r >= CONFIG.bulletSize.big) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(b.x - r * 0.28, b.y - r * 0.28, r * 0.2, 0, 6.2832);
      ctx.fill();
    }
  },

  bullets(ctx, pool) {
    const arr = pool.items;
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (!t.active || t.owner !== 0) continue;
      Draw.bulletPlayer(ctx, t);
    }
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (!t.active || t.owner !== 1) continue;
      Draw.bulletEnemy(ctx, t);
    }
  },

  // 7 种掉落物：颜色 + 形状 + 光环三重区分
  // 只有 W / O 带旋转光环 —— 这两条是最强成长线，扫一眼就知道是好东西
  powerupShape(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, r, 0, 6.2832);
    } else if (shape === 'diamond') {
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r * 1.15, y);
    } else if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const a = i * 1.0472 - 0.5236;
        const px = x + Math.cos(a) * r * 1.1;
        const py = y + Math.sin(a) * r * 1.1;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
    } else if (shape === 'shield') {
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.1, y - r * 0.6);
      ctx.lineTo(x + r * 1.1, y + r * 0.35);
      ctx.lineTo(x, y + r * 1.3);
      ctx.lineTo(x - r * 1.1, y + r * 0.35);
      ctx.lineTo(x - r * 1.1, y - r * 0.6);
    } else if (shape === 'triangle') {
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.2, y + r * 0.95);
      ctx.lineTo(x - r * 1.2, y + r * 0.95);
    } else if (shape === 'cross') {
      const a = r * 0.42, b = r * 1.25;
      ctx.moveTo(x - a, y - b); ctx.lineTo(x + a, y - b); ctx.lineTo(x + a, y - a);
      ctx.lineTo(x + b, y - a); ctx.lineTo(x + b, y + a); ctx.lineTo(x + a, y + a);
      ctx.lineTo(x + a, y + b); ctx.lineTo(x - a, y + b); ctx.lineTo(x - a, y + a);
      ctx.lineTo(x - b, y + a); ctx.lineTo(x - b, y - a); ctx.lineTo(x - a, y - a);
    } else {
      ctx.rect(x - r, y - r, r * 2, r * 2);   // square
    }
    ctx.closePath();
  },

  powerups(ctx, pool) {
    const arr = pool.items;
    for (let i = 0; i < arr.length; i++) {
      const u = arr[i];
      if (!u.active) continue;
      const cfg = CONFIG.powerups[u.type];
      const pulse = 1 + Math.sin(u.t / 150) * 0.12;

      // 稀有道具（W / O）的旋转光环
      if (cfg.halo) {
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.t / 420);
        ctx.strokeStyle = cfg.color;
        ctx.globalAlpha = 0.55 + Math.sin(u.t / 200) * 0.2;
        ctx.lineWidth = 2;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, 27 * pulse, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(u.x, u.y, 26 * pulse, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = cfg.color;
      Draw.powerupShape(ctx, cfg.shape, u.x, u.y, 17 * pulse);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      Draw.powerupShape(ctx, cfg.shape, u.x, u.y, 17 * pulse);
      ctx.stroke();

      ctx.fillStyle = '#08101f';
      ctx.font = '500 21px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.label, u.x, u.y + 1);
    }
  },

  particles(ctx, pool) {
    const arr = pool.items;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!p.active) continue;
      const a = Math.max(0, p.life / p.max);
      ctx.fillStyle = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + a.toFixed(3) + ')';
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
  },

  bombButton(ctx, game) {
    const b = uiLayout(game.view).bomb;
    const n = game.player.bombs;
    const ready = n > 0;
    // 残血且手上还有炸弹：系统不再替玩家按，改为强提醒 —— 选不选择是玩家的事
    const critical = ready && game.player.hp <= 1;

    ctx.fillStyle = critical ? 'rgba(255,90,110,0.24)'
      : ready ? 'rgba(255,177,77,0.18)' : 'rgba(120,130,165,0.12)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 6.2832);
    ctx.fill();

    ctx.strokeStyle = critical ? 'rgba(255,90,110,0.95)'
      : ready ? 'rgba(255,177,77,0.85)' : 'rgba(120,130,165,0.4)';
    ctx.lineWidth = critical ? 4 : 3;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 6.2832);
    ctx.stroke();

    if (critical) {
      const k = (Date.now() % 700) / 700;
      ctx.strokeStyle = 'rgba(255,70,100,' + (0.7 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + k * 26, 0, 6.2832);
      ctx.stroke();
    }

    ctx.fillStyle = critical ? '#ffd0d6' : ready ? CONFIG.colors.accent : 'rgba(160,170,200,0.6)';
    ctx.font = '500 ' + (critical ? 28 : 34) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(critical ? '保命' : '炸', b.x, b.y - 12);

    ctx.fillStyle = critical ? '#ffd0d6' : ready ? '#ffe9c9' : 'rgba(160,170,200,0.6)';
    ctx.font = '400 22px ' + FONT;
    ctx.fillText('x' + n, b.x, b.y + 24);
  },

  hud(ctx, view, g) {
    const L = uiLayout(view);
    const top = L.safeTop;
    const bottom = L.bottom;
    const p = g.player;
    const w = p.weaponCfg();

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.colors.hud;
    ctx.font = '500 34px ' + FONT;
    ctx.fillText(String(g.score), 30, top);
    ctx.fillStyle = CONFIG.colors.dim;
    ctx.font = '400 20px ' + FONT;
    ctx.fillText('最高 ' + g.high, 30, top + 42);

    for (let i = 0; i < p.hp; i++) {
      ctx.save();
      ctx.translate(view.w - 130 - i * 34, top + 12);   // 从右往左排，给最右侧暂停钮留位
      ctx.fillStyle = CONFIG.colors.player;
      poly(ctx, [0, -11, 9, 9, 0, 4, -9, 9]);
      ctx.fill();
      ctx.restore();
    }

    const btn = L.bomb;
    ctx.textAlign = 'right';
    // 残血有弹：红字提醒（系统不会替你按按钮）
    if (p.hp <= 1 && p.bombs > 0) {
      const a = 0.55 + Math.sin(Date.now() / 180) * 0.45;
      ctx.fillStyle = 'rgba(255,90,110,' + a.toFixed(3) + ')';
      ctx.font = '500 22px ' + FONT;
      ctx.fillText('残血 · 点按钮保命', view.w - 30, btn.y - btn.r - 42);
    } else {
      ctx.fillStyle = CONFIG.colors.dim;
      ctx.font = '400 20px ' + FONT;
      ctx.fillText('第 ' + (g.stageIndex + 1) + ' 关 · 威胁 x' + (g.sc ? g.sc.hp : 1).toFixed(2),
        view.w - 30, btn.y - btn.r - 42);
    }

    // 武器名 + 等级 + 僚机
    ctx.textAlign = 'left';
    ctx.fillStyle = w.color;
    ctx.font = '500 26px ' + FONT;
    ctx.fillText(w.name + ' Lv.' + p.powerLevel, 30, bottom - 104);

    // 6 条强化路线：只显示已投入的，避免开局一堆 0
    const routes = [
      { key: 'option', color: CONFIG.powerups.option.color, label: '僚', lv: p.options },
      { key: 'armor', color: CONFIG.powerups.armor.color, label: '甲', lv: p.armorLv },
      { key: 'arsenal', color: CONFIG.powerups.bomb.color, label: '弹', lv: p.arsenalLv },
      { key: 'engine', color: CONFIG.powerups.engine.color, label: '机', lv: p.engineLv }
    ];
    let rx = 208;
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      if (r.lv <= 0) continue;
      ctx.fillStyle = r.color;
      ctx.font = '400 21px ' + FONT;
      ctx.fillText(r.label + ' ' + r.lv, rx, bottom - 100);
      rx += 62;   // 固定步进，不依赖 measureText（不同平台字体宽度不一致）
    }

    // 超频槽：满火力后吃 P 累积，四个格子（擦弹移除后这里是唯一的"溢出"显示）
    const cx = 30, cy = bottom - 62;
    const od = p.isOverdrive();
    const slots = CONFIG.overdrive.max / CONFIG.overdrive.perPower;
    const filled = od ? slots : Math.round(p.overdrive / CONFIG.overdrive.perPower);
    for (let i = 0; i < slots; i++) {
      ctx.fillStyle = i < filled ? (od ? '#ffd166' : CONFIG.colors.charge) : 'rgba(255,255,255,0.15)';
      roundRect(ctx, cx + i * 26, cy, 20, 8, 4);
      ctx.fill();
    }
    ctx.fillStyle = od ? '#ffd166' : CONFIG.colors.dim;
    ctx.font = '400 18px ' + FONT;
    ctx.fillText(od ? '超频中' : '超频 ' + p.overdrive + '%', cx + slots * 26 + 12, cy - 2);

    if (g.boss && g.boss.active) {
      const bw = view.w - 300;
      const bx = 150;
      const by = top + 4;
      const bh = 14;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, bx - 3, by - 3, bw + 6, bh + 6, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, bx, by, bw, bh, 7);
      ctx.fill();
      ctx.fillStyle = CONFIG.colors.bossBar;
      roundRect(ctx, bx, by, bw * Math.max(0, g.boss.hp / g.boss.maxHp), bh, 7);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = CONFIG.colors.hud;
      ctx.font = '400 19px ' + FONT;
      const label = g.boss.cfg.name + '  PHASE ' + g.boss.phase + (g.boss.rage ? '  · 暴走' : '');
      ctx.fillText(label, view.w / 2, by + bh + 8);
    }

    if (g.bannerT > 0) {
      const a = Math.min(1, g.bannerT / 500);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(234,242,255,' + a.toFixed(3) + ')';
      ctx.font = '500 44px ' + FONT;
      ctx.fillText(g.banner, view.w / 2, view.h * 0.34);
      if (g.bannerSub) {
        ctx.fillStyle = 'rgba(255,107,122,' + a.toFixed(3) + ')';
        ctx.font = '400 22px ' + FONT;
        ctx.fillText(g.bannerSub, view.w / 2, view.h * 0.34 + 52);
      }
    }
  },

  bombFlash(ctx, view, t) {
    const a = Math.min(1, t / CONFIG.bomb.flash) * 0.55;
    ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.fillRect(0, 0, view.w, view.h);
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Draw;
