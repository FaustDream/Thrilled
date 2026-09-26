/**
 * 数据重置模块 — 将扩展恢复到出厂默认状态
 *
 * 清除所有 localStorage、IndexedDB 数据并刷新页面（不预置默认磁贴）。
 *
 * 触发方式：
 * - 控制台：`__thrilledReset()`
 * - 快捷键：Ctrl+Shift+R（在 boot 中绑定，需确认）
 */

import { info } from './logger';
import { FILECONFIG_DB_NAME } from '../shared/constants';
import { closeFileConfigDB } from './file-config';
import { closeWallpaperDB, WALLPAPER_DB_NAME } from './wallpaper';
import { closeFaviconDB, FAVICON_DB_NAME } from './favicon';
import { clearAppStorage } from './storage';

const MODULE = 'reset';

/** ===== 主存储清除 ===== */

async function clearAllStorage(): Promise<void> {
  await clearAppStorage();
  info(MODULE, 'IndexedDB 主存储已清空');
}

/** ===== IndexedDB 删除 ===== */

/** 重试配置 */
const IDB_DELETE_MAX_RETRY = 3;
const IDB_DELETE_RETRY_DELAY_MS = 300;

function deleteDatabase(dbName: string, retryCount = 0): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => {
        info(MODULE, `IndexedDB ${dbName} 已删除`);
        resolve();
      };
      req.onerror = () => {
        info(MODULE, `IndexedDB ${dbName} 删除失败（已忽略）`, { err: String(req.error?.message ?? 'unknown') });
        resolve();
      };
      req.onblocked = () => {
        if (retryCount < IDB_DELETE_MAX_RETRY) {
          info(MODULE, `IndexedDB ${dbName} 删除被占用，${IDB_DELETE_RETRY_DELAY_MS}ms 后重试 (${retryCount + 1}/${IDB_DELETE_MAX_RETRY})`);
          setTimeout(() => {
            void deleteDatabase(dbName, retryCount + 1).then(resolve);
          }, IDB_DELETE_RETRY_DELAY_MS);
        } else {
          info(MODULE, `IndexedDB ${dbName} 删除多次重试仍被占用，跳过（刷新后自动清理）`);
          resolve();
        }
      };
    } catch (e) {
      info(MODULE, `IndexedDB ${dbName} 删除异常（已忽略）`, { err: (e as Error).message });
      resolve();
    }
  });
}

/** ===== 主入口 ===== */

export async function resetAllData(): Promise<void> {
  info(MODULE, '开始重置所有数据...');

  // Step 1: 关闭所有数据库连接（必须在 deleteDatabase 之前）
  closeFileConfigDB();
  closeWallpaperDB();
  closeFaviconDB();

  // Step 2: 清空主存储（localStorage + 主 IndexedDB store）
  await clearAllStorage();

  // Step 3: 删除所有 IndexedDB 数据库
  await deleteDatabase(FILECONFIG_DB_NAME);
  await deleteDatabase(WALLPAPER_DB_NAME);
  await deleteDatabase(FAVICON_DB_NAME);

  info(MODULE, '所有数据已重置，即将刷新页面');
  window.location.reload();
}

/** 暴露到全局 */
declare global {
  interface Window {
    __thrilledReset?: typeof resetAllData;
  }
}
if (typeof window !== 'undefined') {
  window.__thrilledReset = resetAllData;
}
