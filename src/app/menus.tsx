/**
 * 右键菜单（空白处 6 项 + 卡片 6 项 + Dock 图标 5 项）
 *
 * 空白处：新建网址图标 / 添加到 Dock 快捷方式 / 添加组件（二级 9 类）/ 打开添加面板 / 个性化 / 设置。
 * 卡片与 Dock 图标各有自己的菜单；输入框、抽屉、弹窗、引擎面板里的右键仍交给浏览器原生菜单
 * （见 App 的 contextmenu 处理）。二级菜单按 UiTab 实测复刻。
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from './store'
import { WIDGET_DEFS, placeSizeOf, sizeAllowedFor } from '../shared/widget-defs'
import { MAX_PAGES, SIZES, findSlot } from '../shared/grid'
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
 * 空白处右键菜单（固定 6 项：3 个新建 + 3 个打开；动作在 App.onAct）。
 * 置灰只覆盖可判定的情形：Dock 满额、到 5 页上限且本页放不下默认尺寸的图标；
 * 「添加组件」尺寸随类型而异，不预判，交给 store.place 的 toast 兜底。
 */
const BlankMenu = () => {
  const pages = useApp((s) => s.pages)
  const cur = useApp((s) => s.cur)
  const sizeDefaults = useApp((s) => s.settings.sizeDefaults)
  const apps = useApp((s) => s.settings.dockApps)
  const dockCount = useApp((s) => s.settings.dockCount)
  const icon = placeSizeOf('icon', {}, sizeDefaults)
  const noRoom = pages.length >= MAX_PAGES && findSlot(pages[cur] ?? [], icon.w, icon.h) === null
  const dockFull = apps.length >= dockCount
  const roomTip = '最多 5 页，已没有位置可放'
  const dockTip = `Dock 最多 ${dockCount} 个快捷方式，请先移除一些`
  return (
    <>
      <div className={`ctx-item${noRoom ? ' dis' : ''}`} data-act={noRoom ? 'ctx-blocked' : 'newsite'} data-v={noRoom ? roomTip : 'page'}>
        <span>新建网址图标</span>
      </div>
      <div className={`ctx-item${dockFull ? ' dis' : ''}`} data-act={dockFull ? 'ctx-blocked' : 'newsite'} data-v={dockFull ? dockTip : 'dock'}>
        <span>添加到 Dock 快捷方式</span>
      </div>
      <div className="ctx-item"><span>添加组件</span><span className="ctx-arrow" />
        <div className="ctx-sub" style={{ maxHeight: 560, overflow: 'auto' }}>
          {(Object.keys(WIDGET_DEFS) as WidgetKind[]).map((k) => (
            <div key={k} className="ctx-sub-item" data-act="place-kind" data-v={k}>{WIDGET_DEFS[k].n}</div>
          ))}
        </div>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-item" data-act="drawer-open" data-v="add"><span>打开添加面板</span></div>
      <div className="ctx-item" data-act="drawer-open" data-v="personal"><span>打开个性化</span></div>
      <div className="ctx-item" data-act="drawer-open" data-v="setting"><span>打开设置</span></div>
    </>
  )
}

/** 菜单宿主：位置 / 贴边翻转都在这里算（坐标系是 1920×945 的 stage） */
export const ContextMenu = () => {
  const ctx = useApp((s) => s.ctx)
  const ref = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ x: 0, y: 0, flip: false })
  useEffect(() => {
    if (!ctx || !ref.current) return
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const flip = ctx.x + w > stage.w - 20
    setBox({
      x: flip ? Math.max(8, ctx.x - w - 120) : ctx.x,
      y: ctx.y + h > stage.h - 20 ? Math.max(8, stage.h - h - 20) : ctx.y,
      flip,
    })
  }, [ctx])
  if (!ctx) return null
  return (
    <div id="ctx" ref={ref} className={`ctx show${box.flip ? ' flip' : ''}`} style={{ left: box.x, top: box.y }}>
      {ctx.dock !== null ? <DockMenu idx={ctx.dock} /> : ctx.id !== null ? <CardMenu id={ctx.id} /> : <BlankMenu />}
    </div>
  )
}
