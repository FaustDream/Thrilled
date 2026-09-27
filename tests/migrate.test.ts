/**
 * v3 迁移追加逻辑单测（appendIconPages）
 * 覆盖：出厂布局保留在前 / 迁移图标追加新页 / 与出厂图标去重 / 5 页上限
 */
import { describe, expect, it } from 'vitest'
import { appendIconPages } from '../src/core/migrate'
import { DEFAULT_PAGES } from '../src/app/layout'

describe('appendIconPages', () => {
  it('出厂布局在前，迁移图标追加为新页', () => {
    const { pages, appended } = appendIconPages(DEFAULT_PAGES.standard, [
      { label: 'Codex', url: 'https://codex.example.com' },
      { label: '云笺', url: 'https://yunjian.example.com' },
    ])
    expect(pages.slice(0, 2)).toEqual(DEFAULT_PAGES.standard)
    expect(pages).toHaveLength(3)
    expect(appended).toBe(2)
    const last = pages[2] ?? []
    expect(last.map((it) => it.config['label'])).toEqual(['Codex', '云笺'])
    expect(last[0]).toMatchObject({ t: 'icon', w: 2, h: 2, c: 0, r: 0 })
  })

  it('与出厂已有的网址图标去重（label|url 相同不追加）', () => {
    const { pages, appended } = appendIconPages(DEFAULT_PAGES.standard, [
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
    const { pages, appended } = appendIconPages(DEFAULT_PAGES.standard, many)
    expect(pages).toHaveLength(5)
    expect(appended).toBe(3 * 60)
  })
})
