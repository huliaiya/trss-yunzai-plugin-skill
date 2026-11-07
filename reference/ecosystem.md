# 插件安装、更新与生态

对应 `plugins/other/install.js`、`plugins/other/update.js`。除特别标注外均为**【源码】**。

## 一、内置安装清单

- **24 个仓库硬编码**在 `list` 常量里：`Atlas`、`genshin`、`DF-Plugin`、`ws-plugin`、`TRSS-Plugin`、`miao-plugin`、`Philia-Plugin`、`Guoba-Plugin`、`yenai-plugin`、`flower-plugin`、`xianyu-plugin`、`earth-k-plugin`、`useless-plugin`、`StarRail-plugin`、`xiaoyao-cvs-plugin`、`trss-xianxin-plugin`、`Telegram-Plugin`、`Discord-Plugin`、`WeChat-Plugin`、`QQBot-Plugin`、`Route-Plugin`、`ICQQ-Plugin`、`KOOK-Plugin`、`Secluded-Plugin`。
- 另有 `map` 常量把仓库名去掉 `-Plugin` 后缀做别名（如 `#安装yenai` → `yenai-plugin`）。
- `#安装插件` 列出未安装项。
- `#安装xxx` → `git clone --depth 1 --single-branch` 到 `plugins/<name>` → 若存在 `package.json` 则根目录 `pnpm install` → 提示重启。
- **没有中心插件索引仓库**；不在清单里的插件只能手动 `git clone` 到 `plugins/`。
- `plugins/other/update.js` 存在（8.8KB），**具体更新策略未读、未验证**。

## 二、手动安装

```bash
cd <Yunzai 根目录>
git clone --depth 1 https://github.com/<owner>/<repo>.git plugins/<name>
pnpm install          # 仅当插件带 package.json
node .                # 重启，日志出现 [Plugin] 加载插件 [...] 即成功
```

安装后自检三件事：

1. 目录名与插件 `index.js` 里写死的 `./plugins/<仓库名>/apps` 是否一致 —— 不一致直接加载失败。
2. 需要出图的插件是否已装 `plugins/miao-plugin`（否则 `renderImg` 静默失效）。
3. 指令是否按 `reg` 正确匹配，群聊是否 @ 了机器人（`only_reply_at`）。

## 三、依赖管理（pnpm workspace）

- `pnpm-workspace.yaml` 里 `packages: plugins/**`，所以根目录 `pnpm i` 会一并安装所有插件声明的依赖。**【源码】**
- 插件的 `package.json` 框架**不读**，只在 `pnpm i` 时由 pnpm 使用；没有第三方依赖就**不用写**。**【源码 + 示例】**
- 报 `Cannot find package 'xxx'` 时的处理顺序：

```bash
pnpm i                                 # ① 根目录，装所有 workspace 包
cd plugins/<name> && pnpm add xxx      # ② 仍不行，进插件目录单独装
```

- `#miao` 别名定义在**本体** `package.json` 的 `imports` 里，插件不能自带；插件要自己的别名得写在自己的 `package.json`（yenai 的 `#yenai.*`）。

## 四、生态现状

| 事实 | 依据 |
| --- | --- |
| 无中心插件索引仓库，安装清单是 `install.js` 硬编码 | **【源码】** |
| 无官方插件开发规范，`docs` 分支只有运行时对象 API 表 | **【文档】** |
| `package.json` 无必填字段规定；`Yunzai-genshin` 甚至没有该文件 | **【示例】** |
| 主流仓库多用 `index.js` + `apps/` 聚合（大写 `Apps/` 亦可） | **【示例】** |
