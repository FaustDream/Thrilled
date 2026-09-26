/**
 * v4 应用状态（zustand 单 store：设置 / 布局 / 引擎 / 浮层）
 *
 * 约定：布局改动只影响实例；出厂布局在 DEFAULT_PAGES（layout.ts），「恢复默认」从这里重新种入。
 * 主题令牌与已有的 CSS 变量体系（--g-alpha / --ga-* / --blur-*）对齐，见 docs/v4/02-UI规格.md §6.4。
 */
import { create } from 'zustand'
import { DEFAULT_PAGES, MAX_PAGES, SIZES, clonePages, findSlot, overlaps, readLayoutDoc } from './layout'
import { WIDGET_DEFS, cfg } from './widgets'
import { BUILTIN_ENGINES } from '../shared/types'
import type { AppSettings, EngineDef, GlassKey, GridItem, LayoutDoc, ModePages, ViewMode, WidgetKind } from '../shared/types'

/* ---------- 风格皮肤（内置 4 套仅为出厂初始值，可改名 / 改色 / 新建 / 删除） ---------- */
export interface SkinPack {
  id: string
  n: string
  base: string
  wall: number
  t: Record<string, string>
}

export const SKINS: readonly SkinPack[] = [
  {
    id: 'classic', n: '经典', base: '#eef2f8', wall: 6,
    t: {
      '--card-bg': '#ffffff', '--card-text': '#1f2937', '--card-sub': '#6b7280', '--accent': '#3b82f6',
      '--label-color': '#1f2937', '--panel-bg': '#ffffff', '--panel-text': '#1f2937', '--panel-sub': '#6b7280',
      '--line': '#eef1f6', '--chip-bg': 'rgba(255,255,255,.55)', '--chip-text': '#1f2937', '--menu-bg': '#ffffff',
      '--menu-hover': '#f3f5f9', '--clock-color': '#1f2937', '--search-text': '#1f2937',
      '--search-ph': 'rgba(31,41,55,.55)', '--mask-color': '#ffffff',
    },
  },
  {
    id: 'glass', n: '光感', base: '#8f9fb3', wall: 3,
    t: {
      '--card-bg': 'rgba(255,255,255,.72)', '--card-text': '#16202e', '--card-sub': '#5d6b7d', '--accent': '#2f6bff',
      '--label-color': '#16202e', '--panel-bg': '#ffffff', '--panel-text': '#16202e', '--panel-sub': '#5d6b7d',
      '--line': '#e6ebf2', '--chip-bg': 'rgba(255,255,255,.55)', '--chip-text': '#16202e', '--menu-bg': '#ffffff',
      '--menu-hover': '#f1f5fa', '--clock-color': '#16202e', '--search-text': '#16202e',
      '--search-ph': 'rgba(22,32,46,.6)', '--mask-color': '#ffffff',
    },
  },
  {
    id: 'dark', n: '暗黑', base: '#080b10', wall: 2,
    t: {
      '--card-bg': '#1b2030', '--card-text': '#e6ebf5', '--card-sub': '#8d9bb0', '--accent': '#3b82f6',
      '--label-color': '#ffffff', '--panel-bg': '#151a26', '--panel-text': '#e6ebf5', '--panel-sub': '#8d9bb0',
      '--line': '#252c3d', '--chip-bg': 'rgba(20,26,38,.72)', '--chip-text': '#e6ebf5', '--menu-bg': '#1b2030',
      '--menu-hover': '#252c3d', '--clock-color': '#ffffff', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.7)', '--mask-color': '#060a10',
    },
  },
  {
    id: 'purple', n: '黑紫', base: '#0b0710', wall: 5,
    t: {
      '--card-bg': '#17111f', '--card-text': '#ece6f5', '--card-sub': '#9583ab', '--accent': '#a855f7',
      '--label-color': '#ffffff', '--panel-bg': '#140e1c', '--panel-text': '#ece6f5', '--panel-sub': '#9583ab',
      '--line': '#261c33', '--chip-bg': 'rgba(23,17,31,.72)', '--chip-text': '#ece6f5', '--menu-bg': '#1b1424',
      '--menu-hover': '#2a1f38', '--clock-color': '#e9d5ff', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.68)', '--mask-color': '#060a10',
    },
  },
]

/** 壁纸（分类：极简 / 风景 / 动漫 / 更多；本地上传见 02 §6.2） */
export const WALLS: readonly { n: string; c: string; bg: string }[] = [
  { n: '默认壁纸', c: '极简', bg: 'radial-gradient(120% 90% at 78% 8%,rgba(255,178,120,.34),transparent 62%),radial-gradient(90% 80% at 14% 86%,rgba(96,140,255,.30),transparent 64%),linear-gradient(160deg,#1b2532,#0b1017 72%)' },
  { n: '暮色', c: '风景', bg: 'linear-gradient(160deg,#3b2a4d,#1b1530 60%,#0c0a14)' },
  { n: '海岸', c: '风景', bg: 'linear-gradient(170deg,#0f3b52,#0b2233 55%,#07131d)' },
  { n: '晨雾', c: '极简', bg: 'linear-gradient(150deg,#dfe7ef,#b9c6d6 60%,#8f9fb3)' },
  { n: '樱', c: '动漫', bg: 'linear-gradient(160deg,#ffd9e5,#ffc0cf 45%,#f39ab3)' },
  { n: '夜紫', c: '更多', bg: 'linear-gradient(160deg,#2a1b46,#1a1030 55%,#0d0818)' },
  { n: '云白', c: '极简', bg: 'radial-gradient(110% 90% at 78% 6%,rgba(255,214,170,.35),transparent 60%),radial-gradient(90% 80% at 12% 88%,rgba(140,180,255,.26),transparent 62%),linear-gradient(155deg,#fdfeff,#eef4fb 55%,#dbe6f5)' },
]

export const ENCOURAGE: readonly string[] = [
  '此刻就是开始的最好时刻。', '种一棵树最好的时间是十年前，其次是现在。', '把大目标拆成小步，今天先走一步。',
  '专注当下，其余交给时间。', '你走的每一步都算数。', '少即是多，慢即是快。', '行动是治愈焦虑的良药。',
  '给自己一点安静，把重要的事做好。', '今天也要温柔而坚定。', '完成比完美更重要。',
  '持续做简单的事，就会不简单。', '心之所向，素履以往。', '稳住节奏，比冲刺更持久。',
  '把注意力放回眼前这一件事。', '日拱一卒，功不唐捐。', '清醒地努力，松弛地生活。',
  '先完成，再完善，最后完美。', '低谷时的坚持最见分量。', '世界很大，从手边做起。', '安静深耕，静待花开。',
]

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'standard', labels: true, hideTop: false, hideSearch: false, mascot: true,
  engineId: 'baidu', openMode: 'tab',
  autoFocus: false, searchKeep: false, hideBtn: false, searchHistory: true,
  nick: '主人', searchWidth: 880, searchRadius: 25, dockCount: 8, dockIcon: 'rect',
  clockColor: '#1f2937', showTime: true, showDate: true, showQuote: true,
  glass: { card: 0.6, tile: 0.35, dock: 0.7, search: 0.45, panel: 0.65, menu: 0.65 },
  gAlpha: 1, skinId: 'classic', wallpaper: 0,
}

export type DrawerKey = 'add' | 'square' | 'personal' | 'setting' | 'profile'
export type ModalKey = 'theme' | 'engine' | 'addEngine' | 'log' | 'about' | 'login' | 'editItem'

export interface CtxState {
  x: number
  y: number
  /** 卡片 id；null = 全局菜单 */
  id: string | null
}

interface AppState {
  settings: AppSettings
  pages: { standard: ModePages; privacy: ModePages }
  cur: { standard: number; privacy: number }
  engines: EngineDef[]
  history: string[]
  encourage: string
  playing: boolean
  /** 已登录账号（隐私模式前置条件；真实鉴权见 01 §4） */
  user: string | null
  /** 编辑中的卡片（弹窗 / 悬浮操作共用） */
  itemId: string | null
  drawer: DrawerKey | null
  modal: ModalKey | null
  ctx: CtxState | null
  toast: string
  enginePanel: boolean
  page: () => GridItem[]
  setSetting: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  toggle: (k: 'labels' | 'hideTop' | 'hideSearch' | 'mascot' | 'autoFocus' | 'searchKeep' | 'hideBtn' | 'searchHistory' | 'showTime' | 'showDate' | 'showQuote') => void
  setMode: (m: ViewMode) => void
  setUser: (u: string | null) => void
  goPage: (i: number) => void
  setEngine: (id: string) => void
  toggleEngineHidden: (id: string) => void
  moveEngine: (id: string, dir: -1 | 1) => void
  addEngine: (e: EngineDef) => void
  setGlass: (k: GlassKey, v: number) => void
  applySkin: (id: string, syncWall?: boolean) => void
  setWallpaper: (i: number) => void
  place: (kind: WidgetKind, config?: Record<string, unknown>) => void
  updateConfig: (id: string, patch: Record<string, unknown>) => void
  resize: (id: string, w: number, h: number) => void
  move: (id: string, c: number, r: number) => boolean
  remove: (id: string) => void
  swapKind: (id: string, kind: WidgetKind) => void
  exportLayout: () => LayoutDoc
  importLayout: (data: unknown) => boolean
  restoreDefault: () => void
  addHistory: (term: string) => void
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

export const useApp = create<AppState>()((set, get) => ({
  settings: { ...DEFAULT_SETTINGS, glass: { ...DEFAULT_SETTINGS.glass } },
  pages: { standard: clonePages(DEFAULT_PAGES.standard), privacy: clonePages(DEFAULT_PAGES.privacy) },
  cur: { standard: 0, privacy: 0 },
  engines: BUILTIN_ENGINES.map((e) => ({ ...e })),
  history: ['新标签页 布局', 'uiTab 复刻', 'prisma session'],
  encourage: ENCOURAGE[0] ?? '',
  playing: true,
  user: null,
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
    if (m === 'privacy' && !s.user) {
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
    if (!target.hidden && visible.length <= 1) return {}
    const engines = s.engines.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e))
    const stillVisible = engines.filter((e) => !e.hidden)
    const engineId = stillVisible.some((e) => e.id === s.settings.engineId) ? s.settings.engineId : (stillVisible[0]?.id ?? s.settings.engineId)
    return { engines, settings: { ...s.settings, engineId } }
  }),
  moveEngine: (id, dir) => set((s) => {
    const i = s.engines.findIndex((e) => e.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= s.engines.length) return {}
    const engines = [...s.engines]
    const a = engines[i]
    const b = engines[j]
    if (!a || !b) return {}
    engines[i] = b
    engines[j] = a
    return { engines }
  }),
  addEngine: (e) => set((s) => (s.engines.filter((x) => !x.hidden).length >= 12 ? {} : { engines: [...s.engines, e] })),

  setGlass: (k, v) => set((s) => ({ settings: { ...s.settings, glass: { ...s.settings.glass, [k]: v } } })),
  applySkin: (id, syncWall) => set((s) => ({
    settings: { ...s.settings, skinId: id, wallpaper: syncWall ? (SKINS.find((x) => x.id === id)?.wall ?? s.settings.wallpaper) : s.settings.wallpaper },
  })),
  setWallpaper: (i) => set((s) => ({ settings: { ...s.settings, wallpaper: i }, toast: `壁纸已切换：${WALLS[i]?.n ?? ''}` })),

  place: (kind, config = {}) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const pages = { ...s.pages, [mode]: [...s.pages[mode]] }
    const list = [...(pages[mode] ?? [])]
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
      return { pages: { ...pages, [mode]: list }, toast: `已添加${def.n}` }
    }
    if (list.length < MAX_PAGES) {
      list.push([item])
      return { pages: { ...pages, [mode]: list }, cur: { ...s.cur, [mode]: list.length - 1 }, toast: `当前页已满，已新建第 ${list.length} 页放入${def.n}` }
    }
    return { toast: '每种模式最多 5 页，已没有位置可放' }
  }),

  updateConfig: (id, patch) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const map = (pg: GridItem[]): GridItem[] => pg.map((it) => (it.id === id ? { ...it, config: { ...it.config, ...patch } } : it))
    return { pages: { ...s.pages, [mode]: s.pages[mode].map(map) } }
  }),

  resize: (id, w, h) => set((s) => {
    const mode = s.settings.mode === 'privacy' ? 'privacy' : 'standard'
    const list = s.pages[mode].map((pg) => [...pg])
    const idx = list.findIndex((pg) => pg.some((it) => it.id === id))
    const page = list[idx]
    if (!idx || !page) return {}
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
      const label = cfg(it)['label']
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
  restoreDefault: () => set({
    pages: { standard: clonePages(DEFAULT_PAGES.standard), privacy: clonePages(DEFAULT_PAGES.privacy) },
    cur: { standard: 0, privacy: 0 },
    toast: '已恢复为默认界面',
  }),

  addHistory: (term) => set((s) => ({ history: [term, ...s.history.filter((h) => h !== term)].slice(0, 8) })),
  showToast: (msg) => set({ toast: msg }),
  setDrawer: (k) => set({ drawer: k, ctx: null, enginePanel: false }),
  setModal: (k) => set({ modal: k, ctx: null, enginePanel: false }),
  openCtx: (ctx) => set({ ctx, enginePanel: false }),
  setEnginePanel: (open) => set({ enginePanel: open }),
  setPlaying: (v) => set({ playing: v }),
  rollEncourage: () => set((s) => {
    const next = ENCOURAGE.filter((x) => x !== s.encourage)
    return { encourage: next[Math.floor(Math.random() * next.length)] ?? s.encourage, toast: '鼓励语已刷新' }
  }),
}))

/** 网格单位尺寸是否合法（仅六档，见 02 §12.1） */
export const isLegalSize = (w: number, h: number): boolean => SIZES.some((s) => s.w === w && s.h === h)