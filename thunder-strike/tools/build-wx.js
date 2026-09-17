// 微信 / 抖音小游戏构建：把 src 按依赖顺序拼成单文件 game.js。
// 小游戏没有 DOM 也没有 <script> 标签，只能 require/单文件，所以这里做拼接而非模块化。
// 用法： node tools/build-wx.js   → 产出 dist/wx/
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist', 'wx');

// 依赖顺序：CONFIG → Platform → core → Draw → entities → GameScene → UI → boot → 入口
const ORDER = [
  'config.js',
  'platform.js',
  'core.js',
  'audio.js',
  'draw.js',
  'entities.js',
  'game.js',
  'ui.js',
  'boot.js',
  'wx-entry.js'
];

// Node 用的 module.exports 守卫在单文件 bundle 里没意义，裁掉
function stripExport(code) {
  const i = code.indexOf('\nif (typeof module');
  return i >= 0 ? code.slice(0, i) : code;
}

let out = '';
const banner = [
  '/* 雷霆战机 · Thunder Strike —— 微信小游戏构建产物 */',
  '/* 由 tools/build-wx.js 自动生成，请改 src/ 下的源码后重新构建 */'
].join('\n');
out += banner + '\n';

let rawTotal = 0;
for (const f of ORDER) {
  const p = path.join(srcDir, f);
  if (!fs.existsSync(p)) throw new Error('缺少源文件: ' + f);
  let code = fs.readFileSync(p, 'utf8');
  rawTotal += Buffer.byteLength(code, 'utf8');
  if (f !== 'wx-entry.js') code = stripExport(code);
  out += '\n;//========== src/' + f + ' ==========\n' + code.trim() + '\n';
}
out += '\nmodule.exports = {};\n';

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'game.js'), out, 'utf8');

const gameJson = {
  deviceOrientation: 'portrait',
  showStatusBar: false,
  networkTimeout: {
    request: 5000,
    connectSocket: 5000,
    uploadFile: 5000,
    downloadFile: 5000
  }
};
fs.writeFileSync(path.join(outDir, 'game.json'), JSON.stringify(gameJson, null, 2) + '\n', 'utf8');

const projectConfig = {
  description: '雷霆战机 · 弹幕突击',
  appid: 'touristappid',
  projectname: 'thunder-strike',
  miniprogramRoot: './',
  compileType: 'game',
  libVersion: '3.5.0',
  setting: {
    es6: true,
    enhance: false,
    minified: true,
    urlCheck: false,
    postcss: false,
    coverView: false,
    packNpmManually: false,
    packNpmRelationList: [],
    ignoreDevUnusedFiles: false,
    checkInvalidKey: true,
    babelSetting: { ignore: [], disablePlugins: [], outputPath: '' }
  },
  condition: {}
};
fs.writeFileSync(path.join(outDir, 'project.config.json'), JSON.stringify(projectConfig, null, 2) + '\n', 'utf8');

const built = Buffer.byteLength(out, 'utf8');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('构建完成 → dist/wx/');
for (const f of ORDER) {
  const s = fs.statSync(path.join(srcDir, f)).size;
  console.log('  + src/' + f.padEnd(14) + kb(s));
}
console.log('  = game.js        ' + kb(built));
console.log('  源文件合计 ' + kb(rawTotal) + '（未压缩，开发者工具上传时会再压）');
console.log('  占微信 4MB 主包: ' + (built / 1024 / 4096 * 100).toFixed(2) + '%');
console.log('');
console.log('下一步：用微信开发者工具「导入项目」打开 dist/wx 目录，');
console.log('        appid 目前是 touristappid（游客），发布前改成你自己的小游戏 appid。');
