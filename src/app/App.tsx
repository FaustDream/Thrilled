/**
 * 新标签页装配（v4）
 * 结构：Stage（1920×945 设计稿整体缩放）→ 搜索行 / 翻页网格 / Dock（快捷方式 + 新增·个性化·设置）/ 模式胶囊 / 页点 + 浮层（菜单·抽屉·弹窗·Toast）
 * 交互：文档级 data-act 事件委托（与原型一致），拖拽换位用指针事件 + 网格吸附，滚轮 / 方向键翻页。
 * 平台行为：打开链接走 core/link-opener（打开方式设置），壁纸走 core/wallpaper（IndexedDB）。
 */
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useApp, skinTokensOf, markWelcomed, hydrate, type CtxState, type DrawerKey } from './store'
import { CELL, COLS, INSET, itemBox, PAGE_W, ROWS, STAGE_W } from '../shared/grid'
import { naturalBoxOf } from '../shared/widget-defs'
import { stage } from './stage'
import { WidgetView, SiteIcon, cfg, str, styleVarsOf } from './widgets'
import { normTodoItems } from '../core/utils'
import { siteUrlOf } from './brands'
import { ContextMenu } from './menus'
import { Drawer, Modal, settingTabOf } from './panels'
import { Icon } from './icons'
import { openLink, buildSearchUrl } from '../core/link-opener'
import { buildLayoutDoc, downloadJson } from '../core/export'
import { getWallpaper, type BgData } from '../core/wallpaper'
import { GLASS_ALPHA_FACTOR, GLASS_FADED_KEYS, WHEEL_PAGE_COOLDOWN_MS, WHEEL_MIN_DELTA, WALLPAPER_BLUR_COVER_THRESHOLD, WALLPAPER_BLUR_PX, WALLPAPER_FOCUS_RATIO_TOLERANCE } from '../shared/constants'
import { SHORTCUT_DEFS, comboOf, isBareCombo } from '../shared/shortcuts'
import { computeWallFocus } from '../core/wallpaper-focus'
import type { WeatherData } from '../core/weather'
import type { GridItem, OpenMode } from '../shared/types'

const allItems = (pages: GridItem[][]): GridItem[] => pages.flat()

/** Dock 功能键（顺序固定：新增 / 个性化 / 设置），图标为 iconfont 单色线性风格 */
const DOCK_ACTIONS = [
  ['add', '新增', Icon.plus],
  ['personal', '个性化', Icon.palette],
  ['setting', '设置', Icon.gear],
] as const

/**
 * 把皮肤令牌按可见度淡出写回同名变量（边框 / 分隔线、hover 高亮这类只有颜色没有独立图层的项）。
 * 可见度满格时不写：原值已由皮肤令牌写入，保持与旧外观逐像素一致。
 */
const fadeToken = (rt: CSSStyleDeclaration, key: string, color: string | undefined, alpha: number): void => {
  if (color === undefined || alpha >= 1) return
  rt.setProperty(key, `color-mix(in srgb, ${color} ${(Math.max(0, alpha) * 100).toFixed(1)}%, transparent)`)
}

/** 解析要打开的 URL：显式 url → 站点注册表 → null（提示补充） */
const resolveSiteUrl = (item: GridItem): string | null => {
  const c = cfg(item)
  const explicit = str(c['url'])
  if (/^https?:\/\//.test(explicit)) return explicit
  return siteUrlOf(str(c['label'], str(c['name'])))
}

/** 打开链接（mode 缺省时用设置里的全局打开方式） */
const openByMode = (st: ReturnType<typeof useApp.getState>, url: string, kind: 'search' | 'link', mode?: OpenMode): void => {
  void openLink(url, mode ?? st.settings.openMode, kind)
}

/**
 * 搜索：把输入框内容交给当前引擎。
 * via 区分触发方式——回车与点放大镜可以各自指定打开方式（'inherit' 时跟随全局）。
 */
const runSearch = (via: 'enter' | 'btn'): void => {
  const st = useApp.getState()
  const s = st.settings
  const el = document.getElementById('searchInput') as HTMLInputElement | null
  const term = el?.value.trim() ?? ''
  if (!term) { st.showToast('请输入搜索内容'); return }
  const engine = st.engines.find((e) => e.id === s.engineId) ?? st.engines[0]
  const override = via === 'enter' ? s.searchEnterMode : s.searchBtnMode
  st.addHistory(term)
  openByMode(st, buildSearchUrl(engine?.base ?? '', term), 'search', override === 'inherit' ? undefined : override)
  if (!s.searchKeep && el) el.value = ''
  if (s.blurAfterSearch) el?.blur()
}

/** Dock 图标右键菜单动作（修改名称 / 修改网址 / 移除）；返回是否已处理 */
const dockMenuAct = (name: string, v: string): boolean => {
  const st = useApp.getState()
  const idx = Number(v)
  const apps = st.settings.dockApps
  const app = apps[idx]
  const patchAt = (patch: { name?: string; url?: string }): void => {
    st.setSetting('dockApps', apps.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
  }
  if (name === 'dock-rename') {
    const next = window.prompt('修改名称', app?.name ?? '')?.trim() ?? ''
    if (next !== '') { patchAt({ name: next }); st.showToast('已修改名称') }
  } else if (name === 'dock-url') {
    const next = window.prompt('修改网址（以 http(s):// 开头）', app?.url ?? '')?.trim() ?? ''
    if (/^https?:\/\//.test(next)) { patchAt({ url: next }); st.showToast('已修改网址') }
    else if (next !== '') st.showToast('网址需以 http(s):// 开头')
  } else if (name === 'dock-remove') {
    st.setSetting('dockApps', apps.filter((_, i) => i !== idx))
    st.showToast('已从 Dock 移除')
  } else if (name === 'dock-config') {
    /* 集中管理入口：打开添加抽屉的「快捷方式」页签 */
    st.setAddTab(2)
    st.setDrawer('add')
  } else return false
  st.openCtx(null)
  return true
}

/** 拖拽刚结束的这一次 click 不触发卡片打开 */
let suppressItemClick = false

export const App = () => {
  const settings = useApp((s) => s.settings)
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const engines = useApp((s) => s.engines)
  const skins = useApp((s) => s.skins)
  const setWallFocus = useApp((s) => s.setWallFocus)
  const toastMsg = useApp((s) => s.toast)
  const enginePanel = useApp((s) => s.enginePanel)
  const history = useApp((s) => s.history)
  const weather = useApp((s) => s.weather)
  const [now, setNow] = useState(() => new Date())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pillOpen, setPillOpen] = useState(false)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; scx: number; scy: number; c: number; r: number; moved: boolean } | null>(null)
  const [customWall, setCustomWall] = useState<BgData | null>(null)
  /* 视口宽高比（只在变化超过 1% 时更新，避免 resize 抖动触发无谓重渲染） */
  const [vpRatio, setVpRatio] = useState(() => window.innerWidth / Math.max(1, window.innerHeight))
  const inputRef = useRef<HTMLInputElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const wheelAt = useRef(0)

  const engine = engines.find((e) => e.id === settings.engineId) ?? engines[0]
  const visibleEngines = engines.filter((e) => !e.hidden)
  const dockApps = settings.dockApps

  /* ---------- 启动：持久化恢复 + 天气 + 首访欢迎 ---------- */
  useEffect(() => {
    void (async () => {
      await hydrate()
      void useApp.getState().loadWeather()
      const st = useApp.getState()
      if (!st.welcomed) {
        markWelcomed()
        st.setModal('theme')
      }
    })()
  }, [])

  /* ---------- 主题令牌 → CSS 变量（皮肤 / 透明度 / 玻璃质感 / 壁纸 / 搜索框） ---------- */
  useEffect(() => {
    const rt = document.documentElement.style
    const tokens = skinTokensOf(skins, settings.skinId)
    Object.entries(tokens).forEach(([k, v]) => rt.setProperty(k, v))
    /* 透明度：玻璃底色保留可读下限（1 − 0.55×值），元素显隐类可直接归零（1 − 值） */
    Object.entries(settings.glass).forEach(([k, v]) => {
      const alpha = GLASS_FADED_KEYS.includes(k) ? 1 - GLASS_ALPHA_FACTOR * v : 1 - v
      rt.setProperty(`--ga-${k}`, alpha.toFixed(3))
    })
    /* 边框与分隔线 / 悬停与激活态：由皮肤令牌派生；可见度满格时保持原值不覆盖 */
    fadeToken(rt, '--line', tokens['--line'], 1 - settings.glass.line)
    fadeToken(rt, '--menu-hover', tokens['--menu-hover'], 1 - settings.glass.hover)
    /* 毛玻璃模糊：与透明度解耦，独立一组（px） */
    Object.entries(settings.blur).forEach(([k, v]) => rt.setProperty(`--blur-${k}`, `${v.toFixed(1)}px`))
    rt.setProperty('--g-alpha', String(settings.gAlpha))
    rt.setProperty('--wp-mask', String(settings.cover))
    rt.setProperty('--wp-blur', settings.cover > WALLPAPER_BLUR_COVER_THRESHOLD ? `${WALLPAPER_BLUR_PX}px` : '0px')
    // 字体颜色：设置里给了覆盖色则覆盖名称标签令牌
    rt.setProperty('--label-color', settings.fontColor !== '' ? settings.fontColor : (tokens['--label-color'] ?? '#ffffff'))
    rt.setProperty('--search-width', `${settings.searchWidth}px`)
    rt.setProperty('--search-radius', `${settings.searchRadius}px`)
    rt.setProperty('--clock-color', settings.clockColor)
    document.body.style.background = tokens['--mask-color'] ?? '#10151b'
  }, [skins, settings])

  /* ---------- 壁纸：自定义引用（IndexedDB）优先，否则内置渐变 ---------- */
  useEffect(() => {
    let alive = true
    if (settings.wallpaperRef === null) {
      setCustomWall(null)
      return
    }
    void getWallpaper(settings.wallpaperRef).then((bg) => {
      if (alive) setCustomWall(bg)
    })
    return () => { alive = false }
  }, [settings.wallpaperRef])
  /* 壁纸渲染不用 CSS 变量：外部壁纸落库为 base64 dataURL（可达数 MB），
     而单条 CSS 声明值有 200 万字符硬上限，超出后 setProperty 静默失效，
     表现为「已应用但没有壁纸」。故图片走 <img class="wall-img">，见渲染处。 */
  /* ---------- 壁纸自适应裁剪焦点：按视口宽高比挑主体最集中的窗口 ---------- */
  const focusFor = useRef<string | null>(null)
  useEffect(() => {
    if (customWall === null || customWall.type !== 'image' || vpRatio <= 0) return
    const ref = settings.wallpaperRef
    /* 同一张图且视口比例没实质变化就不重算：避免每次 resize 都解码一次图片。
       判据必须带上壁纸引用——只比比例的话换壁纸会沿用上一张的焦点。 */
    const stale = focusFor.current !== ref
      || settings.wallFocus.ratio <= 0
      || Math.abs(vpRatio - settings.wallFocus.ratio) / settings.wallFocus.ratio >= WALLPAPER_FOCUS_RATIO_TOLERANCE
    if (!stale) return
    let alive = true
    void computeWallFocus(customWall.data, vpRatio).then((f) => {
      if (!alive) return
      focusFor.current = ref
      setWallFocus(f)
    })
    return () => { alive = false }
  }, [customWall, vpRatio, settings.wallFocus, settings.wallpaperRef, setWallFocus])

  /* ---------- 时钟 & 整体缩放 ---------- */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    /* 舞台铺满窗口：设计像素 = 窗口/缩放；窗口小于设计尺寸时整体等比缩小（origin 左上，无居中偏移） */
    const fit = () => {
      const s = Math.min(1, window.innerWidth / STAGE_W, window.innerHeight / 945)
      const el = stageRef.current
      if (el) {
        el.style.width = `${window.innerWidth / s}px`
        el.style.height = `${window.innerHeight / s}px`
        el.style.transform = `scale(${s})`
      }
      stage.w = window.innerWidth / s
      stage.h = window.innerHeight / s
      stage.scale = s
      const r = window.innerWidth / Math.max(1, window.innerHeight)
      setVpRatio((p) => (p > 0 && Math.abs(r - p) / p <= 0.01 ? p : r))
    }
    fit()
    /* 视口变更监听：resize 事件 + ResizeObserver（布局驱动，覆盖不触发事件的宿主环境）；
       事件可能先于实际尺寸生效（竞态），多级延迟校准 */
    const onResize = (): void => { fit(); [90, 350].forEach((d) => window.setTimeout(fit, d)) }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(document.body)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      ro.disconnect()
    }
  }, [])
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => useApp.setState({ toast: '' }), 1800)
    return () => clearTimeout(t)
  }, [toastMsg])
  useEffect(() => {
    if (settings.autoFocus) inputRef.current?.focus()
  }, [settings.autoFocus])

  /* ---------- 动作分发（data-act 事件委托，与原型同一套语义） ---------- */
  useEffect(() => {
    const onAct = (name: string, v: string, el: HTMLElement): void => {
      const st = useApp.getState()
      const host = el.closest('.item')
      const id = host?.getAttribute('data-id') ?? st.ctx?.id ?? ''
      if (id) useApp.setState({ itemId: id })
      const item = allItems(st.pages).find((x) => x.id === id) ?? null
      switch (name) {
        /* 待办卡上的勾选框：直接翻转完成态（编辑仍在详情弹窗） */
        case 'todo-card': {
          if (item === null) break
          const items = normTodoItems(cfg(item)['items'])
          const i = Number(v)
          if (i >= 0 && i < items.length) {
            st.updateConfig(item.id, { items: items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })
          }
          break
        }
        /* 右键「网址导航」飞子菜单：站点统一新标签页打开（新标签页不离开当前主页） */
        case 'nav-open': st.openCtx(null); openByMode(st, v, 'link', 'tab'); break
        case 'engine-open': {
          setHistoryOpen(false)
          /* 引擎图标点击行为可在设置里改为「切换下一个引擎」（对只用一两个引擎的人更快） */
          if (st.settings.engineIcoAct === 'cycle') {
            const list = st.engines.filter((x) => !x.hidden)
            if (list.length > 1) {
              const i = list.findIndex((x) => x.id === st.settings.engineId)
              const next = list[(i + 1) % list.length]
              if (next !== undefined) {
                st.setEngine(next.id)
                st.showToast(`已切换到：${next.name}`)
              }
            }
            break
          }
          st.setEnginePanel(!st.enginePanel)
          break
        }
        case 'engine-manage': st.setEnginePanel(false); st.setDrawer('setting'); st.showToast('已打开设置 · 搜索引擎'); break
        case 'open-log': st.setSettingsTab(settingTabOf('关于')); st.setDrawer('setting'); st.showToast('已打开设置 · 更新记录'); break
        case 'eng-set': st.setEngine(v); st.showToast('该搜索引擎正在使用中'); break
        case 'eng-hide': st.toggleEngineHidden(v); break
        case 'search-go': runSearch('btn'); setHistoryOpen(false); break
        /* 历史条目等价于「填好词再回车」，按回车的方式打开 */
        case 'sp-pick': if (inputRef.current) inputRef.current.value = v; runSearch('enter'); setHistoryOpen(false); break
        case 'sp-del': useApp.setState({ history: st.history.filter((h) => h !== v) }); break
        case 'set-mode': st.setMode(v as 'minimal' | 'standard'); break
        case 'go-page': st.goPage(Number(v)); break
        case 'open-drawer': st.setDrawer((v || 'personal') as DrawerKey); break
        case 'dock-app': {
          st.openCtx(null)
          if (v !== '') openByMode(st, v, 'link')
          else st.showToast('未配置网址，右键图标可补充链接')
          break
        }
        case 'dock-rename': case 'dock-url': case 'dock-remove': case 'dock-config':
          dockMenuAct(name, v)
          break
        /* 菜单入口：打开添加抽屉并切到指定页签（快捷方式集中管理） */
        case 'open-add-tab': st.setAddTab(Number(v) || 0); st.setDrawer('add'); break
        case 'dock-act': st.setDrawer(({ add: 'add', personal: 'personal', setting: 'setting' } as const)[v] ?? 'setting'); break
        case 'open-modal': st.setModal(v as 'theme'); break
        case 'ctx-tog': {
          const k = v as 'labels' | 'mascot' | 'hideSearch' | 'gridLines'
          st.toggle(k)
          break
        }
        case 'msg': st.showToast('暂无消息'); break
        case 'item-edit': st.openCtx(null); st.setModal('editItem'); break
        case 'item-del': st.remove(id); break
        case 'item-swap': st.swapKind(id, v as GridItem['t']); break
        case 'item-size': {
          const [w, h] = v.split('x').map(Number)
          st.resize(id, w ?? 0, h ?? 0)
          st.openCtx(null)
          break
        }
        case 'item-folder': st.showToast('添加到文件夹：请输入文件夹名称'); break
        /* 卡片点击：图标卡开站，其余类型打开该组件的详情视图（拖拽后的 click 已被 suppressItemClick 拦下） */
        case 'item-open': {
          if (suppressItemClick) { suppressItemClick = false; break }
          if (item === null) break
          if (item.t === 'icon') {
            const url = resolveSiteUrl(item)
            if (url !== null) { openByMode(st, url, 'link'); break }
            st.showToast('未配置网址，可在编辑里补充链接')
            break
          }
          /* 小组件详情：天气看预报、日历看月历、待办勾任务、收藏夹浏览书签……编辑入口仍在悬浮 ··· */
          st.setModal('itemDetail')
          break
        }
        case 'open-link': {
          st.openCtx(null)
          if (item !== null) {
            const url = resolveSiteUrl(item)
            if (url !== null) openByMode(st, url, 'link')
            else st.showToast('未配置网址，可在编辑里补充链接')
          }
          break
        }
        default: break
      }
    }
    const click = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest?.('[data-act]') as HTMLElement | null
      if (t) { onAct(t.dataset['act'] ?? '', t.dataset['v'] ?? '', t); return }
      const st = useApp.getState()
      const inCtx = (e.target as HTMLElement).closest?.('#ctx')
      if (!inCtx) st.openCtx(null)
      const inSearch = (e.target as HTMLElement).closest?.('#searchBox') || (e.target as HTMLElement).closest?.('#searchPanel')
      if (!inSearch) {
        setHistoryOpen(false)
        /* 点击非可聚焦区域不会自动转移焦点，必须主动 blur，否则输入框永久保持聚焦态 */
        inputRef.current?.blur()
      }
      const inEngine = (e.target as HTMLElement).closest?.('#engineIco') || (e.target as HTMLElement).closest?.('#enginePanel')
      if (!inEngine) st.setEnginePanel(false)
    }
    const cm = (e: MouseEvent) => {
      e.preventDefault()
      const el = stageRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const s = r.width / stage.w
      const host = (e.target as HTMLElement).closest?.('.item')
      const dockHost = (e.target as HTMLElement).closest?.('.dock-apps .dock-item')
      const dockIdx = dockHost?.getAttribute('data-idx') ?? null
      const next: CtxState = {
        x: Math.min((e.clientX - r.left) / s, stage.w - 240),
        y: (e.clientY - r.top) / s,
        id: host?.getAttribute('data-id') ?? null,
        dock: dockIdx !== null ? Number(dockIdx) : null,
      }
      useApp.getState().openCtx(next)
    }
    /** 快捷键动作分发：返回 true 表示已处理（调用方负责 preventDefault） */
    const runShortcut = (id: string): boolean => {
      const st = useApp.getState()
      switch (id) {
        case 'focus-search': inputRef.current?.focus(); return true
        case 'page-prev': st.goPage(st.cur - 1); return true
        case 'page-next': st.goPage(st.cur + 1); return true
        case 'mode-toggle': st.setMode(st.settings.mode === 'minimal' ? 'standard' : 'minimal'); return true
        case 'open-add': st.setDrawer('add'); return true
        case 'open-personal': st.setDrawer('personal'); return true
        case 'open-setting': st.setDrawer('setting'); return true
        case 'export-layout': {
          downloadJson('thrilled-layout.json', buildLayoutDoc(st.exportLayout().pages))
          st.showToast('已导出 thrilled-layout.json')
          return true
        }
        case 'reset-all': st.setModal('reset'); return true
        case 'close-overlay':
          st.openCtx(null); st.setModal(null); st.setDrawer(null); st.setEnginePanel(false); setHistoryOpen(false)
          return true
        default: return false
      }
    }
    /* 快捷键统一查 settings.shortcuts：单按键只在非输入状态下触发，含修饰键的任意位置触发；
       typing 动作（关闭浮层）输入状态下也生效。重置走确认弹窗，满足二次确认约束 */
    const key = (e: KeyboardEvent) => {
      const st = useApp.getState()
      const combo = comboOf(e)
      if (combo === null) return
      const def = SHORTCUT_DEFS.find((d) => st.settings.shortcuts[d.id] === combo)
      if (def === undefined) return
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if (typing && def.typing !== true && isBareCombo(combo)) return
      if (runShortcut(def.id)) e.preventDefault()
    }
    /* 滚轮横向翻页（带冷却，原型同参数） */
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.('#pager') === null) return
      const t = Date.now()
      if (t - wheelAt.current < WHEEL_PAGE_COOLDOWN_MS) return
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(d) < WHEEL_MIN_DELTA) return
      wheelAt.current = t
      const st = useApp.getState()
      st.goPage(st.cur + (d > 0 ? 1 : -1))
    }
    document.addEventListener('click', click)
    document.addEventListener('contextmenu', cm)
    document.addEventListener('keydown', key)
    document.addEventListener('wheel', wheel, { passive: true })
    return () => {
      document.removeEventListener('click', click)
      document.removeEventListener('contextmenu', cm)
      document.removeEventListener('keydown', key)
      document.removeEventListener('wheel', wheel)
    }
  }, [])

  /* ---------- 拖拽换位（指针 + 网格吸附） ---------- */
  const gridRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const g = gridRef.current
      if (!g) return
      const r = g.getBoundingClientRect()
      const s = r.width / (COLS * CELL)
      setDrag((d) => {
        if (!d) return d
        const x = (e.clientX - r.left) / s
        const y = (e.clientY - r.top) / s
        /* 拖拽阈值：屏幕位移 ≤4px 视为点按（修「点击卡片左上角导致组件被移动」），不进入拖拽态
           （用屏幕坐标比较——stage 坐标在整体缩放下会被放大） */
        if (!d.moved && Math.abs(e.clientX - d.scx) <= 4 && Math.abs(e.clientY - d.scy) <= 4) return d
        const it = allItems(useApp.getState().pages).find((v) => v.id === d.id)
        if (!it) return d
        const c = Math.max(0, Math.min(COLS - it.w, Math.round((x - INSET) / CELL)))
        const r2 = Math.max(0, Math.min(ROWS - it.h, Math.round((y - INSET) / CELL)))
        return { ...d, x, y, c, r: r2, moved: true }
      })
    }
    const up = () => {
      setDrag((d) => {
        if (d !== null && d.moved) {
          suppressItemClick = true
          const ok = useApp.getState().move(d.id, d.c, d.r)
          if (!ok) useApp.getState().showToast('该位置已被占用')
          setTimeout(() => { suppressItemClick = false }, 80)
        }
        return null
      })
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
  }, [drag])

  return (
    <>
      {/* 全窗口壁纸层（固定定位，缩放白边不可见）+ 遮罩 */}
      <div className="wall-layer">
        {customWall !== null && customWall.type === 'image' && (
          /* object-fit:cover 负责等比填满不留黑边；object-position 由焦点算法给出，避免主体被居中裁掉 */
          <img className="wall-img" src={customWall.data} alt=""
            style={{ objectPosition: `${Math.round(settings.wallFocus.x)}% ${Math.round(settings.wallFocus.y)}%` }} />
        )}
        {customWall !== null && customWall.type === 'video' && (
          <video className="wall-video" src={customWall.data} autoPlay loop muted playsInline />
        )}
      </div>
      <div className="wall-mask" />

      <div id="stage" ref={stageRef} data-mode={settings.mode}
        data-hidetop={settings.hideTop ? '1' : '0'} data-hidesearch={settings.hideSearch ? '1' : '0'}
        style={{ ['--search-top' as string]: `${settings.searchTop}px`, ['--search-font' as string]: `${settings.searchFontSize}px` }}>

      {/* 翻页画布 */}
      <div id="pager" style={{ transform: `translateX(-${cur * PAGE_W}px)` }}>
        {pages.map((pg, i) => (
          <div className="page" key={i} style={{ left: i * PAGE_W }}>
            <div className="grid" ref={i === cur ? gridRef : undefined}>
              {/* 网格对齐线：设置开启时常显；添加 / 拖拽组件时强制显示（位置确认的视觉参照） */}
              {(settings.gridLines || drag !== null) && <div className="grid-lines" />}
              {pg.map((it, idx) => (
                <GridCard key={it.id} item={it} idx={idx} now={now} weather={weather}
                  dragging={drag?.id === it.id ? drag : null}
                  onDragStart={(e) => {
                    if (e.button !== 0 || (e.target as HTMLElement).closest('.ia')) return
                    const g = gridRef.current
                    if (!g) return
                    const r = g.getBoundingClientRect()
                    const s = r.width / (COLS * CELL)
                    setDrag({
                      id: it.id, moved: false,
                      x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s, c: it.c, r: it.r,
                      scx: e.clientX, scy: e.clientY,
                    })
                  }} />
              ))}
              {pg.length === 0 && (
                <div className="grid-hint">
                  <div className="gh-title">这里可以放小组件和网站</div>
                  <div className="gh-sub">点击底部 Dock 的「+」→ 小组件页签有 9 类可选（时钟 / 日历 / 待办 / 天气 / 倒计时…），网址导航与自定义网站也在那里；右键空白处可直接打开「网址导航」</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 页点 */}
      {pages.length > 1 && (
        <div className="page-dots">
          {pages.map((_, i) => (
            <div key={i} className={`page-dot${i === cur ? ' on' : ''}`} data-act="go-page" data-v={String(i)} />
          ))}
        </div>
      )}

      {/* 搜索行 */}
      <div className="search-row">
        <div className={`search-box${settings.immersive ? ' immersive' : ''}${settings.simpleSearch ? ' line' : ''}`} id="searchBox"
          style={{ width: settings.searchWidth, borderRadius: settings.searchRadius }}
          onClick={() => setHistoryOpen(true)}>
          {!settings.hideEngineIco && (
            <span className="engine-ico" id="engineIco" data-act="engine-open"
              style={{ fontSize: engine?.latin ? 10 : 11, ['--engine-color' as string]: engine?.color }}>{engine?.glyph}</span>
          )}
          <input id="searchInput" ref={inputRef}
            placeholder={settings.searchPlaceholder.trim() === '' ? `${engine?.name ?? ''} 搜索` : settings.searchPlaceholder}
            autoComplete="off" spellCheck={false}
            onFocus={() => setHistoryOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch('enter'); setHistoryOpen(false) } }} />
          {!settings.hideBtn && (
            <span className="search-go-btn" data-act="search-go" title="搜索">{Icon.search()}</span>
          )}
        </div>
      </div>
      {settings.searchHistory && historyOpen && history.length > 0 && (
        <div className="search-panel show" id="searchPanel" onMouseLeave={() => setHistoryOpen(false)}>
          <div className="sp-head">搜索历史</div>
          {history.map((h) => (
            <div className="sp-row" key={h} data-act="sp-pick" data-v={h}>
              {Icon.search()}<span className="t">{h}</span>
              {settings.historyItemDel && <span className="sp-del" data-act="sp-del" data-v={h}>{Icon.close()}</span>}
            </div>
          ))}
        </div>
      )}
      {enginePanel && (
        <div className="engine-panel show" id="enginePanel" style={{ left: (stage.w - settings.searchWidth) / 2 }}>
          {visibleEngines.map((e) => (
            <div key={e.id} className={`ep-row${e.id === settings.engineId ? ' on' : ''}`} data-act="eng-set" data-v={e.id}>
              <span className="ep-ico" style={{ background: e.color, fontSize: e.latin ? 9 : 11 }}>{e.glyph}</span>
              <span className="ep-n">{e.name}</span>
              {e.id === settings.engineId ? <span className="ep-cur">{Icon.check()}</span> : null}
            </div>
          ))}
          <div className="ep-foot" />
          <div className="ep-row ep-manage" data-act="engine-manage">
            <span className="ep-ico" style={{ background: 'transparent', color: 'var(--panel-sub)' }}>{Icon.gear()}</span>
            <span className="ep-n">管理搜索引擎</span><span className="ep-key">设置</span>
          </div>
        </div>
      )}

      {/* 极简模式：大时钟（日期格式 2026年9月29日） */}
      <div className="minimal-clock">
        <div className="mc-time">{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`}</div>
        <div className="mc-date">{`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`}</div>
      </div>

      {/* 模式胶囊：默认只显图标，悬停 / 点击展开 极简 / 标准 两选项（无说明文字） */}
      {!settings.hideTop && (
        <div className={`mode-pill${pillOpen ? ' open' : ''}`} id="modePill"
          onMouseEnter={() => setPillOpen(true)} onMouseLeave={() => setPillOpen(false)}>
          <span className="pill-ico">{settings.mode === 'minimal' ? Icon.feather() : Icon.modeStd()}</span>
          <div className="pill-opts">
            {([['minimal', '极简'], ['standard', '标准']] as const).map(([k, n]) => (
              <div key={k} className={`pill-btn${settings.mode === k ? ' active' : ''}`} data-act="set-mode" data-v={k}
                onClick={() => setPillOpen(false)}>
                {k === 'minimal' ? Icon.feather() : Icon.modeStd()}{n}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dock：用户快捷方式（favicon 图标）+ 功能键 新增/个性化/设置；悬停反馈为纯 CSS 排他动效（prototype.css 第 17 节），一次只激活指针下的那一个图标 */}
      {settings.mascot && (
        <div className="dock">
          <div className="dock-bar">
            <div className="dock-apps">
              {dockApps.slice(0, settings.dockCount).map((app, i) => (
                <div className="dock-item" key={`dock-${i}`} data-act="dock-app" data-v={app.url} data-idx={String(i)}
                  title={app.name}>
                  <div className={`dock-icon${settings.dockIcon === 'circle' ? ' circle' : ''}`}>
                    <SiteIcon url={app.url} name={app.name} cls="dock-favicon" fs={24} size={38} />
                  </div>
                </div>
              ))}
            </div>
            {dockApps.length > 0 && <div className="dock-sep" />}
            <div className="dock-actions">
              {DOCK_ACTIONS.map(([act, label, icon]) => (
                <div className="dock-item" key={act} data-act="dock-act" data-v={act} title={label}>
                  <div className="dock-icon dock-fn">{icon()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ContextMenu />
      <Drawer />
      <Modal />
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
    </>
  )
}

/** 单张卡片：外框（点击开站 / 拖拽换位）+ 内容 + 名称标签 + 悬浮操作 */
const GridCard = ({ item, idx, now, weather, dragging, onDragStart }: {
  item: GridItem
  /** 页内序号（入场动画渐次延迟用） */
  idx: number
  now: Date
  weather: WeatherData | null
  dragging: { x: number; y: number; moved: boolean } | null
  onDragStart: (e: ReactPointerEvent) => void
}) => {
  const c = cfg(item)
  /* 通用配置：卡片透明度（config.opacity 为数字时覆盖全局 --ga-card，未设置则跟随全局） */
  const ov = c['opacity']
  const cardVars = typeof ov === 'number' ? { ['--ga-card' as string]: (1 - GLASS_ALPHA_FACTOR * ov).toFixed(3) } : {}
  /* 尺寸自适应 + 实例样式：--nw/--nh 是组件的自然尺寸，CSS 里
     --u = max(1px, min(100cqw/--nw, 100cqh/--nh)) × 字号缩放 即「1 设计像素」；
     自然尺寸下 --u = 1px（渲染与设计稿一致），更大的卡片等比放大，更小的卡片不缩小 */
  const nat = naturalBoxOf(item.t)
  const sizeVars = {
    ['--nw' as string]: String(nat.w),
    ['--nh' as string]: String(nat.h),
    ...styleVarsOf(c),
  }
  const draggingStyle = dragging !== null && dragging.moved
  const style = draggingStyle
    ? { left: dragging.x, top: dragging.y, zIndex: 20, transition: 'none' }
    : { animationDelay: `${Math.min(idx * 22, 440)}ms` }
  return (
    <>
      <div className={`item${draggingStyle ? ' dragging' : ''}`} style={{ ...parseBox(itemBox(item)), ...cardVars, ...sizeVars, ...style }}
        data-id={item.id} data-t={item.t} data-act="item-open"
        onPointerDown={onDragStart}>
        <WidgetView item={item} now={now} weather={weather} />
        {/* 名称标签已整体移除（用户需求）：卡片不再显示左下角组件名；名称仍用于网址图标命名与文件夹卡 */}
        <div className="item-acts">
          <div className="ia" data-act="item-edit" title="编辑">{Icon.edit()}</div>
          <div className="ia" data-act="item-del" title="删除">{Icon.trash()}</div>
        </div>
      </div>
    </>
  )
}

/** "left:1px;top:2px" → React 内联样式对象 */
const parseBox = (css: string): Record<string, string | number> => {
  const out: Record<string, string | number> = {}
  css.split(';').forEach((kv) => {
    const [k, v] = kv.split(':')
    if (k && v) out[k.trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = v.trim()
  })
  return out
}
