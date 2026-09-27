/**
 * 导出中心（v4）
 *
 * - 布局导出文件 = 云快照的布局部分：{ v, app, exportedAt, standard, privacy }（01 §5.1）
 * - 本地目录同步快照 = 整份 StoredDoc + 导出时间（file-config 写盘 / 恢复共用）
 * - 布局导入的归一化复用 app/layout.ts 的 readLayoutDoc（坏数据丢弃），本模块不重复实现
 */

import { parseStoredDoc } from '../shared/guards';
import { WIDGET_KINDS } from '../shared/widget-defs';
import type { LayoutDoc, ModePages, StoredDoc } from '../shared/types';
import { info } from './logger';

const MODULE = 'export';

/** 触发浏览器下载 JSON 文件 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  info(MODULE, `已导出 ${filename}`);
}

/** 由当前页面集构造布局导出文档 */
export const buildLayoutDoc = (standard: ModePages, privacy: ModePages): LayoutDoc =>
  ({ v: 4, app: 'Thrilled', exportedAt: new Date().toISOString(), standard, privacy });

/** 本地目录同步快照形状 */
export interface V4Snapshot {
  app: 'Thrilled';
  exportedAt: string;
  doc: StoredDoc;
}

/** 收集整份界面快照（file-config 写盘用） */
export const collectSnapshot = (doc: StoredDoc): V4Snapshot =>
  ({ app: 'Thrilled', exportedAt: new Date().toISOString(), doc: JSON.parse(JSON.stringify(doc)) as StoredDoc });

/**
 * 从快照恢复文档：先过 schema 归一化，坏数据丢弃
 * @returns 恢复后的文档；结构非法返回 null
 */
export const restoreSnapshot = (data: unknown): StoredDoc | null => {
  if (typeof data !== 'object' || data === null) return null;
  const inner = (data as Record<string, unknown>)['doc'] ?? data;
  return parseStoredDoc(inner, WIDGET_KINDS);
};
