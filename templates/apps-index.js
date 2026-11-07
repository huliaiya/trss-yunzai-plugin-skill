// plugins/<my-plugin>/index.js
// 聚合 apps/ 下的每个文件，导出给 loader 的 `apps` 对象
// 依据：lib/plugins/loader.js#getPlugins + importPlugin（module.apps 分支）
//      Yunzai-genshin/index.js、TRSS-Plugin/index.js（同样的聚合写法）

import fs from "node:fs"

const PLUGIN = "my-plugin"                 // ★ 必须与 plugins/ 下的目录名完全一致
const APPS_DIR = `./plugins/${PLUGIN}/apps`

const files = fs.readdirSync(APPS_DIR).filter(f => f.endsWith(".js"))
const results = await Promise.allSettled(files.map(f => import(`./apps/${f}`)))

export const apps = {}

for (let i = 0; i < files.length; i++) {
  const name = files[i].replace(/\.js$/, "")
  const r = results[i]

  if (r.status !== "fulfilled") {
    // 缺依赖时给出可执行提示（与 loader.packageTips / yenai 的 handleError 一致）
    const msg = String(r.reason?.message || r.reason)
    const miss = msg.match(/'(.+?)'/g)?.[0]?.replace(/'/g, "")
    if (miss && msg.includes("Cannot find package")) {
      logger.warn(`[${PLUGIN}] ${name} 缺少依赖 ${miss}，请在根目录 pnpm i，或 cd plugins/${PLUGIN} && pnpm add ${miss}`)
    } else {
      logger.error(`[${PLUGIN}] 载入插件错误：${name}`)
      logger.error(r.reason)
    }
    continue
  }

  // 取该文件导出的第一个 class；多导出时改为显式映射更稳
  const key = Object.keys(r.value).find(k => typeof r.value[k] === "function")
  if (!key) {
    logger.warn(`[${PLUGIN}] ${name} 没有导出 class，已跳过`)
    continue
  }
  apps[name] = r.value[key]
}

logger.info(`[${PLUGIN}] 已加载 ${Object.keys(apps).length}/${files.length} 个 app`)