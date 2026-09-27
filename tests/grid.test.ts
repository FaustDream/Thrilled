/**
 * 页面垂直居中位移单测（verticalOffset）
 * 覆盖：满页趋近 0 / 稀疏页居中 / 空页 0 / 中段内容不移动
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGES } from '../src/app/layout'
import { verticalOffset } from '../src/shared/grid'

describe('verticalOffset', () => {
  it('满页（占满 10 行）位移趋近 0', () => {
    expect(verticalOffset(DEFAULT_PAGES.standard[0] ?? [])).toBeLessThanOrEqual(6)
  })

  it('稀疏页（只占顶部两行）位移为正且居中', () => {
    const items = [
      { r: 0, h: 2 },
      { r: 0, h: 2 },
    ]
    const ty = verticalOffset(items)
    // 内容带高 2 行，可用带 673px → 位移应把内容推到垂直中点附近（约 240px）
    expect(ty).toBeGreaterThan(260)
    expect(ty).toBeLessThan(330)
  })

  it('空页返回 0', () => {
    expect(verticalOffset([])).toBe(0)
  })

  it('内容已在中段时位移接近 0（不推挤）', () => {
    expect(Math.abs(verticalOffset([{ r: 4, h: 2 }]))).toBeLessThanOrEqual(6)
  })
})
