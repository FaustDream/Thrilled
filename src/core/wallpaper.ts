/**
 * 背景管理（v4）
 *
 * 存储：IndexedDB `thrilled-wallpaper`（图片/视频 dataURL），文档中只存引用 id
 *（AppSettings.wallpaperRef，云同步只带引用不带二进制，01 §5.1 / 03 C6）。
 * 图片压缩到 1920px 宽；视频/图片上限 5MB。应用（写入 CSS 变量）由 app 层负责。
 */

import { error, info, warn } from './logger';
import { WALLPAPER_ALLOWED_TYPES, WALLPAPER_EXT_MAX_BYTES, WALLPAPER_HISTORY_LIMIT, WALLPAPER_JPEG_QUALITY, WALLPAPER_MAX_BYTES, WALLPAPER_MAX_WIDTH } from '../shared/constants';

const MODULE = 'wallpaper';
export const WALLPAPER_DB_NAME = 'thrilled-wallpaper';
const WALLPAPER_DB_VERSION = 1;
const WALLPAPER_STORE = 'wallpaper';

/** 背景数据（IndexedDB 值） */
export interface BgData {
  type: 'image' | 'video';
  /** base64 dataURL（二进制只在库里，文档只存引用） */
  data: string;
  /** 来源原图地址（本地上传为空串）——同时充当去重键的种子 */
  src: string;
  /** 来源展示名（Wallhaven / 本地上传 …），历史列表悬停提示用 */
  from: string;
  /** 落地时间（ms），历史列表排序用 */
  at: number;
}

/** 读取时归一化：早期记录没有 src / from / at 字段，补齐默认值（不改变 data 与 type） */
const normBg = (v: unknown): BgData | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const type = o['type'];
  if ((type !== 'image' && type !== 'video') || typeof o['data'] !== 'string') return null;
  return {
    type,
    data: o['data'],
    src: typeof o['src'] === 'string' ? o['src'] : '',
    from: typeof o['from'] === 'string' ? o['from'] : '早前添加',
    at: typeof o['at'] === 'number' ? o['at'] : 0,
  };
};

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

/**
 * 由种子（源地址 / 图片内容）算出稳定引用键：`idb:` + SHA-256 前 16 位十六进制。
 * 同一张图永远落同一个键，天然带出去重能力；无 SubtleCrypto 时退回时间戳（不去重但可用）。
 */
export async function wallpaperRefOf(seed: string): Promise<string> {
  const subtle = typeof crypto === 'undefined' ? undefined : crypto.subtle;
  if (subtle === undefined) return `${WALLPAPER_REF_PREFIX}${Date.now().toString(36)}`;
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${WALLPAPER_REF_PREFIX}${hex.slice(0, 16)}`;
}

/** 引用键的种子：远程图用来源地址，本地上传用图片内容 */
const seedOf = (bgData: Pick<BgData, 'src' | 'data'>): string =>
  bgData.src === '' ? `data:${bgData.data}` : `url:${bgData.src}`;

/** 保存背景数据，返回引用 id（失败返回 null）；键由种子决定，同一张图重复入库会覆盖同一条记录 */
export async function saveWallpaper(bgData: Omit<BgData, 'at'>): Promise<string | null> {
  const ref = await wallpaperRefOf(seedOf(bgData));
  const ok = await idbSet(ref, { ...bgData, at: Date.now() } satisfies BgData);
  if (ok) info(MODULE, '壁纸已保存', { ref, type: bgData.type });
  return ok ? ref : null;
}

/** 按引用读取背景数据（键 = 完整 ref，与 saveWallpaper 一致） */
export async function getWallpaper(ref: string): Promise<BgData | null> {
  if (!ref.startsWith(WALLPAPER_REF_PREFIX)) return null;
  return normBg(await idbGet<unknown>(ref));
}

/**
 * 按来源地址查已落地的壁纸（应用前先查，命中即可跳过整个下载阶段）。
 * @returns 命中项；未命中或地址为空返回 null
 */
export async function findWallpaperBySource(src: string): Promise<{ ref: string; bg: BgData } | null> {
  if (src === '') return null;
  const ref = await wallpaperRefOf(`url:${src}`);
  const bg = await getWallpaper(ref);
  return bg === null ? null : { ref, bg };
}

/** 全部已落地壁纸，按落地时间倒序（历史壁纸列表用；IndexedDB 原生 getAll，无需额外索引） */
export async function listWallpapers(): Promise<{ ref: string; bg: BgData }[]> {
  const db = await openWallpaperDB();
  if (db === null) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(WALLPAPER_STORE, 'readonly');
      const store = tx.objectStore(WALLPAPER_STORE);
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      tx.oncomplete = () => {
        const keys = keysRequest.result;
        const values = valuesRequest.result;
        const out: { ref: string; bg: BgData }[] = [];
        keys.forEach((k, i) => {
          if (typeof k !== 'string') return;
          const bg = normBg(values[i]);
          if (bg !== null) out.push({ ref: k, bg });
        });
        resolve(out.sort((a, b) => b.bg.at - a.bg.at));
      };
      tx.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * 当前使用中的引用（app 层在壁纸切换后同步过来）。
 * 淘汰只认「刚入库的那张」是不够的：用户从历史里切回旧图后再上传，
 * 那张正在用的旧图会被当成溢出的历史删掉。
 */
let activeRef: string | null = null;

/** 同步当前使用中的引用（app 层壁纸变化时调用）；传 null 表示当前没有壁纸 */
export const markActiveWallpaper = (ref: string | null): void => {
  activeRef = ref;
};

/** 入库后淘汰超额历史：总数保持 WALLPAPER_HISTORY_LIMIT，刚入库的与当前使用中的两项豁免 */
async function pruneWallpapers(justStored: string): Promise<void> {
  const all = await listWallpapers();
  const spared = new Set([justStored, ...(activeRef === null ? [] : [activeRef])]);
  const sparedCount = all.filter((x) => spared.has(x.ref)).length;
  const extra = all.filter((x) => !spared.has(x.ref)).slice(Math.max(0, WALLPAPER_HISTORY_LIMIT - sparedCount));
  for (const x of extra) await idbRemove(x.ref);
  if (extra.length > 0) info(MODULE, '历史壁纸已淘汰', { count: extra.length });
}

/** 删除背景数据（换壁纸 / 重置时调用；旧文件不清理会占空间） */
export async function deleteWallpaper(ref: string): Promise<void> {
  if (!ref.startsWith(WALLPAPER_REF_PREFIX)) return;
  await idbRemove(ref);
}

/**
 * 历史清理的挑选规则（纯函数，便于单测）：除当前使用中的引用外全部待删。
 * @param all 全部已落地记录
 * @param active 当前使用中的引用（null 表示无壁纸）
 */
export const wallpapersToClear = (all: readonly { ref: string }[], active: string | null): string[] =>
  all.filter((x) => x.ref !== active).map((x) => x.ref);

/**
 * 一键清空历史壁纸记录：删除本机已落地的全部壁纸，**当前使用中的那张保留**
 *（否则主界面背景会指向已删除的数据）。
 * @returns 实际删除的张数
 */
export async function clearWallpaperHistory(): Promise<number> {
  const targets = wallpapersToClear(await listWallpapers(), activeRef);
  for (const ref of targets) await idbRemove(ref);
  if (targets.length > 0) info(MODULE, '历史壁纸已清空', { count: targets.length });
  return targets.length;
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
  const ref = await saveWallpaper({ type: isVideo ? 'video' : 'image', data, src: '', from: '本地上传' });
  if (ref === null) throw new Error('壁纸保存失败，可能是存储空间不足');
  await pruneWallpapers(ref);
  return ref;
}

/**
 * 外部壁纸原图入库：按来源地址去重（命中直接复用既有记录）→ 校验体积 → 写入 IndexedDB，
 * 返回引用 id；入库后淘汰超额历史。
 * 与下载（core/fetch-proxy 的 fetchDataUrl）分开，便于 UI 在两步之间展示阶段反馈。
 */
export async function storeRemoteWallpaper(src: string, dataUrl: string, from: string): Promise<string> {
  const hit = await findWallpaperBySource(src);
  if (hit !== null) {
    info(MODULE, '同一来源已落地，跳过重复写入', { ref: hit.ref });
    return hit.ref;
  }
  if (dataUrl.length * 0.75 > WALLPAPER_EXT_MAX_BYTES) throw new Error('图片过大，超过 20MB 上限');
  const ref = await saveWallpaper({ type: 'image', data: dataUrl, src, from });
  if (ref === null) throw new Error('壁纸保存失败，可能是存储空间不足');
  info(MODULE, '外部壁纸已落地', { bytes: Math.round(dataUrl.length * 0.75) });
  await pruneWallpapers(ref);
  return ref;
}

/** 诊断日志（保留 v3 的错误上下文习惯） */
export const logWallpaperError = (err: unknown): void => error(MODULE, '壁纸处理失败', err);
