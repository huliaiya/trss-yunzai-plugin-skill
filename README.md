# trss-yunzai-plugin-skill

> 给 AI 编码助手（Claude Code / Trae / 任何支持 Agent Skill 的工具）用的 **TRSS-Yunzai 插件开发 Skill**，
> 同时也可以当人类可读的开发手册。

TRSS-Yunzai 指 [`TimeRainStarSky/Yunzai`](https://github.com/TimeRainStarSky/Yunzai)：v3.x、ESM、基于 Miao-Yunzai 的多协议端 Yunzai 应用端。

---

## 这个项目解决什么问题

**TRSS-Yunzai 官方没有插件开发文档。** 它的 `docs` 分支只有一个 `README.md`，内容是 Bot / 好友 / 群 / 群成员 / 频道 / segment 的运行时对象 API 表，开头写着「开发文档咕咕咕中」。

于是想写 TRSS 插件的人只能：

- 翻 `lib/plugins/loader.js`、`plugin.js` 猜加载规则和基类字段；
- 抄几个第三方插件，但抄到的写法互相矛盾（有的有 `package.json`、有的没有；有的用 `apps/`、有的平铺）；
- 踩到「有 `index.js` 就不加载其它文件」「没装 miao-plugin 渲染静默失效」这类不报错的坑。

本仓库做的事情就是：**把框架源码和官方/主流插件仓库读一遍，把隐式规则显式写下来**，每条结论都标注依据，并给一份 AI 可以直接照着生成代码的规范 + 五份模板。

---

## 适合谁用

- 想给 TRSS-Yunzai 写新插件，但不知道从哪个文件开始的人
- 手上有 Miao-Yunzai / 原版 Yunzai 插件，想迁到 TRSS（或反向迁）的人
- 插件能加载但「命令没反应」「图渲染不出来」需要定位的人
- 让 AI 帮写插件，但希望它别乱编 API、别照抄旧教程 `puppeteer.render` 的人

不适合：想找「TRSS 官方插件开发指南」的人——它不存在；本仓库是**逆向整理**，不是官方文档。

---

## 目录结构

```
.
├── SKILL.md                      # 主文档：frontmatter + 12 节规则（AI 的入口）
├── README.md                     # 本文件
├── reference/
│   ├── loader-internals.md       # loader 的加载 / 分发 / 权限 / 定时任务 / 热重载顺序
│   └── migration-miao.md         # Miao-Yunzai ↔ TRSS 双向迁移检查表
└── templates/
    ├── minimal-plugin.js         # 最小可跑插件：rule + 权限 + 上下文 + recallMsg
    ├── apps-index.js             # index.js 聚合 apps/，含缺依赖提示
    ├── task-plugin.js            # task 定时任务（无 e 参数，需自己 pickGroup）
    ├── config-render-plugin.js   # makeConfig 配置 + renderImg 渲染 + 模板片段
    └── button-plugin.js          # 多行按钮菜单（仅 QQBot 适配器）
```

- **`SKILL.md`** 是唯一必须读的文件。它自带 `name` / `description`（description 里写明了触发场景），AI 工具靠这个判断何时加载。
- **`reference/`** 是深水区，`SKILL.md` 里需要细节时会指向它们，避免主文档被细节淹没。
- **`templates/`** 是可直接复制改名的骨架，五份分别覆盖「最小插件 / 多文件聚合 / 定时任务 / 配置+渲染 / QQBot 按钮菜单」五种典型形态。

---

## 安装

**方式一：装成 Agent Skill（推荐）**

```bash
git clone https://github.com/huliaiya/trss-yunzai-plugin-skill.git \
  ~/.claude/skills/trss-yunzai-plugin-dev
```

Trae 用户放到工作区的 skills 目录：

```bash
git clone https://github.com/huliaiya/trss-yunzai-plugin-skill.git \
  .trae/skills/trss-yunzai-plugin-dev
```

> 目录名建议用 `trss-yunzai-plugin-dev`，与 `SKILL.md` 的 `name` 保持一致。

**方式二：只用模板**

```bash
git clone https://github.com/huliaiya/trss-yunzai-plugin-skill.git /tmp/trss-skill
cp -r /tmp/trss-skill/templates/* <你的 Yunzai>/plugins/my-plugin/apps/
```

然后按 `SKILL.md` 第 11 节的落地顺序改：目录名 → `index.js` 里的 `PLUGIN` 常量 → `package.json`（有依赖才需要）。

---

## 怎么触发

`SKILL.md` 的 `description` 写的是：目录分工、loader 加载规则、plugin 基类与 rule/task/accept、apps 聚合、YAML 配置、e.runtime 渲染、pnpm workspace 依赖、与 Miao-Yunzai 的差异及高频坑；**当用户要新建 / 修改 / 调试 / 迁移 TRSS-Yunzai 插件时触发**。

实际会说这类话：

- 「给 TRSS-Yunzai 写个每日天气推送插件，带开关配置」
- 「这个插件放进去没反应，日志里也没有报错」
- 「帮我把这个 Miao 的插件迁到 TRSS」
- 「TRSS 里怎么渲染图片？听说不用 puppeteer.render 了」
- 「`apps/` 和 `plugins/` 到底什么关系，`lib/plugins` 是插件目录吗」

---

## 典型用法

**示例 1：从零生成一个插件**

> **你**：给 TRSS-Yunzai 写一个「查快递」插件，命令 `#快递 单号`，需要把结果渲成图片，并且能在配置文件里换 API key。

它应当产出这样的骨架（而不是丢一个 `puppeteer.render` 的旧例子给你）：

```
plugins/express/
├── index.js                    # 照 templates/apps-index.js，聚合 apps/
├── apps/express.js             # 照 templates/config-render-plugin.js
├── resources/html/express.html # {{extend defaultLayout}} + {{block 'main'}}
└── package.json                # 有依赖（如 axios）才写，"type":"module"
```

并同时提醒你：`index.js` 里的 `PLUGIN` 必须等于目录名；`renderImg` 需要 `plugins/miao-plugin` 存在；配置会落到 `config/express.yaml`。

**示例 2：排查「命令没反应」**

> **你**：我写了 `reg: "^#测试$"`，私聊能触发，群里完全没反应。

它会按 `loader.js` 的分发顺序给出结论：群聊消息必须 @机器人或命中 `botAlias` 前缀（`only_reply_at`），否则连 `accept()` 都不会执行——而不是让你去改正则。

---

## 覆盖的 12 个主题

`SKILL.md` 的章节：

1. 先判断：这是 TRSS 还是 Miao / 原版（`package.json` 的 `name`）
2. 目录分工：`lib/plugins/` 是内核，`plugins/` 放插件
3. 加载规则：有 `index.js` 只加载它，否则平铺加载 `*.js`；`priority`、`init` 返回 `"return"`、群聊 @ 限制、热重载、缺依赖提示
4. 基类 `plugin`：构造字段、`reply` / `setContext` / `finish` / `addCleanup` / `renderImg`、`e` 上的字段、事件型插件
5. `apps/` 聚合模式：不是框架目录，是 `index.js` 主动读出来的约定（附三仓写法对比）
6. `package.json`：可以不写；依赖靠 `pnpm-workspace.yaml` 的 `plugins/**`
7. 配置管理：`makeConfig` → `config/<name>.yaml`，或自己读写 YAML
8. 渲染：`e.runtime.render` / `this.renderImg`，**强依赖 miao-plugin 的 layout**；按钮消息**仅 QQBot 适配器**可用
9. 插件安装 / 更新 / 生态：`plugins/other/install.js` 硬编码 24 个仓库，无中心索引
10. 与 Miao-Yunzai / 原版的差异（含逐文件 diff 结论表）
11. 12 条高频坑
12. 未取得 / 未验证清单 + 模板索引

---

## 标记约定

全文每个关键结论都带标记，方便你判断可信度：

| 标记 | 含义 |
| --- | --- |
| **【源码】** | 可直接在 `lib/plugins/*.js` 里读到，可信度最高 |
| **【文档】** | 官方 README / `docs` 分支明说 |
| **【示例】** | 从官方/主流插件仓库归纳，框架并未强制 |
| **【用户确认】** | 使用者基于实际运行环境确认的事实，本次未从源码验证 |
| **【未验证】** | 推断，或未实际运行验证 |

---

## 已知限制

- **没有实跑 bot 验证**。所有结论来自阅读源码（TRSS-Yunzai `main` 分支 v3.1.3）与示例插件，未启动机器人跑过任何一条命令。框架演进后请以源码为准。
- **原版 Yunzai-Bot 取不到**。`Le-niao/Yunzai-Bot` 在 GitHub 返回 403（TOS blocked），所以「与原版的差异」实际是以 **Miao-Yunzai** 为基线做的 diff。
- **官方插件规范不存在**，本仓库是逆向整理；`package.json` 必填字段、插件索引仓库这两项都确认「没有」，而不是「没找到」。
- **未读完的部分**：`plugins/other/update.js`、`plugins/system/add.js` 只确认存在，内容未读；`renderers/`、`data/` 作用未确认。
- **按钮消息的适用范围是用户确认的**：只有 QQBot 适配器支持，其它协议端无效或降级成纯文本（**【用户确认】**，不是源码验证）。`namespace` 不一致导致热重载残留等少数结论仍标**【未验证】**，请按实际环境测试。

---

## 相关仓库

- [TimeRainStarSky/Yunzai](https://github.com/TimeRainStarSky/Yunzai) —— 本体，本仓库规则的主要来源
- [TimeRainStarSky/TRSS-Plugin](https://github.com/TimeRainStarSky/TRSS-Plugin) —— 官方插件，`Apps/` 大写目录 + 自写 YAML 配置的代表
- [TimeRainStarSky/Yunzai-genshin](https://github.com/TimeRainStarSky/Yunzai-genshin) —— 无 `package.json`、用 `defSet/*.yaml` 做默认配置的代表
- [yoimiya-kokomi/Miao-Yunzai](https://github.com/yoimiya-kokomi/Miao-Yunzai) —— 差异对比的基线

---

如果这个项目对你有帮助，欢迎点一个 ⭐ Star 支持一下～
