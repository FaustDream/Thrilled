/**
 * 实例级样式（配置弹窗「样式」段）的共享定义与归一化
 *
 * - 四个样式键在实例 config 与 settings.styleDefaults 里共用同一份白名单与范围
 * - normStyle：非法值丢弃、比例限幅到 0.6–1.6、圆角 0–32px、颜色只认 #rrggbb
 * - withoutStyle：套用预设前清空样式键（避免上一份预设残留）
 * - STYLE_PRESETS：紧凑 / 标准（清空）/ 宽松 三档一键预设
 * 纯函数无 React 依赖 → app（渲染 / 编辑弹窗）与 shared（设置归一化）共用。
 */
import type { WidgetStyle } from './types';

/** 样式键白名单（config 与 settings.styleDefaults 共用） */
export const STYLE_KEYS = ['fontScale', 'iconScale', 'radius', 'textColor'] as const;

/** 比例键的取值范围（与编辑弹窗滑块一致） */
export const STYLE_RATIO_MIN = 0.6;
export const STYLE_RATIO_MAX = 1.6;
/** 卡片圆角上限（px） */
export const STYLE_RADIUS_MAX = 32;

const hexOk = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);

const ratioOf = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(STYLE_RATIO_MAX, Math.max(STYLE_RATIO_MIN, v))
    : undefined;

/** 归一化一组样式项：非法值丢弃，比例限幅 */
export const normStyle = (raw: unknown): WidgetStyle => {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: WidgetStyle = {};
  const fs = ratioOf(o['fontScale']);
  if (fs !== undefined) out.fontScale = fs;
  const ico = ratioOf(o['iconScale']);
  if (ico !== undefined) out.iconScale = ico;
  const r = o['radius'];
  if (typeof r === 'number' && Number.isFinite(r)) out.radius = Math.min(STYLE_RADIUS_MAX, Math.max(0, Math.round(r)));
  const tc = o['textColor'];
  if (typeof tc === 'string' && hexOk(tc)) out.textColor = tc;
  return out;
};

/** 空样式（没有默认样式）：四个键都未设置 */
export const isBlankStyle = (s: WidgetStyle): boolean => STYLE_KEYS.every((k) => s[k] === undefined);

/** 从实例 config（或任意片段）里挑出样式项，非法值丢弃（复制到同类卡片 / 设为默认样式用） */
export const styleSliceOf = (c: unknown): WidgetStyle => normStyle(c);

/** 去掉 config 里的四个样式键（套预设前先清空；其余键原样保留） */
export const withoutStyle = (c: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (!(STYLE_KEYS as readonly string[]).includes(k)) out[k] = v;
  }
  return out;
};

/** 从「按类型默认样式」表里移除某类型（不改原对象；空表即「无任何默认样式」） */
export const withoutStyleDefault = (map: Record<string, WidgetStyle>, t: string): Record<string, WidgetStyle> => {
  const out: Record<string, WidgetStyle> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k !== t) out[k] = v;
  }
  return out;
};

/** 一键预设：紧凑 / 标准（清空样式项，回到跟随主题）/ 宽松 */
export const STYLE_PRESETS: readonly (readonly [string, WidgetStyle])[] = [
  ['紧凑', { fontScale: 0.85, iconScale: 0.85, radius: 10 }],
  ['标准', {}],
  ['宽松', { fontScale: 1.15, iconScale: 1.15, radius: 22 }],
];
