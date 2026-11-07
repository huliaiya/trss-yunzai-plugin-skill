// plugins/<my-plugin>/apps/profile.js
// 配置 + 渲染模板
// 依据：
//   lib/plugins/config.js  → makeConfig(name, default, keep, { watch })
//   lib/plugins/plugin.js  → renderImg(plugin, tpl, data, cfg)
//   lib/plugins/runtime.js → 自动注入 defaultLayout（指向 plugins/miao-plugin/resources/common/layout/default.html）
//   示例：Yunzai-genshin/model/base.js、apps/dailyNote.js

import makeConfig from "../../../lib/plugins/config.js"

// ① 配置：首次启动自动创建 config/my-plugin.yaml 并补全缺失字段
const DEFAULT = {
  enable: true,
  title: "我的名片",
  footer: "Powered by TRSS-Yunzai",
  colors: { primary: "#4a6cf7" },
}
const { config } = await makeConfig("my-plugin", DEFAULT, {}, { watch: true })

export class profile extends plugin {
  constructor() {
    super({
      name: "名片",
      dsc: "配置 + 图片渲染示例：#我的名片",
      event: "message",
      priority: 100,
      rule: [{ reg: "^#我的名片$", fnc: "show", permission: "all" }],
    })
  }

  async show() {
    if (!config.enable) return this.reply("名片功能已关闭（config/my-plugin.yaml → enable）")

    const data = {
      title: config.title,
      footer: config.footer,
      primary: config.colors.primary,
      uid: this.e.user_id,
      nickname: this.e.sender?.card || this.e.sender?.nickname || String(this.e.user_id),
      avatar: this.e.sender?.avatar,
      time: new Date().toLocaleString("zh-CN"),
    }

    // ② 渲染：模板文件放在 plugins/my-plugin/resources/html/profile.html
    //    传 "html/profile"，不要带 .html（runtime 会自己拼 tplFile）
    //    retType: "base64" → 返回图片数据；缺省 → 自动发送并返回 true
    try {
      return await this.renderImg("my-plugin", "html/profile", data)
    } catch (err) {
      // 没装 miao-plugin 时 renderImg 会静默失效或抛错，降级成纯文本
      logger.error("[名片] 渲染失败，检查是否已安装 miao-plugin", err)
      return this.reply(`${data.nickname}（${data.uid}）\n${data.title}\n${data.time}`)
    }
  }
}

/* plugins/my-plugin/resources/html/profile.html —— 最小模板
{{extend defaultLayout}}

{{block 'css'}}
<style>
  .card { padding: 24px; background: #fff; border-radius: 12px; }
  .card h1 { color: {{primary}}; }
</style>
{{/block}}

{{block 'main'}}
<div class="card">
  <h1>{{title}}</h1>
  <p>{{nickname}}（{{uid}}）</p>
  <p>{{time}}</p>
  <small>{{footer}}</small>
</div>
{{/block}}
*/