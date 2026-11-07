# Miao-Yunzai ↔ TRSS-Yunzai 迁移检查表

结论来自对两仓 `lib/plugins/plugin.js`、`lib/plugins/loader.js` 的逐行 diff。**【源码 diff】**

## 一、可直接复用（无需改动）

- `extends plugin` + `constructor({ name, dsc, event, priority, rule, task })`
- `rule[].reg / fnc / event / log / permission`
- `this.reply(msg, quote, { recallMsg, at })`
- `this.setContext / getContext / finish`（语义兼容）
- `accept()` 事件入口
- `e.msg / e.img / e.isGroup / e.isMaster / e.sender` 等常用字段

## 二、从 Miao 迁到 TRSS 需要注意

| 检查项 | 处理方式 |
| --- | --- |
| `import plugin from "../../lib/plugins/plugin.js"` | 相对深度按插件位置算（`plugins/<name>/apps/x.js` 是 `../../../lib/...`） |
| `import { segment } from "icqq"` | TRSS 用 `oicq`；用全局 `segment` 更安全 |
| `import { Common } from "#miao"` | TRSS 里仍需 miao-plugin；也可用 `this.renderImg(...)` 少一条依赖 |
| `puppeteer.render(...)` 旧写法 | 换 `e.runtime.render(plugin, tpl, data, cfg)` 或 `this.renderImg(...)` |
| `segment.button(...)` | **只有 QQBot 适配器能用**【用户确认】；OneBotv11 / ICQQ / Satori / Milky 等端无效或降级纯文本，且 Miao loader 的 `segment.button = () => ""` 兜底会让它静默消失。见 `templates/button-plugin.js` |
| `conKey()` 不含 `self_id` | TRSS 含 `self_id`，多账号下上下文天然隔离，行为有差异 |
| 依赖安装 | 两边都是 pnpm workspace（`plugins/**`），命令一致 |

## 三、从 TRSS 迁到 Miao 会丢的能力

| TRSS 专有 | 缺失后果 |
| --- | --- |
| `addCleanup(dispose, restore)` / `PluginCleanup` | Miao 无热更新资源回收，需自行在卸载逻辑里处理 |
| `awaitContext()` / `resolveContext()` | 只能用 `setContext` + 回调 |
| `handler` + `namespace` | Miao 无具名 handler 分发 |
| `e.runtime.render` | Miao 走 `puppeteer.render` / `Common.render` |
| `e.self_id` 参与 `conKey` | 多账号上下文可能串号 |
| `plugins/adapter/*` 协议端 | Miao 只有 icqq 登录 |

## 四、判断当前框架

`lib/config/config.js` 暴露 `cfg.package.name`：

```js
if (cfg.package.name === "trss-yunzai") { /* TRSS */ }
else if (cfg.package.name === "miao-yunzai") { /* Miao */ }
else { /* 原版 yunzai */ }
```

`Yunzai-genshin/model/base.js` 就是这么判断页脚文字的。**【示例】**

## 五、Node 与模块

- 两边都是 ESM：插件文件必须用 `import` / `export`，不能 `require`。
- TRSS README 手动安装写 **Node >= v23.11**；Miao 同处未声明。
- `TRSS-Plugin` 自己加了 `process.version < "v18"` 兜底检查 —— 说明插件作者应自行防御低版本。
