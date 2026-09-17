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
    // 真实 canvas 有 measureText，测试桩按字符数粗略估算
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
  src + '\n;globalThis.__TS = { CONFIG, Platform, Pool, SpatialGrid, GameLoop, aabb, Draw, Player, Enemy, Boss, PowerUp, GameScene, UI, makeBullet, makeParticle, hexToRgb, uiLayout };',
  { filename: 'bundle.js' }
);

const T = globalThis.__TS;
const C = T.CONFIG;
const surface = T.Platform.createSurface(C.design.width, C.design.height);
console.log('surface env=%s view=%dx%d', surface.env, surface.view.w, Math.round(surface.view.h));

const view = surface.view;
const input = { active: true, x: view.w / 2, y: view.h - 400, downX: 0, downY: 0, pressed: false, keys: {} };
const game = new T.GameScene(view, input);
const DT = 16.6;

function countActive(pool) {
  let n = 0;
  pool.forEach(() => n++);
  return n;
}

function freshGame() {
  const g = new T.GameScene(view, input);
  g.reset();
  g.player.inv = 0;
  g.player.shieldT = 0;
  g.player.bombs = 0;
  return g;
}

// ==========================================================
// 1. 常规推进 → Boss 出场 → 阶段切换 → 关卡循环（锁血压测）
// ==========================================================
let sawBoss = false;
const bossPhases = new Set();
let maxStage = 0, drops = 0, maxLoot = 0, maxBullets = 0, dmgTaken = 0;
const enemyTypesSeen = new Set();
const origDrop = game.dropLoot.bind(game);
game.dropLoot = function (x, y, f) { drops++; return origDrop(x, y, f); };

for (let i = 0; i < 8000; i++) {
  input.x = view.w / 2 + Math.sin(i / 45) * 170;
  input.y = view.h - 420;
  game.tickBg(DT);
  game.update(DT);
  game.render(ctxStub, true);
  game.enemies.forEach((e) => enemyTypesSeen.add(e.type));
  if (game.boss.active) { sawBoss = true; bossPhases.add(game.boss.phase); }
  if (game.stageIndex > maxStage) maxStage = game.stageIndex;
  maxLoot = Math.max(maxLoot, countActive(game.loot));
  maxBullets = Math.max(maxBullets, countActive(game.bullets));
  if (i % 60 === 0) {
    dmgTaken += C.player.maxHp - game.player.hp;   // 锁血压测：统计每秒吃了多少伤害
    game.player.hp = C.player.maxHp;
    game.dead = false;
  }
  if (game.dead) break;
}
assert(sawBoss, '未能进入 Boss 战');
assert(bossPhases.size >= 2, 'Boss 阶段未切换，实际 ' + [...bossPhases]);
assert(maxStage >= 1, '关卡未推进，停在 ' + maxStage);
assert(maxBullets < C.bullet.pool, '子弹池被打满，实际峰值 ' + maxBullets);
assert(dmgTaken > 0, '压测期间一次伤害都没吃到，难度可能过低');
console.log('1) 流程压测 OK — Boss 阶段 %s / 到第 %d 关 / 敌机种类 %d / 掉落 %d 次 / 同屏子弹峰值 %d / 每分钟吃伤 %s',
  [...bossPhases].join('+'), maxStage + 1, enemyTypesSeen.size, drops, maxBullets,
  (dmgTaken / (8000 * DT / 60000)).toFixed(1));

// ==========================================================
// 2. 四种武器 × 四层火力：弹道数量、冷却、切枪
// ==========================================================
// 用干净的实例：压测里玩家已经吃过道具，带着专精和超频会污染弹数统计
const wp = freshGame().player;
const shotCount = {};
for (const key of C.weaponOrder) {
  const w = C.weapons[key];
  assert(w.tiers.length === 4 && w.cd.length === 4, key + ' 的火力层级不是 4 级');
  shotCount[key] = [];
  for (let lv = 1; lv <= 4; lv++) {
    wp.weapon = key;
    wp.powerLevel = lv;
    let n = 0;
    wp.emitShots(function () { n++; });
    shotCount[key].push(n);
    assert(n === w.tiers[lv - 1].length, key + ' Lv' + lv + ' 弹数不符');
    if (lv > 1) assert(n >= shotCount[key][lv - 2], key + ' Lv' + lv + ' 弹数反而变少');
    if (lv > 1) assert(w.cd[lv - 1] <= w.cd[lv - 2], key + ' Lv' + lv + ' 冷却反而变长');
  }
}
for (const key of C.weaponOrder) {
  console.log('   %s(%s) 弹数 %s  冷却 %s', C.weapons[key].name, key,
    shotCount[key].join('/'), C.weapons[key].cd.join('/'));
}

// 节奏体检：Lv4 武器打满各 Boss 的理论 TTK（不含命中率，实际约 1.5~2 倍）
let worstTtk = 0;
for (const bk of Object.keys(C.bosses)) {
  const b = C.bosses[bk];
  const parts = [];
  for (const wk of C.weaponOrder) {
    const w = C.weapons[wk];
    let dmg = 0;
    for (const s of w.tiers[3]) dmg += s.dmg || 1;
    const ttk = b.hp / (dmg / (w.cd[3] / 1000));
    worstTtk = Math.max(worstTtk, ttk);
    parts.push(w.short + ' ' + ttk.toFixed(0) + 's');
  }
  console.log('   %s %dHP 理论 TTK → %s', b.name, b.hp, parts.join(' / '));
}
assert(worstTtk < 45, 'Boss 血条过厚，最慢理论 TTK ' + worstTtk.toFixed(0) + 's，实际会拖沓');

wp.weapon = 'vulcan';
const seq = [];
for (let i = 0; i < 5; i++) seq.push(wp.nextWeapon());
assert(seq[0] === 'laser' && seq[3] === 'vulcan' && seq[4] === 'laser', '换枪循环异常 ' + seq.join('>'));
console.log('2) 武器系统 OK — 4 武器 × 4 级弹道，换枪循环 %s', seq.join('>'));

// ==========================================================
// 3. 僚机（option）：拾取 + 发射追踪弹
// ==========================================================
const g3 = freshGame();
g3.player.options = 0;
assert(g3.applyLoot('option') === true && g3.player.options === 1, '僚机道具失效');
let optN = 0, optKind = null;
g3.player.optCd = 0;
g3.player.emitOptions(function (x, y, vx, vy, owner, opt) { optN++; optKind = opt.kind; });
assert(optN === 1 && optKind === 'homing', '单僚机未发射追踪弹');
g3.player.emitOptions(function () { optN++; });
assert(optN === 1, '僚机冷却未生效');
g3.player.optCd = 0;
g3.player.options = 2;
optN = 0;
g3.player.emitOptions(function () { optN++; });
assert(optN === 2, '双僚机应发射 2 发，实际 ' + optN);
g3.player.optCd = 0;
g3.player.options = 3;
optN = 0;
g3.player.emitOptions(function () { optN++; });
assert(optN === 3, '三僚机应发射 3 发，实际 ' + optN);
g3.player.options = C.progression.option.max;
const scoreBefore = g3.score;
assert(g3.applyLoot('option') === false && g3.score > scoreBefore, '僚机满时未转化为分数');
console.log('3) 僚机 OK — 1/2/3 架各发 1/2/3 发追踪弹，冷却与满级转化正常');

// ==========================================================
// 4. 换弹道具 + 手动换弹
// ==========================================================
const g4 = freshGame();
g4.player.weapon = 'vulcan';
assert(g4.applyLoot('weapon') === true && g4.player.weapon === 'laser', '换弹道具失效');
assert(g4.banner.indexOf(C.weapons.laser.name) === 0, '换弹未提示武器名，实际 ' + g4.banner);
// W 的核心语义：切枪的同时给新枪加专精（换枪是投资不是惩罚）
assert(g4.player.mastery.laser === 1, '切枪后未给新武器加专精');
assert(g4.player.mastery.vulcan === 0, '不该给旧武器加专精');
// 吃满一圈（4 把 × 3 档）后，所有武器都该满专精
for (let i = 0; i < C.weaponOrder.length * C.progression.mastery.max; i++) g4.applyLoot('weapon');
for (const k of C.weaponOrder) {
  assert(g4.player.mastery[k] === C.progression.mastery.max, k + ' 专精未吃满，实际 ' + g4.player.mastery[k]);
}
const s4 = g4.score;
g4.applyLoot('weapon');
assert(g4.score > s4, '全专精满时未转化为分数');
console.log('4) 换弹 OK — 吃 W 切到 %s 并给该枪 +1 专精，满专精转分数', C.weapons.laser.name);

// ==========================================================
// 5. 六种弹型行为
// ==========================================================
// 5a 穿透激光：命中不消失、扣穿透、同帧不重复计伤
const gl = freshGame();
const le = gl.enemies.acquire();
le.spawn('bomber', 300, 300, 1);
le.hp = 100; le.maxHp = 100;
const lb = gl.spawnBullet(300, 300, 0, -1500, 0, { kind: 'laser', pierce: 3, w: 12, h: 74, dmg: 2 });
gl.frame = 1;
gl.collide();
assert(le.hp === 98, '激光未造成伤害，hp=' + le.hp);
assert(lb.active === true && lb.pierce === 2, '激光命中后应保留穿透次数，实际 ' + lb.pierce);
gl.collide();
assert(le.hp === 98, '同一帧被激光重复计伤');
gl.frame = 2;
gl.collide();
assert(le.hp === 96 && lb.pierce === 1, '跨帧未继续穿透');
console.log('5a) 穿透激光 OK — 命中留存 / 同帧去重 / 逐帧扣穿透');

// 5b 追踪弹：朝目标转向
const gh = freshGame();
const ht = gh.enemies.acquire();
ht.spawn('fighter', 650, 400, 1);
const hb = gh.spawnBullet(100, 900, 0, -600, 0, { kind: 'homing', turn: 3.4, w: 13, h: 13 });
const vx0 = hb.vx;
for (let i = 0; i < 30; i++) gh.updateBullets(DT);
assert(hb.vx > vx0 + 50, '追踪弹未朝目标转向，vx ' + vx0 + ' → ' + hb.vx.toFixed(1));
console.log('5b) 追踪弹 OK — vx %s → %s（朝右前方目标偏转）', vx0, hb.vx.toFixed(1));

// 5c 摆动弹：绕出生 x 正弦横摆
const gw = freshGame();
const wb = gw.spawnBullet(300, 900, 0, -600, 0, { kind: 'wave', amp: 120, phase: 0, w: 12, h: 12 });
let maxL = 0, maxR = 0;
for (let i = 0; i < 40; i++) {
  gw.updateBullets(DT);
  const off = wb.x - 300;
  if (off < 0) maxL = Math.max(maxL, -off); else maxR = Math.max(maxR, off);
}
assert(maxL > 40 && maxR > 40, '摆动弹未左右摆动 L=' + maxL.toFixed(0) + ' R=' + maxR.toFixed(0));
console.log('5c) 摆动弹 OK — 左右摆幅 %s / %s（amp 120）', maxL.toFixed(0), maxR.toFixed(0));

// 5d 爆裂弹：到期炸成碎片
const gbm = freshGame();
const bb = gbm.spawnBullet(300, 600, 0, -500, 0, { kind: 'boom', maxT: 200, w: 14, h: 14, dmg: 2 });
for (let i = 0; i < 20; i++) gbm.updateBullets(DT);
assert(bb.active === false, '爆裂弹到期未引爆');
let shards = 0;
gbm.bullets.forEach((b) => { if (b.owner === 0) shards++; });
assert(shards === C.bulletKinds.boom.shards, '碎片数不符，实际 ' + shards);
console.log('5d) 爆裂弹 OK — 到期炸出 %d 枚碎片', shards);

// 5e 加速弹：初速慢，之后越来越快
const ga = freshGame();
const ab = ga.spawnBullet(300, 900, 0, -400, 1, { kind: 'accel', w: 14, h: 14 });
const v0 = Math.abs(ab.vy);
assert(v0 < 400, '加速弹初速未按比例打折，实际 ' + v0.toFixed(0));
for (let i = 0; i < 30; i++) ga.updateBullets(DT);
assert(Math.abs(ab.vy) > v0 * 1.5, '加速弹未明显加速，' + v0.toFixed(0) + ' → ' + Math.abs(ab.vy).toFixed(0));
console.log('5e) 加速弹 OK — %s → %s px/s', v0.toFixed(0), Math.abs(ab.vy).toFixed(0));

// 5f 弹体半径必须进受击判定（同一距离，小玉安全、大玉必中）
const gr1 = freshGame();
const b1 = gr1.spawnBullet(gr1.player.x + 18, gr1.player.y, 0, 0, 1, { r: 5 });
gr1.collide();
assert(gr1.player.hp === C.player.maxHp, 'r=5 小玉在 18px 处不该命中');
assert(b1.active === true, '没命中就不该销毁子弹');

const gr2 = freshGame();
gr2.spawnBullet(gr2.player.x + 18, gr2.player.y, 0, 0, 1, { r: C.bulletSize.big });
gr2.collide();
assert(gr2.player.hp < C.player.maxHp, '大玉在 18px 处未命中，判定没算上弹体半径');
console.log('5f) 半径判定 OK — 同为 18px：小玉 r5 安全，大玉 r%d 直接命中', C.bulletSize.big);

// ==========================================================
// 6. 新增敌机行为
// ==========================================================
const ge = freshGame();
ge.player.x = 375; ge.player.y = 1100;

// weaver 蛇形
const wv = ge.enemies.acquire();
wv.spawn('weaver', 375, -50, 1);
const wx0 = wv.x, wy0 = wv.y;
let wMin = wx0, wMax = wx0;
for (let i = 0; i < 120; i++) {
  ge.enemies.forEach((e) => e.update(DT, ge.player, view, function () {}));
  wMin = Math.min(wMin, wv.x); wMax = Math.max(wMax, wv.x);
}
assert(wv.y > wy0 + 100, 'weaver 未向下推进');
assert(wMax - wMin > 100, 'weaver 未蛇形横摆，跨度 ' + (wMax - wMin).toFixed(0));

// diver 俯冲
ge.enemies.clear();
const dv = ge.enemies.acquire();
dv.spawn('diver', 60, 60, 1, ge.player);
const d0 = Math.hypot(dv.x - ge.player.x, dv.y - ge.player.y);
for (let i = 0; i < 10; i++) ge.enemies.forEach((e) => e.update(DT, ge.player, view, function () {}));
const d1 = Math.hypot(dv.x - ge.player.x, dv.y - ge.player.y);
assert(d1 < d0 - 60, 'diver 未朝玩家俯冲，距离 ' + d0.toFixed(0) + ' → ' + d1.toFixed(0));

// turret 停驻
ge.enemies.clear();
const tu = ge.enemies.acquire();
tu.spawn('turret', 120, -50, 1);
let stopped = false;
for (let i = 0; i < 200; i++) {
  ge.enemies.forEach((e) => e.update(DT, ge.player, view, function () {}));
  if (tu.state === 1 && Math.abs(tu.y - C.enemies.turret.stopY) < 1) stopped = true;
}
assert(stopped, 'turret 未在 stopY 停驻，y=' + tu.y.toFixed(0));
let leftTurret = false;
for (let i = 0; i < 600; i++) {
  ge.enemies.forEach((e) => e.update(DT, ge.player, view, function () {}));
  if (tu.state === 2 && tu.y > C.enemies.turret.stopY + 20) leftTurret = true;
}
assert(leftTurret, 'turret 停驻超时后未离场');

// sniper 蓄力狙击
ge.enemies.clear();
const sn = ge.enemies.acquire();
sn.spawn('sniper', 300, C.enemies.sniper.stopY, 1, ge.player);
sn.fireCd = 1300;
let charged = false, accelShots = 0, aimedX = null;
for (let i = 0; i < 120; i++) {
  ge.enemies.forEach((e) => e.update(DT, ge.player, view, function (x, y, vx, vy, owner, opt) {
    if (opt && opt.kind === 'accel') accelShots++;
  }));
  if (sn.charge === 1) { charged = true; aimedX = sn.aimX; }
}
assert(charged && aimedX !== null, 'sniper 未进入蓄力瞄准');
assert(accelShots >= 1, 'sniper 未射出加速弹');

// carrier 死亡分裂
ge.enemies.clear();
const cr = ge.enemies.acquire();
cr.spawn('carrier', 375, 300, 1);
const before = countActive(ge.enemies);
assert(cr.damage(9999) === true, 'carrier 未被击杀');
ge.onKill(cr);
const after = countActive(ge.enemies);
assert(after === before - 1 + C.enemies.carrier.split,
  'carrier 分裂数不符 ' + before + ' → ' + after);
let kids = 0, protectedKids = 0;
ge.enemies.forEach((e) => {
  if (e.type === C.enemies.carrier.splitType) { kids++; if (e.fresh > 0) protectedKids++; }
});
assert(kids === C.enemies.carrier.split, '分裂产物数量不符，实际 ' + kids);
assert(protectedKids === kids, '分裂产物缺少出生保护 ' + protectedKids + '/' + kids);
console.log('6) 新敌机 OK — weaver 跨度 %s / diver 俯冲 %s→%s / turret 停驻+离场 / sniper 蓄力射出 %d 发 / carrier 分裂 %d',
  (wMax - wMin).toFixed(0), d0.toFixed(0), d1.toFixed(0), accelShots, kids);

// ---- 6b 每种小怪的单波弹幕形状必须各不相同 ----
const gs = freshGame();
gs.player.x = 375; gs.player.y = 1000;
const sig = {};
for (const type of Object.keys(C.enemies)) {
  gs.enemies.clear();
  const e = gs.enemies.acquire();
  e.spawn(type, 375, 300, 1, gs.player);
  const shots = [];
  e.shoot(gs.player, function (x, y, vx, vy, owner, opt) {
    shots.push({ r: (opt && opt.r) || 0, kind: (opt && opt.kind) || 'normal' });
  });
  sig[type] = shots;
}
const shape = (t, a) => (C.enemies[t].attack || '-') + '|' + a.length + ':' + (a[0] ? a[0].r : 0) + ':' + (a[0] ? a[0].kind : '-');
assert(C.enemies.scout.fire === 0, 'scout 应是不开火的纯杂兵');
assert(shape('fighter', sig.fighter) === 'burst|1:' + C.bulletSize.small + ':normal', 'fighter 单发应为小弹，实际 ' + shape('fighter', sig.fighter));
assert(shape('bomber', sig.bomber) === 'lob|1:' + C.bulletSize.big + ':boom', 'bomber 应抛大颗爆裂弹，实际 ' + shape('bomber', sig.bomber));
assert(shape('weaver', sig.weaver) === 'ring|' + C.enemies.weaver.ring + ':' + C.bulletSize.normal + ':normal', 'weaver 应为环形弹，实际 ' + shape('weaver', sig.weaver));
assert(shape('turret', sig.turret) === 'chain|1:' + C.bulletSize.small + ':normal', 'turret 应为逐发偏转的弹链，实际 ' + shape('turret', sig.turret));
assert(shape('carrier', sig.carrier) === 'spread|4:' + C.bulletSize.normal + ':normal', 'carrier 应为 4 向散射，实际 ' + shape('carrier', sig.carrier));
const shapes = new Set(Object.keys(sig).map((k) => shape(k, sig[k])));
assert(shapes.size >= 7, '小怪弹幕签名不够差异化，仅 ' + shapes.size + ' 种');
console.log('6b) 弹幕形状 OK — %d 种：%s', shapes.size,
  Object.keys(sig).map((k) => k + '=' + shape(k, sig[k])).join('  '));

// ---- 6c 连发 / 弹链 / 尾迹 的实际节奏 ----
function runFor(type, frames) {
  gc.enemies.clear();
  const e = gc.enemies.acquire();
  e.spawn(type, 375, 300, 1, gc.player);
  e.fireCd = 0;
  let n = 0;
  for (let i = 0; i < frames; i++) e.update(DT, gc.player, view, function () { n++; });
  return n;
}
const gc = freshGame();
gc.player.x = 375; gc.player.y = 1000;
assert(runFor('scout', 60) === 0, 'scout 不该开火');
assert(runFor('fighter', 30) === C.enemies.fighter.burst, 'fighter 连发数不符');
assert(runFor('turret', 40) === C.enemies.turret.burst, 'turret 弹链数不符');
assert(runFor('diver', 90) === (C.enemies.diver.trail || 3), 'diver 尾迹弹数不符');

// 弹链必须是"逐发偏转"的扫射，而不是原地重复打同一个角度
const gt = freshGame();
gt.player.x = 375; gt.player.y = 1000;
gt.enemies.clear();
const te = gt.enemies.acquire();
te.spawn('turret', 375, 380, 1, gt.player);
te.fireCd = 0;
const angles = [];
for (let i = 0; i < 40; i++) {
  te.update(DT, gt.player, view, function (x, y, vx, vy) { angles.push(Math.atan2(vy, vx)); });
}
assert(angles.length === C.enemies.turret.burst, '弹链弹数不符，实际 ' + angles.length);
for (let i = 1; i < angles.length; i++) {
  assert(Math.abs(angles[i] - angles[i - 1]) > 0.05, '弹链第 ' + i + ' 发未偏转，成了原地重复');
}
// 弹链要真的够得着玩家：至少有一发朝下飞
assert(angles.some((a) => Math.sin(a) > 0.3), '弹链全部朝上/水平，够不到下方的玩家');
console.log('6c) 开火节奏 OK — scout 0 / fighter %d 连发 / turret %d 发扫射弹链 / diver %d 发尾迹',
  C.enemies.fighter.burst, C.enemies.turret.burst, C.enemies.diver.trail || 3);

// ==========================================================
// 7. Boss 十三种弹幕（原 8 种 + 侧翼压制 5 种）
// ==========================================================
const gb = freshGame();
const allPatterns = ['spiral', 'fan', 'tracking', 'burst', 'wall', 'rain', 'homing', 'petal',
  'flank', 'pincer', 'cross', 'lane', 'mine'];
const patCount = {};
for (const key of Object.keys(C.bosses)) {
  gb.boss.spawnBoss(key, view, 1);
  gb.boss.entered = true;
  gb.boss.y = C.bosses[key].targetY;
  for (const pat of allPatterns) {
    gb.boss.pattern = pat;
    const shots = [];
    gb.boss.openFireBoss(gb.player, view, function (x, y, vx, vy, owner, opt) {
      shots.push({ x: x, y: y, vx: vx, vy: vy, opt: opt });
    });
    assert(shots.length > 0, key + ' 的 ' + pat + ' 未产生子弹');
    patCount[pat] = shots.length;
  }
  // 每个 Boss 配置里声明的弹幕必须都能打出来
  for (const ph of [1, 2, 3]) {
    for (const pat of C.bosses[key].patterns[ph]) {
      assert(allPatterns.indexOf(pat) >= 0, key + ' P' + ph + ' 引用了未实现的弹幕 ' + pat);
      assert(C.bossFireCd[pat] > 0, pat + ' 缺少冷却配置');
    }
  }
}
// wall：横向一排且留缺口
gb.boss.pattern = 'wall';
const wallShots = [];
gb.boss.openFireBoss(gb.player, view, function (x, y, vx, vy) { wallShots.push({ x: x, vx: vx, vy: vy }); });
assert(wallShots.length === C.bossWall.count - C.bossWall.gap,
  '弹幕墙数量不符，实际 ' + wallShots.length);
assert(wallShots.every((s) => s.vx === 0 && s.vy > 0), '弹幕墙应垂直下落');
const xs = wallShots.map((s) => s.x).sort((a, b) => a - b);
const step = view.w / C.bossWall.count;
// 缺口可能开在贴边处（gapStart 可以是 0 或 count-gap-1）：那种情况下通道在
// "屏幕边界 ↔ 第一颗弹"之间 —— 此时相邻弹间距恒为 step，只看内部间距会把
// 合法情况误判成"没缺口"。这里改成按战机的红点判定能不能钻过去来测：
// 每颗弹在 x 轴上撑开一段禁区，在玩家中心的可达区间里找最宽的空档。
const hitR = C.player.hitR;
const halfW = C.player.w / 2;
const lo = Math.min(halfW, view.w / 2);
const hi = Math.max(view.w - halfW, view.w / 2);
const bands = xs.map((x) => [x - C.bossWall.r - hitR, x + C.bossWall.r + hitR])
  .sort((a, b) => a[0] - b[0]);
let cursor = lo, widest = 0;
for (const b of bands) {
  if (b[0] > cursor) widest = Math.max(widest, Math.min(b[0], hi) - cursor);
  cursor = Math.max(cursor, b[1]);
  if (cursor >= hi) break;
}
widest = Math.max(widest, hi - Math.max(cursor, lo));
assert(widest > step, '弹幕墙缺口太小，无法穿过（最宽空档 ' + widest.toFixed(1) +
  ' ≤ 一个格距 ' + step.toFixed(1) + '）');
// 缺口开在贴边时，通道必须真的落在屏幕内（否则等于把玩家往屏幕外赶）
assert(xs[0] > -1e-9 && xs[xs.length - 1] < view.w + 1e-9, '弹幕墙有子弹飞出屏幕');

// homing：必须是追踪弹
gb.boss.pattern = 'homing';
let homingN = 0;
gb.boss.openFireBoss(gb.player, view, function (x, y, vx, vy, owner, opt) {
  if (opt && opt.kind === 'homing') homingN++;
});
assert(homingN === C.bossHoming.count, 'homing 弹幕数量不符，实际 ' + homingN);

// petal：多层环
assert(patCount.petal === C.bossPetal.count, 'petal 弹数不符，实际 ' + patCount.petal);
// spiral：臂数来自配置
assert(patCount.spiral === C.bossSpiral.arms, 'spiral 臂数不符，实际 ' + patCount.spiral);
// 所有 Boss 弹幕都必须是大玉（≥ 常规弹），这是"压迫感"的来源
for (const pat of allPatterns) {
  let minR = Infinity;
  gb.boss.rage = false;
  gb.boss.pattern = pat;
  gb.boss.openFireBoss(gb.player, view, function (x, y, vx, vy, owner, opt) {
    minR = Math.min(minR, (opt && opt.r) || 0);
  });
  assert(minR >= C.bulletSize.normal, pat + ' 的弹体半径 ' + minR + ' 小于常规弹，不够压迫');
}
// rain：从屏幕顶部洒落
gb.boss.pattern = 'rain';
let rainOk = true;
gb.boss.openFireBoss(gb.player, view, function (x, y, vx, vy) {
  if (y >= 0 || vy <= 0 || x < 0 || x > view.w) rainOk = false;
});
assert(rainOk, 'rain 应从屏幕顶部垂直洒落');

// ---- 侧翼压制五形态：核心是"打哪边"要有几何证据，不能只是换个名字 ----
function fireCollect(boss, pat) {
  const out = [];
  boss.rage = false;
  boss.pattern = pat;
  boss.openFireBoss(gb.player, view, function (x, y, vx, vy, owner, opt) {
    out.push({ x: x, y: y, vx: vx, vy: vy, opt: opt });
  });
  return out;
}
// flank：两翼各一扇，一半往左下一半往右下，且都朝下
{
  const s = fireCollect(gb.boss, 'flank');
  const left = s.filter((b) => b.vx < -20), right = s.filter((b) => b.vx > 20);
  assert(left.length > 0 && right.length > 0, 'flank 必须左右两翼都出弹');
  assert(Math.abs(left.length - right.length) <= 1, 'flank 两翼弹数应对称');
  assert(s.every((b) => b.vy > 0), 'flank 应全部朝下方压');
  assert(patCount.flank === C.bossFlank.count * 2, 'flank 弹数不符');
}
// pincer：从左右边缘相向推进，中间留缝
{
  const s = fireCollect(gb.boss, 'pincer');
  const fromL = s.filter((b) => b.x < 20 && b.vx > 0);
  const fromR = s.filter((b) => b.x > view.w - 20 && b.vx < 0);
  assert(fromL.length > 0 && fromL.length === fromR.length, 'pincer 应从左右边缘等量对推');
  assert(s.every((b) => Math.abs(b.vy) < 1), 'pincer 应是纯横向推进，纵向靠分行造缝');
  const rows = new Set(s.map((b) => Math.round(b.y)));
  assert(rows.size >= C.bossPincer.perRow, 'pincer 应有多个横向走廊可穿');
}
// cross：两条斜线交叉成 X
{
  const s = fireCollect(gb.boss, 'cross');
  const left = s.filter((b) => b.vx < -20), right = s.filter((b) => b.vx > 20);
  assert(left.length > 0 && right.length > 0, 'cross 必须有左右两组斜线才能交叉');
  assert(s.every((b) => b.vy > 0), 'cross 斜线应朝下');
}
// lane：竖向车道封锁，且靠边车道被封的概率显著更高
{
  const s = fireCollect(gb.boss, 'lane');
  assert(s.length === C.bossLane.block * C.bossLane.perLane, 'lane 弹数不符，实际 ' + s.length);
  assert(s.every((b) => Math.abs(b.vx) < 1 && b.vy > 0), 'lane 应垂直下落封车道');
  const mid = (C.bossLane.lanes - 1) / 2;
  let edgeHits = 0, coreHits = 0;
  const lanes = C.bossLane.lanes;
  for (let trial = 0; trial < 4000; trial++) {
    for (const b of fireCollect(gb.boss, 'lane')) {
      const idx = Math.min(lanes - 1, Math.floor(b.x / (view.w / lanes)));
      const edge = mid ? Math.abs(idx - mid) / mid : 1;
      if (edge > 0.5) edgeHits++; else coreHits++;
    }
  }
  assert(edgeHits > coreHits * 1.5, 'lane 未体现"优先打左右两边"，边路封锁仅 ' + edgeHits + ' vs 中路 ' + coreHits);
}
// mine：在玩家附近布延迟雷
{
  const s = fireCollect(gb.boss, 'mine');
  assert(s.length >= C.bossMine.count, 'mine 数量不符');
  assert(s.every((b) => b.opt && b.opt.kind === 'boom' && b.opt.maxT > 500), 'mine 必须是延迟爆雷');
  const far = s.filter((b) => Math.hypot(b.x - gb.player.x, b.y - gb.player.y) > C.bossMine.spread + 24);
  assert(far.length === 0, 'mine 撒到了玩家周围之外');
}
console.log('7) Boss 弹幕 OK — %s（全部 ≥ r%d 大玉）',
  allPatterns.map((p) => p + ':' + patCount[p]).join('  '), C.bulletSize.normal);

// ---- 7c Boss 站位：会选地方站，且侧翼弹幕强制站侧翼 ----
{
  const gs = freshGame();
  for (const key of Object.keys(C.bosses)) {
    const cfg = C.bosses[key];
    assert(cfg.stances && cfg.stances.length >= 2, key + ' 至少要有 2 种站位');
    for (const st of cfg.stances) {
      assert(['center', 'flank', 'chase', 'sweep'].indexOf(st) >= 0, key + ' 未知站位 ' + st);
    }
  }
  // flank 站位：homeX 会真的跑到左右两侧，而不是停在中间
  gs.boss.spawnBoss('leviathan', view, 1);
  gs.boss.entered = true;
  const seen = new Set();
  for (const st of ['center', 'flank', 'chase', 'sweep']) {
    gs.boss.stance = st;
    gs.boss.stanceT = 0;
    gs.boss.flankSide = 1;
    let minX = Infinity, maxX = -Infinity;
    for (let f = 0; f < 900; f++) {          // 15 秒 @60fps
      gs.boss.stance = st;                   // 钉住：update 到点会自己换站位
      gs.boss.update(16.7, gs.player, view, function () { });
      minX = Math.min(minX, gs.boss.homeX);
      maxX = Math.max(maxX, gs.boss.homeX);
    }
    if (st === 'center') {
      assert(maxX - minX < 60, 'center 站位不该乱跑，实际跨度 ' + (maxX - minX).toFixed(0));
    } else {
      assert(maxX - minX > 150, st + ' 站位跨度太小（' + (maxX - minX).toFixed(0) + '），看不出在换位');
    }
    seen.add(st);
  }
  // 侧翼弹幕 → 强制 flank 位
  for (const pat of ['flank', 'pincer', 'lane']) {
    gs.boss.pattern = pat;
    gs.boss.pickStance();
    assert(gs.boss.stance === 'flank', pat + ' 用侧翼弹幕时应强制站到侧翼，实际 ' + gs.boss.stance);
  }
  gs.boss.pattern = 'spiral';
  gs.boss.pickStance();
  assert(gs.boss.stance !== undefined, '非侧翼弹幕也应能正常选位');
  console.log('7c) Boss 站位 OK — 4 种站位（居中/侧翼/追击/横扫），侧翼弹幕强制 flank');
}

// ---- 7b 残血狂暴 ----
const grg = freshGame();
grg.spawnBoss();
grg.boss.entered = true;
grg.boss.y = C.bosses.dreadnought.targetY;
grg.boss.pattern = 'fan';

grg.boss.rage = false;
let speedNormal = 0, cdNormal = 0;
grg.boss.openFireBoss(grg.player, view, function (x, y, vx, vy) { speedNormal = Math.hypot(vx, vy); });
cdNormal = grg.boss.fireCd;

grg.boss.rage = true;
let speedRage = 0, cdRage = 0;
grg.boss.openFireBoss(grg.player, view, function (x, y, vx, vy) { speedRage = Math.hypot(vx, vy); });
cdRage = grg.boss.fireCd;

assert(cdRage < cdNormal, '狂暴未缩短开火冷却');
assert(speedRage > speedNormal, '狂暴未提升弹速');

const grg2 = freshGame();
grg2.spawnBoss();
grg2.boss.entered = true;
grg2.boss.hp = Math.floor(grg2.boss.maxHp * (C.bossRage.ratio - 0.03));
let salvoN = 0;
grg2.boss.update(DT, grg2.player, view, function () { salvoN++; });
assert(grg2.boss.rage === true, '残血未自动进入狂暴');
assert(salvoN === C.bossBurst.count, '狂暴下马威未打出全屏爆发，实际 ' + salvoN + ' 发');
console.log('7b) 狂暴 OK — 冷却 %d→%d ms / 弹速 %d→%d px/s / 阈值 %d%% 自动触发',
  Math.round(cdNormal), Math.round(cdRage), Math.round(speedNormal), Math.round(speedRage),
  C.bossRage.ratio * 100);

// ==========================================================
// 8. 6 条强化路线
// ==========================================================
const g8 = freshGame();
const p8 = g8.player;

// 路线 1 · 火力
assert(g8.applyLoot('power') === true && p8.powerLevel === 2, '火力道具失效');
p8.powerLevel = C.progression.power.max;
p8.overdrive = 0; p8.odT = 0;
assert(g8.applyLoot('power') === true && p8.overdrive === C.overdrive.perPower, '满火力未累积超频槽');
p8.overdrive = 0;
let odFired = false;
for (let i = 0; i < C.overdrive.max / C.overdrive.perPower; i++) {
  g8.applyLoot('power');
  if (p8.isOverdrive()) odFired = true;
}
assert(odFired, '超频槽满未触发爆发');
assert(p8.odT > 0 && p8.inv > 0, '超频未给持续时间与无敌');
const odCd = p8.fireInterval();
p8.odT = 0;
assert(p8.fireInterval() > odCd, '超频未提升射速');
p8.odT = 5000;
const s8 = g8.score;
g8.applyLoot('power');
assert(g8.score > s8, '超频中吃 P 未转化为分数');
p8.odT = 0;

// 路线 2 · 专精（详细断言在测试 4）
// 路线 3 · 僚机（详细断言在测试 3）

// 路线 4 · 装甲
p8.armorLv = 0;
assert(g8.applyLoot('armor') === true && p8.armorLv === 1 && p8.shieldT > 0, '装甲道具失效');
assert(g8.applyLoot('armor') === true && p8.armorLv === 2 && p8.hasLastStand(), '装甲 Lv2 应获得免死');
p8.armorLv = 3;
assert(p8.shieldDuration() > C.armorLevels[1].shield, '装甲 Lv3 护盾时长未增加');

// 路线 5 · 军火
p8.arsenalLv = 0;
const bombs0 = p8.maxBombs();
assert(g8.applyLoot('bomb') === true && p8.arsenalLv === 1 && p8.maxBombs() > bombs0, '军火未提升炸弹上限');
p8.arsenalLv = C.progression.arsenal.max - 1;
assert(g8.applyLoot('bomb') === true && p8.arsenalLv === C.progression.arsenal.max, '军火未到上限');
assert(p8.bombDamage() > C.arsenalDamage[0], '军火高等级应提升炸弹伤害');

// 路线 6 · 引擎（擦弹删掉后改成 移速 + 道具拾取范围）
p8.engineLv = 0;
assert(g8.applyLoot('engine') === true && p8.engineLv === 1 && p8.moveScale() > 1, '引擎 Lv1 应提升移速');
p8.engineLv = 2;
assert(p8.pickRadius() > C.engineLevels[0].pickR, '引擎 Lv2 应扩大道具拾取范围');
p8.engineLv = 3;
assert(p8.pickRadius() > C.engineLevels[2].pickR, '引擎 Lv3 拾取范围未继续增长');
assert(p8.moveScale() > C.engineLevels[2].speed, '引擎 Lv3 移速未继续增长');
assert(g8.applyLoot('engine') === false, '引擎满级后不该继续升级');

// 回血
p8.hp = 1;
assert(g8.applyLoot('heal') === true && p8.hp === 2, '回血道具失效');
console.log('8) 六条路线 OK — 火力(含超频)/专精/僚机/装甲/军火/引擎 + 回血');

// ==========================================================
// 9. 擦弹已移除：贴弹飞没有任何收益，配置也不留残渣
// ==========================================================
const g9 = freshGame();
g9.player.bombs = 0;
g9.spawnBullet(g9.player.x + 18, g9.player.y - 10, 0, 0, 1);   // 18px：只擦不中的距离
const sc = g9.score;
g9.collide();
assert(g9.player.hp === C.player.maxHp, '安全的距离不该掉血');
assert(g9.score === sc, '擦弹已删除，贴弹不该加分');
assert(g9.player.bombs === 0, '擦弹已删除，不该充能换炸弹');
assert(C.graze === undefined, 'CONFIG.graze 残留');
assert(C.player.grazeR === undefined, 'CONFIG.player.grazeR 残留');

// 炸弹来源换成：每关开局补给
const g9b = freshGame();
g9b.player.arsenalLv = 0;
g9b.player.bombs = 0;
g9b.startStage(3);
assert(g9b.player.bombs >= C.bombSupply.perStage, '每关未补给炸弹，实际 ' + g9b.player.bombs);
console.log('9) 擦弹已移除 OK — 贴弹无收益 / 无配置残留 / 每关补给 +%d 炸弹', C.bombSupply.perStage);

// ==========================================================
// 10. 炸弹：清屏 + 无敌 + 残血不代劳 + Boss 只结算一次
// ==========================================================
const g10 = freshGame();
for (let i = 0; i < 8; i++) g10.spawnBullet(100 + i * 40, 300, 0, 200, 1);
g10.player.bombs = 1;
assert(g10.useBomb() === true, '炸弹未释放');
let left = 0;
g10.bullets.forEach((bu) => { if (bu.owner === 1) left++; });
assert(left === 0, '炸弹未清屏，剩余敌弹 ' + left);
assert(g10.player.bombs === 0, '炸弹未扣除');
assert(g10.player.inv > 0, '炸弹后未给无敌');
assert(g10.useBomb() === false, '无炸弹时仍可释放');

// 默认不代劳：残血挨打就是死，炸弹只救主动按的人
const g10b = freshGame();
g10b.player.hp = 1;
g10b.player.bombs = 1;
g10b.hurtPlayer();
assert(g10b.dead === true, '残血挨打竟然没死（还在自动保命？）');
assert(g10b.player.bombs === 1, '没按按钮却消耗了炸弹');

// 主动按炸弹要能救命：先按再挨打，无敌帧吃掉这一下
const g10d = freshGame();
g10d.player.hp = 1;
g10d.player.bombs = 1;
g10d.useBomb();
g10d.hurtPlayer();
assert(g10d.dead === false, '主动放炸弹后仍被致命一击打死');
assert(g10d.player.bombs === 0, '主动保命未消耗炸弹');

// 装甲 Lv2 的 lastStand 是唯一"白捡"的免死，且每关只一次
const g10e = freshGame();
g10e.player.armorLv = 2;
g10e.player.hp = 1;
g10e.player.bombs = 0;
g10e.hurtPlayer();
assert(g10e.dead === false, '装甲 Lv2 免死没生效');
assert(g10e.player.lastStand === true, '免死没打标记');
g10e.player.inv = 0;
g10e.hurtPlayer();
assert(g10e.dead === true, '装甲免死竟然能触发两次');
assert(C.player.autoBombSave === 0, 'autoBombSave 默认值不是 0');

// 炸弹炸死 Boss 时，结算必须只有一次
const g10c = freshGame();
g10c.spawnBoss();
g10c.boss.entered = true;
g10c.player.bombs = 1;
const scorePre = g10c.score;
let downCalls = 0;
const origDown = g10c.onBossDown.bind(g10c);
g10c.onBossDown = function () { downCalls++; return origDown(); };
g10c.boss.hp = 1;
g10c.useBomb();
g10c.update(DT);
assert(downCalls === 1, 'Boss 被炸死后结算了 ' + downCalls + ' 次');
assert(g10c.score > scorePre, 'Boss 击杀未加分');
console.log('10) 炸弹 OK — 清屏 / 扣弹 / 无敌 / 残血不再代劳（主动按才救）/ 装甲免死每关一次 / Boss 结算一次');

// ==========================================================
// 11. pity 保底
// ==========================================================
const g11 = freshGame();
let dropCount = 0, longestGap = 0, gap = 0;
for (let i = 0; i < 500; i++) {
  const got = g11.tryDrop(200, 300, 'fighter');
  if (got) { dropCount++; longestGap = Math.max(longestGap, gap); gap = 0; }
  else gap++;
}
assert(dropCount > 0, 'pity 机制下完全没有掉落');
assert(longestGap <= C.drop.pityMax, '连续无掉落 ' + longestGap + ' 次超过 pityMax');
console.log('11) 保底掉率 OK — 500 次精英击杀掉落 %d 次，最长空窗 %d（上限 %d）',
  dropCount, longestGap, C.drop.pityMax);

// ==========================================================
// 12. 死亡结算 + 最高分落盘
// ==========================================================
const deadGame = freshGame();
deadGame.score = 4321;
deadGame.player.hp = 1;
const killer = deadGame.enemies.acquire();
killer.spawn('bomber', deadGame.player.x, deadGame.player.y, 1);
deadGame.update(DT);
assert(deadGame.dead === true, '未进入死亡态');
assert(Number(global.localStorage.getItem('ts_high')) >= 4321, '最高分未落盘');
console.log('12) 死亡结算 OK — dead=%s 最高分=%s', deadGame.dead, global.localStorage.getItem('ts_high'));

// ==========================================================
// 13. UI 渲染（含 HUD 的武器/僚机显示）
// ==========================================================
deadGame.reset();
deadGame.player.weapon = 'spread';
deadGame.player.powerLevel = 3;
deadGame.player.options = 2;
T.UI.menu(ctxStub, view, deadGame);
T.UI.over(ctxStub, view, deadGame);
T.UI.pause(ctxStub, view);
deadGame.render(ctxStub, true);
console.log('13) UI 渲染 OK — 菜单 / 结算 / 暂停 / HUD');

// ==========================================================
// 14. 31 种怪：数量、行为组合唯一性、家族完整（第 31 种是补给舱）
// ==========================================================
const types = Object.keys(C.enemies);
assert(types.length === 31, '敌机种类应为 31，实际 ' + types.length);

for (const t of types) {
  const e = C.enemies[t];
  assert(e.name, t + ' 缺少中文名');
  assert(e.family, t + ' 缺少家族');
  assert(e.shape, t + ' 缺少外形模板');
  assert(e.move, t + ' 缺少移动原语');
}

// 「不是换皮」的硬保证：move + attack + trait + 关键差异化参数 必须两两不同
const combo = {};
const comboKey = (e) => [
  e.move, e.attack || '-', e.trait || '-',
  e.salvo || 1, e.laser ? 'L' : '-', e.ring || '-', e.burst || '-', e.pellets || '-',
  e.gift ? 'GIFT' : '-'   // 补给舱与 dart 都是 sine 且不还手，靠这个才能区分开
].join('|');
for (const t of types) {
  const key = comboKey(C.enemies[t]);
  if (combo[key]) {
    assert.fail(t + ' 与 ' + combo[key] + ' 行为组合完全相同：' + key);
  }
  combo[key] = t;
}

// 9 个家族都要有出场
const families = new Set(types.map((t) => C.enemies[t].family));
assert(families.size === 9, '家族应为 9 个，实际 ' + families.size);

// 每关配置的怪都必须存在于 enemies
for (let si = 0; si < C.stages.length; si++) {
  for (const w of C.stages[si].waves) {
    for (const g of w.groups) {
      assert(C.enemies[g.type], '第 ' + (si + 1) + ' 关引用了不存在的怪：' + g.type);
    }
  }
}
console.log('14a) 31 种怪 OK — %d 种 / %d 家族 / 行为组合 %d 种全唯一',
  types.length, families.size, Object.keys(combo).length);

// ==========================================================
// 14f. 补给舱：一碰就碎（血量不吃关卡系数）+ 必掉道具 + 每波空投
// ==========================================================
{
  const sp = C.enemies.supply;
  assert(sp.gift === true, '补给舱应标记 gift');
  assert(sp.fire === 0, '补给舱不能还手，否则就不叫"送道具的怪"了');
  assert(sp.hp <= 3, '补给舱血量必须极低（一碰就碎），实际 ' + sp.hp);
  assert(sp.family === 'special', '补给舱应独占 special 家族');

  // 最关键的一条：血量必须恒定，不吃关卡血量系数。
  // 否则后期系数涨到 3 倍，它就不再"一碰就碎"，设计意图直接失效。
  const gsp = freshGame();
  const hpAt = (stageNo) => {
    gsp.stageIndex = stageNo;
    gsp.sc = gsp.scales();
    const e = gsp.spawnEnemy('supply', 375, 100);
    const hp = e.hp;
    e.active = false;
    return hp;
  };
  const h1 = hpAt(0), h20 = hpAt(19);
  assert(h1 === sp.hp, '补给舱血量应恒为 ' + sp.hp + '，第 1 关实际 ' + h1);
  assert(h20 === sp.hp, '补给舱第 20 关仍应恒为 ' + sp.hp + '，实际 ' + h20);
  // 对照组：普通怪在同一关的血量必须已经涨上去了，不然就是系数没生效
  const gn = freshGame();
  gn.stageIndex = 19; gn.sc = gn.scales();
  const norm = gn.spawnEnemy('scout', 375, 100);
  assert(norm.hp > C.enemies.scout.hp * 2,
    '对照组不成立：第 20 关杂兵血量 ' + norm.hp + ' 没有明显增长，难度系数可能没生效');
  norm.active = false;

  // 必掉道具：打死 20 个必须次次都掉，一次都不能漏
  const gd2 = freshGame();
  let drops = 0;
  for (let i = 0; i < 20; i++) {
    const e = gd2.spawnEnemy('supply', 375, 100);
    e.hp = 1;
    const before = countActive(gd2.loot);
    gd2.onKill(e);
    e.active = false;
    if (countActive(gd2.loot) > before) drops++;
    gd2.loot.clear();
  }
  assert(drops === 20, '补给舱应 100% 掉道具，实际 20 次只掉了 ' + drops + ' 次');

  // 每波空投，且投放量不随难度膨胀（补给量暴涨会让后期反而变简单）
  const gw = freshGame();
  gw.startStage(0);
  const early = gw.groups.filter((g) => g.type === 'supply');
  assert(early.length === C.supply.perWave,
    '每波应投放 ' + C.supply.perWave + ' 个补给舱，实际 ' + early.length);
  gw.startStage(15);
  const late = gw.groups.filter((g) => g.type === 'supply');
  assert(late.length === C.supply.perWave,
    '后期每波投放量不应膨胀，第 16 关实际 ' + late.length + ' 个');
  // 补给舱不能被 reinforce 的 count 缩放波及
  assert(early[0].count === 1, '补给舱数量应恒为 1，实际 ' + early[0].count);

  // 它是奖励不是威胁：撞上去既不该扣血，也不该把它撞毁
  const gc = freshGame();
  gc.player.inv = 0;
  gc.player.hp = C.player.maxHp;
  gc.player.x = 375; gc.player.y = 900;
  const gift = gc.spawnEnemy('supply', 375, 900);
  gift.fresh = 0;
  gc.collide();
  assert(gc.player.hp === C.player.maxHp,
    '撞到补给舱不该扣血，实际掉到 ' + gc.player.hp);
  assert(gift.active, '撞到补给舱不该把它撞毁');

  console.log('14f) 补给舱 OK — 血量恒为 %d（第1/20关一致）· 必掉 100%% · 每波 %d 个不膨胀 · 撞击不扣血',
    sp.hp, C.supply.perWave);
}

// ==========================================================
// 14b. 7 种掉落物：形状、颜色、光环三重区分
// ==========================================================
const pk = Object.keys(C.powerups);
assert(pk.length === 7, '掉落物应为 7 种，实际 ' + pk.length);
const pShapes = new Set(), pColors = new Set();
for (const k of pk) {
  pShapes.add(C.powerups[k].shape);
  pColors.add(C.powerups[k].color);
}
assert(pShapes.size === 7, '掉落物形状不够区分，仅 ' + pShapes.size + ' 种');
assert(pColors.size === 7, '掉落物颜色不够区分，仅 ' + pColors.size + ' 种');
assert(C.powerups.weapon.halo && C.powerups.option.halo, 'W / O 应带稀有光环');
assert(!C.powerups.power.halo && !C.powerups.heal.halo, 'P / H 不该带光环，否则光环失去稀有含义');
// 成长类道具磁吸更远
assert(C.powerups.power.magnet > C.powerups.heal.magnet, '成长类道具磁吸应大于回血');
console.log('14b) 掉落物 OK — 7 种，形状与颜色各 7 种全唯一，W/O 带旋转光环');

// ==========================================================
// 14c. 掉落点数模型：大怪给得多，威胁越高越容易出强成长
// ==========================================================
const gd = freshGame();
gd.player.hp = 1;   // 满血时 H 权重会被清零，测不出差异
const threatScout = gd.threatOf({ cfg: C.enemies.scout });
const threatHive = gd.threatOf({ cfg: C.enemies.hive });
assert(threatHive > threatScout * 4, '母舰威胁值应远高于杂兵');
const wWeak = gd.lootWeights(threatScout);
const wElite = gd.lootWeights(threatHive);
assert(wElite.weapon > wWeak.weapon, '打硬怪时 W 权重应更高');
assert(wWeak.heal > wElite.heal, '打杂兵时 H 权重应更高');
// 满级路线把权重让给火力
gd.player.engineLv = C.progression.engine.max;
const wMaxed = gd.lootWeights(threatScout);
assert(wMaxed.engine === 0, '已满级路线的权重应归零');
assert(wMaxed.power > wWeak.power, '满级路线的权重应转给火力');
console.log('14c) 掉落规则 OK — 威胁 scout %s / hive %s，硬怪偏 W、杂兵偏 H、满级让权',
  threatScout.toFixed(1), threatHive.toFixed(1));

// ==========================================================
// 14d. 难度曲线：四条曲线各自单调，血量不封顶、其余封顶，弹幕逐关加密
// ==========================================================
{
  const gs = freshGame();
  const at = (s) => { gs.stageIndex = s; return gs.scales(); };
  const s1 = at(0), s6 = at(5), s11 = at(10), s20 = at(19);
  // 血量：严格指数递增，永不封顶（这是"必崩"的那道墙）
  assert(s6.hp > s1.hp && s11.hp > s6.hp && s20.hp > s11.hp * 3, '血量曲线必须单调递增且不封顶');
  // 移速 / 数量 / 密度：递增但封顶
  assert(s20.speed === C.difficulty.speedMax, '移速应封顶，实际 ' + s20.speed);
  assert(s20.count === C.difficulty.countMax, '敌人数量应封顶');
  assert(s20.vol === C.difficulty.volMax, '弹幕密度应封顶');
  // 开火间隔：单调缩短并封底
  assert(s6.fire < s1.fire && s20.fire === C.difficulty.fireMin, '开火间隔应逐关缩短并封底');
  // 第 1 关应当是基准难度，不能一上来就上强度
  assert(Math.abs(s1.speed - 1) < 0.01 && Math.abs(s1.count - 1) < 0.01 && Math.abs(s1.vol - 1) < 0.01,
    '第 1 关的移速/数量/密度都应是 1.0 基准');
  // 同一只怪在后期打出的弹数必须更多（不是更快，是更密）
  const measure = (stage) => {
    const g2 = freshGame();
    g2.stageIndex = stage;
    g2.sc = g2.scales();
    const kinds = ['weaver', 'blossom', 'netter', 'beamer', 'gunship', 'spinner'];
    let total = 0, maxSpeed = 0;
    for (const k of kinds) {
      const e = g2.spawnEnemy(k, 375, 200);
      e.fireCd = 0;
      let n = 0;
      e.shoot(g2.player, function (x, y, vx, vy) { n++; maxSpeed = Math.max(maxSpeed, Math.hypot(vx, vy)); });
      total += n;
    }
    return { n: total, sp: maxSpeed };
  };
  const m1 = measure(0), m10 = measure(9), m16 = measure(15);
  assert(m10.n > m1.n * 1.3, '第 10 关弹幕应明显比第 1 关密，实际 ' + m1.n + ' → ' + m10.n);
  assert(m16.n >= m10.n, '弹幕密度不应回落');
  // 不提速造难度：第 11 关之后 speed 系数完全封顶，一点都不能再涨。
  // 刻意不测"实测像素弹速" —— shotgun 的弹速自带 0.75~1.25 随机因子，测出来全是噪声。
  // 封顶关卡按公式算，别硬编码（改 speedMax/speedGrow 时容易算错）
  const capStage = Math.ceil((C.difficulty.speedMax - 1) / C.difficulty.speedGrow);
  assert(at(capStage).speed === C.difficulty.speedMax && at(19).speed === C.difficulty.speedMax,
    '第 ' + (capStage + 1) + ' 关起弹速系数应完全封顶，实际 ' + at(capStage).speed + ' → ' + at(19).speed);
  assert(at(19).speed <= C.difficulty.speedMax, '弹速系数超出 speedMax，实际 ' + at(19).speed);

  console.log('14d) 难度曲线 OK — 弹数 %d→%d→%d（第1/10/16关）· 弹速第11关起封顶 · 血量指数不封顶',
    m1.n, m10.n, m16.n);
}

// ==========================================================
// 14e. 循环加压：轮回后不能掉回新手村密度，且叠加必须有上限
// ==========================================================
{
  const R = C.reinforce;
  assert(R && R.groups.length > 0, '缺少循环加压配置');
  assert(R.stackMax >= 1, '循环加压必须封顶，否则后期会把子弹池打满');
  for (const g of R.groups) assert(C.enemies[g.type], '加压组引用了不存在的怪 ' + g.type);

  const gsm = freshGame();
  const groupCount = (stageNo) => {
    gsm.startStage(stageNo);
    gsm.startWave(0);
    // 只数"敌人组"：补给舱是独立机制（见 14f），混进来会让这里的数全错
    return gsm.groups.filter((g) => g.type !== 'supply').length;
  };
  // 必须同表比较：三张关卡表的基础组数本就不同，跨表比会得出假结论
  const per = C.stages.length;
  const before = groupCount(0);                        // 表1 · 第 1 圈（加压前）
  const atLoop = (n) => groupCount(per * n);           // 表1 · 第 n+1 圈
  const justBefore = atLoop(R.startLoop - 1);          // 刚到加压线之前那一圈
  const first = atLoop(R.startLoop);                   // 第一次加压
  const capped = atLoop(R.startLoop + R.stackMax + 1);  // 早就叠满
  // 加压起始圈按配置算，别硬编码圈号
  assert(justBefore === before,
    '第 ' + R.startLoop + ' 圈之前不该加压，实际 ' + before + ' → ' + justBefore);
  assert(first === before + R.groups.length,
    '第 ' + (R.startLoop + 1) + ' 圈应追加 1 轮加压组，实际 ' + before + ' → ' + first);
  assert(capped === before + R.groups.length * R.stackMax,
    '加压叠加必须封顶在 stackMax=' + R.stackMax + '，实际 ' + (capped - before));
  // 第 1 圈保持原设计：组数必须严格等于配置值
  for (let i = 0; i < per; i++) {
    const want = C.stages[i].waves[0].groups.length;
    assert(groupCount(i) === want,
      '第 1 圈第 ' + (i + 1) + ' 关被加压了，配置 ' + want + ' 组，实际 ' + groupCount(i) + ' 组');
  }
  console.log('14e) 循环加压 OK — 每波组数 第1圈 %d → 第%d圈 %d → 封顶 %d（startLoop=%d stackMax=%d）',
    before, R.startLoop + 1, first, capped, R.startLoop, R.stackMax);
}

// ==========================================================
// 14g. 轻点清屏：判据必须是"位移 + 时长"双条件，且不能和拖动/按钮打架
// ==========================================================
{
  const TAP = T.Platform.tapApi;
  assert(TAP && typeof TAP.withinSlop === 'function' && typeof TAP.qualifies === 'function',
    'Platform 应导出 tapApi 纯判定函数');
  const lim = C.input.tapMaxMove, tmax = C.input.tapMaxMs;
  assert(lim > 0 && tmax > 0, '轻点阈值必须是正数');

  // ---- 位移容差（边界值含在内）----
  assert(TAP.withinSlop(0, 0), '原地不动必须算轻点');
  assert(TAP.withinSlop(lim, 0), '位移刚好等于容差应算轻点');
  assert(!TAP.withinSlop(lim + 1, 0), '位移超出容差必须判成拖拽');

  // 关键回归：容差必须按直线距离算。逐轴判定的实现会把斜向 (0.75lim, 0.75lim)
  // 判成轻点，但它的真实位移已经超过 lim 了 —— 拖动时斜着划一下就会误放雷。
  const diag = Math.ceil(lim * 0.75);
  assert(diag <= lim, '测试前提：斜向分量本身在容差内');
  assert(!TAP.withinSlop(diag, diag),
    '斜向 ' + diag + ',' + diag + ' 直线距离 ' + Math.round(Math.sqrt(diag * diag * 2)) +
    ' 已超容差 ' + lim + '，按逐轴判定会误判成轻点');

  // ---- 时长上限 ----
  assert(TAP.qualifies(false, 0), '瞬间抬手应算轻点');
  assert(TAP.qualifies(false, tmax), '时长刚好等于上限应算轻点');
  assert(!TAP.qualifies(false, tmax + 1), '超过时长上限不算轻点');
  assert(!TAP.qualifies(true, 0), '中途拖过的手指，抬手再快也不算轻点');

  // ---- 真实事件链路：走一遍 bindInput 注册的 pointer* 监听 ----
  const lis = {};
  const fakeSurface = {
    canvas: {
      addEventListener: function (t, fn) { (lis[t] = lis[t] || []).push(fn); },
      getBoundingClientRect: function () { return { left: 0, top: 0, width: 390, height: 693 }; },
      setPointerCapture: function () {}
    },
    view: { w: 750, h: 1334, padTop: 0, padBottom: 0 },
    cssW: 390, cssH: 693, env: 'web', dpr: 1
  };
  const st = {};
  T.Platform.bindInput(fakeSurface, st);
  assert(lis.pointerdown && lis.pointerup, 'web 端应注册 pointer 监听');
  const fire = function (t, e) { (lis[t] || []).forEach(function (fn) { fn(e || {}); }); };
  const pev = function (cx, cy) {
    return { clientX: cx, clientY: cy, pointerId: 1, preventDefault: function () {} };
  };

  const realNow = Date.now;
  let clock = 100000;
  Date.now = function () { return clock; };
  try {
    // A. 空白处轻点一下 → 必须在按下点产出轻点
    fire('pointerdown', pev(100, 300));
    clock += 90;
    fire('pointerup', {});
    assert(st.tap, '轻点一下应当产出 tap');
    assert(Math.abs(st.tap.x - 100 / 390 * 750) < 0.01 && Math.abs(st.tap.y - 300 / 693 * 1334) < 0.01,
      'tap 坐标应是按下点的设计坐标，实际 ' + st.tap.x + ',' + st.tap.y);
    assert(st.active === false, '抬手后不该还停在拖拽状态');

    // B. 拖出去再抬手 → 不是轻点（拖动操控不能顺手放雷）
    st.tap = null;
    fire('pointerdown', pev(100, 300));
    clock += 60;
    fire('pointermove', pev(130, 300));    // 30 CSS px ≈ 58 设计 px，远超容差
    fire('pointerup', {});
    assert(st.tap === null, '拖动操控不能顺手放炸弹');

    // C. 拖远再拖回按下点 → 依然不是轻点。
    //    若只在 up 时看最终位移，每次拖动结束都会白送一颗雷。
    st.tap = null;
    fire('pointerdown', pev(100, 300));
    clock += 60;
    fire('pointermove', pev(200, 300));
    fire('pointermove', pev(100, 300));
    fire('pointerup', {});
    assert(st.tap === null, '拖远再拖回原位也不能算轻点');

    // D. 长按不放 → 不是轻点
    st.tap = null;
    fire('pointerdown', pev(100, 300));
    clock += tmax + 40;
    fire('pointerup', {});
    assert(st.tap === null, '长按不该触发轻点');

    // E. 被系统打断（来电 / 通知栏下拉）→ 不是轻点
    st.tap = null;
    fire('pointerdown', pev(100, 300));
    clock += 50;
    fire('pointercancel', {});
    assert(st.tap === null, '触摸被系统打断不该放炸弹');

    // F. 多指：一根手指正在拖，另一根按下再抬起 → 不能凭空产出轻点
    st.tap = null;
    fire('pointerdown', pev(100, 300));
    clock += 40;
    fire('pointermove', pev(300, 300));    // 手指 A 拖远
    fire('pointerdown', pev(400, 700));    // 手指 B 按下：不能把轻点基准重置回原点
    fire('pointerup', {});
    assert(st.tap === null, '多指操作不能凭空触发清屏');
  } finally {
    Date.now = realNow;
  }

  // G. 手势判定钩子：app 通过 input.tapGuard 决定"这次手势算不算轻点"。
  //    必须在按下的那一刻问 —— 等抬手再问，画面可能已经切页、按钮命中区早没了，
  //    点「开始游戏」就会白放一颗炸弹（小游戏端真机链路上踩到过，见 smoke-wx 第 12 组）。
  st.tap = null;
  let guardCalls = 0;
  st.tapGuard = function () { guardCalls++; return true; };   // 模拟"按在按钮上"
  fire('pointerdown', pev(100, 300));
  assert.strictEqual(guardCalls, 1, '按下时就该问一次 tapGuard，实际 ' + guardCalls + ' 次');
  clock += 50;
  fire('pointerup', {});
  assert(st.tap === null, 'tapGuard 说"不算轻点"时不能产出轻点');
  assert.strictEqual(guardCalls, 1, 'tapGuard 在抬手时不该再被问一次，实际 ' + guardCalls + ' 次');

  st.tap = null;
  guardCalls = 0;
  st.tapGuard = function () { guardCalls++; return false; };  // 模拟"按在空处"
  fire('pointerdown', pev(100, 300));
  clock += 50;
  fire('pointerup', {});
  assert(st.tap, 'tapGuard 放行时应正常产出轻点');
  assert.strictEqual(guardCalls, 1, 'tapGuard 在抬手时不该再被问一次，实际 ' + guardCalls + ' 次');

  // 没装钩子时（纯 platform 场景）必须按"算轻点"处理，不能整个失效
  st.tap = null;
  st.tapGuard = undefined;
  fire('pointerdown', pev(100, 300));
  clock += 50;
  fire('pointerup', {});
  assert(st.tap, '没装 tapGuard 时轻点应照常工作');
  st.tap = null;
  // ---- 按钮区域必须被排除，否则点一下会放两颗雷 ----
  const gb = freshGame();
  const lay = T.uiLayout(view);
  assert(gb.isBombButton(lay.bomb.x, lay.bomb.y), '圆钮中心应命中 isBombButton');
  assert(!gb.isBombButton(view.w / 2, view.h * 0.5), '屏幕中部不该命中圆钮');
  assert(lay.bomb.x > view.w * 0.7 && lay.bomb.y > view.h * 0.7, '圆钮应在右下角，轻点空处不易踩到');
  // 暂停钮靠自己注册的命中区被排除（boot 里判 UI.hitTest !== null）
  T.UI.resetHits();
  T.UI.pauseButton(ctxStub, view);
  assert(T.UI.hitTest(lay.pause.x, lay.pause.y) === 'pause',
    '暂停钮必须注册 hitTest 命中区，否则轻点会穿透过去顺手清屏');
  T.UI.resetHits();

  console.log('14g) 轻点清屏 OK — 位移容差 %d px（按直线距离）· 时长上限 %d ms · ' +
    '拖动/长按/多指/系统打断都不触发 · 圆钮与暂停钮已排除', lim, tmax);
}

console.log('\nALL PASS');
