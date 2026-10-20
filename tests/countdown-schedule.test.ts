/**
 * 倒计时模式与日程单测
 * 覆盖：多模式归一化（含旧单模式兼容）、读数计算、轮播取模、日程归一化与未来排序
 */
import { describe, expect, it } from 'vitest'
import { normModes, readoutOf, rotateMode } from '../src/core/countdown'
import { allDoneOn, eventsOn, isDateStr, normScheduleEvents, upcomingEvents } from '../src/core/schedule'

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
