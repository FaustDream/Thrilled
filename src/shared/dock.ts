/**
 * Dock 快捷方式（settings.dockApps）的纯逻辑：新增去重 / 上限判定与失败文案。
 *
 * 三处共用：添加抽屉的「自定义」页签、抽屉「快捷方式」页签、空白处右键「添加到 Dock 快捷方式」。
 */
import type { DockApp } from './types';

export type DockAddResult = { ok: true; apps: DockApp[] } | { ok: false; reason: 'dup' | 'full' };

/** 追加快捷方式：url 全等视为重复；超过 dockCount 视为满额 */
export const dockAppsWith = (
  apps: readonly DockApp[],
  count: number,
  label: string,
  url: string,
): DockAddResult => {
  if (apps.some((a) => a.url === url)) return { ok: false, reason: 'dup' };
  if (apps.length >= count) return { ok: false, reason: 'full' };
  return { ok: true, apps: [...apps, { name: label, url }] };
};

/** 失败原因 → 提示文案 */
export const dockFailText = (reason: 'dup' | 'full', count: number): string =>
  reason === 'dup' ? '该站点已在 Dock 中' : `Dock 最多 ${count} 个快捷方式，请先移除一些`;
