// 生成 web 发布副本 → dist/web/
//
// 为什么单独出一份、不直接发布项目根目录：
//   1) 根目录的 dist/wx/ 是微信小游戏产物（含 project.config.json / app.json），
//      发布预检会把它当成小程序直接拒绝。
//   2) tools/ docs/ 这些开发文件没必要跟着上传。
//   3) 根 index.html 是"调试壳"，文案是给开发者看的，发布版要换成面向玩家的。
//
// src/ 和根 index.html 不会被改动 —— 发布版是独立副本，两者可以各说各话。
// 用法：node tools/build-web.js
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');
const OUT = path.join(R, 'dist', 'web');

// index.html 按依赖顺序引的就是这 10 个（wx-entry.js 是小游戏入口，web 用不到）
const JS = ['config.js', 'platform.js', 'core.js', 'audio.js', 'draw.js',
  'entities.js', 'game.js', 'ui.js', 'boot.js', 'main.js'];

fs.mkdirSync(path.join(OUT, 'src'), { recursive: true });

// ---- index.html：换掉给开发者看的文案 ----
let html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
const before = html;
html = html.replace('<title>雷霆战机 · 调试壳</title>', '<title>雷霆战机 · 弹幕突击</title>');
html = html.replace(
  /<div id="hint">[^<]*<\/div>/,
  '<div id="hint">拖动屏幕操控 · 自动开火 · 轻点屏幕空处放炸弹全屏清弹</div>'
);
if (html === before) { console.log('!! index.html 文案没替换成功，检查锚点'); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---- 拷 src ----
let total = fs.statSync(path.join(OUT, 'index.html')).size;
for (const f of JS) {
  const src = path.join(R, 'src', f);
  if (!fs.existsSync(src)) { console.log('!! 缺文件 ' + f); process.exit(1); }
  fs.copyFileSync(src, path.join(OUT, 'src', f));
  total += fs.statSync(path.join(OUT, 'src', f)).size;
}

// ---- 自检 ----
let bad = 0;
// 1) index.html 引用的每个 js 都要真的在副本里
const refs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const r of refs) {
  const ok = fs.existsSync(path.join(OUT, r));
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'MISS ') + r);
}
// 2) src 里不能有多余文件 —— 尤其是 wx-entry.js，混进去说明目录被污染
const stray = fs.readdirSync(path.join(OUT, 'src')).filter((f) => JS.indexOf(f) < 0);
if (stray.length) { bad++; console.log('!! src 里有多余文件：' + stray.join(', ')); }

console.log('\ndist/web 就绪：' + (1 + JS.length) + ' 个文件，' + (total / 1024).toFixed(1) + ' KB');
console.log(bad ? '自检未通过（' + bad + ' 项）' : '自检通过');
process.exit(bad ? 1 : 0);
