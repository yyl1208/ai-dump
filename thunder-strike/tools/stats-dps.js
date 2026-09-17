// 数值面板：玩家 DPS 成长曲线 vs 敌人血量，用来判断"后期小怪是不是太脆"。
// 用法： node tools/stats-dps.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
global.window = global;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
global.addEventListener = () => {};
global.innerWidth = 390;
global.innerHeight = 844;
global.devicePixelRatio = 2;
global.localStorage = {
  _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 12 });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; }
});
const canvasStub = {
  id: 'game', width: 0, height: 0, style: {}, getContext: () => ctxStub,
  addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 693 })
};
global.document = { getElementById: () => canvasStub, createElement: () => canvasStub, body: { appendChild: () => {} } };

const files = ['config.js', 'platform.js', 'core.js', 'audio.js', 'draw.js', 'entities.js', 'game.js', 'ui.js'];
let src = '';
for (const f of files) src += '\n;' + fs.readFileSync(path.join(root, 'src', f), 'utf8');
vm.runInThisContext(src + '\n;globalThis.__TS = { CONFIG, Platform, GameScene };', { filename: 'b.js' });

const T = globalThis.__TS;
const C = T.CONFIG;
const surface = T.Platform.createSurface(C.design.width, C.design.height);
const view = surface.view;
const input = { active: false, x: 0, y: 0, downX: 0, downY: 0, pressed: false, keys: {} };

function fresh() {
  const g = new T.GameScene(view, input);
  g.reset();
  g.player.inv = 0; g.player.shieldT = 0; g.player.bombs = 0;
  return g;
}

// 单目标理论 DPS：一发齐射的总伤害 / 射击间隔
function dps(weapon, lv, mastery) {
  const g = fresh();
  const p = g.player;
  p.weapon = weapon;
  p.powerLevel = lv;
  p.mastery = { vulcan: 0, laser: 0, wave: 0, spread: 0 };
  p.mastery[weapon] = mastery || 0;
  let dmg = 0;
  p.emitShots(function (x, y, vx, vy, owner, opt) { dmg += ((opt && opt.dmg) || 1); });
  return dmg / p.fireInterval() * 1000;
}

const order = C.weaponOrder;
console.log('== 玩家主武器 DPS（单目标，不含僚机/超频）==\n');
console.log('武器      Lv1     Lv2     Lv3     Lv4    Lv4/Lv1');
for (const w of order) {
  const row = [1, 2, 3, 4].map((lv) => dps(w, lv, 0));
  console.log(
    C.weapons[w].name.padEnd(6) +
    row.map((d) => d.toFixed(0).padStart(8)).join('') +
    (row[3] / row[0]).toFixed(1).padStart(9) + 'x'
  );
}
const v1 = dps('vulcan', 1, 0), v4 = dps('vulcan', 4, 0);
console.log('\n机炮 Lv1→Lv4 成长 %sx（含中间大弹 dmg2/3 与侧向弹）', (v4 / v1).toFixed(1));

// 专精 M3 加成
console.log('\n== 专精 M3 后的 DPS（火力 Lv4）==');
for (const w of order) {
  const a = dps(w, 4, 0), b = dps(w, 4, 3);
  console.log('  ' + C.weapons[w].name.padEnd(6) + a.toFixed(0).padStart(6) + ' → ' + b.toFixed(0).padStart(6) + '  (+' + ((b / a - 1) * 100).toFixed(0) + '%)');
}

// 敌人血量
console.log('\n== 敌人血量 / Lv4 机炮秒杀耗时 ==');
const names = Object.keys(C.enemies);
const lines = [];
for (const k of names) {
  const e = C.enemies[k];
  lines.push([k, e.name || k, e.hp, e.hp / v4]);
}
lines.sort((a, b) => a[2] - b[2]);
for (const [k, name, hp, t] of lines) {
  console.log('  ' + k.padEnd(12) + String(name).padEnd(8) + ('HP ' + hp).padStart(8) + ('  ' + t.toFixed(2) + 's').padStart(9));
}
const ttk = lines.map((l) => l[3]);
console.log('\n  最快 %ss / 最慢 %ss / 中位 %ss（Lv4 机炮单挑）',
  ttk[0].toFixed(2), ttk[ttk.length - 1].toFixed(2), ttk[Math.floor(ttk.length / 2)].toFixed(2));
console.log('  低于 0.15s 的（= 出场即蒸发，没手感）共 %d 种',
  ttk.filter((t) => t < 0.15).length);

// 难度曲线：四条独立曲线（hp 指数不封顶，speed/fire/count 各自封顶）
console.log('\n== 难度曲线（每关独立系数，第 1 关为基准 1.00）==');
const D = C.difficulty;
function scales(s) {
  return {
    hp: D.hpBase * Math.pow(D.hpGrow, s),
    speed: Math.min(D.speedMax, 1 + D.speedGrow * s),
    fire: Math.max(D.fireMin, 1 - D.fireGrow * s),
    count: Math.min(D.countMax, 1 + D.countGrow * s),
    boss: 1 + D.bossGrow * s
  };
}
console.log('  关卡   血量x   移速x   火间隔  数量x   Boss x   侦察机实际HP  TTK(Lv4机炮)');
for (let s = 0; s < 14; s++) {
  const k = scales(s);
  const hp = Math.round(C.enemies.scout.hp * k.hp);
  console.log('   %s  %s  %s  %ss  %s  %s  %s  %ss%s',
    String(s + 1).padStart(4), k.hp.toFixed(2).padStart(6), k.speed.toFixed(2).padStart(6),
    k.fire.toFixed(2), k.count.toFixed(2).padStart(6), k.boss.toFixed(2).padStart(6),
    String(hp).padStart(12), (hp / v4).toFixed(2).padStart(5),
    k.speed >= D.speedMax ? '  ← 移速封顶' : '');
}
console.log('\n  注：血量是指数且刻意不封顶 = 后期那堵"打不动"的墙；移速/数量封顶是为了不让难度变成"看不懂"。');
