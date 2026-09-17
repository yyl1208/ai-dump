# 微信小游戏移植说明

运行时是纯 Canvas 2D 手绘、零依赖、无 DOM 调用，所以移植不需要引入任何引擎，
也**不需要 `weapp-adapter`**（那是给依赖 DOM/BOM 的第三方库擦屁股用的）。

## 一、构建与运行

```bash
# 生成 dist/wx/（game.js + game.json + project.config.json）
node tools/build-wx.js

# 不装开发者工具也能验证：Node 里伪造一套 wx API 跑构建产物
node tools/smoke-wx.js

# web 调试壳照旧（直开 index.html）
node tools/smoke.js
```

然后用**微信开发者工具 → 导入项目**，目录选 `dist/wx`。

> `project.config.json` 里的 `appid` 目前是 `touristappid`（游客模式，可直接预览）。
> 上传发布前必须改成你自己的小游戏 appid；`libVersion` 若本地没有，改成工具里可用的版本即可。

## 二、产物结构

```
dist/wx/
├── game.js                # 单文件构建产物（src 按依赖顺序拼接）
├── game.json              # deviceOrientation: portrait
└── project.config.json    # compileType: game
```

小游戏没有 `<script>` 标签、没有模块解析（除了 require 自己的文件），
所以 `tools/build-wx.js` 直接按依赖顺序拼成一个文件：

```
config.js → platform.js → core.js → draw.js → entities.js → game.js → ui.js → boot.js → wx-entry.js
```

源文件里 `if (typeof module...) module.exports = X` 这类 Node 用守卫会被裁掉，产物结尾补 `module.exports = {}`。

**123 KB ≈ 微信 4MB 主包的 3%**，离分包还差得远。

## 三、平台差异全部收敛在 `Platform`

`src/platform.js` 是唯一出现 `wx` / `tt` / `document` 的文件，其余代码一个平台 API 都不碰。
新增了这些能力：

| 能力 | 实现 | 说明 |
|---|---|---|
| 窗口信息 | `getWindowInfo()` → 回落 `getSystemInfoSync()` | 兼容基础库 2.20 前后 |
| dpr | 封顶 2 | 3x 屏按全分辨率画满屏弹幕会掉帧 |
| 安全区 | `safeArea.top` / `windowHeight - safeArea.bottom` → 换算成设计坐标写进 `view.padTop/padBottom` | 刘海与 Home 指示条不挡 HUD |
| 字体 | `Platform.font()` → 小游戏返回 `sans-serif` | `system-ui` / `-apple-system` 在部分安卓机上解析失败 |
| 生命周期 | `onShow` / `onHide` | 切后台：暂停 + 停 rAF；回前台：`loop.resume()` 重对时间基准 |
| 窗口变化 | `wx.onWindowResize` → `applyResize()` | 折叠屏 / 旋转；`view` 是引用，游戏内自动跟随 |
| 存档 | `wx.getStorageSync` / `setStorageSync` | 最高分 |
| 触觉 | `wx.vibrateShort` | 受伤 medium、阵亡/炸弹 heavy |
| 常亮 | `wx.setKeepScreenOn` | 游戏期间不熄屏 |
| GC | `wx.triggerGC` | 每关切换催一次，长时间游玩内存不爬升 |
| 转发 | `wx.onShareAppMessage` | 右上角转发，失败不影响主流程 |
| 兜底 | `ellipsePath()` | 老基础库 canvas 没有 `ellipse` 时用「缩放 + arc」替代 |

## 四、布局：不再写死 1334

设计分辨率 750×1334，但真机什么比例都有（19.5:9 的机器算下来 view.h ≈ 1623）。
原来 HUD 里 `view.h - 104`、炸弹按钮 `y: 1216` 都是写死的，长屏上会飘。

新增 `uiLayout(view)`（在 `core.js`）：

```js
{
  safeTop: max(78, padTop + 20),          // 顶部 HUD 让开刘海
  bottom:  view.h - padBottom,            // 底部 HUD 让开 Home 指示条
  bomb:    { x: view.w - 104, y: view.h - padBottom - 118, r: 62 }
}
```

`Draw.hud` / `Draw.bombButton` / `GameScene.isBombButton` 统一走它，
web 端 `padTop/padBottom` 为 0，行为与移植前完全一致。

横向策略：**按宽度铺满、纵向延伸**（不做 letterbox）。弹幕游戏纵向多给一点空间只会更从容，
留黑边反而浪费屏。

## 五、启动器拆分

`main.js` 里的循环和状态机提到了 `src/boot.js`，web 与 wx 共用一份：

- `src/main.js` —— web 调试壳入口，`boot()` 完事
- `src/wx-entry.js` —— 小游戏入口，**只**挂生命周期 / 转发 / 常亮，参与 wx 打包

这样不会出现「web 改了逻辑、wx 忘了同步」的经典事故。

## 六、测试

`tools/smoke-wx.js` 用 Node `vm` 伪造一整套 wx API 直接跑 `dist/wx/game.js`。
**关键一招：全局故意不定义 `document`** —— 只要代码里漏了 DOM 依赖，测试立刻抛错。
这比"人眼看一遍有没有用 document"可靠得多。

9 组断言：环境识别（dpr 封顶）、安全区换算、触摸操控、开局与渲染、
生命周期（切后台 30 帧分数不动）、存档走 wx Storage、平台能力、窗口自适应、包体与配置。

## 七、抖音小游戏

`Platform` 里 `tt` 与 `wx` 走同一分支（`tt.createCanvas` / `tt.getSystemInfoSync` / `tt.onTouchStart` …），
构建产物可以复用，只是 `project.config.json` 是字节的格式。
抖音缺 `triggerGC` / `getWindowInfo` 时会自动跳过（都有 `if (api.xxx)` 保护）。
要正式发抖音，再补一个 `dist/tt/` 的项目配置文件即可。

## 八、还没做的（需要时再说）

- **音效/BGM**：`wx.createInnerAudioContext`，注意 iOS 需用户手势后才能播
- **微信排行榜**：`wx.setUserCloudStorage` + 开放数据域（要单开一个子域项目）
- **激励视频**：`wx.createRewardedVideoAd`（复活 / 开局 buff）
- **低端机降级**：按帧率动态降 dpr 或减粒子数
- **首屏加载页**：目前 123 KB 直接进，没有 loading 阶段；加素材后才需要
