/**
 * 天气预报（对齐原版 js/weather.js + dailyGreetingCard.js 天气徽标）
 *
 * Open-Meteo API，缓存 30min TTL，坐标偏移 1 度内有效。
 * 显示在 `#dhWeatherBadge`（icon + temp + desc），双击刷新（reloading 脉冲）。
 * 自动刷新：每分钟检查一次，距上次获取超 30min 触发。
 */

// v4：UI 交互由 app 层注入
import { info, warn } from './logger';
import { RAW_KEYS } from '../shared/constants';

/** 天气模块 UI 回调（由 app 层注入） */
export interface WeatherUI {
  /** 生成天气图标 SVG（对应原 icons.icon） */
  renderIcon: (name: string, size?: string) => string;
}

let ui: WeatherUI = { renderIcon: () => '' };

/** 注入 UI 回调（app 层提供图标渲染实现） */
export function setWeatherUI(next: WeatherUI): void {
  ui = next;
}

const MODULE = 'weather';

/** 默认：北京坐标 */
const DEFAULT_LAT = 39.9042;
const DEFAULT_LON = 116.4074;
/** 缓存 TTL 30min */
const CACHE_TTL_MS = 30 * 60 * 1000;
/** 自动刷新间隔 30min */
const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** 定位超时 */
const GEO_TIMEOUT_MS = 5000;

/** WMO 天气码 → 中文 + 图标（对齐原版 WEATHER_MAP） */
const WEATHER_CODE_MAP: Readonly<Record<number, { text: string; icon: string }>> = {
  0: { text: '晴', icon: 'weather-sun' },
  1: { text: '大部晴', icon: 'weather-cloud-sun' },
  2: { text: '多云', icon: 'weather-cloud-sun' },
  3: { text: '阴', icon: 'weather-cloud' },
  45: { text: '雾', icon: 'weather-fog' },
  48: { text: '霜雾', icon: 'weather-fog' },
  51: { text: '小雨', icon: 'weather-rain' },
  53: { text: '中雨', icon: 'weather-rain' },
  55: { text: '大雨', icon: 'weather-rain' },
  61: { text: '小雨', icon: 'weather-rain' },
  63: { text: '中雨', icon: 'weather-rain' },
  65: { text: '大雨', icon: 'weather-rain' },
  71: { text: '小雪', icon: 'weather-snow' },
  73: { text: '中雪', icon: 'weather-snow' },
  75: { text: '大雪', icon: 'weather-snowflake' },
  80: { text: '阵雨', icon: 'weather-rain' },
  81: { text: '暴雨', icon: 'weather-storm' },
  82: { text: '大暴雨', icon: 'weather-storm' },
  95: { text: '雷暴', icon: 'weather-storm' },
  96: { text: '冰雹雷暴', icon: 'weather-storm' },
  99: { text: '强冰雹', icon: 'weather-storm' },
};

/** 天气数据模型（对齐原版） */
export interface WeatherData {
  lat: number;
  lon: number;
  ts: number;
  currentTemp: number;
  currentCode: number;
  daily: Array<{ date: string; max: number; min: number; code: number }>;
}

/** 天气码 → 文案+图标 */
function getWeatherInfo(code: number): { text: string; icon: string } {
  return WEATHER_CODE_MAP[code] ?? { text: '未知', icon: 'weather-thermometer' };
}

/** 获取定位（5s 超时降级北京） */
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
  if (Date.now() - cached.ts >= CACHE_TTL_MS) return false;
  return Math.abs(cached.lat - lat) + Math.abs(cached.lon - lon) < 1;
}

/** 读取缓存 */
function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(RAW_KEYS.WEATHER_CACHE);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<WeatherData>;
    if (typeof parsed.currentTemp !== 'number') return null;
    return parsed as WeatherData;
  } catch {
    return null;
  }
}

/** 请求 Open-Meteo（8s 超时） */
async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
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
    localStorage.setItem(RAW_KEYS.WEATHER_CACHE, JSON.stringify(result));
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** 渲染天气徽标 */
export function renderWeatherBadge(data: WeatherData): void {
  const badge = document.getElementById('dhWeatherBadge');
  if (badge === null) return;
  const info = getWeatherInfo(data.currentCode);
  const iconEl = badge.querySelector('.dh-weather-icon');
  const tempEl = document.getElementById('dhWeatherTempText');
  const descEl = document.getElementById('dhWeatherDescText');
  if (iconEl !== null) iconEl.innerHTML = ui.renderIcon(info.icon, 'dh-icon--md');
  if (tempEl !== null) tempEl.textContent = `${data.currentTemp}°`;
  if (descEl !== null) descEl.textContent = info.text;
  badge.title = `${info.text} ${data.currentTemp}°C · 双击刷新天气`;
  badge.style.display = '';
}

/** 显示刷新中状态 */
function showWeatherLoading(): void {
  const badge = document.getElementById('dhWeatherBadge');
  const descEl = document.getElementById('dhWeatherDescText');
  if (badge !== null) badge.style.display = '';
  if (descEl !== null) descEl.textContent = '刷新中…';
}

/** 手动/自动刷新 */
export async function refreshWeather(): Promise<WeatherData | null> {
  const loc = await getLocation();
  const cached = getCachedWeather();
  if (isCacheValid(cached, loc.lat, loc.lon) && cached !== null) {
    renderWeatherBadge(cached);
    return cached;
  }
  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    renderWeatherBadge(data);
    info(MODULE, `天气刷新完成`, { text: getWeatherInfo(data.currentCode).text, temp: data.currentTemp });
    return data;
  } catch {
    warn(MODULE, `天气请求失败，使用缓存`);
    if (cached !== null) renderWeatherBadge(cached);
    return cached;
  }
}

/** 初始化：加载缓存 + 绑定双击刷新 + 自动刷新定时器 */
export function initWeather(): void {
  const cached = getCachedWeather();
  if (cached !== null) {
    renderWeatherBadge(cached);
  }
  const area = document.getElementById('dhGreetingArea');
  area?.addEventListener('dblclick', (e) => {
    const badge = (e.target as HTMLElement).closest('#dhWeatherBadge');
    if (badge === null) return;
    e.preventDefault();
    e.stopPropagation();
    badge.classList.add('reloading');
    setTimeout(() => badge.classList.remove('reloading'), 400);
    showWeatherLoading();
    void refreshWeather().then((data) => {
      const descEl = document.getElementById('dhWeatherDescText');
      if (data === null && descEl !== null && descEl.textContent === '刷新中…') {
        descEl.textContent = '失败';
      }
    });
  });
  // 自动刷新：每分钟检查，距上次超 30min 触发
  setInterval(() => {
    const c = getCachedWeather();
    if (c !== null && Date.now() - c.ts >= AUTO_REFRESH_INTERVAL_MS) {
      void refreshWeather();
    }
  }, 60 * 1000);
}
