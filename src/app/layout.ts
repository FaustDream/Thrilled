/**
 * 出厂默认布局 + 网格算法（v4）
 *
 * 布局规则冻结在 docs/v4/02-UI规格.md §12.1：60px 单元格、24 列 × 10 行、
 * 卡片四边内缩 25px、仅六档尺寸、每页 100% 填满。用户改动只影响实例，
 * 出厂数据（DEFAULT_PAGES）只作为种入与「恢复默认」的来源。
 */
import type { GridItem, ModePages, WidgetKind, LayoutDoc } from '../shared/types'

export const CELL = 60
export const INSET = 25
export const COLS = 24
export const ROWS = 10
export const PAGE_W = 1920
export const STAGE_W = 1920
export const STAGE_H = 945
export const MAX_PAGES = 5

/** 卡片尺寸档位（单位数） */
export const SIZES: readonly { w: number; h: number }[] = [
  { w: 2, h: 2 }, { w: 2, h: 4 }, { w: 4, h: 2 }, { w: 4, h: 4 }, { w: 8, h: 4 }, { w: 8, h: 2 },
]

let seq = 0
export const uid = (): string => `i${Date.now().toString(36)}${(seq++).toString(36)}`

/** 实例工厂：只记录「引用哪个小组件」+ 自己的覆盖配置（默认值来自定义表） */
export const G = (c: number, r: number, w: number, h: number, t: WidgetKind, config: Record<string, unknown> = {}): GridItem =>
  ({ id: uid(), c, r, w, h, t, config })

/* ---------- 分区应用清单（一服务一入口：Dock 常驻的服务不出现在网格里） ---------- */
export const DOCK_APPS = ['音乐', '哔哩哔哩', '淘宝', '抖音', '小红书', '头像', '影视', '百度网盘']
const AI_APPS = ['豆包', 'Kimi', '秘塔AI搜索', '通义千问']
const AI_EXTRA = ['智谱清言', '讯飞星火', 'DeepSeek', '文心一言', '即梦AI', '可灵AI', 'ChatGPT', 'Claude']
const TOOL_APPS = ['翻译', '计算器', '截图', '二维码']
const STUDY_APPS = ['学习通', '网易公开课', '语雀', 'Notion']
const MEDIA_APPS = ['爱奇艺', '腾讯视频', '网易云音乐', 'YouTube']
const SHOP_APPS = ['京东', '天猫', '拼多多', '唯品会', '苏宁易购']
const GAME_APPS = ['Steam', 'TapTap']
const GAME2_APPS = ['Epic', '米游社']
const READ_APPS = ['得到', '微信读书', '多看阅读', '起点读书']
const MUSIC2_APPS = ['QQ音乐', '酷狗音乐']
const SOC_APPS = ['微信', '知乎']
const COMM_APPS = ['微博', 'V2EX']
const DEV_APPS = ['掘金', 'CSDN', 'Stack Overflow', 'Gitee', 'Figma', 'Dribbble', 'GitHub', 'V2EX', 'Stack Overflow']
const COOP_APPS = ['钉钉', '飞书', '腾讯文档', '石墨文档']
const CLOUD_APPS = ['OneDrive', 'Dropbox', '印象笔记', '坚果云']
const EFFI_APPS = ['便签', '快递', '记账', '汇率']
const VIDEO2_APPS = ['优酷', '芒果TV', '咪咕视频', '西瓜视频', '快手']

/** 出厂布局：标准模式两页（资讯与日程 / AI 与工具 / 娱乐与电商 / 时间与纪念 / 开发与效率）+ 隐私模式一页 */
const SEED: ModePages = [
  [
    G(0, 0, 8, 4, 'news'), G(8, 0, 4, 2, 'weather', { label: '天气' }),
    G(8, 2, 4, 2, 'todo', { label: '待办' }), G(12, 0, 4, 2, 'cal', { label: '日历' }),
    G(12, 2, 4, 2, 'countday', { label: '倒数日' }), G(16, 0, 4, 4, 'clock', { label: '时钟' }),
    G(20, 0, 2, 4, 'fav', { label: '收藏夹' }),
    G(22, 0, 2, 2, 'icon', { name: 'Gmail', label: 'Gmail' }),
    G(22, 2, 2, 2, 'icon', { name: 'GitHub', label: 'GitHub' }),
    G(0, 4, 4, 4, 'ai', { label: 'AI 助手' }),
    G(4, 4, 4, 4, 'group', { apps: AI_APPS, cols: 2, label: 'AI 工具' }),
    G(8, 4, 4, 4, 'group', { apps: TOOL_APPS, cols: 2, label: '效率工具' }),
    G(12, 4, 4, 4, 'group', { apps: STUDY_APPS, cols: 2, label: '学习文档' }),
    G(16, 4, 4, 4, 'group', { apps: MEDIA_APPS, cols: 2, label: '影音' }),
    G(20, 4, 4, 4, 'music', { label: '音乐' }),
    G(0, 8, 8, 2, 'group', { apps: SHOP_APPS, cols: 5, label: '购物' }),
    G(8, 8, 4, 2, 'group', { apps: GAME_APPS, cols: 2, label: '游戏' }),
    G(12, 8, 4, 2, 'group', { apps: SOC_APPS, cols: 2, label: '社交' }),
    G(16, 8, 4, 2, 'group', { apps: COMM_APPS, cols: 2, label: '社区' }),
    G(20, 8, 2, 2, 'icon', { name: '豆瓣', label: '豆瓣' }),
    G(22, 8, 2, 2, 'woodfish', { label: '木鱼' }),
  ],
  [
    G(0, 0, 8, 4, 'countdown', { label: '下班倒计时' }), G(8, 0, 8, 4, 'ann', { label: '纪念日' }),
    G(16, 0, 8, 2, 'quote', { label: '每日一言' }),
    G(16, 2, 4, 2, 'calc', { label: '计算器' }), G(20, 2, 4, 2, 'trans', { label: '翻译' }),
    G(0, 4, 8, 4, 'group', { apps: DEV_APPS, cols: 5, label: '开发' }),
    G(8, 4, 4, 4, 'group', { apps: COOP_APPS, cols: 2, label: '协作' }),
    G(12, 4, 4, 4, 'group', { apps: CLOUD_APPS, cols: 2, label: '网盘笔记' }),
    G(16, 4, 4, 4, 'group', { apps: EFFI_APPS, cols: 2, label: '生活工具' }),
    G(20, 4, 4, 4, 'group', { apps: READ_APPS, cols: 2, label: '阅读' }),
    G(0, 8, 8, 2, 'group', { apps: VIDEO2_APPS, cols: 5, label: '视频' }),
    G(8, 8, 4, 2, 'group', { apps: GAME2_APPS, cols: 2, label: '游戏平台' }),
    G(12, 8, 4, 2, 'group', { apps: MUSIC2_APPS, cols: 2, label: '音乐' }),
    G(16, 8, 8, 2, 'group', { apps: AI_EXTRA, cols: 5, label: '更多 AI' }),
  ],
]

const PRIVACY_SEED: ModePages = [
  [
    G(0, 0, 4, 2, 'clock', { label: '时钟' }), G(4, 0, 4, 2, 'weather', { label: '天气' }),
    G(8, 0, 4, 2, 'todo', { label: '待办清单' }), G(12, 0, 4, 2, 'fav', { label: '收藏夹' }),
    G(16, 0, 4, 2, 'countday', { label: '倒数日' }), G(20, 0, 4, 2, 'cal', { label: '日历' }),
    G(0, 2, 4, 4, 'news'), G(4, 2, 4, 4, 'music'), G(8, 2, 8, 4, 'countdown', { label: '下班倒计时' }),
    G(16, 2, 4, 4, 'ai'), G(20, 2, 4, 4, 'group', { apps: ['微信', 'QQ', '钉钉', '飞书', 'Gmail', 'Discord', 'Telegram', '语雀', 'Notion', 'DeepSeek', 'Claude', 'ChatGPT'] }),
    G(0, 6, 8, 4, 'group', { apps: ['淘宝', '京东', '小红书', '豆瓣', '知乎', '微博', '哔哩哔哩', '快手', 'Spotify', 'YouTube', 'GitHub', 'Figma', 'Medium', 'Reddit', 'V2EX', 'Notion', '语雀', '掘金', 'CSDN', '少数派', 'Product Hunt', 'Dribbble', 'Stack Overflow', 'Netflix'] }),
    G(8, 6, 8, 2, 'quote', { label: '' }), G(8, 8, 8, 2, 'woodfish', { label: '木鱼' }),
    G(16, 6, 4, 2, 'calc', { label: '计算器' }), G(20, 6, 4, 2, 'trans', { label: '翻译' }),
    G(16, 8, 8, 2, 'group', { apps: ['百度', '必应', '知乎', '豆瓣', 'V2EX', 'Medium', 'Dribbble', 'Spotify'], cols: 8 }),
  ],
]

/** 出厂布局（深拷贝，避免用户改动污染出厂数据） */
export const DEFAULT_PAGES: { standard: ModePages; privacy: ModePages } = {
  standard: SEED,
  privacy: PRIVACY_SEED,
}

export const clonePages = (pages: ModePages): ModePages => JSON.parse(JSON.stringify(pages)) as ModePages

/* ---------- 网格算法 ---------- */
export const itemBox = (it: GridItem): string =>
  `left:${it.c * CELL + INSET}px;top:${it.r * CELL + INSET}px;width:${it.w * CELL - 2 * INSET}px;height:${it.h * CELL - 2 * INSET}px`

export const labelBox = (it: GridItem): string =>
  `left:${it.c * CELL}px;top:${(it.r + it.h) * CELL - 24}px;width:${it.w * CELL}px`

export const overlaps = (a: GridItem, b: GridItem): boolean =>
  a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h

/** 找当前页第一块能放下的空位（自上而下、自左而右） */
export const findSlot = (page: GridItem[], w: number, h: number): { c: number; r: number } | null => {
  for (let r = 0; r + h <= ROWS; r++) {
    for (let c = 0; c + w <= COLS; c++) {
      const hit = page.some((it) => it.c < c + w && c < it.c + it.w && it.r < r + h && r < it.r + it.h)
      if (!hit) return { c, r }
    }
  }
  return null
}

const normItem: (x: unknown) => GridItem | null = (x) => {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  const t = typeof o['t'] === 'string' ? o['t'] : ''
  const w = typeof o['w'] === 'number' ? o['w'] : 0
  const h = typeof o['h'] === 'number' ? o['h'] : 0
  if (!t || w <= 0 || h <= 0) return null
  const c = Math.max(0, Math.min(COLS - w, typeof o['c'] === 'number' ? o['c'] : 0))
  const r = Math.max(0, Math.min(ROWS - h, typeof o['r'] === 'number' ? o['r'] : 0))
  const config = typeof o['config'] === 'object' && o['config'] !== null ? (o['config'] as Record<string, unknown>) : {}
  return { id: typeof o['id'] === 'string' ? o['id'] : uid(), c, r, w, h, t: t as WidgetKind, config }
}

/** 导入的页集合：支持「多页（数组套数组）」与「扁平数组 = 单页」，坏数据丢弃 */
export const normPages: (arr: unknown) => ModePages = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return []
  const raw = Array.isArray(arr[0]) ? (arr as unknown[][]) : [arr]
  return raw
    .map((pg) => (Array.isArray(pg) ? pg.map(normItem).filter((x): x is GridItem => x !== null) : []))
    .filter((pg) => pg.length > 0)
}

/** 校验导入文档：标准与隐私必须有页 */
export const readLayoutDoc = (data: unknown): LayoutDoc | null => {
  if (typeof data !== 'object' || data === null) return null
  const o = data as Record<string, unknown>
  const standard = normPages(o['standard'])
  const privacy = normPages(o['privacy'])
  if (standard.length === 0 || privacy.length === 0) return null
  return { v: 4, app: 'Thrilled', exportedAt: new Date().toISOString(), standard, privacy }
}