/**
 * 内容模型与网格算法单测（v4）
 * 覆盖：出厂布局满足冻结的栅格规范 / 网格空位查找 / 重叠判定 / 导入文档归一化 / 图标页合并
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGES, isIconOnlyPage, mergeIconPages, normPages, uid } from '../src/app/layout'
import { CELL, COLS, INSET, LIBRARY_SIZES, ROWS, SIZES, findSlot, groupBoxOf, groupFits, groupGrid, isLegalSize, overlaps } from '../src/shared/grid'
import {
  WIDGET_DEFS, WIDGET_GROUPS, WIDGET_GROUPS_ORDER, WIDGET_LIST,
  boxOfUnits, maxSizeOf, minSizeOf, naturalBoxOf, naturalMinOf, sizeAllowed, sizeAllowedFor,
} from '../src/shared/widget-defs'
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

  /* 通用段 2 项（名称标签 / 显示标题 / 透明度按需展开）+ 专属 ≤3 项；
     样式段（字号缩放 / 图标缩放 / 圆角 / 文字颜色）对所有组件统一，不计入定义表 */
  it('配置项不超过 5 项（通用 2 项 + 专属 ≤3 项；样式段另计）', () => {
    for (const w of WIDGET_LIST) {
      expect(w.fields.length, `${w.n} 的专属配置超过 3 项`).toBeLessThanOrEqual(3)
      expect(w.fields.length + 2, `${w.n} 的配置项超过 5 项`).toBeLessThanOrEqual(5)
    }
  })

  it('专属字段只用受支持的字段类型（含 range / color 的配套参数）', () => {
    const types = new Set(['text', 'num', 'list', 'bool', 'sel', 'range', 'color'])
    for (const w of WIDGET_LIST) {
      for (const f of w.fields) {
        expect(types.has(f.t), `${w.n} · ${f.l} 的字段类型 ${f.t} 不受支持`).toBe(true)
        if (f.t === 'range') {
          expect(typeof f.min, `${w.n} · ${f.l} 的 range 缺 min`).toBe('number')
          expect(typeof f.max, `${w.n} · ${f.l} 的 range 缺 max`).toBe('number')
          expect((f.max ?? 0) > (f.min ?? 0), `${w.n} · ${f.l} 的 range 区间非法`).toBe(true)
        }
      }
    }
  })
})

describe('尺寸自适应（自然短边 / 尺寸能力 / 容器单位基准）', () => {
  it('单位尺寸 → 像素：2×2 是 98×98、4×4 是 246×246（与 itemBox 同算法）', () => {
    expect(boxOfUnits(2, 2)).toEqual({ w: 98, h: 98 })
    expect(boxOfUnits(4, 4)).toEqual({ w: 246, h: 246 })
    expect(boxOfUnits(8, 4)).toEqual({ w: 542, h: 246 })
  })

  it('自然短边取两轴较小者：竖向卡取宽、横向卡取高', () => {
    expect(naturalMinOf('fav')).toBe(98)    /* 2×4：98 × 246 */
    expect(naturalMinOf('news')).toBe(246)  /* 8×4：542 × 246 */
    expect(naturalMinOf('clock')).toBe(246) /* 4×4 */
    expect(naturalMinOf('icon')).toBe(98)   /* 2×2 */
  })

  /* CSS 侧的 --u 公式（prototype.css §23）在 JS 里的等价实现，用于钉住「只放大不缩小」这条规则 */
  const scaleOf = (t: Parameters<typeof naturalBoxOf>[0], w: number, h: number): number => {
    const nat = naturalBoxOf(t)
    const box = boxOfUnits(w, h)
    return Math.max(1, Math.min(box.w / nat.w, box.h / nat.h))
  }

  it('缩放比 = min(宽比, 高比) 且下限 1（只在比自然尺寸大时放大）', () => {
    /* 图标（自然 2×2）：4×4 放大 2.51 倍，2×2 保持 1 */
    expect(scaleOf('icon', 4, 4)).toBeCloseTo(2.51, 2)
    expect(scaleOf('icon', 2, 2)).toBe(1)
    /* 时钟（自然 4×4）：出厂就放在 4×2，不缩小；8×4 受高度限制同样不放大 */
    expect(scaleOf('clock', 4, 2)).toBe(1)
    expect(scaleOf('clock', 8, 4)).toBe(1)
    /* 倒数日（自然 4×2）：放进 8×4 时受宽度限制 → 2.2 倍 */
    expect(scaleOf('countday', 8, 4)).toBeCloseTo(2.2, 2)
    /* 新闻（自然 8×4）：4×4 是缩小方向 → 1 */
    expect(scaleOf('news', 4, 4)).toBe(1)
  })

  it('每类组件的默认尺寸都在自己的能力区间内（放置即合法）', () => {
    for (const w of WIDGET_LIST) {
      expect(sizeAllowed(w.t, w.units.w, w.units.h), `${w.n} 的默认尺寸 ${w.units.w}×${w.units.h} 超出能力区间`).toBe(true)
    }
  })

  it('能力上下限本身是合法档位，且下限不高于上限', () => {
    for (const w of WIDGET_LIST) {
      const lo = minSizeOf(w.t)
      const hi = maxSizeOf(w.t)
      expect(isLegalSize(lo.w, lo.h), `${w.n} 的下限非法`).toBe(true)
      expect(isLegalSize(hi.w, hi.h), `${w.n} 的上限非法`).toBe(true)
      expect(lo.w <= hi.w && lo.h <= hi.h, `${w.n} 的上下限颠倒`).toBe(true)
    }
  })

  it('内容型组件拒绝装不下的档位（新闻 / 日历 / 音乐 / 图标格容器）', () => {
    expect(sizeAllowed('news', 4, 2)).toBe(false)     /* 高 2 格只有 98px，列表放不下 */
    expect(sizeAllowed('news', 4, 4)).toBe(true)
    expect(sizeAllowed('news', 8, 4)).toBe(true)
    expect(sizeAllowed('cal', 2, 2)).toBe(false)
    expect(sizeAllowed('cal', 4, 2)).toBe(true)
    expect(sizeAllowed('music', 4, 2)).toBe(false)
    expect(sizeAllowed('music', 4, 4)).toBe(true)
    expect(sizeAllowed('group', 4, 4)).toBe(true)
    expect(sizeAllowed('group', 2, 2)).toBe(false)
  })

  it('小尺寸组件只受六档合法性约束（图标 / 倒数日 / 木鱼可到 2×2）；时钟因 44px 时间裁切而下限 4×2', () => {
    expect(sizeAllowed('icon', 2, 2)).toBe(true)
    expect(sizeAllowed('countday', 2, 2)).toBe(true)
    expect(sizeAllowed('woodfish', 2, 2)).toBe(true)
    expect(sizeAllowed('clock', 2, 2)).toBe(false)
    expect(sizeAllowed('clock', 4, 2)).toBe(true)
    expect(sizeAllowed('clock', 4, 4)).toBe(true)
  })

  it('出厂布局的每张卡片都在对应组件的尺寸能力区间内（含按实例内容收紧）', () => {
    const bad = PAGES.flatMap((p) => p.items)
      .filter((it) => !sizeAllowedFor(it.t, it.config, it.w, it.h))
      .map((it) => `${it.t} ${it.w}×${it.h}`)
    expect(bad).toEqual([])
  })

  it('图标格容器的能力按应用数收紧：装不下（只能滚动）的档位被拦', () => {
    const apps = (n: number): { apps: string[] } => ({ apps: Array.from({ length: n }, (_, i) => `站${i + 1}`) })
    /* 8×2 无标签：24 个仍能不滚动装下；加上标签条带后 4×2 就不行了 */
    expect(sizeAllowedFor('group', apps(24), 8, 2)).toBe(true)
    expect(sizeAllowedFor('group', { ...apps(24), label: '购物' }, 4, 2)).toBe(false)
    expect(sizeAllowedFor('group', { ...apps(24), label: '购物' }, 8, 2)).toBe(true)
    /* 8 个应用的 8×2 容器不受影响 */
    expect(sizeAllowedFor('group', { ...apps(8), label: '常用' }, 8, 2)).toBe(true)
    /* 其它组件不受实例内容影响 */
    expect(sizeAllowedFor('clock', {}, 4, 2)).toBe(true)
    expect(sizeAllowedFor('clock', {}, 2, 2)).toBe(false)
  })

  it('图标格容器：可用框与「能装下」判定共用同一套几何（渲染与能力判定不各算一套）', () => {
    /* 8×2：卡宽 8×74−50 = 542，减去容器内距 30 → 512；高度 98−30−22（标签条带）= 46 */
    expect(groupBoxOf(8, 2, true)).toEqual({ w: 512, h: 46 })
    expect(groupFits(24, 8, 2, true)).toBe(true)
    expect(groupFits(24, 4, 2, true)).toBe(false)
    expect(groupFits(12, 4, 2, true)).toBe(true)
  })
})

describe('组件说明文案（定义表）', () => {
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