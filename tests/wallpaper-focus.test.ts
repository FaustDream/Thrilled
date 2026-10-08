/**
 * 壁纸裁剪焦点单测（v4.4）
 *
 * 覆盖：图比屏宽时沿 X 搜索、图比屏高时沿 Y 搜索、主体偏侧被推出居中、
 * 宽高比一致 / 矩阵过小 / 比例非法时退回居中。
 *
 * 只测纯函数 focusOffset（已降采样的灰度矩阵直接构造），不涉及 canvas 采样。
 */
import { describe, expect, it } from 'vitest'
import { focusOffset } from '../src/core/wallpaper-focus'

/**
 * 造一张灰度矩阵：热区填 3px 块状棋盘（强边缘 + 高方差），其余填中灰。
 * 注意不能用 1px 棋盘——那图案的 Sobel 会在中心点对称抵消、梯度恒为 0。
 */
const synth = (gw: number, gh: number, hot: { x0: number; x1: number; y0: number; y1: number }): Float32Array => {
  const lum = new Float32Array(gw * gh)
  lum.fill(0.5)
  for (let y = hot.y0; y < hot.y1; y++) {
    for (let x = hot.x0; x < hot.x1; x++) {
      lum[y * gw + x] = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0 ? 0 : 1
    }
  }
  return lum
}

const CENTER = { x: 50, y: 50 }

describe('focusOffset 裁剪焦点', () => {
  it('图比屏宽（裁左右）：主体偏右时窗口推向右端，垂直方向保持居中', () => {
    const gw = 100
    const gh = 50
    const p = focusOffset(synth(gw, gh, { x0: 55, x1: 95, y0: 5, y1: 45 }), gw, gh, 1)
    expect(p.x).toBeGreaterThan(60)
    expect(p.y).toBe(50)
  })

  it('图比屏宽（裁左右）：主体偏左时窗口推向左端', () => {
    const gw = 100
    const gh = 50
    const p = focusOffset(synth(gw, gh, { x0: 5, x1: 45, y0: 5, y1: 45 }), gw, gh, 1)
    expect(p.x).toBeLessThan(40)
    expect(p.y).toBe(50)
  })

  it('图比屏高（裁上下）：改为沿垂直轴搜索', () => {
    const gw = 50
    const gh = 100
    /* 屏幕 2:1 → 窗口高 25，可移动范围 75；主体落在下半 */
    const p = focusOffset(synth(gw, gh, { x0: 5, x1: 45, y0: 70, y1: 95 }), gw, gh, 2)
    expect(p.y).toBeGreaterThan(50)
    expect(p.x).toBe(50)
  })

  it('宽高比一致时无需裁剪，返回居中', () => {
    const gw = 60
    const gh = 30
    expect(focusOffset(synth(gw, gh, { x0: 40, x1: 58, y0: 2, y1: 28 }), gw, gh, 2)).toEqual(CENTER)
  })

  it('矩阵过小 / 比例非法时退回居中（不抛错）', () => {
    expect(focusOffset(new Float32Array(4), 2, 2, 1)).toEqual(CENTER)
    expect(focusOffset(new Float32Array(9), 3, 3, 0)).toEqual(CENTER)
    expect(focusOffset(new Float32Array(9), 3, 3, -1)).toEqual(CENTER)
  })

  it('纯色图（无边缘、无方差）不产生越界百分比', () => {
    const gw = 64
    const gh = 32
    const flat = new Float32Array(gw * gh)
    flat.fill(0.42)
    const p = focusOffset(flat, gw, gh, 1)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThanOrEqual(100)
    expect(p.y).toBe(50)
  })
})
