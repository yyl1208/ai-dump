const Platform = (function () {
  const g = typeof GameGlobal !== 'undefined' ? GameGlobal
    : typeof window !== 'undefined' ? window
    : typeof globalThis !== 'undefined' ? globalThis : {};

  // 环境识别：wx / tt / web
  let env = 'web';
  if (typeof wx !== 'undefined' && wx.createCanvas) env = 'wx';
  else if (typeof tt !== 'undefined' && tt.createCanvas) env = 'tt';
  const api = env === 'wx' ? wx : env === 'tt' ? tt : null;
  const isMini = !!api;

  const keyHandlers = [];
  const showHandlers = [];
  const hideHandlers = [];

  function now() {
    return (g.performance && g.performance.now) ? g.performance.now() : Date.now();
  }

  function raf(cb) {
    return g.requestAnimationFrame ? g.requestAnimationFrame(cb) : setTimeout(cb, 16);
  }

  // 窗口信息：优先 getWindowInfo（基础库 2.20+），老版本回落到 getSystemInfoSync
  function windowInfo() {
    if (!api) return {};
    try {
      if (api.getWindowInfo) return api.getWindowInfo() || {};
      if (api.getSystemInfoSync) return api.getSystemInfoSync() || {};
    } catch (e) {}
    return {};
  }

  // 小游戏 canvas 字体：system-ui / -apple-system 在部分安卓机上解析失败，
  // 统一用 sans-serif 落到系统默认中文字体，避免整屏文字变方块或不渲染
  function font() {
    return isMini ? 'sans-serif'
      : 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  }

  const store = {
    get(k, d) {
      try {
        if (api && api.getStorageSync) {
          const v = api.getStorageSync(k);
          return v === '' || v === null || v === undefined ? d : v;
        }
        if (g.localStorage) {
          const v = g.localStorage.getItem(k);
          return v === null ? d : v;
        }
      } catch (e) {}
      return d;
    },
    set(k, v) {
      try {
        if (api && api.setStorageSync) return api.setStorageSync(k, v);
        if (g.localStorage) return g.localStorage.setItem(k, v);
      } catch (e) {}
    }
  };

  // 量算窗口：逻辑尺寸 + dpr + 安全区（设计坐标）
  function measure(designW) {
    const cssW0 = 375, cssH0 = 667;
    const info = windowInfo();
    const cssW = info.windowWidth || cssW0;
    const cssH = info.windowHeight || cssH0;
    // 小游戏上 dpr 封顶 2：3x 屏全分辨率画满屏弹幕会掉帧
    const dpr = Math.min(info.pixelRatio || 2, 2);

    // 安全区 → 设计坐标（刘海 / Home 指示条会盖住 HUD）
    const unit = designW / cssW;
    const sa = info.safeArea;
    let padTop, padBottom;
    if (sa && typeof sa.top === 'number') {
      padTop = Math.max(0, sa.top) * unit;
      padBottom = Math.max(0, cssH - (sa.bottom || cssH)) * unit;
    } else {
      padTop = (info.statusBarHeight || 0) * unit;
      padBottom = 0;
    }
    padTop = Math.min(padTop, 160);
    padBottom = Math.min(padBottom, 120);
    if (!isFinite(padTop)) padTop = 0;
    if (!isFinite(padBottom)) padBottom = 0;
    return { cssW: cssW, cssH: cssH, dpr: dpr, padTop: padTop, padBottom: padBottom };
  }

  function createSurface(designW, designH) {
    let canvas, m;

    if (api) {
      canvas = api.createCanvas();
      m = measure(designW);
      canvas.width = Math.floor(m.cssW * m.dpr);
      canvas.height = Math.floor(m.cssH * m.dpr);
      keepScreenOn();
    } else {
      canvas = document.getElementById('game');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'game';
        document.body.appendChild(canvas);
      }
      // web 调试壳：按 9:16 等比缩放，居中留黑边
      const cssH = Math.min(g.innerHeight, Math.round(g.innerWidth * designH / designW));
      const cssW = Math.min(g.innerWidth, Math.round(cssH * designW / designH));
      const dpr = Math.min(g.devicePixelRatio || 1, 2);
      m = { cssW: cssW, cssH: cssH, dpr: dpr, padTop: 0, padBottom: 0 };
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.style.display = 'block';
    }

    const scale = canvas.width / designW;
    const ctx = canvas.getContext('2d');
    const view = {
      w: designW,
      h: canvas.height / scale,
      padTop: m.padTop,
      padBottom: m.padBottom
    };

    const surface = {
      canvas: canvas, ctx: ctx, view: view,
      cssW: m.cssW, cssH: m.cssH, env: env, dpr: scale
    };
    if (api) bindResize(surface, designW, designH);
    return surface;
  }

  // 小游戏：折叠屏 / 旋转导致窗口变化时重建画布尺寸（view 是引用，游戏内自动跟随）
  function bindResize(surface, designW, designH) {
    try {
      if (api.onWindowResize) api.onWindowResize(function () { applyResize(surface, designW, designH); });
    } catch (e) {}
  }

  function applyResize(surface, designW, designH) {
    if (!api) return surface;
    const m = measure(designW);
    surface.cssW = m.cssW;
    surface.cssH = m.cssH;
    surface.canvas.width = Math.floor(m.cssW * m.dpr);
    surface.canvas.height = Math.floor(m.cssH * m.dpr);
    surface.dpr = surface.canvas.width / designW;
    surface.view.h = surface.canvas.height / surface.dpr;
    surface.view.padTop = m.padTop;
    surface.view.padBottom = m.padBottom;
    return surface;
  }

  // 轻点判定抽成纯函数：真实触摸事件在 Node 里很难模拟，抽出来才能写测试。
  // withinSlop: 相对按下点的位移是否还在容差内（按直线距离算，不是逐轴算）
  // qualifies : 最终判定（中途没拖出去 + 按下时间够短）
  const tapApi = {
    withinSlop: function (dx, dy) {
      const lim = CONFIG.input.tapMaxMove;
      return dx * dx + dy * dy <= lim * lim;
    },
    qualifies: function (moved, ms) {
      return !moved && ms <= CONFIG.input.tapMaxMs;
    }
  };

  function bindInput(surface, state) {
    state.keys = state.keys || {};
    // 轻点检测状态：按下点、按下时刻、是否已判定为拖拽、以及待消费的轻点
    state.tapX = state.tapX || 0;
    state.tapY = state.tapY || 0;
    state.tapT = state.tapT || 0;
    state.tapMoved = false;
    state.tap = null;

    const toDesign = function (cx, cy) {
      if (api) {
        return {
          x: cx / surface.cssW * surface.view.w,
          y: cy / surface.cssH * surface.view.h
        };
      }
      const r = surface.canvas.getBoundingClientRect();
      return {
        x: (cx - r.left) / (r.width || 1) * surface.view.w,
        y: (cy - r.top) / (r.height || 1) * surface.view.h
      };
    };

    const down = function (cx, cy) {
      const p = toDesign(cx, cy);
      const wasActive = state.active;   // 多指：第二根手指按下不能重置轻点基准
      state.active = true;
      state.pressed = true;
      state.x = p.x;
      state.y = p.y;
      state.downX = p.x;
      state.downY = p.y;
      if (!wasActive) {
        state.tapX = p.x;
        state.tapY = p.y;
        state.tapT = Date.now();
        // tapGuard 返回 true = 这次手势不算轻点（按在按钮上、或不在战斗页）。
        // 必须在按下的这一刻定下来：点「开始游戏」抬手时画面已经切成战斗 HUD，
        // 菜单按钮的命中区早被刷掉了 —— 等抬手再判，开局就白放一颗炸弹。
        state.tapMoved = !!(state.tapGuard && state.tapGuard(p.x, p.y));
      }
    };
    const move = function (cx, cy) {
      if (!state.active) return;
      const p = toDesign(cx, cy);
      state.x = p.x;
      state.y = p.y;
      // 一旦拖出容差就永久标记：拖远了再拖回原点，也不能算轻点
      if (!state.tapMoved && !tapApi.withinSlop(p.x - state.tapX, p.y - state.tapY)) {
        state.tapMoved = true;
      }
    };
    const up = function (cancelled) {
      state.active = false;
      // 触摸被系统打断（来电 / 通知栏下拉）不算玩家主动点击
      if (cancelled) return;
      if (!tapApi.qualifies(state.tapMoved, Date.now() - state.tapT)) return;
      state.tap = { x: state.tapX, y: state.tapY };
    };

    if (api) {
      const pick = function (t) {
        return {
          x: t.clientX !== undefined && t.clientX !== null ? t.clientX : t.x,
          y: t.clientY !== undefined && t.clientY !== null ? t.clientY : t.y
        };
      };
      api.onTouchStart(function (e) {
        const t = (e.touches && e.touches[0]) || e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const p = pick(t);
        down(p.x, p.y);
      });
      api.onTouchMove(function (e) {
        const t = (e.touches && e.touches[0]) || e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const p = pick(t);
        move(p.x, p.y);
      });
      api.onTouchEnd(function (e) {
        // 多指：还有手指按着就不松手控，避免抬起一根导致断触
        if (e.touches && e.touches.length > 0) return;
        up();
      });
      api.onTouchCancel(function () { up(true); });
    } else {
      const c = surface.canvas;
      c.addEventListener('pointerdown', function (e) {
        c.setPointerCapture && c.setPointerCapture(e.pointerId);
        down(e.clientX, e.clientY);
        e.preventDefault();
      });
      c.addEventListener('pointermove', function (e) { move(e.clientX, e.clientY); });
      c.addEventListener('pointerup', function () { up(); });
      c.addEventListener('pointercancel', function () { up(true); });
      c.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      g.addEventListener('keydown', function (e) {
        state.keys[e.code] = true;
        for (let i = 0; i < keyHandlers.length; i++) keyHandlers[i](e.code, e);
        if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
      });
      g.addEventListener('keyup', function (e) { state.keys[e.code] = false; });
    }
  }

  // 生命周期：切后台自动暂停（小游戏切后台 rAF 会停，回来 dt 会爆炸）
  function onShow(fn) {
    if (fn) showHandlers.push(fn);
    if (api && api.onShow) { try { api.onShow(function (r) { fireShow(r); }); } catch (e) {} }
    else if (g.document && g.document.addEventListener) {
      g.document.addEventListener('visibilitychange', function () {
        if (!g.document.hidden) fireShow({});
      });
    }
  }
  function onHide(fn) {
    if (fn) hideHandlers.push(fn);
    if (api && api.onHide) { try { api.onHide(function () { fireHide(); }); } catch (e) {} }
    else if (g.document && g.document.addEventListener) {
      g.document.addEventListener('visibilitychange', function () {
        if (g.document.hidden) fireHide();
      });
    }
  }
  function fireShow(r) { for (let i = 0; i < showHandlers.length; i++) showHandlers[i](r || {}); }
  function fireHide() { for (let i = 0; i < hideHandlers.length; i++) hideHandlers[i](); }

  function onKey(fn) { keyHandlers.push(fn); }

  // 触觉反馈：微信/抖音有，web 忽略
  function vibrate(heavy) {
    if (!api) return;
    try {
      if (api.vibrateShort) api.vibrateShort({ type: heavy ? 'heavy' : 'medium' });
      else if (api.vibrateShort) api.vibrateShort();
    } catch (e) {}
  }

  function keepScreenOn() {
    if (!api || !api.setKeepScreenOn) return;
    try { api.setKeepScreenOn({ keepScreenOn: true }); } catch (e) {}
  }

  // 关卡切换时手动催一次 GC，避免长时间游玩内存缓慢爬升
  function gc() {
    if (!api || !api.triggerGC) return;
    try { api.triggerGC(); } catch (e) {}
  }

  // 右上角转发：小游戏是 wx.onShareAppMessage，抖音是 tt.onShareAppMessage。
  // 每次结算都重新注册一次，保证转发卡片上的分数是最新的。
  function share(title, imageUrl) {
    if (!api) return;
    try {
      if (api.showShareMenu) api.showShareMenu({ menus: ['shareAppMessage'] });
      if (api.onShareAppMessage) {
        api.onShareAppMessage(function () {
          return { title: title || '雷霆战机 · 弹幕突击', imageUrl: imageUrl || '', query: '' };
        });
      }
      if (api.onShareTimeline) {
        // 抖音/部分平台支持分享到 timeline，失败不影响主流程
        api.onShareTimeline(function () { return { title: title || '雷霆战机 · 弹幕突击' }; });
      }
    } catch (e) {}
  }

  // 主动拉起转发面板（结算页「分享战绩」按钮）
  function shareNow(title, imageUrl) {
    if (!api) return false;
    share(title, imageUrl);
    try {
      if (api.shareAppMessage) {
        api.shareAppMessage({ title: title, imageUrl: imageUrl || '', query: '' });
        return true;
      }
    } catch (e) {}
    return false;
  }

  // 离屏 canvas 画战绩图 → 临时文件，作为分享卡片的 imageUrl。
  // 零素材原则：卡片也是代码画的，不占包体。
  function makeShareImage(w, h, drawFn) {
    if (!api || !api.createCanvas) return '';
    try {
      const c = api.createCanvas();
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d');
      drawFn(cx, w, h);
      const opt = { x: 0, y: 0, width: w, height: h, destWidth: w, destHeight: h };
      if (c.toTempFilePathSync) return c.toTempFilePathSync(opt) || '';
      if (api.canvasToTempFilePathSync) {
        opt.canvas = c;
        return api.canvasToTempFilePathSync(opt) || '';
      }
    } catch (e) {}
    return '';
  }

  // 退出小游戏（暂停面板用；web 无此能力）
  function exit() {
    if (!api || !api.exitMiniProgram) return false;
    try { api.exitMiniProgram(); return true; } catch (e) {}
    return false;
  }

  // 每帧开头重置变换：设计坐标 → 画布物理像素。
  // 画布尺寸是按窗口算出来的（比如 780x1388），绘制用的却是设计坐标（750x1334），
  // 不做这层缩放的话，右边和底部会差出几十像素永远清不到，
  // 表现就是"画面边上留着上一帧的弹道"。
  // 用 setTransform 而不是 scale：它顺带把上一帧残留的位移/缩放也清干净。
  function beginFrame(surface) {
    const s = surface.dpr;
    surface.ctx.setTransform(s, 0, 0, s, 0, 0);
  }

  return {
    env: env,
    isMini: isMini,
    api: api,
    now: now,
    raf: raf,
    font: font,
    store: store,
    createSurface: createSurface,
    beginFrame: beginFrame,
    bindInput: bindInput,
    tapApi: tapApi,
    onKey: onKey,
    onShow: onShow,
    onHide: onHide,
    applyResize: applyResize,
    vibrate: vibrate,
    keepScreenOn: keepScreenOn,
    gc: gc,
    share: share,
    shareNow: shareNow,
    makeShareImage: makeShareImage,
    exit: exit
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Platform;
