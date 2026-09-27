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
    expect(s.mode).toBe('privacy')
    expect(s.searchWidth).toBe(1400)
    expect(s.dockCount).toBe(DEFAULT_SETTINGS.dockCount)
    expect(s.gAlpha).toBe(0.5)
    expect(s.glass.card).toBe(1)
    expect(s.glass.menu).toBe(DEFAULT_SETTINGS.glass.menu)
    expect(s.skinId).toBe('dark')
  })
})

describe('引擎与皮肤归一化', () => {
  it('引擎缺字段丢弃', () => {
    expect(normalizeEngines([BUILTIN_ENGINES[0], { id: 'x' }, 'bad'])).toHaveLength(1)
  })
  it('皮肤全部坏数据时回退内置四套', () => {
    expect(normalizeSkins([{ bad: 1 }]).map((s) => s.id)).toEqual(['classic', 'glass', 'dark', 'purple'])
  })
  it('内置皮肤归一化无损', () => {
    const out = normalizeSkins(BUILTIN_SKINS)
    expect(out).toHaveLength(4)
    expect(out[0]?.tokens['--card-bg']).toBe('#ffffff')
  })
})

describe('持久化文档解析（parseStoredDoc）', () => {
  const doc = () => ({
    v: 2,
    settings: DEFAULT_SETTINGS,
    pages: { standard: DEFAULT_PAGES.standard, privacy: DEFAULT_PAGES.privacy },
    engines: BUILTIN_ENGINES,
    skins: BUILTIN_SKINS,
    history: ['a', 'b'],
    user: { email: 'me@thrilled.dev' },
    welcomed: true,
    backupTime: null,
  })

  it('完整文档解析后字段保留', () => {
    const out = parseStoredDoc(doc(), WIDGET_KINDS)
    expect(out).not.toBeNull()
    expect(out?.user?.email).toBe('me@thrilled.dev')
    expect(out?.welcomed).toBe(true)
    expect(out?.pages.standard).toHaveLength(2)
  })

  it('缺布局 / 缺 pages 返回 null（调用方重新种入）', () => {
    expect(parseStoredDoc({ pages: null }, WIDGET_KINDS)).toBeNull()
    expect(parseStoredDoc({ pages: { standard: [], privacy: [] } }, WIDGET_KINDS)).toBeNull()
    expect(parseStoredDoc('x', WIDGET_KINDS)).toBeNull()
  })

  it('卡片未知类型被丢弃，同页合法卡片保留', () => {
    const d = doc()
    d.pages = {
      standard: [[
        { id: 'a', c: 0, r: 0, w: 2, h: 2, t: 'hacker' as unknown as 'icon', config: {} },
        { id: 'b', c: 2, r: 0, w: 2, h: 2, t: 'icon', config: {} },
      ]],
      privacy: [[{ id: 'c', c: 0, r: 0, w: 2, h: 2, t: 'icon', config: {} }]],
    }
    const out = parseStoredDoc(d, WIDGET_KINDS)
    expect(out?.pages.standard[0]).toHaveLength(1)
    expect(out?.pages.standard[0]?.[0]?.id).toBe('b')
    expect(out?.pages.privacy[0]).toHaveLength(1)
  })

  it('整份标准布局全坏 → 返回 null（调用方重新种入出厂布局）', () => {
    const d = doc()
    d.pages = {
      standard: [[{ id: 'a', c: 0, r: 0, w: 2, h: 2, t: 'hacker' as unknown as 'icon', config: {} }]],
      privacy: [[{ id: 'c', c: 0, r: 0, w: 2, h: 2, t: 'icon', config: {} }]],
    }
    expect(parseStoredDoc(d, WIDGET_KINDS)).toBeNull()
  })
})

describe('导出 / 快照（core/export）', () => {
  it('布局导出文档形状符合 01 §5.1', () => {
    const doc = buildLayoutDoc(DEFAULT_PAGES.standard, DEFAULT_PAGES.privacy)
    expect(Object.keys(doc).sort()).toEqual(['app', 'exportedAt', 'privacy', 'standard', 'v'])
    expect(doc.v).toBe(4)
    expect(doc.app).toBe('Thrilled')
  })

  it('快照收集 → 恢复往返无损', () => {
    const stored = {
      v: 2 as const,
      settings: DEFAULT_SETTINGS,
      pages: { standard: DEFAULT_PAGES.standard, privacy: DEFAULT_PAGES.privacy },
      engines: [...BUILTIN_ENGINES],
      skins: [...BUILTIN_SKINS],
      history: ['x'],
      user: null,
      welcomed: true,
      backupTime: '2026-09-27 12:00',
    }
    const snap = collectSnapshot(stored)
    expect(snap.app).toBe('Thrilled')
    const out = restoreSnapshot(snap)
    expect(out).not.toBeNull()
    expect(out?.backupTime).toBe('2026-09-27 12:00')
    expect(out?.pages.standard).toHaveLength(2)
  })

  it('恢复非快照 / 坏结构返回 null', () => {
    expect(restoreSnapshot({ doc: 'bad' })).toBeNull()
    expect(restoreSnapshot(null)).toBeNull()
  })
})
