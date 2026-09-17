// 启动器：web 与微信/抖音小游戏共用这一套循环与状态机。
// 平台差异全部落在 Platform 里，这里不出现任何 wx / document 字样。
//
// 状态： notice（健康忠告）→ menu → playing → over
//        help / info 是 menu 的子页；paused 是 playing 的独立开关
function boot(opts) {
  opts = opts || {};
  const surface = Platform.createSurface(CONFIG.design.width, CONFIG.design.height);
  const ctx = surface.ctx;
  const view = surface.view;

  const input = {
    active: false, x: view.w / 2, y: view.h - 300,
    downX: 0, downY: 0, pressed: false, keys: {},
    tap: null            // Platform.bindInput 写入的轻点，由主循环每帧消费
  };
  Platform.bindInput(surface, input);

  const game = new GameScene(view, input);

  // 运营规范 2.6.2：游戏开始前必须先登载《健康游戏忠告》，所以冷启动先进忠告页
  let state = 'notice';
  let backTo = 'menu';
  let paused = false;
  let noticeT = CONFIG.noticeDuration || 3000;
  let isRecord = false;

  // 轻点清屏的手势判定：按下那一刻就定下"这次算不算清屏"。
  // 按在按钮上不算（按钮自己有处理，否则一次点击会放两颗雷），不在战斗页也不算。
  input.tapGuard = function (x, y) {
    if (state !== 'playing' || paused) return true;
    return UI.hitTest(x, y) !== null ||
      game.isBombButton(x, y) ||
      hitCircle(x, y, uiLayout(view).pause);
  };

  function startGame() {
    game.reset();
    state = 'playing';
    paused = false;
    isRecord = false;
  }
  function setPaused(v) { paused = !!v; }

  Platform.onKey(function (code) {
    if (code === 'KeyP' && state === 'playing') paused = !paused;
    if (code === 'KeyR') startGame();
    if ((code === 'Space' || code === 'KeyJ') && state === 'playing' && !paused) game.useBomb();
    if (code === 'KeyQ' && state === 'playing' && !paused) {
      game.player.nextWeapon();
      game.setBanner(CONFIG.weapons[game.player.weapon].name, '手动换弹', 1100);
    }
    if (code === 'Escape') {
      if (state === 'help' || state === 'info') state = backTo;
      else if (state === 'playing') paused = true;
    }
  });

  // 分享卡片：把战绩画到离屏 canvas 上（零素材）
  function shareCard() {
    const score = game.score;
    const title = '我在' + CONFIG.meta.name + '打到 ' + score + ' 分，第 ' + (game.stageIndex + 1) + ' 关，来试试';
    const img = Platform.makeShareImage(500, 400, function (c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, CONFIG.colors.bg0);
      g.addColorStop(1, CONFIG.colors.bg1);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#eaf2ff';
      c.font = '500 40px ' + Platform.font();
      c.fillText(CONFIG.meta.name, w / 2, 88);
      c.fillStyle = '#ffd166';
      c.font = '500 92px ' + Platform.font();
      c.fillText(String(score), w / 2, 208);
      c.fillStyle = '#c3cbe6';
      c.font = '400 26px ' + Platform.font();
      c.fillText('抵达第 ' + (game.stageIndex + 1) + ' 关 · 击破 ' + game.kills + ' 架', w / 2, 276);
      c.fillStyle = '#707aa3';
      c.font = '400 22px ' + Platform.font();
      c.fillText('拖动操控 · 自动开火 · 轻点清屏', w / 2, 340);
    });
    return Platform.shareNow(title, img);
  }

  function onAction(act) {
    switch (act) {
      case 'notice:ok': state = 'menu'; break;
      case 'start': Audio8.play('ui'); startGame(); break;
      case 'help': Audio8.play('ui'); backTo = state; state = 'help'; break;
      case 'info': Audio8.play('ui'); backTo = state; state = 'info'; break;
      case 'back': Audio8.play('ui'); state = backTo; break;
      case 'menu': Audio8.play('ui'); state = 'menu'; paused = false; break;
      case 'pause': Audio8.play('ui'); paused = true; break;
      case 'resume': Audio8.play('ui'); paused = false; break;
      case 'restart': Audio8.play('ui'); startGame(); break;
      case 'sound':
        Audio8.setEnabled(!Audio8.isEnabled());
        if (Audio8.isEnabled()) Audio8.play('ui');
        break;
      case 'exit': Platform.exit(); break;
      case 'share': shareCard(); break;
    }
  }

  const loop = new GameLoop(function (dt) {
    if (state === 'notice') {
      noticeT -= dt;
      if (noticeT <= 0) state = 'menu';
    }

    // 按下点先过一遍 UI 按钮（用的是上一帧渲染时注册的命中区），命中就不走拖拽/开局
    let tapped = null;
    if (input.pressed) {
      input.pressed = false;
      tapped = UI.hitTest(input.downX, input.downY);
      if (tapped === null && (state === 'playing' && !paused) &&
          game.isBombButton(input.downX, input.downY)) {
        tapped = 'bomb';
      }
      if (tapped === null) {
        // 空白处：菜单/结算页点击＝开始
        if (state === 'menu') tapped = 'start';
        else if (state === 'over') tapped = 'start';
        else if (state === 'notice') tapped = 'notice:ok';
      }
      if (tapped) {
        if (tapped === 'bomb') game.useBomb();
        else onAction(tapped);
      }
      Audio8.unlock();      // iOS 需要用户手势之后音频才出声
    }

    // 轻点屏幕空处 = 放炸弹。拇指本来就在拖飞机，抬手点一下就能清屏，
    // 不用把手指挪到右下角。和圆钮完全等价，只是多一种触发方式。
    if (input.tap) {
      input.tap = null;     // 一次性：不管用不用得掉都先清掉，避免残留到下一帧
      // "这次手势算不算清屏"在按下那一刻已由 input.tapGuard 判过；这里只兜住
      // 按下时还在战斗、抬手之前刚好死了 / 暂停了这种情况
      if (state === 'playing' && !paused) game.useBomb();
    }

    UI.resetHits();         // 清掉上一帧的命中区，下面 render 会重新注册

    // 炸弹钮/暂停钮按下后不接管拖拽，避免把飞机拽到角落
    if (input.active && state === 'playing' && !paused) {
      if (game.isBombButton(input.downX, input.downY) ||
          hitCircle(input.downX, input.downY, uiLayout(view).pause)) {
        input.active = false;
      }
    }

    game.tickBg(dt);
    if (state === 'playing' && !paused) game.update(dt);

    const showWorld = state === 'playing' || state === 'over';
    game.render(ctx, showWorld);

    if (state === 'notice') UI.notice(ctx, view, Math.max(1, Math.ceil(noticeT / 1000)));
    else if (state === 'menu') UI.menu(ctx, view, game);
    else if (state === 'help') UI.help(ctx, view);
    else if (state === 'info') UI.info(ctx, view);
    else if (state === 'over') UI.over(ctx, view, game);
    else if (paused) UI.pause(ctx, view);
    else if (state === 'playing') UI.pauseButton(ctx, view);

    if (state === 'playing' && game.dead) {
      state = 'over';
      isRecord = !!game.newRecord;
      Audio8.play(isRecord ? 'record' : 'over');
      if (isRecord) Platform.vibrate(true);
    }
  });

  function hitCircle(x, y, c) {
    const dx = x - c.x, dy = y - c.y;
    return dx * dx + dy * dy <= c.r * c.r;
  }

  // 切后台顺手把音频挂起，回来再解锁
  Platform.onHide(function () { Audio8.suspend(); });

  if (opts.autoStart !== false) loop.start();

  return {
    surface: surface,
    ctx: ctx,
    view: view,
    input: input,
    game: game,
    loop: loop,
    startGame: startGame,
    setPaused: setPaused,
    isPaused: function () { return paused; },
    getState: function () { return state; },
    setState: function (s) { state = s; },
    act: onAction
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = boot;
