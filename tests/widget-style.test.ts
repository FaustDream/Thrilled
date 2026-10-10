/**
 * 实例样式与图标格溢出单测
 *
 * 覆盖：
 * - normStyle：白名单与限幅（比例 0.6–1.6 / 圆角 0–32 / 颜色 #rrggbb）
 * - withoutStyle / styleSliceOf / withoutStyleDefault：预设套用前的清空、复制取片、默认样式移除
 * - STYLE_PRESETS：紧凑 / 标准（清空）/ 宽松 三档
 * - normalizeSettings 对 settings.styleDefaults 的归一化（未知类型与空样式丢弃）
 * - groupOverflows：图标格在「格子下限 16px」撑破可用框时的判定
 */
import { describe, expect, it } from 'vitest'
import {
  STYLE_KEYS, STYLE_PRESETS, isBlankStyle, normStyle, styleSliceOf, withoutStyle, withoutStyleDefault,
} from '../src/shared/widget-style'
import { normalizeSettings } from '../src/shared/guards'
import { CELL, INSET, groupGrid, groupOverflows } from '../src/shared/grid'

describe('normStyle（样式项白名单与限幅）', () => {
  it('比例限幅到 0.6–1.6，圆角限幅到 0–32 并取整', () => {
    expect(normStyle({ fontScale: 2.5, iconScale: 0.1, radius: 99 }))
      .toEqual({ fontScale: 1.6, iconScale: 0.6, radius: 32 })
    expect(normStyle({ radius: 12.6 })).toEqual({ radius: 13 })
  })

  it('非法值丢弃：非数字比例、坏颜色、非样式键', () => {
    expect(normStyle({ fontScale: '1.5', textColor: '#fff', accent: '#123456' })).toEqual({})
    expect(normStyle({ textColor: '#A1B2C3' })).toEqual({ textColor: '#A1B2C3' })
    expect(normStyle(null)).toEqual({})
  })
})

describe('预设与样式取片', () => {
  it('三档预设：紧凑 / 标准（清空样式项）/ 宽松', () => {
    expect(STYLE_PRESETS.map(([k]) => k)).toEqual(['紧凑', '标准', '宽松'])
    const std = STYLE_PRESETS[1]?.[1] ?? {}
    expect(isBlankStyle(std)).toBe(true)
    expect(STYLE_PRESETS[2]?.[1].fontScale).toBe(1.15)
  })

  it('withoutStyle 只去掉四个样式键，其余配置原样保留', () => {
    expect(withoutStyle({ label: '时钟', source: '看点', fontScale: 1.2, radius: 8 }))
      .toEqual({ label: '时钟', source: '看点' })
    expect(STYLE_KEYS).toEqual(['fontScale', 'iconScale', 'radius', 'textColor'])
  })

  it('styleSliceOf 从实例配置里挑出样式项（复制到同类 / 设为默认用）', () => {
    expect(styleSliceOf({ label: 'x', fontScale: 1.3, textColor: '#FF0000' }))
      .toEqual({ fontScale: 1.3, textColor: '#FF0000' })
  })

  it('withoutStyleDefault 不改原对象，只去掉指定类型', () => {
    const map = { clock: { fontScale: 1.2 }, news: { radius: 10 } }
    expect(withoutStyleDefault(map, 'clock')).toEqual({ news: { radius: 10 } })
    expect(map.clock).toEqual({ fontScale: 1.2 })
  })
})

describe('设置归一化：按类型默认样式', () => {
  it('未知组件类型与空样式丢弃，合法值限幅保留', () => {
    const s = normalizeSettings({
      styleDefaults: { clock: { fontScale: 9 }, nope: { radius: 4 }, news: {}, cal: { textColor: '#00FF00' } },
    })
    expect(s.styleDefaults).toEqual({ clock: { fontScale: 1.6 }, cal: { textColor: '#00FF00' } })
  })

  it('缺省时为空表（出厂无任何默认样式）', () => {
    expect(normalizeSettings({}).styleDefaults).toEqual({})
  })
})

describe('图标格溢出（groupOverflows）', () => {
  /** 与 widgets.tsx 一致的可用框：去掉卡片内缩、容器内距与标签条带 */
  const box = (w: number, h: number): { w: number; h: number } =>
    ({ w: w * CELL - 2 * INSET - 30, h: h * CELL - 2 * INSET - 30 - 22 })

  it('装得下时不判定溢出（8×4 放 24 个）', () => {
    const b = box(8, 4)
    expect(groupOverflows(24, b.w, b.h, 10)).toBe(false)
  })

  it('格子数多而卡片矮：格子被 16px 下限撑破可用框 → 判定溢出（容器改滚动）', () => {
    const b = box(4, 2)
    expect(groupGrid(24, b.w, b.h, 10).cell).toBe(16)
    expect(groupOverflows(24, b.w, b.h, 10)).toBe(true)
    expect(groupOverflows(4, b.w, b.h, 10)).toBe(false)
  })
})
