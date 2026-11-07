# TRSS-Yunzai 插件开发指南（单文件版）

> **给 AI 的说明**
>
> 这是一份 **TRSS-Yunzai 插件开发规范 + 可直接复制的模板集**。TRSS-Yunzai 指 `TimeRainStarSky/Yunzai`（v3.x、ESM、基于 Miao-Yunzai 的多协议端 Yunzai 应用端）。
>
> 读完本文件，你应当能够直接在 `plugins/<你的插件>/...` 下产出可运行、可维护的插件代码，**不需要再打开任何其它文件**——下面五个模板都是完整代码，不是片段。
>
> 生成代码时请遵守：
>
> - 一律 **ESM**：`import` / `export`，禁止 `require`。
> - 插件类 **`extends plugin`**，构造参数用本文给出的字段；`rule[].fnc` 写**方法名字符串**，不是函数。
> - 渲染走 **`e.runtime.render(...)`** 或 **`this.renderImg(...)`**，**不要**写老 Miao 教程里的 `puppeteer.render(...)`。
> - 按钮消息**只有 QQBot 适配器**能用（见第 8 节），别在其它协议端上生成按钮。
> - 本文没写的 API 不要编造；拿不准就降级成纯文本，并在注释里写明假设。
>
> **标记约定（全文适用）**
>
> | 标记 | 含义 |
> | --- | --- |
> | **【源码】** | 可直接在 `lib/plugins/*.js` 里读到，可信度最高 |
> | **【文档】** | 官方 README / `docs` 分支明说 |
> | **【示例】** | 从官方/主流插件仓库归纳，框架并未强制 |
> | **【用户确认】** | 使用者基于实际运行环境确认的事实，本次未从源码验证 |
> | **【未验证】** | 推断，或未实际运行验证 |
>
> 前提：**TRSS-Yunzai 官方没有插件开发文档**。`docs` 分支只有 Bot / 好友 / 群 / 群成员 / 频道 / segment 的运行时对象 API 表，开头写着「开发文档咕咕咕中」。所以本文规则基本都来自源码与示例仓库的阅读。

---

## 目录

- [0 先判断框架](#0-先判断框架)
- [1 目录分工](#1-目录分工)
- [2 加载与分发规则](#2-加载与分发规则)
- [3 插件基类 plugin](#3-插件基类-plugin)
- [4 apps 聚合模式](#4-apps-聚合模式)
- [5 package.json 与依赖](#5-packagejson-与依赖)
- [6 配置管理](#6-配置管理)
- [7 渲染出图](#7-渲染出图)
- [8 按钮消息](#8-按钮消息)
- [9 插件安装与生态](#9-插件安装与生态)
- [10 与 Miao 的差异](#10-与-miao-的差异)
- [11 高频坑清单](#11-高频坑清单)
- [12 五份模板完整代码](#12-五份模板完整代码)
- [13 新建插件落地清单](#13-新建插件落地清单)
- [14 未取得与未验证](#14-未取得与未验证)

---

## 0 先判断框架

动手前先看 Yunzai 根目录 `package.json` 的 `name`：

| `name` | 框架 | 消息库 |
| --- | --- | --- |
| `trss-yunzai` | TRSS-Yunzai | `oicq` |
| `miao-yunzai` | Miao-Yunzai | `icqq` |
| `yunzai` | 原版 Yunzai-Bot | `oicq` |

**【源码】** `lib/config/config.js` 会读 `package.json`，并以 `cfg.package.name` 暴露；示例插件里也用 `Yunzai-genshin/model/base.js` 这么判断页脚。

```js
if (cfg.package.name === "trss-yunzai") { /* TRSS */ }
else if (cfg.package.name === "miao-yunzai") { /* Miao */ }
else { /* 原版 yunzai */ }
```

> `Le-niao/Yunzai-Bot` 在 GitHub 已 403（TOS blocked），原版源码取不到，本文的「与原版差异」实际以 **Miao-Yunzai** 为基线。

---

## 1 目录分工

**【源码】** 关键认知：`lib/plugins/` 是**框架内核**，不是插件目录；用户插件在根目录的 `plugins/` 下。

```
Yunzai/
├── app.js                     # 入口：stop / daemon / pm2 / start 分派后 new Bot().run()
├── package.json               # "type":"module"、imports: #miao -> plugins/miao-plugin/...
├── pnpm-workspace.yaml        # packages: plugins/**  → 每个插件都是 workspace 包
├── config/
│   ├── default_config/*.yaml  # bot/db/group/redis/renderer/server/satori/milky/other
│   └── <插件>.yaml            # 插件自己的配置也落在这里（示例）
├── lib/
│   ├── bot.js
│   ├── plugins/               # ★ 框架内核，不是插件目录
│   │   ├── loader.js          # 发现/加载/热重载/定时任务/权限/分发
│   │   ├── plugin.js          # 插件基类 plugin
│   │   ├── handler.js         # handler 注册表（按 namespace + key）
│   │   ├── config.js          # makeConfig 配置助手
│   │   └── runtime.js         # 每事件的 e.runtime（渲染 / Mys 封装）
│   ├── puppeteer/  renderer/  common/
└── plugins/                   # ★ 用户插件根目录
    ├── adapter/               # OneBotv11 ComWeChat GSUIDCore OPQBot Satori Milky stdin
    ├── system/                # 主人、退群、撤回、状态…
    ├── other/                 # install / update / restart / version / sendLog
    └── example/               # 官方示例：主动复读.js、进群退群通知.js
```

要点：

- `lib/plugins/` 里**没有任何用户插件**，改插件不要动它。
- `plugins/adapter/*` 是**协议端插件**（OneBotv11、Satori、Milky、QQBot 等），不是示例。
- `plugins/` 下每个子目录就是一个「插件包」（pnpm workspace 包）。
- `#安装` 装的是 `plugins/<插件名>/`。

单个插件推荐结构：

```
plugins/<my-plugin>/
├── index.js                    # 有它时 loader 只加载它，负责聚合 apps/
├── apps/                       # 各功能模块（每个文件一个 class）
├── model/                      # 业务逻辑（可选）
├── resources/html/             # 渲染模板（出图时才需要）
└── package.json                # 有第三方依赖才写
```

---

## 2 加载与分发规则

### 2.1 加载规则（最容易踩的一段）

**【源码】** `lib/plugins/loader.js`

```js
dir = "plugins"
// ① 有 plugins/<name>/index.js → 只加载它
if (await Bot.fsStat(`${this.dir}/${val.name}/index.js`)) { ... }
// ② 否则把该目录下所有 *.js 逐个加载
for (const app of apps) { if (app.name.endsWith(".js")) ret.push(...) }
// ③ 入口可导出 apps 聚合多个类
const app = module.apps ? { ...module.apps } : module
lodash.forEach(app, p => pluginArray.push(this.loadPlugin(file, p)))
```

由此得到四条硬规则：

1. **有 `index.js` 就不会再看其它文件**。想让 `apps/` 生效，必须由 `index.js` 自己 `import` 它们。
2. 没有 `index.js` 时，目录下的每个 `*.js` 都会被当成插件文件加载（适合 2~3 个小插件）。
3. 一个文件里可以 `export class A extends plugin`、`export class B extends plugin`，多个类都会被注册。
4. `global.plugin` 与 `global.segment` 由 loader 注入，插件文件**可以不 import 基类**；但显式 import 更稳（跨框架迁移时必需）。

其它加载行为（均**【源码】**）：

- `init()` 返回字符串 `"return"` → **整个插件跳过加载**（不是跳过某条规则）。
- `rule[].reg` 若是字符串，自动 `new RegExp()`。
- `priority` 默认 `5000`，**数字越小越先执行**；`-Infinity` 用于抢在最前（内置 `#安装` 就是这么写的）。
- 群聊消息必须 @机器人、或命中 `groupCfg.botAlias` 前缀，才会进入 rule 匹配（`only_reply_at`）。
- `task` 的 `fnc()` **没有 `e` 参数**，必须自己 `Bot.pickGroup(...)`。
- 单个插件 `init()` 超时会打 `插件加载超时`（阈值 `cfg.bot.plugin_load_timeout`）。
- 缺依赖**不会崩**：捕获 `Cannot find package` 后提示 `pnpm i` / 进插件目录 `pnpm add`。
- `namespace` 默认 = `<目录>/<文件名>`（如 `genshin/apps/dailyNote.js`），也可由插件自己传。

### 2.2 启动加载顺序

```
Bot.run()
  └─ PluginsLoader.load()
       ├─ getPlugins()        // 扫 plugins/ 目录，决定 index.js 还是平铺
       ├─ importPlugin(file)  // import() + 取 module.apps
       │    └─ loadPlugin(file, p)
       │         ├─ new p() → init.init?.() === "return" ? 跳过
       │         ├─ collectTask(init.task)
       │         ├─ new p() → 消息实例
       │         ├─ rule[].reg 字符串 → new RegExp()
       │         ├─ priority.push({ plugin, class, key, name, priority, namespace })
       │         └─ registerHandlers(plugin, namespace)  // 仅当有 handler
       ├─ packageTips(packageErr)                        // 缺依赖提示
       ├─ createTask()                                  // node-schedule 注册
       └─ priority = lodash.orderBy(priority, ["priority"], ["asc"])
```

### 2.3 单条消息分发顺序（`deal`）

顺序固定，排查「命令没反应」时按这个顺序一段段排除：

1. `count(e, "receive")` 统计
2. `checkBlack(e)` 黑白名单 → 不通过直接 return
3. `cfg.getGroup(e.self_id, e.group_id)` + `checkLimit(e)` 冷却
4. `dealEvent(e)` 补 `e.msg / e.img / e.file / e.reply_id / isGroup / isMaster / logText`
5. `reply(e)` 包装 `e.reply`（注入 `at` / `quote` / `recallMsg` 能力）
6. `Runtime.init(e)` → 挂 `e.runtime`
7. 过滤出「启用 + 事件匹配」的插件列表（`checkDisable` + `filtEvent`）
8. **上下文优先**：遍历插件 `getContext()`，命中则执行回调并 `return`；回调返回 `"continue"` 才继续
9. `only_reply_at` 检查：群聊未 @ 且无 `botAlias` 前缀 → 到此结束
10. 星铁/绝区零前缀归一化（`srReg` / `zzzReg`）
11. 逐个跑 `accept()`，返回 `"return"` 中断、返回真值 break
12. 遍历 `rule[]`：`v.event` 过滤 → `v.reg.test(e.msg)` → `filtPermission` → 调用 `plugin[fnc](e)`
    - 返回 `false` → `continue`（继续下一条 rule）
    - 否则记录耗时日志并 `return`（本次事件结束）
13. 都没命中 → `[暂无插件处理]` debug 日志

### 2.4 权限（`filtPermission`）

| 值 | 判定 |
| --- | --- |
| 不写 / `all` | 放行 |
| `master` | `e.isMaster`（`cfg.master[self_id]` 包含该 `user_id`） |
| `owner` | `e.member.is_owner` |
| `admin` | `is_owner \|\| is_admin` |

不通过时**会主动回复**「暂无权限，只有主人/群主/管理员才能操作」，不是静默丢弃。

### 2.5 事件匹配（`filtEvent`）

```js
eventMap = {
  message: ["post_type", "message_type", "sub_type"],
  notice:  ["post_type", "notice_type", "sub_type"],
  request: ["post_type", "request_type", "sub_type"],
}
// v.event 按 "." 切段，逐段与 e 的对应字段比较，`*` 通配
```

例：`notice.group.increase` → `post_type=notice`、`notice_type=group`、`sub_type=increase`。
`event` 不匹配的插件在该事件里**完全不会执行**（连 `accept()` 都不会）。

### 2.6 定时任务

- `task` 可为对象或数组，只有同时具备 `cron` 和 `fnc` 才被收集。
- `i.name ??= 插件 name`；重复 `name+cron` 会被跳过并 warn。
- 执行体是 `await i.fnc()`，**不传 `e`**。
- 用 `node-schedule` 的六段式 cron（秒 分 时 日 月 周）。

### 2.7 热重载与卸载

- chokidar 监听 `plugins/<dir>/<file>.js` 的 `change` → 卸载该 key 所有 plugin → 重新 import。
- 目录新增 → 自动加载。
- 卸载时按 `namespace` 调 `Handler.del(ns)`；`initializerMap` 里登记的 `addCleanup` 资源会被 `dispose()`。
- 热更新失败会尝试 `restore()` 恢复已停止的资源。

### 2.8 `handler`（可选的高级分发）

不是 rule 的替代品，而是给插件自己用的「具名处理器」：

```js
// constructor 里：super({ ..., handler: { myKey: { fn: "onMyKey", key: "my-event", priority: 100 } }, namespace: "my-ns" })
// 之后任意地方（例如别的插件、定时任务）：
await this.e.runtime.handler.call("my-event", e, args)
```

`Handler.call` 按 priority 升序执行，返回非 reject 即停；处理函数签名 `(e, args, reject)`。`Handler.callAll` 在源码里被注释掉了（暂时屏蔽）。

---

## 3 插件基类 plugin

**【源码】** `lib/plugins/plugin.js`

```js
export default class plugin {
  constructor({ name, dsc, handler, namespace, event = "message", priority = 5000, task, rule }) {
    this.name = name; this.dsc = dsc; this.event = event; this.priority = priority
    this.task = task; this.rule = rule
    if (handler) { this.handler = handler; this.namespace = namespace || "" }
  }
  reply(msg, quote, data)          // data: { recallMsg: 0-120 秒, at: true|user_id }
  conKey(isGroup)                  // `${name}.${self_id}.${user_id|group_id}`
  setContext(type, isGroup, time = 120, timeout = "操作超时已取消")
  getContext(type, isGroup)
  finish(type, isGroup)
  awaitContext(...)                // Promise 版上下文
  resolveContext(context)
  addCleanup(dispose, restore)     // 登记资源回收，热更新失败时可恢复
  renderImg(plugin, tpl, data, cfg) // = Common.render(..., { e: this.e })
}
```

rule / task 字段（构造注释里写明的全部字段）：

| 字段 | 说明 |
| --- | --- |
| `rule[].reg` | 命令正则（字符串或 RegExp） |
| `rule[].fnc` | 方法名（字符串，不是函数） |
| `rule[].event` | 该规则的事件，默认继承 |
| `rule[].log` | `false` 时降到 debug 日志 |
| `rule[].permission` | `master` / `owner` / `admin` / `all` |
| `task[].name` / `.cron` / `.fnc` / `.log` | 定时任务，需 `cron` + `fnc` 才生效 |

`e` 上可直接用的字段（**【源码】** `loader.js#dealEvent`）：

`e.msg`（仅文本段拼接）、`e.img`（图片 URL 数组）、`e.file`、`e.reply_id` / `e.getReply()`、
`e.atBot`、`e.at`、`e.isGroup`、`e.isPrivate`、`e.isMaster`、`e.self_id`、`e.group_id`、`e.user_id`、
`e.logText` / `e.logFnc`、`e.runtime`。

**事件型插件不写 rule**，只写 `accept()`：

```js
export class newcomer extends plugin {
  constructor() {
    super({ name: "欢迎新人", dsc: "新人入群欢迎", event: "notice.group.increase" })
  }
  async accept() { if (this.e.user_id == this.e.self_id) return; await this.reply("欢迎新人！") }
}
```

事件串按 `post_type.<message_type|notice_type|request_type>.<sub_type>` 逐段比对，支持 `*` 通配。**【源码】** `filtEvent`

上下文（等用户下一条消息）的常规用法：

```js
async askName() {
  this.setContext("onName")      // 注册上下文，默认 120 秒超时
  return this.reply("请发送你的名字（120 秒内有效）")
}
async onName() {
  this.finish("onName")          // 先结束，避免重复命中
  return this.reply(`记住了：${this.e.msg.trim()}`)
}
```

---

## 4 apps 聚合模式

`apps/`（大写 `Apps/` 也行）**不是框架目录**，loader 只认 `index.js`；它是 `index.js` 主动读出来的约定。**【源码 + 示例】**

```js
// plugins/<你的插件>/index.js —— 标准聚合写法
import fs from "node:fs"

const files = fs.readdirSync("./plugins/my-plugin/apps").filter(f => f.endsWith(".js"))
const ret = await Promise.allSettled(files.map(f => import(`./apps/${f}`)))

export const apps = {}
for (let i in files) {
  const name = files[i].replace(".js", "")
  const mod = ret[i]
  if (mod.status !== "fulfilled") { logger.error(`载入插件错误：${name}`, mod.reason); continue }
  apps[name] = mod.value[Object.keys(mod.value)[0]]
}
```

三个真实仓库的实际差异：

| 仓库 | 入口 | 目录 | 备注 |
| --- | --- | --- | --- |
| [TRSS-Plugin](https://github.com/TimeRainStarSky/TRSS-Plugin) | `index.js` | `Apps/ Model/ Resources/ Picture/` | 大写 `Apps`；先自检 `process.version < v18`；大量 `Bot.xxx ??=` 补垫片 |
| [Yunzai-genshin](https://github.com/TimeRainStarSky/Yunzai-genshin) | `index.js` | `apps/ model/ defSet/ resources/` | **无 package.json**；`defSet/*.yaml` 做默认配置 |
| [yenai-plugin](https://github.com/yeyang52/yenai-plugin)（默认分支 `v2`） | `index.js` | `apps/ apps/events/ components/ config/ guoba/ lib/ model/` | 有 `package.json#imports`、guoba 配置界面 |

⚠️ 三者的 `index.js` 都把路径**写死**成 `./plugins/<仓库名>/apps`。仓库目录一改名就加载失败——这是最高频的线上故障。

---

## 5 package.json 与依赖

- 框架**不读**插件的 `package.json`（loader 里没有任何 package.json 逻辑）。**【源码】**
- 证据：`Yunzai-genshin` 完全没有 `package.json` 也能跑；`TRSS-Plugin` 只有 `name/type/author/dependencies/scripts`，**没有 `description`**。**【示例】**
- 结论：**没有第三方依赖就不写**；有依赖（`qrcode`、`cheerio`、`sharp`…）才写 `dependencies` + `"type": "module"`。**【示例推断】**
- 依赖安装靠 **pnpm workspace**：`pnpm-workspace.yaml` 里 `packages: plugins/**`，根目录 `pnpm i` 会一并装所有插件的依赖。所以文档里那句「安装插件后请 `pnpm i`」是有效的。**【源码】**
- `#miao` 这个别名定义在**本体** `package.json` 的 `imports` 里（指向 `plugins/miao-plugin/components/index.js`），插件不能自带；插件想要别名得在自己 `package.json` 里写（yenai 的 `#yenai.*`）。**【源码 + 示例】**

最小 `package.json` 示例（只在需要依赖时写）：

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "axios": "^1.7.0"
  }
}
```

---

## 6 配置管理

两条路，框架都接受。

**A. 用框架助手（推荐）** —— `lib/plugins/config.js`**【源码】**

```js
// 路径深度取决于文件位置：plugins/<name>/apps/x.js → ../../../lib/plugins/config.js
import makeConfig from "../../../lib/plugins/config.js"

const { config, configSave } = await makeConfig(
  "my-plugin",                                   // → config/my-plugin.yaml
  { enable: true, prefix: "#", api: { key: "" } },// 默认值
  {},                                             // keep：不允许被文件覆盖
  { watch: true },                                // chokidar 热加载
)
```

返回 `{ config, configSave, configFile }`；`configSave` 内置 debounce；文件缺失 / 字段缺失会自动补全回写。

**B. 自己读写 YAML** —— `TRSS-Plugin/Model/config.js`：`YAML.parse("config/TRSS.yaml")` + `lodash.merge` + 不等则回写。**【示例】**

约定：

- **配置文件放本体 `config/<name>.yaml`，不放插件目录**（两种示例都这样）。
- 默认值放 `config/default_config/`（本体）或 `defSet/`（genshin）。

---

## 7 渲染出图

**【源码】** `lib/plugins/runtime.js` / `plugin.js`

```js
// 事件维度：e.runtime.render(plugin, tpl, data, cfg)
await this.e.runtime.render("my-plugin", "html/my-page", data, { retType: "base64" })
// 插件基类快捷方式：
await this.renderImg("my-plugin", "html/my-page", data)
```

- 自动推导：`tplFile = ./plugins/<plugin>/resources/<tpl>.html`、`pluResPath`、`saveId`。
- 自动注入：`defaultLayout` / `elemLayout` → **`plugins/miao-plugin/resources/common/layout/default.html`**、`_miao_path`、`_tpl_path`、`copyright`。
- `cfg.retType`：`"base64"` 返回图、`"msgId"` 返回消息 id、缺省自动发送并返回 `true`。
- `cfg.beforeRender({ data })` 可改渲染数据；`dev` 启动时把数据落盘 `temp/ViewData/<plugin>/*.json` 方便调模板。
- `plugin.js` 用 `try { Common = (await import("#miao")).Common } catch {}` 动态导入 → **没装 miao-plugin 时插件照常加载，只是渲染静默失效**。
- tpl 路径**不要带 `.html`**（源码里会 `replace(/.html$/, "")` 再拼）。

**不要照抄老 Miao 教程里的 `puppeteer.render(...)`**；TRSS 的插件层入口是 `e.runtime.render` / `this.renderImg`，puppeteer 在 `lib/puppeteer/` 属于内核。

模板约定：`resources/html/*.html` 里用 `{{extend defaultLayout}}` + `{{block 'css'}}` / `{{block 'main'}}`，资源引用用 `{{_res_path}}` / `pluResPath`。**【示例，以 genshin 的 resources 结构为参照】**

---

## 8 按钮消息

**【用户确认】** 按钮消息**仅支持 QQBot 适配器**（`plugins/adapter` 里的 QQBot 那套）。
OneBotv11 / ICQQ / Satori / Milky 等其它协议端**不支持**：发出去要么无效，要么降级成纯文本。

这点特别容易误判，因为：

- Miao 的 loader 里有 `segment.button = () => ""` 兜底（**【源码】**）→ 不支持的端上**不会报错**，只是按钮凭空消失。
- 第三方教程里的按钮文档本身有字段冲突，照抄会调不通。

写法：`segment.button(rows)`，完整可跑示例见第 12.5 节。

| 约束 | 值 |
| --- | --- |
| 每行按钮数 | 最多 **10** 个 |
| 行数 | 最多 **5** 行 |
| 超出 | 自动**另发一条**消息，不报错 |
| `text` | 必填 |
| `style` | `1`–`4`（颜色 / 样式档位） |
| 三种动作 | `callback` / `input` / `link`，三选一 |
| `callback` | **平台已砍，无法自动发送**，改用 `input` 或 `toCallback` |

⚠️ **字段分歧**：常见的那份按钮文档里，属性表写 `enter`，部分示例却用 `send: true`；属性表写 `style`，个别示例又写成 `reply: 1`。**以属性表为准（`style` + `enter`）**，实际请以你所用协议端的实测结果为准。

---

## 9 插件安装与生态

**【源码】** `plugins/other/install.js`

- **24 个仓库硬编码**在 `list` 常量里：`Atlas`、`genshin`、`DF-Plugin`、`ws-plugin`、`TRSS-Plugin`、`miao-plugin`、`Philia-Plugin`、`Guoba-Plugin`、`yenai-plugin`、`flower-plugin`、`xianyu-plugin`、`earth-k-plugin`、`useless-plugin`、`StarRail-plugin`、`xiaoyao-cvs-plugin`、`trss-xianxin-plugin`、`Telegram-Plugin`、`Discord-Plugin`、`WeChat-Plugin`、`QQBot-Plugin`、`Route-Plugin`、`ICQQ-Plugin`、`KOOK-Plugin`、`Secluded-Plugin`；另有 `map` 去掉 `-Plugin` 后缀做别名。
- `#安装插件` 列出未安装项；`#安装xxx` → `git clone --depth 1 --single-branch` 到 `plugins/<name>` → 若存在 `package.json` 则根目录 `pnpm install` → 重启。
- **没有中心插件索引仓库**；想装不在清单里的插件只能手动 `git clone` 到 `plugins/`。
- `plugins/other/update.js` 存在（8.8KB），**具体更新策略未读、未验证**。

手动安装一个插件的完整流程：

```bash
cd <Yunzai 根目录>
git clone --depth 1 https://github.com/<owner>/<repo>.git plugins/<name>
# 只有存在 package.json 时才需要：
pnpm install
# 然后重启 bot，日志里出现 [Plugin] 加载插件 [...] 即成功
node .
```

依赖报 `Cannot find package 'xxx'` 时的处理顺序：

```bash
pnpm i                                 # ① 根目录，装所有 workspace 包
cd plugins/<name> && pnpm add xxx      # ② 仍不行，进插件目录单独装
```

---

## 10 与 Miao 的差异

对 `plugin.js`、`loader.js` 做过 diff。**【源码 diff】**

| 维度 | TRSS-Yunzai | Miao-Yunzai |
| --- | --- | --- |
| 模块制 | ESM `"type":"module"` | 同 |
| Node | README 手动安装要求 **≥ v23.11**【文档】 | 同处未声明 |
| 消息库 | `oicq`（`link:lib/modules/oicq`） | `icqq` |
| 基类 `Common` | try/catch 动态 import（无 miao 也能加载） | 直接 `import { Common } from "#miao"` |
| 基类新增 | `addCleanup`/`PluginCleanup`、`awaitContext`/`resolveContext`、`handler`+`namespace` | 无 |
| `conKey` | 含 `self_id`（多账号隔离） | 不含 |
| `setContext` | 同 key 旧上下文作废并 `resolve(false)` | 直接覆盖 |
| 加载器 | `module.apps`、加载超时、pluginCountMap/initializerMap、热重载 add/unload、缺依赖提示、eventCache | 较简；`segment.button = () => ""` 兜底 |
| 协议适配 | 内置 `plugins/adapter/*`（OneBotv11 反连 `ws://localhost:2536/OneBotv11`、ComWeChat、GSUIDCore、OPQBot、Satori、Milky、stdin）+ 独立协议插件 ICQQ/QQBot/WeChat/KOOK/Telegram/Discord/Route | 仅 icqq |

兼容性结论（**【源码 diff】**）：

- `extends plugin` + `rule/task/accept/setContext` 写法**三方一致**，普通插件可互跑。
- TRSS → Miao 不安全：用了 `addCleanup / awaitContext / handler / e.runtime` 的插件会缺能力。
- Miao → TRSS 不安全：直接用 `icqq` 专有 API 会因 `oicq` 差异报错。

迁移检查表（Miao → TRSS）：

| 检查项 | 处理方式 |
| --- | --- |
| `import plugin from "../../lib/plugins/plugin.js"` | 相对深度按插件位置算（`plugins/<name>/apps/x.js` 是 `../../../lib/...`） |
| `import { segment } from "icqq"` | TRSS 用 `oicq`；用全局 `segment` 更安全 |
| `import { Common } from "#miao"` | TRSS 里仍需 miao-plugin；也可用 `this.renderImg(...)` 少一条依赖 |
| `puppeteer.render(...)` 旧写法 | 换 `e.runtime.render(plugin, tpl, data, cfg)` 或 `this.renderImg(...)` |
| `segment.button(...)` | **只有 QQBot 适配器能用**【用户确认】；其它端无效或降级纯文本，且 `segment.button = () => ""` 兜底会让它静默消失。见第 12.5 节 |
| `conKey()` 不含 `self_id` | TRSS 含 `self_id`，多账号下上下文天然隔离，行为有差异 |
| 依赖安装 | 两边都是 pnpm workspace（`plugins/**`），命令一致 |

---

## 11 高频坑清单

1. **有 `index.js` 就只加载它** —— `apps/` 没被 `index.js` 引入 = 完全没跑，且不报错。**【源码】**
2. **`index.js` 里写死 `./plugins/<仓库名>/apps`** —— 目录改名即挂。**【示例】**
3. **`init()` 返回 `"return"` 会整插件跳过**，别用它当「跳过某条规则」。**【源码】**
4. **群消息不 @ 也没有 `botAlias` 前缀 → 不进 rule**（`only_reply_at`），常被误判成正则问题。**【源码】**
5. **`e.msg` 只有文本**：图片在 `e.img`、文件在 `e.file`、回复在 `e.reply_id` / `e.getReply()`。**【源码】**
6. **`reg` 字符串自动转正则**，但反斜杠 / 特殊字符仍要自己转义。**【源码】**
7. **`task.fnc` 没有 `e`**，定时任务要自己 pick 群 / 好友。**【源码】**
8. **没装 miao-plugin → `renderImg` 静默失效**（插件不报错），先确认 `plugins/miao-plugin` 是否存在。**【源码】**
9. **缺依赖只打日志不崩**：先根目录 `pnpm i`；仍报错再 `cd plugins/<name> && pnpm add <包>`。**【源码】**
10. **`namespace` 与文件名不一致时热重载可能残留 handler**（卸载按 namespace 精确匹配）—— **【未验证】**，改插件后建议重启。
11. **`runtime.render` 的 tpl 路径不要带 `.html`**（源码里会 `replace(/.html$/, "")` 再拼）。**【源码】**
12. **按钮消息只有 QQBot 适配器能用**【用户确认】：OneBotv11 / ICQQ / Satori / Milky 等其它协议端发了无效或降级成纯文本；又因为 Miao 的 loader 有 `segment.button = () => ""` 兜底（**【源码】**），**不支持的端上连报错都没有**，按钮直接消失。写法与限制见第 8 节和第 12.5 节。

---

## 12 五份模板完整代码

五份模板分别覆盖「最小插件 / 多文件聚合 / 定时任务 / 配置+渲染 / QQBot 按钮菜单」。把 `<my-plugin>` 换成你的目录名即可。

### 12.1 最小插件（minimal-plugin.js）

对应文件：`plugins/<my-plugin>/apps/hello.js`

```js
// plugins/<my-plugin>/apps/hello.js
// 最小可跑插件：两条 rule + 权限 + 上下文
// 依据：lib/plugins/plugin.js（构造参数与方法）、lib/plugins/loader.js（分发/权限/上下文）
// 注意：plugin / segment / logger / Bot 是 loader 注入的全局变量（lib/plugins/loader.js）。
//      若你的框架不注入，或要跨 Miao/原版迁移，把下面这行加上更稳：
//      import plugin from "../../../lib/plugins/plugin.js"

export class hello extends plugin {
  constructor() {
    super({
      name: "打招呼",
      dsc: "最小示例插件：#你好",
      event: "message",          // 默认就是 message
      priority: 5000,            // 数字越小越先
      rule: [
        {
          reg: "^#你好$",        // 字符串会被 new RegExp() 包一层
          fnc: "hello",          // 写方法名，不是函数
          permission: "all",     // master | owner | admin | all
          log: false,            // 降级到 debug 日志
        },
        {
          reg: "^#起名$",
          fnc: "askName",
          permission: "master",
        },
      ],
    })
  }

  /** #你好 */
  async hello() {
    // reply(msg, quote, data) —— data.at 会在群聊里 @ 发送者
    return this.reply(`你好，${this.e.sender?.card || this.e.user_id}`, false, { at: true })
  }

  /** #起名 → 等用户下一条消息，120 秒超时 */
  async askName() {
    this.setContext("onName")
    return this.reply("请发送你的名字（120 秒内有效）")
  }

  /** 上下文回调：方法名与 setContext 的第一个参数一致 */
  async onName() {
    this.finish("onName")                 // 先结束上下文，避免重复命中
    const name = this.e.msg.trim()
    if (!name) return this.reply("名字不能为空")
    // recallMsg: 5 → 5 秒后撤回机器人的回复（群聊/好友均支持）
    return this.reply(`记住了：${name}`, true, { recallMsg: 5 })
  }
}
```

### 12.2 多文件聚合（apps-index.js）

对应文件：`plugins/<my-plugin>/index.js`

```js
// plugins/<my-plugin>/index.js
// 聚合 apps/ 下的每个文件，导出给 loader 的 `apps` 对象
// 依据：lib/plugins/loader.js#getPlugins + importPlugin（module.apps 分支）
//      Yunzai-genshin/index.js、TRSS-Plugin/index.js（同样的聚合写法）
// 注意：logger / Bot 是全局；APPS_DIR 是相对「启动目录（仓库根）」的路径，
//      import() 的 `./apps/${f}` 是相对本文件的路径 —— 两者不要混。

import fs from "node:fs"

const PLUGIN = "my-plugin"                 // ★ 必须与 plugins/ 下的目录名完全一致
const APPS_DIR = `./plugins/${PLUGIN}/apps`

const files = fs.readdirSync(APPS_DIR).filter(f => f.endsWith(".js"))
const results = await Promise.allSettled(files.map(f => import(`./apps/${f}`)))

export const apps = {}

for (let i = 0; i < files.length; i++) {
  const name = files[i].replace(/\.js$/, "")
  const r = results[i]

  if (r.status !== "fulfilled") {
    // 缺依赖时给出可执行提示（与 loader.packageTips / yenai 的 handleError 一致）
    const msg = String(r.reason?.message || r.reason)
    const miss = msg.match(/'(.+?)'/g)?.[0]?.replace(/'/g, "")
    if (miss && msg.includes("Cannot find package")) {
      logger.warn(`[${PLUGIN}] ${name} 缺少依赖 ${miss}，请在根目录 pnpm i，或 cd plugins/${PLUGIN} && pnpm add ${miss}`)
    } else {
      logger.error(`[${PLUGIN}] 载入插件错误：${name}`)
      logger.error(r.reason)
    }
    continue
  }

  // 取该文件导出的第一个 class；多导出时改为显式映射更稳
  const key = Object.keys(r.value).find(k => typeof r.value[k] === "function")
  if (!key) {
    logger.warn(`[${PLUGIN}] ${name} 没有导出 class，已跳过`)
    continue
  }
  apps[name] = r.value[key]
}

logger.info(`[${PLUGIN}] 已加载 ${Object.keys(apps).length}/${files.length} 个 app`)
```

### 12.3 定时任务（task-plugin.js）

对应文件：`plugins/<my-plugin>/apps/daily-push.js`

```js
// plugins/<my-plugin>/apps/daily-push.js
// 定时任务模板：task 的 fnc 没有 e，需要自己 pick 群/好友
// 依据：lib/plugins/loader.js#collectTask / createTask / startTask（node-schedule，调用 i.fnc()）

export class dailyPush extends plugin {
  constructor() {
    super({
      name: "每日推送",
      dsc: "每天 8 点给指定群推送一条消息",
      // 事件型字段对 task 插件无意义，但基类允许不写 rule
      event: "message",
      priority: 5000,
      task: [
        {
          name: "每日推送",       // 日志里的任务名，缺省用插件 name
          cron: "0 0 8 * * *",   // node-schedule 六段式（秒 分 时 日 月 周）
          fnc: "pushDaily",      // 方法名
          log: false,            // false 时降到 debug
        },
      ],
      // 同时暴露一条手动触发命令，方便调试（不需要可删掉）
      rule: [{ reg: "^#测试推送$", fnc: "trigger", permission: "master" }],
    })
  }

  /** 定时任务入口：无参数！ */
  async pushDaily() {
    const groupIds = [123456789]           // 换成真实群号 / 从配置读
    const msg = `每日推送 ${new Date().toLocaleString("zh-CN")}`

    for (const groupId of groupIds) {
      try {
        const group = Bot.pickGroup(groupId)
        await group.sendMsg(msg)
      } catch (err) {
        logger.error(`[每日推送] 群 ${groupId} 发送失败`, err)
      }
    }
  }

  /** 附带一个手动触发命令，方便调试 */
  async trigger() {
    await this.pushDaily()
    return this.reply("已手动执行一次推送")
  }
}
```

### 12.4 配置 + 渲染（config-render-plugin.js）

对应文件：`plugins/<my-plugin>/apps/profile.js`

```js
// plugins/<my-plugin>/apps/profile.js
// 配置 + 渲染模板
// 依据：
//   lib/plugins/config.js  → makeConfig(name, default, keep, { watch })
//   lib/plugins/plugin.js  → renderImg(plugin, tpl, data, cfg)
//   lib/plugins/runtime.js → 自动注入 defaultLayout（指向 plugins/miao-plugin/resources/common/layout/default.html）
//   示例：Yunzai-genshin/model/base.js、apps/dailyNote.js
// 注意：plugin / logger 是全局；makeConfig 的路径按本文件位置算是 3 层向上。

import makeConfig from "../../../lib/plugins/config.js"

// ① 配置：首次启动自动创建 config/my-plugin.yaml 并补全缺失字段
const DEFAULT = {
  enable: true,
  title: "我的名片",
  footer: "Powered by TRSS-Yunzai",
  colors: { primary: "#4a6cf7" },
}
const { config } = await makeConfig("my-plugin", DEFAULT, {}, { watch: true })

export class profile extends plugin {
  constructor() {
    super({
      name: "名片",
      dsc: "配置 + 图片渲染示例：#我的名片",
      event: "message",
      priority: 100,
      rule: [{ reg: "^#我的名片$", fnc: "show", permission: "all" }],
    })
  }

  async show() {
    if (!config.enable) return this.reply("名片功能已关闭（config/my-plugin.yaml → enable）")

    const data = {
      title: config.title,
      footer: config.footer,
      primary: config.colors.primary,
      uid: this.e.user_id,
      nickname: this.e.sender?.card || this.e.sender?.nickname || String(this.e.user_id),
      avatar: this.e.sender?.avatar,
      time: new Date().toLocaleString("zh-CN"),
    }

    // ② 渲染：模板文件放在 plugins/my-plugin/resources/html/profile.html
    //    传 "html/profile"，不要带 .html（runtime 会自己拼 tplFile）
    //    retType: "base64" → 返回图片数据；缺省 → 自动发送并返回 true
    try {
      return await this.renderImg("my-plugin", "html/profile", data)
    } catch (err) {
      // 没装 miao-plugin 时 renderImg 会静默失效或抛错，降级成纯文本
      logger.error("[名片] 渲染失败，检查是否已安装 miao-plugin", err)
      return this.reply(`${data.nickname}（${data.uid}）\n${data.title}\n${data.time}`)
    }
  }
}

/* plugins/my-plugin/resources/html/profile.html —— 最小模板
{{extend defaultLayout}}

{{block 'css'}}
<style>
  .card { padding: 24px; background: #fff; border-radius: 12px; }
  .card h1 { color: {{primary}}; }
</style>
{{/block}}

{{block 'main'}}
<div class="card">
  <h1>{{title}}</h1>
  <p>{{nickname}}（{{uid}}）</p>
  <p>{{time}}</p>
  <small>{{footer}}</small>
</div>
{{/block}}
*/
```

### 12.5 QQBot 按钮菜单（button-plugin.js）

对应文件：`plugins/<my-plugin>/apps/menu.js`

> ⚠️ **仅 QQBot 适配器可用**。其它协议端发了无效或降级成纯文本，且不会报错。

```js
// plugins/<my-plugin>/apps/menu.js
// 按钮菜单模板 —— ⚠️ 仅 QQBot 适配器可用
//
// 依据：
//   【用户确认】按钮消息只有 QQBot 适配器（plugins/adapter 里那套）支持；
//               OneBotv11 / ICQQ / Satori / Milky 等协议端发送按钮无效，或降级成纯文本。
//   【源码】    Miao 的 loader 有 `segment.button = () => ""` 兜底 → 不支持的端上
//               连报错都没有，按钮直接消失。排查「按钮没出来」先确认协议端。
//   第三方按钮文档的属性表 —— 该文档自身有字段冲突，见文件末尾「字段分歧」。
//
// 写法：segment.button(rows)，rows 是「行的数组」，每个元素是一行按钮数组。
// 注意：plugin / segment / logger 是 loader 注入的全局变量。

export class buttonMenu extends plugin {
  constructor() {
    super({
      name: "按钮菜单",
      dsc: "QQBot 多行按钮示例（仅 QQBot 适配器）：#按钮菜单",
      event: "message",
      priority: 5000,
      rule: [{ reg: "^#按钮菜单$", fnc: "menu", permission: "all" }],
    })
  }

  async menu() {
    // ── 第 1 行：指令按钮 ──
    // 点击后把 input 里的文本当普通消息发出去；enter: true = 立即发送，不用用户再按发送键。
    const row1 = [
      { text: "签到", input: "#签到", style: 1, enter: true },
      { text: "帮助", input: "#帮助", style: 1, enter: true },
    ]

    // ── 第 2 行：输入按钮 ──
    // enter: false = 只把文本填进输入框，用户可以接着补充内容再发（适合需要带参数的指令）。
    const row2 = [
      { text: "搜图", input: "#搜图 ", style: 2, enter: false },
    ]

    // ── 第 3 行：链接按钮 ──
    // 直接跳转外部链接，不经过机器人；link 与 input / callback 三选一。
    const row3 = [
      { text: "查看文档", link: "https://github.com/TimeRainStarSky/Yunzai", style: 4 },
    ]

    const rows = [row1, row2, row3]

    // 只想「发出去给人点」时，到这一步就够了。
    // 若还需要接收点击事件（而不是当普通消息派发给 rule），给按钮加 toCallback: true。
    // 如果你的适配器是可变参数实现（segment.button(row1, row2, …)），
    // 把下面这行改成 segment.button(...rows) 即可，行结构完全一样。
    const button = segment.button(rows)

    // 非 QQBot 端这里发出去基本等于空消息：建议同插件兼容多端时先判断协议端，
    // 非 QQBot 改发纯文本菜单（判断方式以你所用版本的实际字段为准）。
    return this.reply(button)
  }
}

/* ───────────── 硬约束（超了不报错，只是多发一条消息） ─────────────
 * 每行按钮数：最多 10 个
 * 行数：      最多 5 行
 * 超出：      自动另发一条消息
 * text：      必填
 * style：     1–4（颜色 / 样式档位）
 * 动作三选一：input（点击发送或填入文本）/ link（跳转链接）/ callback（平台已砍，勿用）
 *
 * ───────────── 字段分歧（第三方文档自相矛盾） ─────────────
 * 1) 属性表写 enter，部分示例却写 send: true；
 * 2) 属性表写 style，个别示例又写 reply: 1。
 * 本模板以【属性表】为准 → style + enter。
 * 若你的协议端不认这两个键，按实测结果改，不要盲信任何一份文档。
 *
 * 另：callback 已被平台砍掉，写了也不会触发自动发送；
 *     需要「点击即发消息」用 input + enter，需要「接收点击事件」用 toCallback。
 */
```

---

## 13 新建插件落地清单

1. `mkdir -p plugins/my-plugin/{apps,model,resources/html}`
2. 写 `index.js`（照 12.2）
3. 写 `apps/xxx.js`（照 12.1）
4. 需要依赖 → 写 `package.json`（`"type":"module"` + `dependencies`）→ 根目录 `pnpm i`
5. 需要配置 → `makeConfig`，文件落 `config/my-plugin.yaml`
6. 需要出图 → 装 `miao-plugin`，`resources/html/*.html` + `renderImg`
7. 需要按钮 → 确认是 QQBot 适配器，照 12.5
8. `node .` 起服务，看日志里是否出现 `[Plugin] 加载插件 [...]`

---

## 14 未取得与未验证

- **官方插件开发规范**：不存在。`docs` 分支只有运行时对象 API 表。**【文档】**
- **`package.json` 必填字段规定**：没有。`name` 普遍有，`description` 可无，genshin 连文件都没有。**【推断】**
- **插件索引仓库**：不存在，安装清单是 `install.js` 硬编码。**【源码】**
- **原版 `Le-niao/Yunzai-Bot`**：GitHub 403（TOS blocked），未取到源码，差异对比以 Miao 为基线。**【未取得】**
- `plugins/other/update.js`、`plugins/system/add.js`：仅确认存在，内容未读。**【未取得】**
- `renderers/`、`data/`：目录存在，作用未确认。**【未取得】**
- **按钮消息的适用范围**来自使用者确认，未从源码验证；按钮字段名存在文档冲突，以实测为准。**【用户确认】**
- 上述结论均来自源码与示例阅读，**未实际启动 bot 运行验证**。
