/**
 * Dock 快捷方式纯逻辑单测（去重 / 上限 / 失败文案）
 * 覆盖：添加抽屉「自定义 / 快捷方式」页签与空白处右键「添加到 Dock 快捷方式」共用的 dockAppsWith
 */
import { describe, expect, it } from 'vitest'
import { dockAppsWith, dockFailText } from '../src/shared/dock'
import type { DockApp } from '../src/shared/types'

const APP: DockApp = { name: '百度', url: 'https://baidu.com/' }

describe('dockAppsWith：追加快捷方式', () => {
  it('未重复且未满额时追加到末尾', () => {
    expect(dockAppsWith([], 8, '百度', 'https://baidu.com/')).toEqual({ ok: true, apps: [APP] })
  })

  it('url 全等视为重复（不改动原数组）', () => {
    const apps = [APP]
    expect(dockAppsWith(apps, 8, '百度', 'https://baidu.com/')).toEqual({ ok: false, reason: 'dup' })
    expect(apps).toEqual([APP])
  })

  it('达到 dockCount 视为满额，且重复判定优先', () => {
    const full: DockApp[] = Array.from({ length: 4 }, (_, i) => ({ name: `s${i}`, url: `https://s${i}.com/` }))
    expect(dockAppsWith(full, 4, '新站', 'https://new.com/')).toEqual({ ok: false, reason: 'full' })
    expect(dockAppsWith(full, 4, 's0', 'https://s0.com/')).toEqual({ ok: false, reason: 'dup' })
  })
})

describe('dockFailText：失败提示文案', () => {
  it('重复 / 满额各自成句', () => {
    expect(dockFailText('dup', 8)).toBe('该站点已在 Dock 中')
    expect(dockFailText('full', 6)).toBe('Dock 最多 6 个快捷方式，请先移除一些')
  })
})
