/**
 * v3 迁移单测（appendIconPages / applyV3EngineSet）
 * 覆盖：出厂布局保留在前 / 迁移图标追加新页 / 与出厂图标去重 / 5 页上限 / 存量引擎恢复
 */
import { describe, expect, it } from 'vitest'
import { appendIconPages, applyV3EngineSet } from '../src/core/migrate'
import { BUILTIN_ENGINES } from '../src/shared/types'
import { SAMPLE_PAGES } from '../src/app/layout'

describe('appendIconPages', () => {
  it('出厂布局在前，迁移图标追加为新页', () => {
    const { pages, appended } = appendIconPages(SAMPLE_PAGES, [
      { label: 'Codex', url: 'https://codex.example.com' },
      { label: '云笺', url: 'https://yunjian.example.com' },
    ])
    expect(pages.slice(0, 3)).toEqual(SAMPLE_PAGES)
    expect(pages).toHaveLength(4) // 出厂 3 页 + 迁移图标 1 页
    expect(appended).toBe(2)
    const last = pages[pages.length - 1] ?? []
    expect(last.map((it) => it.config['label'])).toEqual(['Codex', '云笺'])
    expect(last[0]).toMatchObject({ t: 'icon', w: 2, h: 2, c: 0, r: 0 })
  })

  it('与出厂已有的网址图标去重（label|url 相同不追加）', () => {
    const { pages, appended } = appendIconPages(SAMPLE_PAGES, [
      { label: 'GitHub', url: 'https://github.com' },
      { label: '我的站点', url: 'https://mine.example.com' },
    ])
    expect(appended).toBe(1)
    const last = pages[pages.length - 1] ?? []
    expect(last.some((it) => it.config['label'] === 'GitHub')).toBe(false)
  })

  it('最多 5 页：放不下的迁移图标丢弃', () => {
    // 一页 240 格可放 60 个 2×2 图标；4 页余量 = 240 个；给 500 个应封顶
    const many = Array.from({ length: 500 }, (_, i) => ({ label: `站${i}`, url: `https://s${i}.example.com` }))
    const { pages, appended } = appendIconPages(SAMPLE_PAGES, many)
    expect(pages).toHaveLength(5)
    expect(appended).toBe(2 * 60)
  })
})

describe('applyV3EngineSet（存量引擎恢复为 v3 设置的那套）', () => {
  it('按 v3 order 裁剪重排，v3 独有引擎注入 v3 定义，当前引擎恢复 v3 选择', () => {
    const prefs = { order: ['github', 'baidu', 'bilibili', 'google'], current: 'github' }
    const next = applyV3EngineSet(BUILTIN_ENGINES, 'baidu', prefs)
    expect(next.engines.map((e) => e.id)).toEqual(['github', 'baidu', 'bilibili', 'google'])
    expect(next.engines.find((e) => e.id === 'github')).toMatchObject({ name: 'GitHub', base: 'https://github.com/search?q=' })
    expect(next.engines.find((e) => e.id === 'baidu')?.name).toBe('百度')
    expect(next.engineId).toBe('github')
  })

  it('v4 内置但 v3 未设置的引擎被移除；用户新加的自定义引擎保留在末尾', () => {
    const custom = { id: 'cabc', name: '我的引擎', color: '#000000', glyph: '我', base: 'https://x.example.com/?q=' }
    const next = applyV3EngineSet([...BUILTIN_ENGINES, custom], 'baidu', { order: ['baidu'], current: '' })
    expect(next.engines.map((e) => e.id)).toEqual(['baidu', 'cabc'])
    expect(next.engineId).toBe('baidu')
  })

  it('v3 当前引擎不在恢复清单时回退现有 engineId，再不行回退第一个', () => {
    const next = applyV3EngineSet(BUILTIN_ENGINES, 'brave', { order: ['baidu', 'bing'], current: '' })
    expect(next.engines.map((e) => e.id)).toEqual(['baidu', 'bing'])
    expect(next.engineId).toBe('baidu')
    const keep = applyV3EngineSet(BUILTIN_ENGINES, 'bing', { order: ['baidu', 'bing'], current: '' })
    expect(keep.engineId).toBe('bing')
  })

  it('order 里的未知 id 跳过、重复 id 去重；裁剪后 id 序列不变则 engineId 不动', () => {
    const next = applyV3EngineSet(BUILTIN_ENGINES, 'baidu', { order: ['baidu', 'ghost', 'baidu'], current: '' })
    expect(next.engines.map((e) => e.id)).toEqual(['baidu'])
    expect(next.engineId).toBe('baidu')
  })
})
