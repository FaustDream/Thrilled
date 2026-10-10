/**
 * v4 应用状态（zustand 单 store：设置 / 布局 / 引擎 / 皮肤 / 浮层）
 *
 * 约定：布局改动只影响实例；出厂布局在 DEFAULT_PAGES（layout.ts），「恢复默认」从这里重新种入。
 * 持久化：hydrate() 启动时经 core/storage 载入（含 v3 迁移），改动经 scheduleSave 防抖整存整取（01 §5.1 快照式）。
 * 主题令牌与 CSS 变量体系（--g-alpha / --ga-* / --blur-*）对齐，见 docs/v4/02-UI规格.md §6.4。
 */
import { create } from 'zustand'
import { DEFAULT_PAGES, clonePages, mergeIconPages, readLayoutDoc } from './layout'
import { MAX_PAGES, findSlot, isLegalSize, overlaps } from '../shared/grid'
import { WIDGET_DEFS, cfgOf, minSizeOf, sizeAllowed, sizeAllowedFor } from '../shared/widget-defs'
import { BUILTIN_ENGINES } from '../shared/types'
import { BUILTIN_SKINS, DEFAULT_SETTINGS } from '../shared/defaults'
import { ENCOURAGE_QUOTES } from '../core/quotes'
import { getWeather, type WeatherData } from '../core/weather'
import { pushHistory } from '../core/utils'
import { initStorage, kvGetRaw, kvSetRaw, loadDoc, saveDoc } from '../core/storage'
import { markActiveWallpaper } from '../core/wallpaper'
import { applyV3EngineSet, migrateV3, readV3EnginePrefs, type MigrationResult } from '../core/migrate'
import { ENGINE_RESTORE_KEY, LAYOUT_MERGE_KEY } from '../shared/constants'
import { DEFAULT_SHORTCUTS } from '../shared/shortcuts'
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
} from '../shared/types'

export type { SkinPack } from '../shared/types'

/** 当前风格的完整令牌（皮肤缺省项回退同组默认） */
export const skinTokensOf = (skins: SkinPack[], id: string): Record<string, string> => {
  const skin = skins.find((s) => s.id === id) ?? skins[0] ?? BUILTIN_SKINS[0]
  return skin?.tokens ?? {}
}

/** 内置壁纸：仅两个主题——经典浅色 / 经典深色（更多背景走本地上传 / 外链） */

export type DrawerKey = 'add' | 'personal' | 'setting'
export type ModalKey = 'theme' | 'addEngine' | 'editItem' | 'backup' | 'restore' | 'reset'

export interface CtxState {
  x: number
  y: number
  /** 卡片 id；null = 全局菜单 */
  id: string | null
  /** Dock 应用下标；非 null = Dock 图标右键菜单（修改 / 移除 / 恢复默认） */
  dock: number | null
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
  encourage: string
  playing: boolean
  weather: WeatherData | null
  /** 上次备份时间 */
  backupTime: string | null
  /** 编辑中的卡片（弹窗 / 悬浮操作共用） */
  itemId: string | null
  drawer: DrawerKey | null
  modal: ModalKey | null
  ctx: CtxState | null
  toast: string
  /** 设置抽屉当前分区下标（供右键菜单等外部入口先切分区再打开抽屉） */
  settingsTab: number
  enginePanel: boolean
  page: () => GridItem[]
  setSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  toggle: (k: 'labels' | 'hideTop' | 'hideSearch' | 'mascot' | 'autoFocus' | 'searchKeep' | 'hideBtn' | 'searchHistory' | 'hideEngineIco' | 'historyItemDel' | 'blurAfterSearch' | 'immersive' | 'simpleSearch') => void
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
  applySkin: (id: string) => void
  skinNew: () => void
  skinRestore: () => void
  skinDelete: () => void
  skinRename: (name: string) => void
  skinToken: (token: string, value: string) => void
  setWallpaperRef: (ref: string | null) => void
  /** 写入壁纸自适应裁剪焦点（由 app 层按视口比例算出） */
  setWallFocus: (f: WallFocus) => void
  /** 添加外部壁纸来源（协议适配器 + 用户可改基址） */
  addWallSource: (src: WallpaperSource) => void
  removeWallSource: (id: string) => void
  toggleWallSource: (id: string) => void
  /** 修改来源名称 / API 基址（镜像地址） */
  updateWallSource: (id: string, patch: Partial<Pick<WallpaperSource, 'name' | 'apiBase'>>) => void
  place: (kind: WidgetKind, config?: Record<string, unknown>) => void
  updateConfig: (id: string, patch: Record<string, unknown>) => void
  resize: (id: string, w: number, h: number) => void
  move: (id: string, c: number, r: number) => boolean
  remove: (id: string) => void
  swapKind: (id: string, kind: WidgetKind) => void
  /** 批量落位网址图标（收藏夹导入 / 批量添加共用） */
  placeMany: (entries: { label: string; url: string }[]) => number
  exportLayout: () => LayoutDoc
  importLayout: (data: unknown) => boolean
  /** 恢复出厂布局；keepIcons 时把现有网址图标（与出厂不重复的）追加到新页 */
  restoreDefault: (opts?: { keepIcons?: boolean }) => void
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
  setModal: (k: ModalKey | null) => void
  openCtx: (ctx: CtxState | null) => void
  setEnginePanel: (open: boolean) => void
  setPlaying: (v: boolean) => void
  rollEncourage: () => void
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

/** 标记欢迎弹窗已展示（持久化） */
export const markWelcomed = (): void => useApp.setState({ welcomed: true })

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
  const loaded = loadDoc()
  const toasts: string[] = []
  let doc: StoredDoc
  if (loaded !== null) {
    const { doc: mergedDoc, merged } = withLayoutMerge(loaded)
    const { doc: fixed, restored } = await withEngineRestore(mergedDoc)
    doc = fixed
    if (merged) toasts.push('已把原来的多个图标页合并为一页')
    if (restored) toasts.push('已恢复 v3 的搜索引擎设置')
  } else {
    let migrated: MigrationResult | null = null
    try {
      migrated = await migrateV3(DEFAULT_PAGES)
    } catch {
      migrated = null
    }
    const skins = cloneSkins(BUILTIN_SKINS)
    if (migrated !== null) {
      doc = {
        v: 3,
        settings: { ...DEFAULT_SETTINGS, ...migrated.settings },
        pages: [...clonePages(DEFAULT_PAGES), ...migrated.standard],
        engines: migrated.engines,
        skins,
        history: migrated.history,
        welcomed: false,
        backupTime: null,
      }
      toasts.push(`已从 v3 迁移：${migrated.appended} 个网站图标已放到出厂布局之后`)
    } else {
      doc = {
        v: 3,
        settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass }, blur: { ...DEFAULT_SETTINGS.blur } },
        pages: clonePages(DEFAULT_PAGES),
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
  encourage: ENCOURAGE_QUOTES[0] ?? '',
  playing: true,
  weather: null,
  backupTime: null,
  itemId: null,
  drawer: null,
  modal: null,
  ctx: null,
  toast: '',
  settingsTab: 0,
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
  applySkin: (id) => set((s) => ({ settings: { ...s.settings, skinId: id } })),
  skinNew: () => set((s) => {
    const cur = s.skins.find((x) => x.id === s.settings.skinId)
    if (!cur) return {}
    const copy: SkinPack = { ...cur, id: `c${Date.now()}`, name: `${cur.name} 副本`, builtin: false, tokens: { ...cur.tokens } }
    return { skins: [...s.skins, copy], settings: { ...s.settings, skinId: copy.id }, toast: '新建成功' }
  }),
  skinRestore: () => set((s) => {
    const cur = s.skins.find((x) => x.id === s.settings.skinId)
    const def = BUILTIN_SKINS.find((x) => x.id === s.settings.skinId)
    if (!cur || !def) return { toast: '自定义皮肤无法还原为内置' }
    return {
      skins: s.skins.map((x) => (x.id === cur.id ? { ...x, tokens: { ...def.tokens }, name: def.name } : x)),
      toast: '恢复成功',
    }
  }),
  skinDelete: () => set((s) => {
    if (s.skins.length <= 1) return { toast: '至少保留一套皮肤' }
    const idx = s.skins.findIndex((x) => x.id === s.settings.skinId)
    if (s.skins[idx]?.builtin) return { toast: '内置皮肤不可删除' }
    const skins = s.skins.filter((_, i) => i !== idx)
    return { skins, settings: { ...s.settings, skinId: skins[0]?.id ?? s.settings.skinId }, toast: '删除成功' }
  }),
  skinRename: (name) => set((s) => ({
    skins: s.skins.map((x) => (x.id === s.settings.skinId ? { ...x, name } : x)),
  })),
  skinToken: (token, value) => set((s) => ({
    skins: s.skins.map((x) => (x.id === s.settings.skinId ? { ...x, tokens: { ...x.tokens, [token]: value } } : x)),
  })),
  setWallpaperRef: (ref) => set((s) => ({ settings: { ...s.settings, wallpaperRef: ref }, toast: ref === null ? '已移除壁纸' : '自定义壁纸已应用' })),
  setWallFocus: (f) => set((s) => ({ settings: { ...s.settings, wallFocus: f } })),
  addWallSource: (src) => set((s) => ({ settings: { ...s.settings, wallSources: [...s.settings.wallSources, src] }, toast: `已添加壁纸来源：${src.name}` })),
  removeWallSource: (id) => set((s) => ({ settings: { ...s.settings, wallSources: s.settings.wallSources.filter((x) => x.id !== id) }, toast: '已移除壁纸来源' })),
  toggleWallSource: (id) => set((s) => ({ settings: { ...s.settings, wallSources: s.settings.wallSources.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) } })),
  updateWallSource: (id, patch) => set((s) => ({ settings: { ...s.settings, wallSources: s.settings.wallSources.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, toast: '来源配置已更新' })),

  place: (kind, config = {}) => set((s) => {
    const list = [...s.pages]
    const def = WIDGET_DEFS[kind]
    const curIdx = s.cur
    const page = [...(list[curIdx] ?? [])]
    const item: GridItem = {
      id: `i${Date.now().toString(36)}`, c: 0, r: 0, w: def.units.w, h: def.units.h, t: kind,
      /* 新实例先套该类组件的默认样式（「设为该组件默认」写入的），再叠放置时的显式配置 */
      config: { label: def.n, ...(s.settings.styleDefaults[kind] ?? {}), ...config },
    }
    const slot = findSlot(page, item.w, item.h)
    if (slot !== null) {
      item.c = slot.c
      item.r = slot.r
      page.push(item)
      list[curIdx] = page
      return { pages: list, toast: '已添加到页面' }
    }
    if (list.length < MAX_PAGES) {
      list.push([item])
      return { pages: list, cur: list.length - 1, toast: `当前页已满，已新建第 ${list.length} 页放入${def.n}` }
    }
    return { toast: '最多 5 页，已没有位置可放' }
  }),

  placeMany: (entries) => {
    let placed = 0
    set((s) => {
      const list = s.pages.map((pg) => [...pg])
      let curIdx = s.cur
      let seq = 0
      for (const entry of entries) {
        let page = list[curIdx] ?? []
        let slot = findSlot(page, 2, 2)
        if (slot === null && list.length < MAX_PAGES) {
          curIdx = list.length
          list.push([])
          page = list[curIdx] ?? []
          slot = { c: 0, r: 0 }
        }
        if (slot === null) break
        page.push({ id: `b${Date.now().toString(36)}${seq++}`, c: slot.c, r: slot.r, w: 2, h: 2, t: 'icon', config: { label: entry.label, url: entry.url } })
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

  move: (id, c, r) => {
    const s = get()
    const page = curPageOf(s)
    const it = page.find((x) => x.id === id)
    if (!it) return false
    const target = { ...it, c, r }
    if (page.some((x) => x.id !== id && overlaps(target, x))) return false
    set((st) => {
      const list = st.pages.map((pg) => pg.map((x) => (x.id === id ? target : x)))
      return { pages: list }
    })
    return true
  },

  remove: (id) => set((s) => {
    const list = s.pages.map((pg) => pg.filter((x) => x.id !== id))
    return { pages: list, ctx: null, itemId: null, toast: '删除成功' }
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
    const pages = clonePages(DEFAULT_PAGES)
    const next: Partial<AppState> = {
      pages,
      cur: 0,
      toast: '已恢复为默认界面',
    }
    if (opts?.keepIcons) {
      // 收集现有网址图标（与出厂布局不重复的），追加为新页（最多 5 页）
      const factoryKeys = new Set(DEFAULT_PAGES.flat()
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
        next.toast = `已恢复默认界面，你的 ${count} 个网址图标保留在第 ${pages.length} 页`
      }
    }
    return next
  }),

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
  /* 打开弹窗时收起抽屉：弹窗层级（50）低于抽屉（60），否则被盖住 */
  setModal: (k) => set({ modal: k, ctx: null, enginePanel: false, drawer: k !== null ? null : get().drawer }),
  openCtx: (ctx) => set({ ctx, enginePanel: false }),
  setEnginePanel: (open) => set({ enginePanel: open }),
  setPlaying: (v) => set({ playing: v }),
  rollEncourage: () => set((s) => {
    const next = ENCOURAGE_QUOTES.filter((x) => x !== s.encourage)
    return { encourage: next[Math.floor(Math.random() * next.length)] ?? s.encourage, toast: '鼓励语已刷新' }
  }),
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
