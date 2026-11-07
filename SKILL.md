---
name: "trss-yunzai-plugin-dev"
description: "TRSS-Yunzai 插件开发指南与模板：目录分工、loader 加载规则、plugin 基类与 rule/task/accept、apps 聚合、YAML 配置、e.runtime 渲染、pnpm workspace 依赖、与 Miao-Yunzai 的差异及高频坑。当用户要新建/修改/调试/迁移 TRSS-Yunzai（TimeRainStarSky/Yunzai）插件时触发。"
---

# TRSS-Yunzai 插件开发

TRSS-Yunzai = `TimeRainStarSky/Yunzai`，基于 Miao-Yunzai 的多协议端 Yunzai 应用端（v3.x，ESM）。
**官方没有插件开发文档**（`docs` 分支只有 Bot/群/好友/segment 的运行时对象 API 表，开头写「开发文档咕咕咕中」），所以本 Skill 的规则全部来自框架源码与官方示例仓库。

标注约定（全文适用）：

- **【源码】** = 可直接在 `lib/plugins/*.js` 里读到
- **【文档】** = 官方 README / docs 分支明说
- **【示例】** = 从官方/主流插件仓库归纳，框架并未强制
- **【未验证】** = 推断或未实际运行

---

## 0. 先判断：这是 TRSS 还是别的 Yunzai

动手前先看根目录 `package.json` 的 `name`：

| `name` | 框架 | 消息库 |
| --- | --- | --- |
| `trss-yunzai` | TRSS-Yunzai | `oicq` |
| `miao-yunzai` | Miao-Yunzai | `icqq` |
| `yunzai` | 原版 Yunzai-Bot | `oicq` |

**【源码】** `lib/config/config.js` 会读 `package.json`；示例插件里也用它判断页脚（`Yunzai-genshin/model/base.js`）。
`Le-niao/Yunzai-Bot` 在 GitHub 已 403（TOS blocked），原版源码取不到，只能以 Miao 为基线。

---

## 1. 目录分工：`lib/plugins/` 是内核，`plugins/` 放插件

**【源码】**

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
- `plugins/adapter/*` 是协议端插件（不是「示例」），`#安装` 装的是 `plugins/<插件名>/`。
- `plugins/` 下每个子目录就是一个「插件包」（pnpm workspace 包）。

---

## 2. 加载规则（最容易被忽略的一段）

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

其它加载行为（均【源码】）：

- `init()` 返回字符串 `"return"` → **整个插件跳过加载**（不是跳过某条规则）。
- `rule[].reg` 若是字符串，自动 `new RegExp()`。
- `priority` 默认 `5000`，**数字越小越先执行**；`-Infinity` 用于抢在最前（内置 `#安装` 就是这么写的）。
- 群聊消息必须 @机器人、或命中 `groupCfg.botAlias` 前缀，才会进入 rule 匹配（`only_reply_at`）。
- rule 的 `fnc` 返回 `false` → 继续匹配该插件下一条 rule；返回其它值 / undefined → 直接 `return` 结束分发。
- `accept()` 在该插件所有 rule 之前执行；返回 `"return"` 中断全部、返回真值 break 后续。
- 上下文命中优先：`getContext()` 有值时直接调用上下文回调并 `return`；回调返回 `"continue"` 才继续往下走。
- `task` 的 `fnc()` **没有 `e` 参数**，必须自己 `Bot.pickGroup(...)`。
- 单个插件 `init()` 超时会打 `插件加载超时`（阈值 `cfg.bot.plugin_load_timeout`）。
- 热重载：chokidar 监听 `plugins/<dir>/<file>.js`，按 `namespace` 卸载后重新注册；新增目录也会被加载。
- 缺依赖**不会崩**：捕获 `Cannot find package` 后提示 `pnpm i` / 进插件目录 `pnpm add`。

---

## 3. 基类 `plugin`：写什么、怎么调

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

---

## 4. `apps/` 聚合模式（社区事实标准）

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

## 5. `package.json`：可以不写

- 框架**不读**插件的 `package.json`（loader 里没有任何 package.json 逻辑）。**【源码】**
- 证据：`Yunzai-genshin` 完全没有 `package.json` 也能跑；`TRSS-Plugin` 只有 `name/type/author/dependencies/scripts`，**没有 `description`**。**【示例】**
- 结论：**没有第三方依赖就不写**；有依赖（`qrcode`、`cheerio`、`sharp`…）才写 `dependencies` + `"type": "module"`。**【示例推断】**
- 依赖安装靠 **pnpm workspace**：`pnpm-workspace.yaml` 里 `packages: plugins/**`，根目录 `pnpm i` 会一并装所有插件的依赖。所以文档里那句「安装插件后请 `pnpm i`」是有效的。**【源码】**
- `#miao` 这个别名定义在**本体** package.json 的 `imports` 里（指向 `plugins/miao-plugin/components/index.js`），插件不能自带；插件想要别名得在自己 package.json 里写（yenai 的 `#yenai.*`）。**【源码 + 示例】**

---

## 6. 配置管理

两条路，框架都接受：

**A. 用框架助手（推荐）** —— `lib/plugins/config.js`**【源码】**

```js
// 路径深度取决于文件位置：plugins/<name>/apps/x.js → ../../../lib/plugins/config.js
import makeConfig from "../../../lib/plugins/config.js"

const { config, configSave } = await makeConfig(
  "my-plugin",                                  // → config/my-plugin.yaml
  { enable: true, prefix: "#", api: { key: "" } },// 默认值
  {},                                            // keep：不允许被文件覆盖
  { watch: true },                               // chokidar 热加载
)
```

返回 `{ config, configSave, configFile }`；`configSave` 内置 debounce；文件缺失/字段缺失会自动补全回写。

**B. 自己读写 YAML** —— `TRSS-Plugin/Model/config.js`：`YAML.parse("config/TRSS.yaml")` + `lodash.merge` + 不等则回写。**【示例】**

约定：**配置文件放本体 `config/<name>.yaml`，不放插件目录**（两种示例都这样）。默认值放 `config/default_config/`（本体）或 `defSet/`（genshin）。

---

## 7. 渲染：强依赖 miao-plugin

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

**不要照抄老 Miao 教程里的 `puppeteer.render(...)`**；TRSS 的插件层入口是 `e.runtime.render` / `this.renderImg`，puppeteer 在 `lib/puppeteer/` 属于内核。

模板约定：`resources/html/*.html` 里用 `{{extend defaultLayout}}` + `{{block 'css'}}` / `{{block 'main'}}`，资源引用用 `{{_res_path}}`/`pluResPath`。**【示例，genshin 的 resources 结构为参照】**

---

## 8. 插件安装 / 更新 / 生态

**【源码】** `plugins/other/install.js`

- **24 个仓库硬编码**在 `list` 常量里：`Atlas`、`genshin`、`DF-Plugin`、`ws-plugin`、`TRSS-Plugin`、`miao-plugin`、`Philia-Plugin`、`Guoba-Plugin`、`yenai-plugin`、`flower-plugin`、`xianyu-plugin`、`earth-k-plugin`、`useless-plugin`、`StarRail-plugin`、`xiaoyao-cvs-plugin`、`trss-xianxin-plugin`、`Telegram-Plugin`、`Discord-Plugin`、`WeChat-Plugin`、`QQBot-Plugin`、`Route-Plugin`、`ICQQ-Plugin`、`KOOK-Plugin`、`Secluded-Plugin`；另有 `map` 去掉 `-Plugin` 后缀做别名。
- `#安装插件` 列出未安装项；`#安装xxx` → `git clone --depth 1 --single-branch` 到 `plugins/<name>` → 若存在 `package.json` 则根目录 `pnpm install` → 重启。
- **没有中心插件索引仓库**；想装不在清单里的插件只能手动 `git clone` 到 `plugins/`。
- `plugins/other/update.js` 存在（8.8KB），**具体更新策略未读、未验证**。

---

## 9. 与 Miao-Yunzai / 原版 的差异（对 `plugin.js`、`loader.js` 做过 diff）

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

---

## 10. 高频坑清单

1. **有 `index.js` 就只加载它** —— `apps/` 没被 index.js 引入 = 完全没跑，且不报错。**【源码】**
2. **`index.js` 里写死 `./plugins/<仓库名>/apps`** —— 目录改名即挂。**【示例】**
3. **`init()` 返回 `"return"` 会整插件跳过**，别用它当「跳过某条规则」。**【源码】**
4. **群消息不 @ 也没有 `botAlias` 前缀 → 不进 rule**（`only_reply_at`），常被误判成正则问题。**【源码】**
5. **`e.msg` 只有文本**：图片在 `e.img`、文件在 `e.file`、回复在 `e.reply_id`/`e.getReply()`。**【源码】**
6. **`reg` 字符串自动转正则**，但反斜杠/特殊字符仍要自己转义。**【源码】**
7. **`task.fnc` 没有 `e`**，定时任务要自己 pick 群/好友。**【源码】**
8. **没装 miao-plugin → `renderImg` 静默失效**（插件不报错），先确认 `plugins/miao-plugin` 是否存在。**【源码】**
9. **缺依赖只打日志不崩**：先根目录 `pnpm i`；仍报错再 `cd plugins/<name> && pnpm add <包>`。**【源码】**
10. **`namespace` 与文件名不一致时热重载可能残留 handler**（卸载按 namespace 精确匹配）—— **【未验证】**，改插件后建议重启。
11. **`runtime.render` 的 tpl 路径不要带 `.html`**（源码里会 `replace(/.html$/, "")` 再拼）。**【源码】**
12. **别在 TRSS 里用 `segment.button`**：Miao 的 loader 有 `segment.button = () => ""` 兜底，TRSS 依赖 `oicq` 的导出，写法需按实际协议端确认。**【源码 + 未验证】**

---

## 11. 模板（可直接复制）

`templates/` 下四份，均已按上述规则写好，只需把 `<my-plugin>` 换成你的目录名：

| 文件 | 用途 |
| --- | --- |
| `templates/minimal-plugin.js` | 最小可跑插件：一条 rule + 权限 + 冷却 |
| `templates/apps-index.js` | `index.js` 聚合 `apps/`，含缺依赖提示 |
| `templates/task-plugin.js` | `task` 定时任务 + 主动推送 |
| `templates/config-render-plugin.js` | `makeConfig` 配置 + `renderImg` 渲染 + 图片发送 |

新建插件的落地顺序建议：

1. `mkdir -p plugins/my-plugin/{apps,model,resources/html}`
2. 写 `index.js`（照 `templates/apps-index.js`）
3. 写 `apps/xxx.js`（照 `templates/minimal-plugin.js`）
4. 需要依赖 → 写 `package.json`（`"type":"module"` + `dependencies`）→ 根目录 `pnpm i`
5. 需要配置 → `makeConfig`，文件落 `config/my-plugin.yaml`
6. 需要出图 → 装 `miao-plugin`，`resources/html/*.html` + `renderImg`
7. `node .` 起服务，看日志里 `[Plugin] 加载插件 [...]`

---

## 12. 未取得 / 未验证（如实告知用户）

- **官方插件开发规范**：不存在。`docs` 分支只有运行时对象 API 表。**【文档】**
- **`package.json` 必填字段规定**：没有。`name` 普遍有，`description` 可无，genshin 连文件都没有。**【推断】**
- **插件索引仓库**：不存在，安装清单是 `install.js` 硬编码。**【源码】**
- **原版 `Le-niao/Yunzai-Bot`**：GitHub 403（TOS blocked），未取到源码，差异对比以 Miao 为基线。**【未取得】**
- `plugins/other/update.js`、`plugins/system/add.js`：仅确认存在，内容未读。**【未取得】**
- `renderers/`、`data/`：目录存在，作用未确认。**【未取得】**
- 上述结论均来自源码与示例阅读，**未实际启动 bot 运行验证**。

---

## 附带资料

- `reference/loader-internals.md`：loader 分发流程、权限/冷却/事件匹配细节
- `reference/migration-miao.md`：Miao ↔ TRSS 双向迁移检查表
- `templates/*.js`：四份模板
