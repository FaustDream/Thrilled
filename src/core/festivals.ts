/**
 * 节日倒数（纯逻辑，无 DOM / 无 chrome.*，可单测）
 *
 * - 阳历固定节日直接按年计算（元旦 / 劳动节 / 国庆）
 * - 农历节日（春节 / 清明 / 端午 / 中秋）用**对照表**给出 2026–2030 年的公历日期：
 *   不引入整套农历算法；表外年份自动隐藏该行，用户可在卡片配置里自建倒数日补足
 * - 与用户自定义倒数日（卡片 config.entries）合并后按剩余天数升序，渲染侧按卡片高度截取
 */

import { daysUntil } from './utils';

/** 节日定义：solar = [月, 日]（每年固定）；lunar = 公历日期对照表（农历/节气类节日） */
export interface FestivalDef {
  name: string;
  solar?: readonly [number, number];
  lunar?: Readonly<Record<number, string>>;
}

/** 放假节日库（农历类仅收录对照表覆盖的年份） */
export const FESTIVALS: readonly FestivalDef[] = [
  { name: '元旦', solar: [1, 1] },
  { name: '春节', lunar: { 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03' } },
  { name: '清明', lunar: { 2026: '2026-04-05', 2027: '2027-04-05', 2028: '2028-04-04', 2029: '2029-04-04', 2030: '2030-04-05' } },
  { name: '劳动节', solar: [5, 1] },
  { name: '端午', lunar: { 2026: '2026-06-19', 2027: '2027-06-09', 2028: '2028-05-28', 2029: '2029-06-16', 2030: '2030-06-05' } },
  { name: '中秋', lunar: { 2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03', 2029: '2029-09-22', 2030: '2030-09-12' } },
  { name: '国庆', solar: [10, 1] },
];

/** 倒数条目（用户自定义，存在卡片 config.entries；festival 标记来源，渲染与详情弹窗共用） */
export interface CountdownEntry {
  name: string;
  date: string;
  note?: string;
  /** 创建时间戳（ms）：提供后该行显示「距目标」进度条 */
  created?: number;
}

/** 倒数条目归一化：名称与合法日期必需，note/created 可选，上限 20 条防脏数据 */
export function normCountdownEntries(v: unknown): CountdownEntry[] {
  if (!Array.isArray(v)) return [];
  const out: CountdownEntry[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as { name?: unknown; date?: unknown; note?: unknown; created?: unknown };
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const date = typeof o.date === 'string' ? o.date.trim() : '';
    if (name === '' || Number.isNaN(Date.parse(date))) continue;
    out.push({
      name,
      date,
      ...(typeof o.note === 'string' && o.note.trim() !== '' ? { note: o.note.trim() } : {}),
      ...(typeof o.created === 'number' && Number.isFinite(o.created) ? { created: o.created } : {}),
    });
    if (out.length >= 20) break;
  }
  return out;
}

/** 倒数行（渲染模型）：days = 剩余天数；progress ∈ [0,1] 或 null（无起算依据） */
export interface CountdownRow {
  name: string;
  date: string;
  days: number;
  note?: string;
  progress: number | null;
  festival: boolean;
}

/** 阳历节日第 y 年的日期（补零） */
const solarDate = (m: number, d: number, y: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 日期字符串 → 当日本地零点时间戳（避免 Date.parse 的 UTC 语义造成时区偏差） */
const parseDay = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (m === null) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(t) ? null : t;
};

/** 当日本地零点时间戳（进度按自然日计算，不受当前时刻影响） */
const startOfDay = (now: Date): number => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

/** 单个节日的下一次发生（已过则顺延一年；对照表外的农历年份返回 null） */
function nextOccurrence(f: FestivalDef, now: Date): { date: string; prev: string | null } | null {
  const y = now.getFullYear();
  if (f.solar) {
    const [m, d] = f.solar;
    const thisYear = solarDate(m, d, y);
    const dThis = daysUntil(thisYear, now);
    const useThis = dThis !== null && dThis >= 0;
    const next = useThis ? thisYear : solarDate(m, d, y + 1);
    const prevY = useThis ? y - 1 : y;
    return { date: next, prev: solarDate(m, d, prevY) };
  }
  if (f.lunar) {
    const thisYear = f.lunar[y];
    const dThis = thisYear === undefined ? null : daysUntil(thisYear, now);
    if (thisYear !== undefined && dThis !== null && dThis >= 0) {
      return { date: thisYear, prev: f.lunar[y - 1] ?? null };
    }
    const nextYear = f.lunar[y + 1];
    if (nextYear !== undefined) return { date: nextYear, prev: thisYear ?? null };
    return null;
  }
  return null;
}

/** 节日倒数行（含进度：以上一次发生到下一次发生的总天数为分母） */
export function festivalRows(now: Date): CountdownRow[] {
  const rows: CountdownRow[] = [];
  for (const f of FESTIVALS) {
    const occ = nextOccurrence(f, now);
    if (occ === null) continue;
    const days = daysUntil(occ.date, now);
    if (days === null) continue;
    let progress: number | null = null;
    if (occ.prev !== null) {
      const prev = parseDay(occ.prev);
      const next = parseDay(occ.date);
      if (prev !== null && next !== null && next > prev) {
        progress = Math.min(1, Math.max(0, (startOfDay(now) - prev) / (next - prev)));
      }
    }
    rows.push({ name: f.name, date: occ.date, days, progress, festival: true });
  }
  return rows;
}

/** 用户自定义倒数行（created 提供时给进度：自创建到目标日的已流逝比例） */
export function userRows(entries: readonly CountdownEntry[], now: Date): CountdownRow[] {
  return entries.map((e) => {
    const days = daysUntil(e.date, now);
    let progress: number | null = null;
    if (e.created !== undefined) {
      const t = parseDay(e.date);
      if (t !== null && t > e.created && now.getTime() >= e.created) {
        progress = Math.min(1, Math.max(0, (now.getTime() - e.created) / (t - e.created)));
      }
    }
    return {
      name: e.name,
      date: e.date,
      days: days ?? 0,
      ...(e.note !== undefined ? { note: e.note } : {}),
      progress,
      festival: false,
    };
  });
}

/** 合并节日与自定义倒数、按剩余天数升序（渲染侧按卡片高度截取前 N 行） */
export function upcomingRows(
  entries: readonly CountdownEntry[],
  showFestivals: boolean,
  now: Date,
): CountdownRow[] {
  const rows = [...(showFestivals ? festivalRows(now) : []), ...userRows(entries, now)];
  return rows.sort((a, b) => a.days - b.days);
}
