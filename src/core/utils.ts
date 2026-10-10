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
