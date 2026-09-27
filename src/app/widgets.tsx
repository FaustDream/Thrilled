/**
 * 小组件渲染器（v4 内容模型）
 *
 * 定义表在 shared/widget-defs.ts（唯一来源）；本文件只负责「kind → 卡片内部结构」。
 * 卡片外框、名称标签、悬浮按钮由 App.tsx 的 GridCard 负责。
 */
import { CheckIcon, Icon } from './icons'
import { brandOf } from './brands'
import { WIDGET_DEFS } from '../shared/widget-defs'
import { getGreetingByHour } from '../core/utils'
import type { WeatherData } from '../core/weather'
import { weatherText } from '../core/weather'
import type { GridItem, WidgetKind } from '../shared/types'

/* ---------- 配置读取（定义默认值 ⊕ 实例覆盖值） ---------- */
export const cfg = (it: GridItem): Record<string, unknown> => ({ ...WIDGET_DEFS[it.t].def, ...it.config })
export const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export const bool = (v: unknown): boolean => v === true
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** 时段问候（语料与 core/utils 共用） */
export const greetByHour = getGreetingByHour

/** 统一图标容器：底色取容器令牌，品牌色只用于字形（全站唯一一种图标语言） */
export const TileGlyph = ({ name, cls, fs, size }: { name: string; cls: string; fs: number; size?: number }) => {
  const b = brandOf(name)
  return (
    <div
      className={`${cls}${b.latin ? ' lat' : ''}`}
      style={{ color: b.color, fontSize: b.latin ? Math.round(fs * 0.74) : fs, ...(size ? { width: size, height: size } : {}) }}
    >
      {b.glyph}
    </div>
  )
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
    case 'clock':
      return (
        <div className="w-clock" style={{ position: 'absolute', inset: 0 }}>
          <div className="ck-time">
            {`${p2(now.getHours())}:${p2(now.getMinutes())}${bool(c['showSeconds']) ? `:${p2(now.getSeconds())}` : ''}`}
          </div>
          <div className="ck-date">{dateText(now)}</div>
        </div>
      )
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
    case 'countday':
      return (
        <div className="w-count" style={{ position: 'absolute', inset: 0 }}>
          <div className="ct-top">{str(c['title'], '距离国庆假期')}</div>
          <div className="ct-mid"><span className="ct-num">{num(c['days'], 0)}</span><span className="ct-unit">天</span></div>
        </div>
      )
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
      const cols = Math.max(1, num(c['cols'], 5))
      const W = item.w * 60 - 50
      const H = item.h * 60 - 50
      const pad = 15
      const gap = 10
      const cell = Math.min((W - pad * 2 - (cols - 1) * gap) / cols, H - pad * 2)
      const rows = Math.max(1, Math.floor((H - pad * 2 + gap) / (cell + gap)))
      const apps = list(c['apps']).slice(0, cols * rows)
      return (
        <div className="w-group" style={{ position: 'absolute', inset: 0 }}>
          <div className="gcell-grid" style={{ gridTemplateColumns: `repeat(${cols},${cell}px)`, gridTemplateRows: `repeat(${rows},${cell}px)` }}>
            {apps.map((n) => <TileGlyph key={n} name={n} cls="gtile" fs={Math.round(cell * 0.34)} />)}
          </div>
        </div>
      )
    }
    case 'folder':
      return <div className="w-folder" style={{ position: 'absolute', inset: 0 }}>{Icon.folder()}</div>
    case 'icon':
    default: {
      // 自定义图标（上传的 dataURL / 图片地址）优先，其余走品牌字形占位（真 Logo 后续替换）
      const icon = str(c['icon'])
      const name = str(c['label']) || '网站'
      if (icon !== '') {
        return (
          <div className="v-cell" style={{ position: 'absolute', inset: 0 }}>
            <img className="v-icon" src={icon} alt={name} style={{ width: 46, height: 46, objectFit: 'cover', fontSize: 0 }} />
          </div>
        )
      }
      return (
        <div className="v-cell" style={{ position: 'absolute', inset: 0 }}>
          <TileGlyph name={name} cls="v-icon" fs={24} size={46} />
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
