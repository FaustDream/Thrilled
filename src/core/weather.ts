/**
 * 天气服务（Open-Meteo）
 *
 * 定位优先真实位置：请求地理权限 → 成功后按坐标取天气，并把坐标反查成地名（区县 / 城市）显示。
 * 用户拒绝或定位失败时**不再静默降级成北京**——返回明确状态，由界面提示「允许定位」按钮重试；
 * 只有用户此前手选过城市（city）时才用该城市的坐标。
 *
 * 缓存 30min TTL（坐标偏移 1 度内有效），纯数据服务：获取与文案归一化在这里，展示由 app 层渲染。
 */

import { info, warn } from './logger';
import { GEO_TIMEOUT_MS, WEATHER_CACHE_KEY, WEATHER_CACHE_TTL_MS } from '../shared/constants';
import { kvGet, kvSet } from './storage';
import type { CityPick } from '../shared/types';

const MODULE = 'weather';

/** 请求超时 8s */
const FETCH_TIMEOUT_MS = 8000;

/** WMO 天气码 → 中文 */
const WEATHER_CODE_MAP: Readonly<Record<number, string>> = {
  0: '晴', 1: '大部晴', 2: '多云', 3: '阴', 45: '雾', 48: '霜雾',
  51: '小雨', 53: '中雨', 55: '大雨', 61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 80: '阵雨', 81: '暴雨', 82: '大暴雨',
  95: '雷暴', 96: '冰雹雷暴', 99: '强冰雹',
};

/** 定位状态：ok = 已拿到真实坐标；denied = 用户拒绝或浏览器不给；unavailable = 不支持 / 超时 */
export type GeoStatus = 'ok' | 'denied' | 'unavailable';

/** 天气数据模型 */
export interface WeatherData {
  lat: number;
  lon: number;
  ts: number;
  currentTemp: number;
  currentCode: number;
  /** 数据源给的昼夜标记（1 = 白天）；旧缓存可能没有，界面按当前小时兜底 */
  currentIsDay?: boolean;
  daily: Array<{ date: string; max: number; min: number; code: number }>;
  /** 地名（坐标反查得到；反查失败时为空串，界面回退到坐标描述） */
  place: string;
  /** 坐标来源：geo = 真实定位；city = 用户手选城市 */
  source: 'geo' | 'city';
  /** 定位状态（source = geo 时恒为 ok） */
  geo: GeoStatus;
}

/** 天气码 → 文案 */
export function weatherText(code: number): string {
  return WEATHER_CODE_MAP[code] ?? '未知';
}

/** 用户手选城市：名称 + 坐标（由地理编码搜索得到）——类型定义在 shared/types（设置与天气共用） */

/** 地理编码结果 */
export interface GeoHit {
  name: string;
  /** 省 / 州 */
  admin1: string;
  /** 国家 */
  country: string;
  lat: number;
  lon: number;
  /** 人口（同名字点排序用；数据源缺失时为 0） */
  population?: number;
}

/** 定位（返回状态，不再静默降级） */
export function getLocation(): Promise<{ status: GeoStatus; lat: number; lon: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      resolve({ status: 'unavailable', lat: 0, lon: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ status: 'ok', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        /* PERMISSION_DENIED = 1：用户明确拒绝，界面据此提示「允许定位」 */
        resolve({ status: err.code === 1 ? 'denied' : 'unavailable', lat: 0, lon: 0 });
      },
      { timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false },
    );
  });
}

/** 坐标反查地名（BigDataCloud 免费反向地理编码；失败返回空串，不影响天气本身） */
async function reversePlace(lat: number, lon: number): Promise<string> {
  try {
    const resp = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!resp.ok) return '';
    const data = (await resp.json()) as { city?: string; locality?: string; principalSubdivision?: string };
    const city = (data.city ?? '').trim();
    const locality = (data.locality ?? '').trim();
    const province = (data.principalSubdivision ?? '').trim();
    if (city !== '' && locality !== '' && locality !== city) return `${locality} · ${city}`;
    return city !== '' ? city : province;
  } catch {
    return '';
  }
}

/** 城市名搜索（设置里手选城市用） */
export async function searchCities(keyword: string): Promise<GeoHit[]> {
  const q = keyword.trim();
  if (q === '') return [];
  try {
    const resp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=zh&format=json`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      results?: Array<{ name?: string; admin1?: string; country?: string; latitude?: number; longitude?: number; population?: number }>;
    };
    const hits = (data.results ?? [])
      .map((r) => ({
        name: (r.name ?? '').trim(),
        admin1: (r.admin1 ?? '').trim(),
        country: (r.country ?? '').trim(),
        lat: r.latitude ?? 0,
        lon: r.longitude ?? 0,
        population: typeof r.population === 'number' ? r.population : 0,
      }))
      .filter((r) => r.name !== '' && Number.isFinite(r.lat) && Number.isFinite(r.lon));
    /* 同名地点混排是手选结果「看起来不对」的主因：大城小镇同 rank 时按人口降序，
       让真正的城市排前面（乡镇级同名点沉底）；候选展示仍保留省 / 国家供辨认 */
    return dedupeHits(hits).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  } catch {
    return [];
  }
}

/** 候选去重：坐标四舍五入到 0.1° 后相同的只留第一条（不同数据源的同地重复） */
export function dedupeHits(hits: GeoHit[]): GeoHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.lat.toFixed(1)},${h.lon.toFixed(1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 城市缓存的稳定键：坐标保留 3 位小数（约百米级，同一城市不会因微小差异重复请求） */
export function cityKeyOf(c: { lat: number; lon: number }): string {
  return `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
}

/** 单城市缓存键（多城市天气详情用；与主定位的 WEATHER_CACHE_KEY 分开，互不覆盖） */
const cityCacheKey = (c: CityPick): string => `${WEATHER_CACHE_KEY}:city:${cityKeyOf(c)}`;

/**
 * 取单个城市的天气（天气详情的「其他城市」）：带 30min TTL 的独立缓存。
 * 请求失败返回 null（列表行显示占位），不影响主定位的天气。
 */
export async function getCityWeather(city: CityPick, force = false): Promise<WeatherData | null> {
  const key = cityCacheKey(city);
  const cached = kvGet<WeatherData | null>(key, null);
  if (!force && cached !== null && Date.now() - cached.ts < WEATHER_CACHE_TTL_MS) return cached;
  try {
    const data = await fetchWeather(city.lat, city.lon);
    const out: WeatherData = { ...data, place: city.name, source: 'city', geo: 'ok' };
    kvSet(key, out);
    return out;
  } catch (e) {
    warn(MODULE, `城市天气请求失败：${e instanceof Error ? e.message : String(e)}`);
    return cached;
  }
}

/** 缓存是否有效（TTL + 坐标偏移 < 1 度 + 同一坐标来源） */
function isCacheValid(cached: WeatherData | null, lat: number, lon: number, source: WeatherData['source']): boolean {
  if (cached === null) return false;
  if (cached.source !== source) return false;
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
    '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
      daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; weather_code?: number[] };
    };
    const current = data.current ?? {};
    const daily = data.daily ?? {};
    return {
      lat,
      lon,
      ts: Date.now(),
      currentTemp: Math.round(current.temperature_2m ?? 0),
      currentCode: current.weather_code ?? 0,
      ...(current.is_day === undefined ? {} : { currentIsDay: current.is_day === 1 }),
      daily: (daily.time ?? []).map((date, i) => ({
        date,
        max: Math.round(daily.temperature_2m_max?.[i] ?? 0),
        min: Math.round(daily.temperature_2m_min?.[i] ?? 0),
        code: daily.weather_code?.[i] ?? 0,
      })),
      place: '',
      source: 'geo',
      geo: 'ok',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 组装并落缓存：补地名、写缓存 */
async function finish(
  base: WeatherData,
  source: WeatherData['source'],
  geo: GeoStatus,
  knownPlace = '',
): Promise<WeatherData> {
  const place = knownPlace !== '' ? knownPlace : await reversePlace(base.lat, base.lon);
  const data: WeatherData = { ...base, place, source, geo };
  kvSet(WEATHER_CACHE_KEY, data);
  return data;
}

/**
 * 获取天气。
 * @param city 用户手选城市（null = 用真实定位）
 * @param force 跳过 30min 缓存（用户主动刷新 / 自动刷新按间隔取新数据时用）
 * @returns 天气数据；定位被拒绝 / 不可用且没有手选城市时返回 null（界面据此提示允许定位）
 */
export async function getWeather(city: CityPick | null = null, force = false): Promise<WeatherData | null> {
  const cached = kvGet<WeatherData | null>(WEATHER_CACHE_KEY, null);
  if (city !== null) {
    if (!force && isCacheValid(cached, city.lat, city.lon, 'city')) return cached;
    try {
      const data = await fetchWeather(city.lat, city.lon);
      return await finish(data, 'city', 'ok', city.name);
    } catch (e) {
      warn(MODULE, `天气请求失败：${e instanceof Error ? e.message : String(e)}`);
      return cached;
    }
  }
  const loc = await getLocation();
  if (loc.status !== 'ok') {
    /* 不再静默用北京：把状态交给界面，由用户决定是否允许定位 */
    warn(MODULE, `定位不可用（${loc.status}）`);
    return null;
  }
  if (!force && isCacheValid(cached, loc.lat, loc.lon, 'geo')) return cached;
  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    const out = await finish(data, 'geo', 'ok');
    info(MODULE, '天气刷新完成', { text: weatherText(out.currentCode), temp: out.currentTemp, place: out.place });
    return out;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    warn(MODULE, `天气请求失败，使用缓存（${reason}）`);
    return cached;
  }
}
