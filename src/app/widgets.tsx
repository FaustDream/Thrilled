/**
 * 小组件渲染器（v4 内容模型）
 *
 * 定义表在 shared/widget-defs.ts（唯一来源）；本文件只负责「kind → 卡片内部结构」。
 * 卡片外框、名称标签、悬浮按钮由 App.tsx 的 GridCard 负责。
 */
import { useEffect, useState } from 'react'
import { CheckIcon, Icon } from './icons'
import { brandOf } from './brands'
import { WIDGET_DEFS } from '../shared/widget-defs'
import { GROUP_GAP, GROUP_PAD, groupBoxOf, groupGrid, groupOverflows } from '../shared/grid'
import { normStyle } from '../shared/widget-style'
import { normTodoItems } from '../core/utils'
import { normCountdownEntries, upcomingRows } from '../core/festivals'
import { normModes, readoutOf, rotateMode } from '../core/countdown'
import { eventsOn, dayKey, normScheduleEvents } from '../core/schedule'
import { almanacOf, festivalsOf, solarToLunar } from '../core/lunar'
import { resolveFavicon } from '../core/favicon'
import type { WeatherData } from '../core/weather'
import { weatherText } from '../core/weather'
import type { GridItem, WidgetKind } from '../shared/types'

/* ---------- 配置读取（定义默认值 ⊕ 实例覆盖值） ---------- */
export const cfg = (it: GridItem): Record<string, unknown> => ({ ...WIDGET_DEFS[it.t].def, ...it.config })
export const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export const bool = (v: unknown): boolean => v === true
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * 实例级样式（配置弹窗「样式」段）→ CSS 变量：字号缩放 / 图标缩放 / 卡片圆角 / 文字颜色 / 强调色。
 * 归一化统一走 shared/widget-style（非法值与越界一律丢弃，交给皮肤令牌兜底即跟随主题）。
 */
export const styleVarsOf = (c: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {}
  const s = normStyle(c)
  if (s.fontScale !== undefined && s.fontScale !== 1) out['--w-fs'] = s.fontScale.toFixed(3)
  if (s.iconScale !== undefined && s.iconScale !== 1) out['--w-ico'] = s.iconScale.toFixed(3)
  if (s.radius !== undefined) out['--w-radius'] = String(s.radius)
  if (s.textColor !== undefined) out['--card-text'] = s.textColor
  /* 强调色是组件专属字段（如倒数日的「强调色」），与样式段同一套颜色校验 */
  const accent = str(c['accent'])
  if (/^#[0-9a-f]{6}$/i.test(accent)) out['--accent'] = accent
  return out
}

/**
 * 统一图标容器：底色取容器令牌，品牌色只用于字形（全站唯一一种图标语言）。
 * fs / size 均可省略——省略时尺寸交给 CSS（卡内图标按 --u 随卡片等比缩放，Dock 与导航仍显式传入）。
 */
export const TileGlyph = ({ name, cls, fs, size, tip }: {
  name: string; cls: string; fs?: number | undefined; size?: number | undefined
  /** 悬停提示的名称（图标格容器里的格子只有名称、没有网址，故不带域名）；省略则不提示 */
  tip?: string | undefined
}) => {
  const b = brandOf(name)
  const font = fs === undefined ? undefined : b.latin ? Math.round(fs * 0.74) : fs
  return (
    <div
      className={`${cls}${b.latin ? ' lat' : ''}`}
      {...(tip === undefined ? {} : { 'data-tip': tip, 'aria-label': tip })}
      style={{ color: b.color, ...(font === undefined ? {} : { fontSize: font }), ...(size === undefined ? {} : { width: size, height: size }) }}
    >
      {/* 图形单独一层：容器底色（--ga-tile）与图形本身（--ga-glyph / --ga-dockIcon）可分别调节 */}
      <span className="glyph">{b.glyph}</span>
    </div>
  )
}

/**
 * 站点图标：优先真实 favicon（IndexedDB 缓存 → SW 解析），失败回退品牌字形。
 * 缓存键为站点域名，同一站点只解析一次；非扩展环境（开发预览）直接走字形。
 * fs / size 可调（添加抽屉网址导航、Dock 等小尺寸场景显式传入）；**省略时尺寸由 CSS 决定**
 * ——卡内「网站图标」组件据此随卡片等比缩放。url 为空直接走字形。
 */
export const SiteIcon = ({ url, name, cls = 'v-icon', fs, size }: {
  url: string
  name: string
  cls?: string
  fs?: number | undefined
  size?: number | undefined
}) => {
  const [icon, setIcon] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (url === '') return
    void resolveFavicon(url)
      .then((d) => {
        if (alive) setIcon(d)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [url])
  if (icon !== null) {
    return (
      <img className={cls} src={icon} alt={name}
        style={{ objectFit: 'cover', fontSize: 0, ...(size === undefined ? {} : { width: size, height: size }) }} />
    )
  }
  return <TileGlyph name={name} cls={cls} fs={fs} size={size} />
}


/**
 * 倒计时卡（「下班倒计时 / 倒数日 / 纪念日」三种模式可同时启用）：
 * - 下班倒计时：到下班时刻（at）的 HH:MM:SS，到点停住
 * - 倒数日：到目标日期（date）的天数，已过显示「天前」
 * - 纪念日：自起始日期（annDate）起已过的天数（title 作标题行，unitLabel 按 天/周/月/年 换算）
 * 多模式同时勾选时按设定顺序轮播（rotate 关掉则固定第一种）；内容整体居中，吉祥物已移除。
 * 倒数列表（节日 + 用户自定义）只在 4 格高的卡片显示，4×2 矮卡只留主读数。
 */
const CountdownCard = ({ item, c, now }: { item: GridItem; c: Record<string, unknown>; now: Date }) => {
  const modes = normModes(c['modes'], c['mode'])
  /* 轮播节拍：每 6 秒换一个模式（多模式且开启轮播时）；单模式不建定时器 */
  const [tick, setTick] = useState(0)
  const rotating = modes.length > 1 && bool(c['rotate'])
  useEffect(() => {
    if (!rotating) return
    const t = window.setInterval(() => setTick((v) => v + 1), 6000)
    return () => window.clearInterval(t)
  }, [rotating])
  const mode = rotating ? rotateMode(modes, tick) : (modes[0] ?? '下班倒计时')
  const r = readoutOf(mode, c, now, str)
  const rows = item.h >= 4
    ? upcomingRows(normCountdownEntries(c['entries']), bool(c['showFestivals']), now).slice(0, 4)
    : []
  return (
    <div className={`w-cd${r.timer ? '' : ' day'}`} style={{ position: 'absolute', inset: 0 }}>
      <div className="cd-l">
        <div className="cd-hint">{r.hint}</div>
        <div className="cd-time">
          {r.value}
          {r.unit !== '' && <span className="cd-unit">{r.unit}</span>}
        </div>
        {r.sub !== '' && <div className="cd-date">{r.sub}</div>}
        {rows.length > 0 && (
          <div className="cd-grid">
            {rows.map((row, i) => (
              <div className="cd-entry" key={String(i)} title={row.note ?? ''}>
                <span className="cd-label">{row.name}</span>
                <span className="cd-val">{Math.abs(row.days)}{row.days < 0 ? '天前' : '天'}</span>
                {row.progress !== null && <span className="cd-bar"><i style={{ width: `${Math.round(row.progress * 100)}%` }} /></span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* 多模式轮播指示点：让人知道这张卡在几种读数之间切换 */}
      {rotating && (
        <div className="cd-dots">
          {modes.map((m) => <i key={m} className={m === mode ? 'on' : ''} />)}
        </div>
      )}
    </div>
  )
}

export interface WidgetProps {
  item: GridItem
  /** 时钟当前时间（由宿主每秒推进一次） */
  now: Date
  /** 实况天气（core/weather；null 时显示占位数据） */
  weather: WeatherData | null
}

/** 小组件渲染器：kind → 卡片内部结构 */
export const WidgetView = ({ item, now, weather }: WidgetProps) => {
  const c = cfg(item)
  switch (item.t) {
    case 'weather': {
      /* 专属配置：温度单位（摄氏 · 华氏）/ 是否显示温度区间；
         城市名优先用真实定位反查到的地名，未定位时提示允许定位 */
      const toF = str(c['unit'], '摄氏 °C') === '华氏 °F'
      const conv = (v: number): number => (toF ? Math.round(v * 9 / 5 + 32) : Math.round(v))
      const temp = weather !== null ? `${conv(weather.currentTemp)}°${toF ? 'F' : 'C'}` : '--°'
      const dayRange = (i: number): string => weather !== null
        ? `${conv(weather.daily[i]?.min ?? 0)}°/${conv(weather.daily[i]?.max ?? 0)}°`
        : '--/--'
      const range = dayRange(0)
      const place = weather !== null ? weather.place : ''
      const desc = weather !== null
        ? `${weatherText(weather.currentCode)}${bool(c['showRange']) ? ` ${range}` : ''}`
        : `待定位${bool(c['showRange']) ? ` ${range}` : ''}`
      return (
        <div className="w-weather" style={{ position: 'absolute', inset: 0 }}>
          <div className="wx-temp">{temp}</div>
          <div className="wx-mid">
            <div className="wx-city">
              {weather === null
                ? <span className="wx-locate" data-act="weather-locate">允许定位</span>
                : place !== '' ? place : '当前位置'}
            </div>
            <div className="wx-desc">{desc}</div>
            {/* 宽卡扩展信息行：装得下时才显示（窄卡由 @container 隐去） */}
            <div className="wx-next">明日 {dayRange(1)}</div>
          </div>
          <div className="wx-ico">{Icon.cloudy()}</div>
        </div>
      )
    }
    case 'clock': {
      /* 专属配置：时间显示（24 / 12 小时 / 隐藏）、显示日期、显示秒数 */
      const mode = str(c['timeMode'], '24 小时')
      const h = now.getHours()
      const hm = mode === '12 小时' ? `${p2(h % 12 === 0 ? 12 : h % 12)}:${p2(now.getMinutes())}` : `${p2(h)}:${p2(now.getMinutes())}`
      const time = `${hm}${bool(c['showSeconds']) ? `:${p2(now.getSeconds())}` : ''}${mode === '12 小时' ? (h < 12 ? ' AM' : ' PM') : ''}`
      return (
        <div className="w-clock" style={{ position: 'absolute', inset: 0 }}>
          {mode !== '隐藏' && <div className="ck-time">{time}</div>}
          {bool(c['showDate']) && <div className="ck-date">{dateText(now)}</div>}
        </div>
      )
    }
    case 'cal': {
      /* 日历卡：左侧阳历大字 + 右侧农历 / 节日 / 宜忌 / 当日日程。
         农历、节气、干支、宜忌都由 core/lunar 按真实历法算出（不再占位）。 */
      const y = now.getFullYear()
      const mo = now.getMonth() + 1
      const d = now.getDate()
      const lunar = solarToLunar(y, mo, d)
      const fests = festivalsOf(y, mo, d)
      const almanac = almanacOf(y, mo, d)
      const events = normScheduleEvents(c['events'])
      const today = dayKey(y, mo, d)
      const todayEvents = eventsOn(events, today)
      const doneCount = todayEvents.filter((e) => e.done).length
      return (
        <div className="w-cal" style={{ position: 'absolute', inset: 0 }}>
          <div className="cal-bar">
            <div className="cal-day">{d}</div>
            <div className="cal-wd">周{'日一二三四五六'[now.getDay()]}</div>
            {bool(c['showMonth']) && <div className="cal-mon">{mo}月</div>}
          </div>
          <div className="cal-body">
            <div className="cal-lunar">
              {lunar.monthCn}{lunar.dayCn}
              {bool(c['showLunar']) && <span className="cal-gz"> · {lunar.ganZhiYear}{lunar.zodiac}年</span>}
            </div>
            {bool(c['showLunar']) && fests.length > 0 && (
              <div className="cal-fest">{fests.join(' · ')}</div>
            )}
            {bool(c['showLunar']) && (
              <div className="cal-yiji">
                <span className="cal-yi">宜 {almanac.good.slice(0, 3).join(' ')}</span>
                <span className="cal-ji">忌 {almanac.bad.slice(0, 3).join(' ')}</span>
              </div>
            )}
            {bool(c['showSchedule']) && (
              todayEvents.length === 0
                ? <div className="cal-empty">今日暂无日程</div>
                : (
                  <div className="cal-events">
                    {todayEvents.slice(0, 2).map((e, i) => (
                      <div className={`cal-ev${e.done ? ' done' : ''}`} key={`${i}-${e.text}`}>
                        <i className="cal-ev-dot" />{e.text}
                      </div>
                    ))}
                    {todayEvents.length > 2 && <div className="cal-empty">还有 {todayEvents.length - 2} 项</div>}
                    {doneCount > 0 && <div className="cal-empty">{doneCount}/{todayEvents.length} 已完成</div>}
                  </div>
                )
            )}
          </div>
        </div>
      )
    }
    case 'fav':
      return (
        <div className="w-fav" style={{ position: 'absolute', inset: 0 }}>
          {bool(c['showIcon']) && Icon.bookmark()}
          <div className="fav-text">{str(c['folder'], '收藏夹')}</div>
        </div>
      )
    case 'todo': {
      /* 待办清单卡：条目直接在卡上可见（用户需求），勾选框可点（todo-card 动作），编辑在详情弹窗 */
      const items = normTodoItems(c['items'])
      const done = items.filter((x) => x.done).length
      const maxRows = item.h >= 4 ? 4 : 2
      const shown = items.slice(0, maxRows)
      return (
        <div className="w-todo2" style={{ position: 'absolute', inset: 0, justifyContent: 'stretch' }}>
          <div className="td-panel">
            <div className="td-head">
              {bool(c['showCheck']) && CheckIcon()}
              <span className="td-title">{str(c['title'], '待办')}</span>
              <span className="td-count">{done}/{items.length}</span>
            </div>
            {items.length === 0 ? (
              <div className="td-empty">暂无待办 · 点击卡片添加</div>
            ) : (
              <>
                {shown.map((t, i) => (
                  <div className="td-row" key={`${i}-${t.txt}`}>
                    <span className={`td-box${t.done ? ' on' : ''}`} data-act="todo-card" data-v={String(i)}>{t.done ? '✓' : ''}</span>
                    <span className={`td-txt${t.done ? ' done' : ''}`}>{t.txt}</span>
                  </div>
                ))}
                {items.length > shown.length && <div className="td-more">还有 {items.length - shown.length} 项，点击查看</div>}
              </>
            )}
          </div>
        </div>
      )
    }
    case 'countdown':
      /* 下班倒计时 / 倒数日 / 纪念日三模式（原三类组件已并入）：模式与读数见 CountdownCard */
      return <CountdownCard item={item} c={c} now={now} />
    case 'group': {
      /* 图标格容器：格子边长由 shared/grid 的 groupGrid 按卡片实际尺寸算出（铺满卡片，不再挤成一串小字形）；
         名称标签已移除（用户需求），卡片高度全部留给图标格 */
      const apps = list(c['apps'])
      /* 空容器：容器卡已去卡片化（透明无边框），没有格子就什么都看不见——给虚线占位与去向上的提示 */
      if (apps.length === 0) {
        return (
          <div className="w-group empty" style={{ position: 'absolute', inset: 0, paddingBottom: GROUP_PAD }}>
            <div className="gcell-empty">空容器 · 卡片右键「编辑信息」加图标</div>
          </div>
        )
      }
      /* 可用框与尺寸能力判定共用 shared/grid 的 groupBoxOf（图标类贴边后两处一起变，不各算一套） */
      const { w: W, h: H } = groupBoxOf(item.w, item.h)
      const { cols, rows, cell } = groupGrid(apps.length, W, H, GROUP_GAP)
      /* 太少格数会撑成巨块、太多格数在窄卡里会溢出：溢出时容器改为可滚动，格子保持 16px 下限 */
      const over = groupOverflows(apps.length, W, H, GROUP_GAP)
      return (
        <div className="w-group" style={{ position: 'absolute', inset: 0, paddingBottom: GROUP_PAD }}>
          <div className={`gcell-grid${over ? ' scroll' : ''}`}
            style={{ gridTemplateColumns: `repeat(${cols},${cell}px)`, gridTemplateRows: `repeat(${rows},${cell}px)` }}>
            {/* 格子只有品牌字形：悬停给出站点名（字形相似时靠它辨认），见 app/tip.tsx */}
            {apps.map((n) => <TileGlyph key={n} name={n} cls="gtile" fs={Math.round(cell * 0.38)} tip={n} />)}
          </div>
        </div>
      )
    }
    case 'folder':
      /* 专属配置：显示名称——文件夹卡是透明卡（卡外标签不渲染），名称直接在图标下方给出 */
      return (
        <div className="w-folder" style={{ position: 'absolute', inset: 0 }}>
          {Icon.folder()}
          {bool(c['showName']) && str(c['label']).trim() !== '' && <div className="folder-name">{str(c['label'])}</div>}
        </div>
      )
    case 'icon':
    default: {
      // 真实 favicon（缓存优先）→ 品牌字形占位；自定义上传图标（dataURL）最优先
      const name = str(c['label']) || '网站'
      const custom = str(c['icon'])
      if (custom !== '') {
        /* 尺寸交给 CSS（.item .v-icon 随 --u 缩放），不再写死 60px */
        return (
          <div className="v-cell" style={{ position: 'absolute', inset: 0 }}>
            <img className="v-icon" src={custom} alt={name} style={{ objectFit: 'cover', fontSize: 0 }} />
          </div>
        )
      }
      return (
        <div className="v-cell" style={{ position: 'absolute', inset: 0 }}>
          <SiteIcon url={str(c['url'])} name={name} />
        </div>
      )
    }
  }
}

export const p2 = (n: number): string => String(n).padStart(2, '0')
export const dateText = (d: Date): string =>
  `${p2(d.getMonth() + 1)}月${p2(d.getDate())}日 星期${'日一二三四五六'[d.getDay()]}`

/** 判断 kind 是否存在（导入校验用） */
export const isWidgetKind = (k: string): k is WidgetKind => k in WIDGET_DEFS
