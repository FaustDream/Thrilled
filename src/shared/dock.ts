/**
 * Dock 快捷方式（settings.dockApps）的纯逻辑：新增去重与失败文案。
 *
 * 两处共用：添加抽屉的「自定义」页签、「快捷方式」页签。
 * 数量不设上限：Dock 是横向窄条，装不下时用户自己把图标档位调小。
 */
import type { DockApp, DockIconSize } from './types';

export type DockAddResult = { ok: true; apps: DockApp[] } | { ok: false; reason: 'dup' };

/** 三档设置项的显示顺序与名称 */
export const DOCK_ICON_OPTIONS: readonly { k: DockIconSize; n: string }[] = [
  { k: 'sm', n: '小' },
  { k: 'md', n: '中' },
  { k: 'lg', n: '大' },
];

/**
 * 三档的渲染尺寸（px）：item 是每格占位，box 是图标底板，ico 是 favicon，fn 是功能键字形。
 * 单一来源——CSS 只读这里的变量，Dock 与页面图标的六档尺寸互不影响。
 */
export const DOCK_ICON_METRICS: Record<DockIconSize, { item: number; box: number; ico: number; fs: number; fn: number }> = {
  sm: { item: 52, box: 38, ico: 30, fs: 18, fn: 17 },
  md: { item: 64, box: 46, ico: 38, fs: 24, fn: 21 },
  lg: { item: 74, box: 56, ico: 46, fs: 28, fn: 26 },
};

/** 追加快捷方式：url 全等视为重复 */
export const dockAppsWith = (apps: readonly DockApp[], label: string, url: string): DockAddResult => {
  if (apps.some((a) => a.url === url)) return { ok: false, reason: 'dup' };
  return { ok: true, apps: [...apps, { name: label, url }] };
};

/** 重复添加的提示文案（三处共用） */
export const DOCK_DUP_TEXT = '该站点已在 Dock 中';
