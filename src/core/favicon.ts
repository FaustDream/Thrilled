/**
 * favicon 解析（页面侧）
 *
 * 多级策略（React 渲染路径）：
 * 1. IndexedDB favicon 缓存（离线可用）
 * 2. 发 `RESOLVE_FAVICON` 消息给 SW（SW 解析 <link> 图标 + 多路径探测，返回 dataURL）
 * 3. 都失败 → 返回 null，调用方回退品牌字形占位
 *
 * 域名白名单校验：仅允许合法域名格式，防 SSRF。
 */

import { MESSAGE_TYPE } from '../shared/constants';
import { isSafeDomain } from '../shared/guards';
import type { ExtensionResponse } from '../shared/messages';
import { debug, warn } from './logger';

const MODULE = 'favicon';
export const FAVICON_DB_NAME = 'devhome-favicon';
const FAVICON_DB_VERSION = 1;
const FAVICON_STORE = 'favicons';

/** 从 URL 提取域名 */
export function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/* ================= IndexedDB 缓存 ================= */

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** 打开 favicon IndexedDB（单例） */
export function openFaviconDB(): Promise<IDBDatabase | null> {
  if (dbPromise !== null) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(FAVICON_DB_NAME, FAVICON_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FAVICON_STORE)) {
        db.createObjectStore(FAVICON_STORE, { keyPath: 'domain' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      warn(MODULE, 'favicon DB 打开失败');
      resolve(null);
    };
  });
  return dbPromise;
}

/** 关闭 favicon 数据库连接（供重置时调用） */
export function closeFaviconDB(): void {
  if (dbPromise !== null) {
    void dbPromise.then((db) => {
      if (db !== null) db.close();
      dbPromise = null;
    });
  }
}

/** 读取缓存 favicon dataURL */
export async function getCachedFavicon(domain: string): Promise<string | null> {
  const db = await openFaviconDB();
  if (db === null) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(FAVICON_STORE, 'readonly');
    const req = tx.objectStore(FAVICON_STORE).get(domain);
    req.onsuccess = () => {
      const row = req.result as { domain: string; dataUrl: string } | undefined;
      resolve(typeof row?.dataUrl === 'string' ? row.dataUrl : null);
    };
    req.onerror = () => resolve(null);
  });
}

/** 写缓存 favicon dataURL */
export async function cacheFavicon(domain: string, dataUrl: string): Promise<void> {
  const db = await openFaviconDB();
  if (db === null) return;
  return new Promise((resolve) => {
    const tx = db.transaction(FAVICON_STORE, 'readwrite');
    tx.objectStore(FAVICON_STORE).put({ domain, dataUrl });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/* ================= SW 请求 ================= */

/** 发 RESOLVE_FAVICON 消息给 SW（页面上下文，允许 chrome.runtime） */
export async function requestFavicon(domain: string): Promise<string | null> {
  if (!isSafeDomain(domain)) return null;
  try {
    const res = (await chrome.runtime.sendMessage({
      type: MESSAGE_TYPE.RESOLVE_FAVICON,
      data: { domain },
    })) as ExtensionResponse<string | null>;
    if (res.success && typeof res.data === 'string') {
      return res.data;
    }
    return null;
  } catch {
    debug(MODULE, `favicon 解析失败`, { domain });
    return null;
  }
}

/**
 * 解析站点图标 dataURL：IndexedDB 缓存 → SW 解析（结果写缓存）
 * @returns dataURL；不可用返回 null（调用方回退品牌字形）
 */
export async function resolveFavicon(url: string): Promise<string | null> {
  const domain = extractDomain(url);
  if (domain === null || !isSafeDomain(domain)) return null;
  const cached = await getCachedFavicon(domain);
  if (cached !== null) return cached;
  const dataUrl = await requestFavicon(domain);
  if (dataUrl !== null) {
    void cacheFavicon(domain, dataUrl);
    return dataUrl;
  }
  warn(MODULE, 'favicon 未解析到', { domain });
  return null;
}
