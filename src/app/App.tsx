/**
 * 新标签页装配（v4）
 * 结构：Stage（1920×945 设计稿整体缩放）→ 搜索行 / 翻页网格 / Dock / 模式胶囊 / 头像 / 页点 + 浮层（菜单·抽屉·弹窗·Toast）
 * 交互：文档级 data-act 事件委托（与原型一致），拖拽换位用指针事件 + 网格吸附。
 */
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useApp, SKINS, WALLS, type CtxState, type DrawerKey } from './store'
import { COLS, DOCK_APPS, PAGE_W, ROWS, STAGE_H, STAGE_W, CELL, INSET, itemBox, labelBox } from './layout'
import { WidgetView, TileGlyph, cfg, num, str } from './widgets'
import { ContextMenu } from './menus'
import { Drawer, Modal } from './panels'
import { Icon } from './icons'
import type { GridItem, WidgetKind } from '../shared/types'

const allItems = (pages: { standard: GridItem[][]; privacy: GridItem[][] }): GridItem[] =>
  [...pages.standard, ...pages.privacy].flat()

/** 搜索：把输入框内容交给当前引擎（打开方式遵循设置；真实扩展里由 core/link-opener 接管） */
const runSearch = (): void => {
  const st = useApp.getState()
  const el = document.getElementById('searchInput') as HTMLInputElement | null
  const term = el?.value.trim() ?? ''
  if (!term) { st.showToast('请输入搜索内容'); return }
  st.addHistory(term)
  openUrl(st, term, 'search')
  if (!st.settings.searchKeep && el) el.value = ''
}

export const App = () => {
  const settings = useApp((s) => s.settings)
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const engines = useApp((s) => s.engines)
  const toastMsg = useApp((s) => s.toast)
  const enginePanel = useApp((s) => s.enginePanel)
  const history = useApp((s) => s.history)
  const encourage = useApp((s) => s.encourage)
  const playing = useApp((s) => s.playing)
  const [now, setNow] = useState(() => new Date())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; c: number; r: number; moved: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const modeKey = settings.mode === 'privacy' ? 'privacy' : 'standard'
  const engine = engines.find((e) => e.id === settings.engineId) ?? engines[0]
  const visibleEngines = engines.filter((e) => !e.hidden)

  /* ---------- 主题令牌 → CSS 变量（皮肤 / 透明度 / 玻璃质感 / 壁纸 / 搜索框） ---------- */
  useEffect(() => {
    const rt = document.documentElement.style
    const skin = SKINS.find((k) => k.id === settings.skinId) ?? SKINS[0]
    if (skin) Object.entries(skin.t).forEach(([k, v]) => rt.setProperty(k, v))
    Object.entries(settings.glass).forEach(([k, v]) => {
      rt.setProperty(`--ga-${k}`, String(1 - 0.55 * v))
      rt.setProperty(`--blur-${k}`, `${(26 * v).toFixed(1)}px`)
    })
    rt.setProperty('--g-alpha', String(settings.gAlpha))
    rt.setProperty('--wallpaper', WALLS[settings.wallpaper]?.bg ?? WALLS[0]?.bg ?? '')
    rt.setProperty('--search-width', `${settings.searchWidth}px`)
    rt.setProperty('--search-radius', `${settings.searchRadius}px`)
    rt.setProperty('--clock-color', settings.clockColor)
  }, [settings])

  /* ---------- 时钟 & 整体缩放 ---------- */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
      const el = stageRef.current
      if (el) el.style.transform = `translate(${(window.innerWidth - STAGE_W * s) / 2}px,${(window.innerHeight - STAGE_H * s) / 2}px) scale(${s})`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => useApp.setState({ toast: '' }), 1800)
    return () => clearTimeout(t)
  }, [toastMsg])
  useEffect(() => {
    if (settings.autoFocus) inputRef.current?.focus()
  }, [settings.autoFocus])
  /* 首次访问：欢迎弹窗选风格（与原型一致，会话内只弹一次） */
  useEffect(() => {
    if (!sessionStorage.getItem('thrilled-welcome')) {
      sessionStorage.setItem('thrilled-welcome', '1')
      useApp.getState().setModal('theme')
    }
  }, [])

  /* ---------- 动作分发（data-act 事件委托，与原型同一套语义） ---------- */
  useEffect(() => {
    const onAct = (name: string, v: string, el: HTMLElement): void => {
      const st = useApp.getState()
      const host = el.closest('.item')
      const id = host?.getAttribute('data-id') ?? st.ctx?.id ?? ''
      if (id) useApp.setState({ itemId: id })
      const item = allItems(st.pages).find((x) => x.id === id) ?? null
      switch (name) {
        case 'hot-tab': if (id) st.updateConfig(id, { source: v }); break
        case 'hot-refresh': st.showToast('已换一批热点'); break
        case 'hot-open': openUrl(st, v, 'search'); break
        case 'music-list': st.showToast(`播放列表：${item ? str(cfg(item)['station'], '熊猫Dj') : '熊猫Dj'}`); break
        case 'music-prev': st.showToast('上一首'); break
        case 'music-next': st.showToast('下一首'); break
        case 'music-toggle': st.setPlaying(!st.playing); break
        case 'quote-refresh': st.rollEncourage(); break
        case 'fish-hit': if (item) st.updateConfig(item.id, { count: num(cfg(item)['count'], 0) + 1 }); break
        case 'engine-open':
          setHistoryOpen(false)
          st.setEnginePanel(!st.enginePanel)
          break
        case 'engine-manage': st.setEnginePanel(false); st.setDrawer('setting'); st.showToast('已打开设置 · 搜索引擎'); break
        case 'eng-set': st.setEngine(v); st.showToast(`该搜索引擎正在使用中`); break
        case 'eng-hide': st.toggleEngineHidden(v); break
        case 'search-go': runSearch(); setHistoryOpen(false); break
        case 'sp-pick': if (inputRef.current) inputRef.current.value = v; runSearch(); setHistoryOpen(false); break
        case 'sp-del': useApp.setState({ history: st.history.filter((h) => h !== v) }); break
        case 'set-mode': st.setMode(v as 'minimal' | 'standard' | 'privacy'); break
        case 'go-page': st.goPage(Number(v)); break
        case 'open-drawer': st.setDrawer((v || 'profile') as DrawerKey); break
        case 'dock-app': openUrl(st, v, 'other'); break
        case 'dock-act': st.setDrawer(({ add: 'add', personal: 'personal', square: 'square', setting: 'setting' } as const)[v] ?? 'setting'); break
        case 'open-modal': st.setModal(v as 'theme'); break
        case 'ctx-tog': {
          const k = v as 'labels' | 'mascot' | 'hideSearch'
          st.toggle(k)
          break
        }
        case 'sync': st.showToast('正在同步数据…'); break
        case 'msg': st.showToast('暂无消息'); break
        case 'item-edit': st.openCtx(null); st.setModal('editItem'); break
        case 'item-del': st.remove(id); break
        case 'item-swap': st.swapKind(id, v as WidgetKind); break
        case 'item-size': {
          const [w, h] = v.split('x').map(Number)
          st.resize(id, w ?? 0, h ?? 0)
          st.openCtx(null)
          break
        }
        case 'item-folder': st.showToast('添加到文件夹：请输入文件夹名称'); break
        case 'open-link': {
          const label = item ? str(cfg(item)['label'], str(cfg(item)['name'], '链接')) : '链接'
          st.openCtx(null)
          openUrl(st, label, 'tiles')
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
      if (!inSearch) setHistoryOpen(false)
      const inEngine = (e.target as HTMLElement).closest?.('#engineIco') || (e.target as HTMLElement).closest?.('#enginePanel')
      if (!inEngine) st.setEnginePanel(false)
      const grid = (e.target as HTMLElement).classList?.contains('grid')
      if (grid) { setHistoryOpen(true); inputRef.current?.focus() }
    }
    const cm = (e: MouseEvent) => {
      e.preventDefault()
      const el = stageRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const s = r.width / STAGE_W
      const host = (e.target as HTMLElement).closest?.('.item')
      const next: CtxState = {
        x: Math.min((e.clientX - r.left) / s, STAGE_W - 240),
        y: (e.clientY - r.top) / s,
        id: host?.getAttribute('data-id') ?? null,
      }
      useApp.getState().openCtx(next)
    }
    const key = (e: KeyboardEvent) => {
      const st = useApp.getState()
      if (e.key === 'Escape') {
        st.openCtx(null); st.setModal(null); st.setDrawer(null); st.setEnginePanel(false); setHistoryOpen(false)
        return
      }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key >= '1' && e.key <= '9') {
        const list = st.engines.filter((x) => !x.hidden)
        const target = list[Number(e.key) - 1]
        if (target) { st.setEngine(target.id); st.showToast(`已切换到：${target.name}`) }
        return
      }
      if (e.key === 'ArrowLeft') st.goPage(st.cur[modeKey] - 1)
      if (e.key === 'ArrowRight') st.goPage(st.cur[modeKey] + 1)
    }
    document.addEventListener('click', click)
    document.addEventListener('contextmenu', cm)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('click', click)
      document.removeEventListener('contextmenu', cm)
      document.removeEventListener('keydown', key)
    }
  }, [modeKey])

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
        const it = allItems(useApp.getState().pages).find((v) => v.id === d.id)
        if (!it) return d
        const c = Math.max(0, Math.min(COLS - it.w, Math.round((x - INSET) / CELL)))
        const r2 = Math.max(0, Math.min(ROWS - it.h, Math.round((y - INSET) / CELL)))
        return { ...d, x, y, c, r: r2, moved: true }
      })
    }
    const up = () => {
      setDrag((d) => {
        if (d && d.moved) {
          const ok = useApp.getState().move(d.id, d.c, d.r)
          if (!ok) useApp.getState().showToast('该位置已被占用')
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
    <div id="stage" ref={stageRef} data-mode={settings.mode} data-labels={settings.labels ? '1' : '0'}
      data-hidetop={settings.hideTop ? '1' : '0'} data-hidesearch={settings.hideSearch ? '1' : '0'}
      data-showtime={settings.showTime ? '1' : '0'} data-showdate={settings.showDate ? '1' : '0'}
      data-showquote={settings.showQuote ? '1' : '0'}>

      {/* 翻页画布 */}
      <div id="pager" style={{ transform: `translateX(-${cur[modeKey] * PAGE_W}px)` }}>
        {pages[modeKey].map((pg, i) => (
          <div className="page" key={i} style={{ left: i * PAGE_W }}>
            <div className="grid" ref={i === cur[modeKey] ? gridRef : undefined}>
              {pg.map((it) => (
                <GridCard key={it.id} item={it} now={now} nick={settings.nick} encourage={encourage} playing={playing}
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
                    })
                  }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 页点 */}
      {pages[modeKey].length > 1 && (
        <div className="page-dots">
          {pages[modeKey].map((_, i) => (
            <div key={i} className={`page-dot${i === cur[modeKey] ? ' on' : ''}`} data-act="go-page" data-v={String(i)} />
          ))}
        </div>
      )}

      {/* 搜索行 */}
      <div className="search-row">
        <div className="search-box" id="searchBox" style={{ width: settings.searchWidth, borderRadius: settings.searchRadius }}>
          <span className="engine-ico" id="engineIco" data-act="engine-open"
            style={{ background: engine?.color, fontSize: engine?.latin ? 10 : 11 }}>{engine?.glyph}</span>
          <input id="searchInput" ref={inputRef} placeholder={`${engine?.name ?? ''} 搜索`} autoComplete="off" spellCheck={false}
            onFocus={() => setHistoryOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); setHistoryOpen(false) } }} />
          {!settings.hideBtn && (
            <span className="search-go-btn" data-act="search-go" title="搜索" style={{ color: 'var(--search-text)' }}>{Icon.search()}</span>
          )}
        </div>
      </div>
      {settings.searchHistory && historyOpen && history.length > 0 && (
        <div className="search-panel show" id="searchPanel">
          <div className="sp-head">搜索历史</div>
          {history.map((h) => (
            <div className="sp-row" key={h} data-act="sp-pick" data-v={h}>
              {Icon.search()}<span className="t">{h}</span>
              <span className="sp-del" data-act="sp-del" data-v={h}>{Icon.close()}</span>
            </div>
          ))}
        </div>
      )}
      {enginePanel && (
        <div className="engine-panel show" id="enginePanel" style={{ left: (STAGE_W - settings.searchWidth) / 2 }}>
          {visibleEngines.map((e, i) => (
            <div key={e.id} className={`ep-row${e.id === settings.engineId ? ' on' : ''}`} data-act="eng-set" data-v={e.id}>
              <span className="ep-ico" style={{ background: e.color, fontSize: e.latin ? 9 : 11 }}>{e.glyph}</span>
              <span className="ep-n">{e.name}</span>
              {e.id === settings.engineId ? <span className="ep-cur">{Icon.search()}</span> : i < 9 ? <span className="ep-key">{i + 1}</span> : null}
            </div>
          ))}
          <div className="ep-foot" />
          <div className="ep-row ep-manage" data-act="engine-manage">
            <span className="ep-ico" style={{ background: 'transparent', color: 'var(--panel-sub)' }}>{Icon.gear()}</span>
            <span className="ep-n">管理搜索引擎</span><span className="ep-key">设置</span>
          </div>
        </div>
      )}

      {/* 极简模式时钟 */}
      <div className="minimal-clock">
        <div className="mc-time">{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`}</div>
        <div className="mc-date">{`${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`}</div>
      </div>

      {/* 模式胶囊 + 头像 */}
      {!settings.hideTop && (
        <>
          <div className="mode-pill">
            <span className="pill-ico">{Icon.modeStd()}</span>
            <div className="pill-opts">
              {([['minimal', '极简'], ['standard', '标准'], ['privacy', '隐私']] as const).map(([k, n]) => (
                <div key={k} className={`pill-btn${settings.mode === k ? ' active' : ''}`} data-act="set-mode" data-v={k}>{n}</div>
              ))}
            </div>
          </div>
          <div className="avatar" data-act="open-drawer" data-v="profile">{'T'}</div>
        </>
      )}

      {/* Dock */}
      {settings.mascot && (
        <div className="dock">
          <div className="dock-bar">
            <div className="dock-apps">
              {DOCK_APPS.slice(0, settings.dockCount).map((n) => (
                <div className="dock-item" key={n} data-act="dock-app" data-v={n}>
                  <TileGlyph name={n} cls={`dock-icon${settings.dockIcon === 'circle' ? ' circle' : ''}`} fs={30} />
                  <div className="dock-name">{n}</div>
                </div>
              ))}
            </div>
            <div className="dock-sep" />
            <div className="dock-actions">
              {([['add', '添加'], ['personal', '个性化'], ['square', '广场'], ['setting', '设置']] as const).map(([k, n]) => (
                <div className="dock-item" key={k} data-act="dock-act" data-v={k}>
                  <div className={`dock-icon${settings.dockIcon === 'circle' ? ' circle' : ''}`}>
                    {k === 'add' ? Icon.plus() : k === 'personal' ? Icon.sliders() : k === 'square' ? Icon.grid() : Icon.gear()}
                  </div>
                  <div className="dock-name">{n}</div>
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
  )
}

/** 打开链接 / 搜索（打开方式遵循设置；真实扩展里由 core/link-opener 接管） */
const openUrl = (st: ReturnType<typeof useApp.getState>, term: string, kind: 'search' | 'tiles' | 'other'): void => {
  const engine = st.engines.find((e) => e.id === st.settings.engineId) ?? st.engines[0]
  const base = engine?.base ?? ''
  const url = kind === 'search' && base ? `${base}${encodeURIComponent(term)}` : /^https?:\/\//.test(term) ? term : ''
  const mode = st.settings.openMode
  if (url) window.open(url, mode === 'tab' ? '_blank' : '_self')
  const how = mode === 'tab' ? '新标签页打开：' : '当前窗口打开：'
  st.showToast(`${how}${term}`)
}

/** 单张卡片：外框 + 内容 + 名称标签 + 悬浮操作 */
const GridCard = ({ item, now, nick, encourage, playing, dragging, onDragStart }: {
  item: GridItem
  now: Date
  nick: string
  encourage: string
  playing: boolean
  dragging: { x: number; y: number; moved: boolean } | null
  onDragStart: (e: ReactPointerEvent) => void
}) => {
  const label = str(cfg(item)['label'], str(cfg(item)['name']))
  const style = dragging?.moved
    ? { left: dragging.x, top: dragging.y, zIndex: 20, transition: 'none' }
    : undefined
  return (
    <>
      <div className={`item${dragging?.moved ? ' dragging' : ''}`} style={{ ...parseBox(itemBox(item)), ...style }}
        data-id={item.id} data-t={item.t} onPointerDown={onDragStart}>
        <WidgetView item={item} now={now} nick={nick} encourage={encourage} playing={playing} />
        <div className="item-acts">
          <div className="ia" data-act="item-edit" title="编辑">{Icon.edit()}</div>
          <div className="ia" data-act="item-del" title="删除">{Icon.trash()}</div>
        </div>
      </div>
      {label ? <div className="item-label" style={parseBox(labelBox(item))}>{label}</div> : null}
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