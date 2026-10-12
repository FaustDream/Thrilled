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

/* ===== 数值工具 ===== */

/** 数值钳制 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ===== 日历 ===== */

/**
 * 生成某月日历网格（纯函数，日历详情弹窗用）：始终 6 行 × 7 列，周日起头。
 * 非本月日期照常返回日期数（渲染层降透明度显示），cell.day 为 1 起的日期。
 */
export function monthCells(year: number, month: number): { day: number; inMonth: boolean }[][] {
  const first = new Date(year, month, 1);
  const lead = first.getDay(); // 1 号是周几（0 = 周日）
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - lead + 1;
    cells.push({ day: dayNum, inMonth: dayNum >= 1 && dayNum <= daysIn });
  }
  const rows: { day: number; inMonth: boolean }[][] = [];
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
