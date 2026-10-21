/**
 * 对比度（v4.4 补丁 38）
 *
 * 「图标压在壁纸上要看得清」这件事的数学部分：知道局部壁纸亮度与字形颜色，算出该用哪种
 * 墨色、需要多强的**护罩**（字形背后一圈软底衬）与**光晕**（外圈描边 / 投影）。
 * 全是纯函数（取像素那半边在 core/walltone），所以可以直接单测。
 *
 * 亮度用 WCAG 相对亮度（sRGB 线性化后按人眼灵敏度加权），对比度用 WCAG 公式
 * (L1+0.05)/(L2+0.05)——这样「3:1」这条线有据可依：WCAG 1.4.11 对非文本图形
 * 要求 3:1，图标字形正属于这一档。
 *
 * 手段的顺序（按视觉侵入性）：
 *   ① **翻墨色**——浅色壁纸用深墨、深色壁纸用浅墨。不遮壁纸、不改形状，代价只是
 *      图标颜色不再严格跟随皮肤（这正是设置里「自动对比」开 / 关的差别）。
 *   ② **光晕**——字形外圈一圈反向描边 / 阴影，只压在边缘上，几乎不改视觉语言。
 *   ③ **护罩**——字形背后一圈软底衬。会挡住壁纸，故只在①②都兜不住时才垫。
 */

/** 目标对比度（3:1 是门槛，留一点余量） */
export const TONE_TARGET = 3.2
/** 护罩上限：再深就是一块实体牌子了，比「看不见图标」更难看 */
export const SCRIM_MAX = 0.62
/** 光晕下限：壁纸再干净也留一点点——局部有云 / 文字时全靠它兜底 */
export const HALO_MIN = 0.2
/** 光晕上限 */
export const HALO_MAX = 0.75

/** sRGB 分量（0–255）→ 线性光 */
const lin = (v: number): number => {
  const c = Math.min(255, Math.max(0, v)) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** 相对亮度 0–1（输入 0–255 的 sRGB 分量） */
export const relLum = (r: number, g: number, b: number): number =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

/** #rgb / #rrggbb → 相对亮度；其它写法返回 null（调用方走兜底） */
export const hexLum = (hex: string): number | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (m === null) return null
  const h = m[1] ?? ''
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return relLum(
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  )
}

/** 对比度（WCAG），输入是相对亮度 */
export const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * 把 alpha 的前景（亮度 0 或 1）叠到背景亮度上得一阶近似。
 * 严格做法要在 sRGB 分量上逐通道混合再线性化，但这里只有亮度、没有三通道；
 * 一阶近似在深色端偏乐观、浅色端偏保守，配合 TONE_TARGET 的余量足够安全。
 */
export const overLum = (bg: number, fg: number, alpha: number): number =>
  bg + (fg - bg) * Math.min(1, Math.max(0, alpha))

/** 给定局部亮度，循环找最小可行 alpha（步进 0.02） */
const solveAlpha = (tone: number, inkLum: number, push: number): number => {
  for (let i = 0; i <= 31; i++) {
    const a = i * 0.02
    if (contrast(inkLum, overLum(tone, push, a)) >= TONE_TARGET) return Number(a.toFixed(2))
  }
  return SCRIM_MAX
}

/** 两种墨色里哪个在这块背景上更清楚（true = 该用浅色墨） */
export const pickInk = (tone: number, lightLum: number, darkLum: number): boolean =>
  contrast(lightLum, tone) >= contrast(darkLum, tone)

/** 某一种墨色在该背景下要补的护罩与光晕 */
export interface InkFix {
  /** 护罩 alpha（0 = 不需要） */
  scrim: number
  /** 外圈光晕 / 描边 alpha（≥ HALO_MIN） */
  halo: number
}

/**
 * 给定「墨色亮度」与「它背后那块壁纸的亮度」，算出要补的护罩与光晕。
 *
 * 分工按尺度来：**平均亮度**定护罩（大面积底衬该多深），**最坏亮度**定光晕
 * （一角白云就够让白字形糊掉，那种局部只该用描边解决，不该整块压暗）。
 */
export const fixForInk = (toneAvg: number, toneWorst: number, inkLum: number): InkFix => {
  const push = inkLum > 0.35 ? 0 : 1
  const scrim = contrast(inkLum, toneAvg) >= TONE_TARGET ? 0 : solveAlpha(toneAvg, inkLum, push)
  const need = solveAlpha(toneWorst, inkLum, push)
  const halo = Math.min(HALO_MAX, Math.max(HALO_MIN, Number((need * 1.1).toFixed(2))))
  return { scrim, halo }
}

/**
 * 品牌色可读性：品牌色是各站点自带的标识色，深浅两端都极端（Notion #1F1F1F 与
 * 闲鱼 #E8C400）。同一个字形放在浅色或深色皮肤上，总有一半撞底。
 *
 * 这里只改**明度**、不动色相与饱和度，把颜色推到目标对比度为止——
 * 品牌识别靠色相，靠明度提亮 / 压暗不会让人认不出是哪个站点。
 * 已经在目标之上的颜色原样返回，不做任何「顺手美化」。
 */

/** #rgb / #rrggbb → [r,g,b]（0–255）；其它写法返回 null */
export const hexRgb = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (m === null) return null
  const h = m[1] ?? ''
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

/** [r,g,b]（0–255）→ #rrggbb */
export const rgbHex = (rgb: readonly [number, number, number]): string =>
  `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`

/** [r,g,b] → [h(0–360), s(0–1), l(0–1)] */
const toHsl = ([r, g, b]: readonly [number, number, number]): [number, number, number] => {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h * 360, s, l]
}

/** [h(0–360), s(0–1), l(0–1)] → [r,g,b]（0–255） */
const fromHsl = ([h, s, l]: readonly [number, number, number]): [number, number, number] => {
  if (s === 0) { const v = l * 255; return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number): number => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  const hn = h / 360
  return [hue(hn + 1 / 3) * 255, hue(hn) * 255, hue(hn - 1 / 3) * 255]
}

/**
 * 把颜色朝「离背景更远」的方向推：背景暗就提亮、背景亮就压暗。
 *
 * 只动 **HSL 的明度**，色相与饱和度保持原样——这是品牌识别能留下来的关键：
 * 直接往白里混会把 #24292F（GitHub 的深墨）洗成中性灰 #7e8184，色相没了，
 * 一排图标里就认不出谁是谁；改成抬高 L 则得到浅冷灰，仍是同一族颜色。
 *
 * @param hex   原始品牌色
 * @param bgLum 背景相对亮度（用 hexLum 算）
 * @param target 目标对比度，默认 3.2（WCAG 1.4.11 非文本 3:1 留余量）
 */
export const readableInk = (hex: string, bgLum: number, target = TONE_TARGET): string => {
  const rgb = hexRgb(hex)
  if (rgb === null) return hex
  if (contrast(relLum(rgb[0], rgb[1], rgb[2]), bgLum) >= target) return hex
  const [h, s, l0] = toHsl(rgb)
  const up = bgLum < 0.18
  /* 二分找最小达标明度：L 的可行区间是 [l0, 1] 或 [0, l0] */
  let lo = up ? l0 : 0
  let hi = up ? 1 : l0
  let best = fromHsl([h, s, up ? 1 : 0])
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const cand = fromHsl([h, s, mid])
    if (contrast(relLum(cand[0], cand[1], cand[2]), bgLum) >= target) { best = cand; if (up) hi = mid; else lo = mid }
    else if (up) lo = mid
    else hi = mid
  }
  /* 量化到 8 位色深后再验一次：四舍五入可能把对比度压回阈值下方，此时沿同方向多推一点 */
  const quantized = rgbHex(best)
  if (contrast(hexLum(quantized) ?? 0, bgLum) >= target) return quantized
  for (let step = 0.004; step <= 0.08; step += 0.004) {
    const cand = fromHsl([h, s, Math.min(1, Math.max(0, (up ? hi : lo) + (up ? step : -step)))])
    const out = rgbHex(cand)
    if (contrast(hexLum(out) ?? 0, bgLum) >= target) return out
  }
  return rgbHex(fromHsl([h, s, up ? 1 : 0]))
}

/**
 * 壁纸遮罩（`settings.cover`）的自动加成：壁纸越「花」，全局压一层越能让 UI 的统一色
 * （卡片底衬、搜索框）站稳。用可见区域的**极差**（max−min）当作「花」的程度——
 * 亮度均匀的壁纸（纯色、天空）不需要压，明暗交错（人物 + 天空 + 反光）才需要。
 */
export const coverFix = (avg: number, min: number, max: number): number => {
  const spread = Math.max(0, max - min)
  /* 极差 0.35 以下不加；往上每 0.1 加 4%，最多加 0.2。整体很亮时再补一点点 */
  const bySpread = Math.min(0.2, Math.max(0, (spread - 0.35) * 0.4))
  const byBright = avg > 0.7 ? 0.06 : 0
  return Number((bySpread + byBright).toFixed(3))
}
