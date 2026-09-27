/**
 * 本地持久化服务（v4）
 *
 * 后端：扩展内 chrome.storage.local；浏览器开发预览回退 localStorage。
 * 两类数据：
 * - v4 界面文档（StoredDoc，单键整存整取：设置 / 布局 / 引擎 / 皮肤 / 历史 / 账号）
 * - 通用 kv 标记（本地目录同步状态等小字符串，file-config 使用）
 * 启动时一次性加载进内存缓存，读同步、写异步落盘（与 v3 的同步门面约定一致）。
 */

import { DOC_KEY } from '../shared/constants';
import { WIDGET_KINDS } from '../shared/widget-defs';
import { parseStoredDoc } from '../shared/guards';
import type { StoredDoc } from '../shared/types';
import { warn } from './logger';

const MODULE = 'storage';

/** chrome.storage.local 是否可用 */
const hasChromeStorage = (): boolean =>
  typeof chrome !== 'undefined' && chrome.storage !== undefined && chrome.storage.local !== undefined;

const cache = new Map<string, unknown>();
let ready = false;

/** 数据变更回调（用于本地目录同步等） */
type ChangeCallback = (key: string, value: unknown) => void;
const changeListeners: Set<ChangeCallback> = new Set();

/** 注册数据变更监听器，返回取消注册函数 */
export function onStorageChange(callback: ChangeCallback): () => void {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

function notifyChange(key: string, value: unknown): void {
  for (const cb of changeListeners) {
    try {
      cb(key, value);
    } catch {
      // 监听器错误不影响主流程
    }
  }
}

/* ================= 后端读写 ================= */

async function backendSet(key: string, value: unknown): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    warn(MODULE, 'localStorage 写入失败', { err: (e as Error).message });
  }
}

async function backendRemove(key: string): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(key);
    return;
  }
  localStorage.removeItem(key);
}

/** 启动时把全部键值加载进内存缓存 */
export async function initStorage(): Promise<void> {
  if (ready) return;
  if (hasChromeStorage()) {
    const all = await chrome.storage.local.get(null);
    for (const [k, v] of Object.entries(all)) cache.set(k, v);
  } else if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        cache.set(key, JSON.parse(raw) as unknown);
      } catch {
        cache.set(key, raw);
      }
    }
  }
  ready = true;
}

/** 清空全部业务数据（恢复出厂用） */
export async function clearAllStorage(): Promise<void> {
  cache.clear();
  if (hasChromeStorage()) {
    await chrome.storage.local.clear();
  } else if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
}

/* ================= 通用 kv（字符串标记 / 结构化值） ================= */

/** 读结构化值 */
export const kvGet = <T>(key: string, fallback: T): T => {
  const v = cache.get(key);
  return v === undefined ? fallback : (v as T);
};

/** 读原始字符串 */
export const kvGetRaw = (key: string): string | null => {
  const v = cache.get(key);
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? v : String(v);
};

/** 写结构化值（立即更新缓存 + 异步落盘） */
export const kvSet = <T>(key: string, value: T): void => {
  cache.set(key, value);
  void backendSet(key, value);
  notifyChange(key, value);
};

/** 写原始字符串 */
export const kvSetRaw = (key: string, value: string): void => {
  kvSet(key, value);
};

/** 删除键 */
export const kvRemove = (key: string): void => {
  cache.delete(key);
  void backendRemove(key);
  notifyChange(key, undefined);
};

/* ================= v4 文档 ================= */

/** 读取 v4 界面文档（未初始化 / 坏数据返回 null，调用方种入出厂布局） */
export const loadDoc = (): StoredDoc | null => {
  const raw = cache.get(DOC_KEY);
  if (raw === undefined) return null;
  return parseStoredDoc(raw, WIDGET_KINDS);
};

/** 写入 v4 界面文档（立即更新缓存 + 异步落盘） */
export const saveDoc = (doc: StoredDoc): void => {
  kvSet(DOC_KEY, doc);
};

/** 序列化原始文档（迁移 / 诊断用） */
export const rawDoc = (): unknown => cache.get(DOC_KEY);
