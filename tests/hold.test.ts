import { describe, expect, it } from 'vitest'
import { HOLD_MS, HOLD_SLOP, holdVerdict } from '../src/shared/hold'

describe('holdVerdict：长按进入拖拽的判定（单击绝不让卡片动起来）', () => {
  it('按住不动：不足时长继续等，到点才进入拖拽', () => {
    expect(holdVerdict(0, 0, 0)).toBe('wait')
    expect(holdVerdict(HOLD_MS - 1, 0, 0)).toBe('wait')
    expect(holdVerdict(HOLD_MS, 0, 0)).toBe('arm')
    expect(holdVerdict(HOLD_MS + 1200, 0, 0)).toBe('arm')
  })

  it('容差之内的小抖动不算移动（鼠标点击抖动 / 手指按压漂移）', () => {
    expect(holdVerdict(120, HOLD_SLOP, -HOLD_SLOP)).toBe('wait')
    expect(holdVerdict(HOLD_MS - 1, 2, -3)).toBe('wait')
    expect(holdVerdict(HOLD_MS, HOLD_SLOP, 0)).toBe('arm')
  })

  it('越过容差即作废：不论按住多久', () => {
    expect(holdVerdict(0, HOLD_SLOP + 1, 0)).toBe('abort')
    expect(holdVerdict(300, 0, -(HOLD_SLOP + 1))).toBe('abort')
    expect(holdVerdict(HOLD_MS + 500, 30, 30)).toBe('abort')
  })
})
