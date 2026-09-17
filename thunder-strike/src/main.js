// web 调试壳入口（微信端走 wx-entry.js，构建时不参与打包）
(function () {
  const app = boot();
  globalThis.__TS = app;   // 控制台里方便直接摸 game / view
})();
