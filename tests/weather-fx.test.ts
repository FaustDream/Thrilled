import { describe, expect, it } from 'vitest'
import { isDayAt, weatherFxOf } from '../src/core/weather-fx'

describe('weatherFxOf · 现象为主轴', () => {
  it('晴 / 大部晴 → clear，昼夜只改 night 标记', () => {
    expect(weatherFxOf(0, 22, true)).toMatchObject({ kind: 'clear', night: false })
    expect(weatherFxOf(1, 22, false)).toMatchObject({ kind: 'clear', night: true })
  })

  it('多云 / 阴 / 雾各归各的动画', () => {
    expect(weatherFxOf(2, 20, true).kind).toBe('partly')
    expect(weatherFxOf(3, 20, true).kind).toBe('cloudy')
    expect(weatherFxOf(45, 8, true).kind).toBe('fog')
    expect(weatherFxOf(48, 2, true).kind).toBe('fog')
  })
})

describe('weatherFxOf · 温度决定降水形态', () => {
  it('同一雨码：常温下雨，≤ 2°C 转雪', () => {
    expect(weatherFxOf(61, 12, true).kind).toBe('rain')
    expect(weatherFxOf(61, 2, true).kind).toBe('snow')
    expect(weatherFxOf(61, -3, true).kind).toBe('snow')
  })

  it('雪码始终是雪，不受高温影响', () => {
    expect(weatherFxOf(71, 28, true).kind).toBe('snow')
  })

  it('雨量 / 雪量映射强度 1–3', () => {
    expect(weatherFxOf(51, 12, true).intensity).toBe(1)
    expect(weatherFxOf(63, 12, true).intensity).toBe(2)
    expect(weatherFxOf(65, 12, true).intensity).toBe(3)
    expect(weatherFxOf(75, -2, true).intensity).toBe(3)
  })
})

describe('weatherFxOf · 雷暴与冷热附加层', () => {
  it('雷暴码优先于雨，冰雹雷暴强度更高', () => {
    expect(weatherFxOf(95, 20, true)).toMatchObject({ kind: 'thunder', intensity: 2 })
    expect(weatherFxOf(99, 20, true).intensity).toBe(3)
  })

  it('≥ 35°C 标记 hot，≤ 0°C 标记 cold；雪天不叠结霜', () => {
    expect(weatherFxOf(0, 36, true).hot).toBe(true)
    expect(weatherFxOf(0, 30, true).hot).toBe(false)
    expect(weatherFxOf(0, -1, true).cold).toBe(true)
    expect(weatherFxOf(71, -5, true).cold).toBe(false)
  })

  it('未知码回退到多云，不抛错', () => {
    expect(weatherFxOf(1234, 18, true)).toMatchObject({ kind: 'cloudy', intensity: 1 })
  })

  it('昼夜兜底按 6–18 点判断', () => {
    expect(isDayAt(5)).toBe(false)
    expect(isDayAt(6)).toBe(true)
    expect(isDayAt(18)).toBe(false)
  })
})
