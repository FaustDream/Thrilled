/**
 * 抽屉与弹窗（添加 / 个性化 / 设置 + 欢迎 / 引擎 / 编辑卡片 / 备份 / 恢复 / 重置 …）
 * 结构与文案按 docs/v4/02-UI规格.md §8、§6.1、§6.3、§7 与原型冻结内容落地。
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp, type DrawerKey } from './store'
import { WALL_SOURCES, fetchCategories, fetchWallPage, sourceSearchable, wallSourceOf, type WallCategory, type WallPage, type WallPhoto } from '../core/wallsource'
import { askConfirm, askInput } from './dialog'
import { clearWallpaperHistory, findWallpaperBySource, listWallpapers, storeRemoteWallpaper } from '../core/wallpaper'
import { fetchDataUrl, probeRemoteImage } from '../core/fetch-proxy'
import type { WallpaperSource, WallSourceKind } from '../shared/types'
import { WIDGET_DEFS, LIBRARY_LIST, maxSizeOf, minSizeOf, sizeAllowed, sizeAllowedFor } from '../shared/widget-defs'
import { SIZES } from '../shared/grid'
import { BLUR_MAX_PX, WALLPAPER_HISTORY_LIMIT } from '../shared/constants'
import { BLUR_KEYS, GLASS_KEYS } from '../shared/visual'
import { STYLE_PRESETS, isBlankStyle } from '../shared/widget-style'
import { Icon } from './icons'
import { SiteIcon, bool, cfg, dateText, num, p2, str } from './widgets'
import { siteUrlOf, NAVI } from './brands'
import { downloadJson, buildLayoutDoc, restoreSnapshot } from '../core/export'
import { uploadWallpaper, getWallpaper, type BgData } from '../core/wallpaper'
import { readBookmarkTree, collectBookmarks, type BookmarkEntry } from '../core/bookmark-importer'
import { addDays, daysUntil, getGreetingByHour, hostOf, isoWeekOf, monthCells, normalizeSiteUrl, normTodoItems, relTimeText, startOfWeek, type TodoEntry } from '../core/utils'
import { DOCK_DUP_TEXT, DOCK_ICON_OPTIONS, dockAppsWith } from '../shared/dock'
import { nextLunarDate, normCountdownEntries, upcomingRows, type CountdownEntry } from '../core/festivals'
import { cityKeyOf, searchCities, weatherText, type GeoHit, type WeatherData } from '../core/weather'
import { isDayAt, weatherFxOf, type WeatherFx } from '../core/weather-fx'
import { WeatherGlyph, WeatherScene } from './weather-fx'
import { dayKey, normScheduleEvents, upcomingEvents, type ScheduleEvent } from '../core/schedule'
import { almanacOf, festivalsOf, solarToLunar } from '../core/lunar'
import { normModes, readoutOf, type CountdownMode } from '../core/countdown'
import { openLink } from '../core/link-opener'
import { resetAllData } from '../core/reset'
import { saveDoc } from '../core/storage'
import { SHORTCUT_DEFS, comboOf, formatCombo } from '../shared/shortcuts'
import type { BlurKey, CityPick, GlassKey, GridItem, WidgetField, WidgetKind } from '../shared/types'

const DRAWERS: Record<DrawerKey, readonly [string, string]> = {
  /* 添加抽屉不带副标题（标题已说明用途，减少顶部行数——用户反馈） */
  add: ['添加', ''],
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

const SwitchRow = ({ l, d, on, onToggle, extra }: {
  l: string; d?: string; on: boolean; onToggle: () => void; extra?: React.ReactNode
}) => (
  <div className="switch-row">
    <div><span>{l}</span>{d ? <span className="sr-desc">{d}</span> : null}</div>
    <div className="switch-extra">
      {extra}
      <div className={`switch${on ? ' on' : ''}`} onClick={onToggle}><i /></div>
    </div>
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

/**
 * 数值行（原滑杆）：直接填数字，比拖滑杆更准确。
 *
 * - 标签在左、输入框在右，单位跟在输入框后（如「px」「%」「个」「条」）；
 * - 输入过程中允许临时为空 / 越界（否则删到一半就被弹回，没法改），**失焦或回车时**钳到 [min, max] 并落值；
 * - 步长默认 1，小数可选（模糊度这类允许 0.1 档）；
 * - 按上下方向键按步长增减，键盘可直接微调。
 */
const NumberRow = ({ l, info, min, max, value, unit, step = 1, onInput }: {
  l: string; info?: string; min: number; max: number; value: number
  /** 单位后缀（如 px / % / 个 / 条）；空串表示纯数字 */
  unit?: string; step?: number; onInput: (v: number) => void
}) => {
  /* 输入中的原始文本：'' 表示被清空；null 表示未在编辑（显示外部值） */
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  const clamp = (n: number): number => Math.min(max, Math.max(min, n))
  const commit = (): void => {
    const raw = draft
    setDraft(null)
    if (raw === null) return
    const n = Number(raw.trim().replace(/,/g, '.'))
    if (raw.trim() === '' || !Number.isFinite(n)) return
    const v = clamp(step < 1 ? Math.round(n / step) * step : Math.round(n))
    onInput(Number(v.toFixed(step < 1 ? 2 : 0)))
  }
  return (
    <div className="num-row">
      <div className="nr-main">
        <span className="nr-label">{l}{info !== undefined && <InfoDot text={info} />}</span>
        <div className="nr-field">
          <input className="nr-input" type="number" inputMode="decimal"
            min={min} max={max} step={step} value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commit(); (e.currentTarget as HTMLInputElement).blur() }
              if (e.key === 'Escape') setDraft(null)
            }} />
          {unit !== undefined && unit !== '' && <span className="nr-unit">{unit}</span>}
        </div>
      </div>
      <div className="nr-range">{min} – {max}</div>
    </div>
  )
}

/* ---------- 网址导航数据（原创分类命名，04 §6 等价实现；与右键菜单共用，见 brands.ts） ---------- */

/* ============================== 添加 ============================== */

const AddPanel = () => {
  const place = useApp((s) => s.place)
  const placeMany = useApp((s) => s.placeMany)
  const settings = useApp((s) => s.settings)
  const setSetting = useApp((s) => s.setSetting)
  const showToast = useApp((s) => s.showToast)
  const setDrawer = useApp((s) => s.setDrawer)
  const setModal = useApp((s) => s.setModal)
  /* 页签状态放 store：Dock 右键「配置快捷方式」等入口需要先切页签再开抽屉 */
  const tab = useApp((s) => s.addTab)
  const setTab = useApp((s) => s.setAddTab)
  const [cat, setCat] = useState(0)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState('')
  const [toDock, setToDock] = useState(true)
  const [folderName, setFolderName] = useState('')
  const iconFile = useRef<HTMLInputElement | null>(null)
  /* 浏览器书签（网址导航「书签」分类与自定义页「从书签快速添加」共用）：
     抽屉每次打开重新读取；条目是 { label, url } 扁平结构，批量导入直接复用 placeMany（去重 + 自动翻页）通道 */
  const [bm, setBm] = useState<BookmarkEntry[] | null>(null)
  const [showBk, setShowBk] = useState(false)
  const [bkFilter, setBkFilter] = useState('')
  useEffect(() => {
    void (async () => {
      const tree = await readBookmarkTree()
      setBm(tree === null ? [] : collectBookmarks(tree))
    })()
  }, [])

  /* 网址导航分类 = 预设分类 + （有书签时的）书签分类；书签类目下的条目带真实 url */
  const cats = [...NAVI.map((c) => c.c), ...(bm !== null && bm.length > 0 ? ['书签'] : [])]
  const isBmCat = cat >= NAVI.length
  const nvList: readonly { label: string; url: string }[] = isBmCat
    ? (bm ?? []).map((e) => ({ label: e.label, url: e.url }))
    : (NAVI[cat]?.l ?? []).map((n) => ({ label: n, url: '' }))
  /* 自定义页书签快速添加的过滤列表 */
  const bmList = (bm ?? []).filter((e) => bkFilter.trim() === '' || e.label.toLowerCase().includes(bkFilter.trim().toLowerCase()))

  /** 加进 Dock 快捷方式（去重判定在 shared/dock；返回 ok / dup 供调用方提示） */
  const addToDock = (label: string, link: string): 'ok' | 'dup' => {
    const r = dockAppsWith(settings.dockApps, label, link)
    if (!r.ok) return r.reason
    setSetting('dockApps', r.apps)
    return 'ok'
  }

  /** 快捷方式页签「全部加到 Dock」：本地累积后一次性落盘（避免循环内用旧快照互相覆盖） */
  const addAllToDock = (): void => {
    const apps = [...settings.dockApps]
    let ok = 0
    for (const it of nvList) {
      const url = it.url !== '' ? it.url : siteUrlOf(it.label) ?? ''
      if (url === '' || apps.some((a) => a.url === url)) continue
      apps.push({ name: it.label, url })
      ok += 1
    }
    if (ok > 0) setSetting('dockApps', apps)
    showToast(ok > 0 ? `已添加 ${ok} 个快捷方式到 Dock` : '没有可添加的条目（可能已存在）')
  }

  const addCustom = (): void => {
    const label = name.trim() || '未命名'
    /* URL 规则与右键「新建站点」一致：裸域名补 https://，非法输入给提示 */
    const link = normalizeSiteUrl(url)
    if (url.trim() !== '' && link === null) { showToast('请输入有效的网址，例如 baidu.com'); return }
    if (folderName.trim() !== '') {
      // 02 §8：自定义网站可选创建图标格容器
      place('group', { label: folderName.trim(), apps: [label] })
    } else {
      if (link === null) { showToast('请输入网站链接'); return }
      place('icon', { label, url: link, ...(icon !== '' ? { icon } : {}) })
    }
    if (link !== null && toDock) addToDock(label, link)
    setName(''); setUrl(''); setIcon(''); setFolderName('')
    /* 收起抽屉，让新图标 / 容器直接露出来（页签与列表位置仍在 store，下次打开回到原处） */
    setDrawer(null)
  }

  const pickIcon = (f: File | undefined): void => {
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => { setIcon(String(rd.result ?? '')); showToast('图标已就绪') }
    rd.readAsDataURL(f)
  }

  return (
    <>
      <div className="sub-tabs">
        {['网址导航', '自定义', '快捷方式'].map((t, i) => (
          <div key={t} className={`sub-tab${i === tab ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</div>
        ))}
      </div>
      {tab === 0 && (
        <>
          {/* 分类 chips 单行横向滚动（隐藏滚动条），不再折行占两行 */}
          <div className="cats cats-scroll">
            {cats.map((cc, i) => (
              <div key={cc} className={`cat${i === cat ? ' active' : ''}`} onClick={() => setCat(i)}>{cc}</div>
            ))}
          </div>
          {/* 批量操作降为内容区右上角的文字操作，不再独占一行 */}
          <div className="nv-toolbar">
            {/* 书签分类提供「全部导入」——批量导入能力沿用收藏夹导入同一条 placeMany 通道 */}
            <span className="nv-tool" onClick={() => {
              const list = isBmCat ? (bm ?? []) : (NAVI[cat]?.l ?? []).slice(0, 6).map((n) => ({ label: n, url: '' }))
              const n = placeMany(list)
              showToast(isBmCat ? `已从收藏夹导入 ${n} 个网站图标` : `已处理待添加列表，添加 ${n} 个`)
            }}>{isBmCat ? '全部导入' : '批量添加'}</span>
          </div>
          <div className="nv-grid">
            {nvList.map((it) => (
              <div className="nv-item" key={it.label} title={it.url !== '' ? it.url : it.label}
                onClick={() => { place('icon', { label: it.label, url: it.url }); setDrawer(null) }}>
                <SiteIcon url={it.url !== '' ? it.url : siteUrlOf(it.label) ?? ''} name={it.label} cls="nv-ico" fs={18} size={56} />
                <div className="nv-name">{it.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 1 && (
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
          <div className="f-row"><label className="f-label">从书签快速添加</label>
            <div className="btn-row">
              <button className="btn sm ghost" onClick={() => setShowBk(!showBk)}>{showBk ? '收起书签列表' : '展开书签列表'}</button>
            </div>
            {showBk && (
              <>
                <input className="f-input" style={{ marginTop: 8 }} placeholder="输入名称过滤书签" value={bkFilter}
                  onChange={(e) => setBkFilter(e.target.value)} />
                <div className="dt-list" style={{ marginTop: 8 }}>
                  {bmList.length === 0 && <Hint>浏览器收藏夹里没有可添加的 http(s) 书签（开发预览环境没有书签数据，请在扩展中使用）。</Hint>}
                  {bmList.map((e) => (
                    <div className="dt-row" key={e.url}
                      onClick={() => { place('icon', { label: e.label, url: e.url }); showToast(`已添加「${e.label}」快捷方式`); setDrawer(null) }}>
                      <SiteIcon url={e.url} name={e.label} cls="dt-ico" fs={13} size={30} />
                      <span className="dt-name">{e.label}</span>
                      <span className="dt-host">{hostOf(e.url)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <Hint>支持拖拽调整位置与尺寸；确认后会放到当前页的空白位置。</Hint>
          <div className="btn-row end" style={{ marginTop: 14 }}>
            <button className="btn" onClick={addCustom}>确认添加</button>
          </div>
        </>
      )}
      {tab === 2 && (
        <>
          {/* 已添加的 Dock 快捷方式：紧凑 chips 行（点击 × 移除），不占内容区主空间 */}
          <div className="dock-chips">
            <span className="dock-chip-count">已添加 {settings.dockApps.length} 个</span>
            <span className="dock-chip-edit" title="集中改名 / 改网址 / 移除" onClick={() => setModal('dockEdit')}>管理</span>
            {settings.dockApps.map((a, i) => (
              <span className="dock-chip" key={`${a.url}-${i}`} title={a.url}>
                <span>{a.name}</span>
                <i title="从 Dock 移除" onClick={() => {
                  setSetting('dockApps', settings.dockApps.filter((_, j) => j !== i))
                  showToast('已从 Dock 移除')
                }}>×</i>
              </span>
            ))}
          </div>
          <div className="cats cats-scroll">
            {cats.map((cc, i) => (
              <div key={cc} className={`cat${i === cat ? ' active' : ''}`} onClick={() => setCat(i)}>{cc}</div>
            ))}
          </div>
          <div className="nv-toolbar">
            <span className="nv-tool" onClick={addAllToDock}>全部加到 Dock</span>
          </div>
          {/* 点击条目 = 添加为底部 Dock 快捷方式（只做去重判定）；已在 Dock 的置灰，已添加的见顶部 chips */}
          <div className="nv-grid">
            {nvList.map((it) => {
              const url = it.url !== '' ? it.url : siteUrlOf(it.label) ?? ''
              const inDock = url !== '' && settings.dockApps.some((a) => a.url === url)
              return (
                <div className={`nv-item${inDock ? ' dis' : ''}`} key={it.label} title={url !== '' ? url : it.label}
                  onClick={() => {
                    const r = addToDock(it.label, url)
                    showToast(r === 'ok' ? `已添加「${it.label}」到 Dock` : DOCK_DUP_TEXT)
                  }}>
                  <SiteIcon url={url} name={it.label} cls="nv-ico" fs={18} size={56} />
                  <div className="nv-name">{it.label}</div>
                </div>
              )
            })}
          </div>
          <Hint>点击条目添加到底部 Dock 快捷栏（favicon 显示，Dock 图标右键可改名 / 改网址 / 移除）。</Hint>
        </>
      )}
    </>
  )
}

/* ============================== 个性化 ============================== */

/** 分组卡片：0.5px 描边容器，把标题与其设置项圈在同一视觉边界内；danger 用于覆盖 / 删除类操作的分组（红色标识） */
const SecCard = ({ t, info, danger = false, children }: {
  t: string; info?: string | undefined; danger?: boolean; children: React.ReactNode
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

/** 字节数转可读体积（dataURL 长度 ×0.75 还原为原始字节，与写入侧上限算法一致） */
const readableSize = (dataUrl: string): string => {
  const mb = (dataUrl.length * 0.75) / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round((dataUrl.length * 0.75) / 1024))} KB`
}

/* ---------- 外部壁纸浏览（来源切换 + 分类 + 分页 + 一键设为壁纸） ---------- */

/** 拉取来源分类清单（061129 / 哲风在线取站方分类，其余为静态结构或空） */
const useWallCategories = (src: WallpaperSource | undefined): { cats: WallCategory[]; state: 'loading' | 'ok' | 'error' } => {
  const [cats, setCats] = useState<WallCategory[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => {
    if (src === undefined) return
    let alive = true
    setState('loading')
    fetchCategories(src)
      .then((list) => { if (alive) { setCats(list); setState('ok') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [src?.kind, src?.apiBase])
  return { cats, state }
}

/** 拉取一页外部壁纸（源 / 分类 / 页码 / 重试次数变化时刷新；重试跳过 30 分钟缓存） */
const useWallPage = (src: WallpaperSource | undefined, cat: string, page: number, query: string, retry: number): { data: WallPage | null; state: 'loading' | 'ok' | 'error' } => {
  const [data, setData] = useState<WallPage | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => {
    if (src === undefined) return
    let alive = true
    setState('loading')
    fetchWallPage(src, cat, page, query, retry > 0)
      .then((res) => { if (alive) { setData(res); setState('ok') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [src, cat, page, query, retry])
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
const WallTaskOverlay = ({ t, srcName, onCancel }: { t: ApplyTask; srcName: string; onCancel: () => void }) => {
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
        {/* 大图下载可能要几十秒：给一个明确的出口 */}
        {t.stage === 0 && t.reused === false && (
          <button className="btn sm ghost wl-cancel" onClick={onCancel}>取消</button>
        )}
      </div>
    </div>
  )
}

/** 壁纸网格 + 分页（缩略图 <img> 直连加载；点击原图下载落地后应用） */
const WallPhotos = ({ data, state, page, onPage, onApply, onRetry }: {
  data: WallPage | null; state: 'loading' | 'ok' | 'error'; page: number
  onPage: (p: number) => void; onApply: (p: WallPhoto) => void; onRetry: () => void
}) => {
  /* 缩略图直连失败（防盗链 / 域名被墙）时做占位，不留一格空白 */
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())
  const markBroken = (id: string): void => setBroken((prev) => new Set(prev).add(id))
  return (
    <>
      <div className="wall-grid">
        {state === 'loading' && <div className="empty-box" style={{ gridColumn: '1 / -1' }}>加载中…</div>}
        {state === 'error' && (
          <div className="empty-box" style={{ gridColumn: '1 / -1' }}>
            <div>获取失败：来源地址不可达，或当前环境直连受跨域限制</div>
            <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={onRetry}>重试</button>
          </div>
        )}
        {(state === 'ok' ? (data?.photos ?? []) : []).map((p) => (
          <div key={p.id} className="wall-thumb" title={p.title || p.author} onClick={() => onApply(p)}>
            {broken.has(p.id)
              ? <span className="wall-thumb-ph">缩略图加载失败</span>
              : <img src={p.thumb} alt={p.id} loading="lazy" onError={() => markBroken(p.id)} />}
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
}

/** 每个来源记住自己的浏览位置（分类 / 页码 / 搜索词），切回来接着看 */
const browseMemory = new Map<WallSourceKind, { cat: string; page: number; query: string }>()

/** 来源浏览区：分类筛选 → 壁纸网格（预览对象由外部来源列表驱动，无启用来源时不渲染） */
const WallBrowser = ({ src }: { src: WallpaperSource | undefined }) => {
  const setWallpaperRef = useApp((st) => st.setWallpaperRef)
  const showToast = useApp((st) => st.showToast)
  const { cats, state: catState } = useWallCategories(src)
  const [catKey, setCatKey] = useState('')
  const cat = cats.some((c) => c.key === catKey) ? catKey : (cats[0]?.key ?? 'all')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState('')
  const [task, setTask] = useState<ApplyTask | null>(null)
  const startedAt = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const [qInput, setQInput] = useState('')
  const { data, state } = useWallPage(src, cat, page, query, retry)

  /** 三段式应用：下载（带字节进度、可取消）→ 处理（校验 + 入库）→ 应用（写设置并渲染） */
  const apply = async (p: WallPhoto): Promise<void> => {
    if (busy !== '') return
    setBusy(p.full)
    startedAt.current = Date.now()
    setTask({ name: p.title || p.author || '当前壁纸', thumb: p.thumb, stage: 0, loaded: 0, total: 0, reused: false })
    const move = (patch: Partial<ApplyTask>): void => {
      setTask((t) => (t === null ? null : { ...t, ...patch }))
    }
    const ac = new AbortController()
    abortRef.current = ac
    try {
      /* 同一张图下过就跳过整段下载：键是源地址哈希，命中即复用已有记录 */
      const hit = await findWallpaperBySource(p.full)
      if (hit !== null) {
        move({ stage: 2, reused: true })
        setWallpaperRef(hit.ref)
        await sleep(APPLY_STAGE_HOLD_MS)
        return
      }
      /* 先探体积与类型：几千像素的原图动辄几十 MB，白下完再拒绝体验太差 */
      await probeRemoteImage(p.full, ac.signal)
      if (ac.signal.aborted) throw new Error('已取消下载')
      const dataUrl = await fetchDataUrl(p.full, (loaded, total) => move({ loaded, total }), ac.signal)
      /* 扩展环境经后台代理下载时无法中途断流，这里再判一次，取消后不再入库 */
      if (ac.signal.aborted) throw new Error('已取消下载')
      move({ stage: 1 })
      const stored = await storeRemoteWallpaper(p.full, dataUrl, src?.name ?? '外部来源')
      move({ stage: 2 })
      setWallpaperRef(stored.ref)
      if (stored.pruned > 0) showToast(`已替换最旧的 ${stored.pruned} 张历史壁纸`)
      await sleep(APPLY_STAGE_HOLD_MS)
    } catch (e) {
      showToast(ac.signal.aborted ? '已取消下载' : `设为壁纸失败：${(e as Error).message}`)
    } finally {
      abortRef.current = null
      await sleep(Math.max(0, FEEDBACK_MIN_MS - (Date.now() - startedAt.current)))
      setTask(null)
      setBusy('')
    }
  }

  /* 切换来源：先存下当前来源的浏览位置，再恢复目标来源上次停的位置 */
  const srcKind = src?.kind
  const lastKind = useRef(srcKind)
  useEffect(() => {
    const prev = lastKind.current
    if (prev !== undefined && prev !== srcKind) browseMemory.set(prev, { cat: catKey, page, query })
    const mem = srcKind === undefined ? undefined : browseMemory.get(srcKind)
    setCatKey(mem?.cat ?? '')
    setPage(mem?.page ?? 1)
    setQuery(mem?.query ?? '')
    setQInput(mem?.query ?? '')
    setRetry(0)
    lastKind.current = srcKind
  }, [srcKind])

  if (src === undefined) return null

  const searchable = sourceSearchable(src.kind)
  /* 只有一档（或站方没给分类）时不占一行：必应 / picsum 的浏览区直接从网格开始 */
  const showCats = catState === 'ok' && cats.length > 1
  return (
    <>
      {searchable && (
        <div className="f-row" style={{ marginTop: 10, marginBottom: 4 }}>
          <input className="f-input" placeholder="输入关键词搜索，回车确认" value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setQuery(qInput.trim()); setPage(1) } }} />
        </div>
      )}
      {showCats && (
        <div className="cats">
          {cats.map((c) => (
            <div key={c.key} className={`cat${c.key === cat ? ' active' : ''}`}
              onClick={() => { setCatKey(c.key); setPage(1) }}>{c.label}</div>
          ))}
        </div>
      )}
      <div className="wall-stage">
        <WallPhotos data={data} state={state} page={page} onPage={setPage}
          onApply={(p) => { void apply(p) }}
          onRetry={() => setRetry((n) => n + 1)} />
        {task !== null && (
          <WallTaskOverlay t={task} srcName={src.name} onCancel={() => abortRef.current?.abort()} />
        )}
      </div>
    </>
  )
}

/* ---------- 个性化 → 组件库：页面已放置的组件（排序 / ···）+ 目录（常用 / 时间 / 信息 / 图标 分组浏览） ---------- */

/** 稳定的空页引用（避免选择器每次返回新数组） */
const EMPTY_PAGE: GridItem[] = []

/**
 * 组件库：管「放什么」——已放置的「页面组件」与「页面图标」分成两张卡（各自拖拽排序），
 * 下面是目录（单张清单平铺全部小组件，按钮态区分已添加 / 未添加）与「组件默认大小」。
 * 行尾用图标按钮直接编辑 / 移除，不再收进 ··· 二级菜单；单个实例的尺寸在编辑弹窗里改。
 */
const ComponentLibraryTab = () => {
  const pages = useApp((st) => st.pages)
  const cur = useApp((st) => st.cur)
  const place = useApp((st) => st.place)
  const remove = useApp((st) => st.remove)
  const reorderItems = useApp((st) => st.reorderItems)
  const setModal = useApp((st) => st.setModal)
  const setDrawer = useApp((st) => st.setDrawer)
  const goPage = useApp((st) => st.goPage)
  const [dragId, setDragId] = useState<string | null>(null)
  const page = pages[cur] ?? EMPTY_PAGE
  /* 该类型落在哪一页：任意页存在即算已添加；在别页的给一个「第 N 页」入口，而不是让人自己翻 */
  const pageOfKind = new Map<WidgetKind, number>()
  pages.forEach((pg, i) => {
    for (const it of pg) if (!pageOfKind.has(it.t)) pageOfKind.set(it.t, i)
  })
  /** 配置：复用编辑弹窗（打开弹窗前先定位到该实例） */
  const openConfig = (id: string): void => {
    useApp.setState({ itemId: id })
    setModal('editItem')
  }
  const iconLike = (t: WidgetKind): boolean => t === 'icon' || t === 'folder' || t === 'group'
  const widgets = page.filter((it) => !iconLike(it.t))
  const icons = page.filter((it) => iconLike(it.t))
  /** 拖到目标行之前：只在整页顺序里做一次插入，两张卡共用同一份顺序 */
  const moveBefore = (from: string, target: string): void => {
    if (from === target) return
    const ids = page.map((x) => x.id).filter((x) => x !== from)
    const at = ids.indexOf(target)
    ids.splice(at < 0 ? ids.length : at, 0, from)
    reorderItems(ids)
  }
  /** 列表行：拖动把手 → 图标 → 名称 → 编辑 / 移除（两个图标按钮，不占文字宽度） */
  const rowOf = (it: GridItem) => {
    const def = WIDGET_DEFS[it.t]
    /* 名称为空（含出厂留空）时回退组件显示名：列表行不能只剩一个字形 */
    const label = str(cfg(it)['label']).trim() === '' ? def.n : String(cfg(it)['label'])
    return (
      <div className="eng-row sortable" key={it.id} draggable
        onDragStart={() => setDragId(it.id)}
        onDragEnd={() => setDragId(null)}
        onDragOver={(ev) => { if (dragId !== null) ev.preventDefault() }}
        onDrop={() => { if (dragId !== null) moveBefore(dragId, it.id); setDragId(null) }}>
        <span style={{ color: 'var(--panel-sub)', cursor: 'grab' }}>⋮⋮</span>
        <div className="er-ico" style={{ background: def.c }}>{def.g}</div>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span className="row-acts">
          <span className="ov-btn" title="编辑" onClick={() => openConfig(it.id)}>{Icon.edit()}</span>
          <span className="ov-btn" title="移除" onClick={() => remove(it.id)}>{Icon.trash()}</span>
        </span>
      </div>
    )
  }
  return (
    <>
      <SecCard t="页面组件" info={`当前第 ${cur + 1} 页的小组件：行首 ⋮⋮ 拖动只调整列表顺序（页面上的位置仍在页面里拖动）；行尾铅笔直接编辑（尺寸也在编辑弹窗里改），垃圾桶移除。`}>
        {widgets.length === 0
          ? <div className="empty-box">{Icon.plus()}<div>页面暂无小组件，从下面挑一个</div></div>
          : widgets.map(rowOf)}
      </SecCard>
      <SecCard t="页面图标" info="网站图标 / 图标文件夹 / 图标格容器：拖动调整顺序，铅笔改名称与网址，垃圾桶移除。新增在页面空白处右键。">
        {icons.length === 0
          ? <div className="empty-box">{Icon.plus()}<div>暂无图标，到页面空白处右键添加</div></div>
          : icons.map(rowOf)}
      </SecCard>
      <SecCard t="组件库" info="全部小组件放在同一张清单里，不再按类型分组；已在本页的显示「已添加」，在其它页的显示所在页并可直接跳过去。图标类（网站图标 / 图标文件夹 / 图标格容器）不是小组件，从空白处右键添加。">
        {LIBRARY_LIST.map((w) => {
          const at = pageOfKind.get(w.t)
          const here = at === cur
          return (
            <div className="eng-row" key={w.t}>
              <div className="er-ico" style={{ background: w.c }}>{w.g}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{w.n}</div>
                <div className="sr-desc" style={{ color: 'var(--panel-sub)', fontSize: 11 }}>{w.s}</div>
              </div>
              {at !== undefined && !here
                ? (
                  <button className="btn sm ghost" title={`「${w.n}」在第 ${at + 1} 页，点击跳过去`}
                    onClick={() => { goPage(at); setDrawer(null) }}>第 {at + 1} 页</button>
                )
                : (
                  <button className={`btn sm${here ? ' ghost' : ''}`} disabled={here}
                    title={here ? '该组件已在当前页；在上方「页面组件」列表移除后可再次添加' : '添加到当前页'}
                    onClick={() => { place(w.t); setDrawer(null) }}>{here ? '已添加' : '添加'}</button>
                )}
            </div>
          )
        })}
      </SecCard>
    </>
  )
}

/**
 * Dock 快捷方式集中管理：逐行改名称 / 网址 / 移除
 * 原先只能回页面右键一条条改；草稿态，点「保存」才写入，网址不合法的行按删除处理。
 */
const DockEditModal = () => {
  const setModal = useApp((s) => s.setModal)
  const setSetting = useApp((s) => s.setSetting)
  const showToast = useApp((s) => s.showToast)
  const apps = useApp((s) => s.settings.dockApps)
  const [draft, setDraft] = useState<{ name: string; url: string }[]>(() => apps.map((a) => ({ ...a })))
  const patch = (i: number, p: Partial<{ name: string; url: string }>): void =>
    setDraft((d) => d.map((a, j) => (j === i ? { ...a, ...p } : a)))
  const save = (): void => {
    const next = draft
      .map((a) => ({ name: a.name.trim(), url: a.url.trim() }))
      .filter((a) => /^https?:\/\//.test(a.url))
    setSetting('dockApps', next)
    setModal(null)
    showToast(`已保存 ${next.length} 个 Dock 快捷方式`)
  }
  return (
    <>
      <h2>管理 Dock 快捷方式</h2>
      <p className="sub">逐行改名称与网址；网址留空或不是 http(s) 开头的行会被丢掉。数量不设上限，放不下时可在个性化 →「搜索与 Dock」把图标调小一档。</p>
      {draft.length === 0 && <div className="empty-box">Dock 里还没有快捷方式，去「快捷方式」页签挑一个</div>}
      {draft.map((a, i) => (
        <div className="dock-edit-row" key={`${a.url}-${i}`}>
          <input className="f-input" value={a.name} placeholder="名称" onChange={(e) => patch(i, { name: e.target.value })} />
          <input className="f-input" value={a.url} placeholder="https://" onChange={(e) => patch(i, { url: e.target.value })} />
          <span className="ov-btn" title="移除" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>{Icon.trash()}</span>
        </div>
      ))}
      <div className="btn-row end">
        <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
        <button className="btn" onClick={save}>保存</button>
      </div>
    </>
  )
}

/** 个性化面板导航页签（分组导航，避免单页堆全部设置）
 *  「背景效果」= 主题（主题 + 显示）→ 全局效果 → 各控件单独设置 → 壁纸与文字 → 搜索与 Dock
 *  「组件库」= 放什么组件 */
const PANEL_TABS: readonly string[] = ['壁纸', '背景效果', '组件库']

const PersonalPanel = () => {
  const s = useApp((st) => st.settings)
  const setSetting = useApp((st) => st.setSetting)
  const toggle = useApp((st) => st.toggle)
  const setGlass = useApp((st) => st.setGlass)
  const setBlur = useApp((st) => st.setBlur)
  const applyGlobalGlass = useApp((st) => st.applyGlobalGlass)
  const applyGlobalBlur = useApp((st) => st.applyGlobalBlur)
  const applySkin = useApp((st) => st.applySkin)
  const skins = useApp((st) => st.skins)
  const setWallpaperRef = useApp((st) => st.setWallpaperRef)
  const setWallSource = useApp((st) => st.setWallSource)
  const showToast = useApp((st) => st.showToast)
  /* 页签状态放 store：首次引导与外部入口需要先切页签再开抽屉 */
  const tab = useApp((st) => st.personalTab)
  const setTab = useApp((st) => st.setPersonalTab)
  const [prevWallRef, setPrevWallRef] = useState<string | null>(null)
  const [wall, setWall] = useState<BgData | null>(null)
  const wallFile = useRef<HTMLInputElement | null>(null)
  /* 透明度 11 项：前六项是玻璃底色，后五项是元素显隐强度（说明即各自的作用范围） */
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
  /* 全局玻璃度 / 模糊度：取六项玻璃底色的平均值作为滑杆当前值 */
  const globalGlass = Math.round((GLASS_KEYS.reduce((sum, k) => sum + s.glass[k], 0) / GLASS_KEYS.length) * 100)
  const globalBlur = Math.round((BLUR_KEYS.reduce((sum, k) => sum + s.blur[k], 0) / BLUR_KEYS.length) * 10) / 10

  const upload = async (f: File | undefined): Promise<void> => {
    if (!f) return
    try {
      const stored = await uploadWallpaper(f)
      if (stored.ref !== null) {
        setPrevWallRef(s.wallpaperRef)
        setWallpaperRef(stored.ref)
        if (stored.pruned > 0) showToast(`已替换最旧的 ${stored.pruned} 张历史壁纸`)
      }
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  /** 外链上传：先问地址（应用内输入框 + 行内校验），再拉取并落地 */
  const useLinkWall = (): void => {
    void askInput({
      title: '外链上传壁纸', label: '图片或视频地址', placeholder: 'https://', confirmText: '获取',
      validate: (v) => (/^https?:\/\//.test(v) ? null : '地址需以 http(s):// 开头'),
    }).then((u) => {
      if (u === null) return
      void fetch(u)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
        .then((b) => upload(new File([b], 'link', { type: b.type })))
        .catch(() => showToast('外链获取失败，请检查地址是否允许跨域'))
    })
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

  /* 当前浏览的来源：内置五选一，随设置持久化（没有启用 / 禁用与自定义） */
  const preview = wallSourceOf(s.wallSource)

  /* 可清理的历史 = 除当前使用中那张以外的全部记录（当前壁纸不参与清理） */
  const otherWallCount = history.filter((h) => h.ref !== s.wallpaperRef).length

  /** 一键清空历史壁纸记录：保留当前使用中的那张，删除本机已下载的其余图片 */
  const clearWallHistory = async (): Promise<void> => {
    if (otherWallCount === 0) return
    const ok = await askConfirm({
      title: '清空历史壁纸',
      message: `将清空 ${otherWallCount} 张历史壁纸记录（当前壁纸保留），已下载的图片会从本机删除，且不可撤销。`,
      confirmText: '清空', danger: true,
    })
    if (!ok) return
    const removed = await clearWallpaperHistory()
    setHistory(await listWallpapers())
    showToast(removed === 0 ? '没有可清理的历史壁纸' : `已清空历史壁纸（${removed} 张）`)
  }

  return (
    <>
      <DrawerTabs tabs={PANEL_TABS} value={tab} onChange={setTab} />
      {tab === 0 && (
      <SecCard t="壁纸" info="图片最大 5MB（视频同限）。下方是在线壁纸来源（全部内置、无需添加）：点来源名切换，再点分类筛选；带搜索框的来源可直接输关键词。">
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
        {otherWallCount > 0 && (
          <>
            <div className="wp-hist-head" style={{ marginTop: 12 }}>
              <span className="sr-desc">历史壁纸（保留最近 {WALLPAPER_HISTORY_LIMIT} 张，点缩略图直接切换）</span>
              <button className="btn sm ghost" onClick={() => void clearWallHistory()}>清空历史</button>
            </div>
            {history.length > 1 && (
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
            )}
          </>
        )}
        <div className="cats" style={{ marginTop: 12 }}>
          {WALL_SOURCES.map((ws) => (
            <div key={ws.kind} className={`cat${ws.kind === s.wallSource ? ' active' : ''}`}
              title={`切换到「${ws.name}」`}
              onClick={() => setWallSource(ws.kind)}>{ws.name}</div>
          ))}
        </div>
        <WallBrowser src={preview} />
      </SecCard>
      )}
      {tab === 1 && (
      <>
      <SecCard t="主题" info="经典 = 浅色配色，暗黑 = 深色配色。页面内容的显隐也在这一组里。">
        <div className="theme-grid theme-grid-2">
          {skins.map((k) => (
            <div key={k.id} className={`theme-btn${k.id === s.skinId ? ' sel' : ''}`} onClick={() => applySkin(k.id)}>
              <MiniSkinPreview tokens={k.tokens} />
              <div className="tb-name">{k.name}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 14 }} />
        {/* 时间颜色：空串 = 跟随主题。切主题后不会因为写死的深色而在暗色底上消失 */}
        <ColorField label="时间颜色" value={s.clockColor === '' ? '#1f2937' : s.clockColor} auto="跟随主题"
          onAuto={() => setSetting('clockColor', '')} onChange={(hex) => setSetting('clockColor', hex)} />
        <div style={{ height: 10 }} />
        <SwitchRow l="隐藏顶部区域" d="隐藏左上角模式胶囊" on={s.hideTop} onToggle={() => toggle('hideTop')} />
        <SwitchRow l="隐藏搜索框" on={s.hideSearch} onToggle={() => toggle('hideSearch')} />
      </SecCard>
      <SecCard t="全局效果" info="一次调好整页观感：下面三项会同时写入所有控件，之后再按控件单独微调。">
        <NumberRow l="全局透明度" info="0% 完全不透明、100% 完全透明；会与各控件自己的透明度叠加" min={20} max={100}
          value={Math.round(s.gAlpha * 100)} unit="%"
          onInput={(v) => setSetting('gAlpha', v / 100)} />
        <NumberRow l="全局玻璃度" info="卡片 / 图标容器 / Dock / 搜索框 / 面板 / 菜单的玻璃底色一起调" min={0} max={100}
          value={globalGlass} unit="%" onInput={(v) => applyGlobalGlass(v / 100)} />
        <NumberRow l="全局模糊度" info="六处毛玻璃半径一起调，0px 即整体关闭毛玻璃" min={0} max={BLUR_MAX_PX} step={0.1}
          value={globalBlur} unit="px" onInput={(v) => applyGlobalBlur(v)} />
      </SecCard>
      <SecCard t="透明度" info="按控件单独设置。玻璃底色类保留可读下限（调到最低仍可辨认），元素显隐类可直接调到消失。">
        {GLASS.map(([k, l, d]) => (
          <NumberRow key={k} l={l} info={d} min={0} max={100} value={Math.round(s.glass[k] * 100)}
            unit="%" onInput={(v) => setGlass(k, v / 100)} />
        ))}
      </SecCard>
      <SecCard t="毛玻璃模糊" info="按控件单独设置：与透明度分开，只降透明度不调模糊，背景会「透但看不清」、观感发脏。0px 即关闭该处毛玻璃。">
        {BLUR.map(([k, l, d]) => (
          <NumberRow key={k} l={l} info={d} min={0} max={BLUR_MAX_PX} value={s.blur[k]} step={0.1}
            unit="px" onInput={(v) => setBlur(k, v)} />
        ))}
      </SecCard>
      <SecCard t="壁纸与文字" info="自动对比按壁纸每处的明暗自适应：图标墨色、字形背后的软底衬与外圈描边，以及壁纸明暗交错时补的遮罩。关掉后下面两项完全按设定的值走。">
        <SwitchRow l="自动对比" d="亮壁纸自动用深墨、暗壁纸用浅墨；对比不够时垫一层软底衬 + 外圈描边，壁纸明暗交错时再补一点遮罩"
          on={s.autoContrast} onToggle={() => setSetting('autoContrast', !s.autoContrast)} />
        <NumberRow l={s.autoContrast ? '壁纸遮罩（基准值）' : '壁纸遮罩'} min={0} max={100} value={Math.round(s.cover * 100)} unit="%"
          onInput={(v) => setSetting('cover', v / 100)} />
        <div style={{ height: 12 }} />
        <ColorField label="字体颜色" value={s.fontColor === '' ? '#1f2937' : s.fontColor} auto="跟随主题"
          onAuto={() => setSetting('fontColor', '')} onChange={(hex) => setSetting('fontColor', hex)} />
      </SecCard>
      <SecCard t="搜索与 Dock" info="搜索框与 Dock 的外观参数——与背景效果同域，故并入本页签。">
        <NumberRow l="搜索框宽度" min={400} max={1400} value={s.searchWidth} unit="px" onInput={(v) => setSetting('searchWidth', v)} />
        <NumberRow l="搜索框圆角" min={0} max={25} value={s.searchRadius} unit="px" onInput={(v) => setSetting('searchRadius', v)} />
        <SwitchRow l="沉浸式搜索框" d="与壁纸融合的透明样式" on={s.immersive} onToggle={() => toggle('immersive')} />
        <SwitchRow l="极简模式用线框样式" on={s.simpleSearch} onToggle={() => toggle('simpleSearch')} />
        <div className="num-row">
          <div className="nr-main">
            <span className="nr-label">Dock 图标大小</span>
            <div className="cats" style={{ margin: 0 }}>
              {DOCK_ICON_OPTIONS.map((o) => (
                <div key={o.k} className={`cat${s.dockIconSize === o.k ? ' active' : ''}`}
                  onClick={() => setSetting('dockIconSize', o.k)}>{o.n}</div>
              ))}
            </div>
          </div>
        </div>
        <SwitchRow l="圆形 Dock 图标" on={s.dockIcon === 'circle'}
          onToggle={() => setSetting('dockIcon', s.dockIcon === 'circle' ? 'rect' : 'circle')} />
        <SwitchRow l="Dock 快捷栏" d="隐藏底部快捷栏" on={s.mascot} onToggle={() => toggle('mascot')} />
      </SecCard>
      </>
      )
      }

      {tab === 2 && <ComponentLibraryTab />}
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
 * 分区顺序 = 使用频率 × 风险：搜索（高频）→ 通用（常用偏好）→ 数据（低频动作）→ 关于（只读参考）。
 * 卡片内主次排布：可即时生效的开关与单选项常驻卡片主体；低频动作退到卡片底部按钮行；
 * 说明文案统一收进标题右侧 ⓘ 气泡；覆盖 / 删除类操作单独成卡并标红，不与常规操作混排。
 */
const SETTING_TABS: readonly string[] = ['搜索', '通用', '数据', '关于']

/** 快捷键设置卡片：动作清单 + 点键帽采集新组合键（Esc 取消 / Backspace 清除 / 冲突提示） */
const ShortcutCard = () => {
  const shortcuts = useApp((st) => st.settings.shortcuts)
  const setShortcut = useApp((st) => st.setShortcut)
  const resetShortcuts = useApp((st) => st.resetShortcuts)
  const showToast = useApp((st) => st.showToast)
  const [capId, setCapId] = useState<string | null>(null)
  useEffect(() => {
    if (capId === null) return
    /* 采集态在捕获阶段拦下按键：不被页面的动作分发吃掉，同时阻止浏览器默认行为 */
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setCapId(null); return }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setShortcut(capId, '')
        setCapId(null)
        showToast('已清除该快捷键')
        return
      }
      const combo = comboOf(e)
      if (combo === null) return
      const conflict = SHORTCUT_DEFS.find((s) => s.id !== capId && shortcuts[s.id] === combo)
      if (conflict !== undefined) {
        showToast(`与「${conflict.label}」冲突，请换一组键`)
        return
      }
      setShortcut(capId, combo)
      setCapId(null)
      showToast(`已设为 ${formatCombo(combo)}`)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [capId, shortcuts, setShortcut, showToast])
  return (
    <>
      {SHORTCUT_DEFS.map((s) => {
        const cap = capId === s.id
        const combo = shortcuts[s.id] ?? ''
        return (
          <div className="eng-row" key={s.id}>
            <span style={{ flex: 1 }}>{s.label}</span>
            <button className={`kbd kbd-btn${cap ? ' cap' : ''}${combo === '' ? ' off' : ''}`}
              title={cap ? '按 Esc 取消' : '点击后按下新的组合键'}
              onClick={() => setCapId(cap ? null : s.id)}>
              {cap ? '按下组合键…' : combo === '' ? '未设置' : formatCombo(combo)}
            </button>
          </div>
        )
      })}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn sm ghost" onClick={resetShortcuts}>恢复默认</button>
      </div>
      <Hint>点右侧键帽后按下新的组合键即可改键：Esc 取消、Backspace 清除，与其他动作冲突时不会生效。搜索框内回车执行搜索、双击每日一言卡换鼓励语为固定操作，不可改。</Hint>
    </>
  )
}

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
  const setSetting = useApp((st) => st.setSetting)
  const history = useApp((st) => st.history)
  const clearHistory = useApp((st) => st.clearHistory)
  const setHistoryLimit = useApp((st) => st.setHistoryLimit)
  /* 占位文字的默认值提示用当前引擎名 */
  const engineName = useApp((st) => st.engines.find((e) => e.id === st.settings.engineId)?.name ?? '搜索')
  return (
    <>
      <SecCard t="搜索引擎" info="拖动行首 ⋮⋮ 排序；隐藏的引擎不出现在搜索框下拉与右键二级菜单里。">
        <EngineRows />
      </SecCard>
      <SecCard t="搜索框" info="本项目不做搜索联想：输入时不出候选词，只在开启搜索历史时展示历史记录。">
        <div className="f-row"><label className="f-label">占位文字</label>
          <input className="f-input" value={s.searchPlaceholder} placeholder={`留空则显示「${engineName} 搜索」`}
            onChange={(e) => setSetting('searchPlaceholder', e.target.value)} /></div>
        <SwitchRow l="隐藏引擎图标" d="搜索框左侧只留输入区；切换引擎改到设置或右键菜单" on={s.hideEngineIco} onToggle={() => toggle('hideEngineIco')} />
        <div className="f-row"><label className="f-label">点引擎图标时</label>
          <div className="cats">
            <div className={`cat${s.engineIcoAct === 'panel' ? ' active' : ''}`} onClick={() => setSetting('engineIcoAct', 'panel')}>展开引擎列表</div>
            <div className={`cat${s.engineIcoAct === 'cycle' ? ' active' : ''}`} onClick={() => setSetting('engineIcoAct', 'cycle')}>切换到下一个</div>
          </div>
        </div>
        <SwitchRow l="自动聚焦" d="打开新标签时自动聚焦搜索框" on={s.autoFocus} onToggle={() => toggle('autoFocus')} />
        <SwitchRow l="保留搜索内容" d="搜索后不清空输入框内容" on={s.searchKeep} onToggle={() => toggle('searchKeep')} />
        <SwitchRow l="隐藏搜索按钮" d="仅通过 Enter 键触发搜索" on={s.hideBtn} onToggle={() => toggle('hideBtn')} />
        {/* 一键清空贴着「搜索历史」放：开关旁边就是清理入口，不必滚到卡片底部 */}
        <SwitchRow l="搜索历史" d="关闭后搜索框不再弹出任何下拉" on={s.searchHistory} onToggle={() => toggle('searchHistory')}
          extra={(
            <button className="btn sm ghost" disabled={history.length === 0} onClick={clearHistory}>
              清空{history.length > 0 ? `（${history.length} 条）` : ''}
            </button>
          )} />
        <NumberRow l="历史保留条数" min={4} max={20} value={s.historyLimit} unit="条"
          onInput={setHistoryLimit} />
        <SwitchRow l="显示单条删除" d="历史面板每行右侧的 × 按钮" on={s.historyItemDel} onToggle={() => toggle('historyItemDel')} />
        <SwitchRow l="搜索后自动失焦" d="回车或点放大镜搜索后收起光标与历史面板" on={s.blurAfterSearch} onToggle={() => toggle('blurAfterSearch')} />
        <NumberRow l="字号" min={13} max={20} value={s.searchFontSize} unit="px"
          info="只作用于标准模式；极简模式在此值上再加 1px" onInput={(v) => setSetting('searchFontSize', v)} />
        <NumberRow l="距顶距离" min={20} max={44} value={s.searchTop} unit="px"
          info="只能往上收：网格下方到 Dock 已排满，往下移会让卡片压到 Dock" onInput={(v) => setSetting('searchTop', v)} />
        <div className="f-row"><label className="f-label">回车时打开方式</label>
          <div className="cats">
            <div className={`cat${s.searchEnterMode === 'inherit' ? ' active' : ''}`} onClick={() => setSetting('searchEnterMode', 'inherit')}>跟随全局</div>
            <div className={`cat${s.searchEnterMode === 'link' ? ' active' : ''}`} onClick={() => setSetting('searchEnterMode', 'link')}>本窗口</div>
            <div className={`cat${s.searchEnterMode === 'tab' ? ' active' : ''}`} onClick={() => setSetting('searchEnterMode', 'tab')}>新标签页</div>
            <div className={`cat${s.searchEnterMode === 'search' ? ' active' : ''}`} onClick={() => setSetting('searchEnterMode', 'search')}>本窗口搜索</div>
          </div>
        </div>
        <div className="f-row"><label className="f-label">点放大镜时</label>
          <div className="cats">
            <div className={`cat${s.searchBtnMode === 'inherit' ? ' active' : ''}`} onClick={() => setSetting('searchBtnMode', 'inherit')}>跟随全局</div>
            <div className={`cat${s.searchBtnMode === 'link' ? ' active' : ''}`} onClick={() => setSetting('searchBtnMode', 'link')}>本窗口</div>
            <div className={`cat${s.searchBtnMode === 'tab' ? ' active' : ''}`} onClick={() => setSetting('searchBtnMode', 'tab')}>新标签页</div>
            <div className={`cat${s.searchBtnMode === 'search' ? ' active' : ''}`} onClick={() => setSetting('searchBtnMode', 'search')}>本窗口搜索</div>
          </div>
        </div>
      </SecCard>
    </>
  )
}

/** 通用分区：打开方式（互斥单选，一行胶囊表达）→ 组件对齐（网格对齐线开关） */
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
      <SecCard t="对齐辅助" info="拖拽卡片时以网格为基准落位（卡片始终落在格上）；若与同页其它卡片的边缘或中心接近，则优先吸附到对齐位置——拖拽中会显示贯穿参考线并高亮目标卡片，没有可对齐的卡片时按最近的网格格落位。">
        <SwitchRow l="组件吸附" d="与其它卡片的边缘 / 中心对齐时优先吸附过去（阈值约 0.3 格）" on={s.snapItems} onToggle={() => setSetting('snapItems', !s.snapItems)} />
        <SwitchRow l="显示对齐参考线" d="吸附到其它卡片时显示贯穿参考线并高亮目标卡片" on={s.showGuides} onToggle={() => setSetting('showGuides', !s.showGuides)} />
        <SwitchRow l="显示网格对齐线" d="按 24×10 网格常显对齐线；拖拽与添加组件时强制显示" on={s.gridLines} onToggle={() => setSetting('gridLines', !s.gridLines)} />
      </SecCard>
      <SecCard t="图标名称" info="网站图标的字形相似或重复时用来辨认每个图标代表哪个站点。悬停提示默认开启且不受下面的开关影响，这里只决定「要不要让名称常显出来」。">
        <SwitchRow l="图标显示名称" d="在图标下方常显站点名称；关闭时仍可悬停图标查看名称与域名"
          on={s.iconNames} onToggle={() => setSetting('iconNames', !s.iconNames)} />
      </SecCard>
      <SecCard t="页面整理" info="删掉卡片后不留空洞：后面的卡片依次前移补位，相对顺序不变。删图标时只挪图标（组件位置不动），删组件时整页卡片一起前移。">
        <SwitchRow l="删除图标后自动整理" d="删除网站图标 / 图标文件夹 / 图标格容器后自动补位，组件（时钟 / 天气 / 待办等）位置不动；想随时手动理顺整页，用空白处右键的「整理图标」"
          on={s.autoArrange} onToggle={() => setSetting('autoArrange', !s.autoArrange)} />
        <SwitchRow l="删除组件后自动整理" d="删除时钟 / 天气 / 待办 / 日历 / 收藏夹 / 倒计时后，后面的卡片（含图标）依次前移补位"
          on={s.autoArrangeWidgets} onToggle={() => setSetting('autoArrangeWidgets', !s.autoArrangeWidgets)} />
      </SecCard>
    </>
  )
}

/** 备份时间压缩显示：2026/10/9 22:14:03 → 10-09 22:14（无法解析时原样显示） */
const shortStamp = (v: string): string => {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})/.exec(v)
  return m === null ? v : `${(m[2] ?? '').padStart(2, '0')}-${(m[3] ?? '').padStart(2, '0')} ${(m[4] ?? '').padStart(2, '0')}:${m[5] ?? ''}`
}

/** 数据分区中部状态行：危险区贴底留下的空白改作信息区（上次备份 + 快照入口），不再是大片空壁纸 */
const DataStatusRow = () => {
  const backupTime = useApp((st) => st.backupTime)
  const setModal = useApp((st) => st.setModal)
  return (
    <div className="status-row">
      <span>上次备份：{backupTime === null ? '暂无记录' : shortStamp(backupTime)}</span>
      <span className="link" onClick={() => setModal('backup')}>查看快照</span>
    </div>
  )
}

/** 备份与迁移卡片：3 列等宽网格——行 1 界面级（备份 / 取快照 / 恢复布局）、行 2 文件级（导出 / 导入 / 收藏夹）；
 *  「备份当前界面」是全组唯一的主按钮；易混操作的适用范围统一写进标题 ⓘ（不再用按钮下方的小字，避免切碎行距） */
const SettingBackupCard = () => {
  const setModal = useApp((st) => st.setModal)
  const importLayout = useApp((st) => st.importLayout)
  const restoreBackup = useApp((st) => st.restoreBackup)
  const showToast = useApp((st) => st.showToast)
  const file = useRef<HTMLInputElement | null>(null)
  const bkFile = useRef<HTMLInputElement | null>(null)
  return (
    <SecCard t="备份与迁移" info={`导出内容 = 全部页面的卡片实例（引用的小组件、各自配置、位置与尺寸），改完文件可直接导入回来。\n恢复本地快照 = 回滚到最近快照\n恢复布局 = 清空为空白页，或载入示例布局\n恢复更新前数据 = 回到升级 / 覆盖前自动留底的那一份\n一键重置 = 全量清空，不可撤销`}>
      <div className="btn-grid">
        <button className="btn" onClick={() => setModal('backup')}>备份当前界面</button>
        <button className="btn ghost" onClick={() => bkFile.current?.click()}>恢复本地快照</button>
        <button className="btn ghost" onClick={() => setModal('restore')}>恢复布局</button>
      </div>
      <div className="btn-grid">
        <button className="btn sm ghost" onClick={exportLayoutFile}>导出布局 JSON</button>
        <button className="btn sm ghost" onClick={() => file.current?.click()}>导入布局 JSON</button>
        <button className="btn sm ghost" onClick={() => void importBookmarks()}>导入收藏夹</button>
      </div>
      <div className="btn-grid">
        <button className="btn sm ghost" onClick={() => showToast(restoreBackup() ? '已恢复更新前的数据' : '没有可用的更新前备份')}>恢复更新前数据</button>
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
    const ok = await askConfirm({
      title: '清除本地数据',
      message: '将彻底删除本地数据（图标、布局、皮肤、壁纸配置），且不可撤销。',
      confirmText: '彻底删除', danger: true,
    })
    if (!ok) return
    await resetAllData()
  }
  return (
    <SecCard danger t="重置与清理" info={`两项都只作用于本机数据且不可撤销：\n清除本地数据 = 删除本机全部数据（含壁纸）\n一键重置 = 全量清空，不可撤销`}>
      {/* 复用与上方卡片同一套 3 列网格：两颗各占 1 格，与「备份当前界面 / 恢复本地快照」逐列对齐 */}
      <div className="btn-grid">
        <button className="btn ghost" onClick={() => void clearLocal()}>清除本地数据</button>
        <button className="btn danger" onClick={() => setModal('reset')}>一键重置</button>
      </div>
    </SecCard>
  )
}

/** 数据分区：备份与迁移（常规动作）→ 状态行（占用中部空白，危险区仍贴底）→ 重置与清理（危险动作贴底降低误触） */
const SettingDataTab = () => (
  <>
    <SettingBackupCard />
    <div className="pane-band"><DataStatusRow /></div>
    <SettingResetCard />
  </>
)

/* ---------- 更新记录（设置 → 关于）：单行版本表头 + 类型标签条目 ---------- */

/** 条目类型（四类配四色：新增蓝 / 优化绿 / 调整灰 / 移除红） */
type LogKind = '新增' | '优化' | '调整' | '移除'

/** 类型 → 样式类（中文不放类名） */
const LOG_KIND_CLASS: Record<LogKind, string> = { 新增: 'k-add', 优化: 'k-opt', 调整: 'k-tune', 移除: 'k-del' }

interface LogItem {
  /** 类型标签 */
  k: LogKind
  /** 一句话摘要（保持单行） */
  s: string
  /** 实现细节：点击条目展开 */
  d?: string
}

interface LogVersion {
  v: string
  /** 发布区间（同日只写一天） */
  d: string
  items: readonly LogItem[]
}

/** 首项为当前版本；条目只留「类型 + 一句摘要」，括号里的实现细节收进展开 */
const CHANGELOG: readonly LogVersion[] = [
  {
    v: '5.24', d: '2026-10-23', items: [
      { k: '优化', s: '天气刷新有明确的加载与结果反馈', d: '点刷新后图标旋转并显示「刷新中」，至少保持 600ms；成功显示绿色「已更新」，失败显示红色「未更新」，1.6s 后恢复。' },
      { k: '优化', s: '日历节气与宜忌标签更清晰', d: '标签底色改为与面板底色混合的不透明色，文字用语义色与正文色混一档，字号提到 12px，浅色 / 暗黑主题下都保持足够对比。' },
      { k: '优化', s: '组件设置的分隔与节奏统一', d: '通用 / 专属 / 尺寸各自成组，文本框、开关、数字、颜色统一用同一条底线；组内末行不画线，组与组之间留 16px，不再一半有横线一半靠空白。' },
    ],
  },
  {
    v: '5.23', d: '2026-10-23', items: [
      { k: '新增', s: '天气卡片与详情按天气现象播放动画', d: '晴 / 多云 / 雨 / 雪 / 雷 / 雾 / 夜间各有图标动效；温度决定降水形态，≤2°C 下雨转雪，≥35°C 加暖色光晕。' },
      { k: '新增', s: '天气详情加入场景层', d: '雨丝、雪花、雾带与晴日光晕只铺在详情右侧，离开视口或切到后台自动暂停，系统开启「减少动态效果」时降级为静态。' },
      { k: '优化', s: '日历详情的文字不再发虚', d: '农历、日期与日程角标加大加深，移除文字层透明度和过小字号，半透明玻璃底上也能看清。' },
      { k: '优化', s: '配置弹窗把低频样式收进「个性化（高级）」', d: '首屏只留名称、功能开关与尺寸；高级区默认折叠，数字输入双列排布，样式默认 / 复制到同类卡片等批量操作一并收进去。' },
      { k: '优化', s: '编辑配置改为即时生效', d: '去掉取消 / 确认修改，只保留「完成」，避免改完忘点确认。' },
      { k: '优化', s: '日历月视图的日程角标更醒目', d: '有日程的日期显示数量角标，字号与对比度提升。' },
    ],
  },
  {
    v: '5.22', d: '2026-10-23', items: [
      { k: '优化', s: '小组件详情改为「概览 / 设置」两级', d: '概览只保留核心信息与高频操作，低频配置收进「设置」；去掉职责模糊的「编辑配置」按钮，面板高度大幅缩短。' },
      { k: '优化', s: '天气详情：一个搜索框、7 天预报、状态驱动的定位入口', d: '搜索结果行直接选「设为主定位 / 加入列表」，城市行常显「设为主 / 删除」；已授权定位时不再出现「允许定位」；预报扩到 7 天，刷新按钮旁显示「x 分钟前更新」。' },
      { k: '新增', s: '天气支持按间隔自动刷新', d: '设置里可选关闭 / 15 / 30 / 60 分钟，自动刷新静默执行，不弹提示。' },
      { k: '优化', s: '日历详情：日程数量角标与行内编辑', d: '月格子直接显示当天日程条数；日程可勾选、改名、删除，输入框左侧标出目标日期；宜忌收进日期行的可展开区。' },
      { k: '优化', s: '倒计时详情：模式并列切换、配置按模式显隐', d: '主读数旁并列显示已启用模式，点一下切换；下班时刻 / 目标日期等字段只在该模式勾选时出现，「多模式轮播」仅在多选时显示；倒数列表默认 5 条、可展开，自定义行内改名改日期，节日可单独隐藏。' },
      { k: '新增', s: '时钟日期与问候语拆成两个开关', d: '想只留「10月23日 星期五」或只留问候语都可以。' },
    ],
  },
  {
    v: '5.21', d: '2026-10-22', items: [
      { k: '优化', s: '只有 http 的老站点也能取到 favicon', d: '首页与常见图标路径原先只探 https，证书或连接失败就直接放弃；现在先 https、失败再回退 http，并跟随重定向改用最终域名。' },
      { k: '新增', s: 'favicon 探测新增 favicon.svg', d: '常见路径补上 /favicon.svg，现代站点直接提供的矢量图标也能取到。' },
      { k: '优化', s: '站点没有图标时不再刷警告', d: '很多站点本来就不提供 favicon（图标路径 404 或返回空文件），这属于常态；日志降为开发期 debug，生产构建静默，图标照旧回退品牌字形。' },
    ],
  },
  {
    v: '5.2', d: '2026-10-22', items: [
      { k: '调整', s: '版本号改为两位小数逐步递增', d: 'Chrome 会把「5.01」读成「5.1」，两处写法对不上；现在版本号按两位小数一步 0.01 递增（5.2 → 5.21 → 5.22 …），不再使用前导零，也不跨档跳号。' },
      { k: '移除', s: '右键菜单去掉四项新建入口', d: '去掉「添加网站图标 / 添加图标文件夹 / 添加图标格容器 / 添加到 Dock 快捷方式」，新建统一走「打开添加面板」抽屉；空白处右键只保留 打开添加面板 / 打开个性化 / 打开设置 与 整理图标。' },
      { k: '优化', s: 'Dock 图标悬停放大不再被裁掉顶部', d: '快捷栏横向滚动会让容器的纵向溢出一并被裁掉，图标放大上浮时顶部缺一块；现在快捷栏上下留出绘制空间，图标完整露出。' },
    ],
  },
  {
    v: '5.1', d: '2026-10-21', items: [
      { k: '调整', s: 'Dock 快捷方式不再限制数量', d: '去掉 4–8 个的数量上限，想加多少加多少；一排装不下时快捷栏内部横向滚动，不会把整条 Dock 撑出页面。' },
      { k: '新增', s: 'Dock 图标可调三档大小', d: '个性化 →「搜索与 Dock」里的「Dock 应用数量」换成「Dock 图标大小」：小 / 中 / 大，只影响 Dock，与页面图标的六档尺寸互不干扰；功能键字形同步缩放。' },
      { k: '移除', s: '组件库不再提供「组件默认大小」设置', d: '新放置的组件一律用出厂尺寸，单个实例的尺寸仍在编辑弹窗或右键「修改尺寸」里调；旧设置里的该字段读取时忽略。' },
    ],
  },
  {
    v: '5.0', d: '2026-10-21', items: [
      { k: '调整', s: '壁纸来源改为内置五个，不再需要添加', d: '哲风壁纸 / Wallpaper Gallery / 必应每日 / Picsum / Wallhaven 全部内置并默认启用，去掉添加、改名、改基址、删除与启用开关——填错基址导致整个来源不可用的情况不会再发生。' },
      { k: '新增', s: '壁纸分类取站方真实分类', d: '哲风从站方拿到 9 个主题分类（前面补「综合推荐」），Wallpaper Gallery 用自带的 12 类，Wallhaven 保留原站三类；必应与 Picsum 本来没有分类，分类行整行不再占位。' },
      { k: '优化', s: '哲风壁纸按站方允许的最高清晰度取图', d: '静态壁纸改用 1100px 预览图（原 890px 裁剪图）；动态壁纸的预览是 mp4，仍取封面帧，避免把视频地址当图片应用。' },
      { k: '调整', s: '组件库拆成「页面组件」与「页面图标」两张清单', d: '两者各自拖拽排序；行尾的 ··· 文字菜单换成编辑 / 移除两颗图标按钮，不用再多点一层。' },
      { k: '新增', s: '组件库可直接跳到组件所在的页', d: '组件在别的页时按钮显示「第 N 页」，点一下跳到那一页并收起面板，不再出现「已添加」但找不到组件的死胡同。' },
      { k: '新增', s: '原生弹窗全部换成应用内对话框', d: '改名称、改网址、外链壁纸地址、清空历史、清除本地数据、本地目录确认都走同一套弹窗；输入类带行内校验（网址必须 http(s)），危险操作默认焦点落在「取消」。' },
      { k: '新增', s: '两个标签页的改动会互相同步', d: '在另一个新标签页改了设置，本页会跟着刷新并提示；内容相同则不动，不会来回覆盖。' },
      { k: '优化', s: '在线壁纸下载更省心', d: '下载前先探体积与类型（超 20MB 或不是图片直接拒绝），下载中可取消，宽度超 1920 的图入库前先压缩；缩略图加载失败显示占位文字而不是空白格。' },
      { k: '优化', s: '壁纸列表可重试、会记住浏览位置', d: '拉取失败有「重试」按钮且跳过 30 分钟缓存；切换来源各自记住分类、页码与搜索词，切回来接着看。' },
      { k: '优化', s: '必应壁纸不再无限翻页', d: '站方归档只有一周多，超出后会把最老的 8 张重复返回；现在最多两页，第二页即末页。' },
      { k: '新增', s: 'Dock 快捷方式可集中管理', d: '「快捷方式」页签新增「管理」：逐行改名称、改网址、移除，不必再回页面逐条右键。' },
      { k: '优化', s: '搜索历史的清空按钮移到开关旁', d: '从卡片最底部移到「搜索历史」右侧，并显示当前条数，不用再滚到底。' },
    ],
  },
  {
    v: '4.98', d: '2026-10-21', items: [
      { k: '调整', s: '组件库平铺为一整张清单', d: '原「常用 / 时间 / 信息 / 图标」四个分组卡收进同一张清单，只保留两种区分——已添加 / 未添加（按钮态）与组件 / 图标（「页面组件」列表行首标签），不再按类型分组。' },
      { k: '调整', s: '网站图标不再是小组件：改由右键添加', d: '组件库与「组件默认大小」不再列出网站图标；添加入口仍是空白处右键第一项「添加网站图标」。「组件默认大小」弹窗同步改为单张清单。' },
      { k: '调整', s: '右键菜单去掉「添加组件」', d: '小组件的添加入口统一在个性化 → 组件库；空白处右键保留 添加网站图标 / 图标文件夹 / 图标格容器 / Dock 快捷方式 与三个打开入口、整理图标。' },
      { k: '优化', s: '右键菜单悬停项更醒目', d: '悬停条目时左缘出现强调色短条（缩放动画浮现）+ 淡强调底色，二级菜单同一套；禁用项不参与，一眼能看清当前停在哪一项。' },
      { k: '新增', s: '日历详情支持月 / 周 / 年快速定位', d: '详情弹窗顶部新增 月 | 周 | 年 视图切换：‹ › 按当前粒度步进（±1 月 / ±7 天 / ±1 年），周视图标注「第 N 周 · 日期区间」，年视图 12 个迷你月（点月份进月视图、点日期直接选中并回到月视图）；「今天」一键回当日。' },
      { k: '优化', s: '日历详情的信息层级与说明精简', d: '选中日期改为 公历日期与星期（大字重点）> 农历 / 干支 / 建除（辅助色）> 宜 / 忌（绿 / 红语义标签，节日同作标签）；去掉底部「点月历任意一天切换」的操作说明。' },
      { k: '新增', s: '天气详情可看多个城市', d: '新增「其他城市」清单（最多 8 个）：每行显示当地实况温度 / 天气 / 今日区间（30 分钟缓存）；点击城市行把它设为主定位，行尾可移除。' },
      { k: '优化', s: '手选城市的搜索结果更靠谱', d: '同名候选按人口降序排（真城市在前、同名乡镇沉底）并按坐标去重，搜索结果最多 10 条。' },
      { k: '优化', s: '弹窗按钮的上下边距统一', d: '详情 / 编辑弹窗里按钮行与上文的间距统一为 16px，连续两行按钮组收紧为 8px，表单字段内的按钮行不再叠加空白；原先散落的 8 / 10 / 14 / 16px 内联值全部收编。' },
      { k: '优化', s: '天气详情的层级与今日档', d: '温度大字为焦点、天气现象加重、地名降为辅助色；三日预报今天一档加淡强调底与描边，日期列显示「今天」。' },
    ],
  },
  {
    v: '4.97', d: '2026-10-21', items: [
      { k: '优化', s: '浅色主题的极简模式不再白字白底', d: '极简模式整屏没有卡片托底，大时钟与搜索框原先固定用白字白描边，在经典主题的白底上等于隐形。改为按主题底色自动挑墨色：浅底用深墨配深描边，深底仍是白字白描边。' },
      { k: '优化', s: '暗黑主题下深色品牌图标不再消失', d: 'Notion、GitHub、抖音、DeepSeek 这类近黑色的品牌字形，放在暗黑主题的深色图标底上几乎看不见。现在按图标底色的明暗自动提亮或压暗字形，只调明度、保留色相与饱和度，所有主题下都跨过 3:1 对比度。' },
      { k: '优化', s: '宜忌、节日、待办等语义色随主题适配', d: '原先宜 / 忌、待办强调色、节日标签、危险操作都写死一个绿 / 红 / 青，在暗黑主题的深色卡上只有 1.6–2.2:1。改为主题令牌，两套主题各取一支：浅底用深色系、深底用浅色系，全部跨过 4.5:1。' },
      { k: '优化', s: '日历卡按信息价值分层', d: '原先农历、干支、节日、宜忌、日程都是 11–13px 的中灰或彩色，四行平铺下来读起来是一团。现在日期为唯一强焦点，节日用强调色加粗，农历回到正文色，宜忌与日程降到辅助色；没有日程时不再显示「今日暂无日程」占位。' },
      { k: '优化', s: '倒计时卡的主读数重新成为焦点', d: '四条满格强调色的进度条横贯卡片时，视觉重量盖过了上方的时间。进度条改为强调色的 55% 混色，退为辅助信息。' },
      { k: '优化', s: '时间颜色默认跟随主题', d: '原先出厂值写死深灰，切到暗黑主题后时钟与日期直接看不见。现在留空即跟随主题，也可在个性化 → 背景效果里单独指定颜色。' },
      { k: '优化', s: '空页引导提示在任何壁纸上都读得清', d: '「从这里开始」整块原先靠降低不透明度做弱化，白底上只有 1.5–2:1 的对比度。改为正文色 / 次要色两级，并垫一层柔和玻璃底衬。' },
      { k: '优化', s: '统一字号与圆角阶梯', d: '全站字号收敛到 10–24px 的八级阶梯、圆角收敛到 6/8/10/12/16 与胶囊五档，同类控件不再各写各的数值。' },
      { k: '优化', s: '键盘操作有可见焦点', d: '全站补上焦点描边：用 Tab 键在面板、菜单、按钮之间移动时，当前焦点位置有强调色外圈。' },
      { k: '优化', s: '搜索历史每行的删除按钮恢复样式', d: '这一项原先没有样式，图标按浏览器默认尺寸撑开、把历史文字挤到一边；现在固定 22px 并只在悬停时浮现。' },
      { k: '优化', s: '小按钮的可点区域变大', d: '卡片悬浮按钮、日历翻月、列表删除、抽屉关闭等小图标按钮从 22–28px 提到 24–30px，触控与精细鼠标都更好点。' },
      { k: '优化', s: '窄窗口下抽屉与弹窗不再被裁', d: '抽屉固定 440px、弹窗固定 780px，在手机或分屏里会被右缘切掉。现在窄窗口下抽屉占满整幅舞台，弹窗宽度也随可用空间收缩。' },
      { k: '优化', s: '搜索历史面板宽度跟随搜索框', d: '搜索框可调 400–1400px，而历史面板原先写死 772px，宽框下会明显错位。' },
      { k: '优化', s: '设置 → 数据页签的空白不再把状态行甩到中间', d: '「上次备份」状态行改为贴住下方危险操作卡，空白集中在上方；「一键重置」也从实心红改为淡红描边，不再是页面上最响的按钮。' },
      { k: '调整', s: '清理废弃样式', d: '移除了已随功能下线的主题预览、待办旧版、颜色圆点等一批不再被引用的样式。' },
    ],
  },
  {
    v: '4.96', d: '2026-10-21', items: [
      { k: '调整', s: '组件库里去掉待办清单与收藏夹', d: '个性化 → 组件库不再列出这两项；已经放在页面上的照常显示、编辑与删除，只是不再从组件库新增。' },
      { k: '调整', s: '图标文件夹与图标格容器改为右键添加', d: '这两项不是小组件，从组件库与「组件默认大小」里移出；空白处右键新增「添加图标文件夹」与「添加图标格容器」两项，点一下就在右键位置生成。' },
    ],
  },
  {
    v: '4.95', d: '2026-10-20', items: [
      { k: '优化', s: '所有滑杆改为填数字，数值更准', d: '背景效果的全局效果、透明度、毛玻璃、壁纸遮罩，以及搜索与 Dock、卡片配置里的字号 / 缩放 / 圆角，全部改成右侧窄输入框 + 单位后缀；键盘直接输入，不用再拖滑杆对齐刻度。' },
      { k: '优化', s: '数字输入带范围校验与范围提示', d: '每个输入框下方标出可取区间（如 20 – 100、0 – 20px）；输入过程中允许临时留空或越界，失焦或回车时自动钳到区间内，留空则恢复原值。模糊度支持 0.1 的精度。' },
    ],
  },
  {
    v: '4.94', d: '2026-10-20', items: [
      { k: '优化', s: '日历月历不再出现 -1、-2、-3 这类日期', d: '上月与下月的补齐格改用真实日期（9 月末显示 30 号、下月开头显示 1 号），每格还能带出自己的农历与节日。' },
      { k: '新增', s: '日历详情可点选任意一天，月历每格显示农历', d: '点某一天即切换当天详情，上 / 下月补齐格点中会顺手翻到那个月；每格下行是农历日（初一显示月名），有节日的日子带下划线、有日程的带圆点，鼠标悬停显示「日期 + 农历 + 节日」气泡。' },
      { k: '新增', s: '农历纪念日：每年按农历月日循环倒数', d: '倒数日条目可切换为「农历」类型，只填农历月与日（如六月廿九），日期每年按真实农历重算，不会用阳历日期跨年；出厂已预置阿玲的生日（农历六月廿九）与我的生日（农历六月廿六）。' },
      { k: '优化', s: '图标与日期的悬浮提示在部分环境不显示', d: '提示气泡不再等下一帧才显示，后台标签页等拿不到动画帧的环境里也能正常浮出。' },
    ],
  },
  {
    v: '4.93', d: '2026-10-20', items: [
      { k: '优化', s: '天气按真实定位取数，定位不到时提示允许定位', d: '原来定位失败会静默用北京，看起来像「定位不对」。现在会询问是否允许定位，允许后按真实坐标取天气并反查出所在区市（如「拱墅区 · 杭州市」）；拒绝时卡片上直接给出「允许定位」入口，也可以点开详情搜索城市手选。' },
      { k: '调整', s: '倒计时内容居中，去掉吉祥物图形', d: '主读数与倒数列表整体居中排布；熊猫吉祥物（含自定义 emoji）功能移除，卡面留给计时本身。' },
      { k: '新增', s: '下班倒计时 / 倒数日 / 纪念日可同时显示并轮播', d: '三种模式可同时勾选，卡片按顺序每 6 秒轮换一个（右上角小圆点指示当前是哪一个），也可以关掉轮播固定显示第一种。下班时刻、倒数日目标日期、纪念日起始日期 / 标题 / 单位各自独立配置。' },
      { k: '新增', s: '日历接入真实农历、节日、生肖与宜忌，可写日程', d: '卡上显示农历日期、干支生肖（如「丙午马年」）、当天节日与建除十二值日的宜忌；点开详情是当月月历，可写当天日程与待办、勾选完成，有日程的日子在月历上带圆点。' },
    ],
  },
  {
    v: '4.92', d: '2026-10-20', items: [
      { k: '新增', s: '删除小组件后也会自动补位，设置里可单独开关', d: '删掉时钟 / 天气 / 待办 / 日历 / 收藏夹 / 倒计时后，后面的卡片（含图标）依次前移填补空位，不再留一块空洞。设置 → 通用 →「页面整理」新增「删除组件后自动整理」，与「删除图标后自动整理」各自独立：删图标时组件仍钉住不动，删组件时整页卡片一起前移（组件尺寸的洞图标补不上，得由组件自己接上）。' },
    ],
  },
  {
    v: '4.91', d: '2026-10-20', items: [
      { k: '新增', s: '搜索历史面板加「清除全部」，小号文字按钮', d: '标题行右侧一个 12px 的纯文字按钮，悬停转强调色；点击一次清空全部搜索历史并收起面板。' },
    ],
  },
  {
    v: '4.9', d: '2026-10-20', items: [
      { k: '优化', s: '打开新标签页不再先显示默认界面再跳成你的配置', d: '改为配置读出来之后才渲染首屏，读盘期间显示的是上次主题的底色；本地目录快照的磁盘读取移到挂载之后，不再占首屏时间。实测首屏约 0.2 秒。' },
    ],
  },
  {
    v: '4.8', d: '2026-10-19', items: [
      { k: '调整', s: '主题只保留经典与暗黑，风格编辑器移除', d: '原来的光感 / 黑紫 / 晨曦 / 黛青不再提供；旧的皮肤 id 载入时回退经典。配色编辑与自建皮肤一并移除，页面观感改由「背景效果」统一调。' },
      { k: '调整', s: '主题与显示并入「背景效果」顶部', d: '个性化页签收敛为壁纸 / 背景效果 / 组件库；主题（经典、暗黑）+ 时间颜色 + 隐藏顶部与搜索框，都放在背景效果最上面。' },
      { k: '新增', s: '全局效果：一次调好整页的透明度、玻璃度与模糊度', d: '背景效果顶部新增三项全局滑杆，写入所有玻璃控件；下方仍可按控件单独微调。' },
      { k: '优化', s: '壁纸来源可自由新增与修改', d: '同一协议可添加多个（分别指向不同镜像），新增时可自定义名称与地址，行尾菜单支持改名称 / 改地址 / 移除。' },
      { k: '优化', s: '暗黑主题下的搜索框、Dock 与图标底改为跟随主题', d: '原先写死的白色底在暗黑主题下会把白字压没，现统一取主题令牌，明暗两套都可读。' },
    ],
  },
  {
    v: '4.7', d: '2026-10-19', items: [
      { k: '调整', s: '首次安装改为空白页，不再预置示例卡片与欢迎弹窗', d: '空页上直接给出「添加网站 / 添加组件 / 换壁纸」三个入口。需要现成编排时，在设置 → 数据 → 恢复布局里选「载入示例布局」。' },
      { k: '新增', s: '更新不丢数据：版本升级时自动留一份更新前备份', d: '设置 → 数据新增「恢复更新前数据」；本地目录快照比本机数据旧时不再覆盖，改为把本机数据写回目录。' },
      { k: '优化', s: '支持 Edge 安装：同一份扩展可直接加载', d: 'Edge 打开 edge://extensions → 开发人员模式 → 加载解压缩的扩展；安装与更新步骤见 INSTALL.md。' },
    ],
  },
  {
    v: '4.6', d: '2026-09-30 – 2026-10-14', items: [
      { k: '新增', s: '自动对比：图标与文字跟着壁纸的明暗自动调深浅', d: '换上亮壁纸后，白色的图标与文字会糊在背景里——同一张壁纸上半是白云、下半是深色人物，靠一种颜色根本不成立。现在**每一张卡片都会看自己背后那块壁纸的亮度**（把壁纸降采样成小灰度图，按「填满不变形」的同一条规则算出你实际看到的那块区域再取样），然后按侵入性从小到大出手：**①翻墨色**——浅底自动用深墨、深底用皮肤原色；**②外圈光晕**——字形外圈一圈反向描边加一点投影，白字在白云上靠它立住，方向跟着背景明暗走，所以**品牌图标（保留自己的品牌色，不会被翻色）也一样受益**；**③软底衬**——上面两招还不够时，才在字形背后垫一圈**渐隐的软底衬**（解到刚好跨过 3:1 的可见门槛，壁纸够暗时它是 0，整条背景都不出现，「图标直接落在壁纸上」的观感原样保留）；**④壁纸遮罩**——壁纸明暗交错（人物 + 天空 + 反光）时自动补一点遮罩，均匀的纯色 / 天空壁纸不加，你设的遮罩值当基准。卡片上的文字同样吃这套（按它自己的墨色算对比缺口加描边）。护罩 / 描边 / 投影都按设计像素写，所以 4K 与 1080p 的观感一致；缩放窗口也不会让取样点漂移。设置 → 个性化 → 壁纸与文字里的「自动对比」默认开启，关掉后完全按遮罩滑杆与字体颜色走' },
      { k: '优化', s: '拖动更跟手、更顺滑：卡片实时跟随指针，松手飞回吸附到位', d: '这次把拖动的手感整个重做了一遍，改的都不是参数而是机制：**①跟手**——原来拖动时卡片是"一格一格跳"的（渲染在候选格上），现在它**像素级跟随指针**，只有靠近其它卡片对齐时才会"咔哒"一下咬到格上；"会落在哪"改由格子里的**虚线轮廓**来表示（跨页、多选也是同一套，与松手后的落位用同一个算法，所见即所得）。**②帧率**——原来指针每动一次就要算一遍、并把整页 49 张卡片全部重画一遍（还各读两次布局），现在指针移动**合并到每一帧只算一次**（实测 150 次移动合并成 1 次更新、耗时 0.9 毫秒），并且靠 memo 让拖拽中真正重画的只剩被拖的那一张；实测按帧拖 160 帧：帧间隔中位数 8.3ms、无一次超过 20ms、无长任务卡顿。**③缓动**——松手不再是"啪一下到位"：卡片会从你手指松开的位置用 0.2 秒弹簧**飞回落点**；「拿起来」的放大 + 光圈 + 投影现在真的生效（上一版它被漏掉了）；拖动中翻页从 0.42 秒提速到 0.24 秒（拖拽是连续动作，等 0.42 秒很拖节奏）；顺带修掉"松手瞬间卡片先消失再淡入"的毛病。**④降噪**——拖拽横扫一排图标时，它们不再逐张上浮 / 放大（既是视觉噪声，也白费帧）。长按进入拖拽、单击打开、跨页搬动、多选、Esc 取消、落位规则全部不变' },
      { k: '新增', s: '跨页拖拽：图标可以直接拖到其它页，支持多选一次搬一组', d: '原来拖拽的数学只认一页——拖到第 1 页松手时系统在「第 1 页」里找不到这张卡（它还在第 2 页），只能提示「这里放不下」，所以**跨页搬图标只能删了重加**。现在：**拖到舞台左右边缘停留 0.6 秒自动翻页**（继续拖、松手落位；翻过后还停在边缘会继续翻下一页），拖拽中滚轮翻页、方向键翻页也都可用。**多选**：`Ctrl/Cmd 单击`逐个加选、`Shift 单击`取锚点到这张之间同类型的卡片，选中卡片带强调色描边；长按其中任意一张就是**整组一起搬**（拖拽时主卡跟手、带数量角标，目标页实时画出虚线落点格，放不下时角标直接显示「能放/总数」）。还有个不用拖的入口：图标类卡片右键 →「移动到」→ 选第几页（多选时搬整组）。**落位规则**：单张落在指针附近；多张按「自上而下、自左而右」依次填目标页的空位（与「整理图标」同一口径，绝不会重叠）；**能放几张放几张**，放不下的留在原页并提示（例如「已移动 3 个图标到第 1 页，2 个放不下留在原页」）；目标页满时明确告诉你放不下，不会偷偷新建页。跨页**不做互换**（那是页内的语言，搬过去等于把别人甩到另一页），搬走后源页按「删除后自动整理」设置自动补位、搬空的页自动移除。选择态：点空白 / 单击卡片 / Esc 都能清空（Esc 两级——先收拖拽、再收选择）；批量是桌面语义（Ctrl / Shift 与右键在触摸端不可达）' },
      { k: '优化', s: '拖拽改由长按进入：单击不会再让卡片动起来', d: '原来按下后只要移动超过 4px 就进入拖拽态——4px 是屏幕像素，点击时的手抖或触控板轻滑就能越线，观感就是「点一下卡片就进入移动状态」。现在进入拖拽的**唯一入口是按住不动 0.5 秒**：单击只执行原来的默认操作（图标卡开站、其它组件开详情），卡片位置绝不动。长按到点的瞬间卡片会「拿起来」——**放大 1.06 + 强调色光圈 + 投影加深**，网格对齐线同时出现，能震的设备（安卓 Chrome）还会轻震一下，松手即恢复普通状态；**原地松手不会打开卡片**（长按是「抓起来」，放下就是放下）。按住期间如果指针漂移超过 12px，视为「想拖但没按住」：这一次按下作废——既不拖、也不会打开卡片，并提示一次「拖动卡片需先长按 0.5 秒：按住不动再拖」（一次会话只提示一次）。顺带补上触摸设备支持：卡片接住自己的手势（不被浏览器当成滚动 / 缩放抢走），手势被系统中断时卡片回原位而不是卡在半路；触摸屏上的 favicon 也不会再被浏览器拖成一张图片。单击打开、右键菜单、悬浮编辑 / 删除、Esc 取消拖拽、对齐吸附与落位规则全部不变' },
      { k: '优化', s: '自动整理升级为跨页：前面的页留白由后面页的图标补齐', d: '原来整理只作用于「删除的那一页」——第 1 页留了空洞、后面几页却照旧排得满满当当，分页看起来中间空一块、后面挤一块。现在整理是**全局**的：把可移动卡片（网站图标 / 图标文件夹 / 图标格容器）按「页序 + 页内自上而下、自左而右」排序，依次补到全局最靠前的空位——前面的页一留白，后面页的图标就被提前填上，**空洞被推到最后一页末尾**（页被搬空则自动移除，至少保留一页）；组件（时钟 / 天气 / 待办 / 收藏夹 / 倒计时）仍钉在各自页原位不动。删除后的自动整理与空白处右键的「整理图标」都走这一套；判定空位时其它卡片全部算障碍（已处理的用新位置、未处理的用原位），所以每张卡片只会往前补空、绝不会乱跳' },
      { k: '优化', s: '图标类卡片贴边：图标更大、间距更窄，信息密度更高', d: '图标类卡片（网站图标 / 图标文件夹 / 图标格容器）的四边内缩由 25px 收到 14px，小组件仍保持 25px——2×2 的图标卡由 98×98 变 120×120，**相邻图标间距由 50px 收到 28px**，卡内字形基准由 60 变 84（占卡面 70%：原 61%）。渲染、拖拽抓取偏移、对齐参考线、图标格容器可用框（groupBoxOf）全部改走同一处「按类型取内缩」（shared/grid 的 insetOf），不会出现「卡片框一套、拖拽数学另一套」的错位' },
      { k: '优化', s: '拖拽落位不再「目标被占就整体回退」：同尺寸互换、否则就近', d: '原来拖到被占的格子会被整体回退（满页时怎么拖都没反应，像"拖不动"）。现在分三种情形：目标格空着直接落；被**一张同尺寸**的卡片占着就**两张互换位置**（桌面式）；压到多张或尺寸装不下就**按距离就近落位**并提示「目标位置被占用，已就近放置」；页内确实没有连续空位才失败并提示「这里放不下，换个位置试试」。手动拖动后不会触发自动整理，你放哪儿就是哪儿' },
      { k: '新增', s: '删除后自动整理图标：后面的图标依次前移补位', d: '原来删除图标（网站图标 / 图标文件夹 / 图标格容器）只在原地留洞，Dock 与图标格容器删一个却会自动前移——网格上是唯一"不回填"的地方。现在删除图标类卡片后自动整理该页：把后面的图标按当前位置自上而下、自左而右排序，依次补到前面被腾出来的位置上（链式补位，删一张补一张，直到没有空洞；尺寸对不上时链条自然停止），相对顺序不变、组件（时钟 / 天气 / 待办 / 收藏夹 / 倒计时）位置不受影响、不跨页搬动。补位判定时其它卡片全部算障碍——已处理的用新位置、未处理的用原位，所以每张卡片只会往前补空、绝不会越过还没处理的卡片乱跳，自身原位必然仍空着，因此一定有落点。设置 → 通用 →「页面整理」的「删除后自动整理」默认开启，关闭后删除留洞；另给一个常驻手动入口——空白处右键菜单末尾「整理图标」（菜单由 7 项变 8 项、三组），手动整理会提示结果（已整理 N 个图标 / 已是最紧凑的排列 / 无解时的说明），自动整理不额外弹提示（删除的提示已有，位移动画就是反馈）。卡片位置变化（整理 / 被占回退）新增 260ms 平移过渡，拖拽中仍无过渡' },
      { k: '新增', s: '图标悬停提示：名称 + 域名，可让图标下方常显名称', d: '字形相似或重复的网站图标原来无从辨认（图标卡既无文字也无原生 title）。现在悬停网格上的图标卡、图标格容器里的格子、图标文件夹卡与 Dock 图标，都会在元素上方（放不下则翻到下方）浮出提示：第一行站点名称、第二行域名（图标格容器里的格子只有名称，那里没有网址数据）。延迟 250ms 才出现——鼠标横扫一排图标时不至于闪一片；移出 100ms 淡出。气泡固定深色底、不随皮肤，明暗壁纸与各皮肤上都清晰；画在舞台顶层而非元素内部——卡片与图标格容器都是 overflow:hidden，挂在里面会被裁掉。Dock 图标原有的浏览器原生 title 一并换成同一套气泡，避免延迟冒出的原生提示盖住它。设置 → 通用新增「图标显示名称」：开启后在图标下方常显站点名——纯文字 + 双层描边（外圈取皮肤明暗派生的描边色，亮壁纸看得到深色线芯、暗壁纸看得到浅色边缘），文字色取「名称标签」令牌即设置里的「字体颜色」（该设置此前只作用于网格线与页码点等装饰，现在对图标名生效），长名称单行省略号，全名与域名仍可在悬停气泡里看到；出厂关闭，保持纯字形。连带清理失效字段 settings.labels（「隐藏图标标签」开关当年移除后数据仍在、无人读取），由新设置 iconNames 承担；主机名提取 hostOf 由添加面板的局部函数提为 core/utils 共享' },
      { k: '优化', s: '添加网站的图标 / 容器后自动露出新卡片并高亮', d: '右键一级、添加抽屉（网址导航点站点 / 自定义页签确认添加 / 从书签快速添加）与组件库「添加」三处都是「一步生成、不弹任何表单」；此前抽屉开着时新卡片落在页面里被挡住，看起来像「没反应」，现在这三处单次添加后会自动收起抽屉（批量导入不收起），并播一次 1.9s 高亮——强调色描边 + 外圈光晕 + 临时浅底，让去卡片化的图标 / 容器也看得清。编辑仍走后续操作：卡片悬浮 ✎ 或右键卡片「编辑信息」' },
      { k: '新增', s: '对齐辅助：网格与组件对齐统一吸附', d: '拖拽卡片时每轴独立选格——以最近网格格为基准（卡片始终落在格上），若同页邻近卡片的边缘或中心偏差不超过 0.3 格（22px）则改用偏差最小的对齐格；某轴只参考「另一轴重叠或间隙 ≤1 格」的卡片，避免整页同列 / 同行的卡片一起被高亮（实测未加该约束时一次拖拽高亮 7 张）。拖动中卡片实时落在候选格上并保留抓取偏移（不再跳到指针下），吸附到组件时显示贯穿整页的参考线并高亮目标卡片；按 Esc 取消拖拽、松手即消失。设置 → 通用 →「对齐辅助」新增「组件吸附」与「显示对齐参考线」开关（均默认开）。不做拖拽缩放、放置时对齐与间距均分' },
      { k: '优化', s: '「添加网站图标 / 添加网站容器」改为一步生成', d: '两项提到右键菜单第一级的前两项，点下去直接在右键所在的格生成图标 / 容器，不再先弹表单（原来「新建网址图标」会先弹「新建站点」弹窗）；编辑改由后续操作触发——点卡片悬浮的 ✎ 或右键卡片「编辑信息」。新落位的卡片会播放一次性高亮（描边脉冲 + 轻微上浮，1.6 秒），让用户一眼看到新图标落在哪；「添加到 Dock 快捷方式」仍保留弹窗（Dock 需要网址才有意义）' },
      { k: '优化', s: '添加抽屉的「书签」分组在窄面板下被挤出可视区', d: '网址导航网格原为固定 3 列，且卡片没有 min-width:0——nowrap 的长书签名会把列的最小宽度撑到 170px，三列合计比面板内容区宽出 110px，右侧卡片被裁、面板底部还冒出横向滚动条。改为按面板宽度自适应列数（宽面板双列、更窄自动降为单列），卡片与名称都允许窄于内容（min-width:0，长名称走省略号），抽屉内容区不再出现横向滚动，只保留纵向滚动' },
      { k: '优化', s: '网格对齐线铺满全屏并提高明暗可辨识度', d: '原来网格线画在卡片网格容器内（只覆盖 1776×740 的卡片区，卡片区之外看不到，观感上像被裁切），现移到舞台顶层并铺满整个舞台，图案用背景偏移对齐到卡片网格原点；层级在壁纸之上、卡片与控件之下，且不拦截鼠标。每根线叠一层右下偏移 1px 的白色高光——亮壁纸看得到深色线芯、暗壁纸看得到浅色边缘；细线（单元格）略淡、粗线（偶数格 = 合法尺寸边界）更深。窗口缩放 / 全屏切换后仍然铺满' },
      { k: '优化', s: '「添加组件」不再重复添加同类组件', d: '已在页面上的类型在二级菜单里置灰并标「已添加」，点击只提示原因（「时钟」已在页面上，删除后可再次添加），不落位；判定由共享纯函数 placedKindsOf 统一（跨页按类型：任一页存在即算），组件库的按钮态与右键菜单同一口径，该类型的实例删光后自动恢复可添加。图标 / 图标文件夹 / 图标格容器属可重复放置的类型，不参与该判定（否则页面上一有图标，「添加网站图标」就再也点不动）' },
      { k: '优化', s: '右键菜单观感与动效打磨', d: '底色加可读下限（在「菜单与浮层」透明度设置之上叠 24% 基数，复杂壁纸上不发糊）、新增 1px 随文字色派生的描边、阴影改为大扩散柔投影；同时修掉一个失效令牌——菜单文字色原来取 var(--menu-text)，该令牌从未定义（一直是继承色），改为 --panel-text 后各皮肤的文字色与对比度才真正生效。条目行高 44 → 40px，悬停只过渡底色（去掉原来的左移 4px，整行不再跳动）；箭头加大并在悬停时转强调色 + 右移；分隔线改淡并上下留白；圆角 14 → 10px。动效：入场 160ms（淡入 + 上移 4px + 缩放 .98 → 1）、离场 100ms 淡出（关闭时保留 DOM 再卸载）、二级菜单 130ms 右侧淡入，均为标准缓动、无弹簧回弹' },
      { k: '新增', s: '空白处右键菜单：快速新建站点 + 快捷入口', d: '空白处右键不再交还浏览器，改为固定菜单——添加网站图标 / 添加网站容器 / 添加到 Dock 快捷方式 / 添加组件（二级列 9 类）/ 打开添加面板 / 打开个性化 / 打开设置（前三项为「新建」，与后三项之间一条分隔线）。「新建站点」弹窗只填网址（不写 https:// 也会自动补全）与名称（留空取域名），落点可选页面图标 / Dock 快捷方式 / 两者都加；页面落位落在右键所在的格（被占或装不下则就近）。输入框、抽屉、弹窗、搜索历史与引擎面板内部的右键仍是浏览器原生菜单，粘贴复制不受影响。落点算法新增 findSlotNear，place 支持指定格；Dock 的去重与上限判定抽到 shared/dock 共用；网址规范化（补 https://、拒非法）抽到 core/utils 并与添加抽屉的「自定义」表单统一' },
      { k: '移除', s: '空白处的全局右键菜单整体移除，右键交还浏览器原生菜单', d: '原全局菜单 12 项（网址导航 / 打开方式 / 搜索栏 / Dock栏 / 极简模式 / 隐藏项目 / 搜索引擎 / Dock 快捷栏 / 网格对齐线 / 站内消息 / 更新记录）不再保留；卡片右键 6 项与 Dock 图标右键 5 项保持不变。这些功能的入口仍在别处：网址导航 = 添加抽屉的网址导航页签、打开方式 = 设置 · 通用、搜索引擎 = 设置 · 搜索、显示与 Dock 类开关 = 个性化面板 + 模式胶囊、网格对齐线 = 设置 · 通用、更新记录 = 设置 · 关于；连带清理 menus.tsx 的 GlobalMenu / 书签分类行 / 开关与嵌套样式，以及 App 侧六个动作分支' },
      { k: '优化', s: '组件库分组按组件类型重排：时间 / 信息 / 图标，并新增置顶的「常用」组', d: '原「信息 / 工具 / 导航」改为按组件类型归类——时间 = 时钟 / 日历 / 倒计时，信息 = 天气 / 待办，图标 = 网站图标 / 图标文件夹 / 收藏夹 / 图标格容器；「常用」组出厂固定展示高频组件（时钟 / 天气 / 待办 / 网站图标），作为置顶快捷入口，成员仍保留自己的类型分组（常用组与其类型组里都会出现）' },
      { k: '调整', s: '组件库不再展示尺寸：改为「组件默认大小」集中设置，确认后生效', d: '已放置列表行上的「小 / 宽 / 大」三档尺寸胶囊移除，各类组件的目录行也不出现尺寸设置项，库内不再展示卡片的大小与宽度；设置集中在页签底部的「组件默认大小」卡片——点开弹窗按分组给每类组件选档（含「出厂」= 定义表尺寸），点「确认设置」才写入（选档 / 取消都不改设置），只影响之后新增的该类型实例，页面已有实例保持不变。新增设置项 sizeDefaults 随文档持久化，归一化只认六档且落在该组件能力区间内的值；单个实例的尺寸仍在页面右键菜单「修改尺寸」或「页面组件」列表的 ··· →「配置」里调整' },
      { k: '移除', s: '七类组件下架：新闻热点 / 翻译 / 计算器 / AI 对话 / 每日一言 / 木鱼 / 音乐', d: '按用户需求移除前四类（均为占位或演示数据），并整体移除「内容」分组（每日一言 / 木鱼 / 音乐）；组件库由 18 项收敛为 9 类（时钟 / 日历 / 天气 / 待办 / 倒计时 / 收藏夹 + 网站图标 / 图标文件夹 / 图标格容器），分组由四组并为三组（信息 / 工具 / 导航）。连带清理：鼓励语料库 core/quotes.ts、极简模式悬浮语、「换一条鼓励语」快捷键、昵称设置项、透明度里的「每日一言」项，以及 8 个音乐 / 木鱼 / 计算器 / 翻译专用图标与对应 CSS。出厂三页重新配平（被移除组件的占位改由图标格容器与网址图标补齐，仍每页 240 格 100% 填满）；存量页面里这些类型的卡片载入时按未知类型丢弃' },
      { k: '调整', s: '「纪念日」并入「倒计时」：倒计时新增第三种计时模式', d: '倒计时组件的「计时模式」由两档变三档（下班倒计时 / 倒数日 / 纪念日）：纪念日模式以标题行 + 大号天数（天 / 周 / 月 / 年换算）呈现，主读数与倒数列表、吉祥物共用同一套卡片；原纪念日卡的「标题 / 起始日期 / 天数单位」三项与倒计时定义表同名，改在详情弹窗内录入（专属字段仍守 3 项）。存量纪念日卡片在文档载入与旧备份导入时自动转接为倒计时的纪念日模式（位置、标题、起始日期、单位原样保留）。出厂第 3 页 8,0 的纪念日位改为下班倒计时，两卡并列' },
      { k: '优化', s: '「页面组件」列表里名称留空的行只剩一个字形图标', d: '出厂每日一言实例的 label 是空串，而列表取值用的是 ??（只对 null / undefined 生效），空串被当作有效名称直接渲染 → 该行没有文字。改为空串（trim 后）回退组件显示名，惠及所有名称留空的实例' },
      { k: '新增', s: '导航并入右键菜单：网址导航两级飞子菜单', d: '右键菜单新增「网址导航」项，悬停展开分类（常用 / 影音 / 游戏 / 社交 / 学习 / 购物 / 工具 / AI + 浏览器书签），再悬停分类展开站点列，点击站点一律新标签页打开（不离开当前主页）；末尾「管理导航站点…」直达添加抽屉的网址导航页签。参照浏览器书签菜单的成熟交互（分类 → 站点两级飞出、贴右边缘自动向左翻转）；页面上的网站图标 / 图标文件夹 / 图标格容器保持不变' },
      { k: '新增', s: '网格对齐线：组件落位的视觉参照', d: '页面网格按 24×10 绘制在卡片背后——细线是单元格（74px），粗线是偶数格（即合法尺寸边界），卡片内缩 25px，线正好落在卡间缝隙。设置 → 通用新增「组件对齐」卡可常显，右键菜单也有「网格对齐线」快捷开关；拖拽组件时无论开关状态都强制显示，用于确认落位（拖拽本身仍按网格吸附，对齐线只作参照）' },
      { k: '调整', s: '「倒数日」并入「倒计时」：一个控件两种计时', d: '「下班倒计时」与「倒数日」合并为「倒计时」组件——新增「计时模式」选项（下班倒计时 / 倒数日）：下班模式主读数为到下班时刻的 HH:MM:SS（到点停住）；倒数日模式主读数为距离目标日期的天数（强调色大字号 + 「天 / 天前」单位 + 宽卡日期行，即原「倒数日」卡的读数）。节日倒数列表与吉祥物两模式共用，仅 4 格高的卡片显示列表（原 4×4 以下显示 2 行的分支移除）；4×2 矮卡只留主读数，尺寸下限由 4×4 放宽到 4×2（原倒数日卡正是 4×2，形态不变）。「显示节日倒数」与「吉祥物图形」两个字段移入详情弹窗（与倒数列表管理同屏，消除原先两处录入的重复），专属字段仍守 3 项（计时模式 / 下班时刻 / 目标日期）；组件库由 19 项收敛为 18 项。存量「倒数日」卡片在文档载入与旧备份导入时自动转为「倒计时」的倒数日模式（位置 / 目标日期 / 强调色原样保留），无需手动重建' },
      { k: '优化', s: '极简页面：胶囊收起只显图标，功能键移入 Dock', d: '模式胶囊悬停展开「极简 / 标准」两个选项（去除说明文字）；右上头像移除，新增 / 个性化 / 设置改由底部 Dock 承载' },
      { k: '优化', s: 'Dock 改版：手动新增，支持右键改名与移除', d: '出厂快捷方式清空、由用户手动新增（「添加」抽屉勾选「同时添加到底部 Dock」）；图标显示站点 favicon（失败回退品牌字形）；苹果式尺寸与玻璃质感' },
      { k: '优化', s: '极简模式：日期 / 搜索框 / 鼓励语视觉重做', d: '日期改「2026年9月30日」格式、时钟 84px；搜索框未聚焦为透明胶囊白描边、聚焦展开为白色玻璃卡片；鼓励语悬浮在 Dock 上方；搜索历史与引擎面板跟随新位置' },
      { k: '调整', s: '壁纸改为外部来源适配器，内置壁纸移除', d: '接入 Wallhaven / Picsum / 必应每日 / 061129 / 哲风；自适应裁剪焦点（主体最集中的窗口）、同一张图去重、最近 12 张历史缩略图带、应用分阶段反馈' },
      { k: '调整', s: '设置与个性化面板改为分区页签 + 卡片', d: '透明度补至 12 项并与毛玻璃模糊解耦（6 项玻璃底色 + 6 项元素显隐，另有 6 项模糊配对）；个性化「主题」页签压缩为 4 列缩略图 + 12 项色值 4 列密排；说明统一收进标题 ⓘ' },
      { k: '移除', s: '在线广场（模板分享）整体移除', d: '广场从未接入云端，一直是种子模板示意；个性化里的「主题」（风格皮肤）不受影响；「吉祥物」开关更名为「Dock 快捷栏」' },
      { k: '移除', s: '云端同步与「关于我们」移除，回归纯本地', d: '设置页签由五个收敛为搜索 / 通用 / 数据 / 关于；core/cloud.ts 与参考服务端 server/ 删除，落盘只写本机；「关于我们」弹窗、右键菜单项与「同步数据」一并删除，关于页保留版本 / 更新记录 / 快捷键' },
      { k: '新增', s: '组件库：19 类组件分组浏览与拖拽排序', d: '个性化新增页签——信息 / 工具 / 内容 / 导航四组展示，已添加显示灰态；当前页组件可拖拽排序（只改列表顺序）、切「小 2×2 / 宽 4×2 / 大 4×4」、行尾 ··· 配置或移除；卡片通用配置含名称标签、显示标题与单独透明度；时间 / 日期 / 每日一言从「显示」页拆进时钟组件与「组件是否存在」' },
      { k: '优化', s: '快捷键可自定义：11 个动作点键帽改键', d: '单按键只在非输入状态生效，含 Ctrl / Alt 的组合键在任意位置生效；Esc 取消采集、Backspace / Delete 清除、与他人冲突时拦截，卡片底部可一键恢复出厂' },
      { k: '优化', s: '更新记录改为设置内联，摘要一行可展开', d: '不再走弹窗；版本表头单行「版本 · 日期区间 · N 项」（当前版本带 chip），条目只留类型标签与一句摘要，实现细节点条目展开' },
      { k: '优化', s: '图标格容器按卡铺满，标签收进卡内', d: '图标格行列改由卡片可用框自动决定（24 应用卡由一格 5 个变 8×3、格子 55px），「列数」假开关删除；卡下标签改为卡内左下角小字；搜索框与首行卡片间距 4px → 24px' },
      { k: '调整', s: '个性化页签由 6 个收敛为 4 个', d: '「搜索与 Dock」并入「背景效果」（搜索框宽度 / 圆角、沉浸式、Dock 数量 / 图标形状 / 快捷栏开关），「显示」并入「主题」（时间颜色、隐藏顶部区域 / 搜索框 / 图标标签）；功能项本身不变' },
      { k: '优化', s: '引擎添加失效修复，数据分区改网格并贴底', d: '「添加自定义搜索引擎」原先被「可见引擎数 ≥ 12 即拒绝」的恒真上限判断静默丢弃，现已移除上限并补空地址校验；数字键 1–9 快捷切换与列表序号删除；数据分区 6 颗按钮改 3 列等宽网格、按作用域分两行，「重置与清理」贴面板底部并复用同一网格，中部空白放「上次备份 + 查看快照」状态行，作用范围写进标题 ⓘ 清单' },
      { k: '新增', s: '历史记录一键清空：搜索历史与历史壁纸', d: '设置 → 搜索 → 「搜索框」卡底部新增「清空搜索历史（N 条）」（无可清时置灰不可点，与搜索框下拉里逐条删除同一份数据）；个性化 → 壁纸的历史缩略图带标题行新增「清空历史」——保留当前使用中的那张，其余记录连本机图片一并删除（二次确认，库内只剩当前壁纸）' },
      { k: '新增', s: '卡片点击直达详情，不再只能进编辑', d: '图标卡点击仍开站；其余 18 类小组件点击打开「详情」弹窗——天气实况 + 三日预报 + 刷新、时钟实时走字 + 快捷开关、日历当月月历（今日高亮）、待办可勾选 / 添加 / 删除（存卡片配置）、收藏夹浏览浏览器书签、倒数日 / 纪念日 / 倒计时大字、热榜全榜、每日一言换一句、木鱼 +N、图标格容器应用清单；数据未接入的（农历 / 计算器 / 翻译 / AI）如实注明占位，弹窗底部「编辑配置」互通' },
      { k: '新增', s: '从书签快速添加：主界面快捷方式与网址导航', d: '添加抽屉网址导航页签追加「书签」分类（读浏览器收藏夹、条目带真实网址，尾部「全部导入」复用批量导入通道）；自定义页签新增「从书签快速添加」——展开书签列表按名称过滤、逐条点击即添加为网址图标快捷方式' },
      { k: '调整', s: '界面不再显示小组件名称标签', d: '卡片左下角的组件名小字整体移除（含「显示标题」与「隐藏图标标签」两个失效开关）；图标格容器不再为标签预留底部条带，格子铺满可用空间；名称仅保留数据用途——网址图标站点名与文件夹卡内名称' },
      { k: '调整', s: '倒计时接入节日倒数列表，移除演示占位', d: '内置节日库（元旦 / 春节 / 清明 / 劳动节 / 端午 / 中秋 / 国庆）自动取下一次发生日期，农历节日按公历对照表覆盖 2026–2030；支持自定义倒数日（名称 / 目标日期 / 备注），按剩余天数排序并带进度条；移除「发薪日 / 周五 / 日赚」等演示占位；熊猫吉祥物可换任意 emoji 或隐藏' },
      { k: '优化', s: '待办条目卡上直读，收藏夹详情高密度化', d: '待办清单条目直接显示在卡片上，勾选框在卡上即可点完成（超出的显示剩余条数）；收藏夹详情改 4 列图标瓦片网格并支持名称 / 网址过滤，减少滚动；所有卡片拖拽加 4px 阈值，点按不再触发位置变动' },
      { k: '优化', s: '壁纸来源列表缓存，反复开关面板不再重复请求', d: '来源列表（分类 + 页码 + 搜索）加 30 分钟会话缓存，壁纸面板反复开关 / 翻页直接读缓存；壁纸本体本就落地 IndexedDB，打开新标签页从本地读取不走网络' },
      { k: '调整', s: '快捷方式集中管理 + 空页自动移除 + 组件库添加态跨页', d: '添加抽屉新增「快捷方式」页签（favicon 列表 + 移除 + 数量提示），Dock 图标右键与全局菜单均可直达；删除卡片后空页自动移除（至少保留一页，序号落回前一保留页）；组件库「已添加」改为跨页判定，移除后才能再次添加' },
      { k: '优化', s: '添加抽屉版式重排：3 列瓦片 + 下划线页签 + 单行分类', d: '内容区改 3 列圆角卡面瓦片（图标 56px、名称 13px 单行截断），一屏可见条目数翻倍；分类 chips 单行横向滚动、批量操作降为右上角文字操作、抽屉副标题删除；页签改下划线样式，实心主色只留「确认添加」主按钮；「快捷方式」页签接入分类网格——点击预设站点或书签即添加为底部 Dock 快捷方式（去重 / 上限提示 / 已在 Dock 置灰 / 全部加到 Dock）' },
      { k: '新增', s: '组件尺寸自适应：字体图标随卡片等比缩放', d: '卡片即 CSS 查询容器（container-type:size），--u = max(1px, min(100cqw/自然宽, 100cqh/自然高)) × 字号缩放；比自然尺寸大的卡片等比放大（字体、图标、图标格、圆角、间距一起），更小的保持设计字号不缩小。自然尺寸下逐像素等于设计稿；小档位由「尺寸能力下限」（如新闻 4×4 起、时钟因时间裁切 4×2 起）与 @container 密度降级（窄卡隐热度值 / 熊猫 / 日期 / AI 副标题）兜住' },
      { k: '新增', s: '单组件配置增强：滑杆 / 取色字段 + 通用样式段', d: '字段类型对齐 Storybook argTypes 的 control 词汇并新增 range / color（显示条数变滑杆、倒数日新增强调色）；配置弹窗新增「样式」段——字号缩放、图标缩放、卡片圆角、文字颜色，四项对所有组件生效且按实例保存' },
      { k: '新增', s: '组件配置补齐 + 样式预设 / 默认样式 / 复制同类', d: '13 个原本零配置或只有一项文本的组件补齐专属项（日历显示年月与农历、天气温度单位与区间、倒计时额度格与熊猫、木鱼每次功课、文件夹显示名称…），全组件专属项都落在 1–3 项；「样式」段再补一键预设（紧凑 / 标准 / 宽松）、「设为该组件默认」（新放置的实例自动套用）与「复制到同类卡片」；图标格容器装不下时改为可滚动，格子不再压到看不清' },
      { k: '优化', s: '尺寸能力按实例内容收紧，宽卡多显示一行信息', d: '图标格容器按应用数与标签条带判定「该档能否不滚动装下」，装不下的档位在组件库 / 配置弹窗 / 右键菜单一并置灰（提示区分「低于下限」与「当前内容装不下」）；天气卡与倒数日卡在宽度 ≥ 420px 时增加一行扩展信息（明日温度 / 目标日期），窄卡自动隐去' },
      { k: '新增', s: '搜索框四项设置：占位文字 / 引擎图标 / 点按行为 / 历史条数', d: '占位文字可自定义（留空回默认「<引擎名> 搜索」）；引擎图标可隐藏（切换引擎改到设置或右键菜单）；点引擎图标可选「展开引擎列表」或「切换到下一个」（后者把此前移除的数字键快速切换以可发现的方式补回，出厂不启用）；搜索历史保留条数可调 4–20 条，调小时现有历史一并裁剪' },
      { k: '新增', s: '搜索框第二批：字号 / 距顶 / 分别指定打开方式 / 失焦 / 单条删除', d: '字号 13–20px（极简模式自动 +1px）；距顶距离 20–44px，搜索行、历史与引擎面板、极简模式的偏移全部随其平移（只能往上收：网格下方到 Dock 已排满）；回车与点放大镜可分别指定打开方式（跟随全局 / 本窗口 / 新标签页 / 本窗口搜索）；搜索后自动失焦；历史面板的单条删除按钮可关' },
    ],
  },
  {
    v: '4.3', d: '2026-09-29', items: [
      { k: '移除', s: '登录与账号体系移除，隐私模式并入标准', d: '合并为单套页面（原隐私页在前）；头像菜单去掉「我的」；登录弹窗 / 账号分组 / profile 抽屉删除' },
      { k: '新增', s: '云端同步：改动自动上传、新环境一键恢复', d: '配置注入式连接，服务器地址与访问令牌只存本机浏览器存储；参考服务端 thrilled-server（零依赖 Node 单文件、Bearer 鉴权、原子落盘）。该能力已在 4.4 补丁中整体移除，当前为纯本地使用' },
      { k: '优化', s: 'Dock 可编辑、引擎恢复 v3 设置、历史贴框', d: 'Dock 支持编辑与苹果式放大；头像菜单（4.4 随头像移除）；搜索引擎按 v3 偏好裁剪恢复；搜索历史与引擎下拉贴搜索框底缘 8px、鼠标移开自动关闭' },
    ],
  },
  {
    v: '4.2', d: '2026-09-27', items: [
      { k: '优化', s: '界面风格升级：光影体系 2.0 与弹簧动效', d: '18px 圆角 / 内高光 / 分层投影；弹窗缩放入场、搜索框聚焦光晕；壁纸与出厂皮肤扩到 6 套' },
      { k: '优化', s: '修复 v3 迁移与「恢复为默认界面」', d: 'v3 迁移改为「出厂布局在前 + 迁移图标追加成新页」；「恢复为默认界面」支持「保留我的网址图标」' },
    ],
  },
  {
    v: '4.1', d: '2026-09-27', items: [
      { k: '新增', s: '按 v4 原型补全五面板与九弹窗', d: '含风格皮肤编辑器与广场三页签（广场已于 4.4 移除）' },
      { k: '新增', s: '设置 / 布局 / 皮肤接通本地持久化', d: '整存整取到 chrome.storage.local（浏览器预览回退 localStorage），改动防抖落盘；支持 v3 数据一次性迁移' },
      { k: '新增', s: '壁纸支持本地上传与外链', d: '图片压缩到 1920px / 最大 5MB，支持视频壁纸（mp4 / webm），数据存 IndexedDB' },
      { k: '新增', s: '天气卡接入 Open-Meteo 实况', d: '30min 缓存、坐标偏移 1° 内有效、定位超时降级北京；搜索 / 卡片 / Dock / 导航点击按打开方式真实跳转' },
      { k: '新增', s: '收藏夹导入、布局导出导入、确认弹窗', d: 'bookmarks 树 → 去重 → 网址图标批量落位；一键重置等覆盖类操作均二次确认' },
    ],
  },
  {
    v: '4.0', d: '2026-09-26', items: [
      { k: '调整', s: '仓库重组为 app / core / background / shared', d: '四层分层：core / background 不引用 React；app 不直接调用 chrome.*，一律经 core 层' },
      { k: '调整', s: 'React 18 + Vite 重写视图层', d: '落地 v4 内容模型：卡片 = 对小组件定义的一次引用（18 类）' },
    ],
  },
]

/** 更新记录列表：版本表头单行（当前版本默认展开、旧版本折叠成一行），条目细节点击展开 */
const ChangeLog = () => {
  const [openV, setOpenV] = useState<string>(CHANGELOG[0]?.v ?? '')
  const [openItem, setOpenItem] = useState<string>('')
  return (
    <div className="log-list">
      {CHANGELOG.map((ver, i) => {
        const open = openV === ver.v
        return (
          <div className="log-ver" key={ver.v}>
            <div className="log-head" onClick={() => setOpenV(open ? '' : ver.v)}>
              <span className="log-v">{ver.v}</span>
              {i === 0 && <span className="log-chip">当前</span>}
              <span className="log-sep">·</span>
              <span className="log-date">{ver.d}</span>
              <span className="log-sep">·</span>
              <span className="log-count">{ver.items.length} 项</span>
              <i className={`log-caret${open ? ' open' : ''}`} />
            </div>
            {open && ver.items.map((it, j) => {
              const key = `${ver.v}-${j}`
              const on = openItem === key
              return (
                <div className="log-item" key={key}>
                  <div className={`log-line${it.d === undefined ? '' : ' more'}`}
                    onClick={() => { if (it.d !== undefined) setOpenItem(on ? '' : key) }}>
                    <span className={`log-kind ${LOG_KIND_CLASS[it.k]}`}>{it.k}</span>
                    <span className="log-sum">{it.s}</span>
                    {it.d !== undefined && <i className={`log-caret sm${on ? ' open' : ''}`} />}
                  </div>
                  {on && it.d !== undefined && <div className="log-detail">{it.d}</div>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** 关于分区：更新记录（侧边栏内联，不再用弹窗）+ 快捷键参考（全为只读内容，集中在同一页签） */
const SettingAboutTab = () => (
  <>
    <SecCard t="更新记录" info="当前版本与历史版本：点版本行展开条目，点条目展开实现细节。">
      <ChangeLog />
    </SecCard>
    <SecCard t="快捷键" info="每项都可自定义：单按键只在非输入状态生效，含 Ctrl / Alt 的组合键在任意位置生效（「关闭浮层」在输入状态下也可用）。">
      <ShortcutCard />
    </SecCard>
  </>
)

/** 页签序号 → 分区组件（顺序与 SETTING_TABS 一致） */
const SETTING_PANES: readonly (() => React.ReactElement)[] = [
  SettingSearchTab, SettingGeneralTab, SettingDataTab, SettingAboutTab,
]

const SettingPanel = () => {
  const tab = useApp((st) => st.settingsTab)
  const setTab = useApp((st) => st.setSettingsTab)
  const Pane = SETTING_PANES[tab] ?? SettingSearchTab
  return (
    /* pane-fill：页签 + 卡片按列排布且至少撑满抽屉可视高度，供「数据」分区把危险卡推到面板底部 */
    <div className="pane-fill">
      <DrawerTabs tabs={SETTING_TABS} value={tab} onChange={setTab} />
      <Pane />
    </div>
  )
}

const PANELS: Record<DrawerKey, () => React.ReactElement> = {
  add: AddPanel, personal: PersonalPanel, setting: SettingPanel,
}

/** 抽屉宿主：**memo** —— 它无论开合都会渲染骨架，而拖拽时每帧都会重渲染 App，
 *  memo 让它只在抽屉自己的状态变化时重渲染（它自己订阅 store，不依赖父组件） */
export const Drawer = memo(function Drawer() {
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
})

/* ============================== 弹窗 ============================== */

/* ============================== 配置表单（编辑弹窗与详情「设置」页共用） ============================== */

/** 天气自动刷新间隔候选（分钟）：0 = 关闭，与数据源 30min 缓存对齐 */
const WEATHER_EVERY = [0, 15, 30, 60] as const

/** 天气专属：自动刷新间隔（存设置，天气组件共用） */
const WeatherEveryRow = () => {
  const setSetting = useApp((s) => s.setSetting)
  const every = useApp((s) => s.settings.weatherEvery)
  return (
    <div className="f-row"><label className="f-label">自动刷新间隔</label>
      <div className="cats">{WEATHER_EVERY.map((m) => (
        <div key={m} className={`cat${every === m ? ' active' : ''}`}
          onClick={() => setSetting('weatherEvery', m)}>{m === 0 ? '关闭' : `${m} 分钟`}</div>
      ))}</div>
    </div>
  )
}

/** 通用段：名称与实例透明度 */
const GeneralSection = ({ item }: { item: GridItem }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const c = { ...WIDGET_DEFS[item.t].def, ...item.config }
  return (
    <div className="cfg-group">
      <div className="sec-title">通用</div>
      <div className="f-row"><label className="f-label">名称</label>
        <input className="f-input" value={String(c['label'] ?? '')} placeholder="网址图标用作站点名；文件夹卡显示为卡内名称"
          onChange={(e) => updateConfig(item.id, { label: e.target.value })} /></div>
      <SwitchRow l="透明度跟随全局" d="关掉后可单独设置这张卡片的透明度" on={typeof c['opacity'] !== 'number'}
        onToggle={() => updateConfig(item.id, { opacity: typeof c['opacity'] === 'number' ? null : 0.6 })} />
      {typeof c['opacity'] === 'number' && (
        <NumberRow l="单独透明度" min={0} max={100} value={Math.round(Number(c['opacity']) * 100)}
          unit="%" onInput={(v) => updateConfig(item.id, { opacity: v / 100 })} />
      )}
    </div>
  )
}

/** 样式段：实例级排版变量（不写入定义表，故专属项仍守 ≤3 的上限） */
const StyleSection = ({ item }: { item: GridItem }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const applyStyle = useApp((s) => s.applyStyle)
  const saveStyleDefault = useApp((s) => s.saveStyleDefault)
  const clearStyleDefault = useApp((s) => s.clearStyleDefault)
  const applyStyleToKind = useApp((s) => s.applyStyleToKind)
  const styleDefault = useApp((s) => s.settings.styleDefaults[item.t])
  const c = { ...WIDGET_DEFS[item.t].def, ...item.config }
  return (
    <>
      {/* 数字双列：字号 / 图标一行，圆角与「重置」一行，展开后高度减半 */}
      <div className="num-grid">
        <NumberRow l="字号缩放" min={60} max={160} value={Math.round(num(c['fontScale'], 1) * 100)}
          unit="%" onInput={(v) => updateConfig(item.id, { fontScale: v / 100 })} />
        <NumberRow l="图标缩放" min={60} max={160} value={Math.round(num(c['iconScale'], 1) * 100)}
          unit="%" onInput={(v) => updateConfig(item.id, { iconScale: v / 100 })} />
        <NumberRow l="卡片圆角" min={0} max={28} value={Math.round(num(c['radius'], 16))}
          unit="px" onInput={(v) => updateConfig(item.id, { radius: v })} />
        <div className="cfg-reset-cell">
          <button className="btn sm ghost" title="清除字号 / 图标 / 圆角 / 文字颜色" onClick={() => applyStyle(item.id, {})}>重置样式</button>
        </div>
      </div>
      <ColorField label="文字颜色" auto="跟随风格"
        value={/^#[0-9a-f]{6}$/i.test(String(c['textColor'] ?? '')) ? String(c['textColor']) : '#1f2937'}
        onAuto={() => updateConfig(item.id, { textColor: '' })} onChange={(x) => updateConfig(item.id, { textColor: x })} />
      {/* 一键预设 + 默认样式：预设先清空四个样式键再写入，避免上一份残留 */}
      <div className="btn-row">
        {STYLE_PRESETS.map(([label, patch]) => (
          <button key={label} className="btn sm ghost" onClick={() => applyStyle(item.id, patch)}>{label}</button>
        ))}
      </div>
      <div className="btn-row cfg-adv-actions">
        <button className="btn sm ghost" onClick={() => saveStyleDefault(item.id)}>设为该组件默认</button>
        {styleDefault !== undefined && !isBlankStyle(styleDefault) && (
          <button className="btn sm ghost" onClick={() => clearStyleDefault(item.t)}>取消默认</button>
        )}
        <button className="btn sm ghost" onClick={() => applyStyleToKind(item.id)}>复制到同类卡片</button>
      </div>
    </>
  )
}

/** 尺寸段：六档，超出内容能力的档位禁用 */
const SizeSection = ({ item }: { item: GridItem }) => {
  const resize = useApp((s) => s.resize)
  const def = WIDGET_DEFS[item.t]
  return (
    <div className="cfg-group">
      <div className="sec-title">尺寸</div>
      <div className="f-row"><label className="f-label">尺寸</label>
        <div className="cats">{SIZES.map((sz) => {
          const ok = sizeAllowedFor(item.t, item.config, sz.w, sz.h)
          const lo = minSizeOf(item.t)
          return (
            <div key={`${sz.w}x${sz.h}`}
              className={`cat${item.w === sz.w && item.h === sz.h ? ' active' : ''}${ok ? '' : ' dis'}`}
              title={ok
                ? `${item.w === sz.w && item.h === sz.h ? '当前尺寸 · ' : ''}点选切换`
                : `「${def.n}」最小 ${lo.w}×${lo.h}${sizeAllowed(item.t, sz.w, sz.h) ? '，当前内容在此档需滚动浏览' : '，此档显示不下'}`}
              onClick={() => { if (ok) resize(item.id, sz.w, sz.h) }}>{sz.w}×{sz.h}</div>
          )
        })}</div>
      </div>
      <Hint>
        尺寸能力 {minSizeOf(item.t).w}×{minSizeOf(item.t).h} – {maxSizeOf(item.t).w}×{maxSizeOf(item.t).h}，
        内容按当前尺寸等比缩放（自然尺寸 {def.units.w}×{def.units.h} 下与设计稿一致）。
      </Hint>
    </div>
  )
}

/** 专属段：按定义表渲染（多选至少保留一项）；天气另带自动刷新间隔 */
const KindSection = ({ item }: { item: GridItem }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const def = WIDGET_DEFS[item.t]
  const c = { ...def.def, ...item.config }
  const field = (f: WidgetField) => {
    const v = c[f.k]
    if (f.t === 'bool') return <SwitchRow key={f.k} l={f.l} on={v === true} onToggle={() => updateConfig(item.id, { [f.k]: !(v === true) })} />
    if (f.t === 'range') {
      const cur = typeof v === 'number' && Number.isFinite(v) ? v : (f.min ?? 0)
      return (
        <NumberRow key={f.k} l={f.l} min={f.min ?? 0} max={f.max ?? 100} value={cur}
          unit={f.unit ?? ''} onInput={(x) => updateConfig(item.id, { [f.k]: x })} />
      )
    }
    if (f.t === 'color') {
      /* 留空 = 跟随主题（ColorField 的「跟随主题」按钮写回空串） */
      const hex = /^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v) : '#3B82F6'
      return (
        <ColorField key={f.k} label={f.l} value={hex} auto="跟随风格"
          onAuto={() => updateConfig(item.id, { [f.k]: '' })} onChange={(x) => updateConfig(item.id, { [f.k]: x })} />
      )
    }
    if (f.t === 'sel') return (
      <div className="f-row" key={f.k}><label className="f-label">{f.l}</label>
        <div className="cats">{f.o?.map((o) => (
          <div key={o} className={`cat${o === v ? ' active' : ''}`} onClick={() => updateConfig(item.id, { [f.k]: o })}>{o}</div>
        ))}</div>
      </div>
    )
    if (f.t === 'multi') {
      /* 多选：点一下加入 / 再点移除；至少保留一项（全空会让卡片没有可显示的模式） */
      const cur = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
      const opts = f.o ?? []
      const toggle = (o: string): void => {
        const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]
        updateConfig(item.id, { [f.k]: next.length > 0 ? opts.filter((x) => next.includes(x)) : [o] })
      }
      return (
        <div className="f-row" key={f.k}><label className="f-label">{f.l}</label>
          <div className="cats">{opts.map((o) => (
            <div key={o} className={`cat${cur.includes(o) ? ' active' : ''}`} onClick={() => toggle(o)}>{o}</div>
          ))}</div>
        </div>
      )
    }
    const text = f.t === 'list' && Array.isArray(v) ? v.join(', ') : String(v ?? '')
    return (
      <div className="f-row" key={f.k}><label className="f-label">{f.l}</label>
        <input className="f-input" type={f.t === 'num' ? 'number' : 'text'} value={text} placeholder={f.ph ?? ''}
          onChange={(e) => updateConfig(item.id, { [f.k]: f.t === 'list' ? e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : f.t === 'num' ? Number(e.target.value || 0) : e.target.value })} />
      </div>
    )
  }
  return (
    <div className="cfg-group">
      {def.fields.length > 0 && <div className="sec-title">专属</div>}
      {item.t === 'countdown' ? <CountdownSettings item={item} /> : def.fields.map(field)}
      {item.t === 'clock' && (
        <SwitchRow l="显示问候语" d="日期行右下再显示「上午好 / 晚上好」"
          on={bool(c['showGreeting'])} onToggle={() => updateConfig(item.id, { showGreeting: !bool(c['showGreeting']) })} />
      )}
      {item.t === 'weather' && <WeatherEveryRow />}
    </div>
  )
}

/** 配置表单：通用 → 专属 → 尺寸；低频的样式与批量操作收进默认折叠的高级区 */
const CardConfigBody = ({ item }: { item: GridItem }) => (
  <div className="cfg-form">
    <GeneralSection item={item} />
    <KindSection item={item} />
    <SizeSection item={item} />
    <details className="cfg-adv">
      <summary>个性化（高级）</summary>
      <div className="cfg-adv-body cfg-group"><StyleSection item={item} /></div>
    </details>
  </div>
)

/** 独立配置弹窗（卡片悬浮「编辑」进入）：改动即时保存，故只保留「完成」 */
const EditCardModal = ({ item }: { item: GridItem }) => {
  const setModal = useApp((s) => s.setModal)
  const def = WIDGET_DEFS[item.t]
  return (
    <>
      {/* 改动即时生效，「完成」只是关闭：钉在标题行，长表单也不用滚到底 */}
      <div className="dt-head cfg-head">
        <h2>配置 · {def.n}</h2>
        <button className="btn sm" onClick={() => setModal(null)}>完成</button>
      </div>
      <p className="sub">位置与尺寸属于布局；下面的字段只改本实例，修改即时生效。</p>
      <CardConfigBody item={item} />
    </>
  )
}

/* ============================== 卡片详情 ============================== */

/**
 * 卡片详情（概览 / 设置两级）：
 * - 概览只放核心信息与高频操作，低频配置收进「设置」，面板高度不再被表单撑满；
 * - 「设置」复用配置表单（通用 / 专属 / 样式 / 尺寸），不再有职责模糊的「编辑配置」按钮；
 * - 区块内的主操作固定在标题行右侧（SecHead），不随内容落到滚动区外。
 */

/** 详情区块标题行：标题 +（可选）说明 + 右侧高频操作 */
const SecHead = ({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) => (
  <div className="dt-sec-head">
    <span className="dt-sec-title">{title}</span>
    {sub !== undefined && sub !== '' && <span className="dt-sec-sub">{sub}</span>}
    {action !== undefined && <div className="dt-sec-act">{action}</div>}
  </div>
)

/** 区块说明折叠：低频帮助文案收进「?」，默认不占版面 */
const HelpTip = ({ children }: { children: React.ReactNode }) => (
  <details className="dt-help">
    <summary aria-label="说明">?</summary>
    <div className="dt-help-body">{children}</div>
  </details>
)

/** 行内文本：双击进入编辑，回车 / 失焦保存，Esc 取消（父级控制编辑态，便于行尾铅笔按钮触发） */
const InlineEditText = ({ value, editing, onStart, onCommit, onCancel, className = 'dt-todo-txt' }: {
  value: string
  editing: boolean
  onStart: () => void
  onCommit: (v: string) => void
  onCancel: () => void
  className?: string
}) => {
  const [draft, setDraft] = useState(value)
  useEffect(() => { if (editing) setDraft(value) }, [editing, value])
  if (!editing) {
    return <span className={className} onDoubleClick={onStart} title="双击编辑">{value}</span>
  }
  return (
    <input className="f-input dt-inline" autoFocus value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft)
        else if (e.key === 'Escape') onCancel()
      }} />
  )
}

/** 待办清单详情：清单存在卡片 config.items，可勾选 / 改名 / 删除 / 添加 */
const TodoDetail = ({ item }: { item: GridItem }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const c = cfg(item)
  const [items, setItems] = useState<TodoEntry[]>(() => normTodoItems(c['items']))
  const [draft, setDraft] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const commit = (next: TodoEntry[]): void => {
    setItems(next)
    updateConfig(item.id, { items: next })
  }
  const saveText = (i: number, v: string): void => {
    const txt = v.trim()
    if (txt !== '') commit(items.map((x, j) => (j === i ? { ...x, txt } : x)))
    setEditIdx(null)
  }
  const done = items.filter((x) => x.done).length
  return (
    <>
      <SecHead title={str(c['title'], '待办')} sub={`${done}/${items.length} 已完成`} />
      <div className="dt-list flat">
        {items.length === 0 && <Hint>还没有条目，在下面输入第一条待办。</Hint>}
        {items.map((t, i) => (
          <div className="dt-todo-row" key={`${i}-${t.txt}`}>
            <input type="checkbox" checked={t.done}
              onChange={() => commit(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
            <InlineEditText value={t.txt} editing={editIdx === i} onStart={() => setEditIdx(i)}
              onCommit={(v) => saveText(i, v)} onCancel={() => setEditIdx(null)}
              className={`dt-todo-txt${t.done ? ' done' : ''}`} />
            <div className="dt-row-del always" title="编辑" onClick={() => setEditIdx(i)}>{Icon.edit()}</div>
            <div className="dt-row-del always" title="删除" onClick={() => commit(items.filter((_, j) => j !== i))}>{Icon.trash()}</div>
          </div>
        ))}
      </div>
      <div className="f-row">
        <input className="f-input" placeholder="输入待办事项，回车添加" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            const txt = draft.trim()
            if (e.key === 'Enter' && txt !== '') { commit([...items, { txt, done: false }]); setDraft('') }
          }} />
      </div>
    </>
  )
}

/**
 * 城市搜索（全详情唯一一个搜索框）：地理编码（Open-Meteo），候选按人口降序排。
 * 选中后由结果行上的两个动作决定落点：设为主定位（weatherCity）/ 加入城市列表（weatherCities）。
 */
const CitySearch = ({ onPick }: { onPick: (h: GeoHit, act: 'main' | 'add') => void }) => {
  const showToast = useApp((s) => s.showToast)
  const [kw, setKw] = useState('')
  const [hits, setHits] = useState<GeoHit[]>([])
  const [busy, setBusy] = useState(false)
  const search = async (): Promise<void> => {
    if (kw.trim() === '') return
    setBusy(true)
    const list = await searchCities(kw)
    setHits(list)
    setBusy(false)
    if (list.length === 0) showToast('没有找到匹配的城市')
  }
  const pick = (h: GeoHit, act: 'main' | 'add'): void => {
    onPick(h, act)
    setHits([])
    setKw('')
  }
  return (
    <>
      <div className="f-row dt-search-row">
        <input className="f-input" placeholder="搜索城市，如 杭州 / Tokyo" value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search() }} />
        <button className="btn sm ghost" onClick={() => { void search() }}>{busy ? '搜索中…' : '搜索'}</button>
      </div>
      {hits.length > 0 && (
        <div className="dt-list flat">
          {hits.map((h) => (
            <div className="dt-todo-row" key={`${h.name}-${h.lat}-${h.lon}`}>
              <span className="dt-todo-txt">{h.name}</span>
              <span className="dt-host">{[h.admin1, h.country].filter((x) => x !== '').join(' · ')}</span>
              <div className="dt-city-act">
                <button className="dt-mini" onClick={() => pick(h, 'main')}>设为主定位</button>
                <button className="dt-mini" onClick={() => pick(h, 'add')}>加入列表</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** 日历格（月视图 / 周视图共用）：公历日 + 农历（初一显月名）+ 日程数量角标；节日有虚线下划线提示 */
const CalCell = ({ t, sel, todayKey, count, onPick }: {
  t: { y: number; m: number; d: number; out?: boolean }
  sel: string
  todayKey: string
  /** 该天的日程条数：0 不显示角标，一眼看出哪天有安排 */
  count: number
  onPick: (t: { y: number; m: number; d: number }) => void
}) => {
  const key = dayKey(t.y, t.m, t.d)
  const lunar = solarToLunar(t.y, t.m, t.d)
  const fest = festivalsOf(t.y, t.m, t.d)
  const tip = `${t.y}-${p2(t.m)}-${p2(t.d)} ${lunar.monthCn}${lunar.dayCn}${fest.length > 0 ? ` · ${fest.join(' · ')}` : ''}${count > 0 ? ` · ${count} 条日程` : ''}`
  return (
    <button type="button" data-tip={tip}
      className={`dt-cal-cell${t.out === true ? ' out' : ''}${key === sel ? ' sel' : ''}${key === todayKey ? ' today' : ''}${fest.length > 0 ? ' fest' : ''}`}
      onClick={() => onPick(t)}>
      <span className="dt-cal-d">{t.d}</span>
      <span className="dt-cal-l">{lunar.day === 1 ? lunar.monthCn : lunar.dayCn}</span>
      {count > 0 && <i className="dt-cal-badge">{count > 9 ? '9+' : count}</i>}
    </button>
  )
}

/** 星期表头（月 / 周视图共用，周日起头） */
const CalWeekdayRow = () => (
  <>
    {'日一二三四五六'.split('').map((w, i) => (
      <div key={w} className={`dt-cal-wd${i === 0 || i === 6 ? ' end' : ''}`}>{w}</div>
    ))}
  </>
)

/** 月视图：6 行 × 7 列月历（补齐格给出真实日期，点中上 / 下月格会顺手翻月） */
const CalMonthView = ({ y, m, sel, todayKey, events, onPick }: {
  y: number; m: number; sel: string; todayKey: string
  events: ScheduleEvent[]
  onPick: (t: { y: number; m: number; d: number }) => void
}) => (
  <div className="dt-cal">
    <CalWeekdayRow />
    {monthCells(y, m).flat().map((cell) => (
      <CalCell key={dayKey(cell.year, cell.month, cell.day)}
        t={{ y: cell.year, m: cell.month, d: cell.day, out: !cell.inMonth }}
        sel={sel} todayKey={todayKey}
        count={events.filter((e) => e.date === dayKey(cell.year, cell.month, cell.day)).length}
        onPick={onPick} />
    ))}
  </div>
)

/** 周视图：选中日期所在一周（周日开始），快速在周与周之间定位 */
const CalWeekView = ({ anchor, sel, todayKey, events, onPick }: {
  anchor: Date; sel: string; todayKey: string
  events: ScheduleEvent[]
  onPick: (t: { y: number; m: number; d: number }) => void
}) => {
  const start = startOfWeek(anchor)
  return (
    <div className="dt-cal dt-cal-week">
      <CalWeekdayRow />
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => (
        <CalCell key={dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate())}
          t={{ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }}
          sel={sel} todayKey={todayKey}
          count={events.filter((e) => e.date === dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate())).length}
          onPick={onPick} />
      ))}
    </div>
  )
}

/** 年视图：12 个迷你月（只显示公历日），点月份标题进月视图，点具体日期直接选中并回到月视图 */
const CalYearView = ({ y, sel, todayKey, onMonth, onPick }: {
  y: number; sel: string; todayKey: string
  onMonth: (m: number) => void
  onPick: (t: { y: number; m: number; d: number }) => void
}) => (
  <div className="dt-cal-year">
    {Array.from({ length: 12 }, (_, mi) => (
      <div className="dtc-ym" key={mi}>
        <button type="button" className="dtc-ym-title" onClick={() => onMonth(mi)}>{mi + 1}月</button>
        <div className="dtc-ym-grid">
          {'日一二三四五六'.split('').map((w) => <i key={w} className="dtc-ym-wd">{w}</i>)}
          {monthCells(y, mi).flat().map((cell) => {
            const key = dayKey(cell.year, cell.month, cell.day)
            if (!cell.inMonth) return <i key={key} className="dtc-ym-d out" />
            return (
              <button type="button" key={key}
                className={`dtc-ym-d${key === sel ? ' sel' : ''}${key === todayKey ? ' today' : ''}`}
                onClick={() => onPick({ y: cell.year, m: cell.month, d: cell.day })}>
                {cell.day}
              </button>
            )
          })}
        </div>
      </div>
    ))}
  </div>
)

/**
 * 选中日期信息（颜色层级：公历日期与星期是重点，农历 / 干支次之）。
 * 宜忌默认收起：它夹在月历与日程之间会把「写日程」推出折叠线，节日标签仍常显（选日子要用）。
 */
const CalSelInfo = ({ selDate, selLunar, selFests, selAlmanac }: {
  selDate: { y: number; m: number; d: number }
  selLunar: ReturnType<typeof solarToLunar>
  selFests: string[]
  selAlmanac: ReturnType<typeof almanacOf>
}) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="dt-cal-info">
      <div className="dt-cal-sel">
        <span className="dcs-date">{selDate.m}月{selDate.d}日 周{'日一二三四五六'[new Date(selDate.y, selDate.m - 1, selDate.d).getDay()]}</span>
        <span className="dcs-sub">农历 {selLunar.monthCn}{selLunar.dayCn} · {selLunar.ganZhiYear}{selLunar.zodiac}年 · {selAlmanac.officer}日</span>
        {selFests.map((f) => <span className="dt-tag fest" key={f}>{f}</span>)}
        <button className={`dt-link dt-almanac-btn${open ? ' open' : ''}`} onClick={() => setOpen((v) => !v)}>
          宜忌{open ? ' ▴' : ' ▾'}
        </button>
      </div>
      {open && (
        <div className="dcs-chips">
          {selAlmanac.good.length > 0 && <span className="dt-tag yi">宜 {selAlmanac.good.join('、')}</span>}
          {selAlmanac.bad.length > 0 && <span className="dt-tag ji">忌 {selAlmanac.bad.join('、')}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * 日历详情：月 / 周 / 年三视图快速定位 + 选中日期的日程。
 *
 * 视图由页签切换（月 | 周 | 年），‹ › 按当前视图的粒度步进（月 ±1 月、周 ±7 天、年 ±1 年），
 * 「今天」一键回到当日；日程仍按「选中日期」写入，勾选 / 删除即时保存。
 * 月历每格显示公历日 + 农历日（初一显示月名），有日程的日子带点、有节日的日子高亮。
 */
const CalendarSchedule = ({ item, now }: { item: GridItem; now: Date }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const c = cfg(item)
  const [events, setEvents] = useState<ScheduleEvent[]>(() => normScheduleEvents(c['events']))
  const [draft, setDraft] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [gran, setGran] = useState<'month' | 'week' | 'year'>('month')
  const [view, setView] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }))
  const [sel, setSel] = useState(() => dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate()))
  const commit = (next: ScheduleEvent[]): void => {
    setEvents(next)
    updateConfig(item.id, { events: next })
  }
  const todayKey = dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const selDate = ((): { y: number; m: number; d: number } => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sel)
    return m === null
      ? { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
      : { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  })()
  const selTime = new Date(selDate.y, selDate.m - 1, selDate.d)
  const selLunar = solarToLunar(selDate.y, selDate.m, selDate.d)
  const selFests = festivalsOf(selDate.y, selDate.m, selDate.d)
  const selAlmanac = almanacOf(selDate.y, selDate.m, selDate.d)
  const dayList = events.filter((e) => e.date === sel)
  const upcoming = upcomingEvents(events, now, 6)
  /** 选中某天并让月视图跟着落到该天所在月（周视图跨月步进后切回月视图不跳变） */
  const applyDay = (t: { y: number; m: number; d: number }): void => {
    setSel(dayKey(t.y, t.m, t.d))
    setView({ y: t.y, m: t.m - 1 })
  }
  const step = (delta: number): void => {
    if (gran === 'month') {
      const d = new Date(view.y, view.m + delta, 1)
      setView({ y: d.getFullYear(), m: d.getMonth() })
    } else if (gran === 'week') {
      applyDay({ y: addDays(selTime, delta * 7).getFullYear(), m: addDays(selTime, delta * 7).getMonth() + 1, d: addDays(selTime, delta * 7).getDate() })
    } else {
      setView({ y: view.y + delta, m: view.m })
    }
  }
  const ws = startOfWeek(selTime)
  const we = addDays(ws, 6)
  const head = gran === 'month'
    ? `${view.y} 年 ${view.m + 1} 月`
    : gran === 'week'
      ? `${ws.getFullYear()} 年 第 ${isoWeekOf(selTime).week} 周 · ${ws.getMonth() + 1}/${ws.getDate()} – ${we.getMonth() + 1}/${we.getDate()}`
      : `${view.y} 年`
  const selLabel = `${selDate.m}月${selDate.d}日 周${'日一二三四五六'[selTime.getDay()]}`
  const saveText = (e: ScheduleEvent, v: string): void => {
    const text = v.trim()
    if (text !== '') commit(events.map((x) => (x === e ? { ...x, text } : x)))
    setEditIdx(null)
  }
  return (
    <>
      <div className="dt-cal-top">
        <button className="dt-cal-nav" onClick={() => step(-1)}
          aria-label={gran === 'month' ? '上个月' : gran === 'week' ? '上一周' : '上一年'}>‹</button>
        <span className="dt-cal-head" style={{ margin: 0 }}>{head}</span>
        <button className="dt-cal-nav" onClick={() => step(1)}
          aria-label={gran === 'month' ? '下个月' : gran === 'week' ? '下一周' : '下一年'}>›</button>
        <div className="dt-cal-seg">
          {([['month', '月'], ['week', '周'], ['year', '年']] as const).map(([k, label]) => (
            <div key={k} className={`cat${gran === k ? ' active' : ''}`} onClick={() => setGran(k)}>{label}</div>
          ))}
        </div>
        <button className="btn sm ghost" onClick={() => { setView({ y: now.getFullYear(), m: now.getMonth() }); setSel(todayKey) }}>今天</button>
      </div>
      {gran === 'month' && (
        <CalMonthView y={view.y} m={view.m} sel={sel} todayKey={todayKey} events={events}
          onPick={(t) => {
            setSel(dayKey(t.y, t.m, t.d))
            if (t.m !== view.m + 1 || t.y !== view.y) setView({ y: t.y, m: t.m - 1 })
          }} />
      )}
      {gran === 'week' && (
        <CalWeekView anchor={selTime} sel={sel} todayKey={todayKey} events={events} onPick={applyDay} />
      )}
      {gran === 'year' && (
        <CalYearView y={view.y} sel={sel} todayKey={todayKey}
          onMonth={(m) => { setView({ y: view.y, m }); setGran('month') }}
          onPick={(t) => { applyDay(t); setGran('month') }} />
      )}
      <CalSelInfo selDate={selDate} selLunar={selLunar} selFests={selFests} selAlmanac={selAlmanac} />
      {/* 主路径：选日子 → 写日程。目标日期固定在输入框左侧，避免加错天 */}
      <SecHead title="日程" sub={selLabel} />
      <div className="dt-add-line">
        <span className="dt-add-date">{selDate.m}/{selDate.d}</span>
        <input className="f-input" placeholder="写下日程，回车添加" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            const txt = draft.trim()
            if (e.key === 'Enter' && txt !== '') { commit([...events, { date: sel, text: txt, done: false }]); setDraft('') }
          }} />
      </div>
      <div className="dt-list flat">
        {dayList.length === 0 && <Hint>这一天还没有日程。</Hint>}
        {dayList.map((e, i) => (
          <div className="dt-todo-row" key={`${i}-${e.text}`}>
            <input type="checkbox" checked={e.done}
              onChange={() => commit(events.map((x) => (x === e ? { ...x, done: !x.done } : x)))} />
            <InlineEditText value={e.text} editing={editIdx === i} onStart={() => setEditIdx(i)}
              onCommit={(v) => saveText(e, v)} onCancel={() => setEditIdx(null)}
              className={`dt-todo-txt${e.done ? ' done' : ''}`} />
            <div className="dt-row-del always" title="编辑" onClick={() => setEditIdx(i)}>{Icon.edit()}</div>
            <div className="dt-row-del always" title="删除" onClick={() => commit(events.filter((x) => x !== e))}>{Icon.trash()}</div>
          </div>
        ))}
      </div>
      {upcoming.length > 0 && (
        <>
          <SecHead title="接下来" sub="点一行跳到那天" />
          <div className="dt-list flat">
            {upcoming.map((e, i) => (
              <div className="dt-todo-row" key={`u${i}-${e.text}`} style={{ cursor: 'pointer' }}
                onClick={() => {
                  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date)
                  if (m !== null) setView({ y: Number(m[1]), m: Number(m[2]) - 1 })
                  setSel(e.date)
                }}>
                <span className="dt-tag">{e.date.slice(5)}</span>
                <span className="dt-todo-txt">{e.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
const FavDetail = () => {
  const [entries, setEntries] = useState<BookmarkEntry[] | null>(null)
  const [kw, setKw] = useState('')
  useEffect(() => {
    void (async () => {
      const tree = await readBookmarkTree()
      setEntries(tree === null ? null : collectBookmarks(tree))
    })()
  }, [])
  if (entries === null) return <Hint>正在读取浏览器收藏夹…（开发预览环境没有书签数据，请在扩展中使用）</Hint>
  if (entries.length === 0) return <Hint>浏览器收藏夹里没有可展示的 http(s) 书签。</Hint>
  const k = kw.trim().toLowerCase()
  const shown = k === '' ? entries : entries.filter((e) => e.label.toLowerCase().includes(k) || e.url.toLowerCase().includes(k))
  return (
    <>
      <div className="f-row">
        <input className="f-input" placeholder={`过滤 ${entries.length} 条书签（名称或网址）`} value={kw}
          onChange={(e) => setKw(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <Hint>没有匹配「{kw.trim()}」的书签。</Hint>
      ) : (
        <div className="nv-grid" style={{ maxHeight: 320, overflowY: 'auto', alignContent: 'start' }}>
          {shown.map((e) => (
            <div className="nv-item" key={e.url} title={`${e.label}\n${e.url}`}
              onClick={() => { void openLink(e.url, useApp.getState().settings.openMode, 'link') }}>
              <SiteIcon url={e.url} name={e.label} cls="nv-ico" fs={15} size={40} />
              <div className="nv-name">{e.label}</div>
            </div>
          ))}
        </div>
      )}
      <Hint>共 {entries.length} 条 · 点击按「打开方式」设置跳转；网址也可在过滤框里搜。</Hint>
    </>
  )
}

/**
 * 自定义倒数日行：表单即列表行（改名 / 改日期 / 农历切换 / 删除都在这行里）。
 * 农历条目只改月 / 日，date 由农历重算（不能拿阳历日期去凑）。
 */
const CountdownEntryRow = ({ entry, now, onChange, onDelete }: {
  entry: CountdownEntry
  now: Date
  onChange: (next: CountdownEntry) => void
  onDelete: () => void
}) => {
  const lunar = entry.lunar
  const setLunar = (field: 'month' | 'day', raw: string): void => {
    const v = Number(raw)
    if (!Number.isFinite(v)) return
    const next = { ...(lunar ?? { month: 1, day: 1 }), [field]: Math.max(1, Math.min(field === 'month' ? 12 : 30, Math.trunc(v))) }
    onChange({ ...entry, lunar: next, date: nextLunarDate(next, now) ?? entry.date })
  }
  /* 关掉农历：把当前算出的日期留在 date 上，条目变成普通阳历倒数日 */
  const toggle = (): void => {
    if (lunar === undefined) {
      const l = { month: 1, day: 1 }
      onChange({ ...entry, lunar: l, date: nextLunarDate(l, now) ?? entry.date })
      return
    }
    const rest: CountdownEntry = { name: entry.name, date: entry.date }
    if (entry.note !== undefined) rest.note = entry.note
    if (entry.created !== undefined) rest.created = entry.created
    onChange(rest)
  }
  return (
    <div className="cd-edit">
      <input className="f-input cd-name" value={entry.name} placeholder="名称"
        onChange={(e) => onChange({ ...entry, name: e.target.value })} />
      {lunar === undefined ? (
        <input className="f-input cd-date" value={entry.date} placeholder="2027-01-01"
          onChange={(e) => onChange({ ...entry, date: e.target.value })} />
      ) : (
        <span className="cd-edit-lunar">
          农历
          <input className="f-input cd-num" type="number" min={1} max={12} value={lunar.month}
            onChange={(e) => setLunar('month', e.target.value)} />月
          <input className="f-input cd-num" type="number" min={1} max={30} value={lunar.day}
            onChange={(e) => setLunar('day', e.target.value)} />日
        </span>
      )}
      <button className="dt-mini" onClick={toggle}>{lunar === undefined ? '农历' : '阳历'}</button>
      <div className="dt-row-del always" title="删除" onClick={onDelete}>{Icon.trash()}</div>
    </div>
  )
}

/**
 * 倒数列表管理：默认只显示前 5 条（展开全部后由面板统一滚动，不再套内嵌滚动条）；
 * 自定义条目行内可编辑，节日条目可单独隐藏；「?」里是低频说明。
 */
const CountdownEntries = ({ item, now }: { item: GridItem; now: Date }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const c = cfg(item)
  const [items, setItems] = useState<CountdownEntry[]>(() => normCountdownEntries(c['entries'], now))
  const [open, setOpen] = useState(false)
  const hidden = Array.isArray(c['hiddenFestivals'])
    ? c['hiddenFestivals'].filter((x): x is string => typeof x === 'string')
    : []
  const commit = (next: CountdownEntry[]): void => {
    setItems(next)
    updateConfig(item.id, { entries: next })
  }
  const rows = upcomingRows(items, bool(c['showFestivals']), now, hidden)
  const shown = open ? rows : rows.slice(0, 5)
  const replaceAt = (i: number, next: CountdownEntry): void => commit(items.map((x, j) => (j === i ? next : x)))
  const addEntry = (): void => {
    commit([...items, { name: '新的倒数日', date: `${now.getFullYear() + 1}-01-01`, created: Date.now() }])
    setOpen(true)
  }
  return (
    <>
      <SecHead title="倒数列表" sub={`${rows.length} 条 · 按剩余天数`} action={
        <>
          <button className="btn sm ghost" onClick={addEntry}>+ 添加</button>
          <HelpTip>
            节日库：元旦 / 春节 / 清明 / 劳动节 / 端午 / 中秋 / 国庆（农历节日按真实农历换算）。
            自定义条目可切换「农历」按每年同一农历日循环；改名 / 改日期即时保存。
          </HelpTip>
        </>
      } />
      <div className="dt-list flat">
        {shown.length === 0 && <Hint>暂无条目。点右上「+ 添加」新建一条。</Hint>}
        {shown.map((r) => {
          if (r.festival) {
            return (
              <div className="dt-todo-row" key={`f-${r.name}`}>
                <span className="dt-tag fest">节日</span>
                <span className="dt-todo-txt">{r.name}</span>
                <span className="dt-host">{r.date} · {Math.abs(r.days)} 天{r.days < 0 ? '前' : ''}</span>
                <button className="dt-mini" onClick={() => updateConfig(item.id, { hiddenFestivals: [...hidden, r.name] })}>隐藏</button>
              </div>
            )
          }
          const index = r.entryIndex ?? -1
          const entry = items[index]
          if (entry === undefined) return null
          return (
            <CountdownEntryRow key={`e-${index}`} entry={entry} now={now}
              onDelete={() => commit(items.filter((_, j) => j !== index))}
              onChange={(next) => replaceAt(index, next)} />
          )
        })}
      </div>
      {rows.length > 5 && (
        <button className="dt-more" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : `展开全部 ${rows.length} 条`}
        </button>
      )}
      {hidden.length > 0 && (
        <button className="dt-more" onClick={() => updateConfig(item.id, { hiddenFestivals: [] })}>
          恢复隐藏的 {hidden.length} 个节日
        </button>
      )}
    </>
  )
}

/** 通用输入行（标签 + 单输入框）：详情「设置」页的模式配置共用 */
const TextRow = ({ label, value, placeholder, onChange }: {
  label: string; value: string; placeholder: string; onChange: (v: string) => void
}) => (
  <div className="f-row"><label className="f-label">{label}</label>
    <input className="f-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>
)

/** 多选 chips 行（显示模式 / 天数单位这类短选项） */
const CatsRow = ({ label, options, active, onPick }: {
  label: string; options: readonly string[]; active: readonly string[]; onPick: (o: string) => void
}) => (
  <div className="f-row"><label className="f-label">{label}</label>
    <div className="cats">{options.map((o) => (
      <div key={o} className={`cat${active.includes(o) ? ' active' : ''}`} onClick={() => onPick(o)}>{o}</div>
    ))}</div>
  </div>
)

const COUNTDOWN_MODES_ALL = ['下班倒计时', '倒数日', '纪念日'] as const

/**
 * 倒计时设置：先选模式，再只显示该模式需要的字段（下班时刻只对应下班倒计时、
 * 目标日期只对应倒数日……），「多模式轮播」只在真的勾了多个模式时出现。
 */
const CountdownSettings = ({ item }: { item: GridItem }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const c = cfg(item)
  const modes = normModes(c['modes'], c['mode'])
  const patch = (v: Record<string, unknown>): void => updateConfig(item.id, v)
  const toggle = (m: string): void => {
    const next = modes.includes(m as never) ? modes.filter((x) => x !== m) : [...modes, m]
    /* 至少留一个模式：全取消时把刚点的那个留下 */
    patch({ modes: COUNTDOWN_MODES_ALL.filter((x) => next.includes(x)) })
  }
  return (
    <>
      <CatsRow label="显示模式" options={COUNTDOWN_MODES_ALL} active={modes} onPick={toggle} />
      {modes.length > 1 && (
        <SwitchRow l="多模式轮播" d="卡片按顺序轮换显示（每 6 秒一个）；关掉则固定第一个"
          on={bool(c['rotate'])} onToggle={() => patch({ rotate: !bool(c['rotate']) })} />
      )}
      {modes.includes('下班倒计时') && (
        <TextRow label="下班时刻" value={str(c['at'], '18:00')} placeholder="18:00" onChange={(v) => patch({ at: v })} />
      )}
      {modes.includes('倒数日') && (
        <TextRow label="目标日期" value={str(c['date'], '2027-01-01')} placeholder="2027-01-01" onChange={(v) => patch({ date: v })} />
      )}
      {modes.includes('纪念日') && (
        <>
          <TextRow label="起始日期" value={str(c['annDate'], '2020-05-20')} placeholder="2020-05-20" onChange={(v) => patch({ annDate: v })} />
          <TextRow label="纪念日标题" value={str(c['title'])} placeholder="与MiNa相识" onChange={(v) => patch({ title: v })} />
          <CatsRow label="天数单位" options={['天', '周', '月', '年']} active={[str(c['unitLabel'], '天')]}
            onPick={(u) => patch({ unitLabel: u })} />
        </>
      )}
      <SwitchRow l="显示节日倒数" on={bool(c['showFestivals'])} onToggle={() => patch({ showFestivals: !bool(c['showFestivals']) })} />
    </>
  )
}

/** 天气实况主行：温度大字 > 天气现象 > 地名（层级即信息优先级），动效图标只做氛围 */
const WeatherNow = ({ d, toF, showRange, fx }: {
  d: WeatherData
  toF: boolean
  showRange: boolean
  fx: WeatherFx
}) => {
  const conv = (v: number): number => (toF ? Math.round(v * 9 / 5 + 32) : Math.round(v))
  const range = `${conv(d.daily[0]?.min ?? 0)}°/${conv(d.daily[0]?.max ?? 0)}°`
  return (
    <div className="wx-now">
      <span className="dt-temp">{conv(d.currentTemp)}°</span>
      <div className="dt-now-main">
        <span className="dt-cond">{weatherText(d.currentCode)}{showRange ? ` ${range}` : ''}</span>
        <span className="dt-host">{d.source === 'geo' ? (d.place !== '' ? d.place : '当前位置') : `手选城市 · ${d.place}`}</span>
      </div>
      <div className="wx-now-ico"><WeatherGlyph fx={fx} /></div>
    </div>
  )
}

/** 天气 hero：主信息 + 图标层 + 只在详情出现的光影 / 粒子场景层 */
const WeatherHero = ({ d, toF, showRange, now }: {
  d: WeatherData
  toF: boolean
  showRange: boolean
  now: Date
}) => {
  const isDay = d.currentIsDay ?? isDayAt(now.getHours())
  const fx = weatherFxOf(d.currentCode, d.currentTemp, isDay)
  return (
    <div className={`wx-hero${fx.night ? ' is-night' : ''}${fx.hot ? ' is-hot' : ''}${fx.cold ? ' is-cold' : ''}`}>
      <WeatherScene fx={fx} />
      <WeatherNow d={d} toF={toF} showRange={showRange} fx={fx} />
    </div>
  )
}

/**
 * 天气刷新：点下去立刻进入「刷新中」并旋转图标，至少保持 600ms（避免缓存命中时一闪而过）；
 * 成功显示「已更新」+ 勾，失败显示「未更新」+ 叉，1.6s 后回到「刷新」。
 */
const WeatherRefreshButton = () => {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'fail'>('idle')
  const timer = useRef<number | null>(null)
  const alive = useRef(true)
  const busy = useRef(false)
  useEffect(() => {
    /* StrictMode 会 setup → cleanup → setup；这里必须把 alive 重置回 true */
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])
  const run = async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    setState('loading')
    const before = useApp.getState().weather?.ts ?? 0
    const started = Date.now()
    let ok = false
    try {
      await useApp.getState().loadWeather(true, true)
      ok = (useApp.getState().weather?.ts ?? 0) > before
    } catch {
      ok = false
    } finally {
      busy.current = false
    }
    if (!alive.current) return
    const wait = Math.max(0, 600 - (Date.now() - started))
    timer.current = window.setTimeout(() => {
      if (!alive.current) return
      setState(ok ? 'done' : 'fail')
      timer.current = window.setTimeout(() => { if (alive.current) setState('idle') }, 1600)
    }, wait)
  }
  return (
    <button type="button" className={`btn sm ghost wx-refresh is-${state}`}
      disabled={state === 'loading'} aria-live="polite"
      title={state === 'loading' ? '正在刷新天气…' : '立即刷新天气'}
      onClick={() => { void run() }}>
      <span className="wx-refresh-ico" aria-hidden="true">
        {state === 'done' ? <Icon.check /> : state === 'fail' ? <Icon.close /> : <Icon.sync />}
      </span>
      {state === 'loading' ? '刷新中' : state === 'done' ? '已更新' : state === 'fail' ? '未更新' : '刷新'}
    </button>
  )
}

/** 未来 7 天：刷新与「x 分钟前更新」都固定在标题行右侧 */
const WeatherForecast = ({ d, toF, now }: { d: WeatherData; toF: boolean; now: Date }) => {
  const conv = (v: number): number => (toF ? Math.round(v * 9 / 5 + 32) : Math.round(v))
  const wdOf = (date: string): string => {
    const t = Date.parse(date)
    return Number.isNaN(t) ? date.slice(5) : `周${'日一二三四五六'[new Date(t).getDay()]}`
  }
  return (
    <>
      <SecHead title="未来 7 天" action={
        <>
          <span className="dt-sec-sub">{relTimeText(d.ts, now)}更新</span>
          <WeatherRefreshButton />
        </>
      } />
      <div className="dt-days week">
        {d.daily.map((x, i) => (
          <div className={`dt-day${i === 0 ? ' today' : ''}`} key={x.date}>
            <span>{i === 0 ? '今天' : wdOf(x.date)}</span>
            <span>{weatherText(x.code)}</span>
            <span>{conv(x.min)}° / {conv(x.max)}°</span>
          </div>
        ))}
      </div>
    </>
  )
}

/** 其他城市行：实况数值 + 常显「设为主 / 删除」（不再靠悬停才看得见操作） */
const WeatherCityRow = ({ ct, w, isMain, onMain, onRemove }: {
  ct: CityPick
  w: WeatherData | undefined
  isMain: boolean
  onMain: () => void
  onRemove: () => void
}) => (
  <div className="dt-row city" title="点击设为主定位" onClick={() => { if (!isMain) onMain() }}>
    <span className="dt-name">{ct.name}</span>
    {w === undefined ? (
      <span className="dt-host">暂无数据</span>
    ) : (
      <>
        <span className="wc-temp">{w.currentTemp}°</span>
        <span className="dt-host">{weatherText(w.currentCode)}</span>
        <span className="dt-host">{w.daily[0]?.min ?? '--'}° / {w.daily[0]?.max ?? '--'}°</span>
      </>
    )}
    <div className="dt-city-act">
      <button className="dt-mini" disabled={isMain} onClick={(e) => { e.stopPropagation(); onMain() }}>
        {isMain ? '主城市' : '设为主'}
      </button>
      <button className="dt-mini danger" onClick={(e) => { e.stopPropagation(); onRemove() }}>删除</button>
    </div>
  </div>
)

/**
 * 其他城市：整块只有一个搜索框（点「添加城市」展开），
 * 结果行上直接给出「设为主定位 / 加入列表」两个动作，行内常驻「设为主 / 删除」。
 */
const WeatherCities = ({ main }: { main: CityPick | null }) => {
  const cities = useApp((s) => s.settings.weatherCities)
  const cityWeathers = useApp((s) => s.cityWeathers)
  const setSetting = useApp((s) => s.setSetting)
  const showToast = useApp((s) => s.showToast)
  const addCity = useApp((s) => s.addWeatherCity)
  const removeCity = useApp((s) => s.removeWeatherCity)
  const [adding, setAdding] = useState(false)
  const mainKey = main === null ? '' : cityKeyOf(main)
  const setMain = (ct: CityPick): void => {
    setSetting('weatherCity', { ...ct })
    void useApp.getState().loadWeather()
    showToast(`已切换到 ${ct.name}`)
  }
  const pick = (h: GeoHit, act: 'main' | 'add'): void => {
    const city: CityPick = { name: h.admin1 !== '' ? `${h.name} · ${h.admin1}` : h.name, lat: h.lat, lon: h.lon }
    if (act === 'main') {
      setMain(city)
      setAdding(false)
      return
    }
    addCity(city)
  }
  return (
    <>
      <SecHead title="其他城市" sub={cities.length > 0 ? `${cities.length}/8` : ''} action={
        <button className="dt-link" onClick={() => setAdding((v) => !v)}>{adding ? '收起搜索' : '+ 添加城市'}</button>
      } />
      {adding && <CitySearch onPick={pick} />}
      {cities.length === 0 ? (
        <div className="dt-empty-line">还没有其他城市。</div>
      ) : (
        <div className="dt-list flat">
          {cities.map((ct, i) => (
            <WeatherCityRow key={`${ct.name}-${i}`} ct={ct} w={cityWeathers[cityKeyOf(ct)]}
              isMain={cityKeyOf(ct) === mainKey} onMain={() => setMain(ct)} onRemove={() => removeCity(i)} />
          ))}
        </div>
      )}
    </>
  )
}

/** 天气状态行：来源 / 自动刷新间隔 + 只在需要时出现的定位入口（已授权时不再挂「允许定位」） */
const WeatherStatus = ({ d, city }: { d: WeatherData | null; city: CityPick | null }) => {
  const every = useApp((s) => s.settings.weatherEvery)
  const setSetting = useApp((s) => s.setSetting)
  const relocate = (): void => { void useApp.getState().loadWeather(true) }
  return (
    <div className="dt-stat">
      <span>{d === null ? '未获取天气' : d.source === 'geo' ? '真实定位' : `手选城市 · ${d.place}`}</span>
      <span>{every > 0 ? `${every} 分钟自动刷新` : '自动刷新关闭'}</span>
      {d !== null && city === null && d.source === 'geo' && <button className="dt-link" onClick={relocate}>重新定位</button>}
      {city !== null && (
        <button className="dt-link" onClick={() => { setSetting('weatherCity', null); relocate() }}>改回定位</button>
      )}
    </div>
  )
}

const WeatherOverview = ({ item, now }: { item: GridItem; now: Date }) => {
  const weather = useApp((s) => s.weather)
  const city = useApp((s) => s.settings.weatherCity)
  const c = cfg(item)
  const toF = str(c['unit'], '摄氏 °C') === '华氏 °F'
  return (
    <>
      {weather === null ? (
        <div className="dt-empty">
          <span>还没有天气数据</span>
          <button className="btn sm" onClick={() => { void useApp.getState().loadWeather(true) }}>允许定位</button>
        </div>
      ) : (
        <>
          <WeatherHero d={weather} toF={toF} showRange={bool(c['showRange'])} now={now} />
          <WeatherForecast d={weather} toF={toF} now={now} />
        </>
      )}
      <WeatherCities main={city} />
      <WeatherStatus d={weather} city={city} />
    </>
  )
}

/** 时钟：日期与问候语各自独立开关，想只留日期也能做到 */
const ClockOverview = ({ item, now }: { item: GridItem; now: Date }) => {
  const c = cfg(item)
  const mode = str(c['timeMode'], '24 小时')
  const h = now.getHours()
  const hm = mode === '12 小时' ? `${p2(h % 12 === 0 ? 12 : h % 12)}:${p2(now.getMinutes())}` : `${p2(h)}:${p2(now.getMinutes())}`
  const time = `${hm}${bool(c['showSeconds']) ? `:${p2(now.getSeconds())}` : ''}${mode === '12 小时' ? (h < 12 ? ' AM' : ' PM') : ''}`
  const sub = [bool(c['showDate']) ? dateText(now) : '', bool(c['showGreeting']) ? getGreetingByHour(h) : '']
    .filter((x) => x !== '').join(' · ')
  return (
    <div className="dt-clock">
      {mode !== '隐藏' && <div className="dt-time">{time}</div>}
      {sub !== '' && <div className="dt-sub">{sub}</div>}
    </div>
  )
}

/** 纪念日的下一次周年（起始日的月 / 日，已过则顺延一年） */
const nextAnniversaryOf = (c: Record<string, unknown>, now: Date): string => {
  const md = /^\d{4}-(\d{2})-(\d{2})$/.exec(str(c['annDate'], str(c['date'], '2020-05-20')).trim())
  if (md === null) return ''
  const d = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]))
  if (dayStartOf(d) < dayStartOf(now)) d.setFullYear(d.getFullYear() + 1)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** 当日零点（只用于比较日期先后，避免时分秒影响「已过」判断） */
const dayStartOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** 倒计时：主模式大卡 + 其余模式并列小卡（点一下切换主卡，不必等轮播） */
const CountdownOverview = ({ item, now }: { item: GridItem; now: Date }) => {
  const c = cfg(item)
  const modes = normModes(c['modes'], c['mode'])
  const [pick, setPick] = useState('')
  const mode = modes.includes(pick as CountdownMode) ? pick as CountdownMode : (modes[0] ?? '下班倒计时')
  const main = readoutOf(mode, c, now, str)
  const nextAnn = mode === '纪念日' ? nextAnniversaryOf(c, now) : ''
  return (
    <>
      <div className="dt-clock">
        <div className="dt-sub">{main.hint}{main.sub !== '' ? ` · ${main.sub}` : ''}</div>
        <div className="dt-time">{main.value}{main.unit !== '' && <span className="dt-unit">{main.unit}</span>}</div>
        {mode === '下班倒计时' && <div className="dt-sub">目标时刻 {str(c['at'], '18:00')}</div>}
        {nextAnn !== '' && <div className="dt-sub">距下次周年 {nextAnn} 还有 {daysUntil(nextAnn, now)} 天</div>}
      </div>
      {modes.length > 1 && (
        <div className="dt-modes">
          {modes.map((m) => {
            const r = readoutOf(m, c, now, str)
            return (
              <button key={m} className={`dt-mode${m === mode ? ' on' : ''}`} onClick={() => setPick(m)}
                title={`切换到「${m}」`}>
                <span>{m}</span>
                <b>{r.value}{r.unit}</b>
              </button>
            )
          })}
        </div>
      )}
      <CountdownEntries item={item} now={now} />
    </>
  )
}

/** 图标格容器的概览：点一行打开对应站点 */
const GroupOverview = ({ apps }: { apps: string[] }) => {
  const showToast = useApp((s) => s.showToast)
  const openSite = (url: string): void => { void openLink(url, useApp.getState().settings.openMode, 'link') }
  return (
    <div className="dt-list flat">
      {apps.length === 0 && <Hint>容器里还没有图标，可在「设置」或右键菜单里添加。</Hint>}
      {apps.map((n) => (
        <div className="dt-row" key={n} onClick={() => {
          const url = siteUrlOf(n)
          if (url !== null) openSite(url)
          else showToast(`「${n}」没有内置网址，可编辑后直接打开`)
        }}>
          <SiteIcon url={siteUrlOf(n) ?? ''} name={n} cls="dt-ico" fs={13} size={30} />
          <span className="dt-name">{n}</span>
        </div>
      ))}
    </div>
  )
}

/** 概览主体：每类只给当前数据下最有意义的核心视图 */
const WidgetOverview = ({ item, now }: { item: GridItem; now: Date }) => {
  const c = cfg(item)
  switch (item.t) {
    case 'weather': return <WeatherOverview item={item} now={now} />
    case 'clock': return <ClockOverview item={item} now={now} />
    /* 月历与「选中日期的农历 / 宜忌 / 日程」都在 CalendarSchedule 里：
       点任意一天切换，翻月会同步换网格，避免这里与它各算一套月历 */
    case 'cal': return <CalendarSchedule item={item} now={now} />
    case 'todo': return <TodoDetail item={item} />
    case 'fav': return <FavDetail />
    case 'countdown': return <CountdownOverview item={item} now={now} />
    case 'group': return <GroupOverview apps={(Array.isArray(c['apps']) ? c['apps'] : []).filter((x): x is string => typeof x === 'string')} />
    default: return <Hint>该类型暂无详情视图。</Hint>
  }
}

const ItemDetail = ({ item }: { item: GridItem }) => {
  const setModal = useApp((s) => s.setModal)
  const [tab, setTab] = useState<'overview' | 'settings'>('overview')
  const [now, setNow] = useState(() => new Date())
  /* 时钟 / 倒计时每秒走字；天气要算「x 分钟前更新」，30 秒一刷；其余类型与「设置」页不建定时器
     （设置页有输入框，每秒重渲染会打断输入节奏） */
  useEffect(() => {
    if (tab !== 'overview') return
    const fast = item.t === 'clock' || item.t === 'countdown'
    if (!fast && item.t !== 'weather') return
    const timer = window.setInterval(() => setNow(new Date()), fast ? 1000 : 30_000)
    return () => window.clearInterval(timer)
  }, [item.t, tab])
  const def = WIDGET_DEFS[item.t]
  const body = <WidgetOverview item={item} now={now} />
  return (
    <>
      <div className="dt-head">
        <h2>{def.n} · 详情</h2>
        <div className="dt-seg" role="tablist">
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>概览</button>
          <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>设置</button>
        </div>
      </div>
      {tab === 'overview' ? body : (
        <>
          <p className="sub">{def.s}。位置与尺寸属于布局，下面的设置只改这个实例。</p>
          <CardConfigBody item={item} />
        </>
      )}
      <div className="btn-row end">
        <button className="btn" onClick={() => setModal(null)}>关闭</button>
      </div>
    </>
  )
}

export const Modal = () => {
  const modal = useApp((s) => s.modal)
  const setModal = useApp((s) => s.setModal)
  const markBackedUp = useApp((s) => s.markBackedUp)
  const restoreDefault = useApp((s) => s.restoreDefault)
  const resetParts = useApp((s) => s.resetParts)
  const backupTime = useApp((s) => s.backupTime)
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const itemId = useApp((s) => s.itemId)
  const [engName, setEngName] = useState('')
  const [engBase, setEngBase] = useState('')
  const [engImg, setEngImg] = useState('')
  const [keepIcons, setKeepIcons] = useState(true)
  const [resetSel, setResetSel] = useState({ layout: true, skins: true, wallpaper: false })
  const engImgFile = useRef<HTMLInputElement | null>(null)
  const item = pages[cur]?.find((x) => x.id === itemId) ?? null
  if (!modal) return null
  const narrow = modal === 'backup' || modal === 'restore' || modal === 'reset'
  const body = () => {
    switch (modal) {
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
      case 'backup':
        return (
          <>
            <h2>备份当前界面</h2>
            <p className="sub">立即备份当前界面，备份数据包含布局、图标、小组件与皮肤配置。</p>
            <div className="eng-row"><span style={{ flex: 1 }}>上次备份时间</span><span style={{ color: '#9aa4b2' }}>{backupTime ?? '暂无记录'}</span></div>
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => { markBackedUp(); setModal(null) }}>立即备份当前界面</button>
            </div>
            <Hint>备份记录只保存在本机；换机或重装前先用「导出布局 JSON」留一份文件。</Hint>
          </>
        )
      case 'restore':
        return (
          <>
            <h2>恢复布局</h2>
            <p className="sub">清空当前页面，回到空白页；设置、皮肤与 Dock 保留。需要现成编排时可载入示例布局。</p>

            <SwitchRow l="保留我的网址图标" d="恢复后把现有网址图标重新放到新页" on={keepIcons} onToggle={() => setKeepIcons(!keepIcons)} />
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn ghost" onClick={() => {
                restoreDefault({ keepIcons, sample: true })
                setModal(null)
              }}>载入示例布局</button>
              <button className="btn" onClick={() => {
                restoreDefault({ keepIcons })
                setModal(null)
              }}>清空为空白页</button>
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
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn danger" onClick={() => {
                resetParts(resetSel)
                setModal(null)
              }}>确认重置</button>
            </div>
          </>
        )
      case 'dockEdit':
        return <DockEditModal />
      case 'editItem':
        return item !== null ? <EditCardModal item={item} /> : <h2>编辑卡片</h2>
      case 'itemDetail':
        return item !== null ? <ItemDetail item={item} /> : null
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
