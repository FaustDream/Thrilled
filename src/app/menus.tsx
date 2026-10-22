/**
 * 右键菜单（空白处 4 项 + 卡片 6 项 / 图标类 7 项 + Dock 图标 5 项）
 *
 * 空白处只有「打开」与「整理图标」两组：打开添加面板 / 个性化 / 设置，末尾单独一组是「整理图标」。
 *  新建网站、图标文件夹与图标格容器统一走「打开添加面板」抽屉，右键不再提供新建入口。
 * 卡片与 Dock 图标各有自己的菜单；输入框、抽屉、弹窗、引擎面板里的右键仍交给浏览器原生菜单
 * （见 App 的 contextmenu 处理）。二级菜单按 UiTab 实测复刻。
 */
import { useEffect, useRef, useState } from 'react'
import { useApp, type CtxState } from './store'
import { ARRANGE_KINDS } from './layout'
import { WIDGET_DEFS, sizeAllowedFor } from '../shared/widget-defs'
import { SIZES } from '../shared/grid'
import { stage } from './stage'
import { CheckIcon } from './icons'
import { cfg } from './widgets'
import type { WidgetKind } from '../shared/types'

const SubItem = ({ on, children, act, v }: { on?: boolean; children: React.ReactNode; act: string; v?: string }) => (
  <div className={`ctx-sub-item${on ? ' on' : ''}`} data-act={act} data-v={v}>{<span className="ctx-check"><CheckIcon /></span>}{children}</div>
)

const CardMenu = ({ id }: { id: string }) => {
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const page = pages[cur] ?? []
  const item = page.find((x) => x.id === id)
  if (!item) return null
  const label = cfg(item)['label'] ?? cfg(item)['name'] ?? '链接'
  return (
    <>
      <div className="ctx-item" data-act="open-link"><span>打开</span></div>
      <div className="ctx-item" data-act="item-edit"><span>编辑信息</span></div>
      <div className="ctx-item"><span>更换小组件</span><span className="ctx-arrow" />
        <div className="ctx-sub" style={{ maxHeight: 560, overflow: 'auto' }}>
          {(Object.keys(WIDGET_DEFS) as WidgetKind[]).map((k) => (
            <SubItem key={k} on={item.t === k} act="item-swap" v={k}>{WIDGET_DEFS[k].n}</SubItem>
          ))}
        </div>
      </div>
      <div className="ctx-item"><span>修改尺寸</span><span className="ctx-arrow" />
        <div className="ctx-sub">
          {/* 只列出该组件装得下的档位（当前尺寸即使超范围也保留一条，便于看出现状） */}
          {SIZES.filter((s) => sizeAllowedFor(item.t, item.config, s.w, s.h) || (item.w === s.w && item.h === s.h)).map((s) => (
            <SubItem key={`${s.w}x${s.h}`} on={item.w === s.w && item.h === s.h} act="item-size" v={`${s.w}x${s.h}`}>
              {s.w}×{s.h}
            </SubItem>
          ))}
        </div>
      </div>
      <div className="ctx-item" data-act="item-folder"><span>添加到文件夹</span></div>
      {/* 跨页搬动：只给图标类（组件仍钉在各自页），二级列出其它页；
          右键的这张若在多选集合里，App 会当成「搬整组」 */}
      {pages.length > 1 && ARRANGE_KINDS.has(item.t) && (
        <div className="ctx-item"><span>移动到</span><span className="ctx-arrow" />
          <div className="ctx-sub">
            {pages.map((_, i) => (
              <div key={i} className={`ctx-sub-item${i === cur ? ' dis' : ''}`}
                data-act={i === cur ? 'ctx-blocked' : 'move-to-page'}
                data-v={i === cur ? '已经在这一页' : String(i)}>
                <span>第 {i + 1} 页</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="ctx-item" data-act="item-del"><span>删除该书签</span></div>
      <span style={{ display: 'none' }}>{String(label)}</span>
    </>
  )
}

/** Dock 图标右键菜单（打开 / 修改名称 / 修改网址 / 移除，动作在 App.onAct → dockMenuAct） */
const DockMenu = ({ idx }: { idx: number }) => {
  const apps = useApp((s) => s.settings.dockApps)
  const name = apps[idx]?.name
  if (name === undefined) return null
  return (
    <>
      <div className="ctx-item" data-act="dock-app" data-v={apps[idx]?.url ?? ''}><span>打开</span></div>
      <div className="ctx-item" data-act="dock-rename" data-v={String(idx)}><span>修改名称</span></div>
      <div className="ctx-item" data-act="dock-url" data-v={String(idx)}><span>修改网址</span></div>
      <div className="ctx-item" data-act="dock-remove" data-v={String(idx)}><span>从 Dock 移除</span></div>
      <div className="ctx-item" data-act="dock-config"><span>配置快捷方式…</span></div>
    </>
  )
}

/**
 * 空白处右键菜单（固定 4 项：打开添加面板 / 个性化 / 设置 + 整理图标；动作在 App.onAct）。
 * 新建网站、图标文件夹与图标格容器都在「打开添加面板」抽屉里，右键不再提供新建入口。
 */
const BlankMenu = () => (
  <>
    <div className="ctx-item" data-act="drawer-open" data-v="add"><span>打开添加面板</span></div>
    <div className="ctx-item" data-act="drawer-open" data-v="personal"><span>打开个性化</span></div>
    <div className="ctx-item" data-act="drawer-open" data-v="setting"><span>打开设置</span></div>
    {/* 工具组：手动整理（自动整理只发生在删除后，存量页面里已有的空洞靠这里补） */}
    <div className="ctx-sep" />
    <div className="ctx-item" data-act="arrange"><span>整理图标</span></div>
  </>
)

/** 关闭淡出时长（ms）：与 CSS 的 ctx-out 动画一致，期间保留 DOM 不卸载 */
const CTX_FADE_MS = 100

/** 菜单宿主：位置 / 贴边翻转都在这里算（坐标系是 1920×945 的 stage）
 *  关闭时保留 CTX_FADE_MS 做淡出（ctx 置空即卸载就没有退场动画），淡出期间再次打开会取消卸载 */
export const ContextMenu = () => {
  const ctx = useApp((s) => s.ctx)
  const ref = useRef<HTMLDivElement | null>(null)
  const hideAt = useRef<number | null>(null)
  const [snap, setSnap] = useState<CtxState | null>(null)
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState({ x: 0, y: 0, flip: false })
  useEffect(() => {
    if (hideAt.current !== null) { window.clearTimeout(hideAt.current); hideAt.current = null }
    if (ctx !== null) { setSnap(ctx); setOpen(true); return }
    setOpen(false)
    hideAt.current = window.setTimeout(() => { hideAt.current = null; setSnap(null) }, CTX_FADE_MS)
  }, [ctx])
  useEffect(() => () => { if (hideAt.current !== null) window.clearTimeout(hideAt.current) }, [])
  useEffect(() => {
    if (snap === null || !ref.current) return
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const flip = snap.x + w > stage.w - 20
    setBox({
      x: flip ? Math.max(8, snap.x - w - 120) : snap.x,
      y: snap.y + h > stage.h - 20 ? Math.max(8, stage.h - h - 20) : snap.y,
      flip,
    })
  }, [snap])
  if (snap === null) return null
  return (
    <div id="ctx" ref={ref} className={`ctx ${open ? 'show' : 'hide'}${box.flip ? ' flip' : ''}`} style={{ left: box.x, top: box.y }}>
      {snap.dock !== null ? <DockMenu idx={snap.dock} /> : snap.id !== null ? <CardMenu id={snap.id} /> : <BlankMenu />}
    </div>
  )
}
