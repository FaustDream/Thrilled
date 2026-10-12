/**
 * 内容模型与网格算法单测（v4）
 * 覆盖：出厂布局满足冻结的栅格规范 / 网格空位查找 / 重叠判定 / 导入文档归一化 / 图标页合并
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGES, isIconOnlyPage, mergeIconPages, normPages, placedKindsOf, prunePages, uid } from '../src/app/layout'
import { CELL, COLS, INSET, ROWS, SIZES, findSlot, findSlotNear, groupBoxOf, groupFits, groupGrid, isLegalSize, overlaps } from '../src/shared/grid'
import {
  COMMON_KINDS, WIDGET_DEFS, WIDGET_GROUPS, WIDGET_GROUPS_ORDER, WIDGET_LIST,
  boxOfUnits, maxSizeOf, minSizeOf, naturalBoxOf, naturalMinOf, placeSizeOf, sizeAllowed, sizeAllowedFor, widgetsInGroup,
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

  it('类型分组取件拼起来覆盖全部组件（无遗漏、无重复）', () => {
    const grouped = WIDGET_GROUPS_ORDER.filter((g) => g !== '常用').flatMap((g) => widgetsInGroup(g).map((w) => w.t))
    expect([...grouped].sort()).toEqual(Object.keys(WIDGET_DEFS).sort())
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
    expect(naturalMinOf('fav')).toBe(98)      /* 2×4：98 × 246 */
    expect(naturalMinOf('countdown')).toBe(246) /* 8×4：542 × 246 */
    expect(naturalMinOf('clock')).toBe(246)    /* 4×4 */
    expect(naturalMinOf('icon')).toBe(98)      /* 2×2 */
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
    /* 8×2：卡宽 8×74−50 = 542，减去容器内距 30 → 512；高度 98−30 = 68（标签条带已随标签一起移除） */
    expect(groupBoxOf(8, 2)).toEqual({ w: 512, h: 68 })
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
describe('已添加判定（placedKindsOf：组件库与右键「添加组件」共用）', () => {
  const card = (t: GridItem['t']): GridItem => ({ id: uid(), c: 0, r: 0, w: 4, h: 2, t, config: {} })

  it('跨页收集类型，同类型多实例只算一个', () => {
    const pages = [[card('icon'), card('icon')], [card('clock')]]
    expect([...placedKindsOf(pages)].sort()).toEqual(['clock', 'icon'])
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
