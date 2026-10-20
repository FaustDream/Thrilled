/**
 * 图标提示气泡（悬停看名称 + 域名）
 *
 * 用来辨认「字形相似或重复」的网站图标：悬停网格上的图标卡、图标格容器里的格子、
 * 图标文件夹卡与 Dock 图标时，在元素上方（放不下则翻到下方）浮出名称与域名。
 * 四处共用同一套提示语言——目标元素只带两个属性：data-tip（名称）、data-tip-host（域名，可省）。
 *
 * 为什么画在 #stage 顶层（与右键菜单同级）而不是挂在元素内部：卡片 .item 是 overflow:hidden，
 * 图标格容器溢出时还会滚动裁切，挂在元素内部的气泡会被剪掉。
 *
 * 事件用 mouseover 委托，延迟 250ms 才显示——鼠标横扫一排图标时不至于闪一片；
 * 移出后保留 DOM 100ms 播完淡出（与右键菜单同一手法）。
 */
import { useEffect, useRef, useState } from 'react'
import { tipBoxOf } from '../shared/tip'
import { stage } from './stage'
import { useApp } from './store'

const SHOW_DELAY = 250
const EXIT_MS = 100

interface TipState {
  name: string
  host: string
  /** 锚点：被悬停元素在舞台坐标里的框 */
  anchor: { x: number; y: number; w: number; h: number }
}

/** 屏幕坐标 → 舞台坐标（与右键菜单同一换算：窗口过小时舞台整体等比缩小） */
const stageBoxOf = (el: Element): TipState['anchor'] | null => {
  const st = document.getElementById('stage')
  if (st === null) return null
  const sr = st.getBoundingClientRect()
  const s = sr.width / stage.w
  if (s <= 0) return null
  const r = el.getBoundingClientRect()
  return { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: r.width / s, h: r.height / s }
}

export const IconTip = () => {
  const cur = useApp((s) => s.cur)
  const mode = useApp((s) => s.settings.mode)
  const [tip, setTip] = useState<TipState | null>(null)
  const [on, setOn] = useState(false)
  const [box, setBox] = useState({ x: 0, y: 0, flip: false })
  const ref = useRef<HTMLDivElement | null>(null)
  const showTimer = useRef(0)
  const exitTimer = useRef(0)
  const hovered = useRef<Element | null>(null)

  useEffect(() => {
    const hide = (): void => {
      window.clearTimeout(showTimer.current)
      hovered.current = null
      setOn(false)
      /* 保留 DOM 播完淡出再卸载 */
      window.clearTimeout(exitTimer.current)
      exitTimer.current = window.setTimeout(() => setTip(null), EXIT_MS)
    }
    const over = (e: MouseEvent): void => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null
      if (el === null) { hide(); return }
      /* 同一元素内部移动（字形、文字等子节点）不重来 */
      if (el === hovered.current) return
      const name = el.getAttribute('data-tip') ?? ''
      const host = el.getAttribute('data-tip-host') ?? ''
      if (name === '' && host === '') { hide(); return }
      const anchor = stageBoxOf(el)
      window.clearTimeout(showTimer.current)
      window.clearTimeout(exitTimer.current)
      setOn(false)
      if (anchor === null) return
      hovered.current = el
      showTimer.current = window.setTimeout(() => {
        setTip({ name, host, anchor })
        /* 直接置 on，不再等 requestAnimationFrame：后台标签页等环境里那一帧可能永远不来，
           气泡会卡在 opacity:0（实测可见性为 false） */
        setOn(true)
      }, SHOW_DELAY)
    }
    const resize = (): void => {
      const el = hovered.current
      if (el === null) return
      const anchor = stageBoxOf(el)
      if (anchor !== null) setTip((t) => (t === null ? null : { ...t, anchor }))
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('mouseleave', hide)
    /* 按下（含右键与开始拖拽）、窗口缩放、滚轮翻页时元素会动，气泡立即收起 */
    document.addEventListener('pointerdown', hide, true)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mouseleave', hide)
      document.removeEventListener('pointerdown', hide, true)
      window.removeEventListener('resize', resize)
      window.clearTimeout(showTimer.current)
      window.clearTimeout(exitTimer.current)
    }
  }, [])

  /* 气泡尺寸只有渲染后才知道：量到实际宽高再定位（翻转与钳制都在 tipBoxOf 里） */
  useEffect(() => {
    const el = ref.current
    if (tip === null || el === null) return
    setBox(tipBoxOf(tip.anchor, { w: el.offsetWidth, h: el.offsetHeight }, { w: stage.w, h: stage.h }))
  }, [tip])

  /* 翻页 / 换模式：卡片被整体挪走，气泡直接收起 */
  useEffect(() => {
    setOn(false)
    setTip(null)
    hovered.current = null
  }, [cur, mode])

  if (tip === null) return null
  return (
    <div ref={ref} className={`icon-tip${on ? ' show' : ''}${box.flip ? ' below' : ''}`}
      style={{ left: box.x, top: box.y }} aria-hidden="true">
      <div className="it-name">{tip.name}</div>
      {tip.host !== '' && <div className="it-host">{tip.host}</div>}
    </div>
  )
}
