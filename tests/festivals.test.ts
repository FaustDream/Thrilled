/**
 * 节日倒数单测：阳历固定节日 / 农历对照表（2026–2030）/ 归一化 / 合并排序
 */
import { describe, expect, it } from 'vitest'
import {
  festivalRows, normCountdownEntries, upcomingRows, userRows,
} from '../src/core/festivals'

const NOW = new Date(2026, 9, 10) // 2026-10-10

describe('festivalRows：节日自动取下一次发生', () => {
  it('已过的节日顺延到下一年（中秋 2026-09-25 已过 → 2027-09-15）', () => {
    const rows = festivalRows(NOW)
    const moon = rows.find((r) => r.name === '中秋')
    expect(moon?.date).toBe('2027-09-15')
    expect(moon?.days).toBe(340)
  })

  it('年内未到的节日取当年（元旦 2027-01-01 → 83 天）', () => {
    const rows = festivalRows(NOW)
    expect(rows.find((r) => r.name === '元旦')?.days).toBe(83)
    expect(rows.find((r) => r.name === '国庆')?.days).toBe(356) // 2027-10-01
  })

  it('节日行自带进度条：以上一次发生为起点', () => {
    const rows = festivalRows(NOW)
    const moon = rows.find((r) => r.name === '中秋')
    // 2026-09-25 → 2027-09-15 共 355 天，已过 15 天
    expect(moon?.progress).toBeCloseTo(15 / 355, 5)
  })

  it('农历对照表外的年份隐藏该行，阳历节日永久有效', () => {
    const far = festivalRows(new Date(2035, 5, 1))
    expect(far.find((r) => r.name === '中秋')).toBeUndefined()
    expect(far.find((r) => r.name === '元旦')?.days).toBe(214) // 2036-01-01
  })
})

describe('normCountdownEntries：自定义倒数日归一化', () => {
  it('保留合法条目（名称 / 日期必需，备注与创建时间可选）', () => {
    expect(normCountdownEntries([
      { name: '项目上线', date: '2027-03-01', note: ' v2 ', created: 1790000000000 },
      { name: ' 旅行 ', date: '2027/05/01' },
    ])).toEqual([
      { name: '项目上线', date: '2027-03-01', note: 'v2', created: 1790000000000 },
      { name: '旅行', date: '2027/05/01' },
    ])
  })

  it('丢弃非法与非对象项；上限 20 条', () => {
    expect(normCountdownItems_bad()).toEqual([])
    expect(normCountdownEntries(Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, date: '2027-01-01' }))).length).toBe(20)
  })
})

function normCountdownItems_bad(): unknown[] {
  return normCountdownEntries(['文本', null, { date: '2027-01-01' }, { name: '无日期' }, { name: '坏日期', date: '明年' }])
}

describe('upcomingRows：合并与排序', () => {
  it('节日与自定义合并后按剩余天数升序', () => {
    const rows = upcomingRows(
      [{ name: '项目上线', date: '2026-10-20', created: new Date(2026, 9, 1).getTime() }],
      true,
      NOW,
    )
    expect(rows.map((r) => r.name)).toEqual(['项目上线', '元旦', '春节', '清明', '劳动节', '端午', '中秋', '国庆'])
    expect(rows[0]?.progress).toBeCloseTo(9 / 19, 5) // 创建 → 目标 19 天已过 9 天
  })

  it('关闭节日开关后只剩自定义条目', () => {
    const rows = upcomingRows([{ name: '生日', date: '2026-11-01' }], false, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('生日')
    expect(rows[0]?.progress).toBeNull() // 未提供 created → 无进度条
  })

  it('userRows：已过的自定义日期显示为负天数（渲染层转「天前」）', () => {
    const rows = userRows([{ name: '旧事', date: '2026-10-01' }], NOW)
    expect(rows[0]?.days).toBe(-9)
  })
})
