/**
 * 天气服务（Open-Meteo）
 *
 * 定位优先真实位置：优先复用 6h 内的定位坐标，没有才向浏览器要定位；成功后按坐标取天气，
 * 并把坐标反查成地名（区县 / 城市）显示。
 * 用户拒绝或定位失败时**不再静默降级成北京**——有上次天气就继续展示，没有才返回明确状态，
 * 由界面提示「允许定位」按钮重试；只有用户此前手选过城市（city）时才用该城市的坐标。
 *
 * 缓存分两层，目标是新标签页一打开就有数据：
 * - 天气缓存 30min TTL（且不跨天）：先拿它渲染，网络回来再替换（stale-while-revalidate）。
 * - 坐标缓存 6h TTL：避免每次开新标签页都触发一次浏览器定位。
 */

import { info, warn } from './logger';
import {
  GEO_TIMEOUT_MS,
  WEATHER_CACHE_KEY,
  WEATHER_CACHE_TTL_MS,
  WEATHER_LOCATION_KEY,
  WEATHER_LOCATION_TTL_MS,
} from '../shared/constants';
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
  /** 数据源所在地的 UTC 偏移（秒）：判断「今天」与预报日期用；旧缓存没有则按本机时区 */
  utcOffset?: number;
  /** 地名（坐标反查得到；反查失败时为空串，界面回退到坐标描述） */
  place: string;
  /** 坐标来源：geo = 真实定位；city = 用户手选城市 */
  source: 'geo' | 'city';
  /** 定位状态（source = geo 时恒为 ok） */
  geo: GeoStatus;
}

/** 浏览器定位结果的落地缓存 */
interface CachedLocation {
  lat: number;
  lon: number;
  ts: number;
}

/** 天气码 → 文案 */
export function weatherText(code: number): string {
  return WEATHER_CODE_MAP[code] ?? '未知';
}

/** 本地日键（YYYY-MM-DD）：判断缓存是否跨天用 */
export function localDayKey(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 按本地日期取预报中的某一天：缓存跨天时不会把昨天当成今天 */
export function dailyOf(d: WeatherData, date: string): WeatherData['daily'][number] | undefined {
  return d.daily.find((x) => x.date === date);
}

/** 指定 UTC 偏移下的日键（手选异地城市时按当地日期判断） */
function dayKeyAt(ts: number, offsetSeconds: number): string {
  const d = new Date(ts + offsetSeconds * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** 天气数据所在地「今天」的日键（旧缓存没有偏移信息时退回本机日期） */
export function weatherDayKey(d: WeatherData, now: Date = new Date()): string {
  return d.utcOffset === undefined ? localDayKey(now) : dayKeyAt(now.getTime(), d.utcOffset);
}

/** 天气数据所在地「明天」的日键（卡片「明日」温度用） */
export function weatherNextDayKey(d: WeatherData, now: Date = new Date()): string {
  if (d.utcOffset === undefined) {
    return localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  }
  return dayKeyAt(now.getTime() + 86_400_000, d.utcOffset);
}

/** 缓存结构校验（跨标签页采纳缓存 / 旧版本数据兜底时用） */
export function isWeatherData(v: unknown): v is WeatherData {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o['ts'] === 'number'
    && typeof o['lat'] === 'number'
    && typeof o['lon'] === 'number'
    && typeof o['currentTemp'] === 'number'
    && typeof o['currentCode'] === 'number'
    && typeof o['place'] === 'string'
    && (o['source'] === 'geo' || o['source'] === 'city')
    && Array.isArray(o['daily']);
}

/** 缓存是否还算新鲜：TTL 内且 daily 的今天仍是今天（跨天后预报日期会错位，必须重取） */
export function weatherFresh(d: WeatherData, now: Date = new Date()): boolean {
  if (now.getTime() - d.ts >= WEATHER_CACHE_TTL_MS) return false;
  return d.daily.length === 0 || d.daily[0]?.date === weatherDayKey(d, now);
}

/** 两点是否同一地点（沿用 1 度容差：定位抖动 / 同城手选不会被当成换地方） */
export function nearSpot(a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean {
  return Math.abs(a.lat - b.lat) + Math.abs(a.lon - b.lon) < 1;
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

/** 坐标缓存读取：allowStale = true 时不看 TTL（定位失败时沿用上次坐标） */
function readCachedLocation(allowStale: boolean): CachedLocation | null {
  const v = kvGet<CachedLocation | null>(WEATHER_LOCATION_KEY, null);
  if (v === null || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) || !Number.isFinite(v.ts)) return null;
  if (!allowStale && Date.now() - v.ts >= WEATHER_LOCATION_TTL_MS) return null;
  return v;
}

/**
 * 取当前坐标：默认先用 6h 内的缓存坐标（不触碰定位权限），
 * relocate = true 或缓存缺失时才真正调用浏览器定位；失败退回旧坐标。
 */
async function resolveCoords(relocate: boolean): Promise<CachedLocation | null> {
  if (!relocate) {
    const hit = readCachedLocation(false);
    if (hit !== null) return hit;
  }
  const loc = await getLocation();
  if (loc.status !== 'ok') {
    /* 新标签页里定位被拒 / 超时很常见，属于已知状态：留在 info，不打警告 */
    info(MODULE, `定位不可用（${loc.status}），沿用上次坐标`);
    return readCachedLocation(true);
  }
  const cached: CachedLocation = { lat: loc.lat, lon: loc.lon, ts: Date.now() };
  kvSet(WEATHER_LOCATION_KEY, cached);
  return cached;
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
 * 读上次天气（不看 TTL，按当前地点筛选）：新标签页首屏先渲染它，网络回来再替换。
 * 地点口径：真实定位只认 source = geo；手选城市还要求坐标接近，换城市后不会拿旧城市冒充。
 */
export function readWeatherCache(city: CityPick | null): WeatherData | null {
  const cached = kvGet<WeatherData | null>(WEATHER_CACHE_KEY, null);
  if (!isWeatherData(cached)) return null;
  const want: WeatherData['source'] = city === null ? 'geo' : 'city';
  if (cached.source !== want) return null;
  if (city !== null && !nearSpot(cached, city)) return null;
  return cached;
}

/**
 * 取单个城市的天气（天气详情的「其他城市」）：带 30min TTL 的独立缓存。
 * 请求失败返回上次数据（没有才是 null），不影响主定位的天气。
 */
export async function getCityWeather(city: CityPick, force = false): Promise<WeatherData | null> {
  const key = cityCacheKey(city);
  const stored = kvGet<WeatherData | null>(key, null);
  const cached = isWeatherData(stored) ? stored : null;
  if (!force && cached !== null && weatherFresh(cached)) return cached;
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
      utc_offset_seconds?: number;
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
      ...(typeof data.utc_offset_seconds === 'number' ? { utcOffset: data.utc_offset_seconds } : {}),
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

/** 请求并落缓存：失败时返回上次数据，没有上次数据才返回 null */
async function fetchAndCache(
  lat: number,
  lon: number,
  source: WeatherData['source'],
  fallback: WeatherData | null,
  knownPlace = '',
): Promise<WeatherData | null> {
  try {
    const data = await fetchWeather(lat, lon);
    const out = await finish(data, source, 'ok', knownPlace);
    info(MODULE, '天气刷新完成', { text: weatherText(out.currentCode), temp: out.currentTemp, place: out.place });
    return out;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    warn(MODULE, `天气请求失败，沿用上次数据（${reason}）`);
    return fallback;
  }
}

/**
 * 获取天气。
 * @param city 用户手选城市（null = 用真实定位）
 * @param force 跳过 30min 缓存（自动刷新 / 手动刷新用）
 * @param relocate 重新向浏览器要定位（只有用户点「允许定位 / 重新定位」才为 true）
 * @returns 天气数据；任何失败都优先返回上次数据，彻底没有数据时才返回 null
 */
export async function getWeather(
  city: CityPick | null = null,
  force = false,
  relocate = false,
): Promise<WeatherData | null> {
  const cached = readWeatherCache(city);
  if (!force && cached !== null && weatherFresh(cached)) return cached;
  if (city !== null) return await fetchAndCache(city.lat, city.lon, 'city', cached, city.name);
  const coords = await resolveCoords(relocate);
  if (coords === null) return cached;
  /* 坐标换了就重新反查地名；同一地点沿用旧地名，少一次反向地理编码请求 */
  const place = cached !== null && nearSpot(cached, coords) ? cached.place : '';
  return await fetchAndCache(coords.lat, coords.lon, 'geo', cached, place);
}
