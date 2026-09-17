const UI = {
  // 每帧 render 前清空，面板绘制时往里注册可点区域。
  // 手机没有键盘，所有「继续/重开/退出/分享」都必须落在这一套命中系统里。
  hits: [],

  resetHits() { UI.hits.length = 0; },

  hitTest(x, y) {
    for (let i = UI.hits.length - 1; i >= 0; i--) {
      const h = UI.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.act;
    }
    return null;
  },

  dim(ctx, view, a) {
    ctx.fillStyle = 'rgba(4,6,16,' + a + ')';
    ctx.fillRect(0, 0, view.w, view.h);
  },

  // o: { x, y（中心）, w, h, label, sub, kind: 'primary'|'ghost', act }
  btn(ctx, o) {
    const x = o.x - o.w / 2, y = o.y - o.h / 2;
    const primary = o.kind === 'primary';
    ctx.fillStyle = primary ? 'rgba(127,231,255,0.16)' : 'rgba(255,255,255,0.06)';
    roundRect(ctx, x, y, o.w, o.h, 12);
    ctx.fill();
    ctx.strokeStyle = primary ? 'rgba(127,231,255,0.75)' : 'rgba(160,175,215,0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, o.w, o.h, 12);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (o.sub) {
      ctx.fillStyle = primary ? '#eaf2ff' : '#c3cbe6';
      ctx.font = '500 30px ' + FONT;
      ctx.fillText(o.label, o.x, o.y - 13);
      ctx.fillStyle = CONFIG.colors.dim;
      ctx.font = '400 20px ' + FONT;
      ctx.fillText(o.sub, o.x, o.y + 18);
    } else {
      ctx.fillStyle = primary ? '#eaf2ff' : '#c3cbe6';
      ctx.font = '500 30px ' + FONT;
      ctx.fillText(o.label, o.x, o.y + 1);
    }

    UI.hits.push({ x: x, y: y, w: o.w, h: o.h, act: o.act });
  },

  // 运营规范 2.6.2：游戏开始前必须全文登载《健康游戏忠告》
  //        2.6.1：忠告之后要标明著作权人 / 出版服务单位 / 批准文号 / 出版物号
  notice(ctx, view, left) {
    UI.dim(ctx, view, 0.9);
    const cx = view.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#eaf2ff';
    ctx.font = '500 44px ' + FONT;
    ctx.fillText('健康游戏忠告', cx, view.h * 0.22);

    const lines = CONFIG.healthNotice.split('。').filter(Boolean).map(function (s) { return s + '。'; });
    ctx.fillStyle = '#c3cbe6';
    ctx.font = '400 26px ' + FONT;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, view.h * 0.22 + 72 + i * 46);
    }

    const c = CONFIG.meta.copyright;
    ctx.fillStyle = '#8a93b8';
    ctx.font = '400 20px ' + FONT;
    ctx.fillText('著作权人：' + c.owner + ' · 出版服务单位：' + c.publisher, cx, view.h * 0.50);
    ctx.fillText('批准文号：' + c.approval + ' · 出版物号：' + c.isbn, cx, view.h * 0.50 + 32);

    UI.btn(ctx, { x: cx, y: view.h * 0.60, w: 240, h: 68, label: '版号信息', act: 'info' });

    ctx.fillStyle = 'rgba(127,231,255,' + (0.5 + Math.sin(Date.now() / 380) * 0.3).toFixed(3) + ')';
    ctx.font = '500 28px ' + FONT;
    ctx.fillText('本游戏适合 12 岁以上玩家 · ' + left + ' 秒后自动进入', cx, view.h * 0.70);

    UI.btn(ctx, {
      x: cx, y: view.h * 0.78, w: 300, h: 84,
      label: '我知道了', kind: 'primary', act: 'notice:ok'
    });
  },

  menu(ctx, view, g) {
    UI.dim(ctx, view, 0.55);
    const cx = view.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#eaf2ff';
    ctx.font = '500 72px ' + FONT;
    ctx.fillText(CONFIG.meta.name, cx, view.h * 0.26);

    ctx.fillStyle = CONFIG.colors.dim;
    ctx.font = '400 24px ' + FONT;
    ctx.fillText(CONFIG.meta.enName, cx, view.h * 0.26 + 54);

    if (g && g.high > 0) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '400 26px ' + FONT;
      ctx.fillText('最高分 ' + g.high, cx, view.h * 0.26 + 100);
    }

    UI.btn(ctx, {
      x: cx, y: view.h * 0.46, w: 340, h: 100,
      label: '开始游戏', sub: '拖动操控 · 自动开火', kind: 'primary', act: 'start'
    });
    UI.btn(ctx, { x: cx - 90, y: view.h * 0.56, w: 160, h: 72, label: '玩法', act: 'help' });
    UI.btn(ctx, { x: cx + 90, y: view.h * 0.56, w: 160, h: 72, label: '信息', act: 'info' });

    // 忠告缩略常驻（全文在启动页已登载过）
    ctx.fillStyle = 'rgba(112,122,163,0.8)';
    ctx.font = '400 19px ' + FONT;
    ctx.fillText('抵制不良游戏 拒绝盗版游戏 注意自我保护 谨防受骗上当', cx, view.h - 130);
    ctx.fillText('适度游戏益脑 沉迷游戏伤身 合理安排时间 享受健康生活', cx, view.h - 100);
  },

  help(ctx, view) {
    UI.dim(ctx, view, 0.86);
    const cx = view.w / 2;
    const x0 = 90;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '500 44px ' + FONT;
    ctx.fillText('玩法说明', cx, view.h * 0.14);

    const rows = [
      ['拖动', '手指按住屏幕任意处，战机跟随移动'],
      ['开火', '全自动，不用点，专心躲弹'],
      ['判定', '机身上的红点才是判定，比看起来小得多'],
      ['清屏', '轻点屏幕空处即可全屏清弹，不用去够右下角'],
      ['炸弹', '每次清屏消耗一颗；残血时按钮会闪红，救不救自己定']
    ];
    ctx.font = '400 25px ' + FONT;
    for (let i = 0; i < rows.length; i++) {
      const y = view.h * 0.24 + i * 50;
      ctx.textAlign = 'left';
      ctx.fillStyle = CONFIG.colors.player;
      ctx.font = '500 25px ' + FONT;
      ctx.fillText(rows[i][0], x0, y);
      ctx.fillStyle = '#c3cbe6';
      ctx.font = '400 24px ' + FONT;
      ctx.fillText(rows[i][1], x0 + 80, y);
    }

    const y1 = view.h * 0.24 + rows.length * 50 + 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.colors.dim;
    ctx.font = '400 24px ' + FONT;
    ctx.fillText('道具', x0, y1);
    const P = CONFIG.powerups;
    const keys = ['power', 'weapon', 'option', 'armor', 'bomb', 'engine', 'heal'];
    ctx.font = '400 22px ' + FONT;
    for (let i = 0; i < keys.length; i++) {
      const p = P[keys[i]];
      const col = i % 2, row = Math.floor(i / 2);
      const px = x0 + 80 + col * 290;
      const py = y1 + 40 + row * 40;
      ctx.fillStyle = p.color;
      ctx.fillText(p.label + ' ' + p.name, px, py);
    }

    UI.btn(ctx, { x: cx, y: view.h - 150, w: 240, h: 84, label: '返回', act: 'back' });
  },

  // 运营规范 2.6.1：著作权人 / 出版服务单位 / 批准文号 / 出版物号
  info(ctx, view) {
    UI.dim(ctx, view, 0.9);
    const cx = view.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#eaf2ff';
    ctx.font = '500 44px ' + FONT;
    ctx.fillText('游戏信息', cx, view.h * 0.20);

    const c = CONFIG.meta.copyright;
    const rows = [
      ['游戏名称', CONFIG.meta.name],
      ['版本', 'v' + CONFIG.meta.version],
      ['著作权人', c.owner],
      ['出版服务单位', c.publisher],
      ['批准文号', c.approval],
      ['出版物号', c.isbn]
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = view.h * 0.29 + i * 46;
      ctx.textAlign = 'right';
      ctx.fillStyle = CONFIG.colors.dim;
      ctx.font = '400 23px ' + FONT;
      ctx.fillText(rows[i][0], cx - 20, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c3cbe6';
      ctx.fillText(rows[i][1], cx + 20, y);
    }

    const lines = CONFIG.healthNotice.split('。').filter(Boolean).map(function (s) { return s + '。'; });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8a93b8';
    ctx.font = '400 20px ' + FONT;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, view.h * 0.72 + i * 32);
    }

    UI.btn(ctx, { x: cx, y: view.h - 150, w: 240, h: 84, label: '返回', act: 'back' });
  },

  over(ctx, view, g) {
    UI.dim(ctx, view, 0.66);
    const cx = view.w / 2;
    const record = g.score >= g.high && g.score > 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ff6b7a';
    ctx.font = '500 58px ' + FONT;
    ctx.fillText('任务失败', cx, view.h * 0.26);

    ctx.fillStyle = '#eaf2ff';
    ctx.font = '500 72px ' + FONT;
    ctx.fillText(String(g.score), cx, view.h * 0.34);

    if (record) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '500 30px ' + FONT;
      ctx.fillText('新纪录！', cx, view.h * 0.34 + 56);
    } else {
      ctx.fillStyle = CONFIG.colors.dim;
      ctx.font = '400 24px ' + FONT;
      ctx.fillText('最高分 ' + g.high, cx, view.h * 0.34 + 56);
    }

    ctx.fillStyle = CONFIG.colors.dim;
    ctx.font = '400 23px ' + FONT;
    ctx.fillText('抵达第 ' + (g.stageIndex + 1) + ' 关 · 击破 ' + g.kills + ' 架', cx, view.h * 0.34 + 96);

    UI.btn(ctx, {
      x: cx, y: view.h * 0.50, w: 340, h: 100,
      label: '再来一局', kind: 'primary', act: 'start'
    });
    // 指南 3.5：分享点宜少宜精，一次游戏过程不超过 1 个 —— 只在破纪录时出现
    if (record) {
      UI.btn(ctx, { x: cx, y: view.h * 0.585, w: 340, h: 84, label: '分享战绩', sub: '让好友来挑战', act: 'share' });
    }
    UI.btn(ctx, { x: cx, y: view.h * 0.665, w: 240, h: 76, label: '返回主菜单', act: 'menu' });
  },

  pause(ctx, view) {
    UI.dim(ctx, view, 0.72);
    const cx = view.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#eaf2ff';
    ctx.font = '500 46px ' + FONT;
    ctx.fillText('已暂停', cx, view.h * 0.30);

    UI.btn(ctx, { x: cx, y: view.h * 0.42, w: 340, h: 96, label: '继续游戏', kind: 'primary', act: 'resume' });
    UI.btn(ctx, { x: cx, y: view.h * 0.51, w: 340, h: 88, label: '重新开始', act: 'restart' });
    UI.btn(ctx, {
      x: cx, y: view.h * 0.60, w: 340, h: 88,
      label: '音效', sub: Audio8.isEnabled() ? '当前：开' : '当前：关', act: 'sound'
    });
    // web 没有退出概念，只有小游戏提供
    if (Platform.isMini) {
      UI.btn(ctx, { x: cx, y: view.h * 0.69, w: 340, h: 88, label: '退出游戏', act: 'exit' });
    }
  },

  // HUD 上的暂停按钮：手机没有 P 键
  pauseButton(ctx, view) {
    const b = uiLayout(view).pause;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 6.2832);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,215,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#dfe7ff';
    const w = 6, h = 15, gap = 5;
    ctx.fillRect(b.x - gap - w, b.y - h / 2, w, h);
    ctx.fillRect(b.x + gap, b.y - h / 2, w, h);
    UI.hits.push({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2, act: 'pause' });
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = UI;
