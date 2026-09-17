// 难度基准：用机械走位 + 指定的炸弹策略跑 N 局，统计存活时长与到达关卡。
// 用来回答「这个改动到底让游戏难了多少」，而不是拍脑袋。
// 用法： node tools/survival.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
global.window = global;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
global.addEventListener = () => {};
global.innerWidth = 390;
global.innerHeight = 844;
global.devicePixelRatio = 2;
global.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); }
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
vm.runInThisContext(
  src + '\n;globalThis.__TS = { CONFIG, Platform, GameScene };',
  { filename: 'bundle.js' }
);

const T = globalThis.__TS;
const C = T.CONFIG;
const surface = T.Platform.createSurface(C.design.width, C.design.height);
const view = surface.view;
const input = { active: true, x: view.w / 2, y: view.h - 300, downX: 0, downY: 0, pressed: false, keys: {} };

const DT = 16.6;
const MAX_FRAMES = 60 * 60 * 5;   // 最多 5 分钟游戏时间

// 固定随机种子：否则掉落和波次的随机性会盖过策略差异（实测同参数两次能差一倍）
function seedRandom(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 机械走位：横向正弦 + 纵向小幅摆动。不刻意躲弹，代表"一直在动但水平一般"的玩家。
function drive(g, frame) {
  const t = frame * DT / 1000;
  input.x = view.w / 2 + Math.sin(t * 1.15) * (view.w / 2 - 40);
  input.y = view.h - 260 + Math.sin(t * 0.72) * 130;
}

// policy: 'manual' 残血自己按 · 'auto' 系统代劳 · 'never' 从不按
// autoSave: 系统代劳的次数上限（每局）
function run(policy, rounds, autoSave) {
  C.player.autoBombSave = policy === 'auto' ? (autoSave === undefined ? 999 : autoSave) : 0;
  let totalSec = 0, totalStage = 0, totalScore = 0, deaths = 0;
  const secs = [];

  for (let r = 0; r < rounds; r++) {
    seedRandom(20260915 + r);      // 各档用同一串种子，保证对比公平
    const g = new T.GameScene(view, input);
    g.reset();
    let f = 0;
    for (; f < MAX_FRAMES && !g.dead; f++) {
      drive(g, f);
      // 玩家反应：残血且手上有弹就按（留 250ms 反应延迟，不是帧级完美）
      if (policy === 'manual' && g.player.hp <= 1 && g.player.bombs > 0 && f % 15 === 0) {
        g.useBomb();
      }
      g.update(DT);
    }
    const sec = f * DT / 1000;
    secs.push(sec);
    totalSec += sec;
    totalStage += g.stageIndex + 1;
    totalScore += g.score;
    if (g.dead) deaths++;
  }
  secs.sort(function (a, b) { return a - b; });

  return {
    sec: totalSec / rounds,
    mid: secs[Math.floor(rounds / 2)] || 0,
    stage: totalStage / rounds,
    score: Math.round(totalScore / rounds),
    deathRate: deaths / rounds
  };
}

const ROUNDS = Number(process.argv[2] || 12);
console.log('每档 %d 局，机械正弦走位，不刻意躲弹\n', ROUNDS);

console.log('策略                  平均存活   中位存活   平均到达   平均分   死亡率');
const rows = [
  ['代劳 ∞ 次（改动前）', run('auto', ROUNDS, 999)],
  ['代劳 3 次', run('auto', ROUNDS, 3)],
  ['代劳 1 次', run('auto', ROUNDS, 1)],
  ['代劳 0 次 · 自己按', run('manual', ROUNDS, 0)],
  ['代劳 0 次 · 从不按', run('never', ROUNDS, 0)]
];
for (const [name, r] of rows) {
  console.log(
    name.padEnd(21) +
    (r.sec.toFixed(1) + 's').padStart(9) +
    (r.mid.toFixed(1) + 's').padStart(11) +
    ('  第 ' + r.stage.toFixed(1) + ' 关').padStart(12) +
    String(r.score).padStart(9) +
    (Math.round(r.deathRate * 100) + '%').padStart(8)
  );
}
