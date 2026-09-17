// 变异测试：故意把关键逻辑改坏，确认断言真的能抓到。
//
// 为什么需要：断言可能"空过"—— 看着在测，实际无论代码怎么写都通过。
// 判断一条断言有没有用，唯一可靠的办法是把它该拦的 bug 亲手造出来。
// 本项目已有过两次真实教训：
//   1) 轻点清屏的判定写在"抬手"时，点「开始游戏」会白放一颗炸弹（smoke-wx 第 12 组抓到）
//   2) 弹幕墙缺口断言在缺口贴边时随机误报（见 tools/stability.js）
//
// 用法：node tools/mutate.js
// 每个变异都在 try/finally 里还原，跑完源文件必须与备份逐字节一致。
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
  if (i < 0) return '(没有断言错误——这条断言是空过的！)';
  const inline = lines[i].match(/AssertionError \[ERR_ASSERTION\]:\s*(.+)/);
  if (inline) return inline[1].trim();
  for (let k = i + 1; k < Math.min(i + 9, lines.length); k++) {
    if (/[\u4e00-\u9fa5]/.test(lines[k]) && !/^\s*(code|operator|actual|expected|diff):/.test(lines[k])) {
      return lines[k].trim();
    }
  }
  return '(断言失败，但没抓到可读消息)';
}

const MUTATIONS = [
  {
    file: 'src/platform.js', suite: 'smoke.js',
    name: '位移容差改成逐轴判定（斜着拖动会被误判成轻点）',
    from: 'return dx * dx + dy * dy <= lim * lim;',
    to: 'return Math.abs(dx) <= lim && Math.abs(dy) <= lim;'
  },
  {
    file: 'src/platform.js', suite: 'smoke.js',
    name: '拖动不做永久标记（拖远再拖回原位就白送一颗雷）',
    from: `      if (!state.tapMoved && !tapApi.withinSlop(p.x - state.tapX, p.y - state.tapY)) {
        state.tapMoved = true;
      }`,
    to: '      if (false) { state.tapMoved = true; }'
  },
  {
    file: 'src/platform.js', suite: 'smoke.js',
    name: '忘记排除多指（第二根手指会重置轻点基准）',
    from: '      if (!wasActive) {',
    to: '      if (true) {'
  },
  {
    file: 'src/platform.js', suite: 'smoke.js',
    name: '触摸被系统打断时当正常抬手（来电也会放雷）',
    from: '      if (cancelled) return;',
    to: '      if (false) return;'
  },
  {
    file: 'src/platform.js', suite: 'smoke.js',
    name: '完全忽略 tapGuard 钩子（点按钮会重复放雷）',
    from: 'state.tapMoved = !!(state.tapGuard && state.tapGuard(p.x, p.y));',
    to: 'state.tapMoved = false;'
  },
  {
    file: 'src/platform.js', suite: 'smoke.js',
    name: 'tapGuard 改到抬手才问（画面已切页，点「开始」白放炸弹）',
    from: '      state.tap = { x: state.tapX, y: state.tapY };',
    to: `      if (state.tapGuard) state.tapGuard(state.tapX, state.tapY);
      state.tap = { x: state.tapX, y: state.tapY };`
  },
  {
    file: 'src/platform.js', suite: 'smoke-wx.js',
    name: '真机链路：点「开始游戏」白放一颗炸弹（回归 bug）',
    from: 'state.tapMoved = !!(state.tapGuard && state.tapGuard(p.x, p.y));',
    to: 'state.tapMoved = false;'
  },
  {
    file: 'src/config.js', suite: 'smoke.js',
    name: '弹幕墙缺口缩到 1 格（玩家钻不过去）',
    from: 'bossWall:     { count: 20, gap: 3, speed: 300, r: 16 }',
    to: 'bossWall:     { count: 20, gap: 1, speed: 300, r: 16 }'
  }
];

let caught = 0, restored = true;
for (const m of MUTATIONS) {
  const target = path.join(R, m.file);
  const backup = fs.readFileSync(target);
  const src = backup.toString('utf8');
  if (src.split(m.from).length - 1 !== 1) {
    console.log('SKIP   [锚点没命中] ' + m.name);
    continue;
  }
  try {
    fs.writeFileSync(target, src.split(m.from).join(m.to));
    // 小游戏端跑构建产物，变异后必须重新构建
    if (m.suite === 'smoke-wx.js') cp.spawnSync(NODE, [path.join(R, 'tools/build-wx.js')], { encoding: 'utf8' });
    const r = cp.spawnSync(NODE, [path.join(R, 'tools', m.suite)], { encoding: 'utf8' });
    const msg = pickAssertionMsg((r.stdout || '') + (r.stderr || ''));
    if (r.status !== 0) caught++;
    console.log((r.status !== 0 ? 'CAUGHT ' : 'MISSED ') + '[' + m.suite + '] ' + m.name);
    console.log('        ' + msg.slice(0, 110));
  } finally {
    fs.writeFileSync(target, backup);
    if (!fs.readFileSync(target).equals(backup)) restored = false;
  }
}

// 还原后重建一次，别把变异版本留在 dist 里
cp.spawnSync(NODE, [path.join(R, 'tools/build-wx.js')], { encoding: 'utf8' });

console.log('\n变异 ' + MUTATIONS.length + ' 个，被断言抓到 ' + caught + ' 个');
console.log(restored ? '所有源文件已逐字节还原' : '!! 有源文件没还原干净，请检查 !!');
process.exit(caught === MUTATIONS.length && restored ? 0 : 1);
