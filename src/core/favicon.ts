/**
 * favicon 解析（wiki/05 §5.10）
 *
 * 多级加载策略：
 * 1. IndexedDB favicon 缓存（离线可用）
 * 2. 发 `RESOLVE_FAVICON` 消息给 SW（SW 解析 <link> 图标 + 多路径探测，返回 dataURL）
 * 3. SW 失败 → 页面侧 <img> 直链兜底（浏览器原生 image loader，绕过 SW fetch 的 MIME/重定向限制，
 *    天然支持跨域显示，且走浏览器自身 HTTP/ favicon 缓存）
 * 4. 全部失败 → 纯色背景兜底（使用磁贴 color 属性）
 *
 * 域名白名单校验（R18）：仅允许合法域名格式，防 SSRF。
 */

import { MESSAGE_TYPE } from '../shared/constants';
import { isSafeDomain } from '../shared/guards';
import type { ExtensionResponse } from '../shared/messages';
import type { Tile } from '../shared/types';
import { debug, warn } from './logger';
import { stripHtml } from './utils';

const MODULE = 'favicon';
export const FAVICON_DB_NAME = 'devhome-favicon';
const FAVICON_DB_VERSION = 1;
const FAVICON_STORE = 'favicons';

/** 图标解析结果：图片或文本字形 */
export type TileGlyph =
  | { kind: 'img'; src: string | null; domain: string | null }
  | { kind: 'text'; text: string };

/** 从 URL 提取域名 */
export function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 同步解析磁贴图标字形（占位）
 * - imageData（自定义 base64）由 tiles.ts 直接处理，不在此处
 * - custom + icon → 图片
 * - favicon → 图片（src 置空，由 hydrateFavicons 异步填充）
 * - emoji/text → 文本（首字符 / emoji）
 */
export function resolveTileIcon(tile: Tile): TileGlyph {
  if (tile.type === 'custom' && tile.icon !== '') {
    return { kind: 'img', src: tile.icon, domain: null };
  }
  if (tile.type === 'favicon') {
    const domain = extractDomain(tile.url);
    if (domain !== null && isSafeDomain(domain)) {
      return { kind: 'img', src: null, domain };
    }
    return { kind: 'text', text: firstChar(tile.label) };
  }
  if (tile.icon !== '') {
    return { kind: 'text', text: tile.icon };
  }
  return { kind: 'text', text: firstChar(tile.label) };
}

/** 标签首字符（去 HTML/空白） */
function firstChar(label: string): string {
  const text = stripHtml(label).trim();
  return text.charAt(0) || '?';
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
    warn(MODULE, `favicon 解析失败`, { domain });
    return null;
  }
}

/* ================= 页面侧直链兜底（浏览器原生加载） ================= */

/**
 * 页面侧直链候选顺序：高清 PNG → 通用 .ico → DDG 代理（最后兜底）。
 * 不设 crossOrigin：浏览器可无 CORS 直接显示；缺点是无法读像素写回 IndexedDB，
 * 但浏览器自身 HTTP 缓存会接管后续加载。
 */
function directFallbackCandidates(domain: string): string[] {
  return [
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/favicon-32x32.png`,
    `https://${domain}/favicon.png`,
    `https://${domain}/favicon.ico`,
    // DDG 图标服务作为最后兜底：有图标时返回真实图标，无图标时返回首字母方块（比纯色更友好）
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
}

/**
 * 让 <img> 元素依次尝试一组 URL；首个 onload 即停止，全部 onerror 后调用 finalFail。
 * 不做 dataURL 转换 —— 浏览器直接显示即可。
 */
function tryDirectCandidates(
  img: HTMLImageElement,
  candidates: string[],
  finalFail: () => void,
): void {
  let idx = 0;
  const tryNext = () => {
    const url = candidates[idx];
    if (url === undefined) {
      finalFail();
      return;
    }
    idx++;
    // 保存监听器引用便于卸载
    const onLoad = () => {
      cleanup();
      debug(MODULE, `直链 favicon 加载成功`, { url });
    };
    const onError = () => {
      cleanup();
      tryNext();
    };
    const cleanup = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
    img.src = url;
  };
  tryNext();
}

/* ================= 磁贴图标加载 ================= */

/**
 * 加载磁贴 favicon（多级策略）
 * - IndexedDB 缓存 → SW 解析（dataURL）→ 页面 <img> 直链兜底 → 纯色背景
 */
export async function loadFavicon(
  url: string,
  imgElement: HTMLImageElement,
  iconWrap: HTMLElement,
  _label: string,
  color: string,
): Promise<void> {
  const domain = extractDomain(url);
  if (domain === null || !isSafeDomain(domain)) {
    showColorFallback(imgElement, iconWrap, color);
    return;
  }
  // 1. IndexedDB 缓存
  const cached = await getCachedFavicon(domain);
  if (cached !== null) {
    const onErr = () => {
      // 缓存数据可能已损坏：清缓存 → 继续走 SW/直链
      void (async () => {
        const db = await openFaviconDB();
        if (db !== null) {
          const tx = db.transaction(FAVICON_STORE, 'readwrite');
          tx.objectStore(FAVICON_STORE).delete(domain);
        }
      })();
      trySwThenDirect(domain, imgElement, iconWrap, color);
    };
    imgElement.addEventListener('error', onErr, { once: true });
    imgElement.addEventListener('load', () => imgElement.removeEventListener('error', onErr), { once: true });
    imgElement.src = cached;
    return;
  }
  // 2. SW → 3. 直链 → 4. 纯色
  trySwThenDirect(domain, imgElement, iconWrap, color);
}

/** SW 解析成功则用 dataURL 并写缓存；失败走直链兜底 */
function trySwThenDirect(
  domain: string,
  img: HTMLImageElement,
  iconWrap: HTMLElement,
  color: string,
): void {
  void requestFavicon(domain).then((dataUrl) => {
    if (dataUrl !== null) {
      const onErr = () =>
        tryDirectCandidates(img, directFallbackCandidates(domain), () => showColorFallback(img, iconWrap, color));
      img.addEventListener('error', onErr, { once: true });
      img.addEventListener('load', () => img.removeEventListener('error', onErr), { once: true });
      img.src = dataUrl;
      void cacheFavicon(domain, dataUrl);
      return;
    }
    // SW 失败：走浏览器直链
    debug(MODULE, 'SW 解析失败，回退到直链加载', { domain });
    tryDirectCandidates(img, directFallbackCandidates(domain), () => showColorFallback(img, iconWrap, color));
  });
}

/** 纯色背景兜底：移除 img，容器显示纯色背景 */
function showColorFallback(imgElement: HTMLImageElement, iconWrap: HTMLElement, color: string): void {
  imgElement.remove();
  iconWrap.style.setProperty('--fallback-color', color || '#4a9eff');
  iconWrap.classList.add('tile-icon-fallback');
}
