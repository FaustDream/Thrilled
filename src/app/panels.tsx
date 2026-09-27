/**
 * 抽屉与弹窗（添加 / 个性化 / 广场 / 设置 / 我的 + 引擎管理 / 编辑卡片 / 欢迎 …）
 * 结构与文案按 docs/v4/02-UI规格.md §8、§6.3、§7 冻结内容落地。
 */
import { useRef, useState } from 'react'
import { useApp, SKINS, WALLS, type DrawerKey } from './store'
import { WIDGET_LIST, WIDGET_DEFS, cfg, bool, list } from './widgets'
import { SIZES } from './layout'
import { Icon } from './icons'
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

/* ============================== 抽屉内容 ============================== */

const AddPanel = () => {
  const place = useApp((s) => s.place)
  const [tab, setTab] = useState(0)
  const [kw, setKw] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const sites = ['百度', '哔哩哔哩', '知乎', '微博', '淘宝', '京东', 'GitHub', 'Gmail']
  const ws = WIDGET_LIST.filter((w) => !kw || w.n.includes(kw) || w.s.includes(kw))
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
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => sites.slice(0, 6).forEach((n) => place('icon', { label: n }))}>批量添加</button>
          </div>
          <div className="nv-grid">
            {sites.map((n) => (
              <div className="nv-item" key={n} onClick={() => place('icon', { label: n })}>
                <div className="nv-ico">{n.slice(0, 1)}</div>
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
          <Hint>支持拖拽调整位置与尺寸；确认后会放到当前页的空白位置。</Hint>
          <div className="btn-row end">
            <button className="btn" onClick={() => { const n = name || '未命名'; place('icon', { label: n, url }); setName(''); setUrl('') }}>确认添加</button>
          </div>
        </>
      )}
    </>
  )
}

const PersonalPanel = () => {
  const s = useApp((st) => st.settings)
  const setSetting = useApp((st) => st.setSetting)
  const toggle = useApp((st) => st.toggle)
  const setGlass = useApp((st) => st.setGlass)
  const applySkin = useApp((st) => st.applySkin)
  const setWallpaper = useApp((st) => st.setWallpaper)
  const GLASS_LABELS: readonly [keyof typeof s.glass, string][] = [
    ['card', '卡片'], ['tile', '图标容器'], ['dock', 'Dock 栏'], ['search', '搜索框'], ['panel', '面板与弹窗'], ['menu', '菜单与浮层'],
  ]
  return (
    <>
      <Sec t="壁纸" />
      <div className="cats" style={{ flexWrap: 'wrap' }}>
        {WALLS.map((w, i) => (
          <div key={w.n} className={`cat${i === s.wallpaper ? ' active' : ''}`} onClick={() => setWallpaper(i)}>{w.n}</div>
        ))}
      </div>
      <Hint>壁纸分类：极简 / 动漫 / 风景 / 更多；本地上传与视频壁纸随一期开发接入。</Hint>

      <Sec t="主题与风格" />
      <div className="cats">
        {SKINS.map((k) => (
          <div key={k.id} className={`cat${k.id === s.skinId ? ' active' : ''}`} onClick={() => applySkin(k.id, true)}>{k.n}</div>
        ))}
      </div>
      <Hint>四套内置风格只是出厂初始值：可改名、改色、新建、删除（风格编辑器随一期开发接入，见 02 §6.1）。</Hint>

      <Sec t="透明度（全局）" />
      <SliderRow l="透明度" min={20} max={100} value={Math.round(s.gAlpha * 100)} display={`${Math.round(s.gAlpha * 100)}%`}
        onInput={(v) => setSetting('gAlpha', v / 100)} />
      <Hint>只缩放所有面的背景透明度，文字与图标始终不透明。</Hint>

      <Sec t="玻璃质感（分功能）" />
      {GLASS_LABELS.map(([k, l]) => (
        <SliderRow key={k} l={l} min={0} max={100} value={Math.round(s.glass[k] * 100)} display={`${Math.round(s.glass[k] * 100)}%`}
          onInput={(v) => setGlass(k, v / 100)} />
      ))}
      <Hint>每条同时决定该面的透明与背景模糊；0% = 该面回到不透明纯色平面。</Hint>

      <Sec t="显隐" />
      <SwitchRow l="展示时间" on={s.showTime} onToggle={() => toggle('showTime')} />
      <SwitchRow l="展示日期" on={s.showDate} onToggle={() => toggle('showDate')} />
      <SwitchRow l="展示每日一言" on={s.showQuote} onToggle={() => toggle('showQuote')} />
      <SwitchRow l="隐藏顶部区域" on={s.hideTop} onToggle={() => toggle('hideTop')} />
      <SwitchRow l="隐藏搜索框" on={s.hideSearch} onToggle={() => toggle('hideSearch')} />
      <SwitchRow l="隐藏图标标签" d="只保留图标，不显示名称" on={!s.labels} onToggle={() => toggle('labels')} />
      <SwitchRow l="吉祥物" on={s.mascot} onToggle={() => toggle('mascot')} />

      <Sec t="搜索框" />
      <SliderRow l="搜索框宽度" min={600} max={1200} value={s.searchWidth} display={`${s.searchWidth}px`} onInput={(v) => setSetting('searchWidth', v)} />
      <SliderRow l="搜索框圆角" min={0} max={25} value={s.searchRadius} display={`${s.searchRadius}px`} onInput={(v) => setSetting('searchRadius', v)} />

      <Sec t="Dock" />
      <SwitchRow l="圆形图标" on={s.dockIcon === 'circle'} onToggle={() => setSetting('dockIcon', s.dockIcon === 'circle' ? 'rect' : 'circle')} />
      <SliderRow l="栏应用数量" min={4} max={8} value={s.dockCount} display={`${s.dockCount} 个`} onInput={(v) => setSetting('dockCount', v)} />
    </>
  )
}

const SettingPanel = () => {
  const s = useApp((st) => st.settings)
  const setSetting = useApp((st) => st.setSetting)
  const toggle = useApp((st) => st.toggle)
  const engines = useApp((st) => st.engines)
  const setEngine = useApp((st) => st.setEngine)
  const toggleEngineHidden = useApp((st) => st.toggleEngineHidden)
  const moveEngine = useApp((st) => st.moveEngine)
  const setModal = useApp((st) => st.setModal)
  const restoreDefault = useApp((st) => st.restoreDefault)
  const exportLayout = useApp((st) => st.exportLayout)
  const importLayout = useApp((st) => st.importLayout)
  const showToast = useApp((st) => st.showToast)
  const user = useApp((st) => st.user)
  const setUser = useApp((st) => st.setUser)
  const file = useRef<HTMLInputElement | null>(null)
  let visibleNo = 0
  const download = () => {
    const doc = exportLayout()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }))
    a.download = 'thrilled-layout.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    showToast('已导出 thrilled-layout.json')
  }
  return (
    <>
      <Sec t="搜索引擎" />
      <Hint>内置 12 个主流引擎：百度 / 必应 / 谷歌 / 搜狗 / 360 / 神马 / 夸克 / 头条 / 知乎 / 微博 / DuckDuckGo / Brave；可排序、可隐藏，启用上限 12 个。搜索框左侧引擎图标就是下拉入口。</Hint>
      {engines.map((e, i) => {
        const no = e.hidden ? 0 : ++visibleNo
        return (
          <div className="eng-row" key={e.id}>
            <span className="eng-key">{no ? (no <= 9 ? no : '·') : '—'}</span>
            <div className="er-ico" style={{ background: e.color, opacity: e.hidden ? 0.45 : 1 }}>{e.glyph}</div>
            <span style={{ flex: 1, opacity: e.hidden ? 0.55 : 1 }}>{e.name}</span>
            <button className="btn sm ghost" onClick={() => moveEngine(e.id, -1)} disabled={i === 0}>上移</button>
            {s.engineId === e.id ? <span className="tb-tag">正在使用中</span>
              : <button className="btn sm ghost" onClick={() => setEngine(e.id)}>启用</button>}
            <button className="btn sm ghost" onClick={() => toggleEngineHidden(e.id)}>{e.hidden ? '显示' : '隐藏'}</button>
          </div>
        )
      })}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={() => setModal('addEngine')}>添加自定义搜索引擎</button>
        <button className="btn sm ghost" onClick={() => setModal('engine')}>搜索引擎管理</button>
      </div>

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
      {([['link', '当前窗口打开链接'], ['tab', '打开新标签页'], ['search', '当前窗口打开搜索结果']] as const).map(([k, n]) => (
        <div className="switch-row" key={k}>
          <span>{n}</span>
          <div className={`switch${s.openMode === k ? ' on' : ''}`} onClick={() => setSetting('openMode', k)}><i /></div>
        </div>
      ))}

      <Sec t="数据与备份" />
      <div className="btn-row">
        <button className="btn ghost" onClick={() => showToast(user ? '备份完成' : '请先登录')}>备份当前界面</button>
        <button className="btn ghost" onClick={restoreDefault}>恢复为默认界面</button>
        <button className="btn danger" onClick={() => { restoreDefault(); showToast('已一键重置为出厂布局') }}>一键重置</button>
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={download}>导出布局 JSON</button>
        <button className="btn ghost" onClick={() => file.current?.click()}>导入布局 JSON</button>
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
      <Hint>导出内容 = 标准 / 隐私两套页面的全部卡片实例（引用的小组件、各自配置、位置与尺寸），改完文件可直接导入回来。</Hint>

      <Sec t="账号" />
      {user
        ? <div className="eng-row"><div className="er-ico" style={{ background: 'linear-gradient(160deg,#f5c58a,#e08a4a)' }}>{user.slice(0, 1).toUpperCase()}</div>
            <span style={{ flex: 1 }}>{user}</span>
            <button className="btn sm ghost" onClick={() => { setUser(null); showToast('退出成功') }}>退出登录</button></div>
        : <div className="btn-row"><button className="btn" onClick={() => setModal('login')}>现在登录</button></div>}
    </>
  )
}

const SquarePanel = () => {
  const showToast = useApp((s) => s.showToast)
  const items = [
    { t: '极夜星轨', a: '星野', l: 1284, b: 'linear-gradient(150deg,#141b2e,#2a2350 60%,#0b0e18)' },
    { t: '晨雾山峦', a: '青山', l: 962, b: 'linear-gradient(150deg,#dfe7ef,#a9b8c9 60%,#7d8fa3)' },
    { t: '樱色渐变', a: 'Momo', l: 743, b: 'linear-gradient(150deg,#ffd9e5,#ffb6c9 55%,#f0879f)' },
    { t: '深海静谧', a: 'Aqua', l: 651, b: 'linear-gradient(150deg,#0f3b52,#0b2233 55%,#07131d)' },
  ]
  return (
    <>
      <Hint>广场依赖服务端（一期后接入，见 01 §8）；下面是种子模板示意。</Hint>
      {items.map((p) => (
        <div className="eng-row" key={p.t}>
          <div className="er-ico" style={{ background: p.b, width: 44, height: 44, borderRadius: 12 }} />
          <div style={{ flex: 1 }}>
            <div>{p.t}</div>
            <div className="sr-desc" style={{ fontSize: 11, color: 'var(--panel-sub)' }}>{p.a} · {p.l} 赞</div>
          </div>
          <button className="btn sm ghost" onClick={() => showToast('应用成功（演示）')}>应用</button>
        </div>
      ))}
    </>
  )
}

const ProfilePanel = () => {
  const user = useApp((s) => s.user)
  const showToast = useApp((s) => s.showToast)
  const setModal = useApp((s) => s.setModal)
  const setUser = useApp((s) => s.setUser)
  return (
    <>
      <Sec t="我的" />
      {user
        ? <>
            <div className="eng-row">
              <div className="er-ico" style={{ width: 44, height: 44, borderRadius: '50%', fontSize: 16, background: 'linear-gradient(160deg,#f5c58a,#e08a4a)' }}>{user.slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1 }}><div>{user}</div><div className="sr-desc" style={{ fontSize: 11, color: 'var(--panel-sub)' }}>已登录</div></div>
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn ghost" onClick={() => showToast('备份完成')}>立即备份</button>
              <button className="btn ghost" onClick={() => setUser(null)}>退出登录</button>
            </div>
          </>
        : <>
            <Hint>登录后可进入隐私模式、备份与恢复界面；演示中登录即进入隐私模式。</Hint>
            <div className="btn-row"><button className="btn" onClick={() => setModal('login')}>现在登录</button></div>
          </>}
    </>
  )
}

const PANELS: Record<DrawerKey, () => React.ReactElement> = {
  add: AddPanel, personal: PersonalPanel, square: SquarePanel, setting: SettingPanel, profile: ProfilePanel,
}

export const Drawer = () => {
  const drawer = useApp((s) => s.drawer)
  const setDrawer = useApp((s) => s.setDrawer)
  const Panel = drawer ? PANELS[drawer] : null
  const [title, sub] = drawer ? DRAWERS[drawer] : ['', '']
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
        <div className="dw-body">{Panel ? <Panel /> : null}</div>
      </div>
    </>
  )
}

/* ============================== 弹窗 ============================== */

const CHANGELOG: readonly { v: string; d: string; l: readonly string[] }[] = [
  { v: '2.8.2', d: '2026-09-18', l: ['全局右键菜单新增「同步数据」入口', '界面广场修改为精确分页', '收藏夹采用更加合理的收藏夹逻辑', '修复本地上传壁纸无法下拉的问题'] },
  { v: '2.8.0', d: '2026-08-22', l: ['重新设计搜索框的样式与搜索功能', '添加搜索指示词以及其显示隐藏控制', '新增搜索引擎管理，可拖动引擎、隐藏不需要的引擎', '每套模式最多添加 5 页应用'] },
]

const EditCardModal = ({ item }: { item: GridItem }) => {
  const updateConfig = useApp((s) => s.updateConfig)
  const resize = useApp((s) => s.resize)
  const def = WIDGET_DEFS[item.t]
  const c = cfg(item)
  const field = (f: WidgetField) => {
    const v = c[f.k]
    if (f.t === 'bool') return <SwitchRow key={f.k} l={f.l} on={bool(v)} onToggle={() => updateConfig(item.id, { [f.k]: !bool(v) })} />
    if (f.t === 'sel') return (
      <div className="f-row" key={f.k}><label className="f-label">{f.l}</label>
        <div className="cats">{f.o?.map((o) => (
          <div key={o} className={`cat${o === v ? ' active' : ''}`} onClick={() => updateConfig(item.id, { [f.k]: o })}>{o}</div>
        ))}</div>
      </div>
    )
    const text = f.t === 'list' && Array.isArray(v) ? list(v).join(', ') : String(v ?? '')
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
    </>
  )
}

export const Modal = () => {
  const modal = useApp((s) => s.modal)
  const setModal = useApp((s) => s.setModal)
  const settings = useApp((s) => s.settings)
  const engines = useApp((s) => s.engines)
  const setEngine = useApp((s) => s.setEngine)
  const toggleEngineHidden = useApp((s) => s.toggleEngineHidden)
  const addEngine = useApp((s) => s.addEngine)
  const setUser = useApp((s) => s.setUser)
  const setMode = useApp((s) => s.setMode)
  const showToast = useApp((s) => s.showToast)
  const applySkin = useApp((s) => s.applySkin)
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const itemId = useApp((s) => s.itemId)
  const [engName, setEngName] = useState('')
  const [engBase, setEngBase] = useState('')
  const [mail, setMail] = useState('')
  const key = settings.mode === 'privacy' ? 'privacy' : 'standard'
  const item = pages[key][cur[key]]?.find((x) => x.id === itemId) ?? null
  if (!modal) return null
  const narrow = modal === 'log' || modal === 'about' || modal === 'engine'
  const body = () => {
    switch (modal) {
      case 'theme':
        return (
          <>
            <h2>欢迎来到 Thrilled</h2>
            <p className="sub">选择风格来搭配组件和图标，之后可随时在「个性化 - 主题与风格」中更换。</p>
            <div className="cats">
              {SKINS.map((k) => (
                <div key={k.id} className={`cat${k.id === settings.skinId ? ' active' : ''}`} onClick={() => applySkin(k.id, true)}>{k.n}</div>
              ))}
            </div>
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal(null)}>稍后再说</button>
              <button className="btn" onClick={() => { setModal(null); showToast('应用成功') }}>应用风格</button>
            </div>
          </>
        )
      case 'engine':
        return (
          <>
            <h2>搜索引擎管理</h2>
            <p className="sub">隐藏后的引擎不会出现在搜索框下拉、数字键切换与右键二级菜单里；搜索框左侧图标展开的下拉底部也有这个入口。</p>
            {engines.map((e) => (
              <div className="eng-row" key={e.id}>
                <div className="er-ico" style={{ background: e.color, opacity: e.hidden ? 0.45 : 1 }}>{e.glyph}</div>
                <span style={{ flex: 1, opacity: e.hidden ? 0.55 : 1 }}>{e.name}</span>
                {settings.engineId === e.id ? <span className="tb-tag">正在使用中</span> : null}
                {e.hidden ? <span className="tb-tag">已隐藏</span> : null}
                {settings.engineId === e.id ? null : <button className="btn sm ghost" onClick={() => setEngine(e.id)}>设为默认</button>}
                <button className="btn sm ghost" onClick={() => toggleEngineHidden(e.id)}>{e.hidden ? '显示' : '隐藏'}</button>
              </div>
            ))}
            <div className="btn-row end" style={{ marginTop: 16 }}>
              <button className="btn ghost" onClick={() => setModal('addEngine')}>添加自定义搜索引擎</button>
              <button className="btn" onClick={() => setModal(null)}>完成</button>
            </div>
          </>
        )
      case 'addEngine':
        return (
          <>
            <h2>添加自定义搜索引擎</h2>
            <p className="sub">请输入搜索引擎名称与搜索地址（启用数量上限 12 个）。</p>
            <div className="f-row"><label className="f-label">名称</label>
              <input className="f-input" placeholder="请输入搜索引擎名称" value={engName} onChange={(e) => setEngName(e.target.value)} /></div>
            <div className="f-row"><label className="f-label">搜索地址</label>
              <input className="f-input" placeholder="例如百度为 https://www.baidu.com/s?wd=" value={engBase} onChange={(e) => setEngBase(e.target.value)} /></div>
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => {
                const n = engName || '自定义'
                addEngine({ id: `c${Date.now().toString(36)}`, name: n, color: '#0EA5E9', glyph: n.slice(0, 1), base: engBase })
                setModal(null)
                showToast('添加成功')
              }}>确定</button>
            </div>
          </>
        )
      case 'log':
        return (
          <>
            <h2>更新记录</h2><p className="sub">当前版本 4.0（原型 2.8.2 基线）</p>
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
            <h2>关于我们</h2><p className="sub">Thrilled · 新标签页 4.0</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => showToast('问题反馈：请联系工作人员')}>问题反馈</button>
              <button className="btn ghost" onClick={() => showToast('隐私协议：尊重用户的隐私权利')}>隐私协议</button>
            </div>
            <Hint>壁纸来源于互联网，如有侵权请联系工作人员；为保障用户的数据安全与用户体验，请及时备份。</Hint>
            <div className="btn-row end" style={{ marginTop: 16 }}><button className="btn" onClick={() => setModal(null)}>关闭</button></div>
          </>
        )
      case 'login':
        return (
          <>
            <h2>现在登录</h2><p className="sub">登录后才能进入隐私模式。</p>
            <div className="f-row"><label className="f-label">邮箱</label>
              <input className="f-input" placeholder="请输入邮箱" value={mail} onChange={(e) => setMail(e.target.value)} /></div>
            <div className="f-row"><label className="f-label">密码</label>
              <input className="f-input" type="password" placeholder="请输入新密码" /></div>
            <div className="btn-row end">
              <button className="btn ghost" onClick={() => setModal(null)}>取消</button>
              <button className="btn" onClick={() => {
                setUser(mail || 'me@thrilled.dev')
                setModal(null)
                showToast('登录成功，已进入隐私模式')
                setMode('privacy')
              }}>登录</button>
            </div>
            <Hint>演示：点击「登录」即模拟登录成功，随后自动进入隐私模式。</Hint>
          </>
        )
      case 'editItem':
        return item ? <EditCardModal item={item} /> : <h2>编辑卡片</h2>
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