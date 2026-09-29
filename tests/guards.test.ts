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

  it('dockApps 保留合法品牌名清单，坏数据回退默认', () => {
    const s = normalizeSettings({ dockApps: ['知乎', 42, 'GitHub', null] })
    expect(s.dockApps).toEqual(['知乎', 'GitHub'])
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
