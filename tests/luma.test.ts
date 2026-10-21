import { describe, expect, it } from 'vitest'
import { HALO_MAX, HALO_MIN, TONE_TARGET, contrast, coverFix, fixForInk, hexLum, hexRgb, overLum, pickInk, readableInk, relLum, rgbHex } from '../src/shared/luma'
import { boxUv, gridTone, toneAt, visibleWindow, type ToneGrid } from '../src/core/walltone'

const WHITE = 1
const INK = 0.0134 /* #12161f：近黑 */

describe('luma：亮度与对比度', () => {
  it('相对亮度取到端点的标准值', () => {
    expect(relLum(0, 0, 0)).toBeCloseTo(0, 5)
    expect(relLum(255, 255, 255)).toBeCloseTo(1, 5)
    /* 绿色权重最高、蓝色最低（人眼灵敏度） */
    expect(relLum(0, 255, 0)).toBeGreaterThan(relLum(255, 0, 0))
    expect(relLum(255, 0, 0)).toBeGreaterThan(relLum(0, 0, 255))
  })

  it('对比度：黑白 21:1，同色 1:1，且与顺序无关', () => {
    expect(contrast(1, 0)).toBeCloseTo(21, 4)
    expect(contrast(0.5, 0.5)).toBeCloseTo(1, 6)
    expect(contrast(0.2, 0.8)).toBeCloseTo(contrast(0.8, 0.2), 6)
  })

  it('hexLum 认 #rgb / #rrggbb，其它写法返回 null', () => {
    expect(hexLum('#fff')).toBeCloseTo(1, 5)
    expect(hexLum('#000000')).toBeCloseTo(0, 5)
    expect(hexLum('#FFFFFF')).toBeCloseTo(1, 5)
    expect(hexLum('#ff0000')).toBeCloseTo(relLum(255, 0, 0), 6)
    expect(hexLum('rgba(0,0,0,.5)')).toBeNull()
    expect(hexLum('white')).toBeNull()
    expect(hexLum('#fff ')).toBeCloseTo(1, 5)
  })

  it('overLum：alpha 夹在 0–1，端点取到两端', () => {
    expect(overLum(0.8, 0, 0)).toBeCloseTo(0.8, 6)
    expect(overLum(0.8, 0, 1)).toBeCloseTo(0, 6)
    expect(overLum(0.8, 0, 0.5)).toBeCloseTo(0.4, 6)
    expect(overLum(0.8, 0, 5)).toBeCloseTo(0, 6)
  })
})

describe('pickInk：该用浅墨还是深墨', () => {
  it('亮背景选深墨、暗背景选浅墨（这就是「自动对比」的核心一步）', () => {
    expect(pickInk(0.9, WHITE, INK)).toBe(false)
    expect(pickInk(0.05, WHITE, INK)).toBe(true)
    expect(pickInk(1, WHITE, INK)).toBe(false)
    expect(pickInk(0, WHITE, INK)).toBe(true)
  })

  it('两者等价的亮度附近不来回跳：低于它用浅墨、高于它用深墨', () => {
    /* 解 1.05/(t+0.05) = (t+0.05)/0.0634 → t ≈ 0.208（此处两种墨的对比度都是 4.07） */
    const t = 0.208
    expect(contrast(WHITE, t)).toBeCloseTo(contrast(INK, t), 1)
    expect(pickInk(t - 0.05, WHITE, INK)).toBe(true)
    expect(pickInk(t + 0.05, WHITE, INK)).toBe(false)
  })
})

describe('fixForInk：墨色定了之后还要补多少', () => {
  it('浅墨压暗壁纸：护罩为 0，只留最低限度的光晕', () => {
    const fix = fixForInk(0.05, 0.1, WHITE)
    expect(fix.scrim).toBe(0)
    expect(fix.halo).toBe(HALO_MIN)
  })

  it('深墨压亮壁纸（翻过墨色之后）：同样不需要护罩', () => {
    const fix = fixForInk(0.9, 0.95, INK)
    expect(fix.scrim).toBe(0)
    expect(fix.halo).toBe(HALO_MIN)
  })

  it('中灰度是最难的：两种墨都不到 3:1 时才垫护罩，且解到刚好跨线', () => {
    /* 亮度 0.45：浅墨对比度 1.05/0.5=2.1，深墨 0.5/0.063=7.9 —— 深墨够用，故这里改用更难的 0.3 */
    const tone = 0.3
    expect(contrast(WHITE, tone)).toBeLessThan(TONE_TARGET)
    expect(contrast(INK, tone)).toBeGreaterThan(TONE_TARGET)
    const fix = fixForInk(tone, tone, WHITE)
    expect(fix.scrim).toBeGreaterThan(0)
    expect(contrast(WHITE, overLum(tone, 0, fix.scrim))).toBeGreaterThanOrEqual(TONE_TARGET - 0.001)
    /* 少一档就不达标——取的是最小可行值，不是固定值 */
    expect(contrast(WHITE, overLum(tone, 0, fix.scrim - 0.03))).toBeLessThan(TONE_TARGET)
  })

  it('最坏亮度决定光晕：平均很暗但一角白云也要能兜住', () => {
    const calm = fixForInk(0.1, 0.12, WHITE)
    const risky = fixForInk(0.1, 0.95, WHITE)
    expect(risky.halo).toBeGreaterThan(calm.halo)
    expect(risky.halo).toBeLessThanOrEqual(HALO_MAX)
  })

  it('纯白壁纸 + 浅墨：护罩封顶，不会无限加深；光晕到上限', () => {
    const fix = fixForInk(1, 1, WHITE)
    expect(fix.scrim).toBeLessThanOrEqual(0.62)
    expect(fix.scrim).toBeGreaterThan(0.5)
    expect(fix.halo).toBeGreaterThanOrEqual(HALO_MIN)
    expect(fix.halo).toBeLessThanOrEqual(HALO_MAX)
  })

  it('深墨压在近白背景：几乎不用垫，光晕也在下限', () => {
    expect(fixForInk(0.95, 0.98, INK).scrim).toBe(0)
    expect(fixForInk(0.95, 0.98, INK).halo).toBeGreaterThanOrEqual(HALO_MIN)
  })
})

describe('coverFix：壁纸越花，遮罩加成越多', () => {
  it('均匀壁纸不加成（纯色 / 天空）', () => {
    expect(coverFix(0.35, 0.3, 0.4)).toBe(0)
  })

  it('明暗交错（人物 + 天空 + 反光）才加成，且有上限', () => {
    const mixed = coverFix(0.5, 0.1, 0.92)
    expect(mixed).toBeGreaterThan(0)
    expect(mixed).toBeLessThanOrEqual(0.26)
    /* 极差更大 → 加成更多 */
    expect(coverFix(0.5, 0.0, 1.0)).toBeGreaterThan(mixed)
  })

  it('整体很亮时补一点点，避免白壁纸把 UI 冲淡', () => {
    const bright = coverFix(0.8, 0.7, 0.9)
    expect(bright).toBeGreaterThan(0)
    expect(bright).toBeLessThanOrEqual(0.06)
  })
})

describe('walltone：cover 窗口与局部取样', () => {
  it('可见窗口与 object-position 一致：0% 贴边、50% 居中、100% 贴另一侧', () => {
    /* 图比屏宽 → 裁左右：4:1 的图放进 1:1 的屏，窗口宽 = 高 */
    const left = visibleWindow(400, 100, 1, 0, 50)
    const center = visibleWindow(400, 100, 1, 50, 50)
    const right = visibleWindow(400, 100, 1, 100, 50)
    expect(left).toMatchObject({ ww: 100, wh: 100, wx: 0, wy: 0 })
    expect(center.wx).toBe(150)
    expect(right.wx).toBe(300)
  })

  it('图比屏高 → 改为裁上下，X 不再滑动', () => {
    const top = visibleWindow(100, 400, 1, 50, 0)
    const bottom = visibleWindow(100, 400, 1, 50, 100)
    expect(top).toMatchObject({ ww: 100, wh: 100, wx: 0, wy: 0 })
    expect(bottom.wy).toBe(300)
  })

  it('舞台矩形 → UV：整体缩放后仍在 0–1，越界被夹住', () => {
    /* 1920×945 的舞台在 0.5 缩放下只占 960×472.5；视口 1280×720 */
    const uv = boxUv({ x: 0, y: 0, w: 960, h: 472.5 }, 0.5, 1280, 720)
    expect(uv.u0).toBeCloseTo(0, 6)
    expect(uv.v0).toBeCloseTo(0, 6)
    expect(uv.u1).toBeCloseTo(0.375, 6)
    expect(uv.v1).toBeCloseTo(0.328125, 6)
    const out = boxUv({ x: -100, y: 900, w: 4000, h: 400 }, 1, 1280, 720)
    expect(out.u0).toBe(0)
    expect(out.u1).toBe(1)
    expect(out.v0).toBe(1)
    expect(out.v1).toBe(1)
  })

  it('toneAt 只取该矩形内的像素，且给出最坏值（边界取整偏保守）', () => {
    /* 4×4 的矩阵：上两行 0.9（亮），下两行 0.1（暗） */
    const lum = new Float32Array([
      0.9, 0.9, 0.9, 0.9,
      0.9, 0.9, 0.9, 0.9,
      0.1, 0.1, 0.1, 0.1,
      0.1, 0.1, 0.1, 0.1,
    ])
    const g: ToneGrid = { lum, gw: 4, gh: 4, wx: 0, wy: 0, ww: 4, wh: 4, avg: 0.5, min: 0.1, max: 0.9 }
    const top = toneAt(g, { u0: 0, v0: 0, u1: 1, v1: 0.25 })
    expect(top.avg).toBeCloseTo(0.9, 5)
    expect(top.min).toBeCloseTo(0.9, 5)
    const bottom = toneAt(g, { u0: 0, v0: 0.75, u1: 1, v1: 1 })
    expect(bottom.avg).toBeCloseTo(0.1, 5)
    const all = gridTone(g)
    expect(all.avg).toBeCloseTo(0.5, 5)
    expect(all.min).toBeCloseTo(0.1, 5)
    expect(all.max).toBeCloseTo(0.9, 5)
  })

  it('只取可见窗口内的像素：窗口外的黑块不该影响结果', () => {
    /* 8×2：左半 0.9，右半 0.1；可见窗口只取右半 */
    const lum = new Float32Array([0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1])
    const g: ToneGrid = { lum, gw: 8, gh: 2, wx: 4, wy: 0, ww: 4, wh: 2, avg: 0.1, min: 0.1, max: 0.1 }
    const t = gridTone(g)
    expect(t.avg).toBeCloseTo(0.1, 5)
    expect(t.max).toBeCloseTo(0.1, 5)
    /* UV 里的 0 对应窗口左边（而不是整图左边） */
    const t2 = toneAt(g, { u0: 0, v0: 0, u1: 1, v1: 1 })
    expect(t2.avg).toBeCloseTo(0.1, 5)
  })

  it('UV 退化为零面积时不炸，给中灰兜底', () => {
    const g: ToneGrid = { lum: new Float32Array([0.5]), gw: 1, gh: 1, wx: 0, wy: 0, ww: 1, wh: 1, avg: 0.5, min: 0.5, max: 0.5 }
    const t = toneAt(g, { u0: 0.5, v0: 0.5, u1: 0.5, v1: 0.5 })
    expect(t.avg).toBeCloseTo(0.5, 5)
    expect(Number.isFinite(t.avg)).toBe(true)
  })
})

describe('luma：品牌色可读性（readableInk）', () => {
  const lumOf = (hex: string): number => hexLum(hex) ?? 0

  it('hexRgb / rgbHex 往返一致，非法写法返回 null', () => {
    expect(hexRgb('#1f2937')).toEqual([31, 41, 55])
    expect(hexRgb('#fff')).toEqual([255, 255, 255])
    expect(hexRgb('rgba(0,0,0,.5)')).toBeNull()
    expect(rgbHex([31, 41, 55])).toBe('#1f2937')
    expect(rgbHex([300, -5, 12.4])).toBe('#ff000c')
  })

  it('已经达标时原样返回，不做任何调整', () => {
    /* #2932E1（百度蓝）在白底上的对比度远高于 3.2 */
    expect(readableInk('#2932E1', lumOf('#ffffff'))).toBe('#2932E1')
  })

  it('深墨压在深底上被提亮到达标', () => {
    /* Notion #1F1F1F 在暗黑主题的容器底色上原本几乎不可见 */
    const bg = '#2a3247'
    const out = readableInk('#1F1F1F', lumOf(bg))
    expect(contrast(lumOf(out), lumOf(bg))).toBeGreaterThanOrEqual(TONE_TARGET)
    expect(hexLum(out)).toBeGreaterThan(hexLum('#1F1F1F') ?? 0)
  })

  it('浅墨压在浅底上被压暗到达标', () => {
    /* 闲鱼 #E8C400 在白底上对比度不足 */
    const bg = '#ffffff'
    const out = readableInk('#E8C400', lumOf(bg))
    expect(contrast(lumOf(out), lumOf(bg))).toBeGreaterThanOrEqual(TONE_TARGET)
    expect(hexLum(out)).toBeLessThan(hexLum('#E8C400') ?? 1)
  })

  it('保留色相：调整后各通道的相对大小不变（仍是同一族颜色）', () => {
    const out = hexRgb(readableInk('#FF2442', lumOf('#ffffff')))
    expect(out).not.toBeNull()
    const [r, , b] = out as [number, number, number]
    expect(r).toBeGreaterThan(b)
  })

  it('非法输入原样返回，不抛异常', () => {
    expect(readableInk('rgba(0,0,0,.5)', 0.9)).toBe('rgba(0,0,0,.5)')
  })
})
