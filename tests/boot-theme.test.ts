/**
 * 启动底色记录单测（避免打开新标签页时先闪默认外观）
 * 覆盖：无记录返回空串 / 写入后可读回 / 空值不覆盖已有记录
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { applyBootBg, readBootBg, writeBootBg } from '../src/app/boot-theme'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
      clear: () => store.clear(),
    },
  })
})

describe('启动底色', () => {
  it('没有记录时返回空串（首帧退回 CSS 默认色）', () => {
    expect(readBootBg()).toBe('')
  })

  it('写入后能读回', () => {
    writeBootBg('#05070c')
    expect(readBootBg()).toBe('#05070c')
  })

  it('空值不覆盖已有记录', () => {
    writeBootBg('#ffffff')
    writeBootBg('')
    expect(readBootBg()).toBe('#ffffff')
  })

  it('applyBootBg 在无记录时不改样式，有记录时写入 documentElement 与 body', () => {
    const html = { style: { background: '' } }
    const body = { style: { background: '' } }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: html, body },
    })
    applyBootBg()
    expect(html.style.background).toBe('')
    writeBootBg('#05070c')
    applyBootBg()
    expect(html.style.background).toBe('#05070c')
    expect(body.style.background).toBe('#05070c')
  })
})
