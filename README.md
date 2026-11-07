# trss-yunzai-plugin-skill

TRSS-Yunzai 插件开发 Skill，给 AI 编码助手用，也可当人类可读的手册。

TRSS-Yunzai = [`TimeRainStarSky/Yunzai`](https://github.com/TimeRainStarSky/Yunzai)（v3.x，ESM，基于 Miao-Yunzai 的多协议端 Yunzai 应用端）。

**为什么需要它**：TRSS-Yunzai 官方没有插件开发文档——`docs` 分支只有一个运行时对象 API 表，开头写着「开发文档咕咕咕中」。所以本仓库的规则是**读框架源码 + 官方/主流插件仓库**反推出来的，每条都标了依据。

## 目录

```
SKILL.md                        # 主文档（frontmatter + 12 节规则，AI 入口）
reference/
  loader-internals.md           # loader 加载/分发/权限/定时任务/热重载细节
  migration-miao.md             # Miao-Yunzai ↔ TRSS 迁移检查表
templates/
  minimal-plugin.js             # 最小可跑插件（rule + 权限 + 上下文）
  apps-index.js                 # index.js 聚合 apps/
  task-plugin.js                # task 定时任务
  config-render-plugin.js       # makeConfig 配置 + renderImg 渲染
```

## 怎么用

**给 AI 助手（Claude Code / Trae / 其他支持 Agent Skill 的工具）**

把本仓库作为 skill 安装到你的 skills 目录即可，例如：

```bash
git clone https://github.com/huliaiya/trss-yunzai-plugin-skill.git \
  ~/.claude/skills/trss-yunzai-plugin-dev     # 或 .trae/skills/trss-yunzai-plugin-dev
```

之后说「给 TRSS-Yunzai 写个 XX 插件」「这个 Yunzai 插件加载不了」这类话，它就会读 `SKILL.md` 并按里面的规则给你代码。

**给人类**

直接读 `SKILL.md`。要动手写插件时，从 `templates/minimal-plugin.js` 起步，按第 11 节的落地顺序往下搭。

## 内容覆盖

- 目录分工：`lib/plugins/` 是内核，`plugins/` 放插件
- 加载规则：有 `index.js` 只加载它，否则平铺加载 `*.js`；`module.apps` 聚合
- 基类 `plugin`：`rule` / `task` / `accept` / `setContext` / `addCleanup` / `renderImg`
- `apps/` 聚合模式（社区事实标准，非框架强制）
- `package.json`：可以不写；依赖靠 `pnpm-workspace.yaml` 的 `plugins/**`
- 配置：`makeConfig` → `config/<name>.yaml`，或自己读写 YAML
- 渲染：`e.runtime.render` / `this.renderImg`，**强依赖 miao-plugin** 的 layout
- 安装：`plugins/other/install.js` 里硬编码 23 个仓库，没有中心索引
- 与 Miao-Yunzai / 原版 Yunzai 的差异（含逐文件 diff 结论）
- 12 条高频坑
- 未取得 / 未验证清单（官方文档不存在、原版仓库 403、`update.js` 未读等）

## 标注约定

| 标记 | 含义 |
| --- | --- |
| **【源码】** | 可直接在 `lib/plugins/*.js` 读到 |
| **【文档】** | 官方 README / docs 分支明说 |
| **【示例】** | 从插件仓库归纳，框架未强制 |
| **【未验证】** | 推断或未实际运行 |

## 说明

结论基于阅读 TRSS-Yunzai `main` 分支（v3.1.3）源码，**未实际启动 bot 运行验证**。框架演进后以源码为准。

