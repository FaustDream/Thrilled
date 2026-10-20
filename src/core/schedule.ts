/**
 * 日程 / 待办（纯逻辑，无 DOM / 无 chrome.*，可单测）
 *
 * 存在日历卡的 config.events 里（config 是自由字典，零迁移）：
 * `{ date: 'YYYY-MM-DD', text: '开会', done: false }`。
 * 与倒计时共用日期口径：按自然日比较，不受当天时刻影响。
 */

import { daysUntil } from './utils';

/** 一条日程 */
export interface ScheduleEvent {
  /** 目标日（YYYY-MM-DD） */
  date: string;
  text: string;
  done: boolean;
}

/** 单卡日程上限（防脏数据把卡片撑爆） */
const MAX_EVENTS = 200;

/** 日期字符串是否合法（YYYY-MM-DD，且是真实存在的日子） */
export const isDateStr = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && daysUntil(s) !== null;

/** 日程归一化：日期合法 + 文本非空才保留 */
export function normScheduleEvents(v: unknown): ScheduleEvent[] {
  if (!Array.isArray(v)) return [];
  const out: ScheduleEvent[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as { date?: unknown; text?: unknown; done?: unknown };
    const date = typeof o.date === 'string' ? o.date.trim() : '';
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!isDateStr(date) || text === '') continue;
    out.push({ date, text, done: o.done === true });
    if (out.length >= MAX_EVENTS) break;
  }
  return out;
}

/** 某天的日程（按录入顺序） */
export const eventsOn = (events: readonly ScheduleEvent[], date: string): ScheduleEvent[] =>
  events.filter((e) => e.date === date);

/** 日期键（YYYY-MM-DD，本地时区） */
export const dayKey = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * 未来日程（含今天），按日期升序、同日按录入顺序；done 的不参与。
 * limit 省略表示不限（卡上按可用行数截取）。
 */
export const upcomingEvents = (events: readonly ScheduleEvent[], now: Date, limit = 0): ScheduleEvent[] => {
  const today = dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const rows = events
    .map((e, i) => ({ e, i, days: daysUntil(e.date, now) }))
    .filter((x) => !x.e.done && x.days !== null && x.days >= 0)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0) || a.i - b.i)
    .map((x) => x.e);
  void today;
  return limit > 0 ? rows.slice(0, limit) : rows;
};

/** 某天的日程是否全部完成（卡上打勾用） */
export const allDoneOn = (events: readonly ScheduleEvent[], date: string): boolean => {
  const list = eventsOn(events, date);
  return list.length > 0 && list.every((e) => e.done);
};
