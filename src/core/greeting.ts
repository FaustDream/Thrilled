/**
 * 每日问候区域（对齐原版 js/dailyGreeting.js + css/daily-greeting-card.css）
 *
 * 左上角固定布局：
 * - 顶部行：`#dhGreetingDate`（日期）+ `#dhWeatherBadge`（天气徽标，weather.ts 接管）
 * - `#dhGreetingMain`：`${时段问候}，${昵称}`
 * - `#dhEncourageText`：鼓励语（左竖线），双击刷新（reloading 脉冲）
 * 每日随机缓存：`daily_greeting_card_quote = {date, text}`，当日不变，隔日重随机。
 */

import { info } from './logger';
import { getGreetingByHour } from './utils';
import { LS_KEYS, RAW_KEYS } from '../shared/constants';
import { localStorageService } from './storage';
import { getRandomQuote } from './quotes';

const MODULE = 'daily-greeting';

/** 日期缓存结构 */
interface QuoteCache {
  date: string;
  text: string;
}

/** 读取昵称 */
export function getNickname(): string {
  const raw = localStorageService.getRaw(LS_KEYS.CONFIG_NICKNAME);
  return raw !== null && raw.trim() !== '' ? raw.trim() : '主人';
}

/** 日期格式 YYYY/M/D（与历史缓存格式一致） */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 读取当日鼓励语（当日不变，隔日重随机） */
function getDailyQuote(forceRefresh = false): string {
  try {
    const raw = localStorage.getItem(RAW_KEYS.DAILY_GREETING_QUOTE);
    if (raw !== null && !forceRefresh) {
      const cache = JSON.parse(raw) as QuoteCache;
      if (cache.date === todayKey() && typeof cache.text === 'string' && cache.text !== '') {
        return cache.text;
      }
    }
  } catch {
    // 缓存损坏 → 重新随机
  }
  const text = getRandomQuote();
  localStorage.setItem(RAW_KEYS.DAILY_GREETING_QUOTE, JSON.stringify({ date: todayKey(), text }));
  return text;
}

/** 渲染问候区域 */
export function renderGreeting(forceRefresh = false): void {
  const dateEl = document.getElementById('dhGreetingDate');
  const mainEl = document.getElementById('dhGreetingMain');
  const quoteEl = document.getElementById('dhEncourageText');
  if (mainEl === null) return;

  const now = new Date();
  const hour = now.getHours();
  const nickname = getNickname();
  const period = getGreetingByHour(hour);

  if (dateEl !== null) {
    dateEl.textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
  }
  mainEl.textContent = `${period}，${nickname}`;
  if (quoteEl !== null) {
    quoteEl.textContent = getDailyQuote(forceRefresh);
  }
}

/** 初始化问候区域：渲染 + 绑定双击刷新鼓励语 */
export function initDailyGreetingCard(): void {
  renderGreeting();
  const quoteEl = document.getElementById('dhEncourageText');
  quoteEl?.addEventListener('dblclick', () => {
    quoteEl.classList.add('reloading');
    renderGreeting(true);
    setTimeout(() => quoteEl.classList.remove('reloading'), 400);
    info(MODULE, '鼓励语已刷新');
  });
}
