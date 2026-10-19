/**
 * 全局效果（玻璃度 / 模糊度）写入规则单测
 * 覆盖：全局值一次写入六个玻璃底色项 / 非玻璃项不受影响 / 各控件仍可单独覆盖
 */
import { describe, expect, it } from 'vitest'
import { BLUR_KEYS, GLASS_KEYS, withGlobalBlur, withGlobalGlass } from '../src/shared/visual'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'

describe('withGlobalGlass', () => {
  it('一次写入六个玻璃底色项，其余项保持不变', () => {
    const out = withGlobalGlass(DEFAULT_SETTINGS.glass, 0.2)
    for (const k of GLASS_KEYS) expect(out[k]).toBe(0.2)
    expect(out.glyph).toBe(DEFAULT_SETTINGS.glass.glyph)
    expect(out.clock).toBe(DEFAULT_SETTINGS.glass.clock)
    expect(out.line).toBe(DEFAULT_SETTINGS.glass.line)
    expect(out.hover).toBe(DEFAULT_SETTINGS.glass.hover)
  })

  it('不修改原对象', () => {
    const src = { ...DEFAULT_SETTINGS.glass }
    withGlobalGlass(src, 0.9)
    expect(src).toEqual(DEFAULT_SETTINGS.glass)
  })
})

describe('withGlobalBlur', () => {
  it('一次写入六项模糊半径', () => {
    const out = withGlobalBlur(DEFAULT_SETTINGS.blur, 4)
    for (const k of BLUR_KEYS) expect(out[k]).toBe(4)
  })

  it('0px 即整体关闭毛玻璃', () => {
    const out = withGlobalBlur(DEFAULT_SETTINGS.blur, 0)
    expect(Object.values(out).every((v) => v === 0)).toBe(true)
  })
})
