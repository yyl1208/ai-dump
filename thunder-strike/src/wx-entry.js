// 微信 / 抖音小游戏入口：只由 tools/build-wx.js 参与打包，web 不加载。
// 这里只放平台生命周期，游戏逻辑一律在 boot.js 里。
(function () {
  let app;
  try {
    app = boot();
  } catch (err) {
    // 真机黑屏最难查，启动失败时把堆栈弹出来，别只丢一条 console
    console.error('[thunder-strike] 启动失败', err);
    try {
      if (typeof wx !== 'undefined' && wx.showModal) {
        wx.showModal({
          title: '启动失败',
          content: String((err && err.stack) || err).slice(0, 500),
          showCancel: false
        });
      }
    } catch (e) {}
    throw err;
  }

  // 切后台：暂停 + 停循环。小游戏后台时 rAF 会被系统挂起，
  // 回来时 dt 会攒成一个巨大值，靠 loop.resume() 重新对齐时间基准。
  Platform.onHide(function () {
    if (app.getState() === 'playing') app.setPaused(true);
    app.loop.stop();
  });

  Platform.onShow(function () {
    app.loop.resume();
  });

  // 右上角转发
  Platform.share('雷霆战机 · 弹幕突击');

  if (typeof GameGlobal !== 'undefined') GameGlobal.__TS = app;
})();
