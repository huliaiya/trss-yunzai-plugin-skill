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
