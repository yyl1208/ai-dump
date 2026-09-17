// 微信小游戏环境冒烟测试：不装开发者工具也能验证移植是否成立。
// 用 Node vm 伪造一套 wx 全局 API，直接跑构建产物 dist/wx/game.js。
// 关键点：全局故意不定义 document —— 只要代码里漏了 DOM 依赖，这里必然抛错。
// 用法： node tools/build-wx.js && node tools/smoke-wx.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist', 'wx');
const gameFile = path.join(distDir, 'game.js');
assert.ok(fs.existsSync(gameFile), '先跑 node tools/build-wx.js');

// ---------------------------------------------------------
// 伪造 wx 环境
// ---------------------------------------------------------
let sysInfo = {
  windowWidth: 390,
  windowHeight: 844,
  pixelRatio: 3,          // 故意给 3，验证 dpr 封顶 2
  statusBarHeight: 47,
  safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }
};

const storeData = {};
const H = {
  touchStart: [], touchMove: [], touchEnd: [], touchCancel: [],
  show: [], hide: [], resize: [], shareApp: []
};
let gcCalls = 0, keepOnCalls = 0, exitCalls = 0, shareNowCalls = 0;
const vibrates = [];
const shareImgs = [];
const drawnText = [];

function makeCtx(record) {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 12 });
      if (k === 'fillText') return (s) => { if (record) drawnText.push(String(s)); };
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

const canvases = [];
function makeCanvas(record) {
  const c = { width: 0, height: 0 };
  const cx = makeCtx(record);
  c.getContext = () => cx;
  c.toTempFilePathSync = (o) => {
    shareImgs.push({ w: o && o.width, h: o && o.height });
    return 'wxfile://tmp/share_' + shareImgs.length + '.png';
  };
  canvases.push(c);
  return c;
}

let rafQueue = [];
let fakeNow = 1000;

global.document = undefined;            // 没有 DOM，谁碰谁炸
global.performance = { now: () => fakeNow };
global.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
global.module = { exports: {} };        // 构建产物结尾有 module.exports = {}
global.GameGlobal = global;
global.wx = {
  createCanvas: () => makeCanvas(canvases.length === 0),   // 第一个是主画布，之后是离屏
  getWindowInfo: () => sysInfo,
  getSystemInfoSync: () => sysInfo,
  onTouchStart: (fn) => H.touchStart.push(fn),
  onTouchMove: (fn) => H.touchMove.push(fn),
  onTouchEnd: (fn) => H.touchEnd.push(fn),
  onTouchCancel: (fn) => H.touchCancel.push(fn),
  onShow: (fn) => H.show.push(fn),
  onHide: (fn) => H.hide.push(fn),
  onWindowResize: (fn) => H.resize.push(fn),
  getStorageSync: (k) => (k in storeData ? storeData[k] : ''),
  setStorageSync: (k, v) => { storeData[k] = v; return true; },
  triggerGC: () => { gcCalls++; },
  vibrateShort: (o) => { vibrates.push((o && o.type) || 'short'); },
  setKeepScreenOn: (o) => { if (o && o.keepScreenOn) keepOnCalls++; },
  showShareMenu: () => {},
  onShareAppMessage: (fn) => H.shareApp.push(fn),
  shareAppMessage: () => { shareNowCalls++; return true; },
  exitMiniProgram: () => { exitCalls++; return true; }
};

// ---------------------------------------------------------
// 加载构建产物
// ---------------------------------------------------------
let code = fs.readFileSync(gameFile, 'utf8');
code = code.replace(
  /module\.exports = \{\};\s*$/,
  ';GameGlobal.__TWX = { CONFIG: CONFIG, Platform: Platform, Draw: Draw, GameScene: GameScene, UI: UI, boot: boot, uiLayout: uiLayout, Audio8: Audio8 };'
);
vm.runInThisContext(code, { filename: 'dist/wx/game.js' });

const T = global.__TWX;
const C = T.CONFIG;
const app = global.__TS;

function pump(n, dt) {
  for (let i = 0; i < n; i++) {
    const q = rafQueue.splice(0);
    fakeNow += (dt === undefined ? 16.6 : dt);
    for (let j = 0; j < q.length; j++) q[j](fakeNow);
  }
}
// 模拟一次点击：设置按下点 → 跑一帧让状态机处理 → 抬手
function tap(x, y) {
  H.touchStart[0]({ touches: [{ clientX: x, clientY: y }] });
  pump(1);
  H.touchEnd[0]({ touches: [] });
}
function toCss(dx, dy) {
  return { x: dx / app.view.w * app.surface.cssW, y: dy / app.view.h * app.surface.cssH };
}

let pass = 0;
function ok(name, extra) {
  pass++;
  console.log(pass + ') ' + name + ' OK' + (extra ? ' — ' + extra : ''));
}

// ---------------------------------------------------------
// 1. 环境识别与画布
// ---------------------------------------------------------
assert.strictEqual(T.Platform.env, 'wx');
assert.strictEqual(T.Platform.isMini, true);
assert.strictEqual(T.Platform.font(), 'sans-serif');   // 小游戏不认 system-ui
assert.ok(app, 'wx-entry 未把 app 挂到 GameGlobal');
const canvas = canvases[0];
assert.strictEqual(canvas.width, 390 * 2);
assert.strictEqual(canvas.height, 844 * 2);
ok('环境识别', 'env=wx / dpr 3→封顶 2 / 画布 ' + canvas.width + 'x' + canvas.height);

// ---------------------------------------------------------
// 2. 安全区与 HUD 布局
// ---------------------------------------------------------
const view = app.view;
const expectPadTop = 47 * 750 / 390;
const expectPadBottom = (844 - 810) * 750 / 390;
assert.ok(Math.abs(view.padTop - expectPadTop) < 0.5, 'padTop=' + view.padTop);
assert.ok(Math.abs(view.padBottom - expectPadBottom) < 0.5, 'padBottom=' + view.padBottom);
const L = T.uiLayout(view);
assert.ok(Math.abs(L.bomb.x - 646) < 0.01, 'bomb.x=' + L.bomb.x);
assert.ok(L.safeTop > C.ui.safeTop, 'safeTop 应被安全区顶开: ' + L.safeTop);
assert.ok(L.pause && L.pause.r > 0, '缺暂停按钮布局');
ok('安全区', 'padTop ' + view.padTop.toFixed(0) + ' / padBottom ' + view.padBottom.toFixed(0) +
  ' / safeTop ' + L.safeTop.toFixed(0) + ' / 炸弹钮 y=' + L.bomb.y.toFixed(0) + '（屏高 ' + view.h.toFixed(0) + '）');

// ---------------------------------------------------------
// 3. 健康游戏忠告（运营规范 2.6.2 硬性要求）
// ---------------------------------------------------------
pump(1);
assert.strictEqual(app.getState(), 'notice', '冷启动没有先进忠告页');
drawnText.length = 0;
pump(1);
const noticeParts = C.healthNotice.split('。').filter(Boolean).map((s) => s + '。');
for (const part of noticeParts) {
  assert.ok(drawnText.indexOf(part) >= 0, '忠告缺句：' + part);
}
ok('健康忠告', '冷启动进忠告页，全文 ' + noticeParts.length + ' 句逐句登载');

// 忠告之后必须标明著作权信息（运营规范 2.6.1）
assert.ok(drawnText.some((s) => s.indexOf('著作权人：') === 0), '忠告页没标著作权信息');
assert.ok(drawnText.some((s) => s.indexOf('批准文号：') === 0), '忠告页没标批准文号');

// 倒计时结束后自动进菜单；也可以点「我知道了」提前跳过
tap(375, view.h * 0.78);
assert.strictEqual(app.getState(), 'menu', '忠告页点确认没进菜单');
drawnText.length = 0;
pump(1);
assert.ok(drawnText.indexOf(C.meta.name) >= 0, '菜单没画游戏名');
ok('忠告→菜单', '点「我知道了」进菜单，标题「' + C.meta.name + '」');

// ---------------------------------------------------------
// 4. 触摸操控
// ---------------------------------------------------------
H.touchStart[0]({ touches: [{ clientX: 195, clientY: 422 }] });
assert.ok(Math.abs(app.input.x - 375) < 0.5, 'x=' + app.input.x);
H.touchMove[0]({ touches: [{ clientX: 390, clientY: 844 }] });
assert.ok(Math.abs(app.input.x - 750) < 0.5, '拖到右下角 x=' + app.input.x);
H.touchEnd[0]({ touches: [] });
assert.strictEqual(app.input.active, false);

// 点「开始游戏」按钮进战斗
tap(375, view.h * 0.46);
assert.strictEqual(app.getState(), 'playing', '点开始游戏没进战斗');
pump(400);
assert.ok(app.game.score > 0, '推进 400 帧没有得分');
ok('触摸操控', '拖动跟随正常 · 点开始按钮进战斗 · 400 帧得分 ' + app.game.score);

// ---------------------------------------------------------
// 5. 手机端暂停（真机没有 P 键）
// ---------------------------------------------------------
const pauseCss = toCss(L.pause.x, L.pause.y);
tap(pauseCss.x, pauseCss.y);
assert.strictEqual(app.isPaused(), true, '点暂停按钮没暂停');
const scoreAtPause = app.game.score;
pump(60);
assert.strictEqual(app.game.score, scoreAtPause, '暂停期间游戏还在跑');
drawnText.length = 0;
pump(1);
assert.ok(drawnText.indexOf('已暂停') >= 0, '没画暂停面板');
assert.ok(drawnText.indexOf('继续游戏') >= 0, '暂停面板缺继续按钮');
assert.ok(drawnText.indexOf('重新开始') >= 0, '暂停面板缺重开按钮');
assert.ok(drawnText.indexOf('退出游戏') >= 0, '暂停面板缺退出按钮');
assert.ok(drawnText.indexOf('音效') >= 0, '暂停面板缺音效开关');
ok('手机端暂停', '点 HUD 暂停钮 → 暂停（60 帧分数不动）· 面板含继续/重开/音效/退出');

// 音效开关
const soundBefore = T.Audio8.isEnabled();
app.act('sound');
assert.strictEqual(T.Audio8.isEnabled(), !soundBefore, '音效开关没生效');
assert.strictEqual(storeData['ts_sound'], T.Audio8.isEnabled() ? '1' : '0', '音效开关没落盘');
app.act('sound');

// 继续 / 退出
app.act('resume');
assert.strictEqual(app.isPaused(), false, '继续失败');
app.act('exit');
assert.strictEqual(exitCalls, 1, '退出没有调 wx.exitMiniProgram');
ok('暂停面板动作', '音效开关落盘 / 继续 / 退出游戏已接 wx.exitMiniProgram');

// ---------------------------------------------------------
// 6. 生命周期
// ---------------------------------------------------------
assert.ok(H.hide.length >= 1 && H.show.length >= 1, '生命周期未绑定');
H.hide[0]();
assert.strictEqual(app.isPaused(), true, '切后台未暂停');
assert.strictEqual(app.loop.running, false, '切后台未停循环');
const scoreAtHide = app.game.score;
pump(30);
assert.strictEqual(app.game.score, scoreAtHide, '暂停期间游戏还在跑');
H.show[0]({});
assert.strictEqual(app.loop.running, true, '回前台未恢复循环');
pump(30);
ok('生命周期', 'onHide→暂停+停循环 → onShow 恢复');

// ---------------------------------------------------------
// 7. 存档走 wx Storage（不是 localStorage）
// ---------------------------------------------------------
storeData['ts_high'] = '4321';
const g2 = new T.GameScene(app.view, app.input);
assert.strictEqual(g2.high, 4321, '没有从 wx.getStorageSync 读档');
g2.score = 9999;
g2.player.bombs = 0;                 // 确保走的是真·死亡结算
for (let i = 0; i < 5 && !g2.dead; i++) {
  g2.player.inv = 0;
  g2.hurtPlayer();
}
assert.strictEqual(g2.dead, true, '五次受击还没死');
assert.strictEqual(storeData['ts_high'], '9999', '没有写到 wx.setStorageSync');
assert.strictEqual(g2.newRecord, true, '破纪录标记没打上');
ok('存档', 'wx.getStorageSync 读 4321 → 死亡后 setStorageSync 写 9999 · newRecord=true');

// ---------------------------------------------------------
// 8. 分享：卡片文案 + 离屏 canvas 战绩图
// ---------------------------------------------------------
const nCanvasBefore = canvases.length;
app.game.score = 12345;
app.game.grazeCount = 66;
app.act('share');
assert.strictEqual(canvases.length, nCanvasBefore + 1, '没有创建离屏 canvas');
assert.strictEqual(shareImgs.length, 1, '没有导出战绩图');
assert.strictEqual(shareImgs[0].w, 500, '战绩图尺寸不对: ' + shareImgs[0].w);
assert.strictEqual(shareNowCalls, 1, '没有主动拉起转发');
const card = H.shareApp[H.shareApp.length - 1]();
assert.ok(card.title.indexOf('12345') >= 0, '分享文案没带分数: ' + card.title);
assert.ok(card.imageUrl.indexOf('wxfile://') === 0, '分享卡片没挂战绩图');
ok('分享卡片', '离屏 canvas 出图 500x' + shareImgs[0].h + ' · 文案「' + card.title + '」');

// ---------------------------------------------------------
// 9. 平台能力：常亮 / GC / 震动 / 转发
// ---------------------------------------------------------
assert.ok(keepOnCalls >= 1, '没有设置屏幕常亮');
assert.ok(gcCalls >= 1, '关卡切换没有触发 triggerGC');
assert.ok(vibrates.length >= 1, '受伤/炸弹没有震动反馈');
assert.strictEqual(H.shareApp.length >= 1, true, '没有注册转发');
ok('平台能力', '常亮 x' + keepOnCalls + ' / triggerGC x' + gcCalls + ' / 震动 [' + vibrates.join(',') + ']');

// ---------------------------------------------------------
// 10. 窗口尺寸变化（折叠屏 / 旋转）
// ---------------------------------------------------------
assert.strictEqual(H.resize.length, 1, '没有监听 onWindowResize');
const hBefore = app.view.h;
sysInfo = {
  windowWidth: 430, windowHeight: 932, pixelRatio: 3, statusBarHeight: 59,
  safeArea: { top: 59, bottom: 898, left: 0, right: 430, width: 430, height: 839 }
};
H.resize[0]({});
assert.notStrictEqual(app.view.h.toFixed(1), hBefore.toFixed(1), 'resize 后 view.h 没变');
assert.ok(app.view.padTop > 0, 'resize 后安全区丢了');
pump(60);
ok('窗口自适应', 'view.h ' + hBefore.toFixed(0) + ' → ' + app.view.h.toFixed(0) + '（padTop ' + app.view.padTop.toFixed(0) + '）');

// ---------------------------------------------------------
// 11. 包体与配置
// ---------------------------------------------------------
const size = fs.statSync(gameFile).size;
assert.ok(size < 4 * 1024 * 1024, '超过微信主包 4MB');
const gj = JSON.parse(fs.readFileSync(path.join(distDir, 'game.json'), 'utf8'));
assert.strictEqual(gj.deviceOrientation, 'portrait');
const pj = JSON.parse(fs.readFileSync(path.join(distDir, 'project.config.json'), 'utf8'));
assert.strictEqual(pj.compileType, 'game');
ok('包体与配置', (size / 1024).toFixed(1) + ' KB = 主包 ' + (size / 1024 / 4096 * 100).toFixed(2) + '% / portrait / compileType=game');

// ---------------------------------------------------------
// 12. 轻点清屏（真机触摸链路：touchStart → touchEnd）
// ---------------------------------------------------------
// 复现真机时序：点「开始游戏」的那次触摸，抬起时画面已经切成战斗 HUD，
// 菜单按钮的命中区早被刷掉了 —— 判定必须在"按下"那一刻做，不能等抬手。
app.act('menu');
assert.strictEqual(app.getState(), 'menu', '回菜单失败');
const L2 = T.uiLayout(app.view);

app.game.loot.clear();
app.game.enemies.clear();
tap(375, view.h * 0.46);              // 菜单空处 = 开始游戏（与第 4 组同一位置）
assert.strictEqual(app.getState(), 'playing', '点开始没进战斗');
const bombsAtStart = app.game.player.bombs;
assert.ok(bombsAtStart > 0, '开局应有炸弹，否则这条测不出东西（实际 ' + bombsAtStart + '）');
pump(2);
assert.strictEqual(app.game.player.bombs, bombsAtStart, '点「开始」白放了一颗炸弹');

// 点屏幕空处 → 全屏清弹，正好扣一颗
const freeCss = toCss(225, 600);
const b1 = app.game.player.bombs;
app.game.loot.clear();
app.game.enemies.clear();
tap(freeCss.x, freeCss.y);
pump(2);
assert.strictEqual(app.game.player.bombs, b1 - 1,
  '点屏幕空处没清屏，炸弹 ' + b1 + ' → ' + app.game.player.bombs);

// 拖动不算轻点：清屏是"点一下"，不是"拖一下"
const b2 = app.game.player.bombs;
app.game.loot.clear();
app.game.enemies.clear();
const dragFrom = toCss(225, 600), dragTo = toCss(520, 950);
H.touchStart[0]({ touches: [{ clientX: dragFrom.x, clientY: dragFrom.y }] });
pump(1);
H.touchMove[0]({ touches: [{ clientX: dragTo.x, clientY: dragTo.y }] });
H.touchEnd[0]({ touches: [] });
pump(2);
assert.strictEqual(app.game.player.bombs, b2, '拖动操控不该顺手清屏');

// 点右下圆钮 → 只放按钮自己那一颗，不能变成两颗
const b3 = app.game.player.bombs;
app.game.loot.clear();
app.game.enemies.clear();
const bombCss = toCss(L2.bomb.x, L2.bomb.y);
tap(bombCss.x, bombCss.y);
pump(2);
assert.strictEqual(app.game.player.bombs, b3 - 1,
  '点圆钮应只放一颗，实际放了 ' + (b3 - app.game.player.bombs) + ' 颗');

// 暂不住手时系统打断（来电 / 通知栏下拉）不能放雷
const b4 = app.game.player.bombs;
app.game.loot.clear();
app.game.enemies.clear();
H.touchStart[0]({ touches: [{ clientX: freeCss.x, clientY: freeCss.y }] });
pump(1);
H.touchCancel[0]({});
pump(2);
assert.strictEqual(app.game.player.bombs, b4, 'onTouchCancel 不该放炸弹');

// 没雷时轻点空处：安全，且不能有副作用
app.game.player.bombs = 0;
app.game.loot.clear();
app.game.enemies.clear();
tap(freeCss.x, freeCss.y);
pump(2);
assert.strictEqual(app.game.player.bombs, 0, '没雷也放出去了？');
assert.strictEqual(app.game.dead, false, '没雷轻点不该把游戏搞崩');
ok('轻点清屏', '点空处扣一颗 · 拖动不算 · 圆钮只放一颗 · 点「开始」不白放 · 取消与没雷时都安全');

console.log('\nWX ALL PASS（' + pass + ' 组）');
