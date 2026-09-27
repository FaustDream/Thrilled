/**
 * 小组件定义表 + 渲染器（v4 内容模型的唯一来源，见 docs/v4/02-UI规格.md §13）
 *
 * 定义决定：显示名 / 字形 / 品牌色 / 默认单位尺寸 / 可编辑字段 / 默认配置
 * 实例决定：位置与尺寸（布局）+ config（内容）
 */
import { CheckIcon, Icon } from './icons'
import type { GridItem, WidgetDefinition, WidgetKind } from '../shared/types'

/** 品牌表：[品牌色, 字形, 'lat'?]；真 Logo 后续替换，这里只是占位素材 */
export const BRANDS: Record<string, readonly [string, string] | readonly [string, string, 'lat']> = {
  '哔哩哔哩': ['#00A1D6', '哔'], '知乎': ['#0084FF', '知'], '微博': ['#E6162D', '微'], '百度': ['#2932E1', '百'],
  '腾讯视频': ['#FF6A00', '视'], '爱奇艺': ['#00BE06', '爱'], '优酷': ['#1FA6E0', '优'], '芒果TV': ['#FF8500', '芒'],
  '抖音': ['#161823', '抖'], '快手': ['#FF4906', '快'], '西瓜视频': ['#F94D2E', '西'], '网易云音乐': ['#C20C0C', '网'],
  'QQ音乐': ['#31C27C', 'Q', 'lat'], '咪咕视频': ['#E60012', '咪'], 'Steam': ['#1B2838', 'St', 'lat'],
  'Epic': ['#2A2A2A', 'Ep', 'lat'], 'TapTap': ['#00C4C4', 'T', 'lat'], '米游社': ['#4EA1E0', '米'],
  '微信': ['#07C160', '微'], 'QQ': ['#12B7F5', 'Q', 'lat'], '豆瓣': ['#2E963D', '豆'], '小红书': ['#FF2442', '小'],
  '钉钉': ['#0089FF', '钉'], '飞书': ['#3370FF', '飞'], 'Discord': ['#5865F2', 'D', 'lat'], 'Telegram': ['#2AABEE', 'T', 'lat'],
  '学习通': ['#2E7BD6', '学'], '网易公开课': ['#C20C0C', '公'], '得到': ['#D93A2B', '得'], '语雀': ['#25B864', '语'],
  'Notion': ['#1F1F1F', 'N', 'lat'], '石墨文档': ['#2E7BE0', '石'], '腾讯文档': ['#2F6BFF', '文'], '印象笔记': ['#2DBE60', '印'],
  'Gmail': ['#EA4335', 'M', 'lat'], '翻译': ['#3B82F6', '译'], '计算器': ['#8B5CF6', '算'], '汇率': ['#0EA5E9', '汇'],
  '快递': ['#FF6A00', '递'], '记账': ['#F59E0B', '记'], '二维码': ['#111827', '码'], '截图': ['#6366F1', '截'],
  '便签': ['#FBBF24', '签'], '淘宝': ['#FF4400', '淘'], '天猫': ['#FF0036', '猫'], '京东': ['#E1251B', '京'],
  '拼多多': ['#E02E24', '拼'], '唯品会': ['#E1006E', '唯'], '苏宁易购': ['#FFAA00', '苏'], '闲鱼': ['#E8C400', '闲'],
  '得物': ['#00C2B3', '得'], '豆包': ['#3B82F6', '豆'], 'Kimi': ['#1F2937', 'K', 'lat'], '文心一言': ['#2932E1', '文'],
  '通义千问': ['#605CE5', '通'], '智谱清言': ['#2C6BED', '智'], '讯飞星火': ['#1E88E5', '讯'],
  'DeepSeek': ['#20304F', 'D', 'lat'], '即梦AI': ['#1B1B1F', '即'], '可灵AI': ['#111827', '可'],
  'ChatGPT': ['#10A37F', 'G', 'lat'], 'Claude': ['#D97757', 'C', 'lat'], '秘塔AI搜索': ['#2B6BE4', '秘'],
  'GitHub': ['#24292F', 'G', 'lat'], 'YouTube': ['#FF0000', 'Y', 'lat'], 'Reddit': ['#FF4500', 'R', 'lat'],
  'Figma': ['#0D99FF', 'F', 'lat'], 'Dribbble': ['#EA4C89', 'D', 'lat'], 'Stack Overflow': ['#F48024', 'S', 'lat'],
  'Medium': ['#111111', 'M', 'lat'], 'Spotify': ['#1DB954', 'S', 'lat'], 'Netflix': ['#E50914', 'N', 'lat'],
  '音乐': ['#EC4899', '乐'], '影视': ['#7C3AED', '影'], '头像': ['#E08A4A', 'T', 'lat'], '百度网盘': ['#3385FF', '盘'],
  'OneDrive': ['#0078D4', 'O', 'lat'], 'Dropbox': ['#0061FF', 'D', 'lat'], '微信读书': ['#1AAD19', '读'],
  '多看阅读': ['#FF6A00', '多'], '起点读书': ['#E4393C', '起'], '酷狗音乐': ['#00A0E9', '酷'], '坚果云': ['#2E7BE0', '坚'],
  'Gitee': ['#C71D23', 'G', 'lat'], '掘金': ['#1E80FF', '掘'], 'CSDN': ['#FC5531', 'C', 'lat'], '少数派': ['#D93A2B', '少'],
  'V2EX': ['#333333', 'V', 'lat'], 'Product Hunt': ['#DA552F', 'P', 'lat'],
}

const brandOf = (name: string): { color: string; glyph: string; latin: boolean } => {
  const b = BRANDS[name]
  if (b) return { color: b[0], glyph: b[1], latin: b.length === 3 }
  return { color: '#64748B', glyph: name.slice(0, 1), latin: /^[\x20-\x7E]/.test(name.slice(0, 1)) }
}

/** 小组件定义表（18 类） */
export const WIDGET_DEFS: Record<WidgetKind, WidgetDefinition> = {
  news: {
    t: 'news', n: '新闻热点', g: '闻', c: '#FF4D4F', s: '看点 / 百度 / 微博 / 抖音热榜', units: { w: 8, h: 4 },
    fields: [
      { k: 'source', l: '热榜来源', t: 'sel', o: ['看点', '百度', '微博', '抖音'] },
      { k: 'count', l: '显示条数', t: 'num', ph: '1–6' },
    ],
    def: { source: '看点', count: 5 },
  },
  clock: {
    t: 'clock', n: '时钟', g: '钟', c: '#3B82F6', s: '数字时钟 · 时分秒可调', units: { w: 4, h: 4 },
    fields: [{ k: 'showSeconds', l: '显示秒数', t: 'bool' }], def: { showSeconds: false },
  },
  cal: { t: 'cal', n: '日历', g: '历', c: '#0EA5E9', s: '公历 / 农历 / 宜忌', units: { w: 4, h: 2 }, fields: [], def: {} },
  weather: {
    t: 'weather', n: '天气', g: '天', c: '#38BDF8', s: '实况天气 · 城市可调', units: { w: 4, h: 2 },
    fields: [{ k: 'city', l: '城市', t: 'text', ph: '北京' }], def: { city: '北京' },
  },
  todo: {
    t: 'todo', n: '待办清单', g: '待', c: '#38A29E', s: '多清单 · 今日任务', units: { w: 4, h: 2 },
    fields: [{ k: 'title', l: '清单名称', t: 'text', ph: '待办' }], def: { title: '待办' },
  },
  ann: {
    t: 'ann', n: '纪念日', g: '纪', c: '#F472B6', s: '在一起 · 生日 · 倒数', units: { w: 8, h: 4 },
    fields: [{ k: 'title', l: '标题', t: 'text', ph: '与 MiNa 相识' }, { k: 'date', l: '起始日期', t: 'text', ph: '2020-05-20' }],
    def: { title: '与MiNa相识', date: '2020-05-20' },
  },
  countday: {
    t: 'countday', n: '倒数日', g: '倒', c: '#A855F7', s: '距离某天还有多久', units: { w: 4, h: 2 },
    fields: [{ k: 'title', l: '标题', t: 'text', ph: '距离国庆假期' }, { k: 'days', l: '剩余天数', t: 'num', ph: '5' }],
    def: { title: '距离国庆假期', days: 5 },
  },
  countdown: {
    t: 'countdown', n: '下班倒计时', g: '班', c: '#FB923C', s: '进度 / 工资 / 任务', units: { w: 8, h: 4 },
    fields: [{ k: 'at', l: '下班时刻', t: 'text', ph: '18:00' }], def: { at: '18:00' },
  },
  fav: {
    t: 'fav', n: '收藏夹', g: '藏', c: '#F59E0B', s: '管理浏览器书签收藏夹', units: { w: 2, h: 4 },
    fields: [{ k: 'folder', l: '收藏夹', t: 'text', ph: '收藏夹' }], def: { folder: '收藏夹' },
  },
  quote: { t: 'quote', n: '每日一言', g: '言', c: '#6366F1', s: '时段问候 + 昵称 + 鼓励语', units: { w: 8, h: 2 }, fields: [], def: {} },
  music: {
    t: 'music', n: '音乐', g: '乐', c: '#EC4899', s: '熊猫Dj · 在线电台', units: { w: 4, h: 4 },
    fields: [{ k: 'station', l: '电台', t: 'text', ph: '熊猫Dj' }], def: { station: '熊猫Dj' },
  },
  trans: {
    t: 'trans', n: '翻译', g: '译', c: '#3B82F6', s: '多语种即时翻译', units: { w: 4, h: 2 },
    fields: [{ k: 'pair', l: '语言对', t: 'text', ph: '中 ⇄ 英' }], def: { pair: '中英互译 · 划词' },
  },
  calc: { t: 'calc', n: '计算器', g: '算', c: '#8B5CF6', s: '科学计算 / 单位换算', units: { w: 4, h: 2 }, fields: [], def: {} },
  woodfish: {
    t: 'woodfish', n: '木鱼', g: '鱼', c: '#C98A4B', s: '功德 +1 · 可关后台敲击', units: { w: 2, h: 2 },
    fields: [{ k: 'count', l: '起始功德', t: 'num', ph: '128' }], def: { count: 128 },
  },
  ai: {
    t: 'ai', n: 'AI 对话', g: 'AI', c: '#111827', s: '智能问答入口', units: { w: 4, h: 4 },
    fields: [{ k: 'provider', l: '提供方', t: 'text', ph: 'UiTab AI' }], def: { provider: 'UiTab AI' },
  },
  icon: {
    t: 'icon', n: '网站图标', g: '网', c: '#64748B', s: '添加单个网站到桌面', units: { w: 2, h: 2 },
    fields: [{ k: 'url', l: '网站链接', t: 'text', ph: 'https://' }], def: { url: '' },
  },
  folder: { t: 'folder', n: '图标文件夹', g: '夹', c: '#94A3B8', s: '把多个图标收进文件夹', units: { w: 2, h: 2 }, fields: [], def: {} },
  group: {
    t: 'group', n: '图标格容器', g: '格', c: '#0EA5E9', s: '一格里放多个网站图标', units: { w: 4, h: 4 },
    fields: [{ k: 'cols', l: '列数', t: 'num', ph: '2–8' }, { k: 'apps', l: '应用列表', t: 'list', ph: '淘宝, 京东, 知乎' }],
    def: { cols: 5, apps: [] },
  },
}

/** 添加面板清单（定义表生成 + 同类型别名入口） */
export const WIDGET_LIST: readonly WidgetDefinition[] = [
  ...Object.keys(WIDGET_DEFS).map((k) => WIDGET_DEFS[k as WidgetKind]),
  { ...WIDGET_DEFS.quote, n: '经典语录', g: '语', c: '#8B5CF6', s: '随机经典语录' },
]

/* ---------- 配置读取（定义默认值 ⊕ 实例覆盖值） ---------- */
export const cfg = (it: GridItem): Record<string, unknown> => ({ ...WIDGET_DEFS[it.t].def, ...it.config })
export const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export const bool = (v: unknown): boolean => v === true
export const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

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
}

/** 小组件渲染器：kind → 卡片内部结构（卡片外框、名称标签、悬浮按钮由 GridCard 负责） */
export const WidgetView = ({ item, now, nick, encourage, playing }: WidgetProps) => {
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
    case 'weather':
      return (
        <div className="w-weather" style={{ position: 'absolute', inset: 0 }}>
          <div className="wx-temp">20°C</div>
          <div className="wx-mid">
            <div className="wx-city">{str(c['city'], '北京')}</div>
            <div className="wx-desc">多云转小雨 18°/24° 空气优</div>
          </div>
          <div className="wx-ico">{Icon.cloudy()}</div>
        </div>
      )
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
          <div className="qt-hi">{`${greetByHour(now)}，${nick}`}</div>
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
    default:
      return (
        <div className="v-cell" style={{ position: 'absolute', inset: 0 }}>
          <TileGlyph name={str(c['label']) || '网站'} cls="v-icon" fs={24} size={46} />
        </div>
      )
  }
}

const p2 = (n: number): string => String(n).padStart(2, '0')
const dateText = (d: Date): string =>
  `${p2(d.getMonth() + 1)}月${p2(d.getDate())}日 星期${'日一二三四五六'[d.getDay()]}`

const GREET_PERIODS: readonly (readonly [number, number, string])[] = [
  [5, 9, '早上好'], [9, 12, '上午好'], [12, 14, '中午好'], [14, 18, '下午好'], [18, 24, '晚上好'],
]
export const greetByHour = (d: Date): string => {
  const h = d.getHours()
  const p = GREET_PERIODS.find((x) => h >= x[0] && h < x[1])
  return p ? p[2] : '夜深了'
}