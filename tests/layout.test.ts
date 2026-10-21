/**
 * 内容模型与网格算法单测（v4）
 * 覆盖：出厂布局满足冻结的栅格规范 / 网格空位查找 / 重叠判定 / 导入文档归一化 / 图标页合并
 */
import { describe, expect, it } from 'vitest'
import { ARRANGE_ALL_KINDS, ARRANGE_KINDS, DEFAULT_PAGES, SAMPLE_PAGES, REPEATABLE_KINDS, arrangePages, crossPlan, dropPlan, isIconOnlyPage, mergeIconPages, normPages, packPage, placedKindsOf, prunePages, uid } from '../src/app/layout'
import { CELL, COLS, ICON_INSET, INSET, ROWS, SIZES, SNAP_ALIGN_PX, findSlot, findSlotNear, groupBoxOf, groupFits, groupGrid, insetOf, isLegalSize, itemBox, nearOnAxis, overlaps, snapAxis } from '../src/shared/grid'
import {
  COMMON_KINDS, LIBRARY_EXCLUDED, LIBRARY_LIST, WIDGET_DEFS, WIDGET_GROUPS, WIDGET_GROUPS_ORDER, WIDGET_LIST, inLibrary,
  boxOfUnits, maxSizeOf, minSizeOf, naturalBoxOf, naturalMinOf, placeSizeOf, sizeAllowed, sizeAllowedFor, widgetsInGroup,
} from '../src/shared/widget-defs'
import type { GridItem, WidgetKind } from '../src/shared/types'

const PAGES = SAMPLE_PAGES.map((items, i) => ({ name: `示例第 ${i + 1} 页`, items }))

describe('示例布局（冻结规范：六档尺寸 / 24×10 网格 / 100% 填满）', () => {
  it('出厂布局是空白页（首次安装不预置卡片）', () => {
    expect(DEFAULT_PAGES).toEqual([[]])
  })

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

  it('findSlotNear 空页落在目标格', () => {
    expect(findSlotNear([], 2, 2, { c: 6, r: 3 })).toEqual({ c: 6, r: 3 })
  })

  it('findSlotNear 目标格放不下时落在最近空位', () => {
    /* 前两行被整行占满，目标 (2,0) 落不下 → 最近空位是 (2,2) */
    expect(findSlotNear([item(0, 0, 24, 2)], 2, 2, { c: 2, r: 0 })).toEqual({ c: 2, r: 2 })
  })

  it('findSlotNear 越界目标格钳制到合法范围', () => {
    expect(findSlotNear([], 2, 2, { c: 99, r: 99 })).toEqual({ c: COLS - 2, r: ROWS - 2 })
    expect(findSlotNear([], 2, 2, { c: -5, r: -5 })).toEqual({ c: 0, r: 0 })
  })

  it('整页占满时 findSlotNear 返回 null', () => {
    const rows: GridItem[] = []
    for (let r = 0; r < ROWS; r += 2) for (let c = 0; c < COLS; c += 2) rows.push(item(c, r, 2, 2))
    expect(findSlotNear(rows, 2, 2, { c: 4, r: 4 })).toBeNull()
  })

  it('相邻边界不算重叠', () => {
    expect(overlaps(item(0, 0, 2, 2), item(2, 0, 2, 2))).toBe(false)
    expect(overlaps(item(0, 0, 2, 2), item(1, 1, 2, 2))).toBe(true)
  })
})

describe('对齐吸附（snapAxis：网格基准 + 阈值内的组件对齐）', () => {
  const box = (id: string, c: number, r: number, w: number, h: number) => ({ id, c, r, w, h })

  it('没有可对齐的卡片时取最近网格格，且不产生参考线', () => {
    expect(snapAxis(5.4, 2, COLS, [], 'x', SNAP_ALIGN_PX)).toEqual({ index: 5, guide: null })
  })

  it('阈值 ≤0（关闭组件吸附）时只用最近格', () => {
    expect(snapAxis(5.6, 2, COLS, [box('a', 6, 0, 2, 2)], 'x', 0)).toEqual({ index: 6, guide: null })
  })

  it('起点边对齐：偏差在阈值内改用对齐格，并给出贯穿参考线的位置', () => {
    expect(snapAxis(5.8, 2, COLS, [box('a', 6, 0, 2, 2)], 'x', SNAP_ALIGN_PX))
      .toEqual({ index: 6, guide: { pos: 6 * CELL + INSET, ids: ['a'] } })
  })

  it('终点边对齐：本卡右边缘吸到目标右边缘', () => {
    expect(snapAxis(6.2, 4, COLS, [box('a', 8, 0, 2, 2)], 'x', SNAP_ALIGN_PX))
      .toEqual({ index: 6, guide: { pos: 10 * CELL - INSET, ids: ['a'] } })
  })

  it('居中：本卡中心吸到目标中心', () => {
    expect(snapAxis(5.1, 2, COLS, [box('a', 4, 0, 4, 4)], 'x', SNAP_ALIGN_PX))
      .toEqual({ index: 5, guide: { pos: 6 * CELL, ids: ['a'] } })
  })

  it('超出阈值就不吸：回到最近格且无参考线', () => {
    expect(snapAxis(6.5, 2, COLS, [box('a', 6, 0, 2, 2)], 'x', SNAP_ALIGN_PX)).toEqual({ index: 7, guide: null })
  })

  it('两侧同偏差时收集多个目标（一起高亮）', () => {
    const others = [box('a', 6, 0, 2, 2), box('b', 6, 4, 2, 2)]
    expect(snapAxis(5.9, 2, COLS, others, 'x', SNAP_ALIGN_PX))
      .toEqual({ index: 6, guide: { pos: 6 * CELL + INSET, ids: ['a', 'b'] } })
  })

  it('越界的目标候选被跳过（否则会把卡片放到网格之外）', () => {
    /* 目标在最右（22+2=24），本卡 4 格宽：起点候选 22 与居中候选 21 都会被钳制 → 只剩终点候选 20，
       而 21.9 距 20 已超阈值，于是落最近格（钳制后仍是 20）且不给参考线 */
    expect(snapAxis(21.9, 4, COLS, [box('a', 22, 0, 2, 2)], 'x', SNAP_ALIGN_PX)).toEqual({ index: 20, guide: null })
  })

  it('垂直方向按 r / h 计算', () => {
    expect(snapAxis(3.2, 2, ROWS, [box('a', 0, 3, 2, 4)], 'y', SNAP_ALIGN_PX))
      .toEqual({ index: 3, guide: { pos: 3 * CELL + INSET, ids: ['a'] } })
  })

  it('nearOnAxis：重叠或间隙 ≤1 格算邻近，隔开更远则不算', () => {
    expect(nearOnAxis(0, 2, 1, 3)).toBe(true) // 重叠
    expect(nearOnAxis(0, 2, 3, 5)).toBe(true) // 间隙 1 格
    expect(nearOnAxis(0, 2, 4, 6)).toBe(false) // 间隙 2 格
    expect(nearOnAxis(5, 7, 0, 2)).toBe(false) // 完全隔开
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
    const pages = normPages([[{ w: 8, h: 4, t: 'countdown' }], [{ w: 2, h: 2, t: 'icon' }]])
    expect(pages.map((p) => p.length)).toEqual([1, 1])
    expect(pages[0]?.[0]?.t).toBe('countdown')
  })

  it('坏数据被丢弃（缺类型 / 非正尺寸 / 非数组）', () => {
    expect(normPages([{ w: 2, h: 2 }, { w: 0, h: 2, t: 'icon' }, null])).toEqual([])
    expect(normPages('bad')).toEqual([])
    expect(normPages([])).toEqual([])
  })

  it('旧类型「倒数日」转接为「倒计时」倒数日模式（旧备份导入不丢卡）', () => {
    const pages = normPages([{ c: 4, r: 2, w: 4, h: 2, t: 'countday', config: { title: '距离元旦', date: '2027-01-01', accent: '#A855F7' } }])
    expect(pages).toHaveLength(1)
    expect(pages[0]?.[0]).toMatchObject({
      c: 4, r: 2, w: 4, h: 2, t: 'countdown',
      config: { title: '距离元旦', date: '2027-01-01', accent: '#A855F7', mode: '倒数日' },
    })
  })

  it('旧类型「纪念日」转接为「倒计时」纪念日模式（标题 / 起始日期 / 单位三个键无缝衔接）', () => {
    const pages = normPages([{ c: 8, r: 0, w: 8, h: 4, t: 'ann', config: { title: '在一起', date: '2020-05-20', unitLabel: '天' } }])
    expect(pages[0]?.[0]).toMatchObject({
      c: 8, r: 0, w: 8, h: 4, t: 'countdown',
      config: { title: '在一起', date: '2020-05-20', unitLabel: '天', mode: '纪念日' },
    })
  })

  it('被移除的组件（新闻 / 音乐 / 每日一言 / 木鱼 / 计算器 / 翻译 / AI）不再放行', () => {
    expect(normPages([{ w: 8, h: 4, t: 'news' }, { w: 4, h: 4, t: 'music' }, { w: 8, h: 2, t: 'quote' }])).toEqual([])
    expect(normPages([{ w: 2, h: 2, t: 'woodfish' }, { w: 4, h: 2, t: 'calc' }, { w: 4, h: 2, t: 'trans' }, { w: 4, h: 4, t: 'ai' }])).toEqual([])
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
    expect(mergeIconPages([[{ ...icon('A'), t: 'group' }], [icon('B')]])).toBeNull()
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

describe('组件库数据（分组 / 默认大小 / 配置项上限）', () => {
  it('每类小组件都归入唯一的类型分组，三个类型组都非空且覆盖全部类型', () => {
    const kinds = Object.keys(WIDGET_DEFS)
    const groups: Record<string, string | undefined> = WIDGET_GROUPS
    expect(kinds.filter((k) => groups[k] === undefined)).toEqual([])
    for (const g of ['时间', '信息', '图标'] as const) {
      expect(WIDGET_LIST.filter((w) => WIDGET_GROUPS[w.t] === g).length, `${g} 组为空`).toBeGreaterThan(0)
    }
    /* 分组按组件类型重排（时间 / 信息 / 图标），并新增置顶的「常用」 */
    expect(WIDGET_GROUPS_ORDER).toEqual(['常用', '时间', '信息', '图标'])
    for (const w of WIDGET_LIST) expect(groups[w.t], `${w.n} 缺少类型分组`).not.toBeUndefined()
  })

  it('「常用」是置顶快捷组：按内置高频清单给出，成员仍保留自己的类型分组', () => {
    expect(COMMON_KINDS.length).toBeGreaterThan(0)
    expect(widgetsInGroup('常用').map((w) => w.t)).toEqual([...COMMON_KINDS])
    for (const k of COMMON_KINDS) {
      expect(WIDGET_DEFS[k], `${k} 不是已知组件`).toBeDefined()
      expect(WIDGET_GROUPS[k], `${k} 缺少类型分组`).not.toBeUndefined()
    }
  })

  it('类型分组取件拼起来覆盖组件库清单（无遗漏、无重复）', () => {
    const grouped = WIDGET_GROUPS_ORDER.filter((g) => g !== '常用').flatMap((g) => widgetsInGroup(g).map((w) => w.t))
    expect([...grouped].sort()).toEqual(LIBRARY_LIST.map((w) => w.t).sort())
  })

  it('组件库排除待办 / 收藏夹 / 图标文件夹 / 图标格容器，但它们仍是合法卡片类型', () => {
    for (const t of LIBRARY_EXCLUDED) {
      expect(LIBRARY_LIST.some((w) => w.t === t), `${t} 不应出现在组件库`).toBe(false)
      expect(widgetsInGroup('常用').some((w) => w.t === t), `${t} 不应出现在常用组`).toBe(false)
      /* 仍在定义表里：已放好的卡片照常渲染 / 编辑 */
      expect(WIDGET_DEFS[t]).toBeDefined()
    }
    expect([...LIBRARY_EXCLUDED].sort()).toEqual(['fav', 'folder', 'group', 'todo'])
    expect(inLibrary('clock')).toBe(true)
    expect(inLibrary('todo')).toBe(false)
  })

  it('新放置实例的尺寸：优先用该类设置的默认大小，坏值 / 内容装不下时回退出厂尺寸', () => {
    /* 未设置 → 出厂尺寸 */
    expect(placeSizeOf('clock', {}, {})).toEqual(WIDGET_DEFS.clock.units)
    /* 已设置且合法 → 用默认大小 */
    expect(placeSizeOf('clock', {}, { clock: { w: 8, h: 4 } })).toEqual({ w: 8, h: 4 })
    /* 低于组件下限（归一化会拦，这里是兜底路径）→ 回退出厂尺寸 */
    expect(placeSizeOf('cal', {}, { cal: { w: 2, h: 2 } })).toEqual(WIDGET_DEFS.cal.units)
    /* 图标格容器按实例内容收紧：应用多到该档装不下 → 回退出厂尺寸 */
    const apps = Array.from({ length: 100 }, (_, i) => `https://a${i}.com`)
    expect(placeSizeOf('group', { apps }, { group: { w: 4, h: 2 } })).toEqual(WIDGET_DEFS.group.units)
  })

  /* 通用段 2 项（名称标签 / 显示标题 / 透明度按需展开）+ 专属 ≤3 项；
     样式段（字号缩放 / 图标缩放 / 圆角 / 文字颜色）对所有组件统一，不计入定义表 */
  it('配置项不超过 5 项（通用 2 项 + 专属 ≤3 项；样式段另计）', () => {
    for (const w of WIDGET_LIST) {
      expect(w.fields.length, `${w.n} 的专属配置超过 3 项`).toBeLessThanOrEqual(3)
      expect(w.fields.length + 2, `${w.n} 的配置项超过 5 项`).toBeLessThanOrEqual(5)
    }
  })

  /* 默认配置必须覆盖全部字段键：渲染按「定义默认值 ⊕ 实例覆盖值」合成，
     缺键会让该功能静默丢失（字段挪去详情弹窗管理时，默认值仍要留在 def） */
  it('定义表默认配置覆盖全部专属字段', () => {
    for (const w of WIDGET_LIST) {
      for (const f of w.fields) {
        expect(f.k in w.def, `${w.n} 的默认配置缺字段 ${f.k}`).toBe(true)
      }
    }
  })

  it('专属字段只用受支持的字段类型（含 range / color 的配套参数）', () => {
    const types = new Set(['text', 'num', 'list', 'bool', 'sel', 'multi', 'range', 'color'])
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
    expect(naturalMinOf('fav')).toBe(98)      /* 2×4：98 × 246 */
    expect(naturalMinOf('countdown')).toBe(246) /* 8×4：542 × 246 */
    expect(naturalMinOf('clock')).toBe(246)    /* 4×4 */
    expect(naturalMinOf('icon')).toBe(120)     /* 2×2：图标类贴边后 2×74−2×14 */
  })

  /* CSS 侧的 --u 公式（prototype.css §23）在 JS 里的等价实现，用于钉住「只放大不缩小」这条规则 */
  const scaleOf = (t: Parameters<typeof naturalBoxOf>[0], w: number, h: number): number => {
    const nat = naturalBoxOf(t)
    const box = boxOfUnits(w, h, t) /* 内缩按类型取：图标类贴边后卡片更宽，两边口径必须一致 */
    return Math.max(1, Math.min(box.w / nat.w, box.h / nat.h))
  }

  it('缩放比 = min(宽比, 高比) 且下限 1（只在比自然尺寸大时放大）', () => {
    /* 图标（自然 2×2 = 120）：4×4（268）放大 2.23 倍，2×2 保持 1 */
    expect(scaleOf('icon', 4, 4)).toBeCloseTo(2.23, 2)
    expect(scaleOf('icon', 2, 2)).toBe(1)
    /* 时钟（自然 4×4）：出厂就放在 4×2，不缩小；8×4 受高度限制同样不放大 */
    expect(scaleOf('clock', 4, 2)).toBe(1)
    expect(scaleOf('clock', 8, 4)).toBe(1)
    /* 天气（自然 4×2）：放进 8×4 时受宽度限制 → 2.2 倍 */
    expect(scaleOf('weather', 8, 4)).toBeCloseTo(2.2, 2)
    /* 倒计时（自然 8×4）：4×4 是缩小方向 → 1 */
    expect(scaleOf('countdown', 4, 4)).toBe(1)
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

  it('内容型组件拒绝装不下的档位（日历 / 天气 / 图标格容器）', () => {
    expect(sizeAllowed('cal', 2, 2)).toBe(false)
    expect(sizeAllowed('cal', 4, 2)).toBe(true)
    expect(sizeAllowed('fav', 2, 2)).toBe(true)
    expect(sizeAllowed('weather', 2, 2)).toBe(false)
    expect(sizeAllowed('weather', 4, 2)).toBe(true)
    expect(sizeAllowed('group', 4, 4)).toBe(true)
    expect(sizeAllowed('group', 2, 2)).toBe(false)
  })

  it('小尺寸组件只受六档合法性约束（网站图标 / 图标文件夹可到 2×2）；时钟因 44px 时间裁切而下限 4×2', () => {
    expect(sizeAllowed('icon', 2, 2)).toBe(true)
    expect(sizeAllowed('folder', 2, 2)).toBe(true)
    expect(sizeAllowed('clock', 2, 2)).toBe(false)
    expect(sizeAllowed('clock', 4, 2)).toBe(true)
    expect(sizeAllowed('clock', 4, 4)).toBe(true)
  })

  it('倒计时（下班 / 倒数日合并）下限 4×2：矮卡只留主读数，列表与吉祥物需 4 格高', () => {
    expect(sizeAllowed('countdown', 2, 2)).toBe(false)
    expect(sizeAllowed('countdown', 4, 2)).toBe(true)
    expect(sizeAllowed('countdown', 4, 4)).toBe(true)
    expect(sizeAllowed('countdown', 8, 4)).toBe(true)
  })

  it('出厂布局的每张卡片都在对应组件的尺寸能力区间内（含按实例内容收紧）', () => {
    const bad = PAGES.flatMap((p) => p.items)
      .filter((it) => !sizeAllowedFor(it.t, it.config, it.w, it.h))
      .map((it) => `${it.t} ${it.w}×${it.h}`)
    expect(bad).toEqual([])
  })

  it('图标格容器的能力按应用数收紧：装不下（只能滚动）的档位被拦', () => {
    const apps = (n: number): { apps: string[] } => ({ apps: Array.from({ length: n }, (_, i) => `站${i + 1}`) })
    /* 名称标签已移除：能力判定只看应用数——4×2 的格子容量上限是 8×3×16px = 24 个 */
    expect(sizeAllowedFor('group', apps(24), 4, 2)).toBe(true)
    expect(sizeAllowedFor('group', apps(30), 4, 2)).toBe(false)
    expect(sizeAllowedFor('group', apps(30), 8, 2)).toBe(true)
    /* 其它组件不受实例内容影响 */
    expect(sizeAllowedFor('clock', {}, 4, 2)).toBe(true)
    expect(sizeAllowedFor('clock', {}, 2, 2)).toBe(false)
  })

  it('图标格容器：可用框与「能装下」判定共用同一套几何（渲染与能力判定不各算一套）', () => {
    /* 8×2：卡宽 8×74−2×14（图标类贴边）= 564，减去容器内距 30 → 534；高度 2×74−28−30 = 90 */
    expect(groupBoxOf(8, 2)).toEqual({ w: 534, h: 90 })
    expect(groupFits(24, 8, 2)).toBe(true)
    expect(groupFits(24, 4, 2)).toBe(true)
    expect(groupFits(30, 4, 2)).toBe(false)
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
  /** 工厂里图标格容器的可用框（去掉卡片内缩与容器内距；名称标签已移除，不再有条带） */
  const innerOf = (it: GridItem): { w: number; h: number } => ({
    w: it.w * CELL - 2 * INSET - PAD * 2,
    h: it.h * CELL - 2 * INSET - PAD * 2,
  })

  it('出厂每个图标格容器：所有应用都装得下，且网格不溢出可用框', () => {
    const groups = SAMPLE_PAGES.flat().filter((it) => it.t === 'group')
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
describe('已添加判定（placedKindsOf：组件库与右键「添加组件」共用）', () => {
  const card = (t: GridItem['t']): GridItem => ({ id: uid(), c: 0, r: 0, w: 4, h: 2, t, config: {} })

  it('跨页收集单例型组件，同类型多实例只算一个', () => {
    const pages = [[card('clock'), card('clock')], [card('weather')]]
    expect([...placedKindsOf(pages)].sort()).toEqual(['clock', 'weather'])
  })

  it('可重复放置的类型（网站图标 / 图标文件夹 / 图标格容器）不参与判定', () => {
    expect([...REPEATABLE_KINDS].sort()).toEqual(['folder', 'group', 'icon'])
    const pages = [[card('icon'), card('folder')], [card('group')]]
    expect(placedKindsOf(pages).size).toBe(0)
  })

  it('空布局返回空集合', () => {
    expect(placedKindsOf([]).size).toBe(0)
  })
})

describe('prunePages：删除卡片后的空页修剪', () => {
  const P = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, c: 0, r: 0, w: 2, h: 2, t: 'clock' as const, config: {} }))

  it('无空页时原样返回', () => {
    const pages = [P(3), P(2)]
    expect(prunePages(pages, 1)).toEqual({ pages, cur: 1, removed: 0 })
  })

  it('当前页删空后移除该页，序号落到前一保留页', () => {
    const pages = [P(3), [], P(2)]
    const r = prunePages(pages, 1)
    expect(r.pages).toHaveLength(2)
    expect(r.pages[0]).toEqual(pages[0])
    expect(r.pages[1]).toEqual(pages[2])
    expect(r.cur).toBe(0)
    expect(r.removed).toBe(1)
  })

  it('中间页删空：序号落回前一保留页；无空页时原样返回（至少保留一页由调用方保证）', () => {
    const pages = [P(2), [], P(3)]
    const r = prunePages(pages, 1)
    expect(r.pages).toHaveLength(2)
    expect(r.cur).toBe(0)
    expect(r.removed).toBe(1)
    const last = [P(2), P(1)]
    const r2 = prunePages(last, 1)
    expect(r2.pages).toEqual(last)
    expect(r2.cur).toBe(1)
    expect(r2.removed).toBe(0)
  })
})

describe('dropPlan：拖拽落位（空位直接落 / 同尺寸互换 / 否则就近）', () => {
  const card = (c: number, r: number, w = 2, h = 2, t: WidgetKind = 'icon'): GridItem =>
    ({ id: uid(), c, r, w, h, t, config: {} })

  it('目标格空着 → 直接落（move）', () => {
    const a = card(0, 0)
    expect(dropPlan([a], a.id, 6, 4)).toEqual({ kind: 'move', c: 6, r: 4 })
  })

  it('压到一张同尺寸卡片 → 两张互换（swap），并给出对方的去处', () => {
    const a = card(0, 0)
    const b = card(6, 4)
    expect(dropPlan([a, b], a.id, 6, 4))
      .toEqual({ kind: 'swap', c: 6, r: 4, swapId: b.id, swapTo: { c: 0, r: 0 } })
  })

  it('尺寸不同装不下 → 就近落位（near），落点不与目标重叠', () => {
    const clock = card(0, 0, 4, 2, 'clock')
    const a = card(10, 0) /* 2×2 图标拖到时钟上：装不下，就近落到时钟正下方的空位 */
    const plan = dropPlan([clock, a], a.id, 0, 0)
    expect(plan.kind).toBe('near')
    expect([plan.c, plan.r]).toEqual([0, 2])
    expect(overlaps({ c: plan.c, r: plan.r, w: 2, h: 2 }, clock)).toBe(false)
  })

  it('整页占满且尺寸不合 → fail（调用方给提示，不再静默无反应）', () => {
    const rows: GridItem[] = []
    for (let r = 0; r < ROWS; r += 2) for (let c = 0; c < COLS; c += 4) rows.push(card(c, r, 4, 2, 'clock'))
    const box = card(0, 0, 4, 4, 'group')
    expect(dropPlan([...rows, box], box.id, 0, 0).kind).toBe('fail')
  })

  it('卡片不在这一页 → fail', () => {
    expect(dropPlan([card(0, 0)], 'nope', 0, 0).kind).toBe('fail')
  })
})

describe('crossPlan：跨页搬动（单张就近 / 多张依次填空位 / 放不下的留在原页）', () => {
  const card = (id: string, c: number, r: number, w = 2, h = 2, t: WidgetKind = 'icon'): GridItem =>
    ({ id, c, r, w, h, t, config: {} })

  it('单张 + 给了落点：目标格空着就落在那里', () => {
    const a = card('a', 0, 0)
    expect(crossPlan([[a], []], ['a'], 1, { c: 6, r: 4 })).toEqual({ placed: [{ id: 'a', c: 6, r: 4 }], kept: [] })
  })

  it('单张 + 目标格被占：就近落位，落点不与占位卡片重叠', () => {
    const a = card('a', 0, 0)
    const b = card('b', 6, 4, 4, 2, 'clock')
    const plan = crossPlan([[a], [b]], ['a'], 1, { c: 6, r: 4 })
    const hit = plan.placed[0]
    expect(hit).toBeDefined()
    expect(overlaps({ c: hit?.c ?? 0, r: hit?.r ?? 0, w: 2, h: 2 }, b)).toBe(false)
  })

  it('多张：按「源页 (r,c) 靠前者优先」依次填空位，结果之间不重叠', () => {
    const a = card('a', 0, 4)
    const b = card('b', 0, 0)
    const c = card('c', 4, 0)
    /* 传入顺序被打乱，落位顺序仍按源页 (r,c)：b(0,0) → c(0,4) → a(4,0) */
    const plan = crossPlan([[a, b, c], []], ['a', 'c', 'b'], 1)
    expect(plan.placed).toEqual([
      { id: 'b', c: 0, r: 0 },
      { id: 'c', c: 2, r: 0 },
      { id: 'a', c: 4, r: 0 },
    ])
    expect(plan.kept).toEqual([])
  })

  it('多来源页：先按页序，再按页内 (r,c)', () => {
    const p1 = card('p1', 8, 8)
    const p2 = card('p2', 0, 0)
    expect(crossPlan([[p1], [p2], []], ['p2', 'p1'], 2).placed)
      .toEqual([{ id: 'p1', c: 0, r: 0 }, { id: 'p2', c: 2, r: 0 }])
  })

  it('目标页只剩一个空位：放得下的先放，其余留在原页（kept 按处理顺序）', () => {
    const x = card('x', 2, 0, 22, 10, 'clock')
    const y = card('y', 0, 2, 2, 8, 'clock')
    const a = card('a', 0, 4)
    const b = card('b', 0, 0)
    const plan = crossPlan([[a, b], [x, y]], ['a', 'b'], 1)
    expect(plan.placed).toEqual([{ id: 'b', c: 0, r: 0 }])
    expect(plan.kept).toEqual(['a'])
  })

  it('目标页整页放不下 → placed 为空、全部留在原页', () => {
    const full: GridItem[] = []
    for (let r = 0; r < ROWS; r += 2) for (let c = 0; c < COLS; c += 4) full.push(card(`f${r}-${c}`, c, r, 4, 2, 'clock'))
    const a = card('a', 0, 0)
    const plan = crossPlan([[a], full], ['a'], 1)
    expect(plan.placed).toEqual([])
    expect(plan.kept).toEqual(['a'])
  })

  it('已经在目标页的选中项也参与重新落位（整组视作一个整体）', () => {
    const a = card('a', 8, 8)
    const b = card('b', 0, 0)
    expect(crossPlan([[], [a, b]], ['a', 'b'], 1).placed)
      .toEqual([{ id: 'b', c: 0, r: 0 }, { id: 'a', c: 2, r: 0 }])
  })

  it('找不到的 id 忽略；空 ids / 目标页越界 → 空结果', () => {
    const a = card('a', 0, 0)
    expect(crossPlan([[a], []], ['a', 'nope'], 1)).toEqual({ placed: [{ id: 'a', c: 0, r: 0 }], kept: [] })
    expect(crossPlan([[a], []], [], 1)).toEqual({ placed: [], kept: [] })
    expect(crossPlan([[a], []], ['a'], 9)).toEqual({ placed: [], kept: [] })
  })

  it('不改入参（纯函数）', () => {
    const a = card('a', 0, 0)
    const pages = [[a], []]
    crossPlan(pages, ['a'], 1, { c: 4, r: 4 })
    expect(pages[0]?.[0]).toEqual(a)
    expect(a.c).toBe(0)
  })
})

describe('packPage：单页整理（跨页搬走后源页补位，组件钉住不动）', () => {
  const card = (id: string, c: number, r: number, w = 2, h = 2, t: WidgetKind = 'icon'): GridItem =>
    ({ id, c, r, w, h, t, config: {} })

  it('图标依次前移到本页最靠前的空位，组件原位不动', () => {
    const clock = card('k', 0, 0, 4, 2, 'clock')
    const out = packPage([clock, card('a', 4, 2), card('b', 8, 2)])
    expect(out).not.toBeNull()
    expect(out?.find((x) => x.id === 'k')).toEqual(clock)
    /* 时钟占住 (0,0)-(3,1)：a 补到 (4,0)，b 再补到 (6,0) */
    expect(out?.find((x) => x.id === 'a')).toMatchObject({ c: 4, r: 0 })
    expect(out?.find((x) => x.id === 'b')).toMatchObject({ c: 6, r: 0 })
  })

  it('本来就紧凑 / 只有组件 / 空页 → null', () => {
    expect(packPage([card('a', 0, 0), card('b', 2, 0)])).toBeNull()
    expect(packPage([card('k', 0, 0, 4, 2, 'clock'), card('k2', 4, 0, 4, 2, 'clock')])).toBeNull()
    expect(packPage([])).toBeNull()
  })
})

describe('图标类贴边（内缩按类型取，渲染与拖拽共用一处）', () => {
  it('图标类 14px、组件 25px', () => {
    expect(insetOf('icon')).toBe(ICON_INSET)
    expect(insetOf('folder')).toBe(ICON_INSET)
    expect(insetOf('group')).toBe(ICON_INSET)
    expect(insetOf('clock')).toBe(INSET)
    expect(ICON_INSET).toBeLessThan(INSET)
  })

  it('itemBox 与 insetOf 同源：2×2 图标卡是 120×120、相邻卡间距 28px', () => {
    expect(itemBox({ c: 0, r: 0, w: 2, h: 2, t: 'icon' }))
      .toBe(`left:${ICON_INSET}px;top:${ICON_INSET}px;width:120px;height:120px`)
    expect(CELL * 2 - 2 * ICON_INSET).toBe(120)
    expect(2 * CELL - (CELL * 2 - 2 * ICON_INSET)).toBe(28)
  })
})

describe('arrangePages：删除图标后的自动整理（跨页链式补位）', () => {
  const card = (c: number, r: number, w = 2, h = 2, t: WidgetKind = 'icon'): GridItem =>
    ({ id: uid(), c, r, w, h, t, config: {} })
  const pos = (x: GridItem): [number, number] => [x.c, x.r]
  /** 断言非 null 并收窄类型（本文件禁用 `!` 断言） */
  const arrange = (pages: readonly GridItem[][]): { pages: GridItem[][]; moved: number } => {
    const r = arrangePages(pages)
    if (r === null) throw new Error('arrangePages 意外返回 null')
    return r
  }
  const byId = (items: readonly GridItem[], id: string): GridItem => {
    const x = items.find((v) => v.id === id)
    if (x === undefined) throw new Error(`缺少卡片 ${id}`)
    return x
  }
  const at = (items: readonly GridItem[], i: number): GridItem => {
    const x = items[i]
    if (x === undefined) throw new Error(`缺少下标 ${i}`)
    return x
  }
  /** 整页铺满 2×2（用于「无可补」的对照） */
  const fullPage = (): GridItem[] => {
    const out: GridItem[] = []
    for (let r = 0; r < ROWS; r += 2) for (let c = 0; c < COLS; c += 2) out.push(card(c, r))
    return out
  }

  it('删掉第一张后，后面的图标一张接一张前移（链式补位）', () => {
    const b = card(2, 0)
    const c = card(4, 0)
    const r = arrange([[b, c]]) /* 第一张 (0,0) 已被删除 */
    expect(r.moved).toBe(2)
    /* 相对顺序不变：b 仍在 c 前面，各自前移一格 */
    expect(r.pages[0]?.map((x) => x.id)).toEqual([b.id, c.id])
    expect(pos(at(r.pages[0] ?? [], 0))).toEqual([0, 0])
    expect(pos(at(r.pages[0] ?? [], 1))).toEqual([2, 0])
  })

  it('组件钉住不动，图标补到组件旁边的空位', () => {
    const clock = card(0, 0, 4, 2, 'clock')
    const f = card(6, 0) /* 时钟右侧留了个 2×2 的洞 */
    const r = arrange([[clock, f]])
    expect(r.moved).toBe(1)
    const page = r.pages[0] ?? []
    expect(pos(byId(page, f.id))).toEqual([4, 0])
    expect(pos(byId(page, clock.id))).toEqual([0, 0])
  })

  it('本就紧凑时 moved=0，未移动的卡片返回原对象（避免无谓重渲染）', () => {
    const a = card(0, 0)
    const b = card(2, 0)
    const r = arrange([[a, b]])
    expect(r.moved).toBe(0)
    const page = r.pages[0] ?? []
    expect(at(page, 0)).toBe(a)
    expect(at(page, 1)).toBe(b)
  })

  it('尺寸对不上时链条停止：2×2 的洞装不下 4×4 容器，容器留在原位', () => {
    /* 组件块占满 (0..4, 2..6)，左上角留了个 2×2 的洞；唯一可移动的是 4×4 容器 */
    const page = [card(0, 2, 2, 2, 'clock'), card(2, 2, 2, 2, 'weather'), card(0, 4, 2, 2, 'todo'), card(2, 4, 2, 2, 'cal'), card(4, 0, 4, 4, 'group')]
    const r = arrange([page])
    expect(r.moved).toBe(0)
    expect(pos(at(r.pages[0] ?? [], 4))).toEqual([4, 0])
  })

  it('前面的页留白时，后面页的图标被提前填上（空洞推到末尾）', () => {
    const a = card(4, 0) /* 第 1 页：(0,0) 起留了 2 个 2×2 的空洞 */
    const b = card(0, 0) /* 第 2 页：本该排在前面的图标 */
    const r = arrange([[a], [b]])
    expect(r.moved).toBe(2)
    expect(pos(byId(r.pages[0] ?? [], a.id))).toEqual([0, 0])
    expect(pos(byId(r.pages[0] ?? [], b.id))).toEqual([2, 0]) /* 跨页补位 */
    expect(r.pages[1]).toEqual([]) /* 被搬空，交给调用方 prunePages 移除 */
  })

  it('前面的页铺满、后面页的图标无法前移时保持不动', () => {
    const x = card(0, 0)
    const r = arrange([fullPage(), [x]])
    expect(r.moved).toBe(0)
    expect(byId(r.pages[1] ?? [], x.id)).toBe(x)
  })

  it('没有可移动卡片（空布局 / 只剩组件）时无需整理', () => {
    expect(arrange([]).moved).toBe(0)
    const clock = card(0, 0, 4, 2, 'clock')
    expect(arrange([[clock]]).moved).toBe(0)
  })

  it('整理结果不产生任何重叠', () => {
    const page = [card(0, 0, 4, 2, 'clock'), card(6, 0), card(0, 4, 4, 4, 'group'), card(8, 0), card(4, 0)]
    const pages = arrange([page, [card(0, 6)]]).pages
    for (const items of pages) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          expect(overlaps(at(items, i), at(items, j))).toBe(false)
        }
      }
    }
  })
})

describe('arrangePages：删除组件后的自动整理（组件也参与补位）', () => {
  const card = (id: string, c: number, r: number, w = 2, h = 2, t: WidgetKind = 'icon'): GridItem =>
    ({ id, c, r, w, h, t, config: {} })
  const pos = (x: GridItem): [number, number] => [x.c, x.r]
  const arrangeAll = (pages: readonly GridItem[][]): { pages: GridItem[][]; moved: number } => {
    const r = arrangePages(pages, ARRANGE_ALL_KINDS)
    if (r === null) throw new Error('arrangePages 意外返回 null')
    return r
  }
  const at2 = (items: readonly GridItem[], i: number): GridItem => {
    const x = items[i]
    if (x === undefined) throw new Error(`缺少下标 ${i}`)
    return x
  }
  const byId = (items: readonly GridItem[], id: string): GridItem => {
    const x = items.find((v) => v.id === id)
    if (x === undefined) throw new Error(`缺少卡片 ${id}`)
    return x
  }

  it('两个可移动类型集合：图标集只含图标类，全集含组件', () => {
    expect([...ARRANGE_KINDS].sort()).toEqual(['folder', 'group', 'icon'])
    for (const t of ARRANGE_KINDS) expect(ARRANGE_ALL_KINDS.has(t)).toBe(true)
    for (const t of ['clock', 'cal', 'weather', 'todo', 'countdown', 'fav'] as WidgetKind[]) {
      expect(ARRANGE_ALL_KINDS.has(t)).toBe(true)
      expect(ARRANGE_KINDS.has(t)).toBe(false)
    }
  })

  it('删掉组件后：图标口径只挪图标、组件钉住；全集口径组件也前移', () => {
    const clock2 = card('c2', 4, 0, 4, 2, 'clock')
    const icon = card('i', 8, 0)
    /* 图标口径：组件不动，只有图标前移到组件左边的空位 */
    const onlyIcons = arrangePages([[clock2, icon]])
    expect(onlyIcons?.moved).toBe(1)
    expect(pos(byId(onlyIcons?.pages[0] ?? [], 'c2'))).toEqual([4, 0])
    expect(pos(byId(onlyIcons?.pages[0] ?? [], 'i'))).toEqual([0, 0])
    /* 全集口径：组件也前移到最靠前的空位，图标顺次补到组件右边 */
    const r = arrangeAll([[clock2, icon]])
    expect(r.moved).toBe(2)
    const page = r.pages[0] ?? []
    expect(pos(byId(page, 'c2'))).toEqual([0, 0])
    expect(pos(byId(page, 'i'))).toEqual([4, 0])
  })

  it('删组件后跨页补位：后面页的组件被提前填到前面页', () => {
    const icon = card('i', 4, 0)
    const clock = card('k', 0, 0, 4, 2, 'clock')
    /* 第 1 页原本的组件已删，只剩 (4,0) 的图标；第 2 页还有一张组件 */
    const r = arrangeAll([[icon], [clock]])
    expect(r.moved).toBe(2)
    expect(pos(byId(r.pages[0] ?? [], 'i'))).toEqual([0, 0])
    expect(pos(byId(r.pages[0] ?? [], 'k'))).toEqual([2, 0])
    expect(r.pages[1]).toEqual([]) /* 被搬空，交给调用方 prunePages 移除 */
  })

  it('本来紧凑时 moved=0，未移动的卡片返回原对象', () => {
    const a = card('a', 0, 0, 4, 2, 'clock')
    const b = card('b', 4, 0)
    const r = arrangeAll([[a, b]])
    expect(r.moved).toBe(0)
    expect(r.pages[0]?.[0]).toBe(a)
  })

  it('整理结果不产生任何重叠', () => {
    const page = [card('k', 0, 0, 4, 2, 'clock'), card('i', 6, 0), card('w', 8, 0, 4, 2, 'weather'), card('g', 0, 4, 4, 4, 'group')]
    const pages = arrangeAll([page, [card('t', 0, 6, 4, 2, 'todo')]]).pages
    for (const items of pages) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          expect(overlaps(at2(items, i), at2(items, j))).toBe(false)
        }
      }
    }
  })
})
