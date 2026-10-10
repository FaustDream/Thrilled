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
import { CELL, INSET, groupGrid } from '../shared/grid'
import { daysUntil, getGreetingByHour } from '../core/utils'
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

/** 卡内名称标签的占位高度（px）：与 .item-label 的 12px 字 / 底部 5px 内距对齐，图标格容器据此留出底部条带 */
const GROUP_LABEL_STRIP = 22

/**
 * 实例级样式（通用「样式」段）→ CSS 变量：字号缩放 / 图标缩放 / 卡片圆角 / 文字颜色 / 强调色。
 * 非法值或不写即交给皮肤令牌兜底（跟随主题）；比例夹在 0.6–1.6，避免极端值把卡片撑坏。
 */
export const styleVarsOf = (c: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {}
  const ratio = (k: string): number | null => {
    const v = c[k]
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(1.6, Math.max(0.6, v)) : null
  }
  const fs = ratio('fontScale')
  if (fs !== null && fs !== 1) out['--w-fs'] = fs.toFixed(3)
  const ico = ratio('iconScale')
  if (ico !== null && ico !== 1) out['--w-ico'] = ico.toFixed(3)
  const r = c['radius']
  if (typeof r === 'number' && Number.isFinite(r)) out['--w-radius'] = String(Math.min(32, Math.max(0, Math.round(r))))
  const hexOk = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v)
  const text = str(c['textColor'])
  if (hexOk(text)) out['--card-text'] = text
  const accent = str(c['accent'])
  if (hexOk(accent)) out['--accent'] = accent
  return out
}

/** 时段问候（语料与 core/utils 共用） */
export const greetByHour = getGreetingByHour

/**
 * 统一图标容器：底色取容器令牌，品牌色只用于字形（全站唯一一种图标语言）。
 * fs / size 均可省略——省略时尺寸交给 CSS（卡内图标按 --u 随卡片等比缩放，Dock 与导航仍显式传入）。
 */
export const TileGlyph = ({ name, cls, fs, size }: { name: string; cls: string; fs?: number | undefined; size?: number | undefined }) => {
  const b = brandOf(name)
  const font = fs === undefined ? undefined : b.latin ? Math.round(fs * 0.74) : fs
  return (
    <div
      className={`${cls}${b.latin ? ' lat' : ''}`}
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

const panda = () => (
  <svg viewBox="0 0 160 140" width="100%" height="100%">
    <ellipse cx="80" cy="128" rx="52" ry="8" fill="rgba(0,0,0,.14)" />
    <circle cx="40" cy="30" r="19" fill="#2b2b33" /><circle cx="120" cy="30" r="19" fill="#2b2b33" />
    <ellipse cx="80" cy="72" rx="52" ry="50" fill="#fff" />
    <ellipse cx="58" cy="62" rx="15" ry="17" fill="#2b2b33" /><ellipse cx="102" cy="62" rx="15" ry="17" fill="#2b2b33" />
    <circle cx="60" cy="62" r="5" fill="#fff" /><circle cx="100" cy="62" r="5" fill="#fff" />
    <ellipse cx="80" cy="88" rx="9" ry="6" fill="#2b2b33" />
  </svg>
)

const HOT: readonly (readonly [string, string])[] = [
  ['台风“桦加沙”最新路径公布', '326.4万'], ['国庆中秋假期出行全指南', '298.1万'],
  ['我国成功发射新一组低轨卫星', '256.7万'], ['新能源汽车下乡政策发布', '218.3万'],
  ['多地气温创入秋以来新低', '196.5万'], ['国产大模型开源新进展', '174.2万'],
]

export interface WidgetProps {
  item: GridItem
  /** 时钟当前时间（由宿主每秒推进一次） */
  now: Date
  /** 全局问候语素材（每日一言卡用，存在设置里而不是卡片配置里） */
  nick: string
  encourage: string
  /** 音乐卡的播放态 */
  playing: boolean
  /** 实况天气（core/weather；null 时显示占位数据） */
  weather: WeatherData | null
}

/** 小组件渲染器：kind → 卡片内部结构 */
export const WidgetView = ({ item, now, nick, encourage, playing, weather }: WidgetProps) => {
  const c = cfg(item)
  switch (item.t) {
    case 'news': {
      const source = str(c['source'], '看点')
      const count = Math.max(1, Math.min(6, num(c['count'], 5)))
      return (
        <div className="w-news" style={{ position: 'absolute', inset: 0 }}>
          <div className="news-head">
            {['看点', '百度', '微博', '抖音'].map((t) => (
              <div key={t} className={`news-tab${t === source ? ' active' : ''}`} data-act="hot-tab" data-v={t}>{t}</div>
            ))}
            <div className="news-more" data-act="hot-refresh">»</div>
          </div>
          <div className="news-list">
            {HOT.slice(0, count).map((h, i) => (
              <div key={h[0]} className={`news-row${i === 0 ? ' top' : ''}`} data-act="hot-open" data-v={h[0]}>
                <span className="news-idx">{i + 1}</span>
                <span className="news-title">{h[0]}</span>
                <span className="news-heat">{h[1]}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'music':
      return (
        <div className="w-music" style={{ position: 'absolute', inset: 0 }}>
          <div className="mu-list" data-act="music-list">{Icon.list()}</div>
          <div className="mu-disc"><i /></div>
          <div className="mu-ctl">
            <div className="mu-btn" data-act="music-prev">{Icon.prev()}</div>
            <div className="mu-btn play" data-act="music-toggle">{playing ? Icon.pause() : Icon.play()}</div>
            <div className="mu-btn" data-act="music-next">{Icon.next()}</div>
          </div>
        </div>
      )
    case 'ai':
      return (
        <div className="w-ai" style={{ position: 'absolute', inset: 0 }}>
          <div className="ai-logo">AI</div>
          <div className="ai-line" />
          <div className="ai-name">{str(c['provider'], 'UiTab AI')}</div>
          <div className="ai-sub">试试问问这些问题</div>
        </div>
      )
    case 'weather': {
      const temp = weather !== null ? `${weather.currentTemp}°C` : '20°C'
      const desc = weather !== null
        ? `${weatherText(weather.currentCode)} ${weather.daily[0]?.min ?? '--'}°/${weather.daily[0]?.max ?? '--'}°`
        : '多云转小雨 18°/24° 空气优'
      return (
        <div className="w-weather" style={{ position: 'absolute', inset: 0 }}>
          <div className="wx-temp">{temp}</div>
          <div className="wx-mid">
            <div className="wx-city">{str(c['city'], '北京')}</div>
            <div className="wx-desc">{desc}</div>
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
    case 'cal':
      return (
        <div className="w-cal" style={{ position: 'absolute', inset: 0 }}>
          <div className="cal-bar">
            <div className="cal-day">{now.getDate()}</div>
            <div className="cal-wd">周{'日一二三四五六'[now.getDay()]}</div>
          </div>
          <div className="cal-body">
            <div className="cal-month">{`${now.getFullYear()}年${now.getMonth() + 1}月`}</div>
            <div className="cal-lunar">八月十五 · 宜出行</div>
          </div>
        </div>
      )
    case 'fav':
      return (
        <div className="w-fav" style={{ position: 'absolute', inset: 0 }}>
          {Icon.bookmark()}
          <div className="fav-text">{str(c['folder'], '收藏夹')}</div>
        </div>
      )
    case 'todo':
      return (
        <div className="w-todo2" style={{ position: 'absolute', inset: 0 }}>
          {CheckIcon()}
          <span className="td-txt2">{str(c['title'], '待办')}</span>
        </div>
      )
    case 'countdown': {
      const at = str(c['at'], '18:00').split(':')
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(at[0]) || 18, Number(at[1]) || 0, 0)
      const left = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000))
      const t = `${p2(Math.floor(left / 3600))}:${p2(Math.floor(left / 60) % 60)}:${p2(left % 60)}`
      return (
        <div className="w-cd" style={{ position: 'absolute', inset: 0 }}>
          <div className="cd-l">
            <div className="cd-hint">坚持住，距下班只有</div>
            <div className="cd-time">{t}</div>
            <div className="cd-grid">
              <div className="cd-entry"><span className="cd-label">发薪日</span><span className="cd-val">21天</span></div>
              <div className="cd-entry"><span className="cd-label">周五</span><span className="cd-val">1天</span></div>
              <div className="cd-entry"><span className="cd-label">中秋节</span><span className="cd-val">0天</span></div>
              <div className="cd-entry"><span className="cd-label">日赚</span><span className="cd-val money">745.896￥</span></div>
            </div>
          </div>
          <div className="cd-mascot">{panda()}</div>
        </div>
      )
    }
    case 'ann': {
      const date = str(c['date'], '2020-05-20')
      const t0 = Date.parse(date)
      const days = Number.isNaN(t0) ? 0 : Math.max(0, Math.floor((Date.now() - t0) / 86400000))
      return (
        <div className="w-ann" style={{ position: 'absolute', inset: 0 }}>
          <div className="ann-l">
            <div className="ann-title">{str(c['title'], '与MiNa相识')}</div>
            <div className="ann-date">{date}</div>
          </div>
          <div className="ann-r"><span className="ann-num">{days}</span><span className="ann-unit">天</span></div>
        </div>
      )
    }
    case 'quote':
      return (
        <div className="w-quote" style={{ position: 'absolute', inset: 0 }} data-act="quote-refresh">
          <div className="qt-hi">{`${greetByHour(now.getHours())}，${nick}`}</div>
          <div className="qt-enc"><span className="qt-enc-t">{encourage}</span></div>
        </div>
      )
    case 'woodfish':
      return (
        <div className="w-fish" style={{ position: 'absolute', inset: 0 }} data-act="fish-hit">
          <span className="fish-ico">{Icon.fish()}</span>
          <span className="fish-num">{num(c['count'], 0)}</span>
        </div>
      )
    case 'countday': {
      /* 专属配置：目标日期——剩余天数由日期算出（今天 0 天、已过为「天前」） */
      const left = daysUntil(str(c['date']), now)
      return (
        <div className="w-count" style={{ position: 'absolute', inset: 0 }}>
          <div className="ct-top">{str(c['title'], '距离目标日')}</div>
          <div className="ct-mid">
            <span className="ct-num">{left === null ? '--' : Math.abs(left)}</span>
            <span className="ct-unit">{left !== null && left < 0 ? '天前' : '天'}</span>
          </div>
        </div>
      )
    }
    case 'calc':
      return (
        <div className="w-mini" style={{ position: 'absolute', inset: 0 }}>
          {Icon.calc()}
          <div className="mini-l"><div className="mini-t">计算器</div><div className="mini-s">点击开始计算</div></div>
        </div>
      )
    case 'trans':
      return (
        <div className="w-mini" style={{ position: 'absolute', inset: 0 }}>
          {Icon.trans()}
          <div className="mini-l"><div className="mini-t">翻译</div><div className="mini-s">{str(c['pair'], '中英互译 · 划词')}</div></div>
        </div>
      )
    case 'group': {
      /* 图标格容器：格子边长由 shared/grid 的 groupGrid 按卡片实际尺寸算出（铺满卡片，不再挤成一串小字形）；
         有名称标签时底部留出一条占位（标签在卡内左下角，见 .item-label / GridCard） */
      const apps = list(c['apps'])
      const pad = 15
      const gap = 10
      const strip = str(c['label']).trim() === '' ? 0 : GROUP_LABEL_STRIP
      const W = item.w * CELL - 2 * INSET - pad * 2
      const H = item.h * CELL - 2 * INSET - pad * 2 - strip
      const { cols, rows, cell } = groupGrid(apps.length, W, H, gap)
      return (
        <div className="w-group" style={{ position: 'absolute', inset: 0, paddingBottom: pad + strip }}>
          <div className="gcell-grid" style={{ gridTemplateColumns: `repeat(${cols},${cell}px)`, gridTemplateRows: `repeat(${rows},${cell}px)` }}>
            {apps.map((n) => <TileGlyph key={n} name={n} cls="gtile" fs={Math.round(cell * 0.38)} />)}
          </div>
        </div>
      )
    }
    case 'folder':
      return <div className="w-folder" style={{ position: 'absolute', inset: 0 }}>{Icon.folder()}</div>
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

const p2 = (n: number): string => String(n).padStart(2, '0')
const dateText = (d: Date): string =>
  `${p2(d.getMonth() + 1)}月${p2(d.getDate())}日 星期${'日一二三四五六'[d.getDay()]}`

/** 判断 kind 是否存在（导入校验用） */
export const isWidgetKind = (k: string): k is WidgetKind => k in WIDGET_DEFS
