/**
 * Dock 快捷方式纯逻辑单测（去重 / 失败文案 / 三档尺寸）
 * 覆盖：添加抽屉「自定义 / 快捷方式」页签与空白处右键「添加到 Dock 快捷方式」共用的 dockAppsWith
 */
import { describe, expect, it } from 'vitest'
import { DOCK_DUP_TEXT, DOCK_ICON_METRICS, DOCK_ICON_OPTIONS, dockAppsWith } from '../src/shared/dock'
import type { DockApp } from '../src/shared/types'

const APP: DockApp = { name: '百度', url: 'https://baidu.com/' }

describe('dockAppsWith：追加快捷方式', () => {
  it('未重复时追加到末尾（数量不设上限）', () => {
    expect(dockAppsWith([], '百度', 'https://baidu.com/')).toEqual({ ok: true, apps: [APP] })
  })

  it('url 全等视为重复（不改动原数组）', () => {
    const apps = [APP]
    expect(dockAppsWith(apps, '百度', 'https://baidu.com/')).toEqual({ ok: false, reason: 'dup' })
    expect(apps).toEqual([APP])
  })

  it('已有 30 个仍可继续追加', () => {
    const many: DockApp[] = Array.from({ length: 30 }, (_, i) => ({ name: `s${i}`, url: `https://s${i}.com/` }))
    const r = dockAppsWith(many, '新站', 'https://new.com/')
    expect(r.ok).toBe(true)
    expect(r.ok && r.apps).toHaveLength(31)
  })
})

describe('DOCK_DUP_TEXT / 三档尺寸', () => {
  it('重复提示成句', () => {
    expect(DOCK_DUP_TEXT).toBe('该站点已在 Dock 中')
  })

  it('三档尺寸依次变大，且小 / 中 / 大三档齐全', () => {
    expect(DOCK_ICON_OPTIONS.map((o) => o.k)).toEqual(['sm', 'md', 'lg'])
    expect(DOCK_ICON_METRICS.sm.box).toBeLessThan(DOCK_ICON_METRICS.md.box)
    expect(DOCK_ICON_METRICS.md.box).toBeLessThan(DOCK_ICON_METRICS.lg.box)
    expect(DOCK_ICON_METRICS.lg.item).toBeLessThanOrEqual(96)
  })
})
