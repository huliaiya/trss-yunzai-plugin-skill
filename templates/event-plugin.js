// plugins/<my-plugin>/apps/welcome.js
// 事件型插件模板：不写 rule，只写 accept()
// 依据：lib/plugins/loader.js#filtEvent / deal
//
// 事件型插件的特点：
//   - 只有 event 匹配当前事件时才会执行；不匹配时连 accept() 都不会跑。
//   - accept() 在该插件所有 rule 之前执行：返回 "return" 中断本插件后续处理，
//     返回真值 break 掉后续，返回 undefined 继续。
//   - 不写 rule 完全合法，因为事件型插件靠 accept() 驱动，不靠命令正则。
// event 串 = post_type.<message_type|notice_type|request_type>.<sub_type>，支持 `*` 通配。
// 注意：plugin / logger / Bot 是 loader 注入的全局变量。

/** 只关心「有人入群」这一种事件：最简写法 */
export class welcome extends plugin {
  constructor() {
    super({
      name: "入群欢迎",
      dsc: "新人入群时自动发欢迎语",
      event: "notice.group.increase",   // post_type=notice, notice_type=group, sub_type=increase
      priority: 100,                    // 数字越小越先执行
    })
  }

  async accept() {
    const e = this.e
    // 机器人自己被拉进群时不欢迎
    if (e.user_id == e.self_id) return

    const groupId = e.group_id                       // 事件里一定带 group_id
    const nickname = e.sender?.card || e.sender?.nickname || String(e.user_id)

    // 想额外拿群名/群对象时自己 pick，别假设 e.group 一定存在（未验证）
    let groupName = ""
    try {
      groupName = (await Bot.pickGroup(groupId)).name || ""
    } catch (err) {
      logger.debug(`[入群欢迎] 取群名失败：${groupId}`, err)
    }

    // reply(msg, quote, data)：data.at 在群聊里 @ 新人
    return this.reply(
      `欢迎 ${nickname} 加入${groupName || groupId}！发送「#帮助」查看功能～`,
      false,
      { at: e.user_id },
    )
  }
}

/** 一个插件覆盖多种事件 + 自己区分事件类型：用通配 event，在 accept() 里看 sub_type */
export class groupMemberEvent extends plugin {
  constructor() {
    super({
      name: "入群退群通知",
      dsc: "同一条规则覆盖入群/退群，按 sub_type 分流",
      event: "notice.group.*",          // 通配：increase / decrease 都会进来
      priority: 200,
    })
  }

  async accept() {
    const e = this.e
    if (e.user_id == e.self_id) return

    switch (e.sub_type) {
      case "increase":
        return this.reply(`新人 ${e.user_id} 加入了群 ${e.group_id}`, false, { at: e.user_id })
      case "decrease":
        // 退群事件可能来自主动退群（operator_id），也可能被踢
        return this.reply(`成员 ${e.user_id} 离开了群 ${e.group_id}`)
      default:
        return
    }
  }
}

/* 常用事件串速查（event 字段直接填这些）
 * 私聊/群消息      message.group / message.private        （默认 event 就是 message）
 * 群成员增加/减少  notice.group.increase / notice.group.decrease
 * 群文件上传       notice.group.upload
 * 群禁言           notice.group.ban
 * 戳一戳           notice.notify.poke
 * 好友申请         request.friend
 * 群邀请/加群请求  request.group.invite / request.group.add
 */
