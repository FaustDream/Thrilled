/**
 * 图标提示气泡定位单测
 * 覆盖：上方优先 / 顶部贴边翻转 / 水平两端钳制 / 上下都放不下时贴顶
 */
import { describe, expect, it } from 'vitest'
import { TIP_GAP, tipBoxOf } from '../src/shared/tip'

const VIEW = { w: 1920, h: 945 }
/** 自然尺寸的图标卡（2×2：2×74 − 2×25 = 98） */
const ICON = { x: 800, y: 400, w: 98, h: 98 }
const TIP = { w: 160, h: 40 }

describe('tipBoxOf：图标提示气泡的定位', () => {
  it('上方有空间时浮在锚点上方，且水平居中对齐锚点', () => {
    expect(tipBoxOf(ICON, TIP, VIEW)).toEqual({ x: 769, y: 400 - TIP.h - TIP_GAP, flip: false })
  })

  it('上方贴边且下方放得下时翻到锚点下方', () => {
    const top = { ...ICON, y: 40 }
    expect(tipBoxOf(top, TIP, VIEW)).toEqual({ x: 769, y: 40 + ICON.h + TIP_GAP, flip: true })
  })

  it('水平两端钳制在舞台内（左贴边 / 右贴边）', () => {
    expect(tipBoxOf({ x: 0, y: 400, w: 40, h: 40 }, TIP, VIEW).x).toBe(4)
    expect(tipBoxOf({ x: 1900, y: 400, w: 20, h: 20 }, TIP, VIEW).x).toBe(VIEW.w - TIP.w - 4)
  })

  it('上下都放不下时贴顶显示，不为了翻转反而溢出底部', () => {
    const tall = { w: TIP.w, h: 900 }
    const box = tipBoxOf({ x: 800, y: 2, w: 98, h: 98 }, tall, VIEW)
    expect(box.flip).toBe(false)
    expect(box.y).toBe(4)
  })
})
