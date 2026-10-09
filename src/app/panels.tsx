/**
 * 抽屉与弹窗（添加 / 个性化 / 设置 + 欢迎 / 引擎 / 编辑卡片 / 备份 / 恢复 / 重置 …）
 * 结构与文案按 docs/v4/02-UI规格.md §8、§6.1、§6.3、§7 与原型冻结内容落地。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp, type DrawerKey } from './store'
import { WALL_SOURCE_TEMPLATES, WALL_SOURCE_UNAVAILABLE, fetchCategories, fetchWallPage, sourceSearchable, type WallCategory, type WallPage, type WallPhoto } from '../core/wallsource'
import { findWallpaperBySource, listWallpapers, storeRemoteWallpaper } from '../core/wallpaper'
import { fetchDataUrl } from '../core/fetch-proxy'
import type { WallpaperSource } from '../shared/types'
import { WIDGET_LIST, WIDGET_DEFS } from '../shared/widget-defs'
import { SIZES } from '../shared/grid'
import { SKIN_FIELDS } from '../shared/defaults'
import { BLUR_MAX_PX, WALLPAPER_HISTORY_LIMIT } from '../shared/constants'
import { Icon } from './icons'
import { SiteIcon } from './widgets'
import { siteUrlOf } from './brands'
import { downloadJson, buildLayoutDoc, restoreSnapshot } from '../core/export'
import { uploadWallpaper, getWallpaper, type BgData } from '../core/wallpaper'
import { readBookmarkTree, collectBookmarks } from '../core/bookmark-importer'
import { resetAllData } from '../core/reset'
import { saveDoc } from '../core/storage'
import { getCloudConfig, setCloudConfig, type CloudConfig } from '../core/cloud'
import type { BlurKey, GlassKey, GridItem, WidgetField, WidgetKind } from '../shared/types'

const DRAWERS: Record<DrawerKey, readonly [string, string]> = {
  add: ['添加', '在这里添加你喜爱的网站图标和小组件'],
  personal: ['个性化', ''],
  /* 设置面板自带分区页签，头部不再重复一句话说明（与个性化同款单行头部） */
  setting: ['设置', ''],
}

const Hint = ({ children }: { children: React.ReactNode }) => <div className="hint-text">{children}</div>

/** 抽屉内的分区导航页签：个性化与设置共用同一套导航语言（等宽密排、单行不折行、选中态为实底胶囊） */
const DrawerTabs = ({ tabs, value, onChange }: { tabs: readonly string[]; value: number; onChange: (i: number) => void }) => (
  <div className="dw-tabs">
    {tabs.map((label, i) => (
      <div key={label} className={`dw-tab${i === value ? ' active' : ''}`} onClick={() => onChange(i)}>{label}</div>
    ))}
  </div>
)

const SwitchRow = ({ l, d, on, onToggle }: { l: string; d?: string; on: boolean; onToggle: () => void }) => (
  <div className="switch-row">
    <div><span>{l}</span>{d ? <span className="sr-desc">{d}</span> : null}</div>
    <div className={`switch${on ? ' on' : ''}`} onClick={onToggle}><i /></div>
  </div>
)

/** 名称右侧的说明 ⓘ：悬停 200ms 或点击展开，气泡 220px，逼近容器右缘时自动向左翻转 */
const InfoDot = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  const box = useRef<HTMLSpanElement | null>(null)
  const pop = useRef<HTMLSpanElement | null>(null)
  const timer = useRef(0)
  const clear = (): void => {
    if (timer.current !== 0) { window.clearTimeout(timer.current); timer.current = 0 }
  }
  useEffect(() => clear, [])
  /* 展开后量一次：气泡右缘越过面板右缘则翻到左侧 */
  useLayoutEffect(() => {
    if (!open) return
    const ico = box.current
    const tip = pop.current
    if (ico === null || tip === null) return
    const host = ico.closest('.dw-body') ?? document.body
    setFlip(ico.getBoundingClientRect().left + tip.offsetWidth > host.getBoundingClientRect().right - 8)
  }, [open])
  return (
    <span className={`sl-info${open ? ' on' : ''}`} ref={box} tabIndex={0} aria-label="说明"
      onMouseEnter={() => { clear(); timer.current = window.setTimeout(() => setOpen(true), 200) }}
      onMouseLeave={() => { clear(); setOpen(false) }}
      onFocus={() => { clear(); setOpen(true) }}
      onBlur={() => setOpen(false)}
      onClick={() => { clear(); setOpen((v) => !v) }}>
      {Icon.info()}
      <span className={`sl-info-pop${flip ? ' flip' : ''}`} ref={pop}>{text}</span>
    </span>
  )
}

const SliderRow = ({ l, info, min, max, value, display, onInput }: {
  l: string; info?: string; min: number; max: number; value: number; display: string; onInput: (v: number) => void
}) => (
  <div className="slider-row">
    <div className="sl-head">
      <span className="sl-label">{l}{info !== undefined && <InfoDot text={info} />}</span>
      <span>{display}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onInput(Number(e.target.value))} />
  </div>
)

/* ---------- 网址导航数据（原创分类命名，04 §6 等价实现） ---------- */
const NAVI: readonly { c: string; l: readonly string[] }[] = [
  { c: '常用', l: ['百度', '哔哩哔哩', '知乎', '微博', '淘宝', '京东', 'GitHub', 'Gmail'] },
  { c: '影音', l: ['爱奇艺', '腾讯视频', '网易云音乐', 'YouTube'] },
  { c: '游戏', l: ['Steam', 'TapTap'] },
  { c: '社交', l: ['微信', '知乎'] },
  { c: '学习', l: ['学习通', '网易公开课', '语雀', 'Notion'] },
  { c: '购物', l: ['京东', '天猫', '拼多多', '唯品会', '苏宁易购'] },
  { c: '工具', l: ['翻译', '计算器', '截图', '二维码'] },
  { c: 'AI', l: ['豆包', 'Kimi', '秘塔AI搜索', '通义千问'] },
]

/* ============================== 添加 ============================== */

const AddPanel = () => {
  const place = useApp((s) => s.place)
  const placeMany = useApp((s) => s.placeMany)
  const settings = useApp((s) => s.settings)
  const setSetting = useApp((s) => s.setSetting)
  const showToast = useApp((s) => s.showToast)
  const [tab, setTab] = useState(0)
  const [kw, setKw] = useState('')
  const [cat, setCat] = useState(0)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState('')
  const [toDock, setToDock] = useState(true)
  const [folderName, setFolderName] = useState('')
  const iconFile = useRef<HTMLInputElement | null>(null)
  const ws = WIDGET_LIST.filter((w) => !kw || w.n.includes(kw) || w.s.includes(kw))

  /** 加进 Dock 快捷方式（去重，最多 8 个；手动新增入口） */
  const addToDock = (label: string, link: string): void => {
    const apps = settings.dockApps
    if (apps.some((a) => a.url === link)) return
    if (apps.length >= settings.dockCount) { showToast(`Dock 最多 ${settings.dockCount} 个快捷方式，请先移除一些`); return }
    setSetting('dockApps', [...apps, { name: label, url: link }])
  }

  const addCustom = (): void => {
    const label = name.trim() || '未命名'
    if (url.trim() !== '' && toDock) addToDock(label, url.trim())
    if (folderName.trim() !== '') {
      // 02 §8：自定义网站可选创建图标格容器
      place('group', { label: folderName.trim(), cols: 2, apps: [label] })
    } else {
      place('icon', { label, url, ...(icon !== '' ? { icon } : {}) })
    }
    setName(''); setUrl(''); setIcon(''); setFolderName('')
  }

  const pickIcon = (f: File | undefined): void => {
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => { setIcon(String(rd.result ?? '')); showToast('图标已就绪') }
    rd.readAsDataURL(f)
  }

  return (
    <>
      <div className="f-row"><input className="f-input" placeholder="本地搜索：输入网站和小组件描述" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
      <div className="sub-tabs">
        {['小组件', '网址导航', '自定义'].map((t, i) => (
          <div key={t} className={`sub-tab${i === tab ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</div>
        ))}
      </div>
      {tab === 0 && (
        <>
          <Hint>清单由小组件定义表驱动；「添加」会放到当前页空白位置，当前页满了自动新建一页（每种模式最多 5 页）</Hint>
          {ws.map((w) => (
            <div className="eng-row" key={w.n + w.t}>
              <div className="er-ico" style={{ background: w.c }}>{w.g}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{w.n}</div>
                <div className="sr-desc" style={{ color: 'var(--panel-sub)', fontSize: 11 }}>{w.s}</div>
              </div>
              <button className="btn sm" onClick={() => place(w.t as WidgetKind)}>添加</button>
            </div>
          ))}
          {ws.length === 0 && <div className="empty-box">{Icon.search()}<div>暂无结果</div></div>}
        </>
      )}
      {tab === 1 && (
        <>
          <div className="cats">
            {NAVI.map((c, i) => (
              <div key={c.c} className={`cat${i === cat ? ' active' : ''}`} onClick={() => setCat(i)}>{c.c}</div>
            ))}
          </div>
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => {
              const list = (NAVI[cat]?.l ?? []).slice(0, 6).map((n) => ({ label: n, url: '' }))
              const n = placeMany(list)
              showToast(`已处理待添加列表，添加 ${n} 个`)
            }}>批量添加</button>
          </div>
          <div className="nv-grid">
            {(NAVI[cat]?.l ?? []).map((n) => (
              <div className="nv-item" key={n} onClick={() => place('icon', { label: n })}>
                <SiteIcon url={siteUrlOf(n) ?? ''} name={n} cls="nv-ico" fs={15} size={40} />
                <div className="nv-name">{n}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 2 && (
        <>
          <div className="f-row"><label className="f-label">网站名称</label>
            <input className="f-input" placeholder="请输入网站名称" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="f-row"><label className="f-label">网站链接</label>
            <input className="f-input" placeholder="请输入网站链接地址" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <SwitchRow l="同时添加到底部 Dock" d="Dock 快捷方式显示站点图标，右键可改名 / 改网址 / 移除" on={toDock} onToggle={() => setToDock(!toDock)} />
          <div className="f-row"><label className="f-label">图标</label>
            <div className="btn-row">
              <button className="btn sm ghost" onClick={() => iconFile.current?.click()}>上传自定义图标</button>
              {icon !== '' && <span className="tb-tag">已上传</span>}
            </div>
            <input ref={iconFile} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { pickIcon(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="f-row"><label className="f-label">添加到文件夹（可选，创建图标格容器）</label>
            <input className="f-input" placeholder="请输入文件夹名称" value={folderName} onChange={(e) => setFolderName(e.target.value)} /></div>
          <Hint>支持拖拽调整位置与尺寸；确认后会放到当前页的空白位置。</Hint>
          <div className="btn-row end" style={{ marginTop: 14 }}>
            <button className="btn" onClick={addCustom}>确认添加</button>
          </div>
        </>
      )}
    </>
  )
}

/* ============================== 个性化 ============================== */

/** 分组卡片：0.5px 描边容器，把标题与其设置项圈在同一视觉边界内；danger 用于覆盖 / 删除类操作的分组（红色标识） */
const SecCard = ({ t, info, danger = false, children }: {
  t: string; info?: string; danger?: boolean; children: React.ReactNode
}) => (
  <section className={`sec-card${danger ? ' danger' : ''}`}>
    <div className="sec-title">
      {t}
      {info !== undefined && <InfoDot text={info} />}
    </div>
    {children}
  </section>
)

/** 统一颜色控件：标签 + 24px 圆形色点（内置取色器）+ 十六进制值文本
 *  compact：密排模式（风格编辑器 12 项 4 列 × 3 行）——行内只留「名称 + 色点」，
 *  十六进制折叠进取色浮层（点色点即打开的原生取色器），需要时看色点悬停提示 */
const ColorField = ({ label, value, auto, onAuto, onChange, compact = false }: {
  label: string; value: string; auto?: string; onAuto?: () => void; onChange: (hex: string) => void; compact?: boolean
}) => (
  <div className={`color-field${compact ? ' compact' : ''}`}>
    <span className="cf-label">{label}</span>
    <label className="cf-dot" title={`${label} · ${(value === '' && auto !== undefined ? auto : value).toUpperCase()}`}
      style={{ background: auto !== undefined && value === '' ? 'linear-gradient(135deg,#fff 50%,#94a3b8 50%)' : value }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
    {compact ? null : (
      <>
        <span className="cf-hex">{value === '' && auto !== undefined ? auto : value.toUpperCase()}</span>
        {onAuto !== undefined && value !== '' && <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={onAuto}>跟随风格</button>}
      </>
    )}
  </div>
)

/** 皮肤迷你预览：按令牌等比例渲染 搜索条 + 双卡片 + Dock 条（浅色主题靠 0.5px 描边显形，深浅色自适应） */
const MiniSkinPreview = ({ tokens }: { tokens: Record<string, string> }) => (
  <div className="theme-thumb" style={{ background: tokens['--mask-color'] }}>
    <i className="tp-search" style={{ background: tokens['--card-bg'] }} />
    <i className="tp-card" style={{ background: tokens['--card-bg'] }} />
    <i className="tp-card tp-card2" style={{ background: tokens['--card-bg'] }} />
    <i className="tp-dock" style={{ background: tokens['--card-bg'] }} />
  </div>
)

/* ---------- 行尾溢出菜单与来源页签（添加 / 切换唯一入口） ---------- */

interface MenuItem {
  label: string;
  onClick?: () => void;
}

/** 点击展开的下拉菜单：点外部、按 Esc 或选中后关闭；trigger 由调用方给定 */
const OverflowMenu = ({ trigger, items, align = 'right' }: {
  trigger: () => React.ReactNode; items: readonly MenuItem[]; align?: 'left' | 'right'
}) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      if (box.current !== null && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className={`ov-wrap ov-${align}`} ref={box}>
      <div onClick={() => setOpen((v) => !v)}>{trigger()}</div>
      {open && (
        <div className="ov-menu">
          {items.map((it) => (
            <div key={it.label} className={`ov-item${it.onClick === undefined ? ' dis' : ''}`}
              onClick={() => {
                if (it.onClick === undefined) return
                setOpen(false)
                it.onClick()
              }}>{it.label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 字节数转可读体积（dataURL 长度 ×0.75 还原为原始字节，与写入侧上限算法一致） */
const readableSize = (dataUrl: string): string => {
  const mb = (dataUrl.length * 0.75) / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round((dataUrl.length * 0.75) / 1024))} KB`
}

/* ---------- 外部壁纸浏览（来源切换 + 分类 + 分页 + 一键设为壁纸） ---------- */

/** 拉取来源分类清单（061129 需在线解析数据目录，其余为静态结构） */
const useWallCategories = (src: WallpaperSource | undefined): { cats: WallCategory[]; state: 'loading' | 'ok' | 'error' } => {
  const [cats, setCats] = useState<WallCategory[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => {
    if (!src || WALL_SOURCE_UNAVAILABLE[src.kind] !== undefined) return
    let alive = true
    setState('loading')
    fetchCategories(src)
      .then((list) => { if (alive) { setCats(list); setState('ok') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [src?.id, src?.apiBase])
  return { cats, state }
}

/** 拉取一页外部壁纸（源 / 分类 / 页码变化时刷新） */
const useWallPage = (src: WallpaperSource | undefined, cat: string, page: number, query: string): { data: WallPage | null; state: 'loading' | 'ok' | 'error' } => {
  const [data, setData] = useState<WallPage | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => {
    if (!src || WALL_SOURCE_UNAVAILABLE[src.kind] !== undefined) return
    let alive = true
    setState('loading')
    fetchWallPage(src, cat, page, query)
      .then((res) => { if (alive) { setData(res); setState('ok') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [src, cat, page, query])
  return { data, state }
}

/* ---------- 在线壁纸应用反馈（阶段进度 + 循环等待） ---------- */

/** 应用壁纸的三个阶段：下载 → 处理 → 应用；short 为步骤条上的短名 */
const WALL_STAGES = [
  { short: '下载', n: '正在下载壁纸' },
  { short: '处理', n: '正在处理图片' },
  { short: '应用', n: '即将应用' },
] as const

/** 进行中的应用任务；total = 0 表示总量不可知（SW 代理拿不到 Content-Length），进度条转循环扫光 */
interface ApplyTask {
  name: string
  thumb: string
  stage: number
  loaded: number
  total: number
  /** 命中本地已有记录：整段下载被跳过 */
  reused: boolean
}

/** 浮层最短停留（ms）：太快完成时一闪而过反而像没响应 */
const FEEDBACK_MIN_MS = 420
/** 「即将应用」阶段的额外停留，保证该阶段文案可读 */
const APPLY_STAGE_HOLD_MS = 280

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 字节数 → 人类可读（下载进度用） */
const byteText = (b: number): string =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** 各阶段「正在做什么、为什么还没有结果」的解释文案 */
const stageDetail = (t: ApplyTask, srcName: string, pct: number | null): string => {
  if (t.reused) return '本地已有同一张，直接复用记录应用，无需重新下载'
  if (t.stage === 0) {
    const from = `正在从「${srcName}」获取原图`
    return pct === null
      ? `${from} · 该来源未返回文件体积，进度以循环动画表示`
      : `${from} · 已接收 ${byteText(t.loaded)} / ${byteText(t.total)}`
  }
  if (t.stage === 1) return '正在校验体积并写入本地存储（上限 20MB），此时主页还没有变化'
  return '正在写入设置，主页正在渲染新背景'
}

/**
 * 应用任务浮层：盖住壁纸网格区（不占布局高度），顶部进度条 + 被点击壁纸的缩略图与阶段文案 +
 * 循环等待环 + 三段步骤条。进度确定时按字节百分比推进，总量不可知时退化为 indeterminate 扫光。
 * 底色比常规玻璃更实一档，保证下面的缩略图不会透出来干扰阅读。
 */
const WallTaskOverlay = ({ t, srcName }: { t: ApplyTask; srcName: string }) => {
  const pct = t.total > 0 ? Math.min(100, Math.round((t.loaded / t.total) * 100)) : null
  const cur = WALL_STAGES[t.stage] ?? WALL_STAGES[0]
  return (
    <div className="wl-task" role="status" aria-live="polite">
      <div className={`wl-bar${pct === null ? ' indet' : ''}`}>{pct !== null && <i style={{ width: `${pct}%` }} />}</div>
      <div className="wl-head">
        {t.thumb !== '' && <img className="wl-thumb" src={t.thumb} alt="" />}
        <div className="wl-txt">
          <div className="wl-t1">{cur.n} · {t.name}</div>
          <div className="wl-t2">{stageDetail(t, srcName, pct)}{pct !== null && t.stage === 0 ? `（${pct}%）` : ''}</div>
        </div>
      </div>
      <div className="wl-foot">
        <span className="wl-ring" />
        <div className="wl-steps">
          {WALL_STAGES.map((s, i) => (
            <span key={s.short} className={`wl-step${i < t.stage ? ' done' : i === t.stage ? ' now' : ''}`}>
              {i < t.stage ? Icon.check() : <i className="wl-dot" />}{s.short}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 壁纸网格 + 分页（缩略图 <img> 直连加载；点击原图下载落地后应用） */
const WallPhotos = ({ data, state, page, onPage, onApply }: {
  data: WallPage | null; state: 'loading' | 'ok' | 'error'; page: number
  onPage: (p: number) => void; onApply: (p: WallPhoto) => void
}) => (
  <>
    <div className="wall-grid">
      {state === 'loading' && <div className="empty-box" style={{ gridColumn: '1 / -1' }}>加载中…</div>}
      {state === 'error' && <div className="empty-box" style={{ gridColumn: '1 / -1' }}>获取失败：来源地址不可达，或当前环境直连受跨域限制（扩展环境会自动经后台代理）</div>}
      {(state === 'ok' ? (data?.photos ?? []) : []).map((p) => (
        <div key={p.id} className="wall-thumb" title={p.title || p.author} onClick={() => onApply(p)}>
          <img src={p.thumb} alt={p.id} loading="lazy" />
        </div>
      ))}
    </div>
    {state === 'ok' && (
      <div className="pager-row">
        <div className={`pg${page > 1 ? '' : ' active'}`} onClick={() => page > 1 && onPage(page - 1)}>上一页</div>
        <span>第 {page} 页{data?.hasMore ? '' : ' · 末页'}</span>
        <div className={`pg${data?.hasMore ? '' : ' active'}`} onClick={() => data?.hasMore && onPage(page + 1)}>下一页</div>
      </div>
    )}
  </>
)

/** 来源浏览区：分类筛选 → 壁纸网格（预览对象由外部来源列表驱动，无启用来源时不渲染） */
const WallBrowser = ({ src }: { src: WallpaperSource | undefined }) => {
  const setWallpaperRef = useApp((st) => st.setWallpaperRef)
  const showToast = useApp((st) => st.showToast)
  const { cats, state: catState } = useWallCategories(src)
  const [catKey, setCatKey] = useState('')
  const cat = cats.some((c) => c.key === catKey) ? catKey : (cats[0]?.key ?? 'all')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState('')
  const [task, setTask] = useState<ApplyTask | null>(null)
  const startedAt = useRef(0)
  const [query, setQuery] = useState('')
  const [qInput, setQInput] = useState('')
  const { data, state } = useWallPage(src, cat, page, query)

  /** 三段式应用：下载（带字节进度）→ 处理（校验 + 入库）→ 应用（写设置并渲染），全程由浮层反馈 */
  const apply = async (p: WallPhoto): Promise<void> => {
    if (busy !== '') return
    setBusy(p.full)
    startedAt.current = Date.now()
    setTask({ name: p.title || p.author || '当前壁纸', thumb: p.thumb, stage: 0, loaded: 0, total: 0, reused: false })
    const move = (patch: Partial<ApplyTask>): void => {
      setTask((t) => (t === null ? null : { ...t, ...patch }))
    }
    try {
      /* 同一张图下过就跳过整段下载：键是源地址哈希，命中即复用已有记录 */
      const hit = await findWallpaperBySource(p.full)
      if (hit !== null) {
        move({ stage: 2, reused: true })
        setWallpaperRef(hit.ref)
        await sleep(APPLY_STAGE_HOLD_MS)
        return
      }
      const dataUrl = await fetchDataUrl(p.full, (loaded, total) => move({ loaded, total }))
      move({ stage: 1 })
      const ref = await storeRemoteWallpaper(p.full, dataUrl, src?.name ?? '外部来源')
      move({ stage: 2 })
      setWallpaperRef(ref)
      await sleep(APPLY_STAGE_HOLD_MS)
    } catch (e) {
      showToast(`设为壁纸失败：${(e as Error).message}`)
    } finally {
      await sleep(Math.max(0, FEEDBACK_MIN_MS - (Date.now() - startedAt.current)))
      setTask(null)
      setBusy('')
    }
  }

  /* 切换来源后重置分类 / 页码 / 搜索词，避免沿用上一源的浏览位置 */
  const srcId = src?.id
  useEffect(() => {
    setPage(1)
    setCatKey('')
    setQuery('')
    setQInput('')
  }, [srcId])

  if (src === undefined) return null

  const unavailable = WALL_SOURCE_UNAVAILABLE[src.kind]
  if (unavailable !== undefined) {
    /* 不可用来源（实测存在无法合法解决的访问限制）：只显示说明，不发起任何请求 */
    return (
      <div className="empty-box">
        <div>「{src.name}」当前不可用</div>
        <div style={{ marginTop: 6, lineHeight: 1.7 }}>{unavailable}</div>
        <div style={{ marginTop: 6 }}>此限制与网络 / 代理无关，待站方提供公开接口后即可接入。</div>
      </div>
    )
  }
  const searchable = sourceSearchable(src.kind)
  return (
    <>
      {searchable && (
        <div className="f-row" style={{ marginTop: 10, marginBottom: 4 }}>
          <input className="f-input" placeholder="输入关键词搜索，回车确认" value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setQuery(qInput.trim()); setPage(1) } }} />
        </div>
      )}
      <div className="cats">
        {catState === 'loading' && <div className="cat active">分类加载中…</div>}
        {catState === 'error' && <div className="cat">分类获取失败</div>}
        {catState === 'ok' && cats.map((c) => (
          <div key={c.key} className={`cat${c.key === cat ? ' active' : ''}`}
            onClick={() => { setCatKey(c.key); setPage(1) }}>{c.label}</div>
        ))}
      </div>
      <div className="wall-stage">
        <WallPhotos data={data} state={state} page={page} onPage={setPage}
          onApply={(p) => { void apply(p) }} />
        {task !== null && <WallTaskOverlay t={task} srcName={src.name} />}
      </div>
    </>
  )
}

/** 个性化面板导航页签（分组导航，避免单页堆全部设置） */
const PANEL_TABS: readonly string[] = ['壁纸', '背景效果', '显示', '搜索与Dock', '主题']

const PersonalPanel = () => {
  const s = useApp((st) => st.settings)
  const setSetting = useApp((st) => st.setSetting)
  const toggle = useApp((st) => st.toggle)
  const setGlass = useApp((st) => st.setGlass)
  const setBlur = useApp((st) => st.setBlur)
  const applySkin = useApp((st) => st.applySkin)
  const skins = useApp((st) => st.skins)
  const skinNew = useApp((st) => st.skinNew)
  const skinRestore = useApp((st) => st.skinRestore)
  const skinDelete = useApp((st) => st.skinDelete)
  const skinRename = useApp((st) => st.skinRename)
  const skinToken = useApp((st) => st.skinToken)
  const setWallpaperRef = useApp((st) => st.setWallpaperRef)
  const addWallSource = useApp((st) => st.addWallSource)
  const removeWallSource = useApp((st) => st.removeWallSource)
  const toggleWallSource = useApp((st) => st.toggleWallSource)
  const updateWallSource = useApp((st) => st.updateWallSource)
  const showToast = useApp((st) => st.showToast)
  const [tab, setTab] = useState(0)
  const [prevWallRef, setPrevWallRef] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState('')
  const [wall, setWall] = useState<BgData | null>(null)
  const wallFile = useRef<HTMLInputElement | null>(null)
  /* 透明度 12 项：前六项是玻璃底色，后六项是元素显隐强度（说明即各自的作用范围） */
  const GLASS: readonly (readonly [GlassKey, string, string])[] = [
    ['card', '卡片', '资讯卡与小组件卡的玻璃底色'],
    ['tile', '图标容器', '图标方块与图标格的底座底色'],
    ['glyph', '图标图形', '图标容器里的 logo 字形本身，独立于容器底色'],
    ['dock', 'Dock 快捷栏', '底部悬浮栏的玻璃底座（整条快捷栏）'],
    ['dockIcon', 'Dock 图标', '快捷栏里的应用图标贴图，独立于网格图标'],
    ['search', '搜索框', '顶部搜索框的玻璃底色'],
    ['panel', '面板与弹窗', '抽屉 / 弹窗 / 搜索建议'],
    ['menu', '菜单与浮层', '右键菜单 / 模式胶囊 / 提示气泡 / 任务浮层'],
    ['clock', '时间与日期', '时钟与日期文字（标准模式卡片内 + 极简模式大时钟）'],
    ['quote', '每日一言', '问候语与鼓励语文字（每日一言卡 + 极简模式悬浮语）'],
    ['line', '边框与分隔线', '卡片描边、列表分隔线与浅色胶囊底，调低后界面更轻盈'],
    ['hover', '悬停与激活态', '菜单与列表的 hover 高亮、选中项描边的反馈强度'],
  ]
  /* 毛玻璃模糊 6 项：只与有玻璃底色的那六项配对（图标图形 / 文字 / 线条没有可模糊的背景） */
  const BLUR: readonly (readonly [BlurKey, string, string])[] = [
    ['card', '卡片', '资讯卡与小组件卡'],
    ['tile', '图标容器', '图标方块底板（网址导航图标与 Dock 图标）'],
    ['dock', 'Dock 快捷栏', '底部悬浮栏'],
    ['search', '搜索框', '顶部搜索框'],
    ['panel', '面板与弹窗', '抽屉 / 弹窗 / 搜索建议'],
    ['menu', '菜单与浮层', '右键菜单 / 模式胶囊 / 提示气泡'],
  ]
  const skin = skins.find((x) => x.id === s.skinId) ?? skins[0]

  const upload = async (f: File | undefined): Promise<void> => {
    if (!f) return
    try {
      const ref = await uploadWallpaper(f)
      if (ref !== null) {
        setPrevWallRef(s.wallpaperRef)
        setWallpaperRef(ref)
      }
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  const useLinkWall = (): void => {
    const u = window.prompt('请输入图片或视频地址')
    if (u === null || u === '') return
    void fetch(u)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
      .then((b) => upload(new File([b], 'link', { type: b.type })))
      .catch(() => showToast('外链获取失败，请检查地址是否允许跨域'))
  }

  /** 行尾「···」→ 改地址：仅接受 http(s) 基址，可指向镜像服务 */
  const editWallSource = (ws: WallpaperSource): void => {
    const next = window.prompt('修改 API 基址（镜像地址）', ws.apiBase)?.trim() ?? ''
    if (next === '') return
    if (/^https?:\/\//.test(next)) updateWallSource(ws.id, { apiBase: next })
    else showToast('地址需以 http(s):// 开头')
  }

  /* 当前壁纸的缩略图与体积（仅读取引用对应的那份数据，不写入） */
  const wallRef = s.wallpaperRef
  useEffect(() => {
    if (wallRef === null) { setWall(null); return }
    let alive = true
    void getWallpaper(wallRef).then((d) => { if (alive) setWall(d) })
    return () => { alive = false }
  }, [wallRef])

  /* 历史壁纸（按落地时间倒序，超出保留上限的已在入库时淘汰） */
  const [history, setHistory] = useState<{ ref: string; bg: BgData }[]>([])
  useEffect(() => {
    let alive = true
    void listWallpapers().then((list) => {
      if (alive) setHistory(list)
    })
    return () => { alive = false }
  }, [wallRef])

  /* 预览对象：列表行点击切换；来源被禁用后自动落到首个启用来源 */
  const enabledSources = s.wallSources.filter((ws) => ws.enabled)
  const preview = enabledSources.find((x) => x.id === previewId) ?? enabledSources[0]
  const pendingSources = WALL_SOURCE_TEMPLATES.filter((t) => !s.wallSources.some((ws) => ws.kind === t.kind))

  /** 点行名预览该来源；禁用态不发起请求，仅提示 */
  const previewSource = (ws: WallpaperSource): void => {
    if (!ws.enabled) { showToast(`「${ws.name}」已禁用，请先打开右侧开关`); return }
    setPreviewId(ws.id)
  }

  /** 列表末尾「+ 添加来源」：加入尚未添加的协议模板并立即预览 */
  const addSource = (t: (typeof WALL_SOURCE_TEMPLATES)[number]): void => {
    const src = { id: `ws${Date.now().toString(36)}`, kind: t.kind, name: t.name, apiBase: t.apiBase, enabled: true }
    addWallSource(src)
    setPreviewId(src.id)
  }

  return (
    <>
      <DrawerTabs tabs={PANEL_TABS} value={tab} onChange={setTab} />
      {tab === 0 && (
      <SecCard t="壁纸" info="图片最大 5MB（视频同限）；外部网站壁纸在下方来源中获取。开关控制来源是否参与浏览，点行名可预览该来源，行尾「···」可改 API 基址（可指向镜像服务，扩展环境自动走系统代理）或移除。">
        <div className="wall-now">
          <div className="wall-thumb-now">
            {wall !== null && wall.type === 'image'
              ? <img src={wall.data} alt="当前壁纸" />
              : <span className="wall-thumb-ph">{wall !== null ? '视频' : '无'}</span>}
          </div>
          <div className="wall-now-info">
            <div className="wall-now-name">{s.wallpaperRef !== null ? '自定义壁纸' : '未设置壁纸'}</div>
            {s.wallpaperRef !== null && wall !== null && <div className="wall-now-size">{readableSize(wall.data)}</div>}
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button className="btn sm ghost" onClick={() => wallFile.current?.click()}>本地上传</button>
              <button className="btn sm ghost" onClick={useLinkWall}>外链上传</button>
              {s.wallpaperRef !== null && (
                <button className="btn sm ghost" onClick={() => {
                  if (prevWallRef !== null) setWallpaperRef(prevWallRef)
                  else setWallpaperRef(null)
                }}>移除</button>
              )}
            </div>
          </div>
        </div>
        <input ref={wallFile} type="file" accept="image/*,video/mp4,video/webm" style={{ display: 'none' }}
          onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        {history.length > 1 && (
          <>
            <div className="sr-desc" style={{ marginTop: 12 }}>
              历史壁纸（保留最近 {WALLPAPER_HISTORY_LIMIT} 张，点缩略图直接切换）
            </div>
            <div className="wp-history">
              {history.map((h) => (
                <div key={h.ref}
                  className={`wp-hitem${h.ref === s.wallpaperRef ? ' on' : ''}`}
                  title={h.bg.at > 0 ? `${h.bg.from} · ${new Date(h.bg.at).toLocaleDateString('zh-CN')}` : h.bg.from}
                  onClick={() => setWallpaperRef(h.ref)}>
                  {h.bg.type === 'image'
                    ? <img src={h.bg.data} alt="" loading="lazy" />
                    : <span className="wp-hph">视频</span>}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="wall-src-list">
          {s.wallSources.map((ws) => (
            <div className="wall-source-row" key={ws.id}>
              <span className={`ws-name${preview?.id === ws.id ? ' on' : ''}`} onClick={() => previewSource(ws)}>
                {ws.name}
                {preview?.id === ws.id && <span className="tb-tag" style={{ marginLeft: 6 }}>预览中</span>}
                {WALL_SOURCE_UNAVAILABLE[ws.kind] !== undefined
                  && <span className="tb-tag" style={{ marginLeft: 6 }} title={WALL_SOURCE_UNAVAILABLE[ws.kind]}>当前不可用</span>}
              </span>
              <div className={`switch${ws.enabled ? ' on' : ''}`} title={ws.enabled ? '已启用，点击禁用' : '已禁用，点击启用'}
                onClick={() => toggleWallSource(ws.id)}><i /></div>
              <OverflowMenu
                trigger={() => <span className="ov-btn" title="更多操作">{Icon.more()}</span>}
                items={[
                  { label: '改地址', onClick: () => editWallSource(ws) },
                  { label: '移除', onClick: () => removeWallSource(ws.id) },
                ]} />
            </div>
          ))}
          <div className="ws-add-row">
            <OverflowMenu
              align="left"
              trigger={() => <span className="ws-add">{Icon.plus()}添加来源</span>}
              items={pendingSources.length === 0
                ? [{ label: '全部来源均已添加' }]
                : pendingSources.map((t) => ({ label: t.name, onClick: () => addSource(t) }))} />
          </div>
        </div>
        <WallBrowser src={preview} />
      </SecCard>
      )}
      {tab === 1 && (
      <>
      <SecCard t="透明度" info="0% 完全不透明、100% 完全透明。玻璃底色类保留可读下限（滑到底仍可辨认），元素显隐类可直接调到消失。全局透明度会再乘一层，两者叠加。">
        <SliderRow l="全局透明度" min={20} max={100} value={Math.round(s.gAlpha * 100)} display={`${Math.round(s.gAlpha * 100)}%`}
          onInput={(v) => setSetting('gAlpha', v / 100)} />
        <div style={{ height: 12 }} />
        {GLASS.map(([k, l, d]) => (
          <SliderRow key={k} l={l} info={d} min={0} max={100} value={Math.round(s.glass[k] * 100)}
            display={`${Math.round(s.glass[k] * 100)}%`} onInput={(v) => setGlass(k, v / 100)} />
        ))}
      </SecCard>
      <SecCard t="毛玻璃模糊" info="与透明度分开设置：只降透明度不调模糊，背景会「透但看不清」、观感发脏；两者配对才通透。0px 即关闭毛玻璃。">
        {BLUR.map(([k, l, d]) => (
          <SliderRow key={k} l={l} info={d} min={0} max={BLUR_MAX_PX} value={s.blur[k]}
            display={`${s.blur[k]}px`} onInput={(v) => setBlur(k, v)} />
        ))}
      </SecCard>
      <SecCard t="壁纸与文字">
        <SliderRow l="壁纸遮罩" min={0} max={100} value={Math.round(s.cover * 100)} display={`${Math.round(s.cover * 100)}%`}
          onInput={(v) => setSetting('cover', v / 100)} />
        <div style={{ height: 12 }} />
        <ColorField label="字体颜色" value={s.fontColor === '' ? '#1f2937' : s.fontColor} auto="跟随风格"
          onAuto={() => setSetting('fontColor', '')} onChange={(hex) => setSetting('fontColor', hex)} />
      </SecCard>
      </>
      )
      }
      {tab === 2 && (
      <SecCard t="显示">
        <SwitchRow l="展示时间" d="时钟以 24 小时制显示" on={s.showTime} onToggle={() => toggle('showTime')} />
        <SwitchRow l="展示日期" d="显示公历与星期" on={s.showDate} onToggle={() => toggle('showDate')} />
        <SwitchRow l="展示每日一言" on={s.showQuote} onToggle={() => toggle('showQuote')} />
        <ColorField label="时间颜色" value={s.clockColor} onChange={(hex) => setSetting('clockColor', hex)} />
        <div style={{ height: 10 }} />
        <SwitchRow l="隐藏顶部区域" d="隐藏左上角模式胶囊" on={s.hideTop} onToggle={() => toggle('hideTop')} />
        <SwitchRow l="隐藏搜索框" on={s.hideSearch} onToggle={() => toggle('hideSearch')} />
        <SwitchRow l="隐藏图标标签" d="只保留图标" on={!s.labels} onToggle={() => toggle('labels')} />
        <SwitchRow l="Dock 快捷栏" d="隐藏底部快捷栏" on={s.mascot} onToggle={() => toggle('mascot')} />
      </SecCard>
      )
      }
      {tab === 3 && (
      <SecCard t="搜索与 Dock">
        <SliderRow l="搜索框宽度" min={400} max={1400} value={s.searchWidth} display={`${s.searchWidth}px`} onInput={(v) => setSetting('searchWidth', v)} />
        <SliderRow l="搜索框圆角" min={0} max={25} value={s.searchRadius} display={`${s.searchRadius}px`} onInput={(v) => setSetting('searchRadius', v)} />
        <SwitchRow l="沉浸式搜索框" d="与壁纸融合的透明样式" on={s.immersive} onToggle={() => toggle('immersive')} />
        <SwitchRow l="极简模式用线框样式" on={s.simpleSearch} onToggle={() => toggle('simpleSearch')} />
        <div style={{ height: 10 }} />
        <SliderRow l="Dock 应用数量" min={4} max={8} value={s.dockCount} display={`${s.dockCount} 个`} onInput={(v) => setSetting('dockCount', v)} />
        <SwitchRow l="圆形 Dock 图标" on={s.dockIcon === 'circle'}
          onToggle={() => setSetting('dockIcon', s.dockIcon === 'circle' ? 'rect' : 'circle')} />
      </SecCard>
      )
      }

      {tab === 4 && (
      <>
      <SecCard t="主题与风格">
        <div className="theme-grid">
          {skins.map((k) => (
            <div key={k.id} className={`theme-btn${k.id === s.skinId ? ' sel' : ''}`} onClick={() => applySkin(k.id)}>
              <MiniSkinPreview tokens={k.tokens} />
              <div className="tb-name">{k.name}</div>
            </div>
          ))}
        </div>
      </SecCard>
      <SecCard t="风格编辑器">
        <div className="f-row inline">
          <label className="f-label">皮肤名称</label>
          <input className="f-input" value={skin?.name ?? ''} onChange={(e) => skinRename(e.target.value)} />
          <OverflowMenu
            trigger={() => <span className="ov-btn" title="更多操作">{Icon.more()}</span>}
            items={[
              { label: '还原内置', onClick: skinRestore },
              // 内置皮肤不可删：不给 onClick 即为禁用项
              skin?.builtin === true ? { label: '删除皮肤' } : { label: '删除皮肤', onClick: skinDelete },
            ]} />
        </div>
        <div className="color-grid">
          {SKIN_FIELDS.map(([token, label]) => {
            const raw = skin?.tokens[token] ?? '#ffffff'
            const hex = raw.startsWith('#') ? raw : '#ffffff'
            return <ColorField key={token} compact label={label} value={hex} onChange={(v) => skinToken(token, v)} />
          })}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={skinNew}>新建皮肤</button>
        </div>
      </SecCard>
      </>
      )}
    </>
  )
}

/* ============================== 设置 ============================== */

const EngineRows = () => {
  const engines = useApp((s) => s.engines)
  const engineId = useApp((s) => s.settings.engineId)
  const setEngine = useApp((s) => s.setEngine)
  const toggleEngineHidden = useApp((s) => s.toggleEngineHidden)
  const commitEngineOrder = useApp((s) => s.commitEngineOrder)
  const setModal = useApp((s) => s.setModal)
  const showToast = useApp((s) => s.showToast)
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <>
      {engines.map((e, i) => (
        <div className="eng-row sortable" key={e.id} draggable
          onDragStart={() => setDragId(e.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(ev) => { if (dragId !== null) ev.preventDefault() }}
          onDrop={() => {
            if (dragId === null || dragId === e.id) return
            const ids = engines.map((x) => x.id).filter((x) => x !== dragId)
            ids.splice(i, 0, dragId)
            commitEngineOrder(ids)
            setDragId(null)
          }}>
          <span style={{ color: 'var(--panel-sub)', cursor: 'grab' }}>⋮⋮</span>
          <div className="er-ico" style={{ background: e.color, opacity: e.hidden ? 0.45 : 1 }}>
            {e.img !== undefined ? <img src={e.img} alt={e.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }} /> : e.glyph}
          </div>
          <span style={{ flex: 1, opacity: e.hidden ? 0.55 : 1 }}>{e.name}</span>
          {engineId === e.id ? <span className="tb-tag">正在使用中</span>
            : <button className="btn sm ghost" onClick={() => setEngine(e.id)}>启用</button>}
          <button className="btn sm ghost" onClick={() => {
            toggleEngineHidden(e.id)
            showToast(e.hidden === true ? '已显示' : '已隐藏')
          }}>{e.hidden === true ? '显示' : '隐藏'}</button>
        </div>
      ))}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={() => setModal('addEngine')}>添加自定义搜索引擎</button>
      </div>
    </>
  )
}

const OPEN_MODES: readonly (readonly ['link' | 'tab' | 'search', string])[] = [
  ['link', '当前窗口打开链接'], ['tab', '打开新标签页'], ['search', '当前窗口打开搜索结果'],
]

/* ---------- 设置面板：分区页签 + 卡片分组（与个性化同一套分布方式） ---------- */

/**
 * 分区顺序 = 使用频率 × 风险：搜索（高频）→ 通用（常用偏好）→ 数据（低频动作）→ 云端 → 关于（只读参考）。
 * 卡片内主次排布：可即时生效的开关与单选项常驻卡片主体；低频动作退到卡片底部按钮行；
 * 说明文案统一收进标题右侧 ⓘ 气泡；覆盖 / 删除类操作单独成卡并标红，不与常规操作混排。
 */
const SETTING_TABS: readonly string[] = ['搜索', '通用', '数据', '云端', '关于']

/** 只读信息行：左侧说明 + 右侧值（复用引擎行的分隔线语言，用于「版本」「快捷键」这类参考项） */
const InfoRow = ({ l, r }: { l: string; r: React.ReactNode }) => (
  <div className="eng-row"><span style={{ flex: 1 }}>{l}</span><span style={{ color: 'var(--panel-sub)' }}>{r}</span></div>
)

/** 快捷键清单（设置 → 关于 → 快捷键） */
const SHORTCUTS: readonly (readonly [string, string])[] = [
  ['Enter', '执行搜索'],
  ['← →', '切换页面'],
  ['双击每日一言卡', '换一条鼓励语'],
  ['Esc', '关闭面板 / 菜单 / 搜索历史'],
  ['Ctrl+Shift+E', '导出布局 JSON'],
  ['Ctrl+Shift+R', '一键重置（需确认）'],
]

/** 导出布局 JSON 并提示 */
const exportLayoutFile = (): void => {
  const st = useApp.getState()
  downloadJson('thrilled-layout.json', buildLayoutDoc(st.exportLayout().pages))
  st.showToast('已导出 thrilled-layout.json')
}

/** 导入收藏夹：书签树 → 网址图标铺到页面 */
const importBookmarks = async (): Promise<void> => {
  const st = useApp.getState()
  const tree = await readBookmarkTree()
  if (tree === null) { st.showToast('收藏夹导入需要在扩展中使用'); return }
  const entries = collectBookmarks(tree)
  if (entries.length === 0) { st.showToast('收藏夹里没有可导入的 http(s) 书签'); return }
  st.showToast(`已从收藏夹导入 ${st.placeMany(entries)} 个网站图标`)
}

/** 恢复本地快照：结构合法则写入存储并提示刷新 */
const restoreSnapshotDoc = (v: unknown): void => {
  const st = useApp.getState()
  const doc = restoreSnapshot(v)
  if (doc === null) { st.showToast('快照恢复失败：结构不合法'); return }
  saveDoc(doc)
  st.showToast('快照恢复成功，请刷新页面')
}

/** 从文件输入读 JSON：解析成功交给 ok，失败按 fail 前缀提示；无论成败都清空输入，便于重选同一文件 */
const pickJson = (e: React.ChangeEvent<HTMLInputElement>, ok: (v: unknown) => void, fail: string): void => {
  const f = e.target.files?.[0]
  if (f !== undefined) {
    const rd = new FileReader()
    rd.onload = () => {
      try { ok(JSON.parse(String(rd.result))) } catch { useApp.getState().showToast(`${fail}：不是合法的 JSON 文件`) }
    }
    rd.readAsText(f)
  }
  e.target.value = ''
}

/** 搜索分区：引擎清单（主内容）→ 搜索框行为（次内容，开关即时生效） */
const SettingSearchTab = () => {
  const s = useApp((st) => st.settings)
  const toggle = useApp((st) => st.toggle)
  return (
    <>
      <SecCard t="搜索引擎" info="拖动行首 ⋮⋮ 排序；隐藏的引擎不出现在搜索框下拉与右键二级菜单里。">
        <EngineRows />
      </SecCard>
      <SecCard t="搜索框" info="本项目不做搜索联想：输入时不出候选词，只在开启搜索历史时展示历史记录。">
        <SwitchRow l="自动聚焦" d="打开新标签时自动聚焦搜索框" on={s.autoFocus} onToggle={() => toggle('autoFocus')} />
        <SwitchRow l="保留搜索内容" d="搜索后不清空输入框内容" on={s.searchKeep} onToggle={() => toggle('searchKeep')} />
        <SwitchRow l="隐藏搜索按钮" d="仅通过 Enter 键触发搜索" on={s.hideBtn} onToggle={() => toggle('hideBtn')} />
        <SwitchRow l="搜索历史" d="关闭后搜索框不再弹出任何下拉" on={s.searchHistory} onToggle={() => toggle('searchHistory')} />
      </SecCard>
    </>
  )
}

/** 通用分区：打开方式（互斥单选，一行胶囊表达）→ 每日问候（文本字段） */
const SettingGeneralTab = () => {
  const s = useApp((st) => st.settings)
  const setSetting = useApp((st) => st.setSetting)
  return (
    <>
      <SecCard t="打开方式" info="点击卡片、图标与 Dock 快捷方式时链接的打开位置：前两项作用于普通链接，第三项作用于搜索结果。">
        <div className="cats">
          {OPEN_MODES.map(([k, n]) => (
            <div key={k} className={`cat${s.openMode === k ? ' active' : ''}`} onClick={() => setSetting('openMode', k)}>{n}</div>
          ))}
        </div>
      </SecCard>
      <SecCard t="每日问候" info="用在每日一言卡：时段问候 + 昵称 + 竖线鼓励语；双击卡片可换一条鼓励语。">
        <div className="f-row inline">
          <label className="f-label">昵称</label>
          <input className="f-input" value={s.nick} placeholder="主人" onChange={(e) => setSetting('nick', e.target.value)} />
        </div>
      </SecCard>
    </>
  )
}

/** 备份与迁移卡片：3 列等宽网格——行 1 界面级（备份 / 取快照 / 恢复默认）、行 2 文件级（导出 / 导入 / 收藏夹）；
 *  「备份当前界面」是全组唯一的主按钮；与「一键重置」易混的「恢复为默认界面」按钮下加 11px 作用域小字 */
const SettingBackupCard = () => {
  const setModal = useApp((st) => st.setModal)
  const importLayout = useApp((st) => st.importLayout)
  const showToast = useApp((st) => st.showToast)
  const file = useRef<HTMLInputElement | null>(null)
  const bkFile = useRef<HTMLInputElement | null>(null)
  return (
    <SecCard t="备份与迁移" info="导出内容 = 全部页面的卡片实例（引用的小组件、各自配置、位置与尺寸），改完文件可直接导入回来；已配置同步目录时改动会自动写入本地目录。">
      <div className="btn-grid">
        <button className="btn" onClick={() => setModal('backup')}>备份当前界面</button>
        <button className="btn ghost" onClick={() => bkFile.current?.click()}>恢复本地快照</button>
        <div className="btn-cell">
          <button className="btn ghost" onClick={() => setModal('restore')}>恢复为默认界面</button>
          <span className="btn-note">仅重置界面布局</span>
        </div>
      </div>
      <div className="btn-grid">
        <button className="btn sm ghost" onClick={exportLayoutFile}>导出布局 JSON</button>
        <button className="btn sm ghost" onClick={() => file.current?.click()}>导入布局 JSON</button>
        <button className="btn sm ghost" onClick={() => void importBookmarks()}>导入收藏夹</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" style={{ display: 'none' }}
        onChange={(e) => pickJson(e, (v) => showToast(importLayout(v) ? '布局导入成功' : '布局导入失败：没有有效的页面数据'), '布局导入失败')} />
      <input ref={bkFile} type="file" accept=".json,application/json" style={{ display: 'none' }}
        onChange={(e) => pickJson(e, restoreSnapshotDoc, '快照恢复失败')} />
    </SecCard>
  )
}

/** 重置与清理卡片：两项都会覆盖 / 删除本机数据，单独成卡并标红，与常规操作分离 */
const SettingResetCard = () => {
  const setModal = useApp((st) => st.setModal)
  const clearLocal = async (): Promise<void> => {
    if (!window.confirm('将彻底删除本地数据（图标、布局、皮肤、壁纸配置），且不可撤销。确定继续？')) return
    await resetAllData()
  }
  return (
    <SecCard danger t="重置与清理" info="两项都只作用于本机数据且不可撤销：「清除本地数据」会连壁纸一起删除；「一键重置」可只勾选要重置的部分，建议先用上方备份留一份退路。">
      <div className="btn-row top">
        <button className="btn ghost" onClick={() => void clearLocal()}>清除本地数据</button>
        <div className="btn-cell">
          <button className="btn danger" onClick={() => setModal('reset')}>一键重置</button>
          <span className="btn-note">含数据全量重置</span>
        </div>
      </div>
    </SecCard>
  )
}

/** 数据分区：备份与迁移（常规动作）→ 空白隔离带 → 重置与清理（危险动作贴面板底部，拉开距离降低误触） */
const SettingDataTab = () => (
  <>
    <SettingBackupCard />
    <div className="pane-band" />
    <SettingResetCard />
  </>
)

/** 云端分区：连接配置与上传 / 恢复（单卡承载，云端为唯一权威数据源） */
const SettingCloudTab = () => (
  <SecCard t="云端同步" info="配置服务器地址与访问令牌后，本地改动自动上传、云端为唯一权威数据源；两项都只保存在本机浏览器存储，不进入代码仓库。">
    <CloudSyncSection />
  </SecCard>
)

/** 关于分区：版本与入口 + 快捷键参考（全为只读内容，集中在同一页签） */
const SettingAboutTab = () => {
  const setModal = useApp((st) => st.setModal)
  return (
    <>
      <SecCard t="关于">
        <InfoRow l="版本" r="4.4（v4 重构版）" />
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn sm ghost" onClick={() => setModal('log')}>更新记录</button>
          <button className="btn sm ghost" onClick={() => setModal('about')}>关于我们</button>
        </div>
      </SecCard>
      <SecCard t="快捷键" info="非输入状态下生效；Ctrl+Shift 组合键在任意位置可用。">
        {SHORTCUTS.map(([k, d]) => <InfoRow key={k} l={d} r={<kbd className="kbd">{k}</kbd>} />)}
      </SecCard>
    </>
  )
}

/** 页签序号 → 分区组件（顺序与 SETTING_TABS 一致） */
const SETTING_PANES: readonly (() => React.ReactElement)[] = [
  SettingSearchTab, SettingGeneralTab, SettingDataTab, SettingCloudTab, SettingAboutTab,
]

const SettingPanel = () => {
  const [tab, setTab] = useState(0)
  const Pane = SETTING_PANES[tab] ?? SettingSearchTab
  return (
    /* pane-fill：页签 + 卡片按列排布且至少撑满抽屉可视高度，供「数据」分区把危险卡推到面板底部 */
    <div className="pane-fill">
      <DrawerTabs tabs={SETTING_TABS} value={tab} onChange={setTab} />
      <Pane />
    </div>
  )
}

/* ============================== 云端同步（配置仅存本机，不入代码仓库） ============================== */

const CloudSyncSection = () => {
  const cloudUpload = useApp((st) => st.cloudUpload)
  const cloudRestore = useApp((st) => st.cloudRestore)
  const showToast = useApp((st) => st.showToast)
  const [cfg, setCfg] = useState<CloudConfig>(() => getCloudConfig())
  const configured = cfg.url.trim() !== ''
  const save = (): void => {
    if (cfg.url.trim() !== '' && !/^https?:\/\//.test(cfg.url.trim())) {
      showToast('服务器地址需以 http(s):// 开头')
      return
    }
    setCloudConfig(cfg)
    showToast('云端连接配置已保存（仅保存在本机）')
  }
  return (
    <>
      <div className="f-row"><label className="f-label">服务器地址</label>
        <input className="f-input" placeholder="例如 https://your-server.example.com" value={cfg.url}
          onChange={(e) => setCfg({ ...cfg, url: e.target.value })} /></div>
      <div className="f-row"><label className="f-label">访问令牌</label>
        <input className="f-input" type="password" placeholder="与服务端 TOKEN 一致，留空则不鉴权" value={cfg.token}
          onChange={(e) => setCfg({ ...cfg, token: e.target.value })} /></div>
      <div className="btn-row">
        <button className="btn sm" onClick={save}>保存配置</button>
        <button className="btn sm ghost" onClick={() => void cloudUpload()}>上传到云端</button>
        <button className="btn sm ghost" onClick={() => void cloudRestore()}>从云端恢复</button>
      </div>
      <Hint>
        {configured ? '已配置：改动自动上传云端，云端为唯一权威数据源；换设备时填同一配置即可「从云端恢复」一键还原。'
          : '未配置：数据仅存本机。配置服务器地址后，本地数据将统一上传云端，其他设备可一键恢复（以云端最新版本为准）。'}
        服务器地址与令牌只保存在本机浏览器存储，不进入代码仓库。
      </Hint>
    </>
  )
}

const PANELS: Record<DrawerKey, () => React.ReactElement> = {
  add: AddPanel, personal: PersonalPanel, setting: SettingPanel,
}

export const Drawer = () => {
  const drawer = useApp((s) => s.drawer)
  const setDrawer = useApp((s) => s.setDrawer)
  const Panel = drawer !== null ? PANELS[drawer] : null
  const [title, sub] = drawer !== null ? DRAWERS[drawer] : ['', '']
  return (
    <>
      <div className={`dw-mask${drawer ? ' show' : ''}`} onClick={() => setDrawer(null)} />
      <div className={`dw${drawer ? ' open' : ''}`}>
        <div className={`dw-head${sub === '' ? ' solo' : ''}`}>
          <div>
            <div className="dw-title">{title}</div>
            {sub !== '' && <div className="dw-sub">{sub}</div>}
          </div>
          <div className="dw-close" onClick={() => setDrawer(null)}>{Icon.close()}</div>
        </div>
        <div className="dw-body">{Panel !== null ? <Panel /> : null}</div>
      </div>
    </>
  )
}

/* ============================== 弹窗 ============================== */

const CHANGELOG: readonly { v: string; d: string; l: readonly string[] }[] = [
  { v: '4.4', d: '2026-09-30 / 2026-10-08', l: ['极简页面优化：模式胶囊收起只显图标、悬停展开极简/标准（去除说明文字）；右上头像移除，新增/个性化/设置移入底部 Dock 功能键', 'Dock 改版：出厂快捷方式清空、用户手动新增（「添加」抽屉勾选「同时添加到底部 Dock」），图标显示站点 favicon，苹果式尺寸与玻璃质感；右键支持改名/改网址/移除', '极简模式：日期改为「2026年9月30日」格式、搜索框未聚焦透明胶囊白描边/聚焦白色玻璃卡片、鼓励语悬浮 Dock 上方', '壁纸整理：内置壁纸全部移除，改为外部来源适配器（Wallhaven / Picsum / 必应每日 / 061129 / 哲风）；自适应裁剪焦点、同一张图去重、最近 12 张历史缩略图带、应用分阶段反馈', '面板整理：设置抽屉改「搜索 / 通用 / 数据 / 云端 / 关于」五分区页签 + 卡片分组；个性化「主题」页签压缩为 4 列缩略图 + 12 项色值 4 列密排；透明度补至 12 项并与毛玻璃模糊解耦', '在线广场模块整体移除（个性化里的「主题」不受影响）；「吉祥物」开关更名为「Dock 快捷栏」'] },
  { v: '4.3', d: '2026-09-29', l: ['移除登录与账号体系，隐私模式并入标准模式（单套页面）', '新增云端同步：配置注入式连接（地址 / 令牌仅存本机），本地改动自动上传、新环境一键恢复，云端为唯一权威数据源', 'Dock 可编辑 + 苹果式放大、头像菜单、搜索引擎恢复 v3 设置、搜索历史贴框与自动关闭'] },
  { v: '4.2', d: '2026-09-27', l: ['界面风格重大升级：光影体系 2.0（18px 圆角 / 内高光 / 分层投影）与弹簧动效、弹窗缩放入场、搜索框聚焦光晕；壁纸与出厂皮肤扩到 6 套', '迁移与恢复默认修复：v3 迁移改为「出厂布局在前 + 迁移图标追加成新页」，「恢复为默认界面」支持「保留我的网址图标」'] },
  { v: '4.1', d: '2026-09-27', l: ['按 v4 原型补全五面板与九弹窗（含风格皮肤编辑器、广场三页签）', '设置 / 布局 / 皮肤接通本地持久化，支持 v3 数据一次性迁移', '壁纸支持本地上传与外链（图片压缩 + 视频壁纸，IndexedDB 存储）', '天气卡接入 Open-Meteo 实况数据；搜索 / 卡片 / Dock 真实打开链接', '新增收藏夹导入、布局导出导入、备份 / 恢复 / 一键重置确认弹窗'] },
  { v: '4.0', d: '2026-09-26', l: ['仓库重组为 app / core / background / shared 四层', 'React 18 + Vite 重写视图层，落地 v4 内容模型（18 类小组件引用）'] },
]

const EditCardModal = ({ item }: { item: GridItem }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const resize = useApp((s) => s.resize)
  const setModal = useApp((s) => s.setModal)
  const showToast = useApp((s) => s.showToast)
  const def = WIDGET_DEFS[item.t]
  const c = { ...def.def, ...item.config }
  const field = (f: WidgetField) => {
    const v = c[f.k]
    if (f.t === 'bool') return <SwitchRow key={f.k} l={f.l} on={v === true} onToggle={() => updateConfig(item.id, { [f.k]: !(v === true) })} />
    if (f.t === 'sel') return (
      <div className="f-row" key={f.k}><label className="f-label">{f.l}</label>
        <div className="cats">{f.o?.map((o) => (
          <div key={o} className={`cat${o === v ? ' active' : ''}`} onClick={() => updateConfig(item.id, { [f.k]: o })}>{o}</div>
        ))}</div>
      </div>
    )
    const text = f.t === 'list' && Array.isArray(v) ? v.join(', ') : String(v ?? '')
    return (
      <div className="f-row" key={f.k}><label className="f-label">{f.l}</label>
        <input className="f-input" type={f.t === 'num' ? 'number' : 'text'} value={text} placeholder={f.ph ?? ''}
          onChange={(e) => updateConfig(item.id, { [f.k]: f.t === 'list' ? e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : f.t === 'num' ? Number(e.target.value || 0) : e.target.value })} />
      </div>
    )
  }
  return (
    <>
      <h2>编辑 · {def.n}</h2>
      <p className="sub">这张卡片是「{def.n}」小组件的实例：位置与尺寸属于布局，下面的字段只改本实例的内容。</p>
      <div className="f-row"><label className="f-label">名称标签</label>
        <input className="f-input" value={String(c['label'] ?? '')} placeholder="留空则不显示名称"
          onChange={(e) => updateConfig(item.id, { label: e.target.value })} /></div>
      {def.fields.map(field)}
      <div className="f-row"><label className="f-label">尺寸</label>
        <div className="cats">{SIZES.map((sz) => (
          <div key={`${sz.w}x${sz.h}`} className={`cat${item.w === sz.w && item.h === sz.h ? ' active' : ''}`}
            onClick={() => resize(item.id, sz.w, sz.h)}>{sz.w}×{sz.h}</div>
        ))}</div>
      </div>
      <Hint>引用的小组件：{def.s}。想要别的类型，可在卡片右键菜单里「更换小组件」。</Hint>
      <div className="btn-row end" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
        <button className="btn" onClick={() => { setModal(null); showToast('修改成功') }}>确认修改</button>
      </div>
    </>
  )
}

export const Modal = () => {
  const modal = useApp((s) => s.modal)
  const setModal = useApp((s) => s.setModal)
  const settings = useApp((s) => s.settings)
  const skins = useApp((s) => s.skins)
  const applySkin = useApp((s) => s.applySkin)
  const markBackedUp = useApp((s) => s.markBackedUp)
  const restoreDefault = useApp((s) => s.restoreDefault)
  const resetParts = useApp((s) => s.resetParts)
  const backupTime = useApp((s) => s.backupTime)
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const itemId = useApp((s) => s.itemId)
  const [selSkin, setSelSkin] = useState(settings.skinId)
  const [engName, setEngName] = useState('')
  const [engBase, setEngBase] = useState('')
  const [engImg, setEngImg] = useState('')
  const [keepIcons, setKeepIcons] = useState(true)
  const [resetSel, setResetSel] = useState({ layout: true, skins: true, wallpaper: false })
  const engImgFile = useRef<HTMLInputElement | null>(null)
  const item = pages[cur]?.find((x) => x.id === itemId) ?? null
  if (!modal) return null
  const narrow = modal === 'log' || modal === 'about' || modal === 'backup' || modal === 'restore' || modal === 'reset'
  const body = () => {
    switch (modal) {
      case 'theme':
        return (
          <>
            <h2>欢迎来到 Thrilled</h2>
            <p className="sub">选择风格来搭配组件和图标，之后可随时在「个性化 - 主题与风格」中更换。</p>
            <div className="th-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {skins.map((k) => (
                <div key={k.id} className={`th-card${k.id === selSkin ? ' sel' : ''}`} onClick={() => setSelSkin(k.id)}>
                  <div className="th-prev" style={{ background: k.tokens['--mask-color'] }}>
                    <div className="t-card" style={{ left: '10%', top: '14%', width: '34%', height: '26%', background: k.tokens['--card-bg'] }} />
                    <div className="t-card" style={{ left: '52%', top: '14%', width: '34%', height: '26%', background: k.tokens['--card-bg'] }} />
                    <div className="t-card" style={{ left: '10%', top: '48%', width: '34%', height: '22%', background: k.tokens['--card-bg'] }} />
                    <div className="t-card" style={{ left: '52%', top: '48%', width: '34%', height: '22%', background: k.tokens['--card-bg'] }} />
                    <div className="t-dock" />
                  </div>
                  <div className="th-name">{k.name}</div>
                </div>
              ))}
            </div>
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal(null)}>稍后再说</button>
              <button className="btn" onClick={() => { applySkin(selSkin); setModal(null); useApp.getState().showToast('应用成功') }}>应用风格</button>
            </div>
          </>
        )
      case 'addEngine':
        return (
          <>
            <h2>添加自定义搜索引擎</h2>
            <p className="sub">请输入搜索引擎名称与搜索地址。</p>
            <div className="f-row"><label className="f-label">名称</label>
              <input className="f-input" placeholder="请输入搜索引擎名称" value={engName} onChange={(e) => setEngName(e.target.value)} /></div>
            <div className="f-row"><label className="f-label">图标（可选）</label>
              <div className="btn-row">
                <button className="btn sm ghost" onClick={() => engImgFile.current?.click()}>上传搜索引擎图片</button>
                {engImg !== '' && <span className="tb-tag">已上传</span>}
              </div>
              <input ref={engImgFile} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    const rd = new FileReader()
                    rd.onload = () => setEngImg(String(rd.result ?? ''))
                    rd.readAsDataURL(f)
                  }
                  e.target.value = ''
                }} />
            </div>
            <div className="f-row"><label className="f-label">搜索地址</label>
              <input className="f-input" placeholder="例如百度为 https://www.baidu.com/s?wd=" value={engBase} onChange={(e) => setEngBase(e.target.value)} /></div>
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => {
                const n = engName.trim() || '自定义'
                const base = engBase.trim()
                if (base === '') { useApp.getState().showToast('请填写搜索地址'); return }
                useApp.getState().addEngine({
                  id: `c${Date.now().toString(36)}`, name: n, color: '#0EA5E9', glyph: n.slice(0, 1),
                  base, ...(engImg !== '' ? { img: engImg } : {}),
                })
                setEngName(''); setEngBase(''); setEngImg('')
                setModal(null)
              }}>确定</button>
            </div>
          </>
        )
      case 'log':
        return (
          <>
            <h2>更新记录</h2><p className="sub">当前版本 4.4（v4 重构版）</p>
            {CHANGELOG.map((c) => (
              <div className="log-item" key={c.v}>
                <b>{c.v}<div style={{ fontSize: 11, color: '#9aa4b2', fontWeight: 400 }}>{c.d}</div></b>
                <ul>{c.l.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ))}
            <div className="btn-row end" style={{ marginTop: 16 }}><button className="btn" onClick={() => setModal(null)}>知道了</button></div>
          </>
        )
      case 'about':
        return (
          <>
            <h2>关于我们</h2><p className="sub">Thrilled · 新标签页 4.4</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => useApp.getState().showToast('问题反馈：请联系工作人员')}>问题反馈</button>
              <button className="btn ghost" onClick={() => useApp.getState().showToast('隐私协议：尊重用户的隐私权利')}>隐私协议</button>
              <button className="btn ghost" onClick={() => useApp.getState().showToast('联系作者：请联系工作人员')}>联系作者</button>
            </div>
            <Hint>壁纸来源于互联网，如有侵权请联系工作人员；为保障用户的数据安全与用户体验，请及时备份。</Hint>
            <div className="btn-row end" style={{ marginTop: 16 }}><button className="btn" onClick={() => setModal(null)}>关闭</button></div>
          </>
        )
      case 'backup':
        return (
          <>
            <h2>备份当前界面</h2>
            <p className="sub">立即备份当前界面，备份数据包含布局、图标、小组件与皮肤配置。</p>
            <div className="eng-row"><span style={{ flex: 1 }}>上次备份时间</span><span style={{ color: '#9aa4b2' }}>{backupTime ?? '暂无记录'}</span></div>
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => { markBackedUp(); setModal(null) }}>立即备份当前界面</button>
            </div>
            <Hint>当前为本地备份记录；云端备份在 thrilled-server 接入后可用。</Hint>
          </>
        )
      case 'restore':
        return (
          <>
            <h2>恢复为默认界面</h2>
            <p className="sub">恢复后将覆盖当前布局（回到出厂卡片编排），设置与皮肤保留。</p>

            <SwitchRow l="保留我的网址图标" d="与出厂不重复的图标会追加到最后一页" on={keepIcons} onToggle={() => setKeepIcons(!keepIcons)} />
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => {
                restoreDefault({ keepIcons })
                setModal(null)
              }}>确认恢复</button>
            </div>
          </>
        )
      case 'reset':
        return (
          <>
            <h2>一键重置</h2>
            <p className="sub">将重置选中的本地数据，且不可撤销；彻底清空请用「清除本地数据」。</p>
            <SwitchRow l="图标与布局" on={resetSel.layout} onToggle={() => setResetSel({ ...resetSel, layout: !resetSel.layout })} />
            <SwitchRow l="皮肤与主题" on={resetSel.skins} onToggle={() => setResetSel({ ...resetSel, skins: !resetSel.skins })} />
            <SwitchRow l="壁纸与缓存" on={resetSel.wallpaper} onToggle={() => setResetSel({ ...resetSel, wallpaper: !resetSel.wallpaper })} />
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn danger" onClick={() => {
                resetParts(resetSel)
                setModal(null)
              }}>确认重置</button>
            </div>
          </>
        )
      case 'editItem':
        return item !== null ? <EditCardModal item={item} /> : <h2>编辑卡片</h2>
      default:
        return null
    }
  }
  return (
    <div className="modal-mask show" onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
      <div className={`modal${narrow ? ' narrow' : ''}`}>{body()}</div>
    </div>
  )
}
