/**
 * 倒计时模式与日程单测
 * 覆盖：多模式归一化（含旧单模式兼容）、读数计算、轮播取模、日程归一化与未来排序
 */
import { describe, expect, it } from 'vitest'
import { normModes, readoutOf, rotateMode } from '../src/core/countdown'
import { allDoneOn, eventsOn, isDateStr, normScheduleEvents, upcomingEvents } from '../src/core/schedule'
import { lunarLabel, nextLunarDate, normCountdownEntries, userRows } from '../src/core/festivals'
import { BIRTHDAY_ENTRIES, seedBirthdays } from '../src/app/layout'
import { solarToLunar } from '../src/core/lunar'
import type { GridItem } from '../src/shared/types'

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const NOW = new Date(2026, 9, 20, 12, 0, 0)

describe('倒计时模式归一化（多模式同时启用）', () => {
  it('多选数组按固定顺序排列、去重', () => {
    expect(normModes(['纪念日', '下班倒计时'])).toEqual(['下班倒计时', '纪念日'])
    expect(normModes(['倒数日', '倒数日'])).toEqual(['倒数日'])
    expect(normModes(['下班倒计时', '倒数日', '纪念日'])).toEqual(['下班倒计时', '倒数日', '纪念日'])
  })

  it('旧数据只有单选 mode 时转成单元素数组', () => {
    expect(normModes(undefined, '纪念日')).toEqual(['纪念日'])
    expect(normModes([], '倒数日')).toEqual(['倒数日'])
  })

  it('空值 / 非法值回退到「下班倒计时」', () => {
    expect(normModes(undefined)).toEqual(['下班倒计时'])
    expect(normModes(['乱写'])).toEqual(['下班倒计时'])
    expect(normModes('不是数组')).toEqual(['下班倒计时'])
  })
})

describe('倒计时读数', () => {
  it('下班倒计时给出 HH:MM:SS（到点归零）', () => {
    expect(readoutOf('下班倒计时', { at: '18:00' }, NOW, str)).toMatchObject({ value: '06:00:00', timer: true })
    const late = new Date(2026, 9, 20, 19, 0, 0)
    expect(readoutOf('下班倒计时', { at: '18:00' }, late, str).value).toBe('00:00:00')
  })

  it('倒数日给出剩余天数，已过标「天前」', () => {
    expect(readoutOf('倒数日', { date: '2026-10-30' }, NOW, str)).toMatchObject({ value: '10', unit: '天', timer: false })
    expect(readoutOf('倒数日', { date: '2026-10-10' }, NOW, str)).toMatchObject({ value: '10', unit: '天前' })
  })

  it('纪念日按单位换算，并用 annDate 而非 date', () => {
    expect(readoutOf('纪念日', { annDate: '2026-09-20', unitLabel: '天' }, NOW, str)).toMatchObject({ value: '30', unit: '天' })
    expect(readoutOf('纪念日', { annDate: '2026-09-20', unitLabel: '周' }, NOW, str).value).toBe('4')
    /* 旧数据没有 annDate 时回退到 date */
    expect(readoutOf('纪念日', { date: '2026-09-20', unitLabel: '天' }, NOW, str).value).toBe('30')
  })
})

describe('轮播取模', () => {
  it('按序循环，越界与负数都能安全落位', () => {
    const modes = ['下班倒计时', '倒数日', '纪念日'] as const
    expect(rotateMode(modes, 0)).toBe('下班倒计时')
    expect(rotateMode(modes, 3)).toBe('下班倒计时')
    expect(rotateMode(modes, 4)).toBe('倒数日')
    expect(rotateMode(modes, -1)).toBe('纪念日')
    expect(rotateMode([], 5)).toBe('下班倒计时')
  })
})

describe('日程', () => {
  it('日期串校验', () => {
    expect(isDateStr('2026-10-20')).toBe(true)
    expect(isDateStr('2026-13-01')).toBe(false)
    expect(isDateStr('2026-02-30')).toBe(false)
    expect(isDateStr('20261020')).toBe(false)
  })

  it('归一化丢弃坏条目', () => {
    const out = normScheduleEvents([
      { date: '2026-10-20', text: '开会', done: false },
      { date: '坏日期', text: '丢掉' },
      { date: '2026-10-21', text: '   ' },
      'not-an-object',
    ])
    expect(out).toEqual([{ date: '2026-10-20', text: '开会', done: false }])
  })

  it('按日期取当日日程', () => {
    const events = normScheduleEvents([
      { date: '2026-10-20', text: 'A' },
      { date: '2026-10-21', text: 'B' },
      { date: '2026-10-20', text: 'C' },
    ])
    expect(eventsOn(events, '2026-10-20').map((e) => e.text)).toEqual(['A', 'C'])
  })

  it('未来日程排除已完成与已过去，按日期升序', () => {
    const events = normScheduleEvents([
      { date: '2026-10-25', text: '晚' },
      { date: '2026-10-21', text: '早' },
      { date: '2026-10-19', text: '已过' },
      { date: '2026-10-22', text: '已完成', done: true },
    ])
    expect(upcomingEvents(events, NOW).map((e) => e.text)).toEqual(['早', '晚'])
    expect(upcomingEvents(events, NOW, 1).map((e) => e.text)).toEqual(['早'])
  })

  it('当日全部完成才算完成', () => {
    const events = normScheduleEvents([
      { date: '2026-10-20', text: 'A', done: true },
      { date: '2026-10-20', text: 'B', done: false },
    ])
    expect(allDoneOn(events, '2026-10-20')).toBe(false)
    expect(allDoneOn(events, '2026-10-21')).toBe(false)
    expect(allDoneOn(normScheduleEvents([{ date: '2026-10-20', text: 'A', done: true }]), '2026-10-20')).toBe(true)
  })
})

describe('农历纪念日（每年按农历月日循环）', () => {
  const now = new Date(2026, 9, 20) /* 2026-10-20：六月廿九已过 */

  it('农历条目按农历重算下一次日期，已过顺延到明年', () => {
    const date = nextLunarDate({ month: 6, day: 29 }, now)
    expect(date).not.toBeNull()
    const [y, m, d] = (date ?? '').split('-').map(Number)
    expect(solarToLunar(y ?? 0, m ?? 1, d ?? 1)).toMatchObject({ month: 6, day: 29 })
    expect(y).toBe(2027)
  })

  it('归一化保留 lunar，并为旧式阳历条目保留 date', () => {
    const out = normCountdownEntries([
      { name: '阿玲的生日', lunar: { month: 6, day: 29 } },
      { name: '普通倒数日', date: '2027-01-01' },
      { name: '坏月', lunar: { month: 13, day: 1 } },
    ], now)
    expect(out).toHaveLength(2)
    expect(out[0]?.lunar).toEqual({ month: 6, day: 29 })
    expect(out[0]?.date).toBe('2027-08-01')
    expect(out[1]?.lunar).toBeUndefined()
  })

  it('行的日期逐年重算，并带上农历可读名', () => {
    const entries = normCountdownEntries([{ name: '生日', lunar: { month: 6, day: 26 } }], now)
    const rows = userRows(entries, now)
    expect(rows[0]?.lunarLabel).toBe('农历六月廿六')
    expect(rows[0]?.date).toBe('2027-07-29')
    expect(rows[0]?.days).toBeGreaterThan(0)
  })

  it('lunarLabel 带闰月前缀', () => {
    expect(lunarLabel({ month: 2, day: 1, leap: true })).toBe('农历闰二月初一')
  })
})

describe('seedBirthdays：给已有倒计时卡补种两条农历生日', () => {
  const card = (id: string, config: Record<string, unknown>): GridItem =>
    ({ id, c: 0, r: 0, w: 4, h: 4, t: 'countdown', config })
  const now = new Date(2026, 9, 20)

  it('两条预置生日按农历月日写入，且不重复补种', () => {
    const pages = [[card('a', {})]]
    const out = seedBirthdays(pages, now)
    expect(out).not.toBeNull()
    const entries = normCountdownEntries(out?.[0]?.[0]?.config['entries'], now)
    expect(entries.map((e) => e.name)).toEqual(BIRTHDAY_ENTRIES.map((b) => b.name))
    expect(entries[0]?.lunar).toEqual({ month: 6, day: 29 })
    expect(entries[1]?.lunar).toEqual({ month: 6, day: 26 })
    /* 再跑一次：已有同名条目，不再追加 */
    expect(seedBirthdays(out ?? [], now)).toBeNull()
  })

  it('用户已有条目原样保留、顺序不变，只补缺的两条', () => {
    const existing = [{ name: '我的生日', lunar: { month: 6, day: 26 } }, { name: '项目上线', date: '2027-03-01' }]
    const out = seedBirthdays([[card('a', { entries: existing })]], now)
    const entries = normCountdownEntries(out?.[0]?.[0]?.config['entries'], now)
    expect(entries.map((e) => e.name)).toEqual(['我的生日', '项目上线', '阿玲的生日'])
  })

  it('没有倒计时卡 / 空布局时不新建卡片', () => {
    expect(seedBirthdays([[]], now)).toBeNull()
    expect(seedBirthdays([[{ id: 'x', c: 0, r: 0, w: 4, h: 2, t: 'clock', config: {} }]], now)).toBeNull()
  })
})
