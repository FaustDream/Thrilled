/**
 * 天气动效分类（纯函数，便于测试）
 *
 * 规则与业界参数化做法一致：**天气现象决定主动画，温度只做参数**——
 * - 降水按温度换形态：≤ 2°C 下雪，否则下雨；
 * - ≤ 0°C 追加结霜，≥ 35°C 追加暖光 / 热浪；
 * - 昼夜只决定配色与星月元素，不改变现象本身。
 * 这样不需要为每个温度档准备素材，动画依然随温度变化。
 */

/** 动效主轴：决定图标与背景场景跑哪套动画 */
export type WeatherFxKind = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow' | 'thunder' | 'fog'

/** 降水强度：1 小 / 2 中 / 3 大，决定粒子密度与速度 */
export type WeatherFxIntensity = 1 | 2 | 3

export interface WeatherFx {
  kind: WeatherFxKind
  /** 夜间：用星月配色，不改变现象 */
  night: boolean
  /** 高温：追加暖色光晕 / 热浪 */
  hot: boolean
  /** 零下：追加结霜点缀（雪天本身已是冷色，不再叠加） */
  cold: boolean
  intensity: WeatherFxIntensity
}

/** 雨 / 阵雨 / 冻雨：码 → 强度 */
const RAIN_INTENSITY: Readonly<Record<number, WeatherFxIntensity>> = {
  51: 1, 53: 2, 55: 3,
  56: 1, 57: 2,
  61: 1, 63: 2, 65: 3,
  66: 1, 67: 2,
  80: 1, 81: 2, 82: 3,
}

/** 雪 / 阵雪：码 → 强度 */
const SNOW_INTENSITY: Readonly<Record<number, WeatherFxIntensity>> = {
  71: 1, 73: 2, 75: 3, 77: 1, 85: 2, 86: 3,
}

/** 雷暴码（可带冰雹） */
const THUNDER_CODES: readonly number[] = [95, 96, 99]

/** 白天兜底：拿不到数据源的 is_day 时按小时判断 */
export const isDayAt = (hour: number): boolean => hour >= 6 && hour < 18

/**
 * 天气码 + 温度 + 昼夜 → 动效参数。
 * 温度只参与两件事：降水形态（≤2°C 转雪）与冷热附加层，主类型仍由天气码决定。
 */
export function weatherFxOf(code: number, temp: number, isDay: boolean): WeatherFx {
  const cold = temp <= 2
  const hot = temp >= 35
  const night = !isDay
  let kind: WeatherFxKind = 'cloudy'
  let intensity: WeatherFxIntensity = 1
  const rain = RAIN_INTENSITY[code]
  const snow = SNOW_INTENSITY[code]
  if (code === 0 || code === 1) {
    kind = 'clear'
  } else if (code === 2) {
    kind = 'partly'
  } else if (code === 3) {
    kind = 'cloudy'
  } else if (code === 45 || code === 48) {
    kind = 'fog'
  } else if (rain !== undefined) {
    intensity = rain
    kind = cold ? 'snow' : 'rain'
  } else if (snow !== undefined) {
    intensity = snow
    kind = 'snow'
  } else if (THUNDER_CODES.includes(code)) {
    /* 雷暴本身比雨更“重”，用中等强度；冰雹雷暴再升一档 */
    intensity = code === 99 ? 3 : 2
    kind = 'thunder'
  }
  return { kind, night, hot, cold: cold && kind !== 'snow', intensity }
}
