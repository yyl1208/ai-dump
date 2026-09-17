class Player {
  constructor(view) {
    this.view = view;
    this.reset();
  }

  reset() {
    const p = CONFIG.player;
    this.x = this.view.w / 2;
    this.y = this.view.h - 210;
    this.w = p.w;
    this.h = p.h;
    this.hp = p.maxHp;
    this.weapon = 'vulcan';
    this.powerLevel = 1;
    this.options = 0;
    this.optCd = 0;
    this.bombs = CONFIG.arsenalLevels[0];
    this.shieldT = 0;
    this.fireCd = 0;
    this.inv = 0;
    this.t = 0;

    // 6 条强化路线
    this.mastery = { vulcan: 0, laser: 0, wave: 0, spread: 0 };
    this.armorLv = 0;
    this.arsenalLv = 0;
    this.engineLv = 0;
    this.overdrive = 0;
    this.odT = 0;
    this.lastStand = false;   // 装甲 Lv2 的免死，每关一次
    this.regenT = 0;
    this.grab = false;
    this.gx = 0;
    this.gy = 0;
    this.px = 0;
    this.py = 0;
  }

  // 引擎线：移速倍率
  moveScale() {
    const e = CONFIG.engineLevels[Math.min(this.engineLv, CONFIG.engineLevels.length - 1)];
    return e.speed;
  }

  // 引擎线：道具拾取半径（擦弹删掉后，吃道具效率全压在这条线上）
  pickRadius() {
    const e = CONFIG.engineLevels[Math.min(this.engineLv, CONFIG.engineLevels.length - 1)];
    return e.pickR;
  }

  // 装甲线：护盾时长
  shieldDuration() {
    const a = CONFIG.armorLevels[Math.min(this.armorLv, CONFIG.armorLevels.length - 1)];
    return a.shield;
  }

  hasLastStand() {
    const a = CONFIG.armorLevels[Math.min(this.armorLv, CONFIG.armorLevels.length - 1)];
    return a.lastStand;
  }

  // 军火线：炸弹伤害
  bombDamage() {
    return CONFIG.arsenalDamage[Math.min(this.arsenalLv, CONFIG.arsenalDamage.length - 1)];
  }

  maxBombs() {
    return CONFIG.arsenalLevels[Math.min(this.arsenalLv, CONFIG.arsenalLevels.length - 1)];
  }

  isOverdrive() { return this.odT > 0; }

  update(dt, input) {
    const p = CONFIG.player;
    this.t += dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.optCd > 0) this.optCd -= dt;

    // 超频计时
    if (this.odT > 0) {
      this.odT -= dt;
      if (this.odT <= 0) { this.odT = 0; this.overdrive = 0; }
    }

    // 装甲 Lv3：缓慢回血
    const arm = CONFIG.armorLevels[Math.min(this.armorLv, CONFIG.armorLevels.length - 1)];
    if (arm.regen > 0 && this.hp < p.maxHp) {
      this.regenT += dt;
      if (this.regenT >= arm.regen) { this.regenT = 0; this.hp += 1; }
    }

    if (input.active) {
      if (!this.grab) {
        this.grab = true;
        this.gx = input.x;
        this.gy = input.y;
        this.px = this.x;
        this.py = this.y;
      }
      this.x = this.px + (input.x - this.gx);
      this.y = this.py + (input.y - this.gy);
    } else {
      this.grab = false;
    }

    const k = input.keys;
    let kx = 0, ky = 0;
    if (k['ArrowLeft'] || k['KeyA']) kx -= 1;
    if (k['ArrowRight'] || k['KeyD']) kx += 1;
    if (k['ArrowUp'] || k['KeyW']) ky -= 1;
    if (k['ArrowDown'] || k['KeyS']) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const len = Math.sqrt(kx * kx + ky * ky);
      const sp = p.keySpeed * this.moveScale();
      this.x += (kx / len) * sp * dt / 1000;
      this.y += (ky / len) * sp * dt / 1000;
      this.grab = false;
    }

    const hw = this.w / 2, hh = this.h / 2;
    this.x = Math.max(hw, Math.min(this.view.w - hw, this.x));
    this.y = Math.max(hh, Math.min(this.view.h - hh, this.y));
  }

  isInv() { return this.inv > 0; }

  weaponCfg() { return CONFIG.weapons[this.weapon]; }

  fireInterval() {
    const w = this.weaponCfg();
    const idx = Math.min(this.powerLevel, w.cd.length) - 1;
    const base = w.cd[idx];
    // 超频：射速大幅提升
    return this.isOverdrive() ? base * CONFIG.overdrive.cdScale : base;
  }

  hurt() {
    if (this.inv > 0) return false;
    // 装甲 Lv2：首次致命不死（每关一次）
    if (this.hp <= 1 && this.hasLastStand() && !this.lastStand) {
      this.lastStand = true;
      this.inv = CONFIG.player.invincible;
      return true;
    }
    this.hp -= 1;
    this.inv = CONFIG.player.invincible;
    // 降级下限 Lv2：掉到 Lv1 弹道会腰斩，是死亡螺旋的主因
    this.powerLevel = Math.max(2, this.powerLevel - 1);
    this.overdrive = 0;
    this.odT = 0;
    return true;
  }

  // 切枪 + 给切换后的武器加专精（W 道具的核心：换枪是投资不是惩罚）
  nextWeapon() {
    const order = CONFIG.weaponOrder;
    const i = order.indexOf(this.weapon);
    this.weapon = order[(i + 1) % order.length];
    return this.weapon;
  }

  addMastery(weapon) {
    const key = weapon || this.weapon;
    const max = CONFIG.progression.mastery.max;
    if ((this.mastery[key] || 0) < max) {
      this.mastery[key] = (this.mastery[key] || 0) + 1;
      return true;
    }
    return false;
  }

  // 火力满级后吃 P 累积超频槽，满槽触发
  addOverdrive() {
    const o = CONFIG.overdrive;
    // 超频进行中再吃 P 没有意义，转成分数
    if (this.isOverdrive()) return false;
    if (this.overdrive >= o.max) return false;
    this.overdrive = Math.min(o.max, this.overdrive + o.perPower);
    if (this.overdrive >= o.max) {
      this.overdrive = 0;
      this.odT = o.duration;
      this.inv = Math.max(this.inv, o.invincible);
      return 'fired';
    }
    return true;
  }

  // 把武器专精叠加到弹道上：dmg/pierce/amp/尺寸/追加弹
  applyMastery(tier) {
    const cfg = CONFIG.mastery[this.weapon];
    const lv = this.mastery[this.weapon] || 0;
    const out = [];
    for (let i = 0; i < tier.length; i++) {
      const s = tier[i];
      const o = {
        dx: s.dx, dy: s.dy, vx: s.vx, vy: s.vy,
        w: s.w, h: s.h, dmg: s.dmg || 1, kind: s.kind,
        maxT: s.maxT, pierce: s.pierce, amp: s.amp, phase: s.phase
      };
      out.push(o);
    }
    if (!cfg || lv <= 0) return out;

    for (let m = 0; m < Math.min(lv, cfg.length); m++) {
      const e = cfg[m];
      for (let i = 0; i < out.length; i++) {
        const o = out[i];
        if (e.dmgAdd) o.dmg = (o.dmg || 1) + e.dmgAdd;
        if (e.pierceAdd && o.pierce) o.pierce += e.pierceAdd;
        if (e.ampMul && o.amp) o.amp = Math.round(o.amp * e.ampMul);
        if (e.shardAdd && o.kind === 'boom') o.shards = (o.shards || 10) + e.shardAdd;
        if (e.wMul) {
          o.w = Math.round((o.w || 11) * e.wMul);
          o.h = Math.round((o.h || 11) * (e.hMul || 1));
        }
        // 中置重弹强化：只对最大号弹体生效
        if (e.bigDmg && o.h >= 30) o.dmg = e.bigDmg;
        if (e.reBoom && o.kind === 'boom') o.maxT = (o.maxT || 700) + 200;
      }
      if (e.shots) {
        for (let i = 0; i < e.shots.length; i++) {
          const s = e.shots[i];
          out.push({
            dx: s.dx, dy: s.dy, vx: s.vx, vy: s.vy,
            w: s.w, h: s.h, dmg: s.dmg || 1, kind: s.kind,
            maxT: s.maxT, pierce: s.pierce, amp: s.amp, phase: s.phase
          });
        }
      }
    }
    return out;
  }

  emitShots(spawn) {
    const w = this.weaponCfg();
    const lv = Math.max(1, Math.min(this.powerLevel, w.tiers.length));
    const tier = this.applyMastery(w.tiers[lv - 1]);
    const baseY = this.y - 26;
    // 超频：全弹伤害 +1
    const odAdd = this.isOverdrive() ? CONFIG.overdrive.dmgAdd : 0;

    for (let i = 0; i < tier.length; i++) {
      const s = tier[i];
      spawn(
        this.x + (s.dx || 0),
        baseY + (s.dy || 0),
        s.vx || 0,
        s.vy || CONFIG.bullet.playerSpeed,
        0,
        {
          w: s.w, h: s.h, dmg: (s.dmg || 1) + odAdd, kind: s.kind,
          maxT: s.maxT, pierce: s.pierce, amp: s.amp, phase: s.phase,
          shards: s.shards
        }
      );
    }
  }

  emitOptions(spawn) {
    if (this.options <= 0 || this.optCd > 0) return false;
    const cfg = CONFIG.option;
    this.optCd = cfg.cd[Math.min(this.options, cfg.cd.length) - 1];

    // Lv1 右侧 1 架 / Lv2 左右 2 架 / Lv3 追加尾随 1 架且伤害更高
    const off = cfg.offsetX;
    const slots = this.options >= 3 ? [-off, off, 0] : (this.options >= 2 ? [-off, off] : [off]);
    const dmg = cfg.dmg + (this.options >= 3 ? 1 : 0);

    for (let i = 0; i < slots.length; i++) {
      const back = slots[i] === 0;   // Lv3 的第三架挂在尾部
      spawn(this.x + slots[i], this.y + (back ? cfg.offsetY + 34 : cfg.offsetY) - 10, 0, -cfg.speed, 0, {
        w: 13, h: 13, dmg: dmg, kind: 'homing',
        maxT: cfg.life, turn: cfg.turn
      });
    }
    return true;
  }
}

class Enemy {
  constructor() {
    this.active = false;
    this.type = 'scout';
    this.cfg = null;
    this.move = 'straight';
    this.x = 0; this.y = 0; this.w = 0; this.h = 0;
    this.hp = 1; this.maxHp = 1;
    this.speed = 0;
    this.score = 0;
    this.fireIv = 0;
    this.fireCd = 0;
    this.t = 0;
    this.flash = 0;
    this.isBoss = false;
    this.baseX = 0;
    this.dvx = 0;
    this.dvy = 0;
    this.state = 0;
    this.stateT = 0;
    this.charge = 0;
    this.angle = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.fresh = 0;
    this.mult = 1;
    this.host = null;      // 反向引用 GameScene，母舰放小机用
    this.burstN = 0;       // 连发剩余发数
    this.burstT = 0;       // 连发计时
    this.chainA = 0;       // 弹链当前扫射角
    this.spiralA = 0;      // 螺旋弹当前角度
    this.spawnT = 0;       // 母舰放小机计时
    this.trailed = false;  // 俯冲机是否已撒过尾迹弹
    this.salvoN = 0;       // 齐射剩余（marksman / siege）
    this.salvoT = 0;
    this.shieldHp = 0;     // trait: shield
    this.beamT = 0;        // trait: beam 剩余持续
    this.anchorX = 0;      // orbit 锚点
    this.anchorY = 0;
    this._mark = -1;
  }

  // sc: 难度系数 { hp, speed, fire, count, boss }，由 GameScene.scales() 按关卡算出
  spawn(type, x, y, sc, player) {
    // 兼容旧调用：直接传数字时当成速度倍数，血量/密度不缩放
    if (typeof sc === 'number') sc = { hp: 1, speed: sc, fire: 1, count: 1, vol: 1, boss: 1 };
    sc = sc || { hp: 1, speed: 1, fire: 1, count: 1, vol: 1, boss: 1 };
    const c = CONFIG.enemies[type];
    this.type = type;
    this.cfg = c;
    this.move = c.move || 'straight';
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.w = c.w;
    this.h = c.h;
    // 补给舱刻意不吃关卡血量系数：后期系数涨到 3 倍它也必须"一碰就碎"
    this.hp = c.gift ? c.hp : Math.max(1, Math.round(c.hp * sc.hp));
    this.maxHp = this.hp;
    this.speed = c.speed * sc.speed;
    this.score = c.score;
    this.fireIv = c.fire ? c.fire * sc.fire : 0;
    this.fireCd = this.fireIv * (0.4 + Math.random() * 0.6);
    this.t = Math.random() * 600;
    this.flash = 0;
    this.state = 0;
    this.stateT = 0;
    this.charge = 0;
    this.angle = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.fresh = 0;
    this.mult = sc.speed;   // 弹速与连发间隔仍跟速度走
    this.vol = sc.vol || 1; // 弹幕加密系数：只加弹数，不加弹速
    this.burstN = 0;
    this.burstT = 0;
    this.spiralA = Math.random() * 6.2832;
    this.trailed = false;
    this.salvoN = 0;
    this.salvoT = 0;
    this.beamT = 0;
    this.shieldHp = c.shieldHp || 0;
    this.spawnT = c.spawnIv ? c.spawnIv * 0.6 : 0;
    this.active = true;

    // drift：固定斜向；orbit：绕出生点转圈；blink/rush：节奏计时
    if (this.move === 'drift') {
      const a = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
      this.dvx = Math.sin(a);
      this.dvy = Math.cos(a);
      this.angle = a;
    }
    if (this.move === 'orbit') {
      this.anchorX = x;
      this.anchorY = c.stopY || 300;
    }

    if ((this.move === 'dive' || this.move === 'retreat') && player) {
      const dx = player.x - x;
      const dy = player.y - y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      this.dvx = dx / len;
      this.dvy = Math.abs(dy) / len;
      this.angle = Math.atan2(dy, dx);
    }
  }

  update(dt, player, view, spawnBullet) {
    this.t += dt;
    this.stateT += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.fresh > 0) this.fresh -= dt;

    const c = this.cfg;
    const ms = dt / 1000;

    const hw = this.w / 2;
    const clampX = () => { this.x = Math.max(hw, Math.min(view.w - hw, this.x)); };

    if (this.move === 'weave') {
      this.y += this.speed * ms;
      this.x = this.baseX + Math.sin(this.t / 900 * 6.2832) * (c.amp || 120);
      clampX();
    } else if (this.move === 'sine') {
      // 小幅高频：比 weave 更快更小，难瞄准
      this.y += this.speed * ms;
      this.x = this.baseX + Math.sin(this.t / 380 * 6.2832) * (c.amp || 70);
      clampX();
    } else if (this.move === 'drift') {
      this.x += this.dvx * this.speed * ms;
      this.y += this.dvy * this.speed * ms;
      if (this.x <= hw || this.x >= view.w - hw) { this.dvx *= -1; clampX(); }
    } else if (this.move === 'dive' || this.move === 'retreat') {
      // retreat：降到 stopY 后拉升撤退，打不死就跑
      if (this.move === 'retreat' && this.state === 0 && c.stopY && this.y >= c.stopY) {
        this.state = 1;
      }
      const dir = this.state === 1 ? -1 : 1;
      this.x += this.dvx * this.speed * ms * (this.state === 1 ? 0.7 : 1);
      this.y += this.dvy * this.speed * ms * dir * (this.state === 1 ? 1.3 : 1);
    } else if (this.move === 'rush') {
      // 冲刺 → 急停 → 再冲刺，制造节奏差
      if (this.state === 0) {
        this.y += this.speed * 1.5 * ms;
        if (this.stateT >= (c.rushT || 520)) { this.state = 1; this.stateT = 0; }
      } else {
        this.y += this.speed * 0.12 * ms;
        this.x += Math.sin(this.t / 120) * 8 * ms;
        if (this.stateT >= (c.pauseT || 380)) { this.state = 0; this.stateT = 0; }
      }
    } else if (this.move === 'blink') {
      this.y += this.speed * 0.55 * ms;
      if (this.stateT >= (c.blinkT || 900)) {
        this.stateT = 0;
        const d = c.blinkDist || 180;
        this.x += (Math.random() < 0.5 ? -1 : 1) * d;
        clampX();
        this.flash = 120;
      }
    } else if (this.move === 'orbit') {
      // 下降到锚点高度后绕圈
      if (this.state === 0) {
        this.y += this.speed * ms;
        if (this.y >= this.anchorY) { this.y = this.anchorY; this.state = 1; this.stateT = 0; }
      } else {
        const a = this.stateT / 1000 * 1.6;
        this.x = this.anchorX + Math.cos(a) * 110;
        this.y = this.anchorY + Math.sin(a) * 60;
        clampX();
      }
    } else if (this.move === 'hover') {
      if (this.state === 0) {
        this.y += this.speed * ms;
        if (this.y >= c.stopY) { this.y = c.stopY; this.state = 1; this.stateT = 0; }
      } else if (this.state === 1) {
        this.x += Math.sin(this.t / 700) * 40 * ms;
        if (this.stateT >= c.hoverT) this.state = 2;
      } else {
        this.y += this.speed * 1.4 * ms;
      }
    } else if (this.move === 'snipe') {
      if (this.state === 0) {
        this.y += this.speed * ms;
        if (this.y >= c.stopY) { this.y = c.stopY; this.state = 1; this.stateT = 0; }
      } else {
        this.x += Math.sin(this.t / 900) * 55 * ms;
        clampX();
      }
    } else {
      this.y += this.speed * ms;
    }

    // 掠过玩家高度时向后甩一把尾迹弹，逼玩家提前让路
    if (c.attack === 'trail' && !this.trailed && this.y > player.y - 30) {
      this.trailed = true;
      const n = c.trail || 3;
      const sp = c.bulletSpeed || 320;
      const r = CONFIG.bulletSize[c.bullet || 'small'] || CONFIG.bullet.r;
      const base = Math.atan2(this.dvy || 1, this.dvx || 0);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.28;
        spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 1, { r: r, w: r * 2, h: r * 2 });
      }
    }

    if (this.fireIv > 0 && this.y > 40) this.openFire(dt, player, spawnBullet);

    // 母舰边走边放小机，不清完就一直在场上堆数量
    if (c.spawnIv && this.y > 60 && this.host) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = c.spawnIv;
        const kid = this.host.spawnEnemy(c.spawnType, this.x, this.y + this.h / 2);
        if (kid) kid.fresh = 250;
      }
    }

    if (this.y > view.h + this.h) this.active = false;
  }

  // 弹体通用参数：尺寸档位 + 该怪的弹速
  shotOpt(extra) {
    const c = this.cfg;
    const r = CONFIG.bulletSize[c.bullet || 'normal'] || CONFIG.bullet.r;
    const o = { r: r, w: r * 2, h: r * 2 };
    if (extra) {
      for (const k in extra) o[k] = extra[k];
    }
    return o;
  }

  bulletSpeed() { return (this.cfg.bulletSpeed || CONFIG.bullet.enemySpeed) * (0.85 + this.mult * 0.15); }

  openFire(dt, player, spawnBullet) {
    const c = this.cfg;

    // 连发进行中：按 burstGap 逐发打出，打完才重置常规冷却
    if (this.burstN > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = (c.burstGap || c.salvoGap || 110) / Math.max(1, this.mult);
        this.burstN -= 1;
        this.shoot(player, spawnBullet);
        if (this.burstN <= 0) this.fireCd = this.fireIv;
      }
      return;
    }

    // 光束塔：蓄力预警（画瞄准线）后射出一束穿透激光
    if (c.attack === 'beam') {
      this.fireCd -= dt;
      this.charge = this.fireCd < (c.beamWarn || 600) ? 1 : 0;
      if (this.charge === 1) { this.aimX = player.x; this.aimY = player.y; }
      if (this.fireCd <= 0) {
        this.fireCd = this.fireIv;
        this.charge = 0;
        this.shoot(player, spawnBullet);
      }
      return;
    }

    // 狙击：蓄力（画预警线）后打高速弹，salvo > 1 时连发
    if (c.attack === 'charge') {
      this.fireCd -= dt;
      this.charge = this.fireCd < c.chargeT ? 1 : 0;
      if (this.charge === 1) {
        this.aimX = player.x;
        this.aimY = player.y;
      }
      if (this.fireCd <= 0) {
        this.fireCd = this.fireIv;
        this.charge = 0;
        if (c.salvo && c.salvo > 1) {
          this.burstN = c.salvo;
          this.burstT = 0;
        } else {
          this.shoot(player, spawnBullet);
        }
      }
      return;
    }

    // 霰弹：逼近到射程内才爆发，远距离完全无害
    if (c.attack === 'shotgun') {
      this.fireCd -= dt;
      if (this.fireCd > 0) return;
      if (player.y - this.y > (c.nearY || 620)) return;
      this.fireCd = this.fireIv;
      this.shoot(player, spawnBullet);
      return;
    }

    this.fireCd -= dt;
    if (this.fireCd > 0) return;

    // 点射 / 弹链：起手不立刻出弹，交给连发状态机
    if (c.attack === 'burst' || c.attack === 'chain') {
      this.burstN = this.vn(c.burst || 3);
      this.burstT = 0;
      // 弹链起手角从玩家方向的左侧切入，逐发右扫
      if (c.attack === 'chain') {
        this.chainA = Math.atan2(player.y - this.y, player.x - this.x) - 0.26;
      }
      return;
    }

    // 齐射（如攻城连投两颗）：走连发状态机
    if (c.salvo && c.salvo > 1) {
      this.burstN = this.vn(c.salvo);
      this.burstT = 0;
      return;
    }

    this.fireCd = this.fireIv;
    this.shoot(player, spawnBullet);
  }

  // 后期弹幕加密：同一发弹幕的"弹数"随关卡增长。
  // 刻意不动弹速 —— 提速会变成看不懂，加密才是真的打得慌。
  vn(base) { return Math.max(base, Math.round(base * this.vol)); }

  // 按 attack 签名打出各自的弹幕形状
  shoot(player, spawnBullet) {
    const c = this.cfg;
    const sp = this.bulletSpeed();
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    // 蓄力弹：初速打三折靠 accel 越飞越快；laser 变体是瞬发磁轨炮
    if (c.attack === 'charge') {
      const cs = this.bulletSpeed();
      const opt = c.laser
        ? this.shotOpt({ kind: 'laser', pierce: 4, w: 14, h: 48, dmg: 3 })
        : this.shotOpt({ kind: 'accel' });
      spawnBullet(this.x, this.y + this.h / 2, dx / len * cs * 0.28, dy / len * cs * 0.28, 1, opt);
      return;
    }

    if (c.attack === 'ring') {
      const n = this.vn(c.ring || 10);
      const off = Math.random() * 6.2832;
      for (let i = 0; i < n; i++) {
        const a = off + i * 6.2832 / n;
        spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 1, this.shotOpt());
      }
      return;
    }

    if (c.attack === 'lob') {
      spawnBullet(this.x, this.y + this.h / 2, dx / len * sp, dy / len * sp, 1,
        this.shotOpt({ kind: 'boom', maxT: c.maxT || 850, shards: c.shards || 10, dmg: 2 }));
      return;
    }

    if (c.attack === 'chain') {
      // 连发逐发偏转，扫出一条弧线弹链：不是瞄准，是封走位
      spawnBullet(this.x, this.y + 6, Math.cos(this.chainA) * sp, Math.sin(this.chainA) * sp, 1, this.shotOpt());
      this.chainA += 0.13;
      return;
    }

    if (c.attack === 'spread') {
      const base = Math.atan2(dy, dx);
      const n = this.vn(4);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.22;
        spawnBullet(this.x, this.y + this.h / 3, Math.cos(a) * sp, Math.sin(a) * sp, 1, this.shotOpt());
      }
      return;
    }

    // 弧形齐射：比 spread 更宽的扇面
    if (c.attack === 'arc') {
      const n = this.vn(c.arc || 9);
      const spread = c.arcSpread || 1.9;
      const base = Math.atan2(dy, dx);
      const step = spread / (n - 1);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * step;
        spawnBullet(this.x, this.y + this.h / 3, Math.cos(a) * sp, Math.sin(a) * sp, 1, this.shotOpt());
      }
      return;
    }

    // 十字四向：正交四发，封锁十字通道
    if (c.attack === 'cross') {
      const base = Math.atan2(dy, dx);
      const n = this.vn(4);
      for (let i = 0; i < n; i++) {
        const a = base + i * 6.2832 / n;
        spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 1, this.shotOpt());
      }
      return;
    }

    // 螺旋：每发角度递增，弹幕整体旋转
    if (c.attack === 'spiral') {
      this.spiralA += 0.55;
      const n = this.vn(2);
      for (let i = 0; i < n; i++) {
        const a = this.spiralA + i * 6.2832 / n;
        spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 1, this.shotOpt());
      }
      return;
    }

    // 布雷：原地留一颗静止雷，到时炸开
    if (c.attack === 'mine') {
      spawnBullet(this.x, this.y + this.h / 3, 0, 0, 1,
        this.shotOpt({ kind: 'boom', maxT: c.mineT || 1200, shards: c.shards || 8, dmg: 2 }));
      return;
    }

    // 光束：蓄力预警后射出一段持续激光（用一列高速穿透弹模拟）
    if (c.attack === 'beam') {
      const base = Math.atan2(dy, dx);
      const n = this.vn(6);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.035;
        spawnBullet(this.x, this.y + this.h / 3, Math.cos(a) * sp, Math.sin(a) * sp, 1,
          this.shotOpt({ kind: 'laser', pierce: 3, w: 12, h: 40, dmg: 2 }));
      }
      return;
    }

    // 霰弹：逼近到一定高度才爆发，近距离极具威胁
    if (c.attack === 'shotgun') {
      const n = this.vn(c.pellets || 7);
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.16;
        const v = sp * (0.75 + Math.random() * 0.5);
        spawnBullet(this.x, this.y + this.h / 3, Math.cos(a) * v, Math.sin(a) * v, 1, this.shotOpt());
      }
      return;
    }

    // burst / 默认：朝玩家单发
    spawnBullet(this.x, this.y + this.h / 2, dx / len * sp, dy / len * sp, 1, this.shotOpt());
  }

  damage(d) {
    let dmg = d;

    // trait: armor —— 减伤 1，但至少吃 1 点
    if (this.cfg && this.cfg.trait === 'armor') dmg = Math.max(1, dmg - 1);

    // trait: shield —— 先破盾，破盾这一下不掉血
    if (this.shieldHp > 0) {
      this.shieldHp -= dmg;
      this.flash = 80;
      if (this.shieldHp <= 0) this.shieldHp = 0;
      return false;
    }

    this.hp -= dmg;
    this.flash = 80;
    if (this.hp <= 0) {
      this.active = false;
      return true;
    }
    return false;
  }
}

class Boss extends Enemy {
  constructor() {
    super();
    this.isBoss = true;
    this.key = 'dreadnought';
    this.entered = false;
    this.phase = 1;
    this.pattern = 'fan';
    this.patternT = 0;
    this.spin = 0;
    this.homeX = 0;
    this.mult = 1;
    this.rage = false;
  }

  // bossScale: Boss 血量系数（线性，随关卡递增）
  spawnBoss(key, view, bossScale, bulletScale) {
    const c = CONFIG.bosses[key];
    this.key = key;
    this.cfg = c;
    this.type = 'boss';
    this.isBoss = true;
    this.x = view.w / 2;
    this.y = -c.h;
    this.homeX = view.w / 2;
    this.w = c.w;
    this.h = c.h;
    this.maxHp = Math.round(c.hp * (bossScale || 1));
    this.hp = this.maxHp;
    this.score = c.score;
    this.speed = 0;
    this.fireIv = 0;
    this.fireCd = 700;
    // 弹速/密度倍数：封顶 2.5 —— 后期靠弹数加密，不靠把子弹加速到看不清
    this.mult = Math.min(2.5, bulletScale || 1);
    this.entered = false;
    this.t = 0;
    this.flash = 0;
    this.phase = 1;
    this.spin = 0;
    this.patternT = 0;
    this.rage = false;
    this.pattern = c.patterns[1][0];
    this.stance = (c.stances && c.stances[0]) || 'center';
    this.stanceT = 0;
    this.flankSide = 1;
    this.crossA = 0;
    this.active = true;
  }

  // 站位：Boss 会"选地方站"，而不只是在中间左右摆。
  // 侧翼类弹幕（flank/pincer/lane）会强制切 flank，让玩家看得见它在压哪一边。
  updateStance(dt, player, view) {
    const S = CONFIG.bossStance;
    let target = view.w / 2;
    if (this.stance === 'flank') {
      if (this.stanceT >= S.flankHold) { this.stanceT = 0; this.flankSide *= -1; }
      target = this.flankSide > 0 ? view.w * 0.76 : view.w * 0.24;
    } else if (this.stance === 'chase') {
      target = player.x;
    } else if (this.stance === 'sweep') {
      target = view.w / 2 + Math.sin(this.t / 1000 * 6.2832 / S.sweepCyc) * view.w * 0.34;
    }
    const k = this.stance === 'chase' ? S.chaseLerp : S.moveLerp;
    this.homeX += (target - this.homeX) * Math.min(1, k * dt / 1000);
  }

  update(dt, player, view, spawnBullet) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    const c = this.cfg;

    if (!this.entered) {
      this.y += 120 * dt / 1000;
      if (this.y >= c.targetY) {
        this.y = c.targetY;
        this.entered = true;
      }
      return;
    }

    // 狂暴时横向摆动也提速，更难预判落点
    const cyc = c.swayCyc / (this.rage ? 1.4 : 1);
    this.stanceT += dt;
    this.updateStance(dt, player, view);
    this.x = this.homeX + Math.sin(this.t / 1000 * 6.2832 / cyc) * (this.stance === 'chase' ? c.sway * 0.35 : c.sway);
    const hw = this.w / 2;
    this.x = Math.max(hw, Math.min(view.w - hw, this.x));

    const ratio = this.hp / this.maxHp;
    const np = ratio < 0.33 ? 3 : (ratio < 0.66 ? 2 : 1);
    if (np !== this.phase) {
      this.phase = np;
      this.salvo();   // 换阶段先糊一脸全屏爆发
    }

    // 残血狂暴：攻速与弹速一起拉高
    if (!this.rage && ratio <= CONFIG.bossRage.ratio) {
      this.rage = true;
      this.salvo();
    }

    this.patternT += dt;
    if (this.patternT >= c.switchInterval) {
      this.patternT = 0;
      const list = c.patterns[this.phase];
      this.pattern = list[Math.floor(Math.random() * list.length)];
      this.pickStance();
    }

    this.fireCd -= dt;
    if (this.fireCd <= 0) this.openFireBoss(player, view, spawnBullet);
  }

  // 阶段切换 / 进入狂暴时的下马威：立刻打一发全屏爆发并重置弹幕计时
  salvo() {
    this.pattern = 'burst';
    this.patternT = 0;
    this.fireCd = 0;
  }

  // 站位与弹幕联动：用侧翼弹幕时一定站到侧翼去，让"打哪边"肉眼可见
  pickStance() {
    const c = this.cfg;
    if (!c.stances || !c.stances.length) return;
    const SIDE = { flank: 1, pincer: 1, lane: 1 };
    if (SIDE[this.pattern] && c.stances.indexOf('flank') >= 0) {
      this.stance = 'flank';
    } else {
      this.stance = c.stances[Math.floor(Math.random() * c.stances.length)];
    }
    this.stanceT = 0;
  }

  // 统一的大玉构造：r 同时进判定和绘制
  bossOpt(r) { return { r: r, w: r * 2, h: r * 2 }; }

  openFireBoss(player, view, spawnBullet) {
    const y = this.y + this.h / 2 - 12;
    const m = this.mult;
    const cd = CONFIG.bossFireCd;
    const rage = this.rage;
    const cdScale = rage ? CONFIG.bossRage.cdScale : 1;
    const sv = function (v) { return v * (rage ? CONFIG.bossRage.speedScale : 1); };

    if (this.pattern === 'spiral') {
      const s = CONFIG.bossSpiral;
      this.spin += 0.38 + m * 0.05;
      const v = sv(s.speed * (0.75 + m * 0.2));
      const o = this.bossOpt(s.r);
      for (let i = 0; i < s.arms; i++) {
        const a = this.spin + i * 6.2832 / s.arms;
        spawnBullet(this.x, y, Math.cos(a) * v, Math.sin(a) * v, 1, o);
      }
      this.fireCd = cd.spiral * cdScale;
      return;
    }

    if (this.pattern === 'fan') {
      const f = CONFIG.bossFan;
      const base = Math.atan2(player.y - y, player.x - this.x);
      const step = f.spread / (f.count - 1);
      const sp = sv(f.speed * (0.7 + m * 0.25));
      const o = this.bossOpt(f.r);
      for (let i = 0; i < f.count; i++) {
        const a = base + (i - (f.count - 1) / 2) * step;
        spawnBullet(this.x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1, o);
      }
      this.fireCd = cd.fan * cdScale;
      return;
    }

    if (this.pattern === 'tracking') {
      const f = CONFIG.bossTracking;
      const base = Math.atan2(player.y - y, player.x - this.x);
      const sp = sv(f.speed * (0.8 + m * 0.2));
      const o = this.bossOpt(f.r);
      for (let i = 0; i < f.count; i++) {
        const a = base + (i - (f.count - 1) / 2) * f.spread;
        spawnBullet(this.x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1, o);
      }
      this.fireCd = cd.tracking * cdScale;
      return;
    }

    if (this.pattern === 'burst') {
      const b = CONFIG.bossBurst;
      const off = Math.random() * 6.2832;
      const v = sv(b.speed * (0.85 + m * 0.15));
      const o = this.bossOpt(b.r);
      for (let i = 0; i < b.count; i++) {
        const a = off + i * 6.2832 / b.count;
        spawnBullet(this.x, y, Math.cos(a) * v, Math.sin(a) * v, 1, o);
      }
      this.fireCd = cd.burst * cdScale;
      return;
    }

    // 巨玉弹幕墙：横向一排，随机留 gap 格缺口，逼玩家提前对位
    if (this.pattern === 'wall') {
      const w = CONFIG.bossWall;
      const step = view.w / w.count;
      const gapStart = Math.floor(Math.random() * (w.count - w.gap));
      const v = sv(w.speed * (0.85 + m * 0.15));
      const o = this.bossOpt(w.r);
      for (let i = 0; i < w.count; i++) {
        if (i >= gapStart && i < gapStart + w.gap) continue;
        spawnBullet(step * (i + 0.5), y, 0, v, 1, o);
      }
      this.fireCd = cd.wall * cdScale;
      return;
    }

    // 弹雨：屏幕顶部持续洒落，压缩下半场空间
    if (this.pattern === 'rain') {
      const w = CONFIG.bossRain;
      const sp = sv(w.speed * (0.75 + m * 0.2));
      const o = this.bossOpt(w.r);
      for (let i = 0; i < w.count; i++) {
        spawnBullet(Math.random() * view.w, -10, 0, sp, 1, o);
      }
      this.fireCd = cd.rain * cdScale;
      return;
    }

    // 追踪大玉群：慢速可绕，但会咬着玩家转
    if (this.pattern === 'homing') {
      const h = CONFIG.bossHoming;
      const base = Math.atan2(player.y - y, player.x - this.x);
      const v = sv(h.speed);
      for (let i = 0; i < h.count; i++) {
        const a = base + (i - (h.count - 1) / 2) * 0.3;
        spawnBullet(this.x, y, Math.cos(a) * v, Math.sin(a) * v, 1,
          { r: h.r, w: h.r * 2, h: h.r * 2, kind: 'homing', turn: 2.6 });
      }
      this.fireCd = cd.homing * cdScale;
      return;
    }

    // 侧翼齐射：两翼各甩一扇，直扑左下方与右下方，专封贴边走位（不瞄玩家）
    if (this.pattern === 'flank') {
      const f = CONFIG.bossFlank;
      const sp = sv(f.speed * (0.8 + m * 0.2));
      const o = this.bossOpt(f.r);
      const hw = this.w / 2;
      const step = f.spread / (f.count - 1);
      for (let side = -1; side <= 1; side += 2) {
        const ox = this.x + side * hw * 0.8;
        const base = Math.PI / 2 - side * f.side;   // 朝该侧下方
        for (let i = 0; i < f.count; i++) {
          const a = base - side * (i - (f.count - 1) / 2) * step;
          spawnBullet(ox, y, Math.cos(a) * sp, Math.sin(a) * sp, 1, o);
        }
      }
      this.fireCd = cd.flank * cdScale;
      return;
    }

    // 钳形合拢：左右边缘各推一列大玉向中间夹，玩家只能从缝里穿
    if (this.pattern === 'pincer') {
      const p = CONFIG.bossPincer;
      const v = sv(p.speed * (0.85 + m * 0.1));
      const o = this.bossOpt(p.r);
      const rows = p.rows + (m > 1.6 ? 1 : 0);
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < p.perRow; i++) {
          const by = y + 40 + r * p.rowGap + i * 34;
          spawnBullet(6, by, v, 0, 1, o);
          spawnBullet(view.w - 6, by, -v, 0, 1, o);
        }
      }
      this.fireCd = cd.pincer * cdScale;
      return;
    }

    // 交叉斜射：两道斜线在下方交叉成 X，逼玩家离开正下方
    if (this.pattern === 'cross') {
      const x = CONFIG.bossCross;
      const sp = sv(x.speed * (0.8 + m * 0.2));
      const o = this.bossOpt(x.r);
      this.crossA += 0.5;
      const step = x.spread / (x.count - 1);
      for (let arm = 0; arm < x.arms; arm++) {
        const base = Math.PI / 2 + (arm === 0 ? -1 : 1) * (x.tilt + Math.sin(this.crossA) * 0.25);
        for (let i = 0; i < x.count; i++) {
          const a = base + (i - (x.count - 1) / 2) * step;
          spawnBullet(this.x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1, o);
        }
      }
      this.fireCd = cd.cross * cdScale;
      return;
    }

    // 车道封锁：屏幕竖切成车道，随机封几条 —— 靠边的车道权重更高（优先打左右两边）
    if (this.pattern === 'lane') {
      const L = CONFIG.bossLane;
      const v = sv(L.speed * (0.85 + m * 0.15));
      const o = this.bossOpt(L.r);
      const step = view.w / L.lanes;
      const mid = (L.lanes - 1) / 2;
      const pool = [];
      for (let i = 0; i < L.lanes; i++) {
        const edge = mid ? Math.abs(i - mid) / mid : 1;   // 0 正中 → 1 最边
        // 指数偏置：这就是"优先攻击左右两边"的量化表达
        pool.push({ i: i, w: 1 - L.sideBias + L.sideBias * Math.pow(edge, L.sidePow || 1) });
      }
      for (let k = 0; k < L.block; k++) {
        let total = 0;
        for (const it of pool) total += it.w;
        let r = Math.random() * total, pick = pool[0];
        for (const it of pool) { r -= it.w; if (r <= 0) { pick = it; break; } }
        pick.w = 0;
        for (let q = 0; q < L.perLane; q++) {
          spawnBullet(step * (pick.i + 0.5), y - q * 42, 0, v, 1, o);
        }
      }
      this.fireCd = cd.lane * cdScale;
      return;
    }

    // 雷阵：在玩家周围布一圈延迟雷，压缩可站区域，逼玩家提前挪窝
    if (this.pattern === 'mine') {
      const M = CONFIG.bossMine;
      const n = M.count + (m > 1.5 ? 2 : 0);
      const off = Math.random() * 6.2832;
      for (let i = 0; i < n; i++) {
        const a = off + i * 6.2832 / n;
        const mx = Math.max(24, Math.min(view.w - 24, player.x + Math.cos(a) * M.spread));
        const my = Math.max(120, Math.min(view.h - 160, player.y + Math.sin(a) * M.spread));
        spawnBullet(mx, my, 0, 0, 1,
          { r: M.r, w: M.r * 2, h: M.r * 2, kind: 'boom', maxT: M.fuse, shards: M.shards, dmg: 2 });
      }
      this.fireCd = cd.mine * cdScale;
      return;
    }

    // 玫瑰线花瓣：多层环，整体旋转
    const pe = CONFIG.bossPetal;
    const per = Math.floor(pe.count / pe.layers);
    const o = this.bossOpt(pe.r);
    for (let l = 0; l < pe.layers; l++) {
      const off = this.t / 500 * 0.6 + l * (6.2832 / (per * pe.layers));
      const sp = sv(pe.speed * (1 + l * 0.22));
      for (let i = 0; i < per; i++) {
        const a = off + i * 6.2832 / per;
        spawnBullet(this.x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1, o);
      }
    }
    this.fireCd = cd.petal * cdScale;
  }
}

class PowerUp {
  constructor() {
    this.active = false;
    this.type = 'power';
    this.x = 0;
    this.y = 0;
    this.t = 0;
  }

  spawn(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.t = 0;
    this.active = true;
  }

  update(dt, view, player) {
    this.t += dt;
    this.y += CONFIG.powerupSpeed * dt / 1000;

    // 每种道具磁吸半径不同：成长类（P/W/O）吸得更远，玩家更容易捡到关键强化
    const cfg = CONFIG.powerups[this.type];
    const magnet = cfg ? cfg.magnet : CONFIG.player.magnet;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < magnet && d > 1) {
      const pull = 320 * (1 - d / magnet) * dt / 1000;
      this.x += dx / d * pull * 3;
      this.y += dy / d * pull * 3;
    }

    if (this.y > view.h + 40) this.active = false;
  }
}

function makeBullet() {
  return {
    active: false, x: 0, y: 0, vx: 0, vy: 0, owner: 0,
    dmg: 1, w: 6, h: 6, r: 6, grazed: false,
    kind: 'normal', t: 0, maxT: 0, pierce: 0, shards: 0,
    amp: 0, baseX: 0, phase: 0, turn: 0
  };
}

function makeParticle() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 4, r: 255, g: 255, b: 255 };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Player: Player,
    Enemy: Enemy,
    Boss: Boss,
    PowerUp: PowerUp,
    makeBullet: makeBullet,
    makeParticle: makeParticle,
    hexToRgb: hexToRgb
  };
}
