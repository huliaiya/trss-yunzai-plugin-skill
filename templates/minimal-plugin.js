// plugins/<my-plugin>/apps/hello.js
// 最小可跑插件：一条 rule + 权限 + 冷却 + 上下文
// 依据：lib/plugins/plugin.js（构造参数与方法）、lib/plugins/loader.js（分发/权限/冷却）

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