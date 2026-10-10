/**
 * v4 持久化与守卫单测
 * 覆盖：设置归一化 / 持久化文档解析（坏数据丢弃）/ 布局导出文档 / 快照恢复
 */
import { describe, expect, it } from 'vitest'
import { normalizeSettings, normalizeEngines, normalizeSkins, parseStoredDoc } from '../src/shared/guards'
import { DEFAULT_SETTINGS, BUILTIN_SKINS } from '../src/shared/defaults'
import { BUILTIN_ENGINES } from '../src/shared/types'
import { WIDGET_KINDS } from '../src/shared/widget-defs'
import { buildLayoutDoc, collectSnapshot, restoreSnapshot } from '../src/core/export'
import { DEFAULT_PAGES } from '../src/app/layout'

describe('设置归一化（normalizeSettings）', () => {
  it('空数据回退出厂默认', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS)
  })

  it('非法值逐字段回退，合法值钳制到区间', () => {
    const s = normalizeSettings({
      mode: 'privacy',
      searchWidth: 9999,          // 超上限 → 钳制到 1400
      dockCount: 'eight',         // 类型错 → 回退 8
      gAlpha: 0.5,
      glass: { card: 2 },         // 超上限 → 钳制 1，其余回退默认
      skinId: 'dark',
    })
    expect(s.mode).toBe('standard') // privacy 已移除，归位 standard
    expect(s.searchWidth).toBe(1400)
    expect(s.dockCount).toBe(DEFAULT_SETTINGS.dockCount)
    expect(s.gAlpha).toBe(0.5)
    expect(s.glass.card).toBe(1)
    expect(s.glass.menu).toBe(DEFAULT_SETTINGS.glass.menu)
    expect(s.skinId).toBe('dark')
  })

  it('透明度 12 项与毛玻璃 6 项各自独立归一化（解耦后互不牵连）', () => {
    const s = normalizeSettings({
      glass: { glyph: 0.8, line: 2 },   // line 超上限 → 钳制 1
      blur: { card: 99, dock: 4 },      // card 超上限 → 钳制 20
    })
    expect(s.glass.glyph).toBe(0.8)
    expect(s.glass.line).toBe(1)
    expect(s.glass.clock).toBe(DEFAULT_SETTINGS.glass.clock) // 未给的新项回退默认 0
    expect(s.blur.card).toBe(20)
    expect(s.blur.dock).toBe(4)
    expect(s.blur.menu).toBe(DEFAULT_SETTINGS.blur.menu)
  })

  it('旧文档没有 blur 字段时，毛玻璃回退出厂默认、透明度照旧读取', () => {
    const s = normalizeSettings({ glass: { card: 0.6, dock: 0.7 } })
    expect(s.glass.card).toBe(0.6)          // 老值原样保留，外观不发生跳变
    expect(s.glass.dock).toBe(0.7)
    expect(s.glass.glyph).toBe(0)
    expect(s.blur).toEqual(DEFAULT_SETTINGS.blur)
  })

  it('wallSources 保留合法来源清单，坏项丢弃；缺失回退空清单', () => {
    const s = normalizeSettings({
      wallSources: [
        { id: 'a', kind: 'wallhaven', name: 'Wallhaven', apiBase: 'https://wallhaven.cc/api/v1' },
        { id: 'b', kind: 'ftp', name: 'bad', apiBase: 'https://x.com' },
        { id: 'c', kind: 'picsum', name: '', apiBase: 'https://picsum.photos' },
        { id: 'd', kind: 'picsum', name: 'Picsum', apiBase: 'not-a-url' },
        'bad',
      ],
    })
    expect(s.wallSources).toEqual([{ id: 'a', kind: 'wallhaven', name: 'Wallhaven', apiBase: 'https://wallhaven.cc/api/v1', enabled: true }])
    expect(normalizeSettings({}).wallSources).toEqual(DEFAULT_SETTINGS.wallSources)
  })

  it('内置皮肤不再携带配套壁纸字段（内置壁纸已移除）', () => {
    expect(BUILTIN_SKINS.some((sk) => 'wall' in sk)).toBe(false)
  })

  it('搜索框四项：占位文字 / 隐藏引擎图标 / 图标点击行为 / 历史条数', () => {
    const s = normalizeSettings({
      searchPlaceholder: '搜点什么…',
      hideEngineIco: true,
      engineIcoAct: 'cycle',
      historyLimit: 99,          // 超上限 → 钳制 20
    })
    expect(s.searchPlaceholder).toBe('搜点什么…')
    expect(s.hideEngineIco).toBe(true)
    expect(s.engineIcoAct).toBe('cycle')
    expect(s.historyLimit).toBe(20)
    /* 坏值：非枚举回退出厂 panel、条数非数字回退出厂 8、占位文字类型错回退空串 */
    const bad = normalizeSettings({ engineIcoAct: 'nope', historyLimit: 'many', searchPlaceholder: 42, hideEngineIco: 'yes' })
    expect(bad.engineIcoAct).toBe('panel')
    expect(bad.historyLimit).toBe(DEFAULT_SETTINGS.historyLimit)
    expect(bad.searchPlaceholder).toBe('')
    expect(bad.hideEngineIco).toBe(DEFAULT_SETTINGS.hideEngineIco)
  })

  it('dockApps 保留合法 {name,url} 清单，坏项丢弃（旧版品牌名字符串一并清空）', () => {
    const s = normalizeSettings({ dockApps: [{ name: '知乎', url: 'https://www.zhihu.com' }, 42, { name: '', url: 'https://x.com' }, null, { name: 'GitHub', url: 'https://github.com' }] })
    expect(s.dockApps).toEqual([{ name: '知乎', url: 'https://www.zhihu.com' }, { name: 'GitHub', url: 'https://github.com' }])
    expect(normalizeSettings({ dockApps: ['知乎', 'GitHub'] }).dockApps).toEqual([]) // 旧字符串数据不属于新模型，清空
    expect(normalizeSettings({ dockApps: 'bad' }).dockApps).toEqual(DEFAULT_SETTINGS.dockApps)
    expect(normalizeSettings(null).dockApps).toEqual(DEFAULT_SETTINGS.dockApps)
  })
})

describe('引擎与皮肤归一化', () => {
  it('引擎缺字段丢弃', () => {
    expect(normalizeEngines([BUILTIN_ENGINES[0], { id: 'x' }, 'bad'])).toHaveLength(1)
  })
  it('皮肤全部坏数据时回退内置六套', () => {
    expect(normalizeSkins([{ bad: 1 }]).map((s) => s.id)).toEqual(['classic', 'glass', 'dark', 'purple', 'dawn', 'teal'])
  })
  it('内置皮肤归一化无损', () => {
    const out = normalizeSkins(BUILTIN_SKINS)
    expect(out).toHaveLength(6)
    expect(out[0]?.tokens['--card-bg']).toBe('#ffffff')
    expect(out.map((s) => s.id)).toEqual(['classic', 'glass', 'dark', 'purple', 'dawn', 'teal'])
  })
})

describe('持久化文档解析（parseStoredDoc）', () => {
  const doc = () => ({
    v: 3 as const,
    settings: DEFAULT_SETTINGS,
    pages: DEFAULT_PAGES,
    engines: BUILTIN_ENGINES,
    skins: BUILTIN_SKINS,
    history: ['a', 'b'],
    welcomed: true,
    backupTime: null,
  })

  it('完整文档解析后字段保留', () => {
    const out = parseStoredDoc(doc(), WIDGET_KINDS)
    expect(out).not.toBeNull()
    expect(out?.v).toBe(3)
    expect(out?.welcomed).toBe(true)
    expect(out?.pages).toHaveLength(DEFAULT_PAGES.length)
  })

  it('v2 双套旧文档自动合并：隐私页在前为基准，标准页卡片追加', () => {
    const old = {
      v: 2,
      settings: { ...DEFAULT_SETTINGS, mode: 'privacy' as const },
      pages: {
        standard: [[{ id: 's1', c: 0, r: 0, w: 2, h: 2, t: 'icon', config: { label: '标准图标' } }]],
        privacy: [[{ id: 'p1', c: 0, r: 0, w: 2, h: 2, t: 'clock', config: { label: '隐私时钟' } }]],
      },
      engines: BUILTIN_ENGINES,
      skins: BUILTIN_SKINS,
      history: [],
      user: { email: 'me@thrilled.dev' },
      welcomed: true,
      backupTime: null,
    }
    const out = parseStoredDoc(old, WIDGET_KINDS)
    expect(out?.v).toBe(3)
    expect(out?.pages).toHaveLength(2)
    expect(out?.pages[0]?.[0]?.id).toBe('p1')
    expect(out?.pages[1]?.[0]?.id).toBe('s1')
    expect(out?.settings.mode).toBe('standard')
  })

  it('缺布局 / 缺 pages 返回 null（调用方重新种入）', () => {
    expect(parseStoredDoc({ pages: null }, WIDGET_KINDS)).toBeNull()
    expect(parseStoredDoc({ pages: { standard: [], privacy: [] } }, WIDGET_KINDS)).toBeNull()
    expect(parseStoredDoc('x', WIDGET_KINDS)).toBeNull()
  })

  it('卡片未知类型被丢弃，同页合法卡片保留', () => {
    const d = doc()
    d.pages = [[
      { id: 'a', c: 0, r: 0, w: 2, h: 2, t: 'hacker' as unknown as 'icon', config: {} },
      { id: 'b', c: 2, r: 0, w: 2, h: 2, t: 'icon', config: {} },
    ]]
    const out = parseStoredDoc(d, WIDGET_KINDS)
    expect(out?.pages[0]).toHaveLength(1)
    expect(out?.pages[0]?.[0]?.id).toBe('b')
  })

  it('整份布局全坏 → 返回 null（调用方重新种入出厂布局）', () => {
    const d = doc()
    d.pages = [[{ id: 'a', c: 0, r: 0, w: 2, h: 2, t: 'hacker' as unknown as 'icon', config: {} }]]
    expect(parseStoredDoc(d, WIDGET_KINDS)).toBeNull()
  })
})

describe('导出 / 快照（core/export）', () => {
  it('布局导出文档形状符合 01 §5.1（单套 pages）', () => {
    const doc = buildLayoutDoc(DEFAULT_PAGES)
    expect(Object.keys(doc).sort()).toEqual(['app', 'exportedAt', 'pages', 'v'])
    expect(doc.v).toBe(4)
    expect(doc.app).toBe('Thrilled')
    expect(doc.pages).toHaveLength(DEFAULT_PAGES.length)
  })

  it('快照收集 → 恢复往返无损', () => {
    const stored = {
      v: 3 as const,
      settings: DEFAULT_SETTINGS,
      pages: DEFAULT_PAGES,
      engines: [...BUILTIN_ENGINES],
      skins: [...BUILTIN_SKINS],
      history: ['x'],
      welcomed: true,
      backupTime: '2026-09-27 12:00',
    }
    const snap = collectSnapshot(stored)
    expect(snap.app).toBe('Thrilled')
    const out = restoreSnapshot(snap)
    expect(out).not.toBeNull()
    expect(out?.backupTime).toBe('2026-09-27 12:00')
    expect(out?.pages).toHaveLength(DEFAULT_PAGES.length)
  })

  it('恢复非快照 / 坏结构返回 null', () => {
    expect(restoreSnapshot({ doc: 'bad' })).toBeNull()
    expect(restoreSnapshot(null)).toBeNull()
  })
})
