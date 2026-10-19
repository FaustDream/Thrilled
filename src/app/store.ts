/**
 * v4 应用状态（zustand 单 store：设置 / 布局 / 引擎 / 皮肤 / 浮层）
 *
 * 约定：布局改动只影响实例；出厂布局在 DEFAULT_PAGES（layout.ts），「恢复默认」从这里重新种入。
 * 持久化：hydrate() 启动时经 core/storage 载入（含 v3 迁移），改动经 scheduleSave 防抖整存整取（01 §5.1 快照式）。
 * 主题令牌与 CSS 变量体系（--g-alpha / --ga-* / --blur-*）对齐，见 docs/v4/02-UI规格.md §6.4。
 */
import { create } from 'zustand'
import { ARRANGE_KINDS, DEFAULT_PAGES, SAMPLE_PAGES, arrangePages, clonePages, crossPlan, dropPlan, mergeIconPages, packPage, prunePages, readLayoutDoc } from './layout'
import { MAX_PAGES, findSlot, findSlotNear, isLegalSize, overlaps } from '../shared/grid'
import { WIDGET_DEFS, cfgOf, minSizeOf, placeSizeOf, sizeAllowed, sizeAllowedFor } from '../shared/widget-defs'
import { BUILTIN_ENGINES } from '../shared/types'
import { BUILTIN_SKINS, DEFAULT_SETTINGS } from '../shared/defaults'
import { getWeather, type WeatherData } from '../core/weather'
import { pushHistory } from '../core/utils'
import { initStorage, kvGetRaw, kvSetRaw, loadBackupDoc, loadDoc, saveBackupDoc, saveDoc } from '../core/storage'
import { markActiveWallpaper } from '../core/wallpaper'
import { needsUpgradeBackup } from '../core/doc-version'
import { restoreFileConfigOnStartup } from '../core/file-config'
import { applyV3EngineSet, migrateV3, readV3EnginePrefs, type MigrationResult } from '../core/migrate'
import { APP_VERSION, BACKUP_VERSION_KEY, ENGINE_RESTORE_KEY, LAYOUT_MERGE_KEY } from '../shared/constants'
import { DEFAULT_SHORTCUTS } from '../shared/shortcuts'
import { withGlobalBlur, withGlobalGlass } from '../shared/visual'
import { isBlankStyle, styleSliceOf, withoutStyle, withoutStyleDefault } from '../shared/widget-style'
import type {
  AppSettings,
  EngineDef,
  BlurKey,
  GlassKey,
  GridItem,
  LayoutDoc,
  ModePages,
  OpenMode,
  SkinPack,
  StoredDoc,
  ViewMode,
  WallFocus,
  WallpaperSource,
  WidgetKind,
  WidgetSize,
} from '../shared/types'

export type { SkinPack } from '../shared/types'

/** 当前风格的完整令牌（皮肤缺省项回退同组默认） */
export const skinTokensOf = (skins: SkinPack[], id: string): Record<string, string> => {
  const skin = skins.find((s) => s.id === id) ?? skins[0] ?? BUILTIN_SKINS[0]
  return skin?.tokens ?? {}
}

/** 内置壁纸：仅两个主题——经典浅色 / 经典深色（更多背景走本地上传 / 外链） */

export type DrawerKey = 'add' | 'personal' | 'setting'
export type ModalKey = 'addEngine' | 'editItem' | 'itemDetail' | 'kindSizes' | 'backup' | 'restore' | 'reset' | 'newSite'

/** 空白处右键「新建站点」的落点 */
export type NewSiteTarget = 'page' | 'dock' | 'both'

/** 新建站点弹窗的预置：落点预选 + 空白处右键换算出的网格格（新建图标的落位参考） */
export interface NewSiteDraft {
  c: number
  r: number
  to: NewSiteTarget
}

export interface CtxState {
  x: number
  y: number
  /** 卡片 id；null = 全局菜单 */
  id: string | null
  /** Dock 应用下标；非 null = Dock 图标右键菜单（修改 / 移除 / 恢复默认） */
  dock: number | null
  /** 空白处右键换算出的网格格；卡片 / Dock 菜单为 null */
  cell: { c: number; r: number } | null
}

interface AppState {
  hydrated: boolean
  /** 首次访问欢迎弹窗已展示（持久化） */
  welcomed: boolean
  settings: AppSettings
  /** 单套页面（隐私模式已并入标准模式） */
  pages: ModePages
  cur: number
  engines: EngineDef[]
  skins: SkinPack[]
  history: string[]
  weather: WeatherData | null
  /** 上次备份时间 */
  backupTime: string | null
  /** 编辑中的卡片（弹窗 / 悬浮操作共用） */
  itemId: string | null
  drawer: DrawerKey | null
  modal: ModalKey | null
  ctx: CtxState | null
  /** 多选集合（Ctrl/Cmd 单击切换、Shift 范围选中）：跨页有效——可以选好第 2、3 页的图标一次搬到第 1 页；
   *  纯界面态、不落盘（buildDoc 只取设置 / 布局 / 引擎 / 皮肤 / 历史等字段） */
  picked: readonly string[]
  /** 新建站点弹窗的预置（空白处右键「新建网址图标 / 添加到 Dock」写入） */
  newSite: NewSiteDraft | null
  /** 刚放置的实例 id：该卡片播一次落位提示（App 在动画结束后清除），让用户看清新图标落在哪 */
  flashId: string | null
  toast: string
  /** 设置抽屉当前分区下标（供右键菜单等外部入口先切分区再打开抽屉） */
  settingsTab: number
  /** 个性化抽屉当前页签（壁纸 / 背景效果 / 主题 / 组件库；首次引导直达组件库） */
  personalTab: number
  /** 添加抽屉当前页签（供 Dock 菜单「配置快捷方式」等外部入口先切页签再开抽屉） */
  addTab: number
  enginePanel: boolean
  page: () => GridItem[]
  setSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  toggle: (k: 'hideTop' | 'hideSearch' | 'mascot' | 'gridLines' | 'autoFocus' | 'searchKeep' | 'hideBtn' | 'searchHistory' | 'hideEngineIco' | 'historyItemDel' | 'blurAfterSearch' | 'immersive' | 'simpleSearch') => void
  /** 组件库：按给定顺序重排当前页组件（只改数组顺序，不动各自坐标） */
  reorderItems: (ids: string[]) => void
  /** 设置某个动作的组合键（空串 = 清除该快捷键） */
  setShortcut: (id: string, combo: string) => void
  /** 全部恢复出厂快捷键 */
  resetShortcuts: () => void
  /** 一键套用样式预设（先清空四个样式键再写入，避免上一份预设残留；patch 一律经 normStyle 归一化） */
  applyStyle: (id: string, patch: unknown) => void
  /** 把当前卡片的样式存为该组件类型的默认样式（空样式 = 取消默认） */
  saveStyleDefault: (id: string) => void
  /** 清除某组件类型的默认样式 */
  clearStyleDefault: (t: WidgetKind) => void
  /** 把当前卡片的样式复制到本页同类型卡片 */
  applyStyleToKind: (id: string) => void
  setMode: (m: ViewMode) => void
  goPage: (i: number) => void
  setEngine: (id: string) => void
  toggleEngineHidden: (id: string) => void
  addEngine: (e: EngineDef) => void
  /** 拖拽排序后提交完整顺序 */
  commitEngineOrder: (ids: string[]) => void
  setGlass: (k: GlassKey, v: number) => void
  setBlur: (k: BlurKey, v: number) => void
  /** 全局玻璃度：一次写入六个玻璃底色项（卡片 / 图标容器 / Dock / 搜索框 / 面板 / 菜单） */
  applyGlobalGlass: (v: number) => void
  /** 全局模糊度：一次写入六项毛玻璃半径 */
  applyGlobalBlur: (v: number) => void
  applySkin: (id: string) => void
  setWallpaperRef: (ref: string | null) => void
  /** 写入壁纸自适应裁剪焦点（由 app 层按视口比例算出） */
  setWallFocus: (f: WallFocus) => void
  /** 添加外部壁纸来源（协议适配器 + 用户可改基址） */
  addWallSource: (src: WallpaperSource) => void
  removeWallSource: (id: string) => void
  toggleWallSource: (id: string) => void
  /** 修改来源名称 / API 基址（镜像地址） */
  updateWallSource: (id: string, patch: Partial<Pick<WallpaperSource, 'name' | 'apiBase'>>) => void  /** 放置组件；at 给定时优先落在该网格格附近（被占则就近），返回是否放置成功 */
  place: (kind: WidgetKind, config?: Record<string, unknown>, at?: { c: number; r: number }) => boolean
  /** 组件库：整体设置各类组件的默认大小（键 = 组件类型，缺键 = 用定义表出厂尺寸；只影响之后新增的实例） */
  setSizeDefaults: (next: Record<string, WidgetSize>) => void
  updateConfig: (id: string, patch: Record<string, unknown>) => void
  resize: (id: string, w: number, h: number) => void
  /**
   * 拖拽落位：空位直接落、与同尺寸卡片互换、否则就近落位（见 layout.dropPlan）。
   * 不再「目标被占就整体回退」——那样满页时怎么拖都没反应。
   */
  drop: (id: string, c: number, r: number) => void
  /**
   * 跨页搬动：把 ids 搬到第 to 页（拖到另一页 / 右键「移动到第 N 页」共用）。
   * 单张且给了 prefer（拖拽落点）时就近落位；多张按「源页序 + 页内 (r,c)」依次填空位；
   * 放不下的留在原页并在提示里说明（见 layout.crossPlan）。
   */
  moveToPage: (ids: readonly string[], to: number, prefer?: { c: number; r: number }) => void
  /** 替换多选集合（Ctrl/Cmd 单击切换、Shift 范围、点空白与 Esc 清空都走它） */
  setPicked: (ids: readonly string[]) => void
  remove: (id: string) => void
  /** 手动整理（空白处右键「整理图标」）：把所有页的图标类卡片依次前移到最靠前的空位（跨页） */
  arrange: () => void
  swapKind: (id: string, kind: WidgetKind) => void
  /** 批量落位网址图标（收藏夹导入 / 批量添加共用） */
  placeMany: (entries: { label: string; url: string }[]) => number
  exportLayout: () => LayoutDoc
  importLayout: (data: unknown) => boolean
  /** 恢复出厂布局（空白页）；keepIcons 时把现有网址图标（与出厂不重复的）追加到新页；sample 时改为载入示例布局 */
  restoreDefault: (opts?: { keepIcons?: boolean; sample?: boolean }) => void
  /** 恢复更新前自动备份的文档（没有备份返回 false） */
  restoreBackup: () => boolean
  loadWeather: () => Promise<void>
  markBackedUp: () => void
  resetParts: (parts: { layout: boolean; skins: boolean; wallpaper: boolean }) => void
  addHistory: (term: string) => void
  clearHistory: () => void
  /** 设置搜索历史条数上限（4–20），并把现有历史一并裁剪到该条数 */
  setHistoryLimit: (n: number) => void
  showToast: (msg: string) => void
  setDrawer: (k: DrawerKey | null) => void
  setSettingsTab: (i: number) => void
  setPersonalTab: (i: number) => void
  setAddTab: (i: number) => void
  setModal: (k: ModalKey | null) => void
  /** 打开新建站点弹窗：一次性写入预置并收起抽屉 / 菜单（弹窗层级低于抽屉，必须先收抽屉） */
  openNewSite: (draft: NewSiteDraft) => void
  openCtx: (ctx: CtxState | null) => void
  setEnginePanel: (open: boolean) => void
}

/** 当前页 */
const curPageOf = (s: AppState): GridItem[] => s.pages[s.cur] ?? []

const cloneSkins = (skins: readonly SkinPack[]): SkinPack[] => skins.map((s) => ({ ...s, tokens: { ...s.tokens } }))

/* ---------- 持久化（快照式整存整取） ---------- */

let saveTimer: ReturnType<typeof setTimeout> | null = null

const buildDoc = (s: AppState) => ({
  v: 3 as const,
  settings: s.settings,
  pages: s.pages,
  engines: s.engines,
  skins: s.skins,
  history: s.history,
  welcomed: s.welcomed,
  backupTime: s.backupTime,
  updatedAt: new Date().toISOString(),
  appVersion: APP_VERSION,
})

const scheduleSave = (): void => {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const s = useApp.getState()
    if (!s.hydrated) return
    saveDoc(buildDoc(s))
  }, 300)
}

/** 标记首次引导已完成（持久化） */
export const markWelcomed = (): void => useApp.setState({ welcomed: true })

/**
 * 版本升级保护：文档由更早版本写入时，先整份留一份备份再继续。
 * 覆盖安装 / 重新加载扩展不会清空 chrome.storage.local，这里只是多一层回滚保险；
 * 同一版本只备份一次（否则每次启动都会把「更新前」的那份覆盖成当前数据）。
 */
const backupIfUpgraded = (doc: StoredDoc): boolean => {
  if (!needsUpgradeBackup(doc, APP_VERSION)) return false
  if (kvGetRaw(BACKUP_VERSION_KEY) === APP_VERSION) return false
  try {
    saveBackupDoc(doc)
    kvSetRaw(BACKUP_VERSION_KEY, APP_VERSION)
  } catch {
    return false
  }
  return true
}

/** 一次性布局修正：v4.1 迁移曾把每个 v3 分组各建一页 —— 存量文档全为图标页时合并回尽量少的新页 */
const withLayoutMerge = (doc: StoredDoc): { doc: StoredDoc; merged: boolean } => {
  if (kvGetRaw(LAYOUT_MERGE_KEY) === '1') return { doc, merged: false }
  kvSetRaw(LAYOUT_MERGE_KEY, '1')
  const merged = mergeIconPages(doc.pages)
  if (merged === null) return { doc, merged: false }
  return { doc: { ...doc, pages: merged }, merged: true }
}

/** 单飞锁：StrictMode 双挂载 / 并发调用共享同一次 hydrate，防止二次执行用陈旧缓存覆盖已合并状态 */
let hydrating: Promise<void> | null = null

/** 一次性引擎修正：v4.1 迁移把 v3 未设置的内置引擎补进了清单——按 v3 引擎偏好裁剪回用户设置的那套 */
const withEngineRestore = async (doc: StoredDoc): Promise<{ doc: StoredDoc; restored: boolean }> => {
  if (kvGetRaw(ENGINE_RESTORE_KEY) === '1') return { doc, restored: false }
  kvSetRaw(ENGINE_RESTORE_KEY, '1')
  let prefs: Awaited<ReturnType<typeof readV3EnginePrefs>> = null
  try {
    prefs = await readV3EnginePrefs()
  } catch {
    prefs = null
  }
  if (prefs === null) return { doc, restored: false }
  const next = applyV3EngineSet(doc.engines, doc.settings.engineId, prefs)
  const unchanged = next.engineId === doc.settings.engineId
    && next.engines.length === doc.engines.length
    && next.engines.every((e, i) => e.id === doc.engines[i]?.id)
  if (unchanged) return { doc, restored: false }
  return {
    doc: { ...doc, engines: next.engines, settings: { ...doc.settings, engineId: next.engineId } },
    restored: true,
  }
}

/** 启动：初始化存储 → 读文档（无文档则尝试 v3 迁移 / 出厂种入）→ 开启持久化 */
export const hydrate = (): Promise<void> => {
  if (hydrating !== null) return hydrating
  hydrating = doHydrate()
  return hydrating
}

const doHydrate = async (): Promise<void> => {
  await initStorage()
  /* 本地目录快照恢复可能写回更新的文档：先等它结束再读，避免启动载入用旧文档覆盖它。
     目录未配置 / 无权限时该调用很快返回，不影响首屏。 */
  try {
    await restoreFileConfigOnStartup()
  } catch {
    /* 目录同步不可用不影响本地数据 */
  }
  const loaded = loadDoc()
  const toasts: string[] = []
  let doc: StoredDoc
  if (loaded !== null) {
    /* 版本升级：先把旧文档整份留底，再继续载入（数据不会因为升级被动过） */
    if (backupIfUpgraded(loaded)) toasts.push('已自动备份更新前的数据')
    const { doc: mergedDoc, merged } = withLayoutMerge(loaded)
    const { doc: fixed, restored } = await withEngineRestore(mergedDoc)
    doc = fixed
    if (merged) toasts.push('已把原来的多个图标页合并为一页')
    if (restored) toasts.push('已恢复 v3 的搜索引擎设置')
  } else {
    let migrated: MigrationResult | null = null
    try {
      migrated = await migrateV3([])
    } catch {
      migrated = null
    }
    const skins = cloneSkins(BUILTIN_SKINS)
    if (migrated !== null && migrated.standard.length > 0) {
      doc = {
        v: 3,
        settings: { ...DEFAULT_SETTINGS, ...migrated.settings },
        pages: migrated.standard,
        engines: migrated.engines,
        skins,
        history: migrated.history,
        welcomed: true,
        backupTime: null,
      }
      toasts.push(`已从 v3 迁移：${migrated.appended} 个网站图标已导入`)
    } else {
      /* 首次安装：空白页，不预置任何卡片与示例设置，让用户自己开始 */
      doc = {
        v: 3,
        settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass }, blur: { ...DEFAULT_SETTINGS.blur } },
        pages: [[]],
        engines: BUILTIN_ENGINES.map((e) => ({ ...e })),
        skins,
        history: [],
        welcomed: false,
        backupTime: null,
      }
    }
  }
  useApp.setState({
    settings: doc.settings,
    pages: doc.pages,
    engines: doc.engines.length > 0 ? doc.engines : BUILTIN_ENGINES.map((e) => ({ ...e })),
    skins: doc.skins,
    history: doc.history,
    backupTime: doc.backupTime,
    welcomed: doc.welcomed,
    hydrated: true,
    ...(toasts.length > 0 ? { toast: toasts.join('；') } : {}),
  })
}

export const useApp = create<AppState>()((set, get) => ({
  hydrated: false,
  welcomed: false,
  settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass }, blur: { ...DEFAULT_SETTINGS.blur } },
  pages: clonePages(DEFAULT_PAGES),
  cur: 0,
  engines: BUILTIN_ENGINES.map((e) => ({ ...e })),
  skins: cloneSkins(BUILTIN_SKINS),
  history: [],
  weather: null,
  backupTime: null,
  itemId: null,
  drawer: null,
  modal: null,
  ctx: null,
  picked: [],
  newSite: null,
  flashId: null,
  toast: '',
  settingsTab: 0,
  personalTab: 0,
  addTab: 0,
  enginePanel: false,

  page: () => curPageOf(get()),

  setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
  toggle: (k) => set((s) => ({ settings: { ...s.settings, [k]: !s.settings[k] } })),
  reorderItems: (ids) => set((s) => {
    const list = s.pages.map((pg) => [...pg])
    const page = list[s.cur]
    if (!page) return {}
    const byId = new Map(page.map((it) => [it.id, it]))
    const next: GridItem[] = []
    for (const id of ids) {
      const it = byId.get(id)
      if (it) { next.push(it); byId.delete(id) }
    }
    for (const it of byId.values()) next.push(it)
    if (next.length !== page.length) return {}
    list[s.cur] = next
    return { pages: list, toast: '组件顺序已更新' }
  }),
  setShortcut: (id, combo) => set((s) => ({
    settings: { ...s.settings, shortcuts: { ...s.settings.shortcuts, [id]: combo } },
  })),
  resetShortcuts: () => set((s) => ({
    settings: { ...s.settings, shortcuts: { ...DEFAULT_SHORTCUTS } },
    toast: '已恢复默认快捷键',
  })),

  /* ---------- 组件库：按类型的默认大小（弹窗里逐个类型设好、确认后一次性写入） ---------- */
  setSizeDefaults: (next) => {
    const n = Object.keys(next).length
    set((s) => ({
      settings: { ...s.settings, sizeDefaults: next },
      toast: n === 0 ? '已全部恢复为出厂大小' : `已更新 ${n} 类组件的默认大小（之后新增的实例按此落位）`,
    }))
  },

  /* ---------- 实例样式（配置弹窗「样式」段） ---------- */
  applyStyle: (id, patch) => set((s) => ({
    pages: s.pages.map((pg) => pg.map((it) => (it.id === id
      ? { ...it, config: { ...withoutStyle(it.config), ...styleSliceOf(patch) } }
      : it))),
  })),
  saveStyleDefault: (id) => set((s) => {
    const it = s.pages.flat().find((x) => x.id === id)
    if (it === undefined) return {}
    const style = styleSliceOf(it.config)
    const blank = isBlankStyle(style)
    const next = blank
      ? withoutStyleDefault(s.settings.styleDefaults, it.t)
      : { ...s.settings.styleDefaults, [it.t]: style }
    return {
      settings: { ...s.settings, styleDefaults: next },
      toast: blank
        ? `已取消「${WIDGET_DEFS[it.t].n}」的默认样式`
        : `当前样式已设为「${WIDGET_DEFS[it.t].n}」的默认（新放置的实例自动套用）`,
    }
  }),
  clearStyleDefault: (t) => set((s) => ({
    settings: { ...s.settings, styleDefaults: withoutStyleDefault(s.settings.styleDefaults, t) },
    toast: `已取消「${WIDGET_DEFS[t].n}」的默认样式`,
  })),
  applyStyleToKind: (id) => set((s) => {
    const list = s.pages.map((pg) => [...pg])
    const idx = list.findIndex((pg) => pg.some((it) => it.id === id))
    const page = list[idx]
    if (page === undefined) return {}
    const src = page.find((it) => it.id === id)
    if (src === undefined) return {}
    const style = styleSliceOf(src.config)
    let n = 0
    list[idx] = page.map((it) => {
      if (it.id === src.id || it.t !== src.t) return it
      n += 1
      return { ...it, config: { ...withoutStyle(it.config), ...style } }
    })
    return {
      pages: list,
      toast: n === 0 ? '本页没有同类卡片' : `已复制样式到本页 ${n} 张同类卡片`,
    }
  }),
  setMode: (m) => {
    const s = get()
    const tip = m === 'minimal' ? '已进入极简模式' : '已回到标准模式'
    set({ settings: { ...s.settings, mode: m }, ctx: null, toast: tip })
  },
  goPage: (i) => set((s) => {
    const next = Math.max(0, Math.min(s.pages.length - 1, i))
    return { cur: next }
  }),

  setEngine: (id) => set((s) => ({ settings: { ...s.settings, engineId: id }, enginePanel: false, ctx: null })),
  toggleEngineHidden: (id) => set((s) => {
    const visible = s.engines.filter((e) => !e.hidden)
    const target = s.engines.find((e) => e.id === id)
    if (!target) return {}
    if (!target.hidden && visible.length <= 1) return { toast: '至少保留一个可见的搜索引擎' }
    const engines = s.engines.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e))
    const stillVisible = engines.filter((e) => !e.hidden)
    const engineId = stillVisible.some((e) => e.id === s.settings.engineId) ? s.settings.engineId : (stillVisible[0]?.id ?? s.settings.engineId)
    return { engines, settings: { ...s.settings, engineId } }
  }),
  addEngine: (e) => set((s) => ({ engines: [...s.engines, e], toast: `已添加：${e.name}` })),
  commitEngineOrder: (ids) => set((s) => {
    const byId = new Map(s.engines.map((e) => [e.id, e]))
    const next: EngineDef[] = []
    for (const id of ids) {
      const e = byId.get(id)
      if (e) { next.push(e); byId.delete(id) }
    }
    for (const e of byId.values()) next.push(e)
    return { engines: next, toast: '搜索引擎顺序已更新' }
  }),

  setGlass: (k, v) => set((s) => ({ settings: { ...s.settings, glass: { ...s.settings.glass, [k]: v } } })),
  setBlur: (k, v) => set((s) => ({ settings: { ...s.settings, blur: { ...s.settings.blur, [k]: v } } })),
  applyGlobalGlass: (v) => set((s) => ({
    settings: { ...s.settings, glass: withGlobalGlass(s.settings.glass, v) },
  })),
  applyGlobalBlur: (v) => set((s) => ({
    settings: { ...s.settings, blur: withGlobalBlur(s.settings.blur, v) },
  })),
  applySkin: (id) => set((s) => ({ settings: { ...s.settings, skinId: BUILTIN_SKINS.some((x) => x.id === id) ? id : s.settings.skinId } })),
  setWallpaperRef: (ref) => set((s) => ({ settings: { ...s.settings, wallpaperRef: ref }, toast: ref === null ? '已移除壁纸' : '自定义壁纸已应用' })),
  setWallFocus: (f) => set((s) => ({ settings: { ...s.settings, wallFocus: f } })),
  addWallSource: (src) => set((s) => ({ settings: { ...s.settings, wallSources: [...s.settings.wallSources, src] }, toast: `已添加壁纸来源：${src.name}` })),
  removeWallSource: (id) => set((s) => ({ settings: { ...s.settings, wallSources: s.settings.wallSources.filter((x) => x.id !== id) }, toast: '已移除壁纸来源' })),
  toggleWallSource: (id) => set((s) => ({ settings: { ...s.settings, wallSources: s.settings.wallSources.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) } })),
  updateWallSource: (id, patch) => set((s) => ({ settings: { ...s.settings, wallSources: s.settings.wallSources.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, toast: '来源配置已更新' })),

  place: (kind, config = {}, at) => {
    let ok = false
    set((s) => {
      const list = [...s.pages]
      const def = WIDGET_DEFS[kind]
      const curIdx = s.cur
      const page = [...(list[curIdx] ?? [])]
      /* 尺寸：优先该类组件的默认大小（组件库 →「默认大小」设置；缺省 / 坏值回退定义表尺寸） */
      const size = placeSizeOf(kind, config, s.settings.sizeDefaults)
      const item: GridItem = {
        id: `i${Date.now().toString(36)}`, c: 0, r: 0, w: size.w, h: size.h, t: kind,
        /* 新实例先套该类组件的默认样式（「设为该组件默认」写入的），再叠放置时的显式配置 */
        config: { label: def.n, ...(s.settings.styleDefaults[kind] ?? {}), ...config },
      }
      /* 空白处右键新建：先试右键所在格，放不下再就近；其余入口仍是「本页第一个空位」 */
      const slot = at === undefined ? findSlot(page, item.w, item.h) : findSlotNear(page, item.w, item.h, at)
      if (slot !== null) {
        item.c = slot.c
        item.r = slot.r
        page.push(item)
        list[curIdx] = page
        ok = true
        return { pages: list, flashId: item.id, toast: '已添加到页面' }
      }
      if (list.length < MAX_PAGES) {
        list.push([item])
        ok = true
        return { pages: list, cur: list.length - 1, flashId: item.id, toast: `当前页已满，已新建第 ${list.length} 页放入${def.n}` }
      }
      return { toast: '最多 5 页，已没有位置可放' }
    })
    return ok
  },

  placeMany: (entries) => {
    let placed = 0
    set((s) => {
      const list = s.pages.map((pg) => [...pg])
      /* 批量落位的网址图标同样遵循该类型的默认大小（缺省 2×2） */
      const size = placeSizeOf('icon', {}, s.settings.sizeDefaults)
      let curIdx = s.cur
      let seq = 0
      for (const entry of entries) {
        let page = list[curIdx] ?? []
        let slot = findSlot(page, size.w, size.h)
        if (slot === null && list.length < MAX_PAGES) {
          curIdx = list.length
          list.push([])
          page = list[curIdx] ?? []
          slot = { c: 0, r: 0 }
        }
        if (slot === null) break
        page.push({ id: `b${Date.now().toString(36)}${seq++}`, c: slot.c, r: slot.r, w: size.w, h: size.h, t: 'icon', config: { label: entry.label, url: entry.url } })
        list[curIdx] = page
        placed++
      }
      return { pages: list, cur: curIdx }
    })
    return placed
  },

  updateConfig: (id, patch) => set((s) => {
    const map = (pg: GridItem[]): GridItem[] => pg.map((it) => (it.id === id ? { ...it, config: { ...it.config, ...patch } } : it))
    return { pages: s.pages.map(map) }
  }),

  resize: (id, w, h) => set((s) => {
    if (!isLegalSize(w, h)) return { toast: '仅支持六档尺寸' }
    const target = s.pages.flat().find((it) => it.id === id)
    /* 尺寸能力：入口已置灰，这里兜底拦截（组件在过小的框里会被裁切或只能滚动浏览） */
    if (target !== undefined && !sizeAllowedFor(target.t, target.config, w, h)) {
      const lo = minSizeOf(target.t)
      return { toast: `「${WIDGET_DEFS[target.t].n}」最小 ${lo.w}×${lo.h}${sizeAllowed(target.t, w, h) ? '，当前内容在此档装不下' : ''}` }
    }
    const list = s.pages.map((pg) => [...pg])
    const idx = list.findIndex((pg) => pg.some((it) => it.id === id))
    const page = list[idx]
    if (idx < 0 || !page) return {}
    const it = page.find((x) => x.id === id)
    if (!it) return {}
    const rest = page.filter((x) => x.id !== id)
    const keep = rest.some((x) => overlaps({ ...it, w, h }, x))
    const slot = keep ? findSlot(rest, w, h) : { c: it.c, r: it.r }
    if (!slot) return { toast: '没有足够空间修改尺寸' }
    const next = { ...it, ...slot, w, h }
    list[idx] = [...rest, next]
    return { pages: list, toast: `尺寸已更新为 ${w}×${h}` }
  }),

  drop: (id, c, r) => set((s) => {
    const page = s.pages[s.cur] ?? []
    const plan = dropPlan(page, id, c, r)
    if (plan.kind === 'fail') return { toast: '这里放不下，换个位置试试' }
    const next = page.map((x) => {
      if (x.id === id) return { ...x, c: plan.c, r: plan.r }
      if (plan.swapId === x.id && plan.swapTo !== undefined) return { ...x, c: plan.swapTo.c, r: plan.swapTo.r }
      return x
    })
    return {
      pages: s.pages.map((pg, i) => (i === s.cur ? next : pg)),
      /* 互换与就近都看得出来，只有「就近」需要一句说明（否则会以为放到了指针下） */
      toast: plan.kind === 'near' ? '目标位置被占用，已就近放置' : '',
    }
  }),

  /* 跨页搬动：把选中（或单张）的卡片搬到另一页——拖到页面边缘停留翻页后松手、右键「移动到第 N 页」共用。
     落位见 crossPlan；搬完按「删除后自动整理」整理**各源页**（不能用跨页的 arrangePages：那是全局打包，
     会把刚落下的卡片又挪走），源页被搬空则连空页一起移除（页点不留一个空白页） */
  moveToPage: (ids, to, prefer) => set((s) => {
    if (ids.length === 0) return {}
    const plan = crossPlan(s.pages, ids, to, prefer)
    if (plan.placed.length === 0) {
      return {
        ctx: null,
        toast: plan.kept.length > 1
          ? `第 ${to + 1} 页放不下这 ${plan.kept.length} 个图标，已留在原页`
          : `第 ${to + 1} 页放不下这一张，已留在原页`,
      }
    }
    const slotOf = new Map(plan.placed.map((p) => [p.id, p]))
    const movedIds = new Set(plan.placed.map((p) => p.id))
    /* 源页：整理与空页清理只作用于这些页 */
    const srcPages = new Set<number>()
    s.pages.forEach((pg, i) => pg.forEach((x) => { if (movedIds.has(x.id)) srcPages.add(i) }))
    const list = s.pages.map((pg) => pg
      .filter((x) => !movedIds.has(x.id))
      .map((x) => { const p = slotOf.get(x.id); return p === undefined ? x : { ...x, c: p.c, r: p.r } }))
    const come = s.pages.flat().filter((x) => movedIds.has(x.id)).map((x) => {
      const p = slotOf.get(x.id)
      return p === undefined ? x : { ...x, c: p.c, r: p.r }
    })
    list[to] = [...(list[to] ?? []), ...come]
    if (s.settings.autoArrange) {
      for (const i of srcPages) {
        const packed = packPage(list[i] ?? [])
        if (packed !== null) list[i] = packed
      }
    }
    const pruned = prunePages(list, s.cur)
    const n = plan.placed.length
    const head = n > 1 ? `已移动 ${n} 个图标到第 ${to + 1} 页` : `已移动到第 ${to + 1} 页`
    const tail = plan.kept.length > 0 ? `，${plan.kept.length} 个放不下留在原页` : ''
    const prune = pruned.removed > 0 ? `（并移除 ${pruned.removed} 个空页面）` : ''
    return { pages: pruned.pages, cur: pruned.cur, ctx: null, picked: [], toast: `${head}${tail}${prune}` }
  }),

  setPicked: (ids) => set({ picked: [...ids] }),

  remove: (id) => set((s) => {
    /* 被删卡片所在页与它自身的类型：自动整理只对「图标类」生效（组件钉住，删组件不触发） */
    const pgIdx = s.pages.findIndex((pg) => pg.some((x) => x.id === id))
    const hit = pgIdx >= 0 ? s.pages[pgIdx]?.find((x) => x.id === id) : undefined
    let list = s.pages.map((pg) => pg.filter((x) => x.id !== id))
    /* 删除后自动整理（设置默认开、跨页）：被删的是图标类时，把空洞用后面页的图标补上——
       空洞被推到最后一页末尾，分页整体保持紧凑；组件钉住不动；无解或无需整理就保持原样 */
    if (hit !== undefined && s.settings.autoArrange && pgIdx >= 0 && ARRANGE_KINDS.has(hit.t)) {
      const done = arrangePages(list)
      if (done !== null && done.moved > 0) list = done.pages
    }
    /* 空页自动移除：页面删空后不再保留空页点（至少保留一页），当前页序号落到邻近保留页 */
    const pruned = prunePages(list, s.cur)
    return {
      pages: pruned.pages,
      cur: pruned.cur,
      ctx: null,
      itemId: null,
      toast: pruned.removed > 0 ? `删除成功，已自动移除 ${pruned.removed} 个空页面` : '删除成功',
    }
  }),

  /* 手动整理（空白处右键「整理图标」）：自动只管删除后那一下，存量页面里已有的空洞靠这里一次理顺（跨页） */
  arrange: () => set((s) => {
    const done = arrangePages(s.pages)
    if (done === null) return { toast: '没有连续的空位可用，未做整理' }
    if (done.moved === 0) return { toast: '没有需要移动的图标' }
    const pruned = prunePages(done.pages, s.cur)
    return {
      pages: pruned.pages,
      cur: pruned.cur,
      toast: pruned.removed > 0
        ? `已整理 ${done.moved} 个图标，并移除 ${pruned.removed} 个空页面`
        : `已整理 ${done.moved} 个图标`,
    }
  }),

  swapKind: (id, kind) => set((s) => {
    const list = s.pages.map((pg) => pg.map((it) => {
      if (it.id !== id) return it
      const label = cfgOf(it)['label']
      const base = { ...WIDGET_DEFS[kind].def }
      return { ...it, t: kind, config: typeof label === 'string' ? { ...base, label } : base }
    }))
    return { pages: list, ctx: null, toast: `已更换为：${WIDGET_DEFS[kind].n}` }
  }),

  exportLayout: () => {
    const s = get()
    return { v: 4, app: 'Thrilled', exportedAt: new Date().toISOString(), pages: s.pages }
  },
  importLayout: (data) => {
    const doc = readLayoutDoc(data)
    if (!doc) return false
    set({ pages: doc.pages, cur: 0, toast: '布局导入成功' })
    return true
  },
  restoreDefault: (opts) => set((s) => {
    const pages = clonePages(opts?.sample === true ? SAMPLE_PAGES : DEFAULT_PAGES)
    const next: Partial<AppState> = {
      pages,
      cur: 0,
      toast: opts?.sample === true ? '已载入示例布局' : '已恢复为空白页',
    }
    if (opts?.keepIcons) {
      // 收集现有网址图标（与目标布局不重复的），追加为新页（最多 5 页）
      const factoryKeys = new Set(pages.flat()
        .filter((it) => it.t === 'icon')
        .map((it) => `${String(it.config['label'] ?? '')}|${String(it.config['url'] ?? '')}`))
      const seen = new Set<string>()
      let page: GridItem[] = []
      let count = 0
      let seq = 0
      for (const it of s.pages.flat()) {
        if (it.t !== 'icon') continue
        const key = `${String(it.config['label'] ?? '')}|${String(it.config['url'] ?? '')}`
        if (factoryKeys.has(key) || seen.has(key)) continue
        seen.add(key)
        let slot = findSlot(page, 2, 2)
        if (slot === null) {
          if (pages.length >= MAX_PAGES) break
          page = []
          pages.push(page)
          slot = { c: 0, r: 0 }
        }
        page.push({ ...it, id: `k${Date.now().toString(36)}${seq++}`, c: slot.c, r: slot.r })
        count++
      }
      if (count > 0) {
        if (page.length > 0) pages.push(page)
        /* 目标布局本身是空白页时，不要留下一个空页再把图标放到第 2 页 */
        const firstEmpty = pages.findIndex((pg) => pg.length === 0)
        if (firstEmpty >= 0 && pages.some((pg, i) => i !== firstEmpty && pg.length > 0)) pages.splice(firstEmpty, 1)
        next.toast = `已恢复，你的 ${count} 个网址图标保留在第 ${pages.length} 页`
      }
    }
    return next
  }),

  restoreBackup: () => {
    const backup = loadBackupDoc()
    if (backup === null) return false
    set({
      settings: backup.settings,
      pages: backup.pages,
      engines: backup.engines.length > 0 ? backup.engines : get().engines,
      skins: backup.skins,
      history: backup.history,
      backupTime: backup.backupTime,
      welcomed: true,
      cur: 0,
      toast: '已恢复更新前的数据',
    })
    return true
  },

  loadWeather: async () => {
    const data = await getWeather()
    set({ weather: data })
  },

  markBackedUp: () => set({ backupTime: new Date().toLocaleString('zh-CN'), toast: '备份成功' }),

  resetParts: ({ layout, skins, wallpaper }) => set((s) => {
    const next: Partial<AppState> = { toast: '已重置选中数据' }
    if (layout) {
      next.pages = clonePages(DEFAULT_PAGES)
      next.cur = 0
    }
    if (skins) {
      next.skins = cloneSkins(BUILTIN_SKINS)
      next.settings = { ...s.settings, skinId: 'classic' }
    }
    if (wallpaper) {
      next.settings = { ...(next.settings ?? s.settings), wallpaperRef: null }
    }
    return next
  }),

  addHistory: (term) => set((s) => ({ history: pushHistory(s.history, term, s.settings.historyLimit) })),
  clearHistory: () => set({ history: [], toast: '搜索历史已清空' }),
  setHistoryLimit: (n) => set((s) => {
    const limit = Math.min(20, Math.max(4, Math.round(n)))
    return {
      settings: { ...s.settings, historyLimit: limit },
      /* 调小时把现有历史一并裁掉，下拉与设置里的条数立刻一致 */
      history: s.history.slice(0, limit),
    }
  }),
  showToast: (msg) => set({ toast: msg }),
  setDrawer: (k) => set({ drawer: k, ctx: null, enginePanel: false }),
  setSettingsTab: (i) => set({ settingsTab: i }),
  setPersonalTab: (i) => set({ personalTab: i }),
  setAddTab: (i) => set({ addTab: i }),
  /* 打开弹窗时收起抽屉：弹窗层级（50）低于抽屉（60），否则被盖住 */
  setModal: (k) => set({ modal: k, ctx: null, enginePanel: false, drawer: k !== null ? null : get().drawer }),
  openNewSite: (draft) => set({ modal: 'newSite', newSite: draft, ctx: null, enginePanel: false, drawer: null }),
  openCtx: (ctx) => set({ ctx, enginePanel: false }),
  setEnginePanel: (open) => set({ enginePanel: open }),
}))

/* ---------- 壁纸豁免订阅：当前使用中的引用同步给存储层，淘汰历史时永不删它 ---------- */
/* 放在这里而不是组件 effect 里：hydrate / 云端恢复 / 重置 / 历史切换都会改写 wallpaperRef，
   订阅能覆盖全部来源，且不依赖组件挂载时序 */
useApp.subscribe((state, prev) => {
  if (state.settings.wallpaperRef !== prev.settings.wallpaperRef) {
    markActiveWallpaper(state.settings.wallpaperRef)
  }
})

/* ---------- 持久化订阅：相关切片变化后防抖落盘 ---------- */
useApp.subscribe((state, prev) => {
  if (!state.hydrated) return
  if (
    state.settings !== prev.settings ||
    state.pages !== prev.pages ||
    state.engines !== prev.engines ||
    state.skins !== prev.skins ||
    state.history !== prev.history ||
    state.backupTime !== prev.backupTime
  ) {
    scheduleSave()
  }
})

export const currentOpenMode = (s: { settings: AppSettings }): OpenMode => s.settings.openMode
