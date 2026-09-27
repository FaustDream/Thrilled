/**
 * 内容模型与网格算法单测（v4）
 * 覆盖：出厂布局满足冻结的栅格规范 / 网格空位查找 / 重叠判定 / 导入文档归一化
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGES, normPages, uid } from '../src/app/layout'
import { COLS, ROWS, SIZES, findSlot, overlaps } from '../src/shared/grid'
import type { GridItem } from '../src/shared/types'

const PAGES = [
  { name: '标准第 1 页', items: DEFAULT_PAGES.standard[0] ?? [] },
  { name: '标准第 2 页', items: DEFAULT_PAGES.standard[1] ?? [] },
  { name: '隐私第 1 页', items: DEFAULT_PAGES.privacy[0] ?? [] },
]

describe('出厂布局（冻结规范：六档尺寸 / 24×10 网格 / 100% 填满）', () => {
  it('每张卡片都用合法的六档尺寸', () => {
    const legal = new Set(SIZES.map((s) => `${s.w}x${s.h}`))
    const bad = PAGES.flatMap((p) => p.items).filter((it) => !legal.has(`${it.w}x${it.h}`))
    expect(bad).toEqual([])
  })

  it('没有越界卡片', () => {
    const out = PAGES.flatMap((p) => p.items).filter(
      (it) => it.c < 0 || it.r < 0 || it.c + it.w > COLS || it.r + it.h > ROWS,
    )
    expect(out).toEqual([])
  })

  it('没有重叠卡片', () => {
    const clashes = PAGES.flatMap((p) => {
      const found: string[] = []
      p.items.forEach((a, i) => p.items.slice(i + 1).forEach((b) => {
        if (overlaps(a, b)) found.push(`${a.id}/${b.id}`)
      }))
      return found
    })
    expect(clashes).toEqual([])
  })

  it('每页正好填满 240 格', () => {
    PAGES.forEach((p) => {
      const cells = p.items.reduce((sum, it) => sum + it.w * it.h, 0)
      expect(cells, p.name).toBe(COLS * ROWS)
    })
  })

  it('卡片 id 唯一', () => {
    const ids = PAGES.flatMap((p) => p.items).map((it) => it.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('网格算法', () => {
  const item = (c: number, r: number, w: number, h: number): GridItem => ({
    id: uid(), c, r, w, h, t: 'icon', config: {},
  })

  it('findSlot 在空页返回左上角', () => {
    expect(findSlot([], 2, 2)).toEqual({ c: 0, r: 0 })
  })

  it('findSlot 跳过被占用的位置', () => {
    expect(findSlot([item(0, 0, 4, 2)], 2, 2)).toEqual({ c: 4, r: 0 })
  })

  it('整页占满时 findSlot 返回 null', () => {
    const rows: GridItem[] = []
    for (let r = 0; r < ROWS; r += 2) for (let c = 0; c < COLS; c += 2) rows.push(item(c, r, 2, 2))
    expect(findSlot(rows, 2, 2)).toBeNull()
  })

  it('相邻边界不算重叠', () => {
    expect(overlaps(item(0, 0, 2, 2), item(2, 0, 2, 2))).toBe(false)
    expect(overlaps(item(0, 0, 2, 2), item(1, 1, 2, 2))).toBe(true)
  })
})

describe('布局导入归一化（normPages）', () => {
  it('扁平数组按单页处理，并夹取越界坐标、回填 id', () => {
    const pages = normPages([{ c: 99, r: 99, w: 4, h: 4, t: 'clock', config: { label: '导入的时钟' } }])
    expect(pages).toHaveLength(1)
    expect(pages[0]?.[0]).toMatchObject({ c: COLS - 4, r: ROWS - 4, t: 'clock', config: { label: '导入的时钟' } })
    expect(pages[0]?.[0]?.id).toBeTruthy()
  })

  it('多页（数组套数组）按页保留', () => {
    const pages = normPages([[{ w: 8, h: 4, t: 'news' }], [{ w: 2, h: 2, t: 'icon' }]])
    expect(pages.map((p) => p.length)).toEqual([1, 1])
    expect(pages[0]?.[0]?.t).toBe('news')
  })

  it('坏数据被丢弃（缺类型 / 非正尺寸 / 非数组）', () => {
    expect(normPages([{ w: 2, h: 2 }, { w: 0, h: 2, t: 'icon' }, null])).toEqual([])
    expect(normPages('bad')).toEqual([])
    expect(normPages([])).toEqual([])
  })
})