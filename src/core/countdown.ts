/**
 * 倒计时模式（纯逻辑，无 DOM / 无 chrome.*，可单测）
 *
 * 三种模式可同时启用（config.modes），卡上按固定顺序轮播，也可关掉轮播固定显示第一种。
 * 各模式有独立配置：下班时刻 at / 倒数日目标 date / 纪念日起始 annDate + 标题 + 单位。
 * 旧数据只有一个 mode（单选），归一化时转成单元素 modes，无需迁移脚本。
 */

import { daysUntil } from './utils';

/** 三种模式（顺序即卡上轮播顺序） */
export const COUNTDOWN_MODES = ['下班倒计时', '倒数日', '纪念日'] as const;
export type CountdownMode = (typeof COUNTDOWN_MODES)[number];

/** 模式是否合法 */
export const isCountdownMode = (v: unknown): v is CountdownMode =>
  typeof v === 'string' && (COUNTDOWN_MODES as readonly string[]).includes(v);

/**
 * 归一化模式集合：数组里只留合法项并去重（顺序按 COUNTDOWN_MODES）；
 * 空数组 / 非法值回退到旧键 mode（兼容存量单模式数据），再不行用「下班倒计时」。
 */
export function normModes(v: unknown, legacyMode?: unknown): CountdownMode[] {
  const raw = Array.isArray(v) ? v.filter(isCountdownMode) : [];
  if (raw.length > 0) return COUNTDOWN_MODES.filter((m) => raw.includes(m));
  if (isCountdownMode(legacyMode)) return [legacyMode];
  return ['下班倒计时'];
}

/** 主读数模型：hint 为上方说明行，value 为主数字/时间，unit 为单位后缀，sub 为附加行（日期） */
export interface CountdownReadout {
  mode: CountdownMode;
  hint: string;
  value: string;
  unit: string;
  /** 是否为倒计时（HH:MM:SS）形态——样式据此决定字距与颜色 */
  timer: boolean;
  /** 附加说明行（倒数日 / 纪念日显示目标日期），空串表示不显示 */
  sub: string;
}

/** 下班时刻的秒数（解析失败回退 18:00） */
const endSeconds = (at: string, now: Date): number => {
  const [hh, mm] = at.split(':');
  const h = Number(hh);
  const m = Number(mm);
  const end = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
    Number.isFinite(h) && h >= 0 && h <= 23 ? h : 18,
    Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0,
    0,
  );
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
};

/** 两位补零 */
const p2 = (n: number): string => String(n).padStart(2, '0');

/** 纪念日单位换算（周 7 天 / 月 30 天 / 年 365 天，与旧组件同一口径） */
const unitValue = (days: number, unit: string): number =>
  unit === '周' ? Math.floor(days / 7)
    : unit === '月' ? Math.floor(days / 30)
      : unit === '年' ? Math.floor(days / 365)
        : days;

/** 单个模式的读数（纯函数） */
export function readoutOf(
  mode: CountdownMode,
  c: Record<string, unknown>,
  now: Date,
  str: (v: unknown, d?: string) => string,
): CountdownReadout {
  if (mode === '下班倒计时') {
    const secs = endSeconds(str(c['at'], '18:00'), now);
    return {
      mode,
      hint: '坚持住，距下班只有',
      value: `${p2(Math.floor(secs / 3600))}:${p2(Math.floor(secs / 60) % 60)}:${p2(secs % 60)}`,
      unit: '',
      timer: true,
      sub: '',
    };
  }
  if (mode === '纪念日') {
    const date = str(c['annDate'], str(c['date'], '2020-05-20'));
    const left = daysUntil(date, now);
    const unit = str(c['unitLabel'], '天');
    const past = left === null ? null : Math.abs(left);
    return {
      mode,
      hint: str(c['title'], '与MiNa相识'),
      value: past === null ? '--' : String(unitValue(past, unit)),
      unit,
      timer: false,
      sub: date,
    };
  }
  const date = str(c['date'], '2027-01-01');
  const left = daysUntil(date, now);
  return {
    mode,
    hint: '距离目标日',
    value: left === null ? '--' : String(Math.abs(left)),
    unit: left !== null && left < 0 ? '天前' : '天',
    timer: false,
    sub: date,
  };
}

/**
 * 轮播当前应显示哪一个模式：index 由调用方按时钟推进（每 N 秒 +1），这里只做安全取模。
 * modes 为空时返回「下班倒计时」占位。
 */
export const rotateMode = (modes: readonly CountdownMode[], index: number): CountdownMode =>
  modes[((index % Math.max(1, modes.length)) + Math.max(1, modes.length)) % Math.max(1, modes.length)]
  ?? '下班倒计时';
