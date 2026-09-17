// 难度曲线基准：上帝模式逐关跑，量化"随关卡变化"的三个压力量。
//
// 为什么不测"通关耗时"：波次是固定时长（表1 合计 26.5s），只有 Boss 战长度随关卡变，
// 拿总耗时当难度会被固定项污染。这里只测会变的：
//   1) 同屏敌弹 均值/峰值 —— 弹幕密度（用户要的"后期更密集"）
//   2) 每分钟吃伤         —— 机械走位下被动挨打的频率，最能代表"躲不躲得开"
//   3) Boss 战耗时        —— 唯一随关卡拉长的时长项
// 另外按"玩家成长节奏"解析计算杂兵 TTK，看后期会不会变成打不动的墙。
// 用法： node tools/difficulty-curve.js [最多关卡数]
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
global.localStorage = { getItem: () => null, setItem() {} };

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
  id: 'game', width: 0, height: 0, style: {},
  getContext: () => ctxStub,
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 693 })
};
global.document = {
  getElementById: () => canvasStub,
  createElement: () => canvasStub,
  body: { appendChild: () => {} }
};

const files = ['config.js', 'platform.js', 'core.js', 'audio.js', 'draw.js', 'entities.js', 'game.js', 'ui.js'];
let src = '';
for (const f of files) {
  src += '\n;//==== ' + f + '\n' + fs.readFileSync(path.join(root, 'src', f), 'utf8');
}
vm.runInThisContext(src + '\n;globalThis.__TS = { CONFIG, Platform, GameScene };', { filename: 'bundle.js' });

const T = globalThis.__TS;
const C = T.CONFIG;
const surface = T.Platform.createSurface(C.design.width, C.design.height);
const view = surface.view;
const input = { active: true, x: view.w / 2, y: view.h - 300, downX: 0, downY: 0, pressed: false, keys: {} };

const DT = 16.6;
const MAX_STAGES = Number(process.argv[2] || 22);
const WAVE_BUDGET = 90;    // 波次阶段最多模拟 90 秒
const BOSS_BUDGET = 200;   // Boss 阶段最多模拟 200 秒

function seedRandom(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 会主动对位的玩家：横向咬住最靠下的敌人，叠一层正弦抖动代表走位不完美
function makeDrive(g) {
  let px = view.w / 2;
  return function (t) {
    let tx = view.w / 2, lowest = -Infinity;
    const es = g.enemies.items;
    for (let k = 0; k < es.length; k++) {
      const e = es[k];
      if (e.active && e.y < view.h - 180 && e.y > lowest) { lowest = e.y; tx = e.x; }
    }
    if (g.boss.active) tx = g.boss.x;
    px += Math.max(-9, Math.min(9, tx - px));
    input.x = Math.max(30, Math.min(view.w - 30, px + Math.sin(t * 2.3) * 34));
    input.y = view.h - 250 + Math.sin(t * 0.8) * 60;
  };
}

function countEnemyBullets(g) {
  let n = 0;
  const bl = g.bullets.items;
  for (let k = 0; k < bl.length; k++) if (bl[k].active && bl[k].owner === 1) n++;
  return n;
}

// 只跑波次阶段（不含 Boss）：测弹幕密度与被动吃伤
// 注意：传的是"真实关卡号"，startStage 内部自己按 stages.length 取模循环关卡表
function runWaves(stageNo, seed) {
  seedRandom(seed);
  const g = new T.GameScene(view, input);
  g.reset();
  g.startStage(stageNo);
  const drive = makeDrive(g);
  let frames = 0, sum = 0, peak = 0, hits = 0;
  const max = WAVE_BUDGET * 1000 / DT;
  while (frames < max && g.phase === 'wave') {
    drive(frames * DT / 1000);
    g.update(DT);
    const n = countEnemyBullets(g);
    sum += n; if (n > peak) peak = n;
    if (g.player.hp < C.player.maxHp) { hits += C.player.maxHp - g.player.hp; }
    g.player.hp = C.player.maxHp; g.dead = false;
    frames++;
  }
  const sec = frames * DT / 1000;
  return { sec: sec, avg: sum / Math.max(1, frames), peak: peak, hitsPerMin: sec > 0 ? hits / (sec / 60) : 0 };
}

// 只跑 Boss 战：测 Boss 耗时与该阶段弹幕峰值
function runBoss(stageNo, seed) {
  seedRandom(seed);
  const g = new T.GameScene(view, input);
  g.reset();
  g.startStage(stageNo);
  const drive = makeDrive(g);
  // 快进到 Boss 出场
  let f = 0;
  while (f < 200 * 60 && g.phase !== 'boss') { drive(f * DT / 1000); g.update(DT); g.player.hp = C.player.maxHp; g.dead = false; f++; }
  let bf = 0, peak = 0, sum = 0;
  const max = BOSS_BUDGET * 1000 / DT;
  while (bf < max && g.boss.active) {
    drive((f + bf) * DT / 1000);
    g.update(DT);
    const n = countEnemyBullets(g);
    sum += n; if (n > peak) peak = n;
    g.player.hp = C.player.maxHp; g.dead = false;
    bf++;
  }
  return { sec: bf * DT / 1000, killed: !g.boss.active, peak: peak, avg: sum / Math.max(1, bf) };
}

// 玩家成长节奏：按关卡估算玩家此时的武器等级（保守估计，真人通常更快）
function playerDps(stage) {
  // Lv1 vulcan 12 / Lv2 27 / Lv3 43 / Lv4 72，M3 专精 ×2.22
  if (stage <= 1) return 12;
  if (stage <= 3) return 27;
  if (stage <= 5) return 43;
  if (stage <= 8) return 72;
  if (stage <= 11) return 100;
  return 160;   // Lv4 + 专精 M3
}

console.log('上帝模式 · 会主动对位的机械玩家 · 单关波次上限 %ds / Boss 上限 %ds\n', WAVE_BUDGET, BOSS_BUDGET);
console.log('关卡   波次敌弹 均值/峰值  每分钟吃伤   Boss耗时   中坚兵TTK   血x   密x  量x');

const rows = [];
for (let s = 0; s < MAX_STAGES; s++) {
  const g0 = new T.GameScene(view, input);
  g0.reset(); g0.stageIndex = s;
  const sc = g0.scales();

  const w = runWaves(s, 20260914 + s * 7);
  // Boss 耗时改成解析值：实测被机械 AI 的命中率主导（同一关能差 10 倍），没有参考价值
  const bossKey = C.stages[s % C.stages.length].boss;
  const bossHp = C.bosses[bossKey].hp * sc.boss;
  const bossT = bossHp / playerDps(s + 1);
  const ttk = C.enemies.bulwark.hp * sc.hp / playerDps(s + 1);

  rows.push({ s: s, w: w, bossT: bossT, ttk: ttk, sc: sc, boss: C.bosses[bossKey].name });
  console.log(
    ('第' + (s + 1) + '关').padEnd(7) +
    (w.avg.toFixed(0) + ' / ' + w.peak).padStart(14) +
    w.hitsPerMin.toFixed(1).padStart(13) +
    (bossT.toFixed(0) + 's').padStart(11) +
    (ttk.toFixed(1) + 's').padStart(12) +
    sc.hp.toFixed(2).padStart(7) +
    sc.vol.toFixed(2).padStart(6) +
    sc.count.toFixed(2).padStart(6) +
    '   ' + C.stages[s % C.stages.length].name
  );
}

// ---------- 结论 ----------
console.log('\n== 结论 ==');
const avgs = rows.map((r) => r.w.avg);
const hpm = rows.map((r) => r.w.hitsPerMin);
console.log('弹幕密度：第1关 %s → 第%d关 %s（×%s）',
  avgs[0].toFixed(0), rows.length, avgs[avgs.length - 1].toFixed(0),
  (avgs[avgs.length - 1] / Math.max(1, avgs[0])).toFixed(2));
console.log('被动吃伤：第1关 %s/min → 第%d关 %s/min（×%s）',
  hpm[0].toFixed(1), rows.length, hpm[hpm.length - 1].toFixed(1),
  (hpm[hpm.length - 1] / Math.max(0.1, hpm[0])).toFixed(2));

// 跨表起伏是刻意的手感节奏（三张表各有性格），真正要查的是"同一张表内是否单调爬升"
const tables = C.stages.length;
const perTable = {};
rows.forEach((r) => {
  const t = r.s % tables;
  (perTable[t] = perTable[t] || []).push(r.w.avg);
});
let up = 0, tot = 0;
for (const t of Object.keys(perTable)) {
  const a = perTable[t];
  for (let i = 1; i < a.length; i++) { tot++; if (a[i] >= a[i - 1] * 0.97) up++; }
  console.log('  表%d %s：%s', Number(t) + 1, C.stages[t].name,
    a.map((x) => x.toFixed(0)).join(' → '));
}
console.log('同表内"密度不回落"：%d/%d %s', up, tot,
  up === tot ? '（每张表都单调爬升，无台阶回落）' : '（存在回落，需检查是否踩到封顶）');

const peak = Math.max(...rows.map((r) => r.w.peak));
console.log('同屏敌弹峰值 %d / 池上限 %d %s', peak, C.bullet.pool,
  peak >= C.bullet.pool ? '← 顶到池子了，会静默丢弹！' : '（未顶到池子）');

const ttks = rows.map((r) => r.ttk);
let wallAt = -1;
for (let i = 0; i < ttks.length; i++) if (ttks[i] > 6) { wallAt = i + 1; break; }
console.log('中坚兵（壁垒 144HP）TTK：%s', ttks.map((t) => t.toFixed(1) + 's').join(' → '));
console.log('Boss 理论耗时：%s', rows.map((r) => r.bossT.toFixed(0) + 's').join(' → '));
console.log(wallAt > 0
  ? '第 ' + wallAt + ' 关起中坚兵 TTK > 6s —— 这里开始"打不动"，血量墙生效'
  : '前 ' + rows.length + ' 关内 TTK 仍 ≤6s —— 血量墙还没到，玩家还能继续刷');
