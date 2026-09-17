class GameScene {
  constructor(view, input) {
    this.view = view;
    this.input = input;
    this.player = new Player(view);
    this.enemies = new Pool(64, function () { return new Enemy(); });
    this.boss = new Boss();
    this.bullets = new Pool(CONFIG.bullet.pool, makeBullet);
    this.parts = new Pool(CONFIG.particle.pool, makeParticle);
    this.loot = new Pool(CONFIG.powerupPool, function () { return new PowerUp(); });
    this.grid = new SpatialGrid(110);
    this.stars = Draw.initStars(view);
    this.high = Number(Platform.store.get('ts_high', 0)) || 0;
    this.near = [];
    this.reset();
  }

  reset() {
    this.score = 0;
    this.dead = false;
    this.newRecord = false;
    this.time = 0;
    this.frame = 0;
    this.banner = '';
    this.bannerSub = '';
    this.bannerT = 0;
    this.shake = 0;
    this.flashT = 0;
    this.kills = 0;
    this.pity = 0;
    this.dropPoints = 0;
    this.autoBombUsed = 0;
    this.bombRing = 0;
    this.bossFxT = 0;
    this.bossFxNext = 0;
    this.bossRect = null;
    this.enemies.clear();
    this.bullets.clear();
    this.parts.clear();
    this.loot.clear();
    this.boss.active = false;
    this.bossAlive = false;
    this.player.reset();
    this.startStage(0);
  }

  startStage(i) {
    const stages = CONFIG.stages;
    const s = stages[i % stages.length];
    this.stageIndex = i;
    this.loops = Math.floor(i / stages.length);
    this.sc = this.scales();
    this.mult = this.sc.speed;      // 兼容旧字段：分裂产物弹速等
    this.stage = s;
    this.waveIndex = 0;
    this.phase = 'wave';
    this.interludeT = 0;
    this.player.lastStand = false;   // 装甲免死每关重置一次
    // 擦弹删掉后，炸弹靠每关补给 + B 道具掉落
    this.player.bombs = Math.min(this.player.maxBombs(), this.player.bombs + CONFIG.bombSupply.perStage);
    this.startWave(0);
    this.setBanner(s.name, '第 ' + (i + 1) + ' 关', 2200);
    this.tut('drag', '拖动屏幕操控', '按住屏幕任意处移动战机 · 自动开火', 3000);
    Platform.gc();      // 关卡交界处催一次 GC，长时间游玩内存不爬升
  }

  // 难度系数：每关都涨，四条曲线各封各的顶。
  // hp 是指数且不封顶 —— 后期杂兵会肉到清不动，这就是收尾的那道墙。
  scales() {
    const D = CONFIG.difficulty;
    const s = this.stageIndex || 0;
    return {
      hp: D.hpBase * Math.pow(D.hpGrow, s),
      speed: Math.min(D.speedMax, 1 + D.speedGrow * s),
      fire: Math.max(D.fireMin, 1 - D.fireGrow * s),
      count: Math.min(D.countMax, 1 + D.countGrow * s),
      vol: Math.min(D.volMax, 1 + D.volGrow * s),
      boss: 1 + D.bossGrow * s
    };
  }

  startWave(i) {
    const w = this.stage.waves[i];
    const k = this.sc ? this.sc.count : 1;
    this.waveT = 0;
    this.waveDuration = w.duration;
    this.groups = w.groups.map(function (g) {
      return {
        type: g.type,
        count: Math.max(1, Math.round(g.count * k)),
        interval: g.interval,
        delay: g.delay,
        spawned: 0
      };
    });

    // 循环加压：只靠 vol/count 的话，每轮回一次「边境空域」（怪几乎不开火）
    // 密度就会断崖式掉回新手村，难度变成锯齿而不是斜坡。
    // 这里按已轮回圈数追加射手小组，把三张关卡表的密度差抹平。
    const R = CONFIG.reinforce;
    if (R && this.loops >= R.startLoop) {
      // 加压轮数从"加压起始圈"起算，而不是直接取总圈数 —— 否则改 startLoop
      // 会顺带改掉单圈的加压强度，两个参数就耦合在一起了（改 A 影响 B）。
      const stacks = Math.min(this.loops - R.startLoop + 1, R.stackMax || 2);
      for (let r = 0; r < stacks; r++) {
        for (let q = 0; q < R.groups.length; q++) {
          const g = R.groups[q];
          this.groups.push({
            type: g.type,
            count: Math.max(1, Math.round(g.count * k)),
            interval: Math.max(120, g.interval - r * 60),
            delay: g.delay + r * 500,
            spawned: 0
          });
        }
      }
    }

    // 每波空投的补给舱：不吃难度系数，是密集弹幕里唯一的确定性补给来源
    const SP = CONFIG.supply;
    if (SP && SP.perWave > 0) {
      for (let q = 0; q < SP.perWave; q++) {
        this.groups.push({
          type: 'supply',
          count: 1,                     // 刻意不乘 sc.count：补给量不该跟着难度膨胀
          interval: 1200,
          delay: SP.firstDelay + q * SP.gap,
          spawned: 0
        });
      }
    }
  }

  setBanner(text, sub, ms) {
    this.banner = text;
    this.bannerSub = sub || '';
    this.bannerT = ms;
  }

  // 设计指南 2.5：渐进式引导，边玩边学，且每条只出现一次
  tut(key, text, sub, ms) {
    const KEYS = ['drag', 'loot'];
    const i = KEYS.indexOf(key);
    if (i < 0) return;
    let mask = Number(Platform.store.get('ts_tut', 0)) || 0;
    if (mask & (1 << i)) return;
    mask |= (1 << i);
    Platform.store.set('ts_tut', String(mask));
    this.setBanner(text, sub, ms);
  }

  spawnBullet(x, y, vx, vy, owner, opt) {
    const b = this.bullets.acquire();
    if (!b) return null;
    opt = opt || {};
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.owner = owner;
    b.dmg = opt.dmg || 1;
    b.grazed = false;
    b.kind = opt.kind || 'normal';
    b.t = 0;
    b.maxT = opt.maxT || 0;
    b.pierce = opt.pierce || 0;
    b.amp = opt.amp || 0;
    b.phase = opt.phase || 0;
    b.turn = opt.turn || 0;
    b.shards = opt.shards || 0;
    b.baseX = x;

    if (owner === 1) {
      b.w = opt.w || 11;
      b.h = opt.h || 11;
      // 敌弹是圆形判定：r 同时决定受击圈、擦弹圈和绘制大小
      b.r = opt.r || CONFIG.bullet.r;
    } else {
      b.w = opt.w || CONFIG.bullet.w;
      b.h = opt.h || CONFIG.bullet.h;
      b.r = Math.max(b.w, b.h) / 2;
    }

    // 加速弹：初速打折扣，之后逐帧加速
    if (b.kind === 'accel') {
      const a = CONFIG.bulletKinds.accel;
      b.vx *= a.from;
      b.vy *= a.from;
    }
    return b;
  }

  // 子弹到期：爆裂弹炸成碎片，其余直接回收
  detonate(b) {
    const view = this.view;
    if (b.kind === 'boom') {
      const k = CONFIG.bulletKinds.boom;
      const n = b.shards || k.shards;
      const r = b.owner === 1 ? Math.max(5, b.r - 3) : 6;
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.2832;
        this.spawnBullet(b.x, b.y, Math.cos(a) * k.speed, Math.sin(a) * k.speed, b.owner,
          { w: r * 2, h: r * 2, r: r, dmg: 1 });
      }
      this.boom(b.x, b.y, '#ffd166', 14);
      this.shake = Math.max(this.shake, 6);
    }
    b.active = false;
  }

  updateBullets(dt) {
    const view = this.view;
    const player = this.player;
    const ms = dt / 1000;

    this.bullets.forEach((b) => {
      b.t += dt;

      if (b.kind === 'accel') {
        const a = CONFIG.bulletKinds.accel;
        const k = 1 + (a.rate - 1) * ms;
        b.vx *= k;
        b.vy *= k;
      }

      // 追踪弹：按 turn 上限朝目标缓慢转向（玩家弹打敌人、敌弹打玩家）
      if (b.kind === 'homing') {
        let tx = player.x, ty = player.y;
        if (b.owner === 0) {
          const tgt = this.nearestEnemy(b.x, b.y);
          if (tgt) { tx = tgt.x; ty = tgt.y; }
          else { ty = -200; tx = b.x; }
        }
        const dx = tx - b.x, dy = ty - b.y;
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(dy, dx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= 6.2832;
        while (diff < -Math.PI) diff += 6.2832;
        const maxTurn = (b.turn || CONFIG.bulletKinds.homing.turn) * ms;
        const na = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }

      b.x += b.vx * ms;
      b.y += b.vy * ms;

      // 摆动弹：以出生 x 为中心做正弦横摆
      if (b.kind === 'wave') {
        b.x = b.baseX + Math.sin((b.t / CONFIG.bulletKinds.wave.period) * 6.2832 + b.phase) * b.amp;
      }

      const out = b.y < -80 || b.y > view.h + 80 || b.x < -80 || b.x > view.w + 80;
      if (out) { b.active = false; return; }
      if (b.maxT > 0 && b.t >= b.maxT) this.detonate(b);
    });
  }

  nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    if (this.bossAlive && this.boss.active && this.boss.entered) {
      best = this.boss;
      bd = (this.boss.x - x) * (this.boss.x - x) + (this.boss.y - y) * (this.boss.y - y);
    }
    const arr = this.enemies.items;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (!e.active) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  boom(x, y, color, count) {
    const rgb = hexToRgb(color || '#ffcc66');
    for (let i = 0; i < count; i++) {
      const p = this.parts.acquire();
      if (!p) return;
      const a = Math.random() * 6.2832;
      const sp = 60 + Math.random() * 260;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.max = CONFIG.particle.life * (0.5 + Math.random() * 0.7);
      p.life = p.max;
      p.s = 3 + Math.random() * 5;
      p.r = rgb.r; p.g = rgb.g; p.b = rgb.b;
    }
  }

  tickBg(dt) {
    this._bgDt = dt;
  }

  update(dt) {
    const view = this.view;
    this.time += dt;
    this.frame++;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.05);
    if (this.flashT > 0) this.flashT -= dt;

    this.player.update(dt, this.input);

    const self = this;
    const spawnShot = function (x, y, vx, vy, owner, opt) {
      self.spawnBullet(x, y, vx, vy, owner, opt);
    };

    this.player.fireCd -= dt;
    if (this.player.fireCd <= 0) {
      this.player.fireCd = this.player.fireInterval();
      this.player.emitShots(spawnShot);
      Audio8.play('shoot');
    }
    if (this.player.options > 0) this.player.emitOptions(spawnShot);

    this.advance(dt);

    const fire = function (x, y, vx, vy, owner) {
      self.spawnBullet(x, y, vx, vy, owner);
    };

    this.enemies.forEach(function (e) {
      e.update(dt, self.player, view, fire);
    });

    if (this.bossAlive) {
      this.boss.update(dt, this.player, view, fire);
    }

    if (this.bossFxT > 0) {
      this.bossFxT -= dt;
      this.bossFxNext -= dt;
      if (this.bossFxNext <= 0 && this.bossRect) {
        this.bossFxNext = 110;
        const r = this.bossRect;
        this.boom(
          r.x + (Math.random() - 0.5) * r.w,
          r.y + (Math.random() - 0.5) * r.h,
          Math.random() < 0.5 ? '#ffd166' : '#ff8b5e',
          16
        );
        this.shake = 12;
      }
    }

    this.loot.forEach(function (u) {
      u.update(dt, view, self.player);
    });

    this.updateBullets(dt);

    this.parts.forEach(function (p) {
      p.life -= dt;
      if (p.life <= 0) { p.active = false; return; }
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vx *= 0.94;
      p.vy *= 0.94;
    });

    this.collide();
    this.pickups();

    // Boss 可能被子弹、炸弹或碰撞击杀，统一在这里收口
    if (this.bossAlive && !this.boss.active) {
      this.bossAlive = false;
      this.onBossDown();
    }
  }

  // 统一的敌机出场入口：负责给出合适的出生 x，波次与分裂都走这里
  spawnEnemy(type, x, y) {
    const e = this.enemies.acquire();
    if (!e) return null;
    const cfg = CONFIG.enemies[type];
    const half = cfg.w / 2 + 10;
    let sx = x;
    if (sx === undefined || sx === null) {
      sx = half + Math.random() * (this.view.w - half * 2);
      // 停驻型敌机贴边出，方便它们在固定高度架枪
      if (cfg.move === 'hover' || cfg.move === 'snipe') {
        sx = Math.random() < 0.5 ? half : this.view.w - half;
      }
    }
    e.spawn(type, sx, y === undefined ? -cfg.h : y, this.sc, this.player);
    e.host = this;
    return e;
  }

  advance(dt) {
    if (this.phase === 'wave') {
      this.waveT += dt;
      for (let i = 0; i < this.groups.length; i++) {
        const g = this.groups[i];
        if (g.spawned >= g.count) continue;
        if (this.waveT >= g.delay + g.spawned * g.interval) {
          this.spawnEnemy(g.type);
          g.spawned++;
        }
      }
      if (this.waveT >= this.waveDuration) {
        if (this.waveIndex + 1 < this.stage.waves.length) {
          this.waveIndex++;
          this.startWave(this.waveIndex);
        } else {
          this.spawnBoss();
        }
      }
      return;
    }

    if (this.phase === 'interlude') {
      this.interludeT -= dt;
      if (this.interludeT <= 0) this.startStage(this.stageIndex + 1);
    }
  }

  spawnBoss() {
    const key = this.stage.boss;
    this.phase = 'boss';
    this.bossAlive = true;
    this.boss.spawnBoss(key, this.view, this.sc.boss, this.sc.speed);
    this.setBanner('WARNING', CONFIG.bosses[key].name, 2400);
    this.shake = 10;
  }

  onBossDown() {
    const b = this.boss;
    this.score += b.score;
    this.bossRect = { x: b.x, y: b.y, w: b.w, h: b.h };
    this.bossFxT = 1300;
    this.bossFxNext = 0;
    this.shake = 26;
    this.phase = 'interlude';
    this.interludeT = CONFIG.interlude;
    this.setBanner('STAGE CLEAR', '', 2200);

    const n = b.cfg.drops;
    for (let i = 0; i < n; i++) {
      this.dropLoot(b.x + (i - (n - 1) / 2) * 92, b.y, 40);   // Boss 按最高威胁给成长道具
    }
    this.bullets.forEach(function (bu) { bu.active = false; });
  }

  lootKeys() {
    return ['power', 'weapon', 'option', 'armor', 'bomb', 'engine', 'heal'];
  }

  // 掉落权重会按「死的什么怪」和「玩家当前状态」修正：
  //   打硬怪更容易出强成长（W/O），打杂兵更容易出回血，满血/满级则把权重让给 P
  lootWeights(threat) {
    const d = CONFIG.drop;
    const p = this.player;
    const w = {};
    const keys = this.lootKeys();
    for (let i = 0; i < keys.length; i++) w[keys[i]] = CONFIG.powerups[keys[i]].weight;

    if (threat >= d.eliteThreat) {
      w.weapon *= d.eliteBoost;
      w.option *= d.eliteBoost;
    }
    if (threat < d.weakThreat) w.heal *= 1.5;
    if (p.hp >= CONFIG.player.maxHp) w.heal = 0;

    // 已满级的路线把权重转给火力，避免掉出来没用
    if (p.powerLevel >= CONFIG.progression.power.max && p.overdrive >= CONFIG.overdrive.max) w.power = 0;
    if (p.options >= CONFIG.progression.option.max) w.option = 0;
    if (p.armorLv >= CONFIG.progression.armor.max) w.armor = 0;
    if (p.arsenalLv >= CONFIG.progression.arsenal.max) w.bomb = 0;
    if (p.engineLv >= CONFIG.progression.engine.max) w.engine = 0;

    let spare = 0;
    for (let i = 0; i < keys.length; i++) if (w[keys[i]] === 0) spare += CONFIG.powerups[keys[i]].weight;
    w.power += spare;

    return w;
  }

  dropLoot(x, y, threat) {
    const w = this.lootWeights(threat || 0);
    const keys = this.lootKeys();
    let total = 0;
    for (let i = 0; i < keys.length; i++) total += w[keys[i]];

    let type = keys[keys.length - 1];
    const rolled = Math.random() * total;
    let acc = 0;
    for (let i = 0; i < keys.length; i++) {
      acc += w[keys[i]];
      if (rolled <= acc) { type = keys[i]; break; }
    }
    if (type === 'heal' && this.player.hp >= CONFIG.player.maxHp) type = 'power';

    const u = this.loot.acquire();
    if (u) u.spawn(type, x, y);
    return type;
  }

  // 敌机威胁值：用于掉落点数与权重修正
  threatOf(e) {
    const c = e.cfg;
    if (!c) return 5;
    const fireTerm = c.fire ? (1000 / c.fire) * (c.ring || c.trail || c.burst || c.arc || c.pellets || 1) * 0.8 : 0;
    const special = (c.split ? 8 : 0) + (c.spawnIv ? 6 : 0) + (c.move === 'hover' ? 2 : 0) +
      (c.attack === 'charge' ? 3 : 0) + (c.attack === 'lob' ? 3 : 0) + (c.trait ? 3 : 0);
    // hp 权重 0.12：血量这次整体涨了 3~15 倍，沿用 0.5 会让掉落点数爆掉
    return c.hp * 0.12 + fireTerm + c.speed / 100 + special;
  }

  // 击杀后按威胁值累积掉落点数，满 100 必掉；另有小概率惊喜掉落
  tryDrop(x, y, e) {
    const d = CONFIG.drop;
    const threat = e && e.cfg ? this.threatOf(e) : 5;
    this.dropPoints = (this.dropPoints || 0) + threat;
    this.pity += 1;

    const forced = this.pity >= d.pityMax || this.dropPoints >= d.pointsPerDrop;
    const lucky = Math.random() < d.luckyChance;
    if (!forced && !lucky) return null;

    this.pity = 0;
    if (this.dropPoints >= d.pointsPerDrop) this.dropPoints -= d.pointsPerDrop;
    return this.dropLoot(x, y, threat);
  }

  pickups() {
    const p = this.player;
    const r = this.player.pickRadius();   // 引擎线放大拾取范围
    this.loot.forEach((u) => {
      const dx = u.x - p.x;
      const dy = u.y - p.y;
      if (dx * dx + dy * dy <= r * r) {
        u.active = false;
        this.applyLoot(u.type);
      }
    });
  }

  // 6 条强化路线 + 回血。每条满级后转化为分数或其它资源。
  applyLoot(type) {
    const cfg = CONFIG.powerups[type];
    const p = this.player;
    const P = CONFIG.progression;
    let gained = false;
    let note = '';

    if (type === 'power') {
      if (p.powerLevel < P.power.max) {
        p.powerLevel += 1;
        gained = true;
        note = '火力 Lv' + p.powerLevel;
      } else {
        const r = p.addOverdrive();
        if (r === 'fired') {
          gained = true;
          note = '超频启动';
          this.overdriveFx();
        } else if (r) {
          gained = true;
          note = '超频 ' + p.overdrive + '%';
        } else {
          this.score += cfg.extra;
        }
      }
    } else if (type === 'weapon') {
      // 切枪 + 给新枪加专精：换枪是投资不是惩罚
      p.nextWeapon();
      const up = p.addMastery(p.weapon);
      gained = true;
      const m = p.mastery[p.weapon];
      note = CONFIG.weapons[p.weapon].name + (up ? ' 专精 M' + m : ' 专精已满');
      if (!up) this.score += cfg.extra;
    } else if (type === 'option') {
      if (p.options < P.option.max) {
        p.options += 1;
        gained = true;
        note = '僚机 x' + p.options;
      } else {
        this.score += cfg.extra;
      }
    } else if (type === 'armor') {
      if (p.armorLv < P.armor.max) {
        p.armorLv += 1;
        gained = true;
        note = '装甲 Lv' + p.armorLv;
        p.shieldT = Math.max(p.shieldT, p.shieldDuration());
      } else {
        p.shieldT = Math.max(p.shieldT, 3000);
        this.score += cfg.extra;
      }
    } else if (type === 'bomb') {
      if (p.arsenalLv < P.arsenal.max) {
        p.arsenalLv += 1;
        p.bombs = p.maxBombs();
        gained = true;
        note = '军火 Lv' + p.arsenalLv;
      } else {
        this.score += cfg.extra;
      }
    } else if (type === 'engine') {
      if (p.engineLv < P.engine.max) {
        p.engineLv += 1;
        gained = true;
        note = '引擎 Lv' + p.engineLv;
      } else {
        this.score += cfg.extra * 2;   // 引擎满级：拾取范围已经很大，折算成分数
      }
    } else {
      if (p.hp < CONFIG.player.maxHp) { p.hp += 1; gained = true; note = '回血'; }
      else this.score += cfg.extra;
    }

    if (note) this.setBanner(note, CONFIG.powerups[type].label + ' 强化', 1100);
    this.boom(p.x, p.y, cfg.color, gained ? 14 : 8);
    Audio8.play(gained ? 'power' : 'pickup');
    this.tut('loot', '吃到道具了', 'P 火力 · W 换枪 · O 僚机 · A 装甲 · B 炸弹 · E 引擎 · H 回血', 3000);
    return gained;
  }

  // 超频启动：清屏 + 无敌 + 冲击波
  overdriveFx() {
    const p = this.player;
    this.flashT = CONFIG.bomb.flash;
    this.shake = 16;
    this.bullets.forEach(function (b) { if (b.owner === 1) b.active = false; });
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * 6.2832;
      const pt = this.parts.acquire();
      if (!pt) break;
      pt.x = p.x; pt.y = p.y;
      pt.vx = Math.cos(a) * 520;
      pt.vy = Math.sin(a) * 520;
      pt.max = 400; pt.life = 400; pt.s = 5;
      pt.r = 255; pt.g = 255; pt.b = 200;
    }
  }

  collide() {
    const grid = this.grid;
    const near = this.near;
    grid.clear();
    // 刚分裂出来的小飞机有短暂保护期，不进碰撞网格
    this.enemies.forEach(function (e) { if (e.fresh <= 0) grid.insert(e); });
    if (this.boss.active && this.boss.entered) grid.insert(this.boss);

    this.bullets.forEach((b) => {
      if (b.owner !== 0) return;
      grid.query(b.x, b.y, 40, near);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (!e.active) continue;
        if (e.isBoss && !e.entered) continue;
        if (aabb(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)) {
          // 穿透弹：命中不消失，扣穿透次数；爆裂弹：命中即炸
          if (b.kind === 'laser' && b.pierce > 0) {
            // 同一敌人每帧最多吃一发激光，避免穿过期间被逐帧重复计伤
            if (e._laserFrame === this.frame) continue;
            e._laserFrame = this.frame;
            b.pierce -= 1;
            if (e.damage(b.dmg)) this.onKill(e);
            if (b.pierce <= 0) b.active = false;
            continue;
          }
          if (b.kind === 'boom') this.detonate(b);
          else b.active = false;
          if (e.damage(b.dmg)) this.onKill(e);
          break;
        }
      }
    });

    const player = this.player;
    const pr = CONFIG.player.hitR;

    this.bullets.forEach((b) => {
      if (b.owner !== 1) return;
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      const d2 = dx * dx + dy * dy;

      // 受击圈 = 玩家判定半径 + 弹体半径，大玉就是更难躲。
      // 擦弹机制已移除：贴弹飞没有任何收益，玩法纯粹是躲。
      const hitR = pr + b.r;
      if (d2 <= hitR * hitR) {
        b.active = false;
        this.hurtPlayer();
      }
    });

    grid.query(player.x, player.y, 90, near);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.active) continue;
      if (e.isBoss) continue;
      // 补给舱是"奖励"不是"威胁"：它慢慢飘又大，撞上去扣血就成了陷阱。
      // 顺手打死才能拿道具，撞过去就是错过 —— 风险收益才是一致的。
      if (e.cfg && e.cfg.gift) continue;
      if (aabb(player.x - pr, player.y - pr, pr * 2, pr * 2, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)) {
        // 无敌（含刚放完炸弹）时不撞毁敌机，避免用无敌帧刷分
        if (this.hurtPlayer()) {
          e.damage(999);
          this.onKill(e);
          break;
        }
      }
    }
  }

  onKill(e) {
    this.kills += 1;
    this.score += e.score;
    this.boom(e.x, e.y, e.cfg.color, e.type === 'bomber' ? 26 : e.type === 'fighter' ? 16 : 10);
    Audio8.play('boom');
    if (e.isBoss) return;
    if (e.cfg && e.cfg.split) this.splitEnemy(e);
    // 补给舱必掉：不走掉落点数的概率判定，打死了就给
    if (e.cfg && e.cfg.gift) {
      const n = e.cfg.giftDrops || 1;
      for (let i = 0; i < n; i++) {
        this.dropLoot(e.x + (i - (n - 1) / 2) * 34, e.y, CONFIG.supply.dropThreat);
      }
      return;
    }
    this.tryDrop(e.x, e.y, e);
  }

  // 母舰被击毁后放出小型机，分裂产物不再二次分裂
  splitEnemy(e) {
    const n = e.cfg.split;
    const sub = e.cfg.splitType || 'fighter';
    const scfg = CONFIG.enemies[sub];
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * (scfg.w + 18);
      const x = Math.max(scfg.w / 2, Math.min(this.view.w - scfg.w / 2, e.x + off));
      const child = this.spawnEnemy(sub, x, e.y);
      if (!child) break;
      child.baseX = x;
      child.speed = scfg.speed * this.sc.speed * 1.15;
      child.fresh = 400;   // 出生短暂无敌，避免瞬爆
    }
  }

  hurtPlayer() {
    const p = this.player;
    if (p.isInv()) return false;

    // 护盾优先抵挡一发，不扣血
    if (p.shieldT > 0) {
      p.shieldT = 0;
      p.inv = 900;
      this.shake = 10;
      this.boom(p.x, p.y, '#8affc1', 20);
      return true;
    }

    // 残血自动保命：默认 0 次（CONFIG.player.autoBombSave），也就是不代劳。
    // 想保命请自己点按钮 —— 残血时按钮会闪红提醒。
    if (p.hp <= 1 && p.bombs > 0 && this.autoBombUsed < CONFIG.player.autoBombSave) {
      this.autoBombUsed += 1;
      this.useBomb();
      return true;
    }

    if (!p.hurt()) return false;
    this.shake = 14;
    this.boom(p.x, p.y, '#7fe7ff', 18);

    if (p.hp <= 0) {
      this.dead = true;
      this.boom(p.x, p.y, '#ffd166', 46);
      this.shake = 24;
      Platform.vibrate(true);
      if (this.score > this.high) {
        this.high = this.score;
        this.newRecord = true;
        Platform.store.set('ts_high', String(this.high));
      }
    } else {
      Platform.vibrate(false);
      Audio8.play('hurt');
    }
    return true;
  }

  useBomb() {
    const p = this.player;
    if (this.dead || p.bombs <= 0) return false;
    p.bombs -= 1;
    p.inv = Math.max(p.inv, CONFIG.bomb.invincible);
    this.flashT = CONFIG.bomb.flash;
    this.shake = 20;
    Platform.vibrate(true);
    Audio8.play('bomb');

    // 清屏：敌弹全灭，全场敌人受伤
    this.bullets.forEach(function (b) {
      if (b.owner === 1) b.active = false;
    });

    const self = this;
    const dmg = p.bombDamage();     // 军火线决定炸弹威力
    const hitList = [];
    this.enemies.forEach(function (e) { hitList.push(e); });
    if (this.boss.active) hitList.push(this.boss);
    for (let i = 0; i < hitList.length; i++) {
      const e = hitList[i];
      if (!e.active) continue;
      if (e.isBoss && !e.entered) continue;
      // 保护期内的分裂机不吃炸弹，否则母舰一炸分裂就没意义了
      if (e.fresh > 0) continue;
      // Boss 击杀统一交给 update() 末尾收口，避免这里和那里各结算一次
      if (e.damage(dmg)) self.onKill(e);
    }

    // 环形冲击粒子
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * 6.2832;
      const pt = this.parts.acquire();
      if (!pt) break;
      pt.x = p.x; pt.y = p.y;
      pt.vx = Math.cos(a) * 620;
      pt.vy = Math.sin(a) * 620;
      pt.max = 420;
      pt.life = 420;
      pt.s = 6;
      pt.r = 255; pt.g = 230; pt.b = 170;
    }
    return true;
  }

  isBombButton(x, y) {
    const b = uiLayout(this.view).bomb;
    const dx = x - b.x;
    const dy = y - b.y;
    return dx * dx + dy * dy <= b.r * b.r;
  }

  render(ctx, showWorld) {
    const view = this.view;
    const dt = this._bgDt || 16;

    // 背景兼作清屏，必须写在抖动的 translate 之前：
    // 一旦被位移带偏，震动那几帧画布边缘就盖不满，会露出上一帧的弹道残影。
    Draw.background(ctx, view, this.stars, dt);

    ctx.save();
    if (this.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    if (showWorld) {
      Draw.powerups(ctx, this.loot);
      Draw.bullets(ctx, this.bullets);
      this.enemies.forEach(function (e) { Draw.enemy(ctx, e); });
      if (this.boss.active) Draw.boss(ctx, this.boss);
      Draw.particles(ctx, this.parts);
      if (!this.dead) Draw.player(ctx, this.player);
    }
    ctx.restore();

    if (this.flashT > 0) Draw.bombFlash(ctx, view, this.flashT);

    if (showWorld) {
      Draw.hud(ctx, view, this);
      Draw.bombButton(ctx, this);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = GameScene;
