/**
 * 纯逻辑工具函数（无 chrome.* / 无 DOM 依赖，可在 Node 单测）
 */

/* ===== ID 生成 ===== */

/** 生成业务 ID：`<prefix>_<ts>_<rand6>` */
export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

/* ===== HTML 处理 ===== */

/** 剥离 HTML 标签为纯文本（纯函数，Node/浏览器通用） */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ===== URL ===== */

/**
 * 规范化用户输入的网址：无协议时补 https://，只接受 http(s) 且主机名非空。
 * 失败返回 null（调用方负责提示），避免把 "baidu.com" 这类裸域名当成相对地址存取。
 */
export function normalizeSiteUrl(raw: string): string | null {
  const s = raw.trim();
  if (s === '') return null;
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.hostname === '') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * 展示用主机名（去掉协议与路径，保留端口）：图标提示气泡的第二行、书签列表右缘小字都用它。
 * 解析失败原样返回，便于把裸域名 / 异常输入照实显示出来。
 */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/* ===== 问候 ===== */

/** 时段问候（每日一言卡 / 模式说明共用语料） */
export const GREETING_PERIODS: readonly { from: number; to: number; text: string }[] = [
  { from: 5, to: 9, text: '早上好' },
  { from: 9, to: 12, text: '上午好' },
  { from: 12, to: 14, text: '中午好' },
  { from: 14, to: 18, text: '下午好' },
  { from: 18, to: 24, text: '晚上好' },
];
/** 深夜问候（0-5 点） */
export const GREETING_NIGHT = '夜深了' as const;

/** 按小时返回时段问候语 */
export function getGreetingByHour(hour: number): string {
  const period = GREETING_PERIODS.find((p) => hour >= p.from && hour < p.to);
  return period?.text ?? GREETING_NIGHT;
}

/**
 * 相对时间文案（天气详情「x 分钟前更新」用）：不足 1 分钟 / 时间戳非法返回「刚刚」。
 * 只给到分钟级——更细的秒数对「数据有多新」没有帮助。
 */
export function relTimeText(ts: number, now: Date = new Date()): string {
  if (!Number.isFinite(ts)) return '刚刚';
  const diff = now.getTime() - ts;
  if (diff < 60_000) return '刚刚';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/* ===== 数值工具 ===== */

/** 数值钳制 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ===== 日历 ===== */

/** 月历单元格：day 为该格的真实日期数，year / month（1 起）是它实际所属的年月 */
export interface MonthCell {
  day: number;
  /** 是否属于当月（false = 上月末尾 / 下月开头，降透明度显示） */
  inMonth: boolean;
  year: number;
  /** 1–12 */
  month: number;
}

/**
 * 生成某月日历网格（纯函数，日历详情弹窗用）：始终 6 行 × 7 列，周日起头。
 * 补齐格用 Date 自动回退 / 前推，**给出真实日期**（9 月末是 30 号，不能出现 0 / -1 / -2），
 * 调用方据此算出每格自己的农历、节日与宜忌。
 */
export function monthCells(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month, 1);
  const lead = first.getDay(); // 1 号是周几（0 = 周日）
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, i - lead + 1);
    cells.push({
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    });
  }
  const rows: MonthCell[][] = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
  return rows;
}

/* ===== 待办清单 ===== */

/** 待办条目（存在卡片 config.items 里，config 是自由字典，零迁移） */
export interface TodoEntry {
  txt: string;
  done: boolean;
}

/** 待办条目归一化：非数组 / 字段非法一律丢弃；txt 空白剔除；上限 50 条防脏数据撑爆配置 */
export function normTodoItems(v: unknown): TodoEntry[] {
  if (!Array.isArray(v)) return [];
  const out: TodoEntry[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const txt = typeof (raw as { txt?: unknown }).txt === 'string' ? (raw as { txt: string }).txt.trim() : '';
    if (txt === '') continue;
    out.push({ txt, done: (raw as { done?: unknown }).done === true });
    if (out.length >= 50) break;
  }
  return out;
}


/* ===== 搜索历史 ===== */

/**
 * 搜索历史入栈：同一个词去重后前置，按上限截断。
 * 上限来自设置（4–20），这里再夹一次，避免坏值把历史拉成 0 条或无限长。
 */
export function pushHistory(prev: readonly string[], term: string, limit: number): string[] {
  const n = Number.isFinite(limit) ? clamp(Math.round(limit), 4, 20) : 8;
  return [term, ...prev.filter((h) => h !== term)].slice(0, n);
}

/* ===== 日期工具 ===== */

/**
 * 距离目标日期还有几天：今天为 0、已过为负；日期写法支持 2026-10-01 / 2026/10/1 / 2026.10.1。
 * 无法解析（空串 / 形状不对）返回 null，交给调用方决定兜底显示。
 */
export function daysUntil(date: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(date.trim());
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const target = new Date(y, mo - 1, d);
  if (target.getFullYear() !== y || target.getMonth() !== mo - 1 || target.getDate() !== d) return null;
  const a = new Date(y, mo - 1, d).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

/** 平移若干天（本地时区；跨月 / 跨年由 Date 自动进位），返回新日期不改原值 */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 所在周的第一天（周日，与月历网格「日一二三四五六」的列序一致），时间部分清零 */
export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}

/**
 * ISO 周号（周一为一周之始、含第一个周四的那周是第 1 周）：日历详情「第 N 周」标注用。
 * 返回值带所属 ISO 年（12 月末的日期可能属于下一年的第 1 周）。
 */
export function isoWeekOf(d: Date): { year: number; week: number } {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /* ISO：周四所在的那一周定归属——把日期移到本周四再取年 */
  const day = (t.getDay() + 6) % 7;
  const thursday = addDays(t, 3 - day);
  const year = thursday.getFullYear();
  const first = new Date(year, 0, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const firstThursday = addDays(first, (firstDay <= 3 ? 3 - firstDay : 10 - firstDay));
  return { year, week: Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000)) + 1 };
}
