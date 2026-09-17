const CONFIG = {
  design: { width: 750, height: 1334 },

  // 上架信息：名称/简介要避开已有游戏与「雷电」这类 IP，改这里一处即可（运营规范 2.1）
  meta: {
    name: '雷霆战机',
    enName: 'THUNDER STRIKE',
    version: '1.0.0',
    // 运营规范 2.6.1：需标明著作权人 / 出版服务单位 / 批准文号 / 出版物号
    copyright: {
      owner: '（请填写著作权人）',
      publisher: '（请填写出版服务单位）',
      approval: '（请填写批准文号）',
      isbn: '（请填写出版物号）'
    }
  },

  // pauseBtn 在最右上，血量心形起点要给它让出位置（见 Draw.hud）
  ui: { safeTop: 78, bombBtn: { x: 646, y: 1216, r: 62 }, pauseBtn: { x: 706, y: 78, r: 26 } },

  // 运营规范 2.6.2：游戏开始前必须全文登载，一个字都不能改
  healthNotice: '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。',
  noticeDuration: 3000,    // 忠告页停留毫秒（可点击跳过）

  background: { speed: 150, starCount: 140 },

  player: {
    w: 46, h: 54,
    maxHp: 3,
    keySpeed: 900,
    fireInterval: 165,
    invincible: 1600,
    hitR: 9,          // 判定半径：远小于机体，弹幕手感的关键
    pickR: 52,        // 道具拾取半径基准（引擎线会放大）
    magnet: 220,      // 道具吸附触发距离
    maxPower: 4,
    maxOptions: 2,
    maxBomb: 5,
    // 残血时自动替玩家放炸弹的次数上限（每局）。
    // 0 = 完全不代劳（默认）—— 炸弹是主动技能，白送保命会让擦弹越勤越死不了。
    // 想给点新手保护就设 1：每局只救一次。
    autoBombSave: 0
  },

  // ================= 6 条强化路线 =================
  // 每条线独立升级，对应一个掉落道具。P 是通用成长，其余是分化 build。
  progression: {
    power:   { name: '火力', max: 4,  desc: '弹道数 / 伤害 / 射速' },
    mastery: { name: '专精', max: 3,  desc: '切枪并强化该武器' },
    option:  { name: '僚机', max: 3,  desc: '僚机数量与追踪弹' },
    armor:   { name: '装甲', max: 3,  desc: '护盾时长 / 免死 / 回血' },
    arsenal: { name: '军火', max: 5,  desc: '炸弹数量与威力' },
    engine:  { name: '引擎', max: 3,  desc: '移速 / 拾取范围 / 充能' }
  },

  // 装甲线：护盾时长随等级，Lv2 起首次致命不死，Lv3 起缓慢回血
  armorLevels: [
    { shield: 0,    lastStand: false, regen: 0 },
    { shield: 6000, lastStand: false, regen: 0 },
    { shield: 9000, lastStand: true,  regen: 0 },
    { shield: 12000, lastStand: true, regen: 9000 }
  ],

  // 军火线：炸弹上限与伤害
  arsenalLevels: [2, 3, 4, 5, 6, 7],
  arsenalDamage: [6, 6, 6, 9, 9, 12],

  // 引擎线：机动 + 拾取。擦弹删掉之后，吃道具的效率全压在这条线上。
  // speed 移速倍率 / pickR 道具拾取半径
  engineLevels: [
    { speed: 1.00, pickR: 52 },
    { speed: 1.14, pickR: 76 },
    { speed: 1.24, pickR: 100 },
    { speed: 1.34, pickR: 130 }
  ],

  // 武器专精：每把武器 3 档，叠加在火力等级之上
  mastery: {
    vulcan: [
      { desc: '追加侧翼弹', shots: [{ dx: 0, dy: 4, w: 10, h: 26, dmg: 1, vy: -1100 }] },
      { desc: '中置重弹强化', bigDmg: 5 },
      { desc: '全弹伤害 +1', dmgAdd: 1 }
    ],
    laser: [
      { desc: '穿透 +1', pierceAdd: 1 },
      { desc: '全弹伤害 +1', dmgAdd: 1 },
      { desc: '弹体加宽 + 穿透 +1', wMul: 1.3, hMul: 1.15, pierceAdd: 1 }
    ],
    wave: [
      { desc: '摆幅 +30%', ampMul: 1.3 },
      { desc: '全弹伤害 +1', dmgAdd: 1 },
      { desc: '追加反相位弹', shots: [{ dx: 0, kind: 'wave', amp: 95, phase: 1.57, dmg: 2, w: 13, h: 13 }] }
    ],
    spread: [
      { desc: '爆裂碎片 +4', shardAdd: 4 },
      { desc: '中心弹伤害 +1', dmgAdd: 1 },
      { desc: '爆裂二次起爆', reBoom: true }
    ]
  },

  // 超频：火力满级后继续吃 P 累积，满槽触发爆发
  overdrive: { perPower: 25, max: 100, duration: 8000, cdScale: 0.625, dmgAdd: 1, invincible: 1000 },

  // ================= 武器系统 =================
  // 每种武器 4 级弹道；单发字段：dx 横向偏移 / dy 纵向偏移 / vx vy 速度 / w h 尺寸 / dmg 伤害
  // kind 弹型（normal 默认 / laser 穿透 / wave 摆动 / boom 爆裂），maxT 存活毫秒，pierce 穿透次数
  weapons: {
    vulcan: {
      name: '机炮', short: 'V', color: '#a8fbff', cd: [165, 150, 138, 125],
      tiers: [
        [ { dx: -15 }, { dx: 15 } ],
        [ { dx: -15 }, { dx: 15 }, { dx: 0, dy: -8, w: 12, h: 32, dmg: 2, vy: -1220 } ],
        [ { dx: -15 }, { dx: 15 }, { dx: 0, dy: -8, w: 12, h: 32, dmg: 2, vy: -1220 },
          { dx: -24, dy: 6, vx: -190 }, { dx: 24, dy: 6, vx: 190 } ],
        [ { dx: -26 }, { dx: -9 }, { dx: 9 }, { dx: 26 },
          { dx: 0, dy: -10, w: 14, h: 36, dmg: 3, vy: -1260 },
          { dx: -34, dy: 8, vx: -230 }, { dx: 34, dy: 8, vx: 230 } ]
      ]
    },
    laser: {
      name: '激光', short: 'L', color: '#ffffff', cd: [300, 272, 246, 220],
      tiers: [
        [ { dx: 0, w: 12, h: 74, dmg: 2, vy: -1500, kind: 'laser', pierce: 3 } ],
        [ { dx: -14, w: 12, h: 74, dmg: 2, vy: -1500, kind: 'laser', pierce: 3 },
          { dx: 14, w: 12, h: 74, dmg: 2, vy: -1500, kind: 'laser', pierce: 3 } ],
        [ { dx: 0, w: 16, h: 82, dmg: 3, vy: -1560, kind: 'laser', pierce: 4 },
          { dx: -22, w: 11, h: 70, dmg: 2, vy: -1500, kind: 'laser', pierce: 3 },
          { dx: 22, w: 11, h: 70, dmg: 2, vy: -1500, kind: 'laser', pierce: 3 } ],
        [ { dx: 0, w: 20, h: 92, dmg: 4, vy: -1620, kind: 'laser', pierce: 5 },
          { dx: -24, w: 13, h: 78, dmg: 3, vy: -1520, kind: 'laser', pierce: 3 },
          { dx: 24, w: 13, h: 78, dmg: 3, vy: -1520, kind: 'laser', pierce: 3 },
          { dx: -10, dy: -6, w: 8, h: 46, dmg: 2, vy: -1700, kind: 'laser', pierce: 2 },
          { dx: 10, dy: -6, w: 8, h: 46, dmg: 2, vy: -1700, kind: 'laser', pierce: 2 } ]
      ]
    },
    wave: {
      name: '波动', short: 'W', color: '#c98bff', cd: [190, 176, 162, 148],
      tiers: [
        [ { dx: 0, kind: 'wave', amp: 130, phase: 0, dmg: 1, w: 12, h: 12 } ],
        [ { dx: 0, kind: 'wave', amp: 130, phase: 0, dmg: 1, w: 12, h: 12 },
          { dx: 0, kind: 'wave', amp: 130, phase: 3.14, dmg: 1, w: 12, h: 12 } ],
        [ { dx: -14, kind: 'wave', amp: 110, phase: 0, dmg: 1, w: 12, h: 12 },
          { dx: 14, kind: 'wave', amp: 110, phase: 3.14, dmg: 1, w: 12, h: 12 },
          { dx: 0, dy: -6, w: 12, h: 30, dmg: 2, vy: -1200 } ],
        [ { dx: -18, kind: 'wave', amp: 120, phase: 0, dmg: 2, w: 14, h: 14 },
          { dx: 18, kind: 'wave', amp: 120, phase: 3.14, dmg: 2, w: 14, h: 14 },
          { dx: 0, kind: 'wave', amp: 70, phase: 1.57, dmg: 2, w: 14, h: 14 },
          { dx: 0, dy: -6, w: 14, h: 34, dmg: 3, vy: -1240 } ]
      ]
    },
    spread: {
      name: '散弹', short: 'S', color: '#ffb14d', cd: [340, 310, 285, 258],
      tiers: [
        [ { dx: 0, vy: -900, maxT: 620, w: 9, h: 20, dmg: 2 },
          { dx: 0, vx: -230, vy: -870, maxT: 560, w: 8, h: 18, dmg: 1 },
          { dx: 0, vx: 230, vy: -870, maxT: 560, w: 8, h: 18, dmg: 1 } ],
        [ { dx: 0, vy: -900, maxT: 640, w: 10, h: 22, dmg: 2 },
          { dx: 0, vx: -190, vy: -880, maxT: 600, w: 9, h: 20, dmg: 1 },
          { dx: 0, vx: 190, vy: -880, maxT: 600, w: 9, h: 20, dmg: 1 },
          { dx: 0, vx: -390, vy: -800, maxT: 480, w: 8, h: 18, dmg: 1 },
          { dx: 0, vx: 390, vy: -800, maxT: 480, w: 8, h: 18, dmg: 1 } ],
        [ { dx: 0, vy: -920, maxT: 660, w: 11, h: 24, dmg: 3 },
          { dx: 0, vx: -160, vy: -900, maxT: 620, w: 10, h: 21, dmg: 2 },
          { dx: 0, vx: 160, vy: -900, maxT: 620, w: 10, h: 21, dmg: 2 },
          { dx: 0, vx: -330, vy: -840, maxT: 520, w: 9, h: 19, dmg: 1 },
          { dx: 0, vx: 330, vy: -840, maxT: 520, w: 9, h: 19, dmg: 1 },
          { dx: 0, vy: -760, kind: 'boom', maxT: 700, w: 14, h: 14, dmg: 2 } ],
        [ { dx: 0, vy: -960, maxT: 700, w: 12, h: 26, dmg: 3 },
          { dx: 0, vx: -140, vy: -940, maxT: 660, w: 11, h: 23, dmg: 2 },
          { dx: 0, vx: 140, vy: -940, maxT: 660, w: 11, h: 23, dmg: 2 },
          { dx: 0, vx: -290, vy: -890, maxT: 580, w: 10, h: 21, dmg: 2 },
          { dx: 0, vx: 290, vy: -890, maxT: 580, w: 10, h: 21, dmg: 2 },
          { dx: 0, vx: -450, vy: -790, maxT: 470, w: 9, h: 19, dmg: 1 },
          { dx: 0, vx: 450, vy: -790, maxT: 470, w: 9, h: 19, dmg: 1 },
          { dx: -20, vy: -780, kind: 'boom', maxT: 760, w: 15, h: 15, dmg: 2 },
          { dx: 20, vy: -780, kind: 'boom', maxT: 760, w: 15, h: 15, dmg: 2 } ]
      ]
    }
  },
  weaponOrder: ['vulcan', 'laser', 'wave', 'spread'],

  // 僚机：跟随玩家两侧，独立冷却发射追踪弹
  option: { cd: [520, 400], offsetX: 62, offsetY: 26, dmg: 1, speed: 620, turn: 3.4, life: 2400 },

  bomb: { damage: 6, invincible: 1800, flash: 300 },

  // 炸弹来源（擦弹删掉之后）：每关开局补 1 颗 + B 道具掉落
  bombSupply: { perStage: 1 },

  shield: { duration: 6000 },

  bullet: {
    pool: 900,
    playerSpeed: -1050,
    enemySpeed: 380,
    w: 6, h: 22,
    r: 8            // 敌弹默认半径：同时决定受击圈、擦弹圈和绘制大小
  },

  // 敌弹尺寸档位。越大越慢，但判定圈也越大 —— 靠"占空间"而不是"快"来压迫
  bulletSize: { small: 5, normal: 8, big: 13, huge: 18 },

  // 各弹型的公共参数
  bulletKinds: {
    wave:   { period: 300 },                 // 正弦摆动周期(ms)
    homing: { turn: 3.2, life: 2600 },       // 每秒转向弧度上限 / 存活
    boom:   { shards: 10, speed: 330 },      // 爆裂碎片数与速度
    accel:  { rate: 2.1, from: 0.45 }        // 加速弹：初速比例 → 每秒倍率
  },

  particle: { pool: 900, life: 560 },

  // ================= 敌机（30 种 · 8 家族）=================
  // 每种怪 = 一个 move 原语 × 一个 attack 原语 × 一组数值，保证两两不重样。
  // move:   straight 直降 / weave 蛇形 / dive 俯冲 / hover 停驻 / snipe 瞄准 / carrier 推进
  //         sine 高频正弦 / drift 斜漂 / rush 冲刺急停 / retreat 撤退 / orbit 绕圈 / blink 闪现
  // attack: burst 连发 / ring 环形 / lob 抛爆裂 / trail 尾迹 / chain 扫射 / charge 蓄力
  //         spread 扇形 / spawn 放小机 / arc 弧形 / cross 十字 / spiral 螺旋 / mine 布雷
  //         beam 光束 / shotgun 霰弹
  // trait:  shield 护盾 / split 死亡分裂 / armor 减伤
  enemies: {
    // ---------- 家族 1 · 侦察群 swarm（低威胁 / 高数量 / 诱导走位）----------
    scout:  { name: '侦察机', family: 'swarm', shape: 'blade',
              hp: 29,  speed: 310, score: 15, w: 40, h: 38, fire: 0, color: '#ff8a8a', move: 'straight' },
    dart:   { name: '飞镖', family: 'swarm', shape: 'blade',
              hp: 31,  speed: 380, score: 22, w: 34, h: 42, fire: 0, color: '#ff9ec4', move: 'sine', amp: 70 },
    mote:   { name: '尘埃', family: 'swarm', shape: 'disc',
              hp: 34,  speed: 300, score: 30, w: 36, h: 36, fire: 0, color: '#ffb1a0', move: 'drift' },

    // ---------- 家族 2 · 战线 standard（中庸基准）----------
    fighter:{ name: '战机', family: 'standard', shape: 'craft',
              hp: 50,  speed: 205, score: 30, w: 52, h: 46, fire: 1500, color: '#ffb14d', move: 'straight',
              attack: 'burst', burst: 3, burstGap: 115, bullet: 'small', bulletSpeed: 520 },
    raider: { name: '突袭者', family: 'standard', shape: 'craft',
              hp: 59,  speed: 260, score: 44, w: 50, h: 44, fire: 1400, color: '#ffa06b', move: 'retreat',
              stopY: 520, attack: 'burst', burst: 3, burstGap: 110, bullet: 'small', bulletSpeed: 500 },
    gunship:{ name: '炮艇', family: 'standard', shape: 'block',
              hp: 70, speed: 190, score: 60, w: 60, h: 50, fire: 1800, color: '#ff8f5e', move: 'straight',
              attack: 'shotgun', pellets: 7, nearY: 620, bullet: 'small', bulletSpeed: 420 },
    veteran:{ name: '老兵', family: 'standard', shape: 'craft',
              hp: 82, speed: 215, score: 84, w: 56, h: 48, fire: 1500, color: '#ff7a3d', move: 'weave',
              amp: 150, attack: 'burst', burst: 5, burstGap: 95, bullet: 'normal', bulletSpeed: 480 },

    // ---------- 家族 3 · 织网 suppressor（面积压制）----------
    weaver: { name: '织网者', family: 'suppressor', shape: 'gem',
              hp: 79,  speed: 180, score: 66, w: 50, h: 42, fire: 900, color: '#7fe0ff', move: 'weave',
              amp: 130, attack: 'ring', ring: 10, bullet: 'normal', bulletSpeed: 235 },
    spinner:{ name: '旋涡', family: 'suppressor', shape: 'disc',
              hp: 93, speed: 165, score: 96, w: 52, h: 52, fire: 260, color: '#5ec8ff', move: 'sine',
              amp: 90, attack: 'spiral', bullet: 'small', bulletSpeed: 300 },
    blossom:{ name: '花冠', family: 'suppressor', shape: 'gem',
              hp: 111, speed: 170, score: 132, w: 58, h: 50, fire: 1500, color: '#8ad4ff', move: 'hover',
              stopY: 340, hoverT: 6500, attack: 'arc', arc: 9, arcSpread: 1.9, bullet: 'normal', bulletSpeed: 300 },
    netter: { name: '布网者', family: 'suppressor', shape: 'hex', trait: 'armor',
              hp: 130, speed: 150, score: 185, w: 64, h: 54, fire: 1300, color: '#6bb8ff', move: 'straight',
              attack: 'cross', bullet: 'normal', bulletSpeed: 320 },

    // ---------- 家族 4 · 突击 assassin（惩罚站桩）----------
    diver:  { name: '俯冲机', family: 'assassin', shape: 'arrow',
              hp: 36,  speed: 700, score: 40, w: 36, h: 48, fire: 0, color: '#ff5ec8', move: 'dive',
              attack: 'trail', trail: 3, bullet: 'small', bulletSpeed: 330 },
    striker:{ name: '强袭者', family: 'assassin', shape: 'arrow',
              hp: 38,  speed: 520, score: 59, w: 40, h: 44, fire: 0, color: '#ff4fa8', move: 'rush',
              rushT: 520, pauseT: 380 },
    blitz:  { name: '闪击', family: 'assassin', shape: 'arrow',
              hp: 45,  speed: 780, score: 81, w: 38, h: 50, fire: 900, color: '#ff3d94', move: 'dive',
              attack: 'burst', burst: 2, burstGap: 90, bullet: 'small', bulletSpeed: 560 },
    phantom:{ name: '幻影', family: 'assassin', shape: 'gem',
              hp: 53,  speed: 640, score: 113, w: 44, h: 46, fire: 0, color: '#c94fff', move: 'blink',
              blinkT: 900, blinkDist: 190, attack: 'trail', trail: 5, bullet: 'small', bulletSpeed: 380 },

    // ---------- 家族 5 · 重装 tank（吃伤害 / 占空间）----------
    bomber: { name: '轰炸机', family: 'tank', shape: 'block',
              hp: 122, speed: 105, score: 60, w: 74, h: 64, fire: 1650, color: '#c98bff', move: 'straight',
              attack: 'lob', bullet: 'big', bulletSpeed: 250, kind: 'boom', maxT: 850, shards: 12 },
    bulwark:{ name: '壁垒', family: 'tank', shape: 'hex', trait: 'shield', shieldHp: 12,
              hp: 144, speed: 95,  score: 87, w: 76, h: 66, fire: 1600, color: '#a06bff', move: 'straight',
              attack: 'ring', ring: 6, bullet: 'normal', bulletSpeed: 260 },
    siege:  { name: '攻城', family: 'tank', shape: 'block',
              hp: 171, speed: 110, score: 120, w: 82, h: 70, fire: 1900, color: '#b06bff', move: 'hover',
              stopY: 300, hoverT: 7500, attack: 'lob', salvo: 2, bullet: 'big', bulletSpeed: 240,
              kind: 'boom', maxT: 900, shards: 10 },
    juggernaut:{ name: '巨兽', family: 'tank', shape: 'mothership', trait: 'armor',
              hp: 180, speed: 85,  score: 168, w: 96, h: 76, fire: 1400, color: '#8b5cf6', move: 'straight',
              attack: 'mine', bullet: 'big', mineT: 1200, shards: 8 },

    // ---------- 家族 6 · 要塞 turret（封锁通道）----------
    turret: { name: '炮台', family: 'turret', shape: 'pod',
              hp: 94, speed: 170, score: 60, w: 58, h: 44, fire: 1750, color: '#ffd166', move: 'hover',
              stopY: 380, hoverT: 7000, attack: 'chain', burst: 6, burstGap: 80,
              bullet: 'small', bulletSpeed: 470 },
    flak:   { name: '高炮', family: 'turret', shape: 'pod',
              hp: 111, speed: 180, score: 87, w: 62, h: 46, fire: 1500, color: '#ffc14d', move: 'hover',
              stopY: 330, hoverT: 7000, attack: 'burst', burst: 4, burstGap: 100,
              bullet: 'small', bulletSpeed: 540 },
    mortar: { name: '迫击', family: 'turret', shape: 'tower',
              hp: 132, speed: 150, score: 120, w: 60, h: 56, fire: 2000, color: '#ffb02e', move: 'hover',
              stopY: 290, hoverT: 7500, attack: 'lob', bullet: 'big', bulletSpeed: 230,
              kind: 'boom', maxT: 1000, shards: 14 },
    beamer: { name: '光束塔', family: 'turret', shape: 'tower',
              hp: 155, speed: 160, score: 168, w: 66, h: 62, fire: 2600, color: '#ffe066', move: 'hover',
              stopY: 320, hoverT: 8000, attack: 'beam', beamT: 1500, beamWarn: 700 },

    // ---------- 家族 7 · 狙击 sniper（惩罚不动）----------
    sniper: { name: '狙击机', family: 'sniper', shape: 'hex',
              hp: 61,  speed: 115, score: 45, w: 50, h: 42, fire: 2000, color: '#b48cff', move: 'snipe',
              stopY: 260, chargeT: 950, attack: 'charge', bullet: 'small', bulletSpeed: 720 },
    marksman:{ name: '射手', family: 'sniper', shape: 'hex',
              hp: 72,  speed: 130, score: 65, w: 52, h: 44, fire: 2200, color: '#c06bff', move: 'snipe',
              stopY: 240, chargeT: 800, attack: 'charge', salvo: 3, salvoGap: 140,
              bullet: 'small', bulletSpeed: 700 },
    railgun:{ name: '磁轨炮', family: 'sniper', shape: 'tower',
              hp: 85, speed: 120, score: 90, w: 56, h: 50, fire: 3000, color: '#d94fff', move: 'snipe',
              stopY: 250, chargeT: 1400, attack: 'charge', laser: true, bullet: 'small', bulletSpeed: 1500 },

    // ---------- 家族 8 · 母舰 carrier（持续增援）----------
    carrier:  { name: '母舰', family: 'carrier', shape: 'mothership', trait: 'split', split: 3, splitType: 'fighter',
              hp: 115, speed: 80, score: 150, w: 98, h: 78, fire: 1500, color: '#8affc1', move: 'carrier',
              attack: 'spread', spawnIv: 3200, spawnType: 'scout', bullet: 'normal', bulletSpeed: 360 },
    factory:  { name: '工厂', family: 'carrier', shape: 'mothership',
              hp: 136, speed: 70, score: 218, w: 104, h: 82, fire: 2400, color: '#5fdca0', move: 'carrier',
              attack: 'spawn', spawnIv: 2000, spawnType: 'dart', spawnN: 2 },
    hive:     { name: '蜂巢', family: 'carrier', shape: 'mothership', trait: 'split', split: 5, splitType: 'mote',
              hp: 161, speed: 75, score: 300, w: 112, h: 88, fire: 1700, color: '#3ddb8f', move: 'carrier',
              attack: 'ring', ring: 8, spawnIv: 3800, spawnType: 'scout', bullet: 'normal', bulletSpeed: 280 },
    flagship: { name: '旗舰', family: 'carrier', shape: 'mothership', trait: 'shield', shieldHp: 20,
              hp: 178, speed: 65, score: 420, w: 124, h: 94, fire: 1500, color: '#2ee6a8', move: 'carrier',
              attack: 'spread', spawnIv: 2600, spawnType: 'fighter', bullet: 'big', bulletSpeed: 340 },

    // ---------- 家族 9 · 补给 special ----------
    // 它不是敌人，是"移动的奖励"。三条设计约束：
    //   1) hp 固定且**不吃关卡血量系数** —— 后期系数涨到 3 倍它也必须一碰就碎
    //   2) 不还手、不闪避、慢慢飘 —— 让玩家在密集弹幕里有个确定的补给来源
    //   3) 颜色 / 外形与所有敌机完全不同 —— 一眼看出"这个要打"
    supply:   { name: '补给舱', family: 'special', shape: 'crate', gift: true, giftDrops: 1,
              hp: 3, speed: 150, score: 60, w: 54, h: 54, fire: 0, color: '#ffd166',
              move: 'sine', amp: 90 }
  },

  // ================= Boss =================
  // stances（站位）：Boss 不只是左右摆，它会"选地方站"。
  //   center 居中压制 / flank 贴左右翼（配合侧翼弹幕，逼玩家离开边路）
  //   chase 横移咬住玩家 X / sweep 全屏慢扫
  // 用侧翼类弹幕（flank/pincer/lane）时会强制切到 flank 位，让"打哪边"看得见。
  bosses: {
    dreadnought: {
      name: '无畏级巡洋舰',
      hp: 420, w: 196, h: 128, targetY: 210, score: 3000,
      sway: 135, swayCyc: 4.2, switchInterval: 3400, drops: 3,
      stances: ['center', 'flank'],
      patterns: {
        1: ['fan', 'wall', 'cross'],
        2: ['fan', 'spiral', 'wall', 'pincer'],
        3: ['spiral', 'fan', 'burst', 'wall', 'cross', 'pincer']
      }
    },
    sentinel: {
      name: '哨戒机群核心',
      hp: 560, w: 172, h: 146, targetY: 196, score: 5000,
      sway: 215, swayCyc: 2.6, switchInterval: 2900, drops: 3,
      stances: ['flank', 'chase'],
      patterns: {
        1: ['fan', 'tracking', 'wall', 'lane'],
        2: ['spiral', 'tracking', 'rain', 'flank'],
        3: ['spiral', 'fan', 'tracking', 'burst', 'rain', 'lane', 'flank']
      }
    },
    leviathan: {
      name: '深渊母舰',
      hp: 760, w: 240, h: 164, targetY: 186, score: 8000,
      sway: 170, swayCyc: 3.4, switchInterval: 2400, drops: 4,
      stances: ['center', 'flank', 'sweep'],
      patterns: {
        1: ['fan', 'spiral', 'petal', 'lane'],
        2: ['spiral', 'tracking', 'burst', 'homing', 'mine'],
        3: ['spiral', 'fan', 'petal', 'homing', 'rain', 'wall', 'flank', 'pincer', 'mine']
      }
    }
  },

  // 残血狂暴：攻速与弹速同时拉高，最后一段血才是真正的考验
  bossRage: { ratio: 0.20, cdScale: 0.55, speedScale: 1.2 },

  // Boss 弹幕：一律用大玉，靠体积和密度压迫，不靠高速阴人
  bossFireCd: {
    spiral: 92, fan: 360, tracking: 210, burst: 780,
    wall: 1150, rain: 100, homing: 600, petal: 700,
    flank: 520, pincer: 940, cross: 300, lane: 620, mine: 1500
  },
  bossSpiral:   { arms: 6, speed: 340, r: 9 },
  bossFan:      { count: 9, spread: 1.25, speed: 350, r: 10 },
  bossTracking: { count: 3, spread: 0.16, speed: 380, r: 10 },
  bossBurst:    { count: 30, speed: 330, r: 13 },
  bossWall:     { count: 20, gap: 3, speed: 300, r: 16 },  // 巨玉横墙，只留 3 格缺口
  bossPincer:   { rows: 3, perRow: 3, rowGap: 150, speed: 300, r: 13 },
  bossCross:    { arms: 2, count: 5, spread: 0.34, tilt: 0.55, speed: 360, r: 10 },
  // sideBias=靠边车道的权重倾斜，sidePow=指数（>1 时越靠边越离谱地危险）
  bossLane:     { lanes: 9, block: 4, perLane: 2, sideBias: 0.85, sidePow: 1.5, speed: 280, r: 12 },
  bossFlank:    { count: 7, spread: 0.95, side: 0.42, speed: 330, r: 10 },
  bossMine:     { count: 5, spread: 190, fuse: 1100, shards: 10, r: 14 },
  bossPetal:    { count: 30, layers: 2, speed: 290, r: 12 },
  bossHoming:   { count: 6, speed: 300, r: 13 },
  bossRain:     { count: 3, speed: 340, r: 10 },

  // Boss 站位参数
  bossStance: { flankHold: 2600, chaseLerp: 1.6, sweepCyc: 5.0, moveLerp: 2.4 },

  // ================= 掉落物（7 种）=================
  // 三重区分：颜色 + 形状 + 光环。只有 W / O 带旋转光环 —— 这两条是最强成长线，
  // 玩家扫一眼就能认出「好东西」，不用读字母。
  powerups: {
    power:   { name: '火力', color: '#7fe7ff', label: 'P', shape: 'circle',   halo: false, extra: 1000, weight: 40, magnet: 280 },
    weapon:  { name: '换枪', color: '#c98bff', label: 'W', shape: 'diamond',  halo: true,  extra: 1200, weight: 14, magnet: 280 },
    option:  { name: '僚机', color: '#8affc1', label: 'O', shape: 'hexagon',  halo: true,  extra: 1200, weight: 12, magnet: 280 },
    armor:   { name: '装甲', color: '#7dff9b', label: 'A', shape: 'shield',   halo: false, extra: 800,  weight: 10, magnet: 240 },
    // 擦弹删掉后炸弹只剩 B 掉落这一条来源，权重从 10 提到 18
    bomb:    { name: '炸弹', color: '#ffb14d', label: 'B', shape: 'square',   halo: true,  extra: 800,  weight: 18, magnet: 260 },
    engine:  { name: '引擎', color: '#ffd166', label: 'E', shape: 'triangle', halo: false, extra: 800,  weight: 8,  magnet: 240 },
    heal:    { name: '回血', color: '#ff8ab0', label: 'H', shape: 'cross',    halo: false, extra: 800,  weight: 6,  magnet: 210 }
  },
  powerupSpeed: 135,
  powerupPool: 40,

  // 掉落规则：
  //   1) 点数模型 —— 击杀累积 threat，满 100 必掉一个（大怪给得多，直觉且可控）
  //   2) 额外 8% 随机掉落，制造小惊喜
  //   3) pity 保底兜底，防止脸黑
  drop: {
    pointsPerDrop: 100,
    luckyChance: 0.08,
    pityStart: 8,
    pityMax: 26,
    // 阈值按当前 30 种怪的威胁刻度校准（min 6.6 / 中位 17.7 / max 40.8，算法见 game.js threatOf）。
    // 注意：改 threatOf 的 hp 权重后必须重算这两个数，否则"杂兵偏回血"会静默失效。
    eliteThreat: 22,      // 威胁 ≥ 此值的怪（beamer 及以上共 9 种），W/O 权重翻倍
    weakThreat: 11.5,     // 威胁 < 此值的怪（scout/游哨…raider 共 7 种前期杂兵），H 权重 ×1.5
    eliteBoost: 2
  },

  stages: [
    {
      name: '边境空域',
      waves: [
        { duration: 7500,  groups: [ { type: 'scout', count: 14, interval: 260, delay: 400 },
                                     { type: 'dart', count: 6, interval: 700, delay: 1800 } ] },
        { duration: 9000,  groups: [ { type: 'fighter', count: 5, interval: 1100, delay: 500 },
                                     { type: 'scout', count: 10, interval: 300, delay: 300 },
                                     { type: 'mote', count: 5, interval: 900, delay: 2400 } ] },
        { duration: 10000, groups: [ { type: 'raider', count: 4, interval: 1400, delay: 600 },
                                     { type: 'diver', count: 6, interval: 620, delay: 1600 },
                                     { type: 'turret', count: 2, interval: 2400, delay: 1200 },
                                     { type: 'bomber', count: 2, interval: 3200, delay: 3000 } ] }
      ],
      boss: 'dreadnought'
    },
    {
      name: '云层封锁线',
      waves: [
        { duration: 9500,  groups: [ { type: 'gunship', count: 4, interval: 1500, delay: 500 },
                                     { type: 'veteran', count: 4, interval: 1300, delay: 1400 },
                                     { type: 'dart', count: 10, interval: 380, delay: 300 } ] },
        { duration: 10500, groups: [ { type: 'weaver', count: 4, interval: 900, delay: 400 },
                                     { type: 'spinner', count: 3, interval: 1400, delay: 1200 },
                                     { type: 'blitz', count: 6, interval: 700, delay: 2600 } ] },
        { duration: 11500, groups: [ { type: 'blossom', count: 3, interval: 1800, delay: 500 },
                                     { type: 'bulwark', count: 3, interval: 2000, delay: 1600 },
                                     { type: 'flak', count: 3, interval: 1600, delay: 3000 },
                                     { type: 'marksman', count: 3, interval: 1700, delay: 4400 } ] }
      ],
      boss: 'sentinel'
    },
    {
      name: '深渊海域',
      waves: [
        { duration: 11000, groups: [ { type: 'netter', count: 4, interval: 1600, delay: 500 },
                                     { type: 'phantom', count: 5, interval: 1100, delay: 1500 },
                                     { type: 'siege', count: 3, interval: 2200, delay: 2600 },
                                     { type: 'mortar', count: 2, interval: 3000, delay: 4000 } ] },
        { duration: 12000, groups: [ { type: 'juggernaut', count: 2, interval: 3600, delay: 600 },
                                     { type: 'beamer', count: 3, interval: 2400, delay: 1800 },
                                     { type: 'railgun', count: 3, interval: 2600, delay: 3400 },
                                     { type: 'veteran', count: 6, interval: 1000, delay: 800 } ] },
        { duration: 13500, groups: [ { type: 'carrier', count: 2, interval: 4200, delay: 700 },
                                     { type: 'factory', count: 1, interval: 3000, delay: 3200 },
                                     { type: 'hive', count: 1, interval: 3000, delay: 5600 },
                                     { type: 'flagship', count: 1, interval: 3000, delay: 8200 },
                                     { type: 'mote', count: 10, interval: 320, delay: 500 } ] }
      ],
      boss: 'leviathan'
    }
  ],

  interlude: 2400,

  // ================= 难度曲线 =================
  // 目标：每关都变难（不是每 3 关跳一次），前期爽快成长，后期必然清不动而崩盘。
  // 四条曲线分开跑，各自封顶高度不同 —— 弹速必须封顶（否则不可躲），
  // 血量和密度负责把后期顶穿。
  difficulty: {
    hpBase: 0.42,        // 第 1 关血量系数：玩家只有 Lv1，怪必须软
    hpGrow: 1.17,        // 每关 ×1.17（指数，不封顶 —— 这是"必崩"的那道墙）
    speedMax: 1.55, speedGrow: 0.05,   // 弹速/移速：封顶 1.55，再快就不是难度是耍赖
    // 下面三项会连乘：数量 1.62 × 弹数 1.28 × 射速 1.35 ≈ 2.8 倍密度。
    // 上限受两个硬约束：① 峰值必须压在 bullet.pool(900) 以下，顶到池子会静默丢弹；
    // ② ~900 发 ×3 弧填充 ≈ 2700 次/帧，低端安卓会掉帧。
    fireMin: 0.74, fireGrow: 0.026,    // 开火间隔缩到 74%（密度 1.35 倍）封顶
    countMax: 1.62, countGrow: 0.058,  // 同屏敌人数量封顶 1.62 倍
    volMax: 1.28, volGrow: 0.050,      // 弹幕加密：只加"每一发的弹数"，不加弹速
    bossGrow: 0.34                     // Boss 血量每关 +34%（线性，Boss 是循环出场的）
  },

  // 循环加压：三张关卡表的"开火密度"天生差十几倍，只靠 vol/count 抹不平，
  // 每轮回一圈就往每一波追加一组射手，把锯齿磨成斜坡。
  // 注意 stackMax：不封顶的话第 10 关起同屏敌弹会顶到 900 的池子上限，
  // 新弹被静默丢弃 —— 那不是难度，是 bug，而且满屏红点也没法看。
  reinforce: {
    startLoop: 2,        // 从第 3 圈才开始加压（第 1、2 圈保持节奏，别一上来就压）
    stackMax: 2,         // 最多叠 2 轮，之后靠 vol/count 继续爬
    groups: [
      { type: 'gunship', count: 1, interval: 950, delay: 1500 },
      { type: 'weaver', count: 2, interval: 850, delay: 3000 }
    ]
  },

  // 每波空投补给舱（一碰就碎、必掉道具）。
  // 这是"降难度"里手感最好的一种：不是把敌人改软，而是给玩家更多补给 ——
  // 体感像自己变强了，而不是敌人变弱了。
  supply: {
    perWave: 1,          // 每波送 1 个（一关 3 波 = 3 个）
    firstDelay: 2600,    // 等这一波打起来再送，别一开场就飘出来
    gap: 2600,           // 一波送多个时的间隔
    dropThreat: 14       // 掉落权重档位：高于弱兵线、低于精英线，走标准权重
  },

  // 轻点（tap）判定：手指本来就用来拖飞机，所以"抬手点一下"必须能和"按住拖动"区分开。
  // 两个条件同时满足才算轻点：位移够小 + 按下时间够短。
  input: {
    tapMaxMove: 14,      // 设计像素：相对按下点的位移超过这个值就判定为拖拽
    tapMaxMs: 260        // 按下时长上限，长按不放不算轻点
  },

  colors: {
    bg0: '#05060f',
    bg1: '#131a3d',
    player: '#7fe7ff',
    playerDark: '#1d5f88',
    side: '#a8e8ff',
    bullet: '#a8fbff',
    bulletBig: '#ffffff',
    enemyBullet: '#ff5d6c',
    enemyBulletCore: '#ffe6e8',
    hud: '#eaf2ff',
    dim: '#707aa3',
    accent: '#ffd166',
    bossBar: '#ff6b7a',
    charge: '#8affc1'
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
