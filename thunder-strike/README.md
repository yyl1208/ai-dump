# thunder-strike · 雷霆战机

雷电（Raiden）风格的竖版弹幕射击小游戏。零依赖、纯 Canvas 2D 手写，没有一个图片资源。

**在线试玩：https://thunder-strike.app.workbuddy.host/**

（手机、电脑浏览器都能开，竖屏体验更好）

## 操作

| 操作 | 效果 |
| --- | --- |
| 拖动 | 移动飞机（相对偏移，手指不用压在机身上） |
| 自动 | 开火，不用按键 |
| 轻点屏幕空处 | 放炸弹，清屏 |
| 空格 | 放炸弹（桌面端） |
| `P` / `R` | 暂停 / 重开（桌面端） |

## 内容

- 31 种敌人 · 3 个关卡（每关三波 + Boss）
- 3 个 Boss，13 种弹幕编排
- 4 把武器：连射 / 激光 / 波动 / 散射
- 6 条强化路线：火力 / 专精 / 僚机 / 装甲 / 军火 / 引擎

## 本地运行

零构建，浏览器直接打开 `index.html` 即可。

需要本地服务器：`node tools/serve.js`（默认 http://localhost:8123）

打包微信小游戏：`node tools/build-wx.js`，产物在 `dist/wx`（appid 目前是游客 appid，上架前需替换）

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `src/config.js` | 所有数值、敌人表、Boss 表（`module.exports` 可直接 require） |
| `src/platform.js` | 平台适配层，wx / tt / web 的差异只出现在这里 |
| `src/entities.js` | 玩家、敌人、子弹、Boss |
| `src/game.js` | 主循环与关卡推进 |
| `src/draw.js` | 全部图形绘制（纯代码画的） |
| `tools/` | 构建与验证脚本（含冒烟、稳定性、变异测试） |

## 踩坑总结

[`docs/ai-game-design-pitfalls.md`](./docs/ai-game-design-pitfalls.md)：14 轮迭代踩出来的坑，
重点讲数值如何悄悄变质、以及怎么验证「AI 写的测试」本身有没有在验证东西。

---

这是 [ai-dump](../README.md) 仓库里的一个项目 —— 一个放「没落地的 AI 创作」的地方。
