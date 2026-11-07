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

// 若想同时暴露命令，可在 constructor 的 rule 里加：
// rule: [{ reg: "^#测试推送$", fnc: "trigger", permission: "master" }]