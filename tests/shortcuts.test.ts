import { describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFS, comboOf, formatCombo, isBareCombo, normalizeShortcuts } from '../src/shared/shortcuts'

/** 造一个键盘事件（只取组合键用到的字段） */
const ev = (key: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  key,
  ctrlKey: mods.ctrl === true,
  altKey: mods.alt === true,
  shiftKey: mods.shift === true,
  metaKey: mods.meta === true,
})

describe('comboOf：事件 → 规范组合键', () => {
  it('字母统一大写、修饰键顺序固定为 Ctrl → Alt → Shift', () => {
    expect(comboOf(ev('e', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+E')
    expect(comboOf(ev('a', { shift: true, alt: true }))).toBe('Alt+Shift+A')
  })

  it('macOS 的 Cmd 归一到 Ctrl', () => {
    expect(comboOf(ev('k', { meta: true }))).toBe('Ctrl+K')
  })

  it('单按键与特殊键名归一化', () => {
    expect(comboOf(ev('/'))).toBe('/')
    expect(comboOf(ev(' '))).toBe('Space')
    expect(comboOf(ev('ArrowLeft'))).toBe('ArrowLeft')
    expect(comboOf(ev('Escape'))).toBe('Escape')
  })

  it('只按修饰键时返回 null（不构成组合键）', () => {
    for (const k of ['Control', 'Shift', 'Alt', 'Meta']) expect(comboOf(ev(k, { ctrl: true }))).toBeNull()
  })
})

describe('isBareCombo：是否需要「非输入状态」前提', () => {
  it('单按键为 true，含修饰键为 false，空串为 false', () => {
    expect(isBareCombo('ArrowLeft')).toBe(true)
    expect(isBareCombo('/')).toBe(true)
    expect(isBareCombo('Alt+M')).toBe(false)
    expect(isBareCombo('')).toBe(false)
  })
})

describe('formatCombo：展示文案', () => {
  it('方向键与 Esc 用符号 / 缩写，修饰键用 + 连接', () => {
    expect(formatCombo('ArrowLeft')).toBe('←')
    expect(formatCombo('Escape')).toBe('Esc')
    expect(formatCombo('Ctrl+Shift+E')).toBe('Ctrl + Shift + E')
    expect(formatCombo('Space')).toBe('空格')
  })
})

describe('normalizeShortcuts：设置归一化', () => {
  it('缺省回退出厂值，保留用户空串（主动清除）', () => {
    const out = normalizeShortcuts({ 'focus-search': '', 'page-next': 'Ctrl+J' })
    expect(out['focus-search']).toBe('')
    expect(out['page-next']).toBe('Ctrl+J')
    expect(out['page-prev']).toBe(DEFAULT_SHORTCUTS['page-prev'])
  })

  it('丢弃未知动作与非字符串值', () => {
    const out = normalizeShortcuts({ 'not-an-action': 'Ctrl+X', 'open-add': 42 })
    expect(Object.keys(out).sort()).toEqual(SHORTCUT_DEFS.map((d) => d.id).sort())
    expect(out['not-an-action']).toBeUndefined()
    expect(out['open-add']).toBe(DEFAULT_SHORTCUTS['open-add'])
  })

  it('非对象入参整体回退出厂值', () => {
    for (const bad of [null, undefined, 'x', 7]) {
      expect(normalizeShortcuts(bad)).toEqual({ ...DEFAULT_SHORTCUTS })
    }
  })
})

describe('出厂清单', () => {
  it('动作 id 唯一，且不再包含切换搜索引擎', () => {
    const ids = SHORTCUT_DEFS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(JSON.stringify(SHORTCUT_DEFS)).not.toContain('搜索引擎')
  })

  it('只有「关闭浮层」标记为输入状态下也生效', () => {
    expect(SHORTCUT_DEFS.filter((d) => d.typing).map((d) => d.id)).toEqual(['close-overlay'])
  })
})
