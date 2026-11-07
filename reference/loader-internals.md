# loader 内部分发流程

对应文件：`lib/plugins/loader.js`（TRSS-Yunzai main 分支）。全部为**【源码】**结论。

## 1. 启动加载

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

`namespace` 默认 = `<目录>/<文件名>`（如 `genshin/apps/dailyNote.js`）；也可以由插件自己传 `namespace`。

## 2. 单条消息分发（`deal`）

顺序固定：

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

## 3. 权限（`filtPermission`）

| 值 | 判定 |
| --- | --- |
| 不写 / `all` | 放行 |
| `master` | `e.isMaster`（`cfg.master[self_id]` 包含该 `user_id`） |
| `owner` | `e.member.is_owner` |
| `admin` | `is_owner || is_admin` |

不通过时**会主动回复**「暂无权限，只有主人/群主/管理员才能操作」，不是静默丢弃。

## 4. 事件匹配（`filtEvent`）

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

## 5. 定时任务

- `task` 可为对象或数组，只有同时具备 `cron` 和 `fnc` 才被收集。
- `i.name ??= 插件 name`；重复 `name+cron` 会被跳过并 warn。
- 执行体是 `await i.fnc()`，**不传 `e`**。
- 用 `node-schedule` 的六段式 cron（秒 分 时 日 月 周）。

## 6. 热重载与卸载

- chokidar 监听 `plugins/<dir>/<file>.js` 的 `change` → 卸载该 key 所有 plugin → 重新 import。
- 目录新增 → 自动加载。
- 卸载时按 `namespace` 调 `Handler.del(ns)`；plugin 的 `initializerMap` 里登记的 `addCleanup` 资源会被 `dispose()`。
- 热更新失败会尝试 `restore()` 恢复已停止的资源。

## 7. `handler`（可选的高级分发）

不是 rule 的替代品，而是给插件自己用的「具名处理器」：

```js
new MyPlugin()  // constructor: super({ ..., handler: { myKey: { fn: "onMyKey", key: "my-event", priority: 100 } }, namespace: "my-ns" })
// 之后任意地方（例如别的插件、定时任务）：
await this.e.runtime.handler.call("my-event", e, args)
```

`Handler.call` 按 priority 升序执行，返回非 reject 即停；处理函数签名 `(e, args, reject)`。
`Handler.callAll` 在源码里被注释掉了（暂时屏蔽）。
