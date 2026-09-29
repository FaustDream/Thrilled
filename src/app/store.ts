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
import { WIDGET_DEFS, cfgOf } from '../shared/widget-defs'
import { BUILTIN_ENGINES } from '../shared/types'
import { BUILTIN_SKINS, DEFAULT_SETTINGS } from '../shared/defaults'
import { ENCOURAGE_QUOTES } from '../core/quotes'
import { getWeather, type WeatherData } from '../core/weather'
import { initStorage, kvGetRaw, kvSetRaw, loadDoc, saveDoc } from '../core/storage'
import { migrateV3, type MigrationResult } from '../core/migrate'
import { LAYOUT_MERGE_KEY } from '../shared/constants'
import type {
  AppSettings,
  EngineDef,
  GlassKey,
  GridItem,
  LayoutDoc,
  ModePages,
  OpenMode,
  SkinPack,
  StoredDoc,
  ViewMode,
  WidgetKind,
} from '../shared/types'

export type { SkinPack } from '../shared/types'

/** 引擎启用上限（04 §5.1：展示数量已达上限） */
export const ENGINE_LIMIT = 12

/** 当前风格的完整令牌（皮肤缺省项回退同组默认） */
export const skinTokensOf = (skins: SkinPack[], id: string): Record<string, string> => {
  const skin = skins.find((s) => s.id === id) ?? skins[0] ?? BUILTIN_SKINS[0]
  return skin?.tokens ?? {}
}

export const WALLS: readonly { n: string; c: string; bg: string }[] = [
  {
    n: '雾蓝', c: '极简',
    bg: 'radial-gradient(120% 90% at 50% 0%,rgba(255,255,255,.5),transparent 62%),linear-gradient(178deg,#eef2f8 0%,#e4eaf2 58%,#d8e1ec 100%)',
  },
  {
    n: '暮色', c: '风景',
    bg: 'radial-gradient(80% 60% at 78% 12%,rgba(255,150,110,.30),transparent 58%),radial-gradient(60% 50% at 20% 78%,rgba(150,90,180,.20),transparent 62%),linear-gradient(162deg,#3d2a52 0%,#241a3c 44%,#100c1c 100%)',
  },
  {
    n: '海岸', c: '风景',
    bg: 'radial-gradient(86% 64% at 76% 8%,rgba(90,200,220,.24),transparent 58%),radial-gradient(64% 54% at 16% 84%,rgba(40,130,160,.20),transparent 60%),linear-gradient(168deg,#10394e 0%,#0b2537 46%,#06131d 100%)',
  },
  {
    n: '晨雾', c: '极简',
    bg: 'radial-gradient(88% 66% at 80% 10%,rgba(255,255,255,.50),transparent 60%),radial-gradient(70% 58% at 14% 86%,rgba(160,180,205,.28),transparent 62%),linear-gradient(152deg,#e6ecf4 0%,#c3cedd 52%,#98a8bc 100%)',
  },
  {
    n: '樱', c: '动漫',
    bg: 'radial-gradient(84% 62% at 78% 10%,rgba(255,235,240,.55),transparent 58%),radial-gradient(66% 54% at 16% 82%,rgba(255,150,175,.26),transparent 62%),linear-gradient(158deg,#ffdfe8 0%,#ffc4d3 48%,#f39cb4 100%)',
  },
  {
    n: '夜紫', c: '更多',
    bg: 'radial-gradient(80% 60% at 80% 8%,rgba(150,90,230,.26),transparent 58%),radial-gradient(62% 52% at 16% 84%,rgba(90,50,150,.24),transparent 60%),linear-gradient(160deg,#2c1c4a 0%,#1b1132 46%,#0d081a 100%)',
  },
  {
    n: '云白', c: '极简',
    bg: 'radial-gradient(84% 62% at 80% 6%,rgba(255,222,180,.42),transparent 58%),radial-gradient(66% 54% at 12% 86%,rgba(150,190,255,.30),transparent 60%),linear-gradient(155deg,#fdfeff 0%,#eff5fc 52%,#dde8f6 100%)',
  },
  {
    n: '晨曦', c: '风景',
    bg: 'radial-gradient(88% 64% at 78% 10%,rgba(255,190,130,.44),transparent 58%),radial-gradient(64% 52% at 18% 82%,rgba(255,140,150,.22),transparent 60%),radial-gradient(44% 38% at 52% 46%,rgba(180,160,255,.16),transparent 64%),linear-gradient(156deg,#fff3e6 0%,#ffe3cf 44%,#f6c6b8 100%)',
  },
  {
    n: '黛青', c: '更多',
    bg: 'radial-gradient(86% 62% at 78% 8%,rgba(70,220,190,.22),transparent 58%),radial-gradient(62% 52% at 16% 84%,rgba(40,140,130,.22),transparent 60%),radial-gradient(46% 40% at 58% 58%,rgba(60,110,200,.12),transparent 64%),linear-gradient(162deg,#12312c 0%,#0c201d 46%,#050f0e 100%)',
  },
]

export type DrawerKey = 'add' | 'square' | 'personal' | 'setting' | 'profile'
export type ModalKey = 'theme' | 'engine' | 'addEngine' | 'log' | 'about' | 'login' | 'editItem' | 'backup' | 'restore' | 'reset'

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
  pages: { standard: ModePages; privacy: ModePages }
  cur: { standard: number; privacy: number }
  engines: EngineDef[]
  skins: SkinPack[]
  history: string[]
  encourage: string
  playing: boolean
  weather: WeatherData | null
  /** 已登录账号（隐私模式前置条件；真实鉴权见 01 §4） */
  user: { email: string } | null
  /** 上次备份时间 */
  backupTime: string | null
  /** 编辑中的卡片（弹窗 / 悬浮操作共用） */
  itemId: string | null
  drawer: DrawerKey | null
  modal: ModalKey | null
  ctx: CtxState | null
  toast: string
  enginePanel: boolean
  page: () => GridItem[]
  setSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  toggle: (k: 'labels' | 'hideTop' | 'hideSearch' | 'mascot' | 'autoFocus' | 'searchKeep' | 'hideBtn' | 'searchHistory' | 'showTime' | 'showDate' | 'showQuote' | 'immersive' | 'simpleSearch') => void
  setMode: (m: ViewMode) => void
  setUser: (u: { email: string } | null) => void
  goPage: (i: number) => void
  setEngine: (id: string) => void
  toggleEngineHidden: (id: string) => void
  addEngine: (e: EngineDef) => void
  /** 拖拽排序后提交完整顺序 */
  commitEngineOrder: (ids: string[]) => void
  setGlass: (k: GlassKey, v: number) => void
  applySkin: (id: string, syncWall?: boolean) => void
  skinNew: () => void
  skinRestore: () => void
  skinDelete: () => void
  skinRename: (name: string) => void
  skinToken: (token: string, value: string) => void
  setWallpaper: (i: number) => void
  setWallpaperRef: (ref: string | null) => void
  wallRandom: () => void
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
  showToast: (msg: string) => void
  setDrawer: (k: DrawerKey | null) => void
  setModal: (k: ModalKey | null) => void
  openCtx: (ctx: CtxState | null) => void
  setEnginePanel: (open: boolean) => void
  setPlaying: (v: boolean) => void
  rollEncourage: () => void
}

/** 当前模式的当前页 */
const curPageOf = (s: AppState): GridItem[] => {
  const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
  return s.pages[mode][s.cur[mode]] ?? []
}

const cloneSkins = (skins: readonly SkinPack[]): SkinPack[] => skins.map((s) => ({ ...s, tokens: { ...s.tokens } }))

/* ---------- 持久化（快照式整存整取） ---------- */

let saveTimer: ReturnType<typeof setTimeout> | null = null

const buildDoc = (s: AppState) => ({
  v: 2 as const,
  settings: s.settings,
  pages: s.pages,
  engines: s.engines,
  skins: s.skins,
  history: s.history,
  user: s.user,
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
  const merged = mergeIconPages(doc.pages.standard)
  if (merged === null) return { doc, merged: false }
  return { doc: { ...doc, pages: { ...doc.pages, standard: merged } }, merged: true }
}

/** 单飞锁：StrictMode 双挂载 / 并发调用共享同一次 hydrate，防止二次执行用陈旧缓存覆盖已合并状态 */
let hydrating: Promise<void> | null = null

/** 启动：初始化存储 → 读文档（无文档则尝试 v3 迁移 / 出厂种入）→ 开启持久化 */
export const hydrate = (): Promise<void> => {
  if (hydrating !== null) return hydrating
  hydrating = doHydrate()
  return hydrating
}

const doHydrate = async (): Promise<void> => {
  await initStorage()
  const loaded = loadDoc()
  if (loaded !== null) {
    const { doc, merged } = withLayoutMerge(loaded)
    useApp.setState({
      settings: doc.settings,
      pages: doc.pages,
      engines: doc.engines.length > 0 ? doc.engines : BUILTIN_ENGINES.map((e) => ({ ...e })),
      skins: doc.skins,
      history: doc.history,
      user: doc.user,
      backupTime: doc.backupTime,
      welcomed: doc.welcomed,
      hydrated: true,
      ...(merged ? { toast: '已把原来的多个图标页合并为一页' } : {}),
    })
    return
  }
  let migrated: MigrationResult | null = null
  try {
    migrated = await migrateV3(DEFAULT_PAGES.standard)
  } catch {
    migrated = null
  }
  const skins = cloneSkins(BUILTIN_SKINS)
  if (migrated !== null) {
    useApp.setState({
      settings: { ...DEFAULT_SETTINGS, ...migrated.settings },
      pages: { standard: migrated.standard, privacy: clonePages(DEFAULT_PAGES.privacy) },
      engines: migrated.engines,
      skins,
      history: migrated.history,
      hydrated: true,
    })
    useApp.getState().showToast(`已从 v3 迁移：${migrated.appended} 个网站图标已放到出厂布局之后`)
  } else {
    useApp.setState({
      pages: { standard: clonePages(DEFAULT_PAGES.standard), privacy: clonePages(DEFAULT_PAGES.privacy) },
      skins,
      hydrated: true,
    })
  }
}

export const useApp = create<AppState>()((set, get) => ({
  hydrated: false,
  welcomed: false,
  settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass } },
  pages: { standard: clonePages(DEFAULT_PAGES.standard), privacy: clonePages(DEFAULT_PAGES.privacy) },
  cur: { standard: 0, privacy: 0 },
  engines: BUILTIN_ENGINES.map((e) => ({ ...e })),
  skins: cloneSkins(BUILTIN_SKINS),
  history: [],
  encourage: ENCOURAGE_QUOTES[0] ?? '',
  playing: true,
  weather: null,
  user: null,
  backupTime: null,
  itemId: null,
  drawer: null,
  modal: null,
  ctx: null,
  toast: '',
  enginePanel: false,

  page: () => curPageOf(get()),

  setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
  toggle: (k) => set((s) => ({ settings: { ...s.settings, [k]: !s.settings[k] } })),
  /* 隐私模式需登录（UiTab 实测行为，见 04 §5.1）；未登录时弹登录框且不切换 */
  setMode: (m) => {
    const s = get()
    if (m === 'privacy' && s.user === null) {
      set({ toast: '登录后才能进入隐私模式', modal: 'login', ctx: null })
      return
    }
    const tip = m === 'minimal' ? '已进入极简模式' : m === 'privacy' ? '已进入隐私模式' : '已回到标准模式'
    set({ settings: { ...s.settings, mode: m }, ctx: null, toast: tip })
  },
  setUser: (u) => set({ user: u }),
  goPage: (i) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const total = s.pages[mode].length
    const next = Math.max(0, Math.min(total - 1, i))
    return { cur: { ...s.cur, [mode]: next } }
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
  addEngine: (e) => set((s) => (s.engines.filter((x) => !x.hidden).length >= ENGINE_LIMIT
    ? { toast: '展示数量已达上限 12 个，请先隐藏其他引擎' }
    : { engines: [...s.engines, e] })),
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
  applySkin: (id, syncWall) => set((s) => ({
    settings: { ...s.settings, skinId: id, wallpaper: syncWall ? (s.skins.find((x) => x.id === id)?.wall ?? s.settings.wallpaper) : s.settings.wallpaper },
  })),
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
  setWallpaper: (i) => set((s) => ({ settings: { ...s.settings, wallpaper: i, wallpaperRef: null }, toast: `壁纸已切换：${WALLS[i]?.n ?? ''}` })),
  setWallpaperRef: (ref) => set((s) => ({ settings: { ...s.settings, wallpaperRef: ref }, toast: ref === null ? '已恢复内置壁纸' : '自定义壁纸已应用' })),
  wallRandom: () => set((s) => {
    const i = Math.floor(Math.random() * WALLS.length)
    return { settings: { ...s.settings, wallpaper: i, wallpaperRef: null }, toast: `随机壁纸：${WALLS[i]?.n ?? ''}` }
  }),

  place: (kind, config = {}) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const list = [...s.pages[mode]]
    const def = WIDGET_DEFS[kind]
    const curIdx = s.cur[mode] ?? 0
    const page = [...(list[curIdx] ?? [])]
    const item: GridItem = {
      id: `i${Date.now().toString(36)}`, c: 0, r: 0, w: def.units.w, h: def.units.h, t: kind,
      config: { label: def.n, ...config },
    }
    const slot = findSlot(page, item.w, item.h)
    if (slot) {
      item.c = slot.c
      item.r = slot.r
      page.push(item)
      list[curIdx] = page
      return { pages: { ...s.pages, [mode]: list }, toast: `已添加${def.n}` }
    }
    if (list.length < MAX_PAGES) {
      list.push([item])
      return { pages: { ...s.pages, [mode]: list }, cur: { ...s.cur, [mode]: list.length - 1 }, toast: `当前页已满，已新建第 ${list.length} 页放入${def.n}` }
    }
    return { toast: '每种模式最多 5 页，已没有位置可放' }
  }),

  placeMany: (entries) => {
    let placed = 0
    set((s) => {
      const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
      const list = s.pages[mode].map((pg) => [...pg])
      let curIdx = s.cur[mode] ?? 0
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
      return { pages: { ...s.pages, [mode]: list }, cur: { ...s.cur, [mode]: curIdx } }
    })
    return placed
  },

  updateConfig: (id, patch) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const map = (pg: GridItem[]): GridItem[] => pg.map((it) => (it.id === id ? { ...it, config: { ...it.config, ...patch } } : it))
    return { pages: { ...s.pages, [mode]: s.pages[mode].map(map) } }
  }),

  resize: (id, w, h) => set((s) => {
    if (!isLegalSize(w, h)) return { toast: '仅支持六档尺寸' }
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const list = s.pages[mode].map((pg) => [...pg])
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
    return { pages: { ...s.pages, [mode]: list }, toast: `尺寸已更新为 ${w}×${h}` }
  }),

  move: (id, c, r) => {
    const s = get()
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const page = curPageOf(s)
    const it = page.find((x) => x.id === id)
    if (!it) return false
    const target = { ...it, c, r }
    if (page.some((x) => x.id !== id && overlaps(target, x))) return false
    set((st) => {
      const list = st.pages[mode].map((pg) => pg.map((x) => (x.id === id ? target : x)))
      return { pages: { ...st.pages, [mode]: list } }
    })
    return true
  },

  remove: (id) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const list = s.pages[mode].map((pg) => pg.filter((x) => x.id !== id))
    return { pages: { ...s.pages, [mode]: list }, ctx: null, itemId: null, toast: '删除成功' }
  }),

  swapKind: (id, kind) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const list = s.pages[mode].map((pg) => pg.map((it) => {
      if (it.id !== id) return it
      const label = cfgOf(it)['label']
      const base = { ...WIDGET_DEFS[kind].def }
      return { ...it, t: kind, config: typeof label === 'string' ? { ...base, label } : base }
    }))
    return { pages: { ...s.pages, [mode]: list }, ctx: null, toast: `已更换为：${WIDGET_DEFS[kind].n}` }
  }),

  exportLayout: () => {
    const s = get()
    return { v: 4, app: 'Thrilled', exportedAt: new Date().toISOString(), standard: s.pages.standard, privacy: s.pages.privacy }
  },
  importLayout: (data) => {
    const doc = readLayoutDoc(data)
    if (!doc) return false
    set({ pages: { standard: doc.standard, privacy: doc.privacy }, cur: { standard: 0, privacy: 0 }, toast: '布局导入成功' })
    return true
  },
  restoreDefault: (opts) => set((s) => {
    const pages = { standard: clonePages(DEFAULT_PAGES.standard), privacy: clonePages(DEFAULT_PAGES.privacy) }
    const next: Partial<AppState> = {
      pages,
      cur: { standard: 0, privacy: 0 },
      toast: '已恢复为默认界面',
    }
    if (opts?.keepIcons) {
      // 收集现有网址图标（与出厂布局不重复的），追加为新页（最多 5 页）
      const factoryKeys = new Set(DEFAULT_PAGES.standard.flat()
        .filter((it) => it.t === 'icon')
        .map((it) => `${String(it.config['label'] ?? '')}|${String(it.config['url'] ?? '')}`))
      const seen = new Set<string>()
      let page: GridItem[] = []
      let count = 0
      let seq = 0
      for (const it of [...s.pages.standard.flat(), ...s.pages.privacy.flat()]) {
        if (it.t !== 'icon') continue
        const key = `${String(it.config['label'] ?? '')}|${String(it.config['url'] ?? '')}`
        if (factoryKeys.has(key) || seen.has(key)) continue
        seen.add(key)
        let slot = findSlot(page, 2, 2)
        if (slot === null) {
          if (pages.standard.length >= MAX_PAGES) break
          page = []
          pages.standard.push(page)
          slot = { c: 0, r: 0 }
        }
        page.push({ ...it, id: `k${Date.now().toString(36)}${seq++}`, c: slot.c, r: slot.r })
        count++
      }
      if (count > 0) {
        if (page.length > 0) pages.standard.push(page)
        next.toast = `已恢复默认界面，你的 ${count} 个网址图标保留在第 ${pages.standard.length} 页`
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
      next.pages = { standard: clonePages(DEFAULT_PAGES.standard), privacy: clonePages(DEFAULT_PAGES.privacy) }
      next.cur = { standard: 0, privacy: 0 }
    }
    if (skins) {
      next.skins = cloneSkins(BUILTIN_SKINS)
      next.settings = { ...s.settings, skinId: 'classic' }
    }
    if (wallpaper) {
      next.settings = { ...(next.settings ?? s.settings), wallpaper: 0, wallpaperRef: null }
    }
    return next
  }),

  addHistory: (term) => set((s) => ({ history: [term, ...s.history.filter((h) => h !== term)].slice(0, 8) })),
  clearHistory: () => set({ history: [], toast: '搜索历史已清空' }),
  showToast: (msg) => set({ toast: msg }),
  setDrawer: (k) => set({ drawer: k, ctx: null, enginePanel: false }),
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

/* ---------- 持久化订阅：相关切片变化后防抖落盘 ---------- */
useApp.subscribe((state, prev) => {
  if (!state.hydrated) return
  if (
    state.settings !== prev.settings ||
    state.pages !== prev.pages ||
    state.engines !== prev.engines ||
    state.skins !== prev.skins ||
    state.history !== prev.history ||
    state.user !== prev.user ||
    state.backupTime !== prev.backupTime
  ) {
    scheduleSave()
  }
})

export const currentOpenMode = (s: { settings: AppSettings }): OpenMode => s.settings.openMode
