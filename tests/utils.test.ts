/**
 * 纯逻辑工具单测：日期差（倒数日组件「距离目标日期还有几天」）+ 搜索历史入栈（条数上限）
 * + 月历网格（日历详情弹窗）+ 待办条目归一化（待办详情弹窗）
 */
import { describe, expect, it } from 'vitest'
import { addDays, daysUntil, hostOf, isoWeekOf, monthCells, normalizeSiteUrl, normTodoItems, pushHistory, relTimeText, startOfWeek } from '../src/core/utils'

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

describe('relTimeText：天气详情的「x 分钟前更新」', () => {
  const base = new Date(2026, 9, 10, 12, 0, 0)

  it('不足一分钟（含未来时间戳与非法值）显示刚刚', () => {
    expect(relTimeText(base.getTime() - 30_000, base)).toBe('刚刚')
    expect(relTimeText(base.getTime() + 60_000, base)).toBe('刚刚')
    expect(relTimeText(Number.NaN, base)).toBe('刚刚')
  })

  it('分钟 / 小时 / 天按整数档递进', () => {
    expect(relTimeText(base.getTime() - 5 * 60_000, base)).toBe('5 分钟前')
    expect(relTimeText(base.getTime() - 59 * 60_000, base)).toBe('59 分钟前')
    expect(relTimeText(base.getTime() - 90 * 60_000, base)).toBe('1 小时前')
    expect(relTimeText(base.getTime() - 26 * 3600_000, base)).toBe('1 天前')
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

describe('monthCells：月历网格（日历详情弹窗）', () => {
  it('始终 6 行 × 7 列、周日起头', () => {
    const rows = monthCells(2026, 9) // 2026-10
    expect(rows).toHaveLength(6)
    rows.forEach((r) => expect(r).toHaveLength(7))
    // 2026-10-01 是周四 → 首行前 4 格为上个月（周日起头）
    expect(rows[0]?.[0]?.inMonth).toBe(false)
    expect(rows[0]?.[4]?.inMonth).toBe(true)
    expect(rows[0]?.[4]?.day).toBe(1)
  })

  it('本月格子连续且数量等于当月天数，前后月补齐 42 格', () => {
    const rows = monthCells(2026, 9)
    const days = rows.flat().filter((c) => c.inMonth)
    expect(days).toHaveLength(31)
    expect(days[0]?.day).toBe(1)
    expect(days[30]?.day).toBe(31)
    expect(rows.flat()).toHaveLength(42)
  })

  it('补齐格给出真实日期，不出现 0 / 负数（上月末尾 27–30）', () => {
    const cells = monthCells(2026, 9).flat() // 2026-10-01 周四
    expect(cells.slice(0, 4).map((c) => c.day)).toEqual([27, 28, 29, 30])
    expect(cells.slice(0, 4).every((c) => c.month === 9 && c.year === 2026)).toBe(true)
    expect(cells.every((c) => c.day >= 1 && c.day <= 31)).toBe(true)
    const tail = cells.slice(-3)
    expect(tail.every((c) => c.day >= 1 && c.month === 11)).toBe(true)
  })

  it('跨年补齐：1 月前置格属上一年 12 月，12 月尾格属下一年 1 月', () => {
    const jan = monthCells(2026, 0).flat()
    expect(jan[0]?.year).toBe(2025)
    expect(jan[0]?.month).toBe(12)
    const dec = monthCells(2026, 11).flat()
    expect(dec[41]?.year).toBe(2027)
    expect(dec[41]?.month).toBe(1)
  })
})

describe('normTodoItems：待办条目归一化（待办详情弹窗）', () => {
  it('只保留含非空 txt 的对象，done 严格布尔化', () => {
    expect(normTodoItems([{ txt: ' 买牛奶 ', done: true }, { txt: '写周报' }]))
      .toEqual([{ txt: '买牛奶', done: true }, { txt: '写周报', done: false }])
  })

  it('非数组 / 非对象 / 空白 txt 一律丢弃', () => {
    expect(normTodoItems('x')).toEqual([])
    expect(normTodoItems(null)).toEqual([])
    expect(normTodoItems([1, '文本', null, { txt: '  ' }, { done: true }])).toEqual([])
  })

  it('上限 50 条：脏数据再长也不会撑爆卡片配置', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ txt: `t${i}`, done: false }))
    expect(normTodoItems(many)).toHaveLength(50)
  })
})

describe('normalizeSiteUrl：网址规范化（右键新建站点 / 自定义表单共用）', () => {
  it('裸域名补 https://', () => {
    expect(normalizeSiteUrl('baidu.com')).toBe('https://baidu.com/')
    expect(normalizeSiteUrl('  example.com/a?b=1  ')).toBe('https://example.com/a?b=1')
  })

  it('已带 http(s) 协议的原样保留', () => {
    expect(normalizeSiteUrl('https://a.com/x?y=1')).toBe('https://a.com/x?y=1')
    expect(normalizeSiteUrl('http://a.com')).toBe('http://a.com/')
  })

  it('空串 / 非 http(s) 协议 / 非法输入一律 null', () => {
    expect(normalizeSiteUrl('   ')).toBeNull()
    expect(normalizeSiteUrl('ftp://a.com')).toBeNull()
    expect(normalizeSiteUrl('not a url')).toBeNull()
  })
})

describe('hostOf：展示用主机名（图标提示气泡第二行 / 书签列表小字）', () => {
  it('去掉协议与路径，保留端口', () => {
    expect(hostOf('https://a.com/x?y=1')).toBe('a.com')
    expect(hostOf('http://a.com:8080/p')).toBe('a.com:8080')
  })

  it('裸域名与无法解析的输入原样返回', () => {
    expect(hostOf('baidu.com')).toBe('baidu.com')
    expect(hostOf('不是网址')).toBe('不是网址')
    expect(hostOf('')).toBe('')
  })
})

describe('addDays / startOfWeek：日历详情周视图的日期定位', () => {
  it('addDays 平移跨月与跨年，且不修改原日期', () => {
    const d = new Date(2026, 9, 31)
    const next = addDays(d, 1)
    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(10)
    expect(next.getDate()).toBe(1)
    expect(d.getDate()).toBe(31)
    expect(addDays(d, -31).getDate()).toBe(30)
  })

  it('startOfWeek 落到所在周的周日（与月历列序一致），时间部分清零', () => {
    /* 2026-10-10 是周六 → 本周周日是 10-04；2026-10-11 是周日 → 原地 */
    expect(startOfWeek(new Date(2026, 9, 10)).getDate()).toBe(4)
    expect(startOfWeek(new Date(2026, 9, 11)).getDate()).toBe(11)
    expect(startOfWeek(new Date(2026, 9, 10, 15, 30)).getHours()).toBe(0)
  })
})

describe('isoWeekOf：日历详情的「第 N 周」标注', () => {
  it('常规日期落在正确的 ISO 周号', () => {
    /* 2026-01-01 是周四，属于 2026 年第 1 周 */
    expect(isoWeekOf(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 })
    /* 2026-10-10（周六）属于第 41 周 */
    expect(isoWeekOf(new Date(2026, 9, 10)).week).toBe(41)
  })

  it('年末日期可以属于下一年的第 1 周', () => {
    /* 2029-12-31（周一）属于 2030 年第 1 周 */
    expect(isoWeekOf(new Date(2029, 11, 31))).toEqual({ year: 2030, week: 1 })
  })
})
