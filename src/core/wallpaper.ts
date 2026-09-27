/**
 * 背景管理（v4）
 *
 * 存储：IndexedDB `thrilled-wallpaper`（图片/视频 dataURL），文档中只存引用 id
 *（AppSettings.wallpaperRef，云同步只带引用不带二进制，01 §5.1 / 03 C6）。
 * 图片压缩到 1920px 宽；视频/图片上限 5MB。应用（写入 CSS 变量）由 app 层负责。
 */

import { error, info, warn } from './logger';
import { WALLPAPER_ALLOWED_TYPES, WALLPAPER_JPEG_QUALITY, WALLPAPER_MAX_BYTES, WALLPAPER_MAX_WIDTH } from '../shared/constants';

const MODULE = 'wallpaper';
export const WALLPAPER_DB_NAME = 'thrilled-wallpaper';
const WALLPAPER_DB_VERSION = 1;
const WALLPAPER_STORE = 'wallpaper';

/** 背景数据（IndexedDB 值） */
export interface BgData {
  type: 'image' | 'video';
  data: string;
}

/* ================= IndexedDB 封装 ================= */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openWallpaperDB(): Promise<IDBDatabase | null> {
  if (dbPromise !== null) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(WALLPAPER_DB_NAME, WALLPAPER_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WALLPAPER_STORE)) {
        db.createObjectStore(WALLPAPER_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      warn(MODULE, '壁纸 IndexedDB 打开失败');
      resolve(null);
    };
  });
  return dbPromise;
}

function idbGet<T>(key: string): Promise<T | null> {
  return openWallpaperDB().then((db) => {
    if (db === null) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(WALLPAPER_STORE, 'readonly');
        const req = tx.objectStore(WALLPAPER_STORE).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

function idbSet(key: string, value: unknown): Promise<boolean> {
  return openWallpaperDB().then((db) => {
    if (db === null) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(WALLPAPER_STORE, 'readwrite');
        tx.objectStore(WALLPAPER_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => {
          warn(MODULE, '壁纸 IndexedDB 写入失败', { err: tx.error?.message });
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  });
}

function idbRemove(key: string): Promise<void> {
  return openWallpaperDB().then((db) => {
    if (db === null) return;
    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(WALLPAPER_STORE, 'readwrite');
        tx.objectStore(WALLPAPER_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

/** 关闭壁纸数据库连接（供重置时调用） */
export function closeWallpaperDB(): void {
  if (dbPromise !== null) {
    void dbPromise.then((db) => {
      if (db !== null) db.close();
      dbPromise = null;
    });
  }
}

/* ================= 保存 / 读取 ================= */

/** 引用 id 统一前缀（文档 wallpaperRef 存这个） */
export const WALLPAPER_REF_PREFIX = 'idb:';

/** 保存背景数据，返回引用 id（失败返回 null） */
export async function saveWallpaper(bgData: BgData): Promise<string | null> {
  const ref = `${WALLPAPER_REF_PREFIX}${Date.now().toString(36)}`;
  const ok = await idbSet(ref, bgData);
  if (ok) info(MODULE, `壁纸已保存`, { ref, type: bgData.type });
  return ok ? ref : null;
}

/** 按引用读取背景数据 */
export async function getWallpaper(ref: string): Promise<BgData | null> {
  if (!ref.startsWith(WALLPAPER_REF_PREFIX)) return null;
  const data = await idbGet<BgData>(ref.slice(WALLPAPER_REF_PREFIX.length));
  if (data === null || (data.type !== 'image' && data.type !== 'video')) return null;
  return data;
}

/** 删除背景数据（换壁纸 / 重置时调用；旧文件不清理会占空间） */
export async function deleteWallpaper(ref: string): Promise<void> {
  if (!ref.startsWith(WALLPAPER_REF_PREFIX)) return;
  await idbRemove(ref.slice(WALLPAPER_REF_PREFIX.length));
}

/* ================= 上传处理 ================= */

/** 校验并读取上传文件为 dataURL */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 图片压缩（宽 > 1920 等比缩放，JPEG） */
export function compressImage(rawDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > WALLPAPER_MAX_WIDTH) {
        height = Math.round((height * WALLPAPER_MAX_WIDTH) / width);
        width = WALLPAPER_MAX_WIDTH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', WALLPAPER_JPEG_QUALITY));
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

/**
 * 上传壁纸文件：校验类型与体积 → 保存 IndexedDB
 * @returns 引用 id；校验失败或保存失败返回 null（错误原因经 reject message 区分）
 */
export async function uploadWallpaper(file: File): Promise<string | null> {
  if (file.size > WALLPAPER_MAX_BYTES) {
    throw new Error('文件过大，最大支持 5MB');
  }
  if (!WALLPAPER_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('不支持的文件格式');
  }
  const raw = await readFileAsDataUrl(file);
  if (raw === '') throw new Error('文件读取失败');
  const isVideo = file.type.startsWith('video/');
  const data = isVideo ? raw : await compressImage(raw);
  const ref = await saveWallpaper({ type: isVideo ? 'video' : 'image', data });
  if (ref === null) throw new Error('壁纸保存失败，可能是存储空间不足');
  return ref;
}

/** 诊断日志（保留 v3 的错误上下文习惯） */
export const logWallpaperError = (err: unknown): void => error(MODULE, '壁纸处理失败', err);
