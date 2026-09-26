/**
 * 导出中心
 *
 * - 导出本地数据为 JSON 文件下载
 * - 导入：解析 JSON → 写回 localStorage
 */

import { info, warn } from './logger';
import { collectAppSnapshot, restoreAppSnapshot } from './storage';

const MODULE = 'export';

/** 导出数据结构 */
interface ExportPayload {
  version: '1.0';
  exportedAt: number;
  data: Record<string, unknown>;
}

/** 导出所有数据为 JSON 触发下载 */
export async function exportAllData(): Promise<void> {
  const payload: ExportPayload = {
    version: '1.0',
    exportedAt: Date.now(),
    data: collectAppSnapshot(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date(payload.exportedAt).toISOString().replace(/[:.]/g, '-');
  a.download = `thrilled-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  info(MODULE, `数据已导出`, { keys: Object.keys(payload.data) });
}

/** 导入 JSON 文件 */
export async function importDataFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const payload = JSON.parse(text) as ExportPayload;
    if (typeof payload !== 'object' || payload === null || typeof payload.data !== 'object') {
      throw new Error('非法导出文件结构');
    }
    restoreAppSnapshot(payload.data);
    info(MODULE, `数据已导入`);
  } catch (e) {
    warn(MODULE, `导入失败`, { err: (e as Error).message });
    throw e;
  }
}

/** 初始化导出/导入入口 */
export function initExport(): void {
  document.querySelectorAll('[data-setting-action="exportData"]').forEach((btn) => {
    btn.addEventListener('click', () => void exportAllData());
  });

  // 导入按钮触发隐藏的 #importInput 文件选择框
  const importInput = document.getElementById('importInput') as HTMLInputElement | null;
  document.querySelectorAll('[data-setting-action="importData"]').forEach((btn) => {
    btn.addEventListener('click', () => importInput?.click());
  });

  // #importInput change 事件：解析并导入文件
  importInput?.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (file !== undefined) {
      void importDataFile(file).then(() => {
        importInput.value = '';
      });
    }
  });
}
