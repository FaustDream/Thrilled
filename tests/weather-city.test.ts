/**
 * 天气城市搜索纯逻辑单测：候选去重与城市缓存键（搜索请求本身走真实网络，不在单测覆盖范围）
 */
import { describe, expect, it } from 'vitest'
import { cityKeyOf, dedupeHits } from '../src/core/weather'
import type { GeoHit } from '../src/core/weather'

const hit = (name: string, lat: number, lon: number, population = 0): GeoHit => ({
  name, admin1: '', country: '', lat, lon, population,
})

describe('dedupeHits：同地候选去重（坐标 0.1° 粒度）', () => {
  it('坐标四舍五入后相同的只留第一条', () => {
    const out = dedupeHits([hit('杭州', 30.29365, 120.16142), hit('杭州（重复）', 30.2937, 120.1614)])
    expect(out.map((h) => h.name)).toEqual(['杭州'])
  })

  it('同名但位置不同的候选都保留', () => {
    const out = dedupeHits([hit('杭州', 30.29365, 120.16142), hit('杭州', 30.06517, 102.19527)])
    expect(out.length).toBe(2)
  })
})

describe('cityKeyOf：城市天气缓存的稳定键', () => {
  it('坐标保留 3 位小数，微小差异不产生新键', () => {
    expect(cityKeyOf({ lat: 30.29365, lon: 120.16142 })).toBe('30.294,120.161')
    expect(cityKeyOf({ lat: 30.2937, lon: 120.1614 })).toBe('30.294,120.161')
  })
})
