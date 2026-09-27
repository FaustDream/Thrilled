/**
 * 天气服务（Open-Meteo）
 *
 * 缓存 30min TTL（坐标偏移 1 度内有效），定位超时降级北京。
 * 纯数据服务：获取与文案归一化在这里，展示由 app 层渲染。
 */

import { info, warn } from './logger';
import { GEO_TIMEOUT_MS, WEATHER_CACHE_KEY, WEATHER_CACHE_TTL_MS } from '../shared/constants';
import { kvGet, kvSet } from './storage';

const MODULE = 'weather';

/** 默认：北京坐标 */
const DEFAULT_LAT = 39.9042;
const DEFAULT_LON = 116.4074;
/** 请求超时 8s */
const FETCH_TIMEOUT_MS = 8000;

/** WMO 天气码 → 中文 */
const WEATHER_CODE_MAP: Readonly<Record<number, string>> = {
  0: '晴', 1: '大部晴', 2: '多云', 3: '阴', 45: '雾', 48: '霜雾',
  51: '小雨', 53: '中雨', 55: '大雨', 61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 80: '阵雨', 81: '暴雨', 82: '大暴雨',
  95: '雷暴', 96: '冰雹雷暴', 99: '强冰雹',
};

/** 天气数据模型 */
export interface WeatherData {
  lat: number;
  lon: number;
  ts: number;
  currentTemp: number;
  currentCode: number;
  daily: Array<{ date: string; max: number; min: number; code: number }>;
}

/** 天气码 → 文案 */
export function weatherText(code: number): string {
  return WEATHER_CODE_MAP[code] ?? '未知';
}

/** 获取定位（超时降级北京） */
function getLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON }),
      { timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** 缓存是否有效（TTL + 坐标偏移 < 1 度） */
function isCacheValid(cached: WeatherData | null, lat: number, lon: number): boolean {
  if (cached === null) return false;
  if (Date.now() - cached.ts >= WEATHER_CACHE_TTL_MS) return false;
  return Math.abs(cached.lat - lat) + Math.abs(cached.lon - lon) < 1;
}

/** 请求 Open-Meteo */
async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; weather_code?: number[] };
    };
    const current = data.current ?? {};
    const daily = data.daily ?? {};
    const result: WeatherData = {
      lat,
      lon,
      ts: Date.now(),
      currentTemp: Math.round(current.temperature_2m ?? 0),
      currentCode: current.weather_code ?? 0,
      daily: (daily.time ?? []).map((date, i) => ({
        date,
        max: Math.round(daily.temperature_2m_max?.[i] ?? 0),
        min: Math.round(daily.temperature_2m_min?.[i] ?? 0),
        code: daily.weather_code?.[i] ?? 0,
      })),
    };
    kvSet(WEATHER_CACHE_KEY, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取天气：缓存有效直接返回，否则请求；请求失败回退缓存
 * @returns 天气数据；完全不可用返回 null
 */
export async function getWeather(): Promise<WeatherData | null> {
  const loc = await getLocation();
  const cached = kvGet<WeatherData | null>(WEATHER_CACHE_KEY, null);
  if (isCacheValid(cached, loc.lat, loc.lon)) return cached;
  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    info(MODULE, '天气刷新完成', { text: weatherText(data.currentCode), temp: data.currentTemp });
    return data;
  } catch (e) {
    warn(MODULE, '天气请求失败，使用缓存', { err: (e as Error).message });
    return cached;
  }
}
