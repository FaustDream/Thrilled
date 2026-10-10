/**
 * 纯逻辑工具单测：日期差（倒数日组件「距离目标日期还有几天」）+ 搜索历史入栈（条数上限）
 */
import { describe, expect, it } from 'vitest'
import { daysUntil, pushHistory } from '../src/core/utils'

const NOW = new Date(2026, 9, 10) // 2026-10-10

describe('daysUntil：距离目标日期还有几天', () => {
  it('今天为 0、明天为 1、已过为负', () => {
    expect(daysUntil('2026-10-10', NOW)).toBe(0)
    expect(daysUntil('2026-10-11', NOW)).toBe(1)
    expect(daysUntil('2026-10-09', NOW)).toBe(-1)
  })

  it('跨月与跨年按自然日计算', () => {
    expect(daysUntil('2026-11-01', NOW)).toBe(22)
    expect(daysUntil('2027-01-01', NOW)).toBe(83)
  })

  it('日期分隔符支持 - / . 且允许不补零', () => {
    expect(daysUntil('2026/10/11', NOW)).toBe(1)
    expect(daysUntil('2026.10.11', NOW)).toBe(1)
    expect(daysUntil('2026/11/1', NOW)).toBe(22)
    expect(daysUntil('  2026-11-01  ', NOW)).toBe(22)
  })

  it('非法或空日期返回 null（交给组件显示 --）', () => {
    expect(daysUntil('', NOW)).toBeNull()
    expect(daysUntil('下个月', NOW)).toBeNull()
    expect(daysUntil('2026-13-01', NOW)).toBeNull()
    expect(daysUntil('2026-02-30', NOW)).toBeNull()
  })
})

describe('pushHistory：搜索历史入栈与条数上限', () => {
  it('新词前置；重复词去重后提到最前', () => {
    expect(pushHistory(['b', 'a'], 'c', 8)).toEqual(['c', 'b', 'a'])
    expect(pushHistory(['b', 'a'], 'a', 8)).toEqual(['a', 'b'])
  })

  it('按上限截断（设置里的「历史保留条数」）', () => {
    expect(pushHistory(['a', 'b', 'c', 'd'], 'e', 8)).toEqual(['e', 'a', 'b', 'c', 'd'])
    expect(pushHistory(['a', 'b', 'c'], 'd', 4)).toEqual(['d', 'a', 'b', 'c'])
    expect(pushHistory(['a', 'b', 'c', 'd'], 'e', 4)).toEqual(['e', 'a', 'b', 'c'])
  })

  it('上限被夹在 4–20，坏值回退出厂 8', () => {
    expect(pushHistory([], 'x', 0)).toEqual(['x'])
    expect(pushHistory(['a', 'b', 'c'], 'd', 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(pushHistory(Array.from({ length: 30 }, (_, i) => `h${i}`), 'x', 99).length).toBe(20)
    expect(pushHistory(['a'], 'b', Number.NaN)).toEqual(['b', 'a'])
  })
})
