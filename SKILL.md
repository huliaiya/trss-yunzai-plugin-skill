---
name: "trss-yunzai-plugin-dev"
description: "TRSS-Yunzai / Miao-Yunzai / Yunzai-Bot plugin development: directory layout, loader rules, plugin base class (rule/task/accept), apps aggregation, YAML config, e.runtime rendering, pnpm workspace deps, QQBot button limits, pitfalls. 当用户要新建/修改/调试/迁移 TRSS-Yunzai（TimeRainStarSky/Yunzai）或 Yunzai 插件时触发。"
license: MIT
---

# TRSS-Yunzai 插件开发

TRSS-Yunzai = `TimeRainStarSky/Yunzai`，基于 Miao-Yunzai 的多协议端 Yunzai 应用端（v3.x，ESM）。
**官方没有插件开发文档**（`docs` 分支只有运行时对象 API 表，开头写「开发文档咕咕咕中」），所以规则全部来自框架源码与官方示例仓库。

标注约定：**【源码】** 源码可读 ｜ **【文档】** 官方明说 ｜ **【示例】** 从主流仓库归纳 ｜ **【用户确认】** 使用者实测确认 ｜ **【未验证】** 推断、未跑过。

配套文件：

- `reference/loader-internals.md` —— 启动加载、单消息分发 13 步、权限、事件匹配、定时任务、热重载
- `reference/migration-miao.md` —— Miao ↔ TRSS 差异表 + 双向迁移检查表
- `reference/ecosystem.md` —— 安装 / 更新 / 依赖 / 生态
- `templates/` —— 六份 `.js` 模板 + 一份 `package.json`
- 仓库根目录 `TRSS-Yunzai-插件开发指南.md` —— 以上内容合成的单文件版，用于转发给外部 AI

---

## 1. 目录分工：`lib/plugins/` 是内核，`plugins/` 放插件

**【源码】**

```
Yunzai/
├── package.json               # "type":"module"、imports: #miao -> plugins/miao-plugin/...
├── pnpm-workspace.yaml        # packages: plugins/**  → 每个插件都是 workspace 包
├── config/
│   ├── default_config/*.yaml  # bot/db/group/redis/renderer/server/satori/milky/other
│   └── <插件>.yaml            # 插件自己的配置也落在这里
├── lib/
│   ├── plugins/               # ★ 框架内核，不是插件目录
│   │   ├── loader.js          # 发现/加载/热重载/定时任务/权限/分发
│   │   ├── plugin.js          # 插件基类 plugin
│   │   ├── handler.js         # handler 注册表（namespace + key）
│   │   ├── config.js          # makeConfig 配置助手
│   │   └── runtime.js         # 每事件的 e.runtime（渲染 / Mys 封装）
│   └── puppeteer/  renderer/  common/
└── plugins/                   # ★ 用户插件根目录
    ├── adapter/               # 协议端：OneBotv11 ComWeChat GSUIDCore OPQBot Satori Milky stdin
    ├── system/  other/  example/
```

- `lib/plugins/` 里**没有任何用户插件**，改插件不要动它；`plugins/adapter/*` 是协议端插件。
- 每个 `plugins/<name>/` 子目录就是一个 pnpm workspace 包。
- 推荐结构：`index.js`（聚合）+ `apps/`（功能）+ `model/`（业务）+ `resources/html/`（出图）。

**先判断框架**（决定消息库与 API）：看根目录 `package.json` 的 `name` —— `trss-yunzai`（`oicq`）/ `miao-yunzai`（`icqq`）/ `yunzai`（原版，`oicq`）。**【源码】** `lib/config/config.js` 以 `cfg.package.name` 暴露。

---

## 2. 加载与分发要点

**【源码】** `lib/plugins/loader.js`

```js
// ① 有 plugins/<name>/index.js → 只加载它
if (await Bot.fsStat(`${this.dir}/${val.name}/index.js`)) { ... }
// ② 否则把该目录下所有 *.js 逐个加载
for (const app of apps) { if (app.name.endsWith(".js")) ret.push(...) }
// ③ 入口可导出 apps 聚合多个类
const app = module.apps ? { ...module.apps } : module
```

1. **有 `index.js` 就不会再看其它文件**。想让 `apps/` 生效，必须由 `index.js` 自己 `import` 它们。
2. 没有 `index.js` 时，目录下每个 `*.js` 都会被当插件加载（适合 2~3 个小插件）。
3. 一个文件可 `export class A`、`export class B`，多个类都会注册。
4. `global.plugin` / `global.segment` / `global.logger` / `global.Bot` 由 loader 注入，可以不 import 基类；显式 import 更稳（迁移时必需）。
5. `init()` 返回字符串 `"return"` → **整个插件跳过加载**（不是跳过某条规则）。
6. `rule[].reg` 是字符串时自动 `new RegExp()`。
7. `priority` 默认 `5000`，**越小越先**；`-Infinity` 抢最前（内置 `#安装` 就这么写）。
8. 群聊必须 @机器人、或命中 `groupCfg.botAlias` 前缀，才进入 rule 匹配（`only_reply_at`）。
9. `fnc` 返回 `false` → 继续下一条 rule；返回其它值 / undefined → 结束本次分发。
10. `accept()` 在该插件所有 rule 之前跑；返回 `"return"` 中断全部、返回真值 break 后续。
11. 上下文优先：`getContext()` 有值 → 直接调回调并 `return`；回调返回 `"continue"` 才继续。
12. `task.fnc()` **没有 `e` 参数**，要自己 `Bot.pickGroup(...)`；cron 是六段式（秒 分 时 日 月 周）。
13. 热重载按 `namespace` 卸载；缺依赖只打日志不崩（提示 `pnpm i` / `pnpm add`）。

> 分发全链路（13 步）、权限判定、`filtEvent` 逐段比对、handler 机制详见 [`reference/loader-internals.md`](./reference/loader-internals.md)。

---

## 3. 基类 `plugin`

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

| 字段 | 说明 |
| --- | --- |
| `rule[].reg` | 命令正则（字符串或 RegExp） |
| `rule[].fnc` | 方法名（字符串，不是函数） |
| `rule[].event` | 该规则的事件，默认继承 |
| `rule[].log` | `false` 时降到 debug 日志 |
| `rule[].permission` | `master` / `owner` / `admin` / `all` |
| `task[].name` / `.cron` / `.fnc` / `.log` | 需 `cron` + `fnc` 才生效 |

`e` 上可用：`e.msg`（仅文本段）、`e.img`、`e.file`、`e.reply_id` / `e.getReply()`、`e.atBot`、`e.at`、`e.isGroup`、`e.isPrivate`、`e.isMaster`、`e.self_id`、`e.group_id`、`e.user_id`、`e.sender`、`e.runtime`。**【源码】** `dealEvent`

**事件型插件不写 rule，只写 `accept()`**（`event` 不匹配时连 `accept()` 都不会执行）：

```js
export class newcomer extends plugin {
  constructor() {
    super({ name: "欢迎新人", dsc: "新人入群欢迎", event: "notice.group.increase" })
  }
  async accept() { if (this.e.user_id == this.e.self_id) return; await this.reply("欢迎新人！") }
}
```

事件串 = `post_type.<message_type|notice_type|request_type>.<sub_type>`，支持 `*` 通配。**【源码】** `filtEvent`

---

## 4. `apps/` 聚合模式（社区事实标准）

`apps/`（大写 `Apps/` 也行）**不是框架目录**，loader 只认 `index.js`；它是 `index.js` 主动读出来的约定。**【源码 + 示例】**

```js
const files = fs.readdirSync("./plugins/my-plugin/apps").filter(f => f.endsWith(".js"))
const ret = await Promise.allSettled(files.map(f => import(`./apps/${f}`)))
export const apps = {}
for (let i in files) apps[files[i].replace(".js", "")] = ret[i].value[Object.keys(ret[i].value)[0]]
```

| 仓库 | 入口 | 目录 | 备注 |
| --- | --- | --- | --- |
| [TRSS-Plugin](https://github.com/TimeRainStarSky/TRSS-Plugin) | `index.js` | `Apps/ Model/ Resources/ Picture/` | 大写 `Apps`；自检 `process.version < v18` |
| [Yunzai-genshin](https://github.com/TimeRainStarSky/Yunzai-genshin) | `index.js` | `apps/ model/ defSet/ resources/` | **无 package.json**；`defSet/*.yaml` 做默认配置 |
| [yenai-plugin](https://github.com/yeyang52/yenai-plugin) | `index.js` | `apps/ apps/events/ components/ config/ …` | 有 `package.json#imports`、guoba 配置界面 |

⚠️ 三者的 `index.js` 都把路径**写死**成 `./plugins/<仓库名>/apps`，仓库目录一改名就加载失败（最高频线上故障）。完整带错误提示的写法见 [`templates/apps-index.js`](./templates/apps-index.js)。

---

## 5. `package.json` 与依赖

- 框架**不读**插件的 `package.json`；**没有第三方依赖就不写**（`Yunzai-genshin` 连文件都没有）。**【源码 + 示例】**
- 有依赖才写 `dependencies` + `"type": "module"`，最小样例见 [`templates/package.json`](./templates/package.json)。
- 依赖靠 **pnpm workspace**：`packages: plugins/**`，根目录 `pnpm i` 一并安装。**【源码】**
- `#miao` 别名定义在**本体** `package.json` 的 `imports` 里，插件不能自带；插件要自己的别名写在自己的 `package.json`。

---

## 6. 配置管理

**A. 框架助手（推荐）** —— `lib/plugins/config.js`**【源码】**

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

返回 `{ config, configSave, configFile }`；`configSave` 内置 debounce；字段缺失会自动补全回写。

**B. 自己读写 YAML** —— `YAML.parse("config/TRSS.yaml")` + `lodash.merge` + 不等则回写。**【示例】**

约定：**配置放本体 `config/<name>.yaml`，不放插件目录**；默认值放 `config/default_config/` 或 `defSet/`。

---

## 7. 渲染：强依赖 miao-plugin

**【源码】** `lib/plugins/runtime.js` / `plugin.js`

```js
await this.e.runtime.render("my-plugin", "html/my-page", data, { retType: "base64" }) // 返回图
await this.renderImg("my-plugin", "html/my-page", data)                              // 基类快捷方式
```

- 自动推导 `tplFile = ./plugins/<plugin>/resources/<tpl>.html`；tpl 路径**不要带 `.html`**。
- 自动注入 `defaultLayout` → **`plugins/miao-plugin/resources/common/layout/default.html`**、`_miao_path`、`pluResPath`。
- `cfg.retType`：`"base64"` 返回图 / `"msgId"` 返回消息 id / 缺省自动发送并返回 `true`。
- 没装 miao-plugin 时 `plugin.js` 的动态 import 失败被 try/catch 吞掉 → 插件照常加载，**渲染静默失效**。
- **不要用 `puppeteer.render(...)`**（老 Miao 教程写法），puppeteer 在 `lib/puppeteer/` 属于内核。
- 模板用 `{{extend defaultLayout}}` + `{{block 'css'}}` / `{{block 'main'}}`。完整示例见 [`templates/config-render-plugin.js`](./templates/config-render-plugin.js)。

### 按钮消息：只有 QQBot 适配器能用

**【用户确认】** 按钮消息仅支持 **QQBot 适配器**；OneBotv11 / ICQQ / Satori / Milky 等端**不支持**，发出去要么无效、要么降级成纯文本。

容易误判的原因：Miao 的 loader 有 `segment.button = () => ""` 兜底（**【源码】**）→ 不支持的端上**不报错**，按钮直接消失。

写法 `segment.button(rows)`，示例见 [`templates/button-plugin.js`](./templates/button-plugin.js)。

| 约束 | 值 |
| --- | --- |
| 每行按钮数 | 最多 **10** 个 |
| 行数 | 最多 **5** 行 |
| 超出 | 自动**另发一条**消息，不报错 |
| `text` | 必填 |
| `style` | `1`–`4` |
| 三种动作 | `callback` / `input` / `link`，三选一 |
| `callback` | **平台已砍**，改用 `input` 或 `toCallback` |

⚠️ **字段分歧**：那份第三方按钮文档里，属性表写 `enter`，示例却用 `send: true`；属性表写 `style`，个别示例又写 `reply: 1`。模板**以属性表为准（`style` + `enter`）**，实际以你所用协议端实测为准。

---

## 8. 高频坑清单

1. **有 `index.js` 就只加载它** —— `apps/` 没被引入 = 完全没跑，且不报错。**【源码】**
2. **`index.js` 写死 `./plugins/<仓库名>/apps`** —— 目录改名即挂。**【示例】**
3. **`init()` 返回 `"return"` 会整插件跳过**，别拿它当「跳过某条规则」。**【源码】**
4. **群消息不 @ 也没 `botAlias` 前缀 → 不进 rule**（`only_reply_at`），常被误判成正则问题。**【源码】**
5. **`e.msg` 只有文本**：图片在 `e.img`、文件在 `e.file`、回复在 `e.reply_id` / `e.getReply()`。**【源码】**
6. **`reg` 字符串自动转正则**，但反斜杠 / 特殊字符仍要自己转义。**【源码】**
7. **`task.fnc` 没有 `e`**，定时任务要自己 pick 群 / 好友。**【源码】**
8. **没装 miao-plugin → `renderImg` 静默失效**，先确认 `plugins/miao-plugin` 存在。**【源码】**
9. **缺依赖只打日志不崩**：先根目录 `pnpm i`；仍报错再 `cd plugins/<name> && pnpm add <包>`。**【源码】**
10. **`namespace` 与文件名不一致时热重载可能残留 handler** —— **【未验证】**，改完建议重启。
11. **`runtime.render` 的 tpl 路径不要带 `.html`**（源码会 `replace(/.html$/, "")` 再拼）。**【源码】**
12. **按钮只有 QQBot 适配器能用**【用户确认】，其它端静默失效；见 §7 与 `templates/button-plugin.js`。

---

## 9. 模板索引

`templates/` 下七份，把 `<my-plugin>` 换成你的目录名即可：

| 文件 | 用途 |
| --- | --- |
| `minimal-plugin.js` | 最小可跑插件：两条 rule + 权限 + 上下文 |
| `apps-index.js` | `index.js` 聚合 `apps/`，含缺依赖提示 |
| `task-plugin.js` | `task` 定时任务 + 主动推送 |
| `config-render-plugin.js` | `makeConfig` 配置 + `renderImg` 渲染 + 模板片段 |
| `button-plugin.js` | **仅 QQBot 适配器**的多行按钮菜单 |
| `event-plugin.js` | 事件型插件：`accept()`、通配 `event`、按 `sub_type` 分流 |
| `package.json` | 可选的最小依赖声明（`"type":"module"`） |

落地顺序：

1. `mkdir -p plugins/my-plugin/{apps,model,resources/html}`
2. 写 `index.js`（照 `apps-index.js`），`PLUGIN` 常量必须等于目录名
3. 写 `apps/xxx.js`（照 `minimal-plugin.js` / `event-plugin.js`）
4. 有依赖 → `package.json`（照 `package.json`）→ 根目录 `pnpm i`
5. 要配置 → `makeConfig`；要出图 → 装 `miao-plugin` + `resources/html/*.html` + `renderImg`
6. `node .` 起服务，日志里应出现 `[Plugin] 加载插件 [...]`

---

## 10. 未取得 / 未验证

- 官方插件开发规范**不存在**（`docs` 分支只有运行时对象 API 表）。**【文档】**
- 原版 `Le-niao/Yunzai-Bot` 在 GitHub 403（TOS blocked），差异对比以 Miao 为基线。**【未取得】**
- `plugins/other/update.js`、`plugins/system/add.js` 只确认存在，内容未读；`renderers/`、`data/` 作用未确认。**【未取得】**
- `namespace` 热重载残留**【未验证】**；按钮字段名存在文档冲突，以实测为准。**【用户确认】**
- 所有结论来自源码与示例阅读，**未实际启动 bot 运行验证**。
