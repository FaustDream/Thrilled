/**
 * 新标签页装配（v4）
 * 结构：Stage（1920×945 设计稿整体缩放）→ 搜索行 / 翻页网格 / Dock（快捷方式 + 新增·个性化·设置）/ 模式胶囊 / 页点 + 浮层（菜单·抽屉·弹窗·Toast）
 * 交互：文档级 data-act 事件委托（与原型一致），拖拽换位用指针事件 + 网格吸附，滚轮 / 方向键翻页。
 * 平台行为：打开链接走 core/link-opener（打开方式设置），壁纸走 core/wallpaper（IndexedDB）。
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useApp, skinTokensOf, markWelcomed, type CtxState, type DrawerKey } from './store'
import { CELL, COLS, GRID_LEFT, GRID_TOP, PAGE_W, ROWS, SNAP_ALIGN_PX, insetOf, itemBox, nearOnAxis, snapAxis, stageFitOf } from '../shared/grid'
import type { AxisSnap, StageFit } from '../shared/grid'
import { naturalBoxOf } from '../shared/widget-defs'
import { stage } from './stage'
import { WidgetView, SiteIcon, cfg, str, styleVarsOf } from './widgets'
import { hostOf, normTodoItems } from '../core/utils'
import { siteUrlOf } from './brands'
import { ContextMenu } from './menus'
import { IconTip } from './tip'
import { Drawer, Modal } from './panels'
import { DialogHost, askInput } from './dialog'
import { Icon } from './icons'
import { makeLqip, writeBootBg, writeBootLqip } from './boot-theme'
import { setSkinRuntime } from './skin-runtime'
import { openLink, buildSearchUrl } from '../core/link-opener'
import { buildLayoutDoc, downloadJson } from '../core/export'
import { getWallpaper, type BgData } from '../core/wallpaper'
import { GLASS_ALPHA_FACTOR, GLASS_FADED_KEYS, PAGE_EDGE_MS, PAGE_EDGE_PX, WHEEL_PAGE_COOLDOWN_MS, WHEEL_MIN_DELTA, WALLPAPER_BLUR_COVER_THRESHOLD, WALLPAPER_BLUR_PX, WALLPAPER_FOCUS_RATIO_TOLERANCE } from '../shared/constants'
import { crossPlan } from './layout'
import { SHORTCUT_DEFS, comboOf, isBareCombo } from '../shared/shortcuts'
import { HOLD_MS, holdVerdict } from '../shared/hold'
import { DOCK_ICON_METRICS } from '../shared/dock'
import { computeWallFocus } from '../core/wallpaper-focus'
import { buildToneGrid, boxUv, toneAt, type ToneGrid } from '../core/walltone'
import { coverFix, fixForInk, hexLum, pickInk } from '../shared/luma'
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
    void askInput({
      title: '修改名称', label: '图标名称', value: app?.name ?? '', confirmText: '保存',
      validate: (v) => (v === '' ? '名称不能为空' : null),
    }).then((next) => { if (next !== null) { patchAt({ name: next }); st.showToast('已修改名称') } })
  } else if (name === 'dock-url') {
    void askInput({
      title: '修改网址', label: '网址', value: app?.url ?? '', placeholder: 'https://', confirmText: '保存',
      validate: (v) => (/^https?:\/\//.test(v) ? null : '网址需以 http(s):// 开头'),
    }).then((next) => { if (next !== null) { patchAt({ url: next }); st.showToast('已修改网址') } })
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

/**
 * 真壁纸解码完成后撤掉首帧占位图（铺在 <html> 上的 backgroundImage，见 boot-theme / public/boot.js）。
 * 模块级常量：引用稳定，memo 化的卡片与 img 不会因为回调变化重渲染。
 */
const clearBootLqip = (): void => {
  const html = document.documentElement
  html.style.backgroundImage = 'none'
}

/** 浮层卡不需要按下行为；用模块级常量保证引用稳定（memo 友好） */
const noop = (): void => { /* 拖拽中的卡片不接手势 */ }

/**
 * 一张卡片背后的对比度配置（补丁 38）：局部壁纸明暗算出来的墨色与两层辅助。
 * 放在一起传递是为了 memo——整表在拖拽中不变，引用稳定，卡片不会因此重渲染。
 */
interface CardTone {
  /** 最终墨色（#rrggbb） */
  ink: string
  /** 与墨色相反的一侧（"0,0,0" / "255,255,255"）：护罩与光晕都用它 */
  anti: string
  /** 护罩 alpha（0 = 不需要） */
  scrim: number
  /** 外圈光晕 alpha（图标：按自动选定的墨色算） */
  halo: number
  /** 卡片文字的外圈描边强度：文字仍走皮肤墨色，故要按**皮肤墨色**重算一遍 */
  haloT: number
}

/** 「长按才能拖动」的提示只在一次会话里给一次：新标签页每次打开都会重新加载，
    故用 sessionStorage 跨标签页记（隐私模式下取不到存储也不报错，只按内存标记） */
const HOLD_HINT_KEY = 'thrill-hold-hint'
let holdHinted = false

function hintHold(): void {
  if (holdHinted) return
  holdHinted = true
  try {
    if (sessionStorage.getItem(HOLD_HINT_KEY) !== null) return
    sessionStorage.setItem(HOLD_HINT_KEY, '1')
  } catch {
    /* 存储不可用：本次页面加载内仍只提示一次 */
  }
  useApp.getState().showToast('拖动卡片需先长按 0.5 秒：按住不动再拖')
}

/**
 * 拖拽态：offX/offY 是抓取偏移（指针相对卡片左上角，设计像素），保证拖动中卡片不会跳到指针下；
 * c/r 是当前候选格（已含「网格基准 + 阈值内的组件对齐」），gx/gy 是命中的对齐参考线（画线与高亮目标用）。
 */
interface DragState {
  /** 主卡：多选拖拽时跟随指针的那一张 */
  id: string
  /** 本次一起搬的卡片（含主卡）：单张时 = [id]，多选拖拽时 = 整组——跨页落位按这个集合走 */
  ids: readonly string[]
  /** 指针位置（相对网格原点的设计像素） */
  x: number
  y: number
  /** 起始屏幕坐标（长按判定用——位移容差比较的是屏幕像素，stage 坐标在整体缩放下会被放大） */
  scx: number
  scy: number
  /** 按下时刻（performance.now），算按住时长 */
  t0: number
  offX: number
  offY: number
  c: number
  r: number
  gx: AxisSnap['guide']
  gy: AxisSnap['guide']
  /** 是否已进入拖拽态：**只有长按到点才置 true**，置 true 后卡片才跟随指针 */
  moved: boolean
}

export const App = () => {
  const settings = useApp((s) => s.settings)
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const engines = useApp((s) => s.engines)
  const skins = useApp((s) => s.skins)
  const setWallFocus = useApp((s) => s.setWallFocus)
  const toastMsg = useApp((s) => s.toast)
  const flashId = useApp((s) => s.flashId)
  const enginePanel = useApp((s) => s.enginePanel)
  const history = useApp((s) => s.history)
  const weather = useApp((s) => s.weather)
  const [now, setNow] = useState(() => new Date())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pillOpen, setPillOpen] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  /* 只注册一次的键盘处理要读到最新的拖拽态（拖拽中按 Esc 取消），故用 ref 镜像 */
  const dragLive = useRef(false)
  useEffect(() => { dragLive.current = drag !== null }, [drag])
  /* 本次按下是否已被判为「想拖但没按住」而作废：按下时清零，松手时据此吃掉那次 click */
  const holdAbort = useRef(false)
  const [customWall, setCustomWall] = useState<BgData | null>(null)
  /* 视口宽高比（只在变化超过 1% 时更新，避免 resize 抖动触发无谓重渲染） */
  const [vpRatio, setVpRatio] = useState(() => window.innerWidth / Math.max(1, window.innerHeight))
  /* 壁纸明暗图（补丁 38）：自定义壁纸降采样成灰度矩阵，用来取「每张卡片背后那块壁纸的亮度」。
     没有自定义壁纸时它保持 null——纯色皮肤底直接用 --mask-color 算，不需要取样 */
  const [toneGrid, setToneGrid] = useState<ToneGrid | null>(null)
  /* 舞台缩放与视口尺寸：卡片设计坐标 → 壁纸取样点的换算要用（resize 后必须跟着变） */
  const [fit, setFit] = useState(() => ({ w: window.innerWidth, h: window.innerHeight, s: 1 }))
  const inputRef = useRef<HTMLInputElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const wheelAt = useRef(0)

  /* ---------- 多选与跨页拖拽（v4.4 补丁 36） ---------- */
  /* 多选集合放 store：拖拽、右键菜单与卡片描边都要读；跨页有效——可以选好第 2、3 页的图标一次搬到第 1 页 */
  const picked = useApp((s) => s.picked)
  /* Shift 范围选中的锚点（最近一次不带 Shift 的卡片点击） */
  const pickAnchor = useRef<string | null>(null)
  /* 拖拽时指针的最后位置（屏幕坐标）：翻页后没有新的 pointermove 也要按它重算落点 */
  const lastPt = useRef({ x: 0, y: 0 })
  /* 跨页：边缘停留翻页的计时器与方向（挂 ref——拖拽 effect 每帧都会重跑，清理会把计时清掉） */
  const edgeTimer = useRef<number | null>(null)
  const edgeDir = useRef(0)
  /* 刚拖完落位的卡片 id：它们在页内是「重新挂载的新节点」，要跳过入场动画（item-in）——
     否则松手瞬间卡片先消失（backwards + 最长 440ms 延迟）再淡入，观感就是「拖动结束很生硬」 */
  const justDropped = useRef<ReadonlySet<string>>(new Set<string>())
  /* 松手后的「飞回落位」（FLIP 第一步）：卡片先按这个平移偏移渲染，下一帧偏移去掉，
     由 .item 自带的 transform 过渡（.2s 弹簧）把它贴到新格上——结束时的顺滑感主要来自这里 */
  const [fly, setFly] = useState<{ id: string; dx: number; dy: number } | null>(null)

  /* 拖拽中的指针位置：pointermove 只记最新坐标，真正的计算合并到 rAF 里做一次
     （高刷新率屏 / 高回报率鼠标一秒能派发几百个事件，逐个算就是几百次全树渲染）。
     这是「跟手」的基础：每帧最多一次计算 + 一次渲染 */
  const pendingPt = useRef<{ x: number; y: number } | null>(null)
  const rafId = useRef(0)
  /* 舞台 rect 缓存：拖拽中每帧都要拿它换算格坐标，不能每帧读 getBoundingClientRect
     （读一次 = 强制一次同步布局）。失效点：窗口尺寸变化（写 stage transform 的那处）与每次按下 */
  const stageBoxRef = useRef<{ left: number; top: number; width: number; s: number } | null>(null)

  /** 舞台在屏幕上的位置与缩放（带缓存，见 stageBoxRef 的失效点） */
  const stageBox = (): { left: number; top: number; width: number; s: number } | null => {
    const cached = stageBoxRef.current
    if (cached !== null) return cached
    const el = stageRef.current
    if (el === null) return null
    const r = el.getBoundingClientRect()
    const s = r.width / stage.w
    if (!(s > 0)) return null
    const box = { left: r.left, top: r.top, width: r.width, s }
    stageBoxRef.current = box
    return box
  }

  /**
   * 当前页网格在屏幕上的原点与缩放：用舞台 rect + 网格常量**静态换算**。
   * 不读 #pager 里 grid 的实时 rect——翻页有过渡，实时 rect 会拿到滑动中的坐标，
   * 而跨页拖拽正是靠翻页完成的；拖拽浮层也用同一套「设计坐标」。
   */
  const gridOrigin = (): { x: number; y: number; s: number } | null => {
    const b = stageBox()
    if (b === null) return null
    return { x: b.left + GRID_LEFT * b.s, y: b.top + GRID_TOP * b.s, s: b.s }
  }

  /**
   * 已进入拖拽态时按指针位置重算候选格（跨页时以「当前页」为基准）。
   * 副作用（读布局、写 store）一律留在事件 / 计时器里，绝不写进 setDrag 的 updater——
   * 那会在渲染阶段执行，变成「渲染期间更新其它组件」，React 18 会直接报错。
   */
  const applyDragPoint = (clientX: number, clientY: number): void => {
    lastPt.current = { x: clientX, y: clientY }
    const o = gridOrigin()
    if (o === null) return
    const px = (clientX - o.x) / o.s
    const py = (clientY - o.y) / o.s
    setDrag((d) => {
      if (d === null || !d.moved) return d
      const st = useApp.getState()
      const it = allItems(st.pages).find((v) => v.id === d.id)
      if (it === undefined) return d
      /* 自由位置（去掉抓取偏移）→ 每轴独立选格：网格给基准，阈值内可被组件对齐覆盖。
         某轴只参考「另一轴邻近」的卡片，避免整页同列 / 同行的卡片都被当成对齐目标。
         内缩按卡片类型取（图标类贴边），与 itemBox 同一处 insetOf，抓取偏移与落格才一致 */
      const inset = insetOf(it.t)
      const freeC = (px - d.offX - inset) / CELL
      const freeR = (py - d.offY - inset) / CELL
      const others = (st.pages[st.cur] ?? []).filter((v) => v.id !== d.id)
      const nearX = others.filter((v) => nearOnAxis(freeR, freeR + it.h, v.r, v.r + v.h))
      const nearY = others.filter((v) => nearOnAxis(freeC, freeC + it.w, v.c, v.c + v.w))
      const threshold = st.settings.snapItems ? SNAP_ALIGN_PX : 0
      const sx = snapAxis(freeC, it.w, COLS, nearX, 'x', threshold, inset)
      const sy = snapAxis(freeR, it.h, ROWS, nearY, 'y', threshold, inset)
      return { ...d, x: px, y: py, c: sx.index, r: sy.index, gx: sx.guide, gy: sy.guide }
    })
  }

  /** 取消边缘翻页计时 */
  const clearEdge = (): void => {
    if (edgeTimer.current !== null) { window.clearTimeout(edgeTimer.current); edgeTimer.current = null }
    edgeDir.current = 0
  }

  /** 翻一页（边缘停留到点后调用）：翻完按最后指针位置重算落点，仍停在边缘带就继续翻下一页 */
  const edgeTurn = (dir: number): void => {
    edgeTimer.current = null
    useApp.getState().goPage(useApp.getState().cur + dir)
    applyDragPoint(lastPt.current.x, lastPt.current.y)
    checkEdge(lastPt.current.x)
  }

  /** rAF 回调：把这一帧攒下的最后一次指针位置算掉（每帧最多一次计算 + 一次渲染） */
  const flushPoint = (): void => {
    rafId.current = 0
    const p = pendingPt.current
    if (p === null) return
    pendingPt.current = null
    applyDragPoint(p.x, p.y)
    checkEdge(p.x)
  }

  /** 指针移动只登记坐标，真正的计算交给下一帧 */
  const queuePoint = (clientX: number, clientY: number): void => {
    lastPt.current = { x: clientX, y: clientY }
    pendingPt.current = { x: clientX, y: clientY }
    if (rafId.current === 0) rafId.current = window.requestAnimationFrame(flushPoint)
  }

  /** 拖到舞台左右边缘停留就翻页：跨页拖拽的主手势（滚轮与方向键是两条快捷路径） */
  const checkEdge = (clientX: number): void => {
    const b = stageBox()
    if (b === null) return
    const band = Math.min(PAGE_EDGE_PX, b.width * 0.15)
    const st = useApp.getState()
    const dir = clientX < b.left + band ? -1 : clientX > b.left + b.width - band ? 1 : 0
    const can = dir === -1 ? st.cur > 0 : dir === 1 ? st.cur < st.pages.length - 1 : false
    if (!can) { clearEdge(); return }
    if (edgeDir.current === dir && edgeTimer.current !== null) return
    clearEdge()
    edgeDir.current = dir
    edgeTimer.current = window.setTimeout(() => edgeTurn(dir), PAGE_EDGE_MS)
  }

  /** Ctrl/Cmd 单击 = 切换选中；Shift 单击 = 把锚点到这张之间的**同类型**卡片加入选中（并集） */
  const pickCard = (id: string, shift: boolean): void => {
    const st = useApp.getState()
    const has = st.picked
    if (!shift) {
      pickAnchor.current = id
      st.setPicked(has.includes(id) ? has.filter((x) => x !== id) : [...has, id])
      return
    }
    const a = pickAnchor.current
    if (a === null || a === id) {
      if (!has.includes(id)) st.setPicked([...has, id])
      return
    }
    /* 范围按「页序 + 页内自上而下、自左而右」——与整理 / 跨页落位同一口径。
       只取「与锚点同类型」的图标类卡片：范围里混进别的类型会超出预期（实测按 (r,c) 划一段
       会把路径上的 11 个图标格容器一起选中），要凑不同种类就各自 Ctrl 点一下；
       组件也不参与（它们不跨页搬动） */
    const byId = new Map(st.pages.flat().map((x) => [x.id, x]))
    const anchorType = byId.get(a)?.t
    if (anchorType === undefined) return
    const seq: string[] = []
    st.pages.forEach((pg) => pg
      .filter((x) => x.t === anchorType)
      .slice()
      .sort((x, y) => x.r - y.r || x.c - y.c)
      .forEach((x) => seq.push(x.id)))
    const i = seq.indexOf(a)
    const j = seq.indexOf(id)
    if (i < 0 || j < 0) return
    const [lo, hi] = i <= j ? [i, j] : [j, i]
    const next = new Set(has)
    for (let k = lo; k <= hi; k++) { const v = seq[k]; if (v !== undefined) next.add(v) }
    st.setPicked([...next])
  }

  /**
   * 卡片按下：**全页共用一个引用稳定的处理器**（GridCard 走 memo，内联箭头会让 memo 每次都失效）。
   * 是哪张卡从 dataset 读、条目回 store 里查，闭包不捕获任何会变的值——所以只在首次渲染建一次
   * （内部只碰 ref 与 store，晚建不如早建）。
   */
  const onItemDownRef = useRef<((e: ReactPointerEvent) => void) | null>(null)
  if (onItemDownRef.current === null) {
    onItemDownRef.current = (e: ReactPointerEvent) => {
      /* 新的按下 = 新的交互：上一次手势留下的「吃掉 click」标记到此为止
         （Esc 取消 / 作废手势时置位的标记可能等不到那次 click，不清就会误吃后面的点击） */
      suppressItemClick = false
      /* 只认左键，悬浮操作按钮（✎ / 🗑）不参与拖拽；修饰键按下是多选（见 click 处理），
         也不进拖拽。按下**只登记「待长按」**，真正进入拖拽要等按住满 HOLD_MS */
      if (e.button !== 0 || (e.target as HTMLElement).closest('.ia')) return
      if (e.ctrlKey || e.metaKey || e.shiftKey) return
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id')
      if (id === null) return
      const o = gridOrigin()
      if (o === null) return
      const st = useApp.getState()
      const it = allItems(st.pages).find((v) => v.id === id)
      if (it === undefined) return
      const px = (e.clientX - o.x) / o.s
      const py = (e.clientY - o.y) / o.s
      /* 拖整组还是这一张：按下的卡片在多张选择集里 → 整组（桌面惯例：拖选中项 = 拖整组），
         否则清空选择、只拖这一张 */
      const sel = st.picked
      const group = sel.includes(id) && sel.length > 1 ? sel.slice() : [id]
      if (group.length === 1 && sel.length > 0) st.setPicked([])
      holdAbort.current = false
      lastPt.current = { x: e.clientX, y: e.clientY }
      /* 本次手势用最新的舞台 rect（窗口尺寸可能在两次按下之间变过），并让上一帧的缓存失效 */
      stageBoxRef.current = null
      /* 记下抓取偏移与按下时刻：拖动过程中卡片不会「跳」到指针下方，长按计时从按下起算 */
      setDrag({
        id, ids: group, moved: false,
        x: px, y: py, scx: e.clientX, scy: e.clientY, t0: performance.now(),
        offX: px - (it.c * CELL + insetOf(it.t)), offY: py - (it.r * CELL + insetOf(it.t)),
        c: it.c, r: it.r, gx: null, gy: null,
      })
    }
  }
  const onItemDown = onItemDownRef.current

  const engine = engines.find((e) => e.id === settings.engineId) ?? engines[0]
  const visibleEngines = engines.filter((e) => !e.hidden)
  const dockApps = settings.dockApps
  /* Dock 图标档位：三档尺寸集中定义在 shared/dock，CSS 只读这里给出的变量 */
  const dockM = DOCK_ICON_METRICS[settings.dockIconSize]

  /* ---------- 启动：天气 + 首次引导标记（配置已在挂载前载入） ---------- */
  useEffect(() => {
    void useApp.getState().loadWeather()
    /* 首次安装不弹欢迎 / 风格弹窗：空白页上直接给出添加入口，用户自己开始 */
    if (!useApp.getState().welcomed) markWelcomed()
  }, [])

  /* ---------- 天气自动刷新：按设置间隔静默取新数据（0 = 关闭；force 跳过 30min 缓存） ---------- */
  useEffect(() => {
    const minutes = settings.weatherEvery
    if (minutes <= 0) return
    const timer = window.setInterval(() => { void useApp.getState().loadWeather(true, true) }, minutes * 60_000)
    return () => window.clearInterval(timer)
  }, [settings.weatherEvery])

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
    /* 壁纸遮罩：自动对比开启时按「壁纸有多花」补一层（亮度均匀的壁纸不加），滑杆值当基准。
       遮罩会同时给卡片底衬与文字垫背景，是「壁纸太亮 / 太乱」时最省事的一层 */
    const cover = settings.autoContrast
      ? Math.min(1, settings.cover + coverFix(toneGrid?.avg ?? 0.5, toneGrid?.min ?? 0.5, toneGrid?.max ?? 0.5))
      : settings.cover
    rt.setProperty('--wp-mask', String(cover))
    rt.setProperty('--wp-blur', cover > WALLPAPER_BLUR_COVER_THRESHOLD ? `${WALLPAPER_BLUR_PX}px` : '0px')
    // 字体颜色：设置里给了覆盖色则覆盖名称标签令牌
    rt.setProperty('--label-color', settings.fontColor !== '' ? settings.fontColor : (tokens['--label-color'] ?? '#ffffff'))
    rt.setProperty('--search-width', `${settings.searchWidth}px`)
    rt.setProperty('--search-radius', `${settings.searchRadius}px`)
    /* 时间颜色：空串 = 跟随主题（用皮肤令牌里的 --clock-color）。
       原先出厂值写死 #1f2937，切到暗黑主题后时钟等于隐形（4.97 修） */
    if (settings.clockColor !== '') rt.setProperty('--clock-color', settings.clockColor)
    const maskColor = tokens['--mask-color'] ?? '#10151b'
    const maskLum = hexLum(maskColor) ?? 0
    /* 极简模式整屏压在壁纸 / 底色上，没有卡片托底，故墨色必须按底色明暗自己挑：
       经典主题的底色是白的，沿用「白字 + 黑投影」会直接消失（4.97 修）。
       浅底用主题正文色 + 深色描边，深底才用白字 + 白色描边 */
    const minimalLight = maskLum > 0.5
    rt.setProperty('--minimal-ink', minimalLight ? (tokens['--panel-text'] ?? '#1f2937') : '#ffffff')
    rt.setProperty('--minimal-anti', minimalLight ? '255,255,255' : '0,0,0')
    /* 搜索框描边与悬停底：跟墨色同侧（浅底深边、深底白边），否则描边自己也看不见 */
    rt.setProperty('--minimal-veil', minimalLight ? 'rgba(15,23,42,.32)' : 'rgba(255,255,255,.75)')
    rt.setProperty('--minimal-fill', minimalLight ? 'rgba(15,23,42,.05)' : 'rgba(0,0,0,.06)')
    /* 品牌色字形的落点底色：写入 runtime，供 TileGlyph 在渲染期同步挑墨色（见 app/skin-runtime） */
    setSkinRuntime({ tileBg: tokens['--tile-bg'] ?? '#ffffff', cardBg: tokens['--card-bg'] ?? '#ffffff' })
    /* 只写 html 的 backgroundColor：根元素的背景会自动传播到整个画布，body 必须保持透明，
       否则不透明的 body 会盖住首帧占位壁纸（占位图是 html 的 backgroundImage，见 boot-theme）。
       也不用 background 简写——那会把 backgroundImage 一起清掉，真壁纸解码完之前又回到纯色 */
    document.documentElement.style.backgroundColor = maskColor
    /* 记下底色：下次打开新标签页时，配置读出来之前先用它铺底，避免先闪默认浅色 */
    writeBootBg(maskColor)
  }, [skins, settings, toneGrid])

  /* ---------- 壁纸：自定义引用（IndexedDB）优先，否则内置渐变 ---------- */
  useEffect(() => {
    let alive = true
    if (settings.wallpaperRef === null) {
      setCustomWall(null)
      /* 换成纯底色（或移除壁纸）：清掉首帧占位图，下次打开直接用底色，不残留上一张 */
      writeBootLqip('')
      return
    }
    void getWallpaper(settings.wallpaperRef).then((bg) => {
      if (!alive) return
      setCustomWall(bg)
      /* 记下缩略占位：下次打开新标签页时，真壁纸解码完成之前先铺这张，避免中间那段纯色 */
      if (bg !== null && bg.type === 'image') {
        void makeLqip(bg.data).then((lqip) => { if (alive && lqip !== '') writeBootLqip(lqip) })
      } else {
        writeBootLqip('')
      }
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

  /* ---------- 自动对比：壁纸明暗图（补丁 38） ----------
     自定义壁纸 → 灰度矩阵（复用 focus 的降采样）+ cover 可见窗口。焦点 / 视口比例变化要重建：
     可见窗口随之一变，挡在卡片背后的壁纸区域也就变了。视频壁纸不做（取帧时机不稳），走兜底亮度 */
  useEffect(() => {
    if (customWall === null || customWall.type !== 'image' || vpRatio <= 0) {
      setToneGrid(null)
      return
    }
    let alive = true
    void buildToneGrid(customWall.data, vpRatio, settings.wallFocus.x, settings.wallFocus.y).then((g) => {
      if (alive) setToneGrid(g)
    })
    return () => { alive = false }
  }, [customWall, vpRatio, settings.wallFocus.x, settings.wallFocus.y])

  /* ---------- 时钟 & 整体缩放 ---------- */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    /* 舞台铺满窗口：设计像素 = 窗口/缩放；窗口小于设计尺寸时整体等比缩小（origin 左上，无居中偏移）。
       窗口尺寸还不可用（内嵌浏览器自由尺寸 / 首帧竞态）时沿用上一次的有效结果，
       绝不能让 s 落到 0——那会让 stage.w 变成 NaN、舞台锁死在 scale(0)（见 stageFitOf） */
    let last: StageFit | undefined
    const fit = () => {
      const f = stageFitOf(window.innerWidth, window.innerHeight, last)
      last = f
      const el = stageRef.current
      if (el) {
        el.style.width = `${f.w}px`
        el.style.height = `${f.h}px`
        el.style.transform = `scale(${f.s})`
      }
      stage.w = f.w
      stage.h = f.h
      stage.scale = f.s
      /* 舞台宽写进 CSS 变量：抽屉 / 弹窗的宽度上限要用它兜底（100% 指舞台宽，不是窗口宽） */
      document.documentElement.style.setProperty('--stage-w', `${stage.w}px`)
      /* 抽屉宽度：窄窗口下占满整个舞台（否则 440 设计像素缩到手机上只剩一条窄缝） */
      document.documentElement.style.setProperty('--dw-w', window.innerWidth < 720 ? '100%' : '440px')
      /* 舞台尺寸变了：缓存的屏幕 rect 作废（拖拽中每帧都要用它换算格坐标） */
      stageBoxRef.current = null
      /* 缩放 / 视口变了：壁纸取样点的换算比例跟着变（值与上次相同则不触发重渲染） */
      setFit((p) => (p.w === window.innerWidth && p.h === window.innerHeight && p.s === f.s
        ? p
        : { w: window.innerWidth, h: window.innerHeight, s: f.s }))
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
  /* 落位提示：新卡片的高亮动画播完即清标记，避免之后的重渲染再播一次 */
  useEffect(() => {
    if (flashId === null) return
    const t = setTimeout(() => useApp.setState({ flashId: null }), 2100)
    return () => clearTimeout(t)
  }, [flashId])
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
        /* 天气卡上的「允许定位」：重新请求定位权限并按真实坐标取天气 */
        case 'weather-locate': {
          void st.loadWeather(true)
          break
        }
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
        case 'eng-set': st.setEngine(v); st.showToast('该搜索引擎正在使用中'); break
        case 'eng-hide': st.toggleEngineHidden(v); break
        case 'search-go': runSearch('btn'); setHistoryOpen(false); break
        /* 历史条目等价于「填好词再回车」，按回车的方式打开 */
        case 'sp-pick': if (inputRef.current) inputRef.current.value = v; runSearch('enter'); setHistoryOpen(false); break
        case 'sp-del': useApp.setState({ history: st.history.filter((h) => h !== v) }); break
        /* 面板右上角「清除全部」：一次清空搜索历史（面板随之收起，输入框保留已输入内容） */
        case 'sp-clear': st.clearHistory(); setHistoryOpen(false); break
        case 'set-mode': st.setMode(v as 'minimal' | 'standard'); break
        case 'go-page': st.goPage(Number(v)); break
        /* 空白处右键菜单：打开添加面板 / 个性化 / 设置 */
        case 'drawer-open': st.setDrawer(v as DrawerKey); break
        /* 空页引导「添加组件」：直达个性化 → 组件库 */
        case 'open-library': st.setPersonalTab(2); st.setDrawer('personal'); break
        case 'ctx-blocked': st.showToast(v); st.openCtx(null); break
        /* 空白处右键「整理图标」：把当前页的图标类卡片依次前移补位（组件钉住不动） */
        case 'arrange': st.arrange(); st.openCtx(null); break
        case 'dock-app': {
          st.openCtx(null)
          if (v !== '') openByMode(st, v, 'link')
          else st.showToast('未配置网址，右键图标可补充链接')
          break
        }
        case 'dock-rename': case 'dock-url': case 'dock-remove': case 'dock-config':
          dockMenuAct(name, v)
          break
        case 'dock-act': st.setDrawer(({ add: 'add', personal: 'personal', setting: 'setting' } as const)[v] ?? 'setting'); break
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
        /* 卡片右键「移动到第 N 页」：右键的那张在多于一张的选择集里就搬整组（与拖拽同一口径），否则只搬它 */
        case 'move-to-page': {
          const to = Number(v)
          const ids = id !== '' && st.picked.includes(id) && st.picked.length > 1 ? st.picked : (id !== '' ? [id] : [])
          if (ids.length > 0) st.moveToPage(ids, to)
          break
        }
        /* 卡片点击：图标卡开站，其余类型打开该组件的详情视图（拖拽后的 click 已被 suppressItemClick 拦下） */
        case 'item-open': {
          if (suppressItemClick) { suppressItemClick = false; break }
          /* 不带修饰键的单击 = 打开并清空多选（桌面惯例：点一下结束这一轮选择） */
          st.setPicked([])
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
      const st = useApp.getState()
      const cardEl = (e.target as HTMLElement).closest?.('.item') as HTMLElement | null
      /* 修饰键单击卡片 = 多选（Ctrl/Cmd 切换、Shift 范围）：不打开卡片，也不进入拖拽 */
      if (cardEl !== null && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        const cid = cardEl.getAttribute('data-id')
        if (cid !== null) { pickCard(cid, e.shiftKey); return }
      }
      const t = (e.target as HTMLElement).closest?.('[data-act]') as HTMLElement | null
      if (t) { onAct(t.dataset['act'] ?? '', t.dataset['v'] ?? '', t); return }
      /* 点空白 / Dock / 面板：清空多选（卡片自己的点击在 item-open 里清） */
      if (cardEl === null) st.setPicked([])
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
      /* 三类目标各有菜单：卡片 / Dock 图标 / 空白处；输入框与浮层内部保留浏览器原生菜单（粘贴、复制） */
      const target = e.target as HTMLElement
      if (target.closest?.('input, textarea, .dw, .modal-mask, .search-panel, #enginePanel')) return
      const host = target.closest?.('.item')
      const dockHost = target.closest?.('.dock-apps .dock-item')
      const id = host?.getAttribute('data-id') ?? null
      const dockIdx = dockHost?.getAttribute('data-idx') ?? null
      const el = stageRef.current
      if (!el) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const s = r.width / stage.w
      const next: CtxState = {
        x: Math.min((e.clientX - r.left) / s, stage.w - 240),
        y: (e.clientY - r.top) / s,
        id,
        dock: dockIdx !== null ? Number(dockIdx) : null,
      }
      useApp.getState().openCtx(next)
    }
    /** 快捷键动作分发：返回 true 表示已处理（调用方负责 preventDefault） */
    const runShortcut = (id: string): boolean => {
      const st = useApp.getState()
      switch (id) {
        case 'focus-search': inputRef.current?.focus(); return true
        /* 拖拽中按方向键翻页：与滚轮同一处理——按最后指针位置重算落点，并撤掉边缘计时 */
        case 'page-prev':
          st.goPage(st.cur - 1)
          if (dragLive.current) { clearEdge(); applyDragPoint(lastPt.current.x, lastPt.current.y) }
          return true
        case 'page-next':
          st.goPage(st.cur + 1)
          if (dragLive.current) { clearEdge(); applyDragPoint(lastPt.current.x, lastPt.current.y) }
          return true
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
      /* 拖拽中按 Esc 先取消拖拽（优先于「关闭浮层」快捷键），卡片留在原位；
         并吃掉松手补的那次 click——否则「取消拖拽」会变成「打开卡片」（标记由下一次按下清零） */
      if (e.key === 'Escape' && dragLive.current) {
        suppressItemClick = true
        holdAbort.current = false
        clearEdge()
        setDrag(null)
        e.preventDefault()
        return
      }
      /* 取消拖拽之后再按 Esc：清空多选（两级语义：先收拖拽、再收选择） */
      if (e.key === 'Escape' && st.picked.length > 0) {
        st.setPicked([])
        e.preventDefault()
        return
      }
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
      /* 拖拽中翻页：按最后指针位置重算候选格（否则它还停在上一个页的坐标上）并撤掉边缘计时
         （用户自己翻的页，不该紧接着再被边缘计时翻一次） */
      if (dragLive.current) {
        clearEdge()
        applyDragPoint(lastPt.current.x, lastPt.current.y)
      }
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

  /* ---------- 拖拽换位（长按进入 + 指针 + 网格吸附） ---------- */
  useEffect(() => {
    if (!drag) return
    /* 长按到点才进入拖拽态（单击绝不会让卡片动起来）；到点前的位移容差判定见 shared/hold。
       已进入拖拽态就不再起计时器（每帧都会重跑本 effect，避免白留一堆定时器） */
    const armed = drag.moved ? null : setTimeout(() => {
      setDrag((d) => (d === null || d.moved ? d : { ...d, moved: true }))
      /* 触觉反馈：能震就震一下（Android Chrome 有效，桌面 / iOS Safari 静默且无副作用） */
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
    }, HOLD_MS)
    const move = (e: PointerEvent) => {
      /* 还没进入拖拽：只做长按判定——指针漂移超过容差就作废本次按下（既不拖、也不开卡片，见 up）。
         这里不读布局也不动卡片 */
      if (!drag.moved) {
        const verdict = holdVerdict(performance.now() - drag.t0, e.clientX - drag.scx, e.clientY - drag.scy)
        if (verdict === 'abort' && !holdAbort.current) {
          holdAbort.current = true
          hintHold()
        }
        return
      }
      /* 已进入拖拽：只登记坐标，计算与渲染合并到下一帧（见 queuePoint）；
         指针停在舞台边缘时，边缘翻页的计时也在那一帧里判 */
      queuePoint(e.clientX, e.clientY)
    }
    /* 松手收尾：进过拖拽态就落位；「想拖但没按住」作废的什么都不做；两种都要吃掉紧随其后的那次 click，
       只有纯点按（没按住、也没越线）放行——click 照常打开卡片 */
    const up = () => {
      /* 副作用必须留在事件处理器里：写进 setDrag 的 updater 会在渲染阶段执行，
         变成「渲染期间更新其它组件」（React 18 会直接报 Maximum update depth exceeded） */
      clearEdge()
      if (drag !== null && drag.moved) {
        const st = useApp.getState()
        const from = st.pages.findIndex((pg) => pg.some((x) => x.id === drag.id))
        if (from < 0) {
          /* 卡片在中途被删：什么都不做 */
        } else if (drag.ids.length === 1 && from === st.cur) {
          /* 单张 + 没换页：走页内落位（空位直接落 / 同尺寸互换 / 否则就近落位），提示在 store 里给 */
          st.drop(drag.id, drag.c, drag.r)
        } else {
          /* 多选整组、或指针已经翻到别的页：走跨页搬动（落位规则见 layout.crossPlan） */
          st.moveToPage(drag.ids, st.cur, { c: drag.c, r: drag.r })
        }
        /* 飞回落位（FLIP）：主卡从「松开那一瞬的指针位置」飞向它真正落下的格。
           先写成平移偏移，下一帧由 fly 的 effect 去掉，交给 .item 自带的 transform 过渡补齐 */
        const landed = allItems(useApp.getState().pages).find((x) => x.id === drag.id)
        if (landed !== undefined) {
          const inset = insetOf(landed.t)
          setFly({
            id: landed.id,
            dx: (drag.x - drag.offX) - (landed.c * CELL + inset),
            dy: (drag.y - drag.offY) - (landed.r * CELL + inset),
          })
        }
      }
      if (drag !== null && (drag.moved || holdAbort.current)) {
        suppressItemClick = true
        setTimeout(() => { suppressItemClick = false }, 80)
      }
      holdAbort.current = false
      /* 记下本次落位的卡片：它们下一帧在页内重新挂载，跳过入场动画（见 justDropped 注释） */
      justDropped.current = new Set(drag !== null && drag.moved ? drag.ids : [])
      setDrag(null)
    }
    /* 指针被浏览器接管（触摸被系统手势 / 滚动抢走、favicon 触发原生图片拖拽等）：本次手势中断，
       卡片回原位——不落位也不打开（pointercancel 之后不会有 click），下次重新长按 */
    const cancel = () => {
      clearEdge()
      holdAbort.current = false
      setDrag(null)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancel)
    return () => {
      if (armed !== null) clearTimeout(armed)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
    }
  }, [drag])

  /* 松手后那一帧去掉位偏移：transform 归零由 .item 自带的过渡补齐（这就是 FLIP 的第二步） */
  useEffect(() => {
    if (fly === null) return
    const id = window.requestAnimationFrame(() => setFly(null))
    return () => window.cancelAnimationFrame(id)
  }, [fly])

  /* 卸载时收掉还没跑完的帧 */
  useEffect(() => () => {
    if (rafId.current !== 0) window.cancelAnimationFrame(rafId.current)
  }, [])

  /* 卸载时清掉边缘翻页计时器：拖拽 effect 每帧都会重跑，把清理写在那里会把计时每帧清掉 */
  useEffect(() => () => {
    if (edgeTimer.current !== null) window.clearTimeout(edgeTimer.current)
  }, [])

  /* 拖拽中的组件对齐反馈：guides 决定是否渲染参考线，hitIds 是被命中的目标卡片（加一圈描边） */
  const guides = settings.showGuides && drag !== null && drag.moved
  const hitIds = new Set<string>(guides ? [...(drag.gx?.ids ?? []), ...(drag.gy?.ids ?? [])] : [])

  /* ---------- 拖拽浮层（跨页拖拽的关键） ----------
     拖拽中的卡片不能留在自己那一页：翻页是 #pager 的整体位移，留在页里的卡片会跟着滑出视口。
     所以把它们改画在舞台级浮层上（源页不渲染），几何统一用 GRID_LEFT / GRID_TOP + 设计坐标。 */
  const draggedIds = drag !== null && drag.moved ? drag.ids : []
  const draggedItems = draggedIds
    .map((id) => allItems(pages).find((x) => x.id === id))
    .filter((x): x is GridItem => x !== undefined)
  const primaryItem = draggedItems.find((x) => x.id === drag?.id) ?? draggedItems[0]
  const multi = draggedItems.length > 1
  /* 主卡所在页 ≠ 当前页 → 跨页拖拽（落点要用 crossPlan 算，页内那套候选格不认占用） */
  const fromPage = drag === null ? -1 : pages.findIndex((pg) => pg.some((x) => x.id === drag.id))
  const cross = drag !== null && drag.moved && fromPage >= 0 && fromPage !== cur
  /* 落点提示（虚线占位格）：与松手后的落位用**同一个函数**——跨页 / 多选走 crossPlan，
     页内单张就是拖拽态里的候选格。卡片改成自由跟手之后，「会落在哪」全靠它表达 */
  const spots: { id: string; c: number; r: number }[] = drag !== null && drag.moved
    ? (multi || cross
      ? crossPlan(pages, drag.ids, cur, multi ? undefined : { c: drag.c, r: drag.r }).placed
      : [{ id: drag.id, c: drag.c, r: drag.r }])
    : []
  /* 拖拽中的卡片位置：**自由跟手**（指针 − 抓取偏移），只有某一轴吸住对齐候选时那一轴才咬到候选格上
     （咬合由浮层卡的 transition 补，见 .drag-layer .item） */
  const ghostOf = (it: GridItem): { x: number; y: number } => {
    if (drag === null) return { x: 0, y: 0 }
    const freeX = GRID_LEFT + drag.x - drag.offX
    const freeY = GRID_TOP + drag.y - drag.offY
    return {
      x: drag.gx === null ? freeX : GRID_LEFT + drag.c * CELL + insetOf(it.t),
      y: drag.gy === null ? freeY : GRID_TOP + drag.r * CELL + insetOf(it.t),
    }
  }
  /* 正在吸附咬合：浮层卡改用弹簧过渡；自由跟手时必须 0 过渡，否则就是「拖影」而不是跟手 */
  const snapping = drag !== null && drag.moved && (drag.gx !== null || drag.gy !== null)
  /** 虚线占位格的位置：与卡片同一套 itemBox 公式，只是换算到舞台坐标 */
  const spotStyle = (it: GridItem): Record<string, string | number> => {
    const b = parseBox(itemBox(it))
    return {
      ...b,
      left: GRID_LEFT + Number.parseFloat(String(b['left'] ?? '0')),
      top: GRID_TOP + Number.parseFloat(String(b['top'] ?? '0')),
    }
  }

  /**
   * 自动对比：每张卡片背后那块壁纸的明暗 → 墨色 / 护罩 / 光晕（补丁 38）。
   *
   * 整表一次算完并缓存：**拖拽中 pages 不变**，所以表里的小对象引用稳定，GridCard 的 memo
   * 不会因为对比度而失效（这是它敢每张卡都算一遍的前提）。
   * 没有自定义壁纸时用皮肤底色当均匀背景——纯色底本来不需要护罩，只有墨色会按皮肤对比度选出来，
   * 结果与「跟随皮肤」一致（出厂壁纸因此看不出变化）。
   */
  const tokens = useMemo(() => skinTokensOf(skins, settings.skinId), [skins, settings.skinId])
  const ctMap = useMemo(() => {
    const map = new Map<string, CardTone>()
    if (!settings.autoContrast) return map
    const panel = tokens['--panel-text'] ?? '#ffffff'
    const panelLum = hexLum(panel) ?? 1
    const skinLight = panelLum > 0.35
    /* 两种候选墨色：与皮肤同族的用皮肤原色（保持品牌感），另一族用中性色（只在必要时才用上） */
    const lightHex = skinLight ? panel : '#f4f7ff'
    const darkHex = skinLight ? '#101623' : panel
    const lightLum = hexLum(lightHex) ?? 1
    const darkLum = hexLum(darkHex) ?? 0
    const flatTone = toneGrid === null ? (hexLum(tokens['--mask-color'] ?? '') ?? 0.5) : null
    for (const pg of pages) {
      for (const it of pg) {
        const b = parseBox(itemBox(it))
        const box = {
          x: Number.parseFloat(String(b['left'] ?? '0')),
          y: Number.parseFloat(String(b['top'] ?? '0')),
          w: Number.parseFloat(String(b['width'] ?? '0')),
          h: Number.parseFloat(String(b['height'] ?? '0')),
        }
        const tone = flatTone !== null
          ? { avg: flatTone, min: flatTone, max: flatTone }
          : toneAt(toneGrid as ToneGrid, boxUv(box, fit.s, fit.w, fit.h))
        const light = pickInk(tone.avg, lightLum, darkLum)
        const inkLum = light ? lightLum : darkLum
        /* 光晕看最坏值：浅墨怕背景太亮（取 max），深墨怕背景太暗（取 min） */
        const fix = fixForInk(tone.avg, light ? tone.max : tone.min, inkLum)
        /* 卡片文字不翻墨色（各小组件有自己的配色与语义），所以它的描边按皮肤墨色单独算 */
        const haloT = fixForInk(tone.avg, skinLight ? tone.max : tone.min, panelLum).halo
        map.set(it.id, {
          ink: light ? lightHex : darkHex,
          /* 护罩与光晕都取「与背景相反」的一侧：亮壁纸压深、暗壁纸提亮。
             这对**翻不了色的图标**同样有效——品牌图标（SiteIcon 用自己的品牌色）与 favicon 图片
             不吃 --ct-ink，但外圈这层光晕能把它们从同色壁纸里分出来 */
          anti: tone.avg > 0.5 ? '0,0,0' : '255,255,255',
          scrim: fix.scrim,
          halo: fix.halo,
          haloT,
        })
      }
    }
    return map
  }, [pages, settings.autoContrast, tokens, toneGrid, fit])

  return (
    <>
      {/* 全窗口壁纸层（固定定位，缩放白边不可见）+ 遮罩 */}
      <div className="wall-layer">
        {customWall !== null && customWall.type === 'image' && (
          /* object-fit:cover 负责等比填满不留黑边；object-position 由焦点算法给出，避免主体被居中裁掉。
             解码完成（onLoad）后撤掉 <html> 上的首帧占位图：两张图在视觉上几乎一致，交接看不出来 */
          <img className="wall-img" src={customWall.data} alt=""
            style={{ objectPosition: `${Math.round(settings.wallFocus.x)}% ${Math.round(settings.wallFocus.y)}%` }}
            onLoad={clearBootLqip} />
        )}
        {customWall !== null && customWall.type === 'video' && (
          <video className="wall-video" src={customWall.data} autoPlay loop muted playsInline
            onLoadedData={clearBootLqip} />
        )}
      </div>
      <div className="wall-mask" />

      <div id="stage" ref={stageRef} data-mode={settings.mode}
        data-hidetop={settings.hideTop ? '1' : '0'} data-hidesearch={settings.hideSearch ? '1' : '0'}
        /* 拖拽中：供 CSS 关掉底层卡片的 hover 动效（横扫一排图标时它们不该逐张上浮 / 放大） */
        data-drag={drag !== null && drag.moved ? '1' : '0'}
        style={{ ['--search-top' as string]: `${settings.searchTop}px`, ['--search-font' as string]: `${settings.searchFontSize}px` }}>

      {/* 网格对齐线：铺满整个舞台（图案与卡片网格对齐，见 .grid-lines 的背景偏移），
          在壁纸之上、卡片与控件之下，且不拦截指针。完全由设置开关决定，拖拽中也不强制显示 */}
      {settings.gridLines && <div className="grid-lines" />}

      {/* 翻页画布：拖拽中翻页提速（跨页拖拽时 0.42s 的滑动会明显拖慢节奏，见 prototype.css） */}
      <div id="pager" data-drag={drag !== null && drag.moved ? '1' : '0'}
        style={{ transform: `translateX(-${cur * PAGE_W}px)` }}>
        {pages.map((pg, i) => (
          <div className="page" key={i} style={{ left: i * PAGE_W }}>
            {/* 对齐参考线（当前页 · 拖拽中且真的吸住组件时）：贯穿整页；网格原点 → 页面坐标要加偏移 */}
            {i === cur && drag !== null && guides && drag.gx !== null && (
              <div className="align-guide v" style={{ left: GRID_LEFT + drag.gx.pos }} />
            )}
            {i === cur && drag !== null && guides && drag.gy !== null && (
              <div className="align-guide h" style={{ top: GRID_TOP + drag.gy.pos }} />
            )}
            <div className="grid">
              {pg.map((it, idx) => (
                /* 拖拽中的卡片不在这里渲染：改由舞台级浮层画（见下面的 drag-layer），
                   否则跨页翻页时它会跟着 #pager 一起滑出去 */
                draggedIds.includes(it.id) ? null : (
                  <GridCard key={it.id} item={it} idx={idx} now={now} weather={weather}
                    flash={it.id === flashId}
                    dragging={false}
                    picked={picked.includes(it.id)}
                    settle={justDropped.current.has(it.id)}
                    snap={false}
                    flyDx={fly !== null && fly.id === it.id ? fly.dx : 0}
                    flyDy={fly !== null && fly.id === it.id ? fly.dy : 0}
                    alignHit={hitIds.has(it.id)}
                    ct={ctMap.get(it.id)}
                    onDragStart={onItemDown} />
                )
              ))}
              {pg.length === 0 && (
                <div className="grid-hint">
                  <div className="gh-title">从这里开始</div>
                  <div className="gh-sub">添加一个网站，或者放一个小组件</div>
                  <div className="gh-acts">
                    <button className="btn sm" data-act="drawer-open" data-v="add">添加网站</button>
                    <button className="btn sm ghost" data-act="open-library">添加组件</button>
                    <button className="btn sm ghost" data-act="drawer-open" data-v="personal">换壁纸</button>
                  </div>
                  <div className="gh-tip">也可以右键空白处，或按 Alt+A 打开添加面板</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 拖拽浮层：拖拽中的卡片画在这里（舞台坐标，源页不渲染它们）。
          卡片**自由跟手**（吸附命中时那一轴咬到候选格上），「会落在哪」由虚线占位格表达
          （与松手后的落位同一个函数）；多选再加一枚数量角标 */}
      {drag !== null && drag.moved && (
        <div className="drag-layer">
          {spots.map((s) => {
            const it = draggedItems.find((x) => x.id === s.id)
            return it === undefined ? null : (
              <div className="drag-slot" key={`spot-${s.id}`} style={spotStyle({ ...it, c: s.c, r: s.r })} />
            )
          })}
          {primaryItem !== undefined && (
            <GridCard key={`ghost-${primaryItem.id}`} item={primaryItem} idx={0} now={now} weather={weather}
              flash={false} alignHit={false} picked={false} settle={false} flyDx={0} flyDy={0}
              dragging snap={snapping} ghost={ghostOf(primaryItem)} ct={ctMap.get(primaryItem.id)}
              onDragStart={noop} />
          )}
          {drag !== null && (multi || (cross && spots.length === 0)) && (
            <div className="drag-count" style={{ left: GRID_LEFT + drag.x + 16, top: GRID_TOP + drag.y + 12 }}>
              {multi
                ? (spots.length === draggedItems.length ? `${draggedItems.length} 个` : `${spots.length}/${draggedItems.length} 个`)
                : '这一页放不下'}
            </div>
          )}
        </div>
      )}

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
          <div className="sp-head">
            <span>搜索历史</span>
            <span className="sp-clear" data-act="sp-clear">清除全部</span>
          </div>
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
        <div className="dock" style={{
          '--dock-item-w': `${dockM.item}px`,
          '--dock-item-h': `${dockM.item - 4}px`,
          '--dock-box': `${dockM.box}px`,
          '--dock-fn': `${dockM.fn}px`,
        } as CSSProperties}>
          <div className="dock-bar">
            <div className="dock-apps">
              {dockApps.map((app, i) => (
                /* 名称与域名挂成提示数据（悬停气泡，见 app/tip.tsx）；不再用原生 title，避免双重气泡 */
                <div className="dock-item" key={`dock-${i}`} data-act="dock-app" data-v={app.url} data-idx={String(i)}
                  data-tip={app.name} data-tip-host={hostOf(app.url)} aria-label={app.name}>
                  <div className={`dock-icon${settings.dockIcon === 'circle' ? ' circle' : ''}`}>
                    <SiteIcon url={app.url} name={app.name} cls="dock-favicon" fs={dockM.fs} size={dockM.ico} />
                  </div>
                </div>
              ))}
            </div>
            {dockApps.length > 0 && <div className="dock-sep" />}
            <div className="dock-actions">
              {DOCK_ACTIONS.map(([act, label, icon]) => (
                <div className="dock-item" key={act} data-act="dock-act" data-v={act} data-tip={label} aria-label={label}>
                  <div className="dock-icon dock-fn">{icon()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ContextMenu />
      <IconTip />
      <Drawer />
      <Modal />
      <DialogHost />
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
    </>
  )
}

/** 单张卡片：外框（点击开站 / 拖拽换位）+ 内容 + 名称标签 + 悬浮操作。
 *  **memo 包裹**：拖拽时每帧都会重渲染 App，靠它把 40+ 张卡的子树（含各自的小组件）挡在外面——
 *  拖拽中真正重渲染的只剩浮层那一张。前提是 prop 都是稳定引用：`onDragStart` 全页共用一个，
 *  `ghost` 每帧都新（所以只给浮层卡），其余都是布尔 / 数字 / store 里的稳定引用 */
const GridCard = memo(function GridCard({ item, idx, now, weather, flash, dragging, picked, settle, ghost, snap, flyDx, flyDy, alignHit, ct, onDragStart }: {
  item: GridItem
  /** 页内序号（入场动画渐次延迟用） */
  idx: number
  now: Date
  weather: WeatherData | null
  /** 刚落位：播一次高亮提示，让用户看清新图标落在哪 */
  flash: boolean
  /** 正在被拖动：走「拿起来」样式（prototype.css .item.dragging），并跳过入场 / 落位动画 */
  dragging: boolean
  /** 被多选选中：加一圈强调色描边（见 prototype.css .item.picked） */
  picked: boolean
  /** 刚拖完落位：跳过入场动画（拖拽中卡片在浮层里，页内这张是重新挂载的新节点，会重播 item-in） */
  settle: boolean
  /** 浮层里的定位（设计坐标，相对 #stage）：拖拽浮层用它画卡片；不给就按 itemBox 渲染 */
  ghost?: { x: number; y: number } | undefined
  /** 吸附咬合中：浮层卡的位移改用弹簧过渡（自由跟手时必须 0 过渡，否则是「拖影」不是跟手） */
  snap: boolean
  /** 松手后的飞回落位偏移（设计像素，FLIP 第一步）：下一帧归零，由 .item 自带的过渡补齐 */
  flyDx: number
  flyDy: number
  /** 被当前拖拽的对齐命中：加一圈描边，提示「和它对齐了」 */
  alignHit: boolean
  /** 自动对比配置（补丁 38）：墨色 + 护罩 / 光晕；关掉自动对比或拿不到壁纸明暗时为 undefined */
  ct?: CardTone | undefined
  onDragStart: (e: ReactPointerEvent) => void
}) {
  const c = cfg(item)
  const iconNames = useApp((s) => s.settings.iconNames)
  /* 图标卡 / 图标文件夹卡：名称与域名挂成提示数据（悬停气泡读它，见 app/tip.tsx）；
     字形相似或重复时靠它辨认——名称留空则退回域名 */
  const label = str(c['label']).trim()
  const tipCard = item.t === 'icon' || item.t === 'folder'
  const host = tipCard && str(c['url']) !== '' ? hostOf(str(c['url'])) : ''
  const name = tipCard ? (label !== '' ? label : host) : ''
  /* 「图标显示名称」开启时常显（见 prototype.css .item-note）；容器格子与 Dock 仍只靠悬停 */
  const note = iconNames && item.t === 'icon' ? name : ''
  /* 通用配置：卡片透明度（config.opacity 为数字时覆盖全局 --ga-card，未设置则跟随全局） */
  const ov = c['opacity']
  const cardVars = typeof ov === 'number' ? { ['--ga-card' as string]: (1 - GLASS_ALPHA_FACTOR * ov).toFixed(3) } : {}
  /* 自动对比算出来的四个变量（见 prototype.css 的去卡片化一节：墨色 / 反向色 / 护罩 / 光晕） */
  const ctVars = ct === undefined ? {} : {
    ['--ct-ink' as string]: ct.ink,
    ['--ct-anti' as string]: ct.anti,
    ['--ct-scrim' as string]: String(ct.scrim),
    ['--ct-halo' as string]: String(ct.halo),
    ['--ct-halo-t' as string]: String(ct.haloT),
  }
  /* 尺寸自适应 + 实例样式：--nw/--nh 是组件的自然尺寸，CSS 里
     --u = max(1px, min(100cqw/--nw, 100cqh/--nh)) × 字号缩放 即「1 设计像素」；
     自然尺寸下 --u = 1px（渲染与设计稿一致），更大的卡片等比放大，更小的卡片不缩小 */
  const nat = naturalBoxOf(item.t)
  const sizeVars = {
    ['--nw' as string]: String(nat.w),
    ['--nh' as string]: String(nat.h),
    ...styleVarsOf(c),
  }
  const draggingStyle = dragging
  const flying = flyDx !== 0 || flyDy !== 0
  /* 浮层卡（拖拽中）：**用 transform 定位，不写 left/top**——left/top 每帧都会触发布局，
     transform 只走合成；「拿起来」的 scale 也一起写进 transform（行内 transform 会盖掉 CSS 里的那条）。
     位移在吸附咬合时才开弹簧过渡，自由跟手时必须是 0 过渡（否则卡片会拖着走，不是跟手）。
     页内卡：按 itemBox 落在自己的格上；刚飞回落位那一帧带 FLIP 偏移（下一帧归零，过渡自己补上）；
     settle（刚拖完落位）与浮层卡都要关掉入场动画：前者是新挂载的节点（会重播 item-in 而先消失再淡入） */
  const ghostStyle = ghost === undefined ? null : {
    left: 0,
    top: 0,
    zIndex: 20,
    animation: 'none',
    willChange: 'transform',
    transform: `translate3d(${ghost.x.toFixed(1)}px, ${ghost.y.toFixed(1)}px, 0) scale(1.06)`,
    transition: snap ? 'transform .12s var(--ease-spring)' : 'none',
  }
  const style = ghostStyle ?? (flying
    ? { transform: `translate3d(${flyDx.toFixed(1)}px, ${flyDy.toFixed(1)}px, 0)`, zIndex: 6, animation: 'none' }
    : settle
      ? { animation: 'none' }
      : { animationDelay: `${Math.min(idx * 22, 440)}ms` })
  return (
    <>
      <div className={`item${draggingStyle ? ' dragging' : ''}${flash && !draggingStyle ? ' just-placed' : ''}${alignHit && !draggingStyle ? ' align-hit' : ''}${picked ? ' picked' : ''}${note !== '' ? ' named' : ''}`} style={{ ...parseBox(itemBox(item)), ...cardVars, ...ctVars, ...sizeVars, ...style }}
        data-id={item.id} data-t={item.t} data-act="item-open"
        {...(name === '' ? {} : { 'data-tip': name, 'aria-label': name, ...(host === '' ? {} : { 'data-tip-host': host }) })}
        onPointerDown={onDragStart}>
        <WidgetView item={item} now={now} weather={weather} />
        {/* 名称不再作为固定标签渲染（其余组件仍不显示组件名）；仅图标卡在开启「图标显示名称」时
            于字形下方常显站点名，其余情况靠悬停气泡（app/tip.tsx）辨认 */}
        {note !== '' && <div className="item-note">{note}</div>}
        <div className="item-acts">
          <div className="ia" data-act="item-edit" title="编辑">{Icon.edit()}</div>
          <div className="ia" data-act="item-del" title="删除">{Icon.trash()}</div>
        </div>
      </div>
    </>
  )
})

/** "left:1px;top:2px" → React 内联样式对象 */
const parseBox = (css: string): Record<string, string | number> => {
  const out: Record<string, string | number> = {}
  css.split(';').forEach((kv) => {
    const [k, v] = kv.split(':')
    if (k && v) out[k.trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = v.trim()
  })
  return out
}
