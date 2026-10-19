/**
 * 出厂默认布局（v4.7 起为空白）
 *
 * 首次安装不预置任何卡片：界面只有搜索框、Dock 与空页提示，用户按自己的方式开始。
 * 需要现成编排时，可在「设置 → 数据 → 恢复为默认界面」里手动载入示例布局（SAMPLE_PAGES）。
 * 布局规则冻结在 docs/v4/02-UI规格.md §12.1（常量与算法在 shared/grid.ts）。
 */
import type { GridItem, LayoutDoc, ModePages, WidgetKind } from '../shared/types';
import { WIDGET_KINDS, fromLegacyKind } from '../shared/widget-defs';
import { COLS, MAX_PAGES, ROWS, findSlot, findSlotNear, overlaps } from '../shared/grid';

let seq = 0
export const uid = (): string => `i${Date.now().toString(36)}${(seq++).toString(36)}`

/** 实例工厂：只记录「引用哪个小组件」+ 自己的覆盖配置（默认值来自定义表） */
export const G = (c: number, r: number, w: number, h: number, t: WidgetKind, config: Record<string, unknown> = {}): GridItem =>
  ({ id: uid(), c, r, w, h, t, config })

/* ---------- 分区应用清单 ---------- */
const AI_APPS = ['豆包', 'Kimi', '秘塔AI搜索', '通义千问']
const AI_EXTRA = ['智谱清言', '讯飞星火', 'DeepSeek', '文心一言', '即梦AI', '可灵AI', 'ChatGPT', 'Claude']
const TOOL_APPS = ['翻译', '计算器', '截图', '二维码']
const TOOL_ALL = [...TOOL_APPS, '便签', '快递', '记账', '汇率']
const NEWS_APPS = ['微博', '知乎', '今日头条', '虎扑', '豆瓣', 'V2EX', '少数派', '掘金']
const ENT_APPS = ['哔哩哔哩', '优酷', '爱奇艺', '腾讯视频', '网易云音乐', 'QQ音乐', '酷狗音乐', 'YouTube']
const MUSIC_APPS = ['网易云音乐', 'QQ音乐', '酷狗音乐', 'Spotify']
const STUDY_APPS = ['学习通', '网易公开课', '语雀', 'Notion']
const MEDIA_APPS = ['爱奇艺', '腾讯视频', '网易云音乐', 'YouTube']
const SHOP_APPS = ['京东', '天猫', '拼多多', '唯品会', '苏宁易购']
const GAME_APPS = ['Steam', 'TapTap']
const GAME2_APPS = ['Epic', '米游社']
const READ_APPS = ['得到', '微信读书', '多看阅读', '起点读书']
const MUSIC2_APPS = ['QQ音乐', '酷狗音乐']
const SOC_APPS = ['微信', '知乎']
const COMM_APPS = ['微博', 'V2EX']
const DEV_APPS = ['掘金', 'CSDN', 'Stack Overflow', 'Gitee', 'Figma', 'Dribbble', '少数派', 'Product Hunt', 'Medium', 'Reddit']
const COOP_APPS = ['钉钉', '飞书', '腾讯文档', '石墨文档']
const CLOUD_APPS = ['OneDrive', 'Dropbox', '印象笔记', '坚果云']
const EFFI_APPS = ['便签', '快递', '记账', '汇率']
const VIDEO2_APPS = ['优酷', '芒果TV', '咪咕视频', '西瓜视频', '快手']

/** 出厂布局（原隐私页在前为基准 + 原标准两页依次并入） */
const PRIVACY_SEED: ModePages = [
  [
    G(0, 0, 4, 2, 'clock', { label: '时钟' }), G(4, 0, 4, 2, 'weather', { label: '天气' }),
    G(8, 0, 4, 2, 'todo', { label: '待办清单' }), G(12, 0, 4, 2, 'fav', { label: '收藏夹' }),
    G(16, 0, 4, 2, 'countdown', { label: '倒数日', mode: '倒数日' }), G(20, 0, 4, 2, 'cal', { label: '日历' }),
    G(0, 2, 4, 4, 'group', { apps: AI_APPS, cols: 2, label: 'AI 工具' }),
    G(4, 2, 4, 4, 'group', { apps: TOOL_APPS, cols: 2, label: '效率工具' }),
    G(8, 2, 8, 4, 'countdown', { label: '下班倒计时' }),
    G(16, 2, 4, 4, 'group', { apps: SHOP_APPS, cols: 2, label: '购物' }),
    G(20, 2, 4, 4, 'group', { apps: ['微信', 'QQ', '钉钉', '飞书', 'Gmail', 'Discord', 'Telegram', '语雀', 'Notion', 'DeepSeek', 'Claude', 'ChatGPT'] }),
    G(0, 6, 8, 4, 'group', { apps: ['淘宝', '京东', '小红书', '豆瓣', '知乎', '微博', '哔哩哔哩', '快手', 'Spotify', 'YouTube', 'GitHub', 'Figma', 'Medium', 'Reddit', 'V2EX', 'Notion', '语雀', '掘金', 'CSDN', '少数派', 'Product Hunt', 'Dribbble', 'Stack Overflow', 'Netflix'] }),
    G(8, 6, 8, 2, 'group', { apps: NEWS_APPS, cols: 8, label: '新闻资讯' }),
    G(8, 8, 8, 2, 'group', { apps: ENT_APPS, cols: 8, label: '影音娱乐' }),
    G(16, 6, 8, 2, 'group', { apps: TOOL_ALL, cols: 8, label: '常用工具' }),
    G(16, 8, 8, 2, 'group', { apps: ['百度', '必应', '知乎', '豆瓣', 'V2EX', 'Medium', 'Dribbble', 'Spotify'], cols: 8 }),
  ],
]

/** 出厂标准两页（资讯与日程 / 时间与纪念+开发与效率），并入出厂页集 */
const STANDARD_SEED: ModePages = [
  [
    G(0, 0, 8, 4, 'group', { apps: NEWS_APPS, cols: 8, label: '新闻资讯' }), G(8, 0, 4, 2, 'weather', { label: '天气' }),
    G(8, 2, 4, 2, 'todo', { label: '待办' }), G(12, 0, 4, 2, 'cal', { label: '日历' }),
    G(12, 2, 4, 2, 'countdown', { label: '倒数日', mode: '倒数日' }), G(16, 0, 4, 4, 'clock', { label: '时钟' }),
    G(20, 0, 2, 4, 'fav', { label: '收藏夹' }),
    G(22, 0, 2, 2, 'icon', { label: 'Gmail', url: 'https://mail.google.com' }),
    G(22, 2, 2, 2, 'icon', { label: 'GitHub', url: 'https://github.com' }),
    G(0, 4, 4, 4, 'group', { apps: EFFI_APPS, cols: 2, label: '生活工具' }),
    G(4, 4, 4, 4, 'group', { apps: AI_APPS, cols: 2, label: 'AI 工具' }),
    G(8, 4, 4, 4, 'group', { apps: TOOL_APPS, cols: 2, label: '效率工具' }),
    G(12, 4, 4, 4, 'group', { apps: STUDY_APPS, cols: 2, label: '学习文档' }),
    G(16, 4, 4, 4, 'group', { apps: MEDIA_APPS, cols: 2, label: '影音' }),
    G(20, 4, 4, 4, 'group', { apps: MUSIC_APPS, cols: 2, label: '音乐' }),
    G(0, 8, 8, 2, 'group', { apps: SHOP_APPS, cols: 5, label: '购物' }),
    G(8, 8, 4, 2, 'group', { apps: GAME_APPS, cols: 2, label: '游戏' }),
    G(12, 8, 4, 2, 'group', { apps: SOC_APPS, cols: 2, label: '社交' }),
    G(16, 8, 4, 2, 'group', { apps: COMM_APPS, cols: 2, label: '社区' }),
    G(20, 8, 2, 2, 'icon', { label: '豆瓣', url: 'https://www.douban.com' }),
    G(22, 8, 2, 2, 'icon', { label: '哔哩哔哩', url: 'https://www.bilibili.com' }),
  ],
  [
    G(0, 0, 8, 4, 'countdown', { label: '纪念日', mode: '纪念日', date: '2020-05-20', title: '与MiNa相识' }),
    G(8, 0, 8, 4, 'countdown', { label: '下班倒计时' }),
    G(16, 0, 8, 4, 'group', { apps: TOOL_ALL, cols: 8, label: '常用工具' }),
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

/** 示例布局（深拷贝，避免用户改动污染）：原隐私页在前为基准 + 原标准两页并入，供「载入示例布局」使用 */
export const SAMPLE_PAGES: ModePages = [...PRIVACY_SEED, ...STANDARD_SEED]

/** 出厂布局：空白单页（首次安装 / 清除数据后从这里开始） */
export const DEFAULT_PAGES: ModePages = [[]]

export const clonePages = (pages: ModePages): ModePages => JSON.parse(JSON.stringify(pages)) as ModePages

/* ---------- 布局导入归一化（坏数据丢弃；引擎校验见 shared/guards） ---------- */

const normItem: (x: unknown) => GridItem | null = (x) => {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  const w = typeof o['w'] === 'number' ? o['w'] : 0
  const h = typeof o['h'] === 'number' ? o['h'] : 0
  if (w <= 0 || h <= 0) return null
  const config = typeof o['config'] === 'object' && o['config'] !== null ? (o['config'] as Record<string, unknown>) : {}
  /* 旧类型（「倒数日」已并入「倒计时」）转接；未知类型丢弃 */
  const raw = typeof o['t'] === 'string' ? o['t'] : ''
  const mapped = WIDGET_KINDS.has(raw) ? { t: raw, config } : fromLegacyKind(raw, config)
  if (mapped === null) return null
  const c = Math.max(0, Math.min(COLS - w, typeof o['c'] === 'number' ? o['c'] : 0))
  const r = Math.max(0, Math.min(ROWS - h, typeof o['r'] === 'number' ? o['r'] : 0))
  return { id: typeof o['id'] === 'string' ? o['id'] : uid(), c, r, w, h, t: mapped.t as WidgetKind, config: mapped.config }
}

/** 导入的页集合：支持「多页（数组套数组）」与「扁平数组 = 单页」，坏数据丢弃 */
export const normPages: (arr: unknown) => ModePages = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return []
  const raw = Array.isArray(arr[0]) ? (arr as unknown[][]) : [arr]
  return raw
    .map((pg) => (Array.isArray(pg) ? pg.map(normItem).filter((x): x is GridItem => x !== null) : []))
    .filter((pg) => pg.length > 0)
}

/** 校验导入文档：单套 pages（新格式）；旧双套 {standard, privacy} 合并（隐私页在前为基准） */
export const readLayoutDoc = (data: unknown): LayoutDoc | null => {
  if (typeof data !== 'object' || data === null) return null
  const o = data as Record<string, unknown>
  const single = normPages(o['pages'])
  const standard = normPages(o['standard'])
  const privacy = normPages(o['privacy'])
  const pages = single.length > 0 ? single : [...privacy, ...standard]
  if (pages.length === 0) return null
  return { v: 4, app: 'Thrilled', exportedAt: new Date().toISOString(), pages }
}

/* ---------- 图标页合并（v4.1 迁移「一分组一页」存量数据的一次性修正） ---------- */

/** 整页是否只含网址图标卡 */
export const isIconOnlyPage = (pg: GridItem[]): boolean => pg.length > 0 && pg.every((it) => it.t === 'icon')

/**
 * 把「全部为图标页」的多页合并成尽量少的新页（顺序不变、first-fit 落位、保留 id 与配置）。
 * 含非图标卡（出厂小组件等）或仅一页时返回 null，表示无需 / 不应合并。
 */
export const mergeIconPages = (standard: ModePages): ModePages | null => {
  if (standard.length <= 1 || !standard.every(isIconOnlyPage)) return null
  const pages: ModePages = []
  let page: GridItem[] = []
  for (const it of standard.flat()) {
    let slot = findSlot(page, it.w, it.h)
    if (slot === null) {
      if (pages.length >= MAX_PAGES) break
      pages.push(page)
      page = []
      slot = findSlot(page, it.w, it.h)
    }
    if (slot === null) break
    page.push({ ...it, c: slot.c, r: slot.r })
  }
  if (page.length > 0) pages.push(page)
  return pages.length > 0 ? pages : null
}

/* ---------- 空页修剪（删除卡片后自动移除空页面） ---------- */

/**
 * 删除卡片后修剪空页（纯函数，可单测）：空页自动移除、至少保留一页、
 * 当前页序号落到邻近的保留页；无空页时原样返回。
 */
export const prunePages = (
  pages: GridItem[][],
  cur: number,
): { pages: GridItem[][]; cur: number; removed: number } => {
  const kept = pages.filter((pg) => pg.length > 0)
  if (kept.length === 0 || kept.length === pages.length) return { pages, cur, removed: 0 }
  const pos = new Map<GridItem[], number>()
  kept.forEach((pg, i) => pos.set(pg, i))
  const keptCur = pos.get(pages[cur] ?? [])
  /* 当前页被移除时落回它之前最近的保留页（更符合「从哪来、回哪去」的翻页习惯），没有则落在第 0 页 */
  const keptBefore = pages.slice(0, cur).filter((pg) => pg.length > 0).length
  return {
    pages: kept,
    cur: keptCur !== undefined ? keptCur : keptBefore > 0 ? keptBefore - 1 : 0,
    removed: pages.length - kept.length,
  }
}

/* ---------- 已放置组件类型（组件库与右键「添加组件」的共用判定） ---------- */

/**
 * 可重复放置的类型：图标 / 图标文件夹 / 图标格容器——每个网站一个图标，文件夹与容器也常要多个，
 * 天然是多实例，不参与「已添加」判定（否则页面上一旦有图标，「添加网站图标」就再也点不动）。
 */
export const REPEATABLE_KINDS: ReadonlySet<WidgetKind> = new Set<WidgetKind>(['icon', 'folder', 'group'])

/**
 * 布局中已放置的「单例型」组件类型集合：**跨页判定**，任一页存在该类型即视为「已添加」。
 * 组件库的按钮态与空白处右键「添加组件」二级菜单共用同一口径——一处已放、另一处再点添加
 * 会造成「同一类型多个实例」的状态冲突（用户需求）；可重复放置的类型见 REPEATABLE_KINDS。
 */
export const placedKindsOf = (pages: readonly GridItem[][]): Set<WidgetKind> =>
  new Set(pages.flat().map((it) => it.t).filter((t) => !REPEATABLE_KINDS.has(t)))

/* ---------- 页面整理（删除图标后把后面的图标依次前移补位） ---------- */

/**
 * 「整理」时参与补位的类型（图标类）：网站图标 / 图标文件夹 / 图标格容器。
 * 其余组件（时钟 / 天气 / 待办 / 日历 / 收藏夹 / 倒计时）在整理中**钉住不动**——用户摆好的组件位置不该被图标挤动。
 * 今天与 REPEATABLE_KINDS 恰好同集合，但两者语义不同（那个回答「能否重复放置」，这个回答「删除后能不能被挪动」），
 * 故意分开声明，免得将来改一个连带改另一个。
 */
export const ARRANGE_KINDS: ReadonlySet<WidgetKind> = new Set<WidgetKind>(['icon', 'folder', 'group']);

/** 整理过程中每张卡片的当前落点（页序 + 格）：先按原位建表，处理一张改一张 */
type Slot = { pg: number; c: number; r: number };

/** 第 k 页上的障碍：所有当前落在该页的其它卡片（已处理的用新位置、未处理的用原位） */
const obstaclesOn = (
  pages: readonly GridItem[][],
  at: ReadonlyMap<string, Slot>,
  pg: number,
  selfId: string,
): { c: number; r: number; w: number; h: number }[] => {
  const out: { c: number; r: number; w: number; h: number }[] = [];
  pages.forEach((items) => {
    for (const x of items) {
      if (x.id === selfId) continue;
      const p = at.get(x.id);
      if (p === undefined || p.pg !== pg) continue;
      out.push({ c: p.c, r: p.r, w: x.w, h: x.h });
    }
  });
  return out;
};

/**
 * 整理**全部页**（纯函数，可单测）：把可移动卡片（ARRANGE_KINDS）按「页序 + 页内自上而下、自左而右」排序，
 * 依次补到**全局最靠前**的空位上——删掉一张后即「链式补位」：后面的图标一张接一张前移，直到没有空洞可补
 * （尺寸对不上时链条自然停止：大卡片填不了小空洞，留在原位）。相对顺序不变。
 *
 * 跨页的意义：前面的页留白时，后面页的图标会被提前填上，**空洞被推到最后一页末尾**，
 * 分页整体保持紧凑连贯，不会出现「中间页空一块、后面还排得满满当当」。
 * 组件（时钟 / 天气 / 待办 / 日历 / 收藏夹 / 倒计时）钉在各自页的原位不动。
 *
 * 关键：判定空位时「其它所有卡片」都算障碍——**已处理的用新位置、未处理的用原位**。
 * 因此每张卡片只会往前补它前面被腾出来的位置，绝不会越过还没处理的卡片乱跳；
 * 自身原位必然仍空着（前面的卡片只往空位走，不会占别人的原位），所以一定找得到落点。
 *
 * 返回 { pages, moved }（页数不变，被搬空的页留成空数组，由调用方走 prunePages 移除并修正当前页序号）；
 * moved = 0 表示本来就紧凑（无需整理）；null 是防御性兜底（理论上不可达）。
 */
export const arrangePages = (pages: readonly GridItem[][]): { pages: GridItem[][]; moved: number } | null => {
  const order: GridItem[] = [];
  pages.forEach((items) => items.filter((x) => ARRANGE_KINDS.has(x.t)).forEach((x) => order.push(x)));
  if (order.length === 0) return { pages: pages.map((items) => [...items]), moved: 0 };
  const pgOf = new Map<string, number>();
  pages.forEach((items, i) => items.forEach((x) => pgOf.set(x.id, i)));
  order.sort((a, b) => (pgOf.get(a.id) ?? 0) - (pgOf.get(b.id) ?? 0) || a.r - b.r || a.c - b.c);
  const at = new Map<string, Slot>();
  pages.forEach((items, i) => items.forEach((x) => at.set(x.id, { pg: i, c: x.c, r: x.r })));
  let moved = 0;
  for (const it of order) {
    let slot: Slot | null = null;
    for (let k = 0; k < pages.length && slot === null; k++) {
      const hit = findSlot(obstaclesOn(pages, at, k, it.id), it.w, it.h);
      if (hit !== null) slot = { pg: k, c: hit.c, r: hit.r };
    }
    /* 自身原位必然仍空着，所以一定找得到落点；这里只是防御性兜底 */
    if (slot === null) return null;
    const cur = at.get(it.id);
    if (cur === undefined || slot.pg !== cur.pg || slot.c !== cur.c || slot.r !== cur.r) {
      at.set(it.id, slot);
      moved++;
    }
  }
  const out: GridItem[][] = pages.map(() => []);
  pages.forEach((items, i) => items.forEach((x) => {
    const p = at.get(x.id) ?? { pg: i, c: x.c, r: x.r };
    out[p.pg]?.push(p.c === x.c && p.r === x.r ? x : { ...x, c: p.c, r: p.r });
  }));
  return { pages: out, moved };
};

/* ---------- 拖拽落位（精确 / 互换 / 就近） ---------- */

/** 拖拽落位的判定结果：落点、以及「与目标互换」时需要一起挪动的卡片 */
export interface DropPlan {
  kind: 'move' | 'swap' | 'near' | 'fail';
  /** 被拖动卡片的新位置 */
  c: number;
  r: number;
  /** kind = swap 时：被换走的那张，以及它要去的位置（被拖动卡片的原位） */
  swapId?: string;
  swapTo?: { c: number; r: number };
}

/**
 * 拖拽落位方案（纯函数，可单测）——拖到哪儿都能放下，不再「拖了没反应」：
 * ①目标格空着 → 直接落（move）；
 * ②目标格被**一张同尺寸**的卡片占着 → 两张互换位置（swap，尺寸相同所以互换必然合法）；
 * ③其它情况（压到多张、或尺寸不同装不下）→ 按距离就近找空位（near）；
 * ④页内确实没有连续空位 → fail（调用方给提示）。
 */
export const dropPlan = (page: readonly GridItem[], id: string, c: number, r: number): DropPlan => {
  const it = page.find((x) => x.id === id);
  if (it === undefined) return { kind: 'fail', c, r };
  const hits = page.filter((x) => x.id !== id && overlaps({ ...it, c, r }, x));
  if (hits.length === 0) return { kind: 'move', c, r };
  const target = hits[0];
  if (hits.length === 1 && target !== undefined && target.w === it.w && target.h === it.h) {
    return { kind: 'swap', c: target.c, r: target.r, swapId: target.id, swapTo: { c: it.c, r: it.r } };
  }
  const slot = findSlotNear(page.filter((x) => x.id !== id), it.w, it.h, { c, r });
  return slot === null ? { kind: 'fail', c, r } : { kind: 'near', c: slot.c, r: slot.r };
};

/* ---------- 跨页搬动（拖到另一页 / 右键「移动到第 N 页」） ---------- */

/** 跨页落位结果：能搬的（含新落点）与放不下、留在原页的 id */
export interface CrossPlan {
  placed: { id: string; c: number; r: number }[];
  kept: string[];
}

/**
 * 跨页落位方案（纯函数，可单测）：把 ids 里的卡片搬到第 to 页。
 *
 * 与页内 dropPlan 的差异：**跨页不做互换**——页内的「同尺寸互换」搬到这里会变成「把别人甩到另一页」，
 * 与直觉相反；所以跨页只有「空位直接落 / 就近落位 / 放不下」三种结局。
 *
 * - 只搬 1 张且给了 prefer（拖拽时指针所在的格）→ 就近落位（findSlotNear），落在指针附近；
 * - 多张（含右键搬页）→ 按「源页页序 + 页内自上而下、自左而右」排序后**依次填空位**：目标页最靠前的
 *   空位优先、不保持相对形状——目标页通常已排满，保持形状几乎必然失败，而「依次填空位」与「整理图标」
 *   同一口径，落点可预期且绝不重叠。
 * - 已落下的卡片立刻算作后续卡片的障碍，所以结果之间绝不会重叠。
 *
 * 参与搬运的 id **包含已经在目标页的**（整组视作一个整体：同页多选拖动 = 把这一组重新排一遍）；
 * 找不到的 id 一律忽略。placed / kept 的顺序 = 处理顺序，kept 用于提示「其余 N 个留在原页」。
 */
export const crossPlan = (
  pages: readonly GridItem[][],
  ids: readonly string[],
  to: number,
  prefer?: { c: number; r: number },
): CrossPlan => {
  const placed: CrossPlan['placed'] = [];
  const kept: string[] = [];
  const target = pages[to];
  if (target === undefined || ids.length === 0) return { placed, kept };
  const byId = new Map<string, GridItem>();
  const pgOf = new Map<string, number>();
  pages.forEach((items, i) => items.forEach((x) => { byId.set(x.id, x); pgOf.set(x.id, i); }));
  /* 要搬的卡片：按「源页页序 + 页内 (r,c)」排序，批量落位的先后可预期 */
  const moving = ids
    .map((id) => byId.get(id))
    .filter((x): x is GridItem => x !== undefined)
    .sort((a, b) => (pgOf.get(a.id) ?? 0) - (pgOf.get(b.id) ?? 0) || a.r - b.r || a.c - b.c);
  if (moving.length === 0) return { placed, kept };
  /* 障碍 = 目标页上「不参与本次搬运」的卡片：要搬的都被拎起来了，不该挡自己 */
  const movingIds = new Set(moving.map((x) => x.id));
  const obstacles = target
    .filter((x) => !movingIds.has(x.id))
    .map((x) => ({ c: x.c, r: x.r, w: x.w, h: x.h }));
  for (const it of moving) {
    const hit = moving.length === 1 && prefer !== undefined
      ? findSlotNear(obstacles, it.w, it.h, prefer)
      : findSlot(obstacles, it.w, it.h);
    if (hit === null) { kept.push(it.id); continue; }
    placed.push({ id: it.id, c: hit.c, r: hit.r });
    obstacles.push({ c: hit.c, r: hit.r, w: it.w, h: it.h });
  }
  return { placed, kept };
};

/**
 * 单页整理（纯函数，可单测）：把**本页**的图标类卡片（ARRANGE_KINDS）按「自上而下、自左而右」依次补到
 * 本页最靠前的空位；组件（时钟 / 天气 / 待办…）钉住不动、充当障碍。无需移动时返回 null。
 *
 * 跨页搬走图标后源页会留下空洞，用本函数补位。**不要改用跨页的 arrangePages**：那是全局打包，
 * 会把用户刚落下的卡片又挪走——等于把刚做的操作抹掉。
 */
export const packPage = (page: readonly GridItem[]): GridItem[] | null => {
  const order = page.filter((x) => ARRANGE_KINDS.has(x.t)).sort((a, b) => a.r - b.r || a.c - b.c);
  if (order.length === 0) return null;
  const at = new Map<string, { c: number; r: number }>();
  page.forEach((x) => at.set(x.id, { c: x.c, r: x.r }));
  let moved = 0;
  for (const it of order) {
    const obstacles: { c: number; r: number; w: number; h: number }[] = [];
    page.forEach((x) => {
      if (x.id === it.id) return;
      const p = at.get(x.id);
      if (p === undefined) return;
      obstacles.push({ c: p.c, r: p.r, w: x.w, h: x.h });
    });
    const hit = findSlot(obstacles, it.w, it.h);
    /* 自身原位必然仍空着（前面的卡片只往空位走），一定找得到；找不到只是防御性兜底 */
    if (hit === null) continue;
    const cur = at.get(it.id);
    if (cur !== undefined && (cur.c !== hit.c || cur.r !== hit.r)) { at.set(it.id, hit); moved++; }
  }
  if (moved === 0) return null;
  return page.map((x) => {
    const p = at.get(x.id);
    return p === undefined || (p.c === x.c && p.r === x.r) ? x : { ...x, c: p.c, r: p.r };
  });
};
