/**
 * 右键菜单（全局 11 项 + 卡片 6 项，见 docs/v4/02-UI规格.md §7）
 * 二级菜单与开关按 UiTab 实测复刻；「更换小组件」是内容模型带来的新入口（可换引用类型）。
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from './store'
import { WIDGET_DEFS } from '../shared/widget-defs'
import { SIZES, STAGE_W, STAGE_H } from '../shared/grid'
import { CheckIcon, Icon } from './icons'
import { cfg } from './widgets'
import type { WidgetKind } from '../shared/types'

const OPEN_MODES: readonly (readonly [string, string])[] = [
  ['link', '当前窗口打开链接'], ['tab', '打开新标签页'], ['search', '当前窗口打开搜索结果'],
]

const SubItem = ({ on, children, act, v }: { on?: boolean; children: React.ReactNode; act: string; v?: string }) => (
  <div className={`ctx-sub-item${on ? ' on' : ''}`} data-act={act} data-v={v}>{<span className="ctx-check"><CheckIcon /></span>}{children}</div>
)

const GlobalMenu = () => {
  const engines = useApp((s) => s.engines)
  const engineId = useApp((s) => s.settings.engineId)
  const openMode = useApp((s) => s.settings.openMode)
  const labels = useApp((s) => s.settings.labels)
  const mode = useApp((s) => s.settings.mode)
  const hideSearch = useApp((s) => s.settings.hideSearch)
  const mascot = useApp((s) => s.settings.mascot)
  const visible = engines.filter((e) => !e.hidden)
  const Sw = ({ on }: { on: boolean }) => <span className={`ctx-switch${on ? ' on' : ''}`}><i /></span>
  return (
    <>
      <div className="ctx-item"><span>打开方式</span><span className="ctx-arrow" />
        <div className="ctx-sub">
          {OPEN_MODES.map(([k, n]) => <SubItem key={k} on={openMode === k} act="open-mode" v={k}>{n}</SubItem>)}
        </div>
      </div>
      <div className="ctx-item" data-act="ctx-tog" data-v="hideSearch"><span>搜索栏</span><Sw on={hideSearch} /></div>
      <div className="ctx-item"><span>Dock栏</span><span className="ctx-arrow" />
        <div className="ctx-sub">
          <SubItem act="open-drawer" v="personal">栏透明度</SubItem>
          <SubItem act="open-drawer" v="personal">栏应用数量</SubItem>
          <SubItem act="open-drawer" v="personal">栏图标</SubItem>
        </div>
      </div>
      <div className="ctx-item" data-act="set-mode" data-v="minimal"><span>极简模式</span><Sw on={mode === 'minimal'} /></div>
      <div className="ctx-item" data-act="ctx-tog" data-v="labels"><span>隐藏项目</span><Sw on={!labels} /></div>
      <div className="ctx-item"><span>搜索引擎</span><span className="ctx-arrow" />
        <div className="ctx-sub">
          {visible.map((e) => <SubItem key={e.id} on={e.id === engineId} act="eng-set" v={e.id}>{e.name}</SubItem>)}
          <SubItem act="open-modal" v="engine">管理搜索引擎</SubItem>
        </div>
      </div>
      <div className="ctx-item" data-act="ctx-tog" data-v="mascot"><span>吉祥物</span><Sw on={mascot} /></div>
      <div className="ctx-item" data-act="sync"><span>同步数据</span></div>
      <div className="ctx-item" data-act="msg"><span>站内消息</span></div>
      <div className="ctx-item" data-act="open-modal" data-v="log"><span>更新记录</span></div>
      <div className="ctx-item" data-act="open-modal" data-v="about"><span>关于我们</span></div>
    </>
  )
}

const CardMenu = ({ id }: { id: string }) => {
  const pages = useApp((s) => s.pages)
  const mode = useApp((s) => s.settings.mode)
  const cur = useApp((s) => s.cur)
  const key = mode === 'privacy' ? 'privacy' : 'standard'
  const page = pages[key][cur[key]] ?? []
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
          {SIZES.map((s) => (
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

/** 菜单宿主：位置 / 贴边翻转都在这里算（坐标系是 1920×945 的 stage） */
export const ContextMenu = () => {
  const ctx = useApp((s) => s.ctx)
  const ref = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ x: 0, y: 0, flip: false })
  useEffect(() => {
    if (!ctx || !ref.current) return
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const flip = ctx.x + w > STAGE_W - 20
    setBox({
      x: flip ? Math.max(8, ctx.x - w - 120) : ctx.x,
      y: ctx.y + h > STAGE_H - 20 ? Math.max(8, STAGE_H - h - 20) : ctx.y,
      flip,
    })
  }, [ctx])
  if (!ctx) return null
  return (
    <div id="ctx" ref={ref} className={`ctx show${box.flip ? ' flip' : ''}`} style={{ left: box.x, top: box.y }}>
      {ctx.id ? <CardMenu id={ctx.id} /> : <GlobalMenu />}
    </div>
  )
}

export const GearIcon = Icon.gear