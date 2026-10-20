/**
 * 农历 / 节气 / 干支 / 宜忌 / 节日单测
 * 覆盖：已知农历日期对照、闰月、节气日、干支循环、宜忌非空、节日识别
 */
import { describe, expect, it } from 'vitest'
import {
  almanacOf, dayGanZhi, festivalsOf, lunarShort, lunarToSolar, monthGanZhi, nextLunarOccurrence, solarTermDay, solarTermOf, solarToLunar, termMonthZhi,
} from '../src/core/lunar'

describe('农历换算（阳历 → 农历）', () => {
  it('已知春节 / 中秋 / 端午落在正确的农历日', () => {
    expect(solarToLunar(2026, 2, 17)).toMatchObject({ month: 1, day: 1, leap: false, monthCn: '正月', dayCn: '初一' })
    expect(solarToLunar(2024, 2, 10)).toMatchObject({ month: 1, day: 1 })
    expect(solarToLunar(2025, 1, 29)).toMatchObject({ month: 1, day: 1 })
    expect(solarToLunar(2026, 9, 25)).toMatchObject({ month: 8, day: 15 })
    expect(solarToLunar(2026, 6, 19)).toMatchObject({ month: 5, day: 5 })
  })

  it('闰月识别正确（2023 闰二月 / 2020 闰四月）', () => {
    expect(solarToLunar(2023, 3, 22)).toMatchObject({ month: 2, day: 1, leap: true, monthCn: '闰二月' })
    expect(solarToLunar(2020, 5, 23)).toMatchObject({ month: 4, day: 1, leap: true, monthCn: '闰四月' })
  })

  it('干支年与生肖随农历年变化（元旦仍属上一年）', () => {
    expect(solarToLunar(2026, 1, 1)).toMatchObject({ ganZhiYear: '乙巳', zodiac: '蛇' })
    expect(solarToLunar(2026, 2, 17)).toMatchObject({ ganZhiYear: '丙午', zodiac: '马' })
  })

  it('农历日的中文名：初一显示月份，其余显示日', () => {
    expect(lunarShort(solarToLunar(2026, 2, 17))).toBe('正月')
    expect(lunarShort(solarToLunar(2026, 9, 25))).toBe('十五')
  })

  it('全年每一天都能算出合法农历（不抛错、月日都在范围内）', () => {
    for (let m = 1; m <= 12; m += 1) {
      const days = new Date(2026, m, 0).getDate()
      for (let d = 1; d <= days; d += 1) {
        const l = solarToLunar(2026, m, d)
        expect(l.month).toBeGreaterThanOrEqual(1)
        expect(l.month).toBeLessThanOrEqual(12)
        expect(l.day).toBeGreaterThanOrEqual(1)
        expect(l.day).toBeLessThanOrEqual(30)
      }
    }
  })
})

describe('节气', () => {
  it('2026 年主要节气日期正确', () => {
    expect(solarTermOf(2026, 2, 4)).toBe('立春')
    expect(solarTermOf(2026, 3, 5)).toBe('惊蛰')
    expect(solarTermOf(2026, 4, 5)).toBe('清明')
    expect(solarTermOf(2026, 6, 21)).toBe('夏至')
    expect(solarTermOf(2026, 9, 23)).toBe('秋分')
    expect(solarTermOf(2026, 12, 22)).toBe('冬至')
  })

  it('每个节气日都落在该月的合法范围内', () => {
    for (let n = 0; n < 24; n += 1) {
      const day = solarTermDay(2026, n)
      expect(day).toBeGreaterThanOrEqual(1)
      expect(day).toBeLessThanOrEqual(31)
    }
  })
})

describe('干支与宜忌', () => {
  it('日干支按 60 日一轮循环', () => {
    const a = dayGanZhi(2026, 10, 20)
    expect(a).toMatch(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/)
    /* 60 天后回到同一干支 */
    expect(dayGanZhi(2026, 12, 19)).toBe(a)
  })

  it('月支按节气月切换（立春后进入寅月）', () => {
    expect(termMonthZhi(2026, 2, 3)).toBe(1)  /* 丑月 */
    expect(termMonthZhi(2026, 2, 4)).toBe(2)  /* 立春当天进寅月 */
  })

  it('宜忌齐备且值日在十二值日内', () => {
    const a = almanacOf(2026, 10, 20)
    expect('建除满平定执破危成收开闭').toContain(a.officer)
    expect(a.good.length).toBeGreaterThan(0)
    expect(a.bad.length).toBeGreaterThan(0)
    expect(a.ganZhiDay).toHaveLength(2)
    expect(a.ganZhiMonth).toHaveLength(2)
  })

  it('月干支以农历年干起五虎遁（2026 丙午年，寅月为庚寅）', () => {
    expect(monthGanZhi(2026, 2026, 2, 4)).toBe('庚寅')
  })
})

describe('节日', () => {
  it('阳历与农历节日都能识别', () => {
    expect(festivalsOf(2026, 1, 1)).toContain('元旦')
    expect(festivalsOf(2026, 2, 17)).toContain('春节')
    expect(festivalsOf(2026, 9, 25)).toContain('中秋节')
    expect(festivalsOf(2026, 10, 1)).toContain('国庆节')
  })

  it('除夕落在农历腊月最后一天', () => {
    const last = solarToLunar(2027, 2, 5)
    expect(last.month).toBe(12)
    expect(festivalsOf(2027, 2, 5)).toContain('除夕')
  })

  it('节气也会出现在节日列表里', () => {
    expect(festivalsOf(2026, 4, 5)).toContain('清明')
  })

  it('普通日子没有节日', () => {
    expect(festivalsOf(2026, 10, 20)).toEqual([])
  })
})

describe('农历与阳历互转（农历生日 / 纪念日）', () => {
  it('农历 → 阳历与反向验算一致', () => {
    const d = lunarToSolar(2026, 6, 29)
    expect(d).not.toBeNull()
    expect(solarToLunar(d?.getFullYear() ?? 0, (d?.getMonth() ?? 0) + 1, d?.getDate() ?? 0))
      .toMatchObject({ month: 6, day: 29 })
    /* 已知：2026 年农历六月廿九 = 公历 8 月 11 日 */
    expect([d?.getFullYear(), (d?.getMonth() ?? 0) + 1, d?.getDate()]).toEqual([2026, 8, 11])
  })

  it('正月初一 = 春节（2026-02-17）', () => {
    const d = lunarToSolar(2026, 1, 1)
    expect([d?.getFullYear(), (d?.getMonth() ?? 0) + 1, d?.getDate()]).toEqual([2026, 2, 17])
  })

  it('非法月 / 日返回 null', () => {
    expect(lunarToSolar(2026, 0, 1)).toBeNull()
    expect(lunarToSolar(2026, 13, 1)).toBeNull()
    expect(lunarToSolar(2026, 1, 31)).toBeNull()
    expect(lunarToSolar(1800, 1, 1)).toBeNull()
  })

  it('下次农历发生：已过则顺延到明年同一天', () => {
    const now = new Date(2026, 9, 20) /* 2026-10-20，六月廿九已过 */
    const next = nextLunarOccurrence(6, 29, now)
    expect(next?.getFullYear()).toBe(2027)
    expect(solarToLunar(next?.getFullYear() ?? 0, (next?.getMonth() ?? 0) + 1, next?.getDate() ?? 0))
      .toMatchObject({ month: 6, day: 29 })
    /* 还没到的日子就用今年那一次（农历十月廿九 → 公历 11 月底） */
    const soon = nextLunarOccurrence(10, 29, now)
    expect(soon?.getFullYear()).toBe(2026)
    expect(solarToLunar(soon?.getFullYear() ?? 0, (soon?.getMonth() ?? 0) + 1, soon?.getDate() ?? 0))
      .toMatchObject({ month: 10, day: 29 })
  })
})
