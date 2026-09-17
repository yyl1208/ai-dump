// 稳定性检查：同一个测试套件反复跑，揪出"偶发红灯"的断言。
//
// 背景：本项目踩过一次 —— 弹幕墙缺口断言只在缺口落在屏幕内部时才成立，
// 缺口贴边时误报，约 17% 概率随机失败。随机失败比不测更糟：它会训练人忽略红灯，
// 也会让变异测试出现假阳性（改坏的代码"被抓到"了，其实是别的断言在随机翻车）。
//
// 用法：
//   node tools/stability.js                # smoke.js 跑 20 次
//   node tools/stability.js 50             # smoke.js 跑 50 次
//   node tools/stability.js 10 smoke-wx.js # 小游戏端跑 10 次（会自动重新构建）
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const R = path.join(__dirname, '..');
const NODE = process.execPath;

// node 的 assert：消息短时内联成 "AssertionError [ERR_ASSERTION]: xxx"，
// 消息长时会先打 "throw new AssertionError(obj)"，正文在随后几行 —— 两种都要能取到。
function pickAssertionMsg(out) {
  const lines = out.split(/\r?\n/);
  const i = lines.findIndex((l) => l.indexOf('AssertionError') >= 0);
  if (i < 0) return '(没有断言错误，可能是崩溃)';
  const inline = lines[i].match(/AssertionError \[ERR_ASSERTION\]:\s*(.+)/);
  if (inline) return inline[1].trim();
  for (let k = i + 1; k < Math.min(i + 9, lines.length); k++) {
    if (/[\u4e00-\u9fa5]/.test(lines[k]) && !/^\s*(code|operator|actual|expected|diff):/.test(lines[k])) {
      return lines[k].trim();
    }
  }
  return '(断言失败，但没抓到可读消息)';
}

const times = Number(process.argv[2]) || 20;
const suites = process.argv.slice(3);
if (suites.length === 0) suites.push('smoke.js');

function build() {
  const r = cp.spawnSync(NODE, [path.join(R, 'tools/build-wx.js')], { encoding: 'utf8' });
  if (r.status !== 0) { console.log('构建失败，先修构建：\n' + r.stdout + r.stderr); process.exit(1); }
}

let totalBad = 0;
for (const suite of suites) {
  // smoke-wx 跑的是构建产物，不重新构建就会测到旧代码
  if (suite === 'smoke-wx.js') build();

  const fails = {};
  let bad = 0;
  for (let i = 0; i < times; i++) {
    const r = cp.spawnSync(NODE, [path.join(R, 'tools', suite)], { encoding: 'utf8' });
    if (r.status === 0) continue;
    bad++;
    const m = pickAssertionMsg((r.stdout || '') + (r.stderr || ''));
    fails[m] = (fails[m] || 0) + 1;
  }
  totalBad += bad;
  console.log(suite + ' 跑 ' + times + ' 次 → 失败 ' + bad + ' 次');
  const keys = Object.keys(fails).sort((a, b) => fails[b] - fails[a]);
  for (const k of keys) {
    console.log('  x' + fails[k] + '  ' + k);
  }
  if (bad === 0) console.log('  稳定');
}

console.log(totalBad === 0 ? '\n全部稳定，没有随机失败的断言。' : '\n共 ' + totalBad + ' 次随机失败 —— 上面的断言需要修。');
process.exit(totalBad === 0 ? 0 : 1);
