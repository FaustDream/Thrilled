/**
 * 内容模型与网格算法单测（v4）
 * 覆盖：出厂布局满足冻结的栅格规范 / 网格空位查找 / 重叠判定 / 导入文档归一化 / 图标页合并
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGES, isIconOnlyPage, mergeIconPages, normPages, uid } from '../src/app/layout'
import { CELL, COLS, INSET, LIBRARY_SIZES, ROWS, SIZES, findSlot, groupGrid, isLegalSize, overlaps } from '../src/shared/grid'
import { WIDGET_DEFS, WIDGET_GROUPS, WIDGET_GROUPS_ORDER, WIDGET_LIST } from '../src/shared/widget-defs'
import type { GridItem } from '../src/shared/types'

const PAGES = DEFAULT_PAGES.map((items, i) => ({ name: `出厂第 ${i + 1} 页`, items }))

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

describe('图标页合并（v4.1 迁移「一分组一页」存量修正）', () => {
  const icon = (label: string, w = 2, h = 2): GridItem => ({ id: uid(), c: 0, r: 0, w, h, t: 'icon', config: { label } })

  it('全为图标页的多页合并为一页，保留 id 与配置、不重叠', () => {
    const merged = mergeIconPages([[icon('A'), icon('B')], [icon('C')], [icon('D'), icon('E')]])
    expect(merged).not.toBeNull()
    expect(merged).toHaveLength(1)
    const flat = (merged ?? []).flat()
    expect(flat.map((it) => it.config['label'])).toEqual(['A', 'B', 'C', 'D', 'E'])
    const ids = flat.map((it) => it.id)
    expect(new Set(ids).size).toBe(ids.length)
    const clashes = flat.flatMap((a, i) => flat.slice(i + 1).filter((b) => overlaps(a, b)))
    expect(clashes).toEqual([])
  })

  it('超出单页容量时拆成最少的若干页', () => {
    const perPage = Math.floor((COLS / 2) * (ROWS / 2))
    const src = Array.from({ length: perPage + 3 }, (_, i) => [icon(`S${i}`)])
    const merged = mergeIconPages(src)
    expect(merged).toHaveLength(2)
    expect((merged ?? []).flat().map((it) => it.config['label'])).toHaveLength(perPage + 3)
  })

  it('含非图标卡（出厂小组件）的页集不合并', () => {
    expect(mergeIconPages([[icon('A')], [{ ...icon('B'), t: 'clock' }]])).toBeNull()
    expect(mergeIconPages([[{ ...icon('A'), t: 'news' }], [icon('B')]])).toBeNull()
  })

  it('单页或空页集不合并', () => {
    expect(mergeIconPages([[icon('A')]])).toBeNull()
    expect(mergeIconPages([])).toBeNull()
  })

  it('isIconOnlyPage：空页不算图标页', () => {
    expect(isIconOnlyPage([])).toBe(false)
    expect(isIconOnlyPage([icon('A')])).toBe(true)
  })
})

describe('组件库数据（分组 / 三档尺寸 / 配置项上限）', () => {
  it('每类小组件都归入唯一分组，四组都非空且覆盖全部类型', () => {
    const kinds = Object.keys(WIDGET_DEFS)
    const groups: Record<string, string | undefined> = WIDGET_GROUPS
    expect(kinds.filter((k) => groups[k] === undefined)).toEqual([])
    for (const g of WIDGET_GROUPS_ORDER) {
      expect(WIDGET_LIST.filter((w) => WIDGET_GROUPS[w.t] === g).length, `${g} 组为空`).toBeGreaterThan(0)
    }
    expect(WIDGET_GROUPS_ORDER).toEqual(['信息', '工具', '内容', '导航'])
  })

  it('尺寸三档都是合法尺寸（小 / 宽 / 大）', () => {
    expect(LIBRARY_SIZES.map((s) => `${s.k}${s.w}x${s.h}`)).toEqual(['小2x2', '宽4x2', '大4x4'])
    for (const s of LIBRARY_SIZES) expect(isLegalSize(s.w, s.h), `${s.k} 不是合法档位`).toBe(true)
  })

  it('配置项不超过 5 项（通用 2 项 + 专属 ≤3 项）', () => {
    for (const w of WIDGET_LIST) {
      expect(w.fields.length, `${w.n} 的专属配置超过 3 项`).toBeLessThanOrEqual(3)
      expect(w.fields.length + 2, `${w.n} 的配置项超过 5 项`).toBeLessThanOrEqual(5)
    }
  })

  it('组件说明为一行短句（≤20 字）', () => {
    const over = WIDGET_LIST.filter((w) => w.s.length > 20).map((w) => `${w.n}:${w.s}`)
    expect(over).toEqual([])
  })
})

describe('图标格容器自适应（groupGrid）', () => {
  const PAD = 15
  const GAP = 10
  /** 卡内标签占位（与 widgets.tsx 的 GROUP_LABEL_STRIP 一致） */
  const STRIP = 22
  /** 工厂里图标格容器的可用框（去掉卡片内缩、容器内距与标签条带） */
  const innerOf = (it: GridItem): { w: number; h: number } => {
    const label = it.config['label']
    const strip = typeof label === 'string' && label.trim() !== '' ? STRIP : 0
    return { w: it.w * CELL - 2 * INSET - PAD * 2, h: it.h * CELL - 2 * INSET - PAD * 2 - strip }
  }

  it('出厂每个图标格容器：所有应用都装得下，且网格不溢出可用框', () => {
    const groups = DEFAULT_PAGES.flat().filter((it) => it.t === 'group')
    expect(groups.length).toBeGreaterThan(0)
    for (const it of groups) {
      const apps = Array.isArray(it.config['apps']) ? (it.config['apps'] as string[]) : []
      const box = innerOf(it)
      const { cols, rows, cell } = groupGrid(apps.length, box.w, box.h, GAP)
      expect(cols * rows, `${it.id} 装不下 ${apps.length} 个应用`).toBeGreaterThanOrEqual(apps.length)
      expect(cols * cell + (cols - 1) * GAP).toBeLessThanOrEqual(box.w + 0.001)
      expect(rows * cell + (rows - 1) * GAP).toBeLessThanOrEqual(box.h + 0.001)
    }
  })

  it('格子边长按「铺满卡片」取值（不再是一排小字形）', () => {
    const wide = groupGrid(24, 8 * CELL - 2 * INSET - PAD * 2, 4 * CELL - 2 * INSET - PAD * 2, GAP)
    const square = groupGrid(12, 4 * CELL - 2 * INSET - PAD * 2, 4 * CELL - 2 * INSET - PAD * 2, GAP)
    expect(wide.cell).toBeGreaterThanOrEqual(46)
    expect(square.cell).toBeGreaterThanOrEqual(40)
    expect(wide.cols * wide.rows).toBeGreaterThanOrEqual(24)
  })

  it('边长有上下限：少格数不撑成巨块，极小卡片不塌成 0', () => {
    expect(groupGrid(1, 400, 400, GAP).cell).toBe(64)
    expect(groupGrid(4, 20, 20, GAP).cell).toBe(16)
  })
})