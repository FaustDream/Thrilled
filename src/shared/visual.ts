/**
 * 背景效果的「全局」写入规则（纯函数，可单测）
 *
 * 全局玻璃度 / 模糊度只作用于有玻璃底色的六项（卡片 / 图标容器 / Dock / 搜索框 / 面板 / 菜单）；
 * 图标图形、时间、线条、悬停反馈没有玻璃底，保持各自的值。
 */

import type { BlurKey, BlurSettings, GlassKey, GlassSettings } from './types';

/** 参与全局玻璃度 / 模糊度的控件 */
export const GLASS_KEYS: readonly GlassKey[] = ['card', 'tile', 'dock', 'search', 'panel', 'menu'];

/** 参与全局模糊度的控件（与玻璃底色一一配对） */
export const BLUR_KEYS: readonly BlurKey[] = ['card', 'tile', 'dock', 'search', 'panel', 'menu'];

/** 一次写入六个玻璃底色的透明度（其余项保留） */
export const withGlobalGlass = (glass: GlassSettings, value: number): GlassSettings => {
  const out = { ...glass };
  for (const k of GLASS_KEYS) out[k] = value;
  return out;
};

/** 一次写入六项毛玻璃半径（其余项保留） */
export const withGlobalBlur = (blur: BlurSettings, value: number): BlurSettings => {
  const out = { ...blur };
  for (const k of BLUR_KEYS) out[k] = value;
  return out;
};
