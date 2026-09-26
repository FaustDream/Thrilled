/**
 * 背景管理（对齐原版 js/bgManager.js）
 *
 * - 存储：IndexedDB `thrilled-wallpaper` 存储背景数据（图片/视频 dataURL），
 *         localStorage 仅存储设置项（blur/overlay），避免 localStorage 5MB 配额超限
 * - 上传入口：设置面板「背景」区块（uploadBg → #bgInput 隐藏输入）
 * - 图片压缩到 1920px 宽；视频/图片上限 5MB
 * - 应用：`#bgImage` src + `--bg-blur` CSS 变量 + `#bgOverlay` 遮罩
 */

// v4：UI 交互由 app 层注入
import { error, info, warn } from './logger';
import { clamp } from './utils';
import {
  RAW_KEYS,
  WALLPAPER_DEFAULT_SETTINGS,
  WALLPAPER_JPEG_QUALITY,
  WALLPAPER_MAX_WIDTH,
} from '../shared/constants';
import type { WallpaperSettings } from '../shared/types';
import { localStorageService } from './storage';

/** Toast 类型 */
export type WallpaperToastType = 'success' | 'error' | 'warning' | 'info';

/** 背景模块 UI 回调（由 app 层注入） */
export interface WallpaperUI {
  /** 自动消失通知 */
  toast: (message: string, type: WallpaperToastType) => void;
}

let ui: WallpaperUI = { toast: () => {} };

/** 注入 UI 回调（app 层提供 toast 实现） */
export function setWallpaperUI(next: WallpaperUI): void {
  ui = next;
}

const MODULE = 'wallpaper';
/** 上传大小上限 5MB */
const MAX_SIZE = 5 * 1024 * 1024;
/** 允许的文件类型 */
const ALLOWED_TYPES: readonly string[] = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
];

/** IndexedDB 配置 */
export const WALLPAPER_DB_NAME = 'thrilled-wallpaper';
const WALLPAPER_DB_VERSION = 1;
const WALLPAPER_STORE = 'wallpaper';
const WALLPAPER_DATA_KEY = 'bg_data';

/** 背景数据 */
interface BgData {
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
    if (db === null) return Promise.resolve(null);
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
    if (db === null) return Promise.resolve(false);
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

/* ================= 设置项（仍存 localStorage，因为数据量小） ================= */

/** 读取壁纸设置（默认 blur 0 / overlay 30） */
export function getWallpaperSettings(): WallpaperSettings {
  const parsed = localStorageService.get<Partial<WallpaperSettings> | null>(RAW_KEYS.WALLPAPER_SETTINGS, null);
  return {
    blur: clamp(parsed?.blur ?? WALLPAPER_DEFAULT_SETTINGS.blur, 0, 100),
    overlay: clamp(parsed?.overlay ?? WALLPAPER_DEFAULT_SETTINGS.overlay, 0, 100),
  };
}

/** 应用模糊/遮罩到 CSS */
function applyBlurSettings(): void {
  const settings = getWallpaperSettings();
  const root = document.documentElement;
  root.style.setProperty('--bg-blur', `${settings.blur}px`);
  const bgImage = document.getElementById('bgImage');
  if (bgImage !== null) {
    bgImage.style.filter = 'blur(var(--bg-blur))';
  }
  const bgOverlay = document.getElementById('bgOverlay');
  if (bgOverlay !== null) {
    bgOverlay.style.opacity = String(settings.overlay / 100);
  }
}

/* ================= 背景应用 ================= */

/** 应用背景（图片/视频） */
export function applyBg(bgData: BgData | null): void {
  const bgImage = document.getElementById('bgImage') as HTMLImageElement | null;
  const bgVideo = document.getElementById('bgVideo') as HTMLVideoElement | null;
  if (bgData === null || bgData.type === 'image') {
    if (bgVideo !== null) {
      bgVideo.pause();
      bgVideo.removeAttribute('src');
      bgVideo.load();
      bgVideo.style.display = 'none';
    }
    if (bgImage !== null) {
      if (bgData !== null) {
        bgImage.src = bgData.data;
        bgImage.style.display = '';
      } else {
        bgImage.removeAttribute('src');
        bgImage.style.display = 'none';
      }
    }
  } else {
    if (bgImage !== null) bgImage.style.display = 'none';
    if (bgVideo !== null) {
      bgVideo.src = bgData.data;
      bgVideo.style.display = '';
      void bgVideo.play().catch(() => {});
    }
  }
  applyBlurSettings();
}

/* ================= 保存/读取背景数据 ================= */

/** 保存背景数据到 IndexedDB（同时同步到主存储缓存以支持文件同步快照） */
async function saveBg(bgData: BgData): Promise<boolean> {
  const ok = await idbSet(WALLPAPER_DATA_KEY, bgData);
  if (ok) {
    // 同步到主存储缓存，使 collectAppSnapshot 能获取到壁纸数据用于文件同步
    localStorageService.set(RAW_KEYS.WALLPAPER_BG, bgData);
  }
  return ok;
}

/** 读取背景数据：优先 IndexedDB，回退到主存储缓存/旧版 localStorage（自动迁移） */
async function loadBg(): Promise<BgData | null> {
  // 1. 优先从壁纸专用 IndexedDB 读取
  const fromIdb = await idbGet<BgData>(WALLPAPER_DATA_KEY);
  if (fromIdb !== null && (fromIdb.type === 'image' || fromIdb.type === 'video')) {
    // 同步到主存储缓存，确保文件同步快照能获取到
    localStorageService.set(RAW_KEYS.WALLPAPER_BG, fromIdb);
    return fromIdb;
  }
  // 2. 回退：从主存储缓存（localStorageService → IndexedDB）读取
  const fromCache = localStorageService.get<BgData | null>(RAW_KEYS.WALLPAPER_BG, null);
  if (fromCache !== null && (fromCache.type === 'image' || fromCache.type === 'video')) {
    // 自动迁移到壁纸专用 IndexedDB
    const migrated = await idbSet(WALLPAPER_DATA_KEY, fromCache);
    if (migrated) {
      info(MODULE, '壁纸数据已迁移到专用 IndexedDB');
    }
    return fromCache;
  }
  return null;
}

/* ================= 上传处理 ================= */

/** 上传背景文件 */
export function uploadBg(file: File): void {
  if (file.size > MAX_SIZE) {
    warn(MODULE, `文件过大（最大 5MB）`, { size: file.size });
    ui.toast('文件过大，最大支持 5MB', 'error');
    return;
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    warn(MODULE, `不支持的文件格式: ${file.type}`);
    ui.toast('不支持的文件格式', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const rawData = typeof reader.result === 'string' ? reader.result : '';
    if (rawData === '') return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
      const bgData: BgData = { type: 'video', data: rawData };
      void saveBg(bgData).then((ok) => {
        if (ok) {
          applyBg(bgData);
          ui.toast('视频壁纸已应用', 'success');
        } else {
          ui.toast('壁纸保存失败，可能是存储空间不足', 'error');
        }
      });
    } else {
      compressImage(rawData, (compressed) => {
        const bgData: BgData = { type: 'image', data: compressed };
        void saveBg(bgData).then((ok) => {
          if (ok) {
            applyBg(bgData);
            ui.toast('壁纸已应用', 'success');
          } else {
            ui.toast('壁纸保存失败，可能是存储空间不足', 'error');
          }
        });
      });
    }
  };
  reader.onerror = () => {
    error(MODULE, '文件读取失败');
    ui.toast('文件读取失败', 'error');
  };
  reader.readAsDataURL(file);
}

/** 重置背景 */
export function resetBg(): void {
  void idbRemove(WALLPAPER_DATA_KEY);
  localStorageService.remove(RAW_KEYS.WALLPAPER_BG);
  localStorageService.remove(RAW_KEYS.WALLPAPER_SETTINGS);
  applyBg(null);
  applyBlurSettings();
  ui.toast('背景已重置', 'success');
}

/** 更新模糊度/遮罩 */
export function setBgParams(partial: Partial<WallpaperSettings>): void {
  const next = { ...getWallpaperSettings(), ...partial };
  localStorageService.set(RAW_KEYS.WALLPAPER_SETTINGS, next);
  applyBlurSettings();
}

/** 图片压缩（宽 > 1920 等比缩放，JPEG） */
export function compressImage(rawDataUrl: string, done: (compressed: string) => void): void {
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
      done(rawDataUrl);
      return;
    }
    ctx.drawImage(img, 0, 0, width, height);
    try {
      done(canvas.toDataURL('image/jpeg', WALLPAPER_JPEG_QUALITY));
    } catch {
      done(rawDataUrl);
    }
  };
  img.onerror = () => done(rawDataUrl);
  img.src = rawDataUrl;
}

/* ================= 初始化 ================= */

/** 初始化背景：恢复保存 + 绑定设置面板背景区块 */
export function initWallpaper(): void {
  // 恢复已保存背景（异步从 IndexedDB/旧 localStorage 读取）
  void loadBg().then((bgData) => {
    if (bgData !== null) {
      applyBg(bgData);
    } else {
      applyBg(null);
      applyBlurSettings();
    }
  });
  // 先同步应用默认模糊/遮罩设置，避免等待 IndexedDB 时闪烁
  applyBlurSettings();

  // 绑定隐藏文件输入
  const bgInput = document.getElementById('bgInput') as HTMLInputElement | null;
  bgInput?.addEventListener('change', () => {
    const file = bgInput.files?.[0];
    if (file !== undefined) uploadBg(file);
    bgInput.value = '';
  });

  // 绑定设置面板背景按钮
  document.querySelectorAll('[data-setting-action="uploadBg"]').forEach((btn) => {
    btn.addEventListener('click', () => bgInput?.click());
  });
  document.querySelectorAll('[data-setting-action="resetBg"]').forEach((btn) => {
    btn.addEventListener('click', resetBg);
  });

  // 绑定滑块
  const blurSlider = document.getElementById('sBgBlurSlider') as HTMLInputElement | null;
  const overlaySlider = document.getElementById('sBgOverlaySlider') as HTMLInputElement | null;
  blurSlider?.addEventListener('input', () => {
    setBgParams({ blur: Number(blurSlider.value) });
    const val = document.getElementById('sBgBlurValue');
    if (val !== null) val.textContent = `${blurSlider.value}px`;
  });
  overlaySlider?.addEventListener('input', () => {
    setBgParams({ overlay: Number(overlaySlider.value) });
    const val = document.getElementById('sBgOverlayValue');
    if (val !== null) val.textContent = `${overlaySlider.value}%`;
  });
}
