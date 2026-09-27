/**
 * 抽屉与弹窗（添加 / 个性化 / 广场 / 设置 / 我的 + 欢迎 / 引擎 / 编辑卡片 / 备份 / 恢复 / 重置 …）
 * 结构与文案按 docs/v4/02-UI规格.md §8、§6.1、§6.3、§7 与原型冻结内容落地。
 */
import { useRef, useState } from 'react'
import { useApp, WALLS, ENGINE_LIMIT, type DrawerKey } from './store'
import { WIDGET_LIST, WIDGET_DEFS } from '../shared/widget-defs'
import { SIZES } from '../shared/grid'
import { SKIN_FIELDS } from '../shared/defaults'
import { Icon } from './icons'
import { TileGlyph } from './widgets'
import { downloadJson, buildLayoutDoc, restoreSnapshot } from '../core/export'
import { uploadWallpaper } from '../core/wallpaper'
import { readBookmarkTree, collectBookmarks } from '../core/bookmark-importer'
import { resetAllData } from '../core/reset'
import { saveDoc } from '../core/storage'
import type { GridItem, WidgetField, WidgetKind } from '../shared/types'

const DRAWERS: Record<DrawerKey, readonly [string, string]> = {
  add: ['添加', '在这里添加你喜爱的网站图标和小组件'],
  personal: ['个性化', '在这里进行个性化配置'],
  square: ['广场', '在这里查看别人分享的壁纸'],
  setting: ['设置', '在这里进行网站的设置'],
  profile: ['我的', '登录后查看个人信息'],
}

const Sec = ({ t }: { t: string }) => <div className="sec-title">{t}</div>
const Hint = ({ children }: { children: React.ReactNode }) => <div className="hint-text">{children}</div>

const SwitchRow = ({ l, d, on, onToggle }: { l: string; d?: string; on: boolean; onToggle: () => void }) => (
  <div className="switch-row">
    <div><span>{l}</span>{d ? <span className="sr-desc">{d}</span> : null}</div>
    <div className={`switch${on ? ' on' : ''}`} onClick={onToggle}><i /></div>
  </div>
)

const SliderRow = ({ l, min, max, value, display, onInput }: {
  l: string; min: number; max: number; value: number; display: string; onInput: (v: number) => void
}) => (
  <div className="slider-row">
    <div className="sl-head"><span>{l}</span><span>{display}</span></div>
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
  const showToast = useApp((s) => s.showToast)
  const [tab, setTab] = useState(0)
  const [kw, setKw] = useState('')
  const [cat, setCat] = useState(0)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState('')
  const [folderName, setFolderName] = useState('')
  const iconFile = useRef<HTMLInputElement | null>(null)
  const ws = WIDGET_LIST.filter((w) => !kw || w.n.includes(kw) || w.s.includes(kw))

  const addCustom = (): void => {
    const label = name.trim() || '未命名'
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
                <TileGlyph name={n} cls="nv-ico" fs={18} />
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

const WALL_CATS = ['全部', '极简', '风景', '动漫', '更多'] as const

const PersonalPanel = () => {
  const s = useApp((st) => st.settings)
  const setSetting = useApp((st) => st.setSetting)
  const toggle = useApp((st) => st.toggle)
  const setGlass = useApp((st) => st.setGlass)
  const applySkin = useApp((st) => st.applySkin)
  const skins = useApp((st) => st.skins)
  const skinNew = useApp((st) => st.skinNew)
  const skinRestore = useApp((st) => st.skinRestore)
  const skinDelete = useApp((st) => st.skinDelete)
  const skinRename = useApp((st) => st.skinRename)
  const skinToken = useApp((st) => st.skinToken)
  const setWallpaper = useApp((st) => st.setWallpaper)
  const setWallpaperRef = useApp((st) => st.setWallpaperRef)
  const wallRandom = useApp((st) => st.wallRandom)
  const showToast = useApp((st) => st.showToast)
  const [wallCat, setWallCat] = useState(0)
  const [prevWallRef, setPrevWallRef] = useState<string | null>(null)
  const wallFile = useRef<HTMLInputElement | null>(null)
  const GLASS: readonly [keyof typeof s.glass, string, string][] = [
    ['card', '卡片', '资讯卡 / 小组件卡'], ['tile', '图标容器', '网站图标与图标格'],
    ['dock', 'Dock 栏', '底部悬浮栏'], ['search', '搜索框', '顶部搜索框'],
    ['panel', '面板与弹窗', '抽屉 / 弹窗 / 搜索建议'], ['menu', '菜单与浮层', '右键菜单 / 模式胶囊 / 提示气泡'],
  ]
  const skin = skins.find((x) => x.id === s.skinId) ?? skins[0]
  const walls = WALLS.map((w, i) => ({ ...w, i })).filter((w) => wallCat === 0 || w.c === WALL_CATS[wallCat])

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

  return (
    <>
      <Sec t="壁纸" />
      <div className="wp-head">
        <span className="hint-text" style={{ margin: 0 }}>当前壁纸：{s.wallpaperRef !== null ? '自定义壁纸' : (WALLS[s.wallpaper]?.n ?? '')}</span>
        <span className="btn-row">
          <button className="btn sm ghost" onClick={wallRandom}>随机壁纸</button>
          {s.wallpaperRef !== null && (
            <button className="btn sm ghost" onClick={() => {
              if (prevWallRef !== null) setWallpaperRef(prevWallRef)
              else setWallpaperRef(null)
            }}>移除自定义</button>
          )}
        </span>
      </div>
      <div className="wall-grid">
        {walls.map((w) => (
          <div key={w.n} className={`wall-thumb${s.wallpaperRef === null && s.wallpaper === w.i ? ' sel' : ''}`}
            style={{ background: w.bg }} title={w.n} onClick={() => setWallpaper(w.i)} />
        ))}
      </div>
      <div className="cats">
        {WALL_CATS.map((c, i) => (
          <div key={c} className={`cat${i === wallCat ? ' active' : ''}`} onClick={() => setWallCat(i)}>{c}</div>
        ))}
      </div>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <button className="btn sm ghost" onClick={() => wallFile.current?.click()}>本地上传</button>
        <button className="btn sm ghost" onClick={useLinkWall}>外链上传</button>
      </div>
      <input ref={wallFile} type="file" accept="image/*,video/mp4,video/webm" style={{ display: 'none' }}
        onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      <Hint>图片压缩到 1920px 宽，最大 5MB；视频壁纸（mp4 / webm）只存本地 IndexedDB，不参与云同步。</Hint>

      <Sec t="透明度（全局）" />
      <SliderRow l="全局透明度" min={20} max={100} value={Math.round(s.gAlpha * 100)} display={`${Math.round(s.gAlpha * 100)}%`}
        onInput={(v) => setSetting('gAlpha', v / 100)} />
      <Hint>一个总开关，同时缩放所有面的背景透明；文字与图标始终不透明。</Hint>

      <Sec t="玻璃质感（分功能）" />
      {GLASS.map(([k, l, d]) => (
        <div key={k}>
          <SliderRow l={l} min={0} max={100} value={Math.round(s.glass[k] * 100)} display={`${Math.round(s.glass[k] * 100)}%`}
            onInput={(v) => setGlass(k, v / 100)} />
          <div className="sr-desc" style={{ color: 'var(--panel-sub)', fontSize: 11, margin: '-10px 0 8px' }}>{d}</div>
        </div>
      ))}
      <Hint>每条滑杆同时决定该区域的「透」与「糊」；0% = 该面回到不透明纯色平面。</Hint>

      <Sec t="遮罩与字体" />
      <SliderRow l="遮罩" min={0} max={100} value={Math.round(s.cover * 100)} display={`${Math.round(s.cover * 100)}%`}
        onInput={(v) => setSetting('cover', v / 100)} />
      <div className="slider-row">
        <div className="sl-head"><span>字体颜色</span></div>
        <div className="color-ball">
          {['', '#ffffff', '#1f2937', '#3b82f6', '#f97316', '#ec4899', '#22c55e'].map((c) => (
            <div key={c || 'auto'} className={`cb${s.fontColor === c ? ' on' : ''}`}
              style={{ background: c === '' ? 'linear-gradient(135deg,#fff 50%,#94a3b8 50%)' : c }}
              title={c === '' ? '跟随风格' : c}
              onClick={() => setSetting('fontColor', c)} />
          ))}
        </div>
      </div>

      <Sec t="时间与日期" />
      <SwitchRow l="展示时间" d="时钟以 24 小时制显示" on={s.showTime} onToggle={() => toggle('showTime')} />
      <SwitchRow l="展示日期" d="显示公历与星期" on={s.showDate} onToggle={() => toggle('showDate')} />
      <SwitchRow l="展示每日一言" on={s.showQuote} onToggle={() => toggle('showQuote')} />
      <div className="f-row" style={{ marginTop: 12 }}><label className="f-label">时间颜色</label>
        <input type="color" className="f-input" value={s.clockColor} onChange={(e) => setSetting('clockColor', e.target.value)} /></div>

      <Sec t="显隐" />
      <SwitchRow l="隐藏顶部区域" d="隐藏左上模式胶囊与右上头像" on={s.hideTop} onToggle={() => toggle('hideTop')} />
      <SwitchRow l="隐藏搜索框" on={s.hideSearch} onToggle={() => toggle('hideSearch')} />
      <SwitchRow l="隐藏图标标签" d="只保留图标，不显示名称" on={!s.labels} onToggle={() => toggle('labels')} />
      <SwitchRow l="吉祥物" on={s.mascot} onToggle={() => toggle('mascot')} />

      <Sec t="搜索框" />
      <SliderRow l="搜索框宽度" min={400} max={1400} value={s.searchWidth} display={`${s.searchWidth}px`} onInput={(v) => setSetting('searchWidth', v)} />
      <SliderRow l="搜索框圆角" min={0} max={25} value={s.searchRadius} display={`${s.searchRadius}px`} onInput={(v) => setSetting('searchRadius', v)} />
      <SwitchRow l="沉浸式搜索框" d="与壁纸融合的透明样式" on={s.immersive} onToggle={() => toggle('immersive')} />
      <SwitchRow l="简洁模式搜索框改为线框样式" d="仅极简模式生效" on={s.simpleSearch} onToggle={() => toggle('simpleSearch')} />

      <Sec t="Dock 栏" />
      <SliderRow l="Dock栏应用数量" min={4} max={8} value={s.dockCount} display={`${s.dockCount} 个`} onInput={(v) => setSetting('dockCount', v)} />
      <SwitchRow l="栏图标" d="开启后 Dock 图标改为圆形" on={s.dockIcon === 'circle'}
        onToggle={() => setSetting('dockIcon', s.dockIcon === 'circle' ? 'rect' : 'circle')} />

      <Sec t="主题与风格" />
      <div className="theme-grid">
        {skins.map((k) => (
          <div key={k.id} className={`theme-btn${k.id === s.skinId ? ' sel' : ''}`} onClick={() => applySkin(k.id, true)}>
            <div className="tb-prev" style={{ background: WALLS[k.wall]?.bg ?? WALLS[0]?.bg }}>
              <i style={{ background: k.tokens['--card-bg'] }} />
            </div>
            <div className="tb-name">{k.name}{k.builtin ? <span className="tb-tag">出厂</span> : null}</div>
          </div>
        ))}
      </div>
      <Hint>点击卡片即切换风格并带出配套壁纸；四套内置只是出厂初始值。</Hint>

      <Sec t="风格皮肤编辑器（可自定义）" />
      <div className="f-row"><label className="f-label">皮肤名称</label>
        <input className="f-input" value={skin?.name ?? ''} onChange={(e) => skinRename(e.target.value)} /></div>
      <div className="color-grid">
        {SKIN_FIELDS.map(([token, label]) => {
          const raw = skin?.tokens[token] ?? '#ffffff'
          const hex = raw.startsWith('#') ? raw : '#ffffff'
          return (
            <div className="color-row" key={token}>
              <span>{label}</span>
              <input type="color" value={hex} title={raw} onChange={(e) => skinToken(token, e.target.value)} />
            </div>
          )
        })}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={skinNew}>新建皮肤</button>
        <button className="btn sm ghost" onClick={skinRestore}>还原内置</button>
        <button className="btn sm danger" onClick={skinDelete}>删除皮肤</button>
      </div>
      <Hint>改动即时生效并保存到当前风格；rgba 令牌取色后会写成十六进制色值。</Hint>
    </>
  )
}

/* ============================== 广场 ============================== */

const PZ_SEED = [
  { t: '极夜星轨', a: '星野', l: 1284, b: 'linear-gradient(150deg,#141b2e,#2a2350 60%,#0b0e18)' },
  { t: '晨雾山峦', a: '青山', l: 962, b: 'linear-gradient(150deg,#dfe7ef,#a9b8c9 60%,#7d8fa3)' },
  { t: '樱色渐变', a: 'Momo', l: 743, b: 'linear-gradient(150deg,#ffd9e5,#ffb6c9 55%,#f0879f)' },
  { t: '深海静谧', a: 'Aqua', l: 651, b: 'linear-gradient(150deg,#0f3b52,#0b2233 55%,#07131d)' },
  { t: '我的工作台', a: '我', l: 12, b: 'linear-gradient(150deg,#1b2532,#0b1017)' },
  { t: '摸鱼模式', a: '我', l: 8, b: 'linear-gradient(150deg,#2a1b46,#0d0818)' },
]

const PzCard = ({ t, a, l, b }: { t: string; a: string; l: number; b: string }) => {
  const [liked, setLiked] = useState(false)
  const showToast = useApp((s) => s.showToast)
  return (
    <div className="pz-card">
      <div className="pz-prev" style={{ background: b }}>
        <div className="m-card" style={{ left: '12%', top: '16%', width: '34%', height: '26%' }} />
        <div className="m-card" style={{ left: '52%', top: '16%', width: '34%', height: '26%' }} />
        <div className="m-card" style={{ left: '12%', top: '50%', width: '34%', height: '22%' }} />
        <div className="m-card" style={{ left: '52%', top: '50%', width: '34%', height: '22%' }} />
        <div className="m-dock" />
      </div>
      <div className="pz-body">
        <div className="pz-title">{t}</div>
        <div className="pz-sub">by {a} · 发布于 09-24</div>
        <div className="pz-like" onClick={() => setLiked(!liked)}>{Icon.heart()}{l + (liked ? 1 : 0)} 收藏</div>
        <div className="pz-acts">
          <button className="btn sm" onClick={() => showToast('应用成功，恢复后将覆盖当前界面')}>应用</button>
          <button className="btn sm ghost" onClick={() => showToast('分享依赖云端服务（thrilled-server，后续接入）')}>分享</button>
        </div>
      </div>
    </div>
  )
}

const SquarePanel = () => {
  const user = useApp((s) => s.user)
  const showToast = useApp((s) => s.showToast)
  const setModal = useApp((s) => s.setModal)
  const [tab, setTab] = useState(0)
  const [mineTab, setMineTab] = useState(0)
  const [page, setPage] = useState(1)
  const [kw, setKw] = useState('')
  const list = PZ_SEED.filter((p) => !kw || p.t.includes(kw))
  return (
    <>
      <div className="sub-tabs">
        {['大厅', '分享', '我的'].map((t, i) => (
          <div key={t} className={`sub-tab${i === tab ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</div>
        ))}
      </div>
      {tab === 0 && (
        <>
          <div className="f-row"><input className="f-input" placeholder="按关键字搜索界面 / 或粘贴至大厅搜索框搜索" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
          <div className="cats">
            {['热门推荐', '用户分享'].map((c, i) => (
              <div key={c} className={`cat${i === 0 ? ' active' : ''}`}>{c}</div>
            ))}
          </div>
          <div className="pz-grid">
            {list.map((p) => <PzCard key={p.t} {...p} />)}
          </div>
          <div className="pager-row">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`pg${i === page ? ' active' : ''}`} onClick={() => setPage(i)}>{i}</div>
            ))}
          </div>
          <Hint>广场云端服务（thrilled-server）接入后，这里展示真实模板；当前为种子模板示意。</Hint>
        </>
      )}
      {tab === 1 && (
        <>
          <SwitchRow l="公开分享" d="任何人都能在广场看到" on onToggle={() => showToast('分享依赖云端服务')} />
          <SwitchRow l="私密分享" d="私密分享只能主页粘贴分享链接访问" on={false} onToggle={() => showToast('分享依赖云端服务')} />
          <div className="f-row" style={{ marginTop: 14 }}><label className="f-label">界面标题</label>
            <input className="f-input" placeholder="请输入界面标题" defaultValue="我的新标签页" /></div>
          <div className="f-row"><label className="f-label">界面描述</label>
            <input className="f-input" placeholder="请输入界面描述" /></div>
          <div className="btn-row">
            <button className="btn" onClick={() => showToast('分享依赖云端服务')}>立即分享</button>
            <button className="btn ghost" onClick={() => showToast('分享依赖云端服务')}>复制分享链接</button>
          </div>
          <Hint>分享时只有上传云端壁纸或在线壁纸才能正常分享。</Hint>
        </>
      )}
      {tab === 2 && (
        <>
          <div className="sub-tabs">
            {['我的作品', '我的收藏', '应用记录', '使用记录'].map((t, i) => (
              <div key={t} className={`sub-tab${i === mineTab ? ' active' : ''}`} onClick={() => setMineTab(i)}>{t}</div>
            ))}
          </div>
          {user ? (
            <>
              <div className="pz-grid" style={{ marginTop: 12 }}>
                {PZ_SEED.slice(4).map((p) => (
                  <div className="pz-card" key={p.t}>
                    <div className="pz-prev" style={{ background: p.b }} />
                    <div className="pz-body">
                      <div className="pz-title">{p.t}</div>
                      <div className="pz-sub">发布于 09-20</div>
                      <div className="pz-acts">
                        <button className="btn sm ghost" onClick={() => showToast('应用成功，恢复后将覆盖当前界面')}>应用之前的界面</button>
                        <button className="btn sm ghost" onClick={() => showToast('确定删除作品')}>删除作品</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Hint>应用记录仅保存在本地；恢复后将覆盖当前界面。</Hint>
            </>
          ) : (
            <>
              <div className="empty-box">{Icon.user()}<div>登录查看我的作品</div></div>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={() => setModal('login')}>现在登录</button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

/* ============================== 设置 ============================== */

const EngineRows = ({ modalMode }: { modalMode: boolean }) => {
  const engines = useApp((s) => s.engines)
  const engineId = useApp((s) => s.settings.engineId)
  const setEngine = useApp((s) => s.setEngine)
  const toggleEngineHidden = useApp((s) => s.toggleEngineHidden)
  const commitEngineOrder = useApp((s) => s.commitEngineOrder)
  const setModal = useApp((s) => s.setModal)
  const showToast = useApp((s) => s.showToast)
  const [dragId, setDragId] = useState<string | null>(null)
  let visibleNo = 0
  return (
    <>
      {engines.map((e, i) => {
        const no = e.hidden === true ? 0 : ++visibleNo
        return (
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
            <span className="eng-key">{no !== 0 ? (no <= 9 ? no : '·') : '—'}</span>
            <div className="er-ico" style={{ background: e.color, opacity: e.hidden ? 0.45 : 1 }}>
              {e.img !== undefined ? <img src={e.img} alt={e.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7 }} /> : e.glyph}
            </div>
            <span style={{ flex: 1, opacity: e.hidden ? 0.55 : 1 }}>{e.name}</span>
            {engineId === e.id ? <span className="tb-tag">正在使用中</span>
              : <button className="btn sm ghost" onClick={() => setEngine(e.id)}>{modalMode ? '设为默认' : '启用'}</button>}
            <button className="btn sm ghost" onClick={() => {
              toggleEngineHidden(e.id)
              showToast(e.hidden === true ? '已显示' : '已隐藏')
            }}>{e.hidden === true ? '显示' : '隐藏'}</button>
          </div>
        )
      })}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={() => setModal('addEngine')}>添加自定义搜索引擎</button>
        {!modalMode && <button className="btn sm ghost" onClick={() => setModal('engine')}>搜索引擎管理</button>}
      </div>
    </>
  )
}

const OPEN_MODES: readonly (readonly ['link' | 'tab' | 'search', string])[] = [
  ['link', '当前窗口打开链接'], ['tab', '打开新标签页'], ['search', '当前窗口打开搜索结果'],
]

const SettingPanel = () => {
  const s = useApp((st) => st.settings)
  const setSetting = useApp((st) => st.setSetting)
  const toggle = useApp((st) => st.toggle)
  const setModal = useApp((st) => st.setModal)
  const exportLayout = useApp((st) => st.exportLayout)
  const importLayout = useApp((st) => st.importLayout)
  const showToast = useApp((st) => st.showToast)
  const user = useApp((st) => st.user)
  const setUser = useApp((st) => st.setUser)
  const file = useRef<HTMLInputElement | null>(null)
  const bkFile = useRef<HTMLInputElement | null>(null)

  const download = (): void => {
    const doc = exportLayout()
    downloadJson('thrilled-layout.json', buildLayoutDoc(doc.standard, doc.privacy))
    showToast('已导出 thrilled-layout.json')
  }

  const importBookmarks = async (): Promise<void> => {
    const tree = await readBookmarkTree()
    if (tree === null) { showToast('收藏夹导入需要在扩展中使用'); return }
    const entries = collectBookmarks(tree)
    if (entries.length === 0) { showToast('收藏夹里没有可导入的 http(s) 书签'); return }
    const n = useApp.getState().placeMany(entries)
    showToast(`已从收藏夹导入 ${n} 个网站图标`)
  }

  const clearLocal = async (): Promise<void> => {
    if (!window.confirm('将彻底删除本地数据（图标、布局、皮肤、壁纸配置），且不可撤销。确定继续？')) return
    await resetAllData()
  }

  return (
    <>
      <Sec t="搜索引擎" />
      <Hint>内置 12 个主流引擎：百度 / 必应 / 谷歌 / 搜狗 / 360 / 神马 / 夸克 / 头条 / 知乎 / 微博 / DuckDuckGo / Brave；拖动 `⋮⋮` 排序、可隐藏，启用上限 {ENGINE_LIMIT} 个。序号即数字键映射。</Hint>
      <EngineRows modalMode={false} />

      <Sec t="搜索框设置" />
      <SwitchRow l="自动聚焦" d="打开新标签时自动聚焦搜索框" on={s.autoFocus} onToggle={() => toggle('autoFocus')} />
      <SwitchRow l="保留搜索内容" d="搜索后不清空输入框内容" on={s.searchKeep} onToggle={() => toggle('searchKeep')} />
      <SwitchRow l="隐藏搜索按钮" d="仅通过 Enter 键触发搜索" on={s.hideBtn} onToggle={() => toggle('hideBtn')} />
      <SwitchRow l="搜索历史" d="关闭后搜索框不再弹出任何下拉" on={s.searchHistory} onToggle={() => toggle('searchHistory')} />
      <Hint>本项目不做搜索联想：输入时不出候选词，只在开启搜索历史时展示历史记录。</Hint>

      <Sec t="每日问候" />
      <div className="f-row"><label className="f-label">昵称</label>
        <input className="f-input" value={s.nick} placeholder="主人" onChange={(e) => setSetting('nick', e.target.value)} /></div>
      <Hint>用在每日一言卡：时段问候 + 昵称 + 竖线鼓励语；双击卡片可换一条鼓励语。</Hint>

      <Sec t="打开方式" />
      {OPEN_MODES.map(([k, n]) => (
        <div className="switch-row" key={k}>
          <span>{n}</span>
          <div className={`switch${s.openMode === k ? ' on' : ''}`} onClick={() => setSetting('openMode', k)}><i /></div>
        </div>
      ))}

      <Sec t="数据与备份" />
      <div className="btn-row">
        <button className="btn" onClick={() => setModal('backup')}>备份当前界面</button>
        <button className="btn ghost" onClick={() => showToast(user ? '云端备份依赖 thrilled-server（后续接入）' : '请先登录')}>云端备份</button>
        <button className="btn ghost" onClick={() => setModal('restore')}>恢复为默认界面</button>
        <button className="btn ghost" onClick={() => void clearLocal()}>清除本地数据</button>
        <button className="btn danger" onClick={() => setModal('reset')}>一键重置</button>
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={download}>导出布局 JSON</button>
        <button className="btn ghost" onClick={() => file.current?.click()}>导入布局 JSON</button>
        <button className="btn ghost" onClick={() => void importBookmarks()}>导入收藏夹</button>
        <button className="btn ghost" onClick={() => bkFile.current?.click()}>恢复本地快照</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const rd = new FileReader()
          rd.onload = () => {
            try {
              showToast(importLayout(JSON.parse(String(rd.result))) ? '布局导入成功' : '布局导入失败：standard / privacy 不能为空')
            } catch {
              showToast('布局导入失败：不是合法的 JSON 文件')
            }
          }
          rd.readAsText(f)
          e.target.value = ''
        }} />
      <input ref={bkFile} type="file" accept=".json,application/json" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const rd = new FileReader()
          rd.onload = () => {
            try {
              const doc = restoreSnapshot(JSON.parse(String(rd.result)))
              if (doc === null) { showToast('快照恢复失败：结构不合法'); return }
              saveDoc(doc)
              showToast('快照恢复成功，请刷新页面')
            } catch {
              showToast('快照恢复失败：不是合法的 JSON 文件')
            }
          }
          rd.readAsText(f)
          e.target.value = ''
        }} />
      <Hint>导出内容 = 标准 / 隐私两套页面的全部卡片实例（引用的小组件、各自配置、位置与尺寸），改完文件可直接导入回来。已配置同步目录时，改动会自动写入本地目录。</Hint>

      <Sec t="账号" />
      {user
        ? <div className="eng-row">
            <div className="er-ico" style={{ background: 'linear-gradient(160deg,#f5c58a,#e08a4a)' }}>{user.email.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div>{user.email}</div>
              <div style={{ color: 'var(--panel-sub)', fontSize: 11 }}>已登录 · 个性签名：这个人很懒</div>
            </div>
            <button className="btn sm ghost" onClick={() => { setUser(null); showToast('退出成功') }}>退出登录</button>
          </div>
        : <div className="btn-row"><button className="btn" onClick={() => setModal('login')}>现在登录</button></div>}

      <Sec t="关于" />
      <div className="eng-row"><span style={{ flex: 1 }}>版本</span><span style={{ color: 'var(--panel-sub)' }}>4.1（v4 重构版）</span></div>
      <div className="btn-row">
        <button className="btn sm ghost" onClick={() => setModal('log')}>更新记录</button>
        <button className="btn sm ghost" onClick={() => setModal('about')}>关于我们</button>
      </div>

      <Sec t="快捷键" />
      {([['1 – 9', '切换搜索引擎（非输入状态）'], ['Enter', '执行搜索'], ['← →', '切换页面'],
        ['双击每日一言卡', '换一条鼓励语'], ['Esc', '关闭面板 / 菜单 / 搜索历史'],
        ['Ctrl+Shift+E', '导出布局 JSON'], ['Ctrl+Shift+R', '一键重置（需确认）']] as const).map(([k, d]) => (
        <div className="eng-row" key={k}><span style={{ flex: 1 }}>{d}</span><kbd className="kbd">{k}</kbd></div>
      ))}
    </>
  )
}

/* ============================== 我的 ============================== */

const ProfilePanel = () => {
  const user = useApp((s) => s.user)
  const showToast = useApp((s) => s.showToast)
  const setModal = useApp((s) => s.setModal)
  const setUser = useApp((s) => s.setUser)
  const [tab, setTab] = useState(0)
  if (!user) {
    return (
      <>
        <div className="empty-box">{Icon.user()}<div>登录后查看个人信息</div></div>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setModal('login')}>现在登录</button>
        </div>
        <Hint>登录后才能进入隐私模式；换绑或再次登录时出于安全考虑会清空隐私数据。</Hint>
      </>
    )
  }
  return (
    <>
      <div className="eng-row">
        <div className="er-ico" style={{ width: 44, height: 44, borderRadius: '50%', fontSize: 16, background: 'linear-gradient(160deg,#f5c58a,#e08a4a)' }}>{user.email.slice(0, 1).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15 }}>{user.email}</div>
          <div style={{ color: 'var(--panel-sub)', fontSize: 12 }}>已登录 · 个性签名：这个人很懒</div>
        </div>
      </div>
      <div className="btn-row" style={{ margin: '14px 0' }}>
        <button className="btn sm ghost" onClick={() => showToast('绑定邮箱：请输入旧邮箱 / 新邮箱')}>绑定邮箱</button>
        <button className="btn sm ghost" onClick={() => showToast('修改密码：请输入旧密码 / 新密码')}>修改密码</button>
        <button className="btn sm ghost" onClick={() => showToast('我的个性签名')}>我的个性签名</button>
      </div>
      <Sec t="我的内容" />
      <div className="sub-tabs">
        {['我的作品', '我的收藏', '最近删除'].map((t, i) => (
          <div key={t} className={`sub-tab${i === tab ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</div>
        ))}
      </div>
      <Hint>应用记录仅保存在本地；登录后可进入隐私模式、备份与恢复界面。</Hint>
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={() => { setUser(null); showToast('退出成功') }}>退出登录</button>
        <button className="btn ghost" onClick={() => showToast('注销账号：将彻底删除选中的账号数据')}>注销账号</button>
      </div>
    </>
  )
}

const PANELS: Record<DrawerKey, () => React.ReactElement> = {
  add: AddPanel, personal: PersonalPanel, square: SquarePanel, setting: SettingPanel, profile: ProfilePanel,
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
        <div className="dw-head">
          <div>
            <div className="dw-title">{title}</div>
            <div className="dw-sub">{sub}</div>
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
  const setUser = useApp((s) => s.setUser)
  const setMode = useApp((s) => s.setMode)
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const itemId = useApp((s) => s.itemId)
  const [selSkin, setSelSkin] = useState(settings.skinId)
  const [engName, setEngName] = useState('')
  const [engBase, setEngBase] = useState('')
  const [engImg, setEngImg] = useState('')
  const [mail, setMail] = useState('')
  const [keepModes, setKeepModes] = useState(true)
  const [resetSel, setResetSel] = useState({ layout: true, skins: true, wallpaper: false })
  const engImgFile = useRef<HTMLInputElement | null>(null)
  const key = settings.mode === 'privacy' ? 'privacy' : 'standard'
  const item = pages[key][cur[key]]?.find((x) => x.id === itemId) ?? null
  if (!modal) return null
  const narrow = modal === 'log' || modal === 'about' || modal === 'engine' || modal === 'backup' || modal === 'restore' || modal === 'reset'
  const body = () => {
    switch (modal) {
      case 'theme':
        return (
          <>
            <h2>欢迎来到 Thrilled</h2>
            <p className="sub">选择风格来搭配组件和图标，之后可随时在「个性化 - 主题与风格」中更换。</p>
            <div className="th-grid">
              {skins.map((k) => (
                <div key={k.id} className={`th-card${k.id === selSkin ? ' sel' : ''}`} onClick={() => setSelSkin(k.id)}>
                  <div className="th-prev" style={{ background: WALLS[k.wall]?.bg ?? WALLS[0]?.bg }}>
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
              <button className="btn" onClick={() => { applySkin(selSkin, true); setModal(null); useApp.getState().showToast('应用成功') }}>应用风格</button>
            </div>
          </>
        )
      case 'engine':
        return (
          <>
            <h2>搜索引擎管理</h2>
            <p className="sub">拖动可排序；隐藏后的引擎不会出现在搜索框下拉、数字键切换与右键二级菜单里。</p>
            <EngineRows modalMode />
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setModal(null)}>完成</button>
            </div>
          </>
        )
      case 'addEngine':
        return (
          <>
            <h2>添加自定义搜索引擎</h2>
            <p className="sub">请输入搜索引擎名称与搜索地址（启用数量上限 {ENGINE_LIMIT} 个）。</p>
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
                const n = engName || '自定义'
                useApp.getState().addEngine({
                  id: `c${Date.now().toString(36)}`, name: n, color: '#0EA5E9', glyph: n.slice(0, 1),
                  base: engBase, ...(engImg !== '' ? { img: engImg } : {}),
                })
                setModal(null)
                useApp.getState().showToast('添加成功')
              }}>确定</button>
            </div>
          </>
        )
      case 'log':
        return (
          <>
            <h2>更新记录</h2><p className="sub">当前版本 4.1（v4 重构版）</p>
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
            <h2>关于我们</h2><p className="sub">Thrilled · 新标签页 4.1</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => useApp.getState().showToast('问题反馈：请联系工作人员')}>问题反馈</button>
              <button className="btn ghost" onClick={() => useApp.getState().showToast('隐私协议：尊重用户的隐私权利')}>隐私协议</button>
              <button className="btn ghost" onClick={() => useApp.getState().showToast('联系作者：请联系工作人员')}>联系作者</button>
            </div>
            <Hint>壁纸来源于互联网，如有侵权请联系工作人员；为保障用户的数据安全与用户体验，请及时备份。</Hint>
            <div className="btn-row end" style={{ marginTop: 16 }}><button className="btn" onClick={() => setModal(null)}>关闭</button></div>
          </>
        )
      case 'login':
        return (
          <>
            <h2>现在登录</h2><p className="sub">登录后才能进入隐私模式；云端账号体系将接入云笺集（thrilled-server）。</p>
            <div className="f-row"><label className="f-label">邮箱</label>
              <input className="f-input" placeholder="请输入邮箱" value={mail} onChange={(e) => setMail(e.target.value)} /></div>
            <div className="f-row"><label className="f-label">密码</label>
              <input className="f-input" type="password" placeholder="请输入密码" /></div>
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => {
                setUser({ email: mail || 'me@thrilled.dev' })
                setModal(null)
                useApp.getState().showToast('登录成功，已进入隐私模式')
                setMode('privacy')
              }}>登录</button>
            </div>
            <Hint>本地演示：点击「登录」即模拟登录成功，随后自动进入隐私模式。</Hint>
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
            <p className="sub">恢复后将覆盖当前界面（布局与卡片内容回到出厂），设置与皮肤保留。</p>
            <SwitchRow l="保留极简和标准模式状态" d="恢复后停留在当前模式" on={keepModes} onToggle={() => setKeepModes(!keepModes)} />
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => {
                restoreDefault()
                if (!keepModes) useApp.getState().setSetting('mode', 'standard')
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
