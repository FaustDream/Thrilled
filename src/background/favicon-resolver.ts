/**
 * favicon 解析（SW 侧，wiki/10 + wiki/05 §5.10）
 *
 * 接收页面 `RESOLVE_FAVICON` 请求，解析站点真实 favicon 为 dataURL：
 * 1. 域名白名单校验（R18，防 SSRF）
 * 2. 多候选路径探测：<link rel="icon"> 解析 → 根目录 .ico/.png → apple-touch-icon
 * 3. 宽松 MIME + magic-bytes 双重校验（容忍 CDN/老旧服务端返回的异常 Content-Type）
 * 4. 全部失败 → 返回 null，由页面侧 img 直链 / 第三方服务兜底
 */

import { isSafeDomain } from '../shared/guards';
import { FAVICON_FETCH_TIMEOUT_MS, FAVICON_MAX_BYTES } from '../shared/constants';
import { debug } from '../core/logger';

const MODULE = 'favicon-resolver';

/** 带超时的 fetch（AbortController） */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

/** 可接受的 MIME 前缀（覆盖常见 CDN / 老旧服务端误配） */
const ACCEPTED_MIME_PREFIXES: ReadonlyArray<string> = [
  'image/',
  'application/octet-stream',
  'binary/octet-stream',
  'application/x-icon',
  'application/x-binary',
  'application/ico',
  'application/download',
];

/** magic-bytes 检测：PNG / ICO / GIF / JPEG / WebP / SVG */
function looksLikeImage(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // ICO: 00 00 01 00
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return true;
  // CUR: 00 00 02 00
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x02 && bytes[3] === 0x00) return true;
  // GIF: GIF87a / GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  // SVG: 开头 ASCII 里含 <svg（去除空白/BOM 后）
  const textStart = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 256)).trimStart();
  if (textStart.startsWith('<?xml') || /^<svg[\s>]/i.test(textStart)) return true;
  return false;
}

/** 响应 → dataURL（先看 MIME，再做 magic-bytes 嗅探） */
async function responseToDataUrl(res: Response): Promise<string | null> {
  if (!res.ok) return null;
  const blob = await res.blob();
  if (blob.size === 0 || blob.size > FAVICON_MAX_BYTES) return null;

  // 1. 通过 Content-Type 白名单直接接受
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  const mimeOk = ACCEPTED_MIME_PREFIXES.some((prefix) => contentType.startsWith(prefix));
  if (mimeOk) return await blobToDataUrl(blob);

  // 2. 空/未知 Content-Type：读取前 16 字节做 magic-bytes 嗅探
  if (
    contentType === '' ||
    contentType.includes('text/plain') ||
    contentType.startsWith('application/x-')
  ) {
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (looksLikeImage(head)) return await blobToDataUrl(blob);
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** 从 attr 字符串中提取指定属性值（兼容带单/双引号、无引号写法） */
function getAttr(tag: string, name: string): string | null {
  // 同时匹配 name="xxx" / name='xxx' / name=xxx（无引号直到空格或 >）
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(tag);
  if (m === null) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/** 候选类型优先级：apple-touch-icon(-precomposed) > 常规 icon > shortcut icon > mask-icon */
function relPriority(rel: string): number {
  const r = rel.toLowerCase();
  if (r.includes('mask-icon')) return 0; // Safari 单色 svg，最次
  if (r.includes('apple-touch-icon-precomposed')) return 4; // 高清 PNG，优先
  if (r.includes('apple-touch-icon')) return 3;
  if (/^\s*(?:shortcut\s+)?icon\s*(?:\s|$)/.test(r) && !r.includes('apple')) return 2;
  if (r.includes('icon')) return 1; // 其他 icon 变体
  return 0;
}

/** 首页抓取结果：最终 origin（可能因重定向变化）+ HTML */
interface HomePage {
  origin: string;
  html: string;
}

/** 从 URL 取 origin（fetch 跟随重定向后 res.url 是最终地址；异常时回退到请求地址） */
function originOf(url: string, fallback: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
}

/**
 * 抓站点首页：先 https，失败（证书 / 连接 / 非 2xx / 非 HTML）再试 http。
 * 只探 https 会让只有 http 的老站点连首页都拿不到，后面的 <link> 解析全部落空。
 */
async function fetchHomePage(domain: string): Promise<HomePage | null> {
  for (const proto of ['https', 'http'] as const) {
    const base = `${proto}://${domain}`;
    try {
      const res = await fetchWithTimeout(`${base}/`, FAVICON_FETCH_TIMEOUT_MS);
      if (!res.ok) continue;
      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!contentType.includes('text/html') && contentType !== '') continue;
      const html = await res.text();
      return { origin: originOf(res.url, base), html };
    } catch {
      // 证书错误 / DNS 失败 / 超时：换下一个协议
    }
  }
  return null;
}

/** href → 绝对地址（data: 原样返回；域名不合法返回 null） */
function toAbsolute(raw: string, origin: string): string | null {
  if (raw.startsWith('data:')) return raw;
  try {
    const u = new URL(raw, `${origin}/`);
    return isSafeDomain(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * 从首页 HTML 解析图标 href（按优先级排序，高清图标优先）
 * @returns 绝对 URL 数组（优先级降序，最多 5 个）
 */
export function parseIconLinks(html: string, origin: string): string[] {
  // 匹配 <link ... rel=...icon... ...>；允许 href 在 rel 之前或之后；兼容单/双/无引号
  const linkRe = /<link\b([^>]*?)>/gi;
  type Candidate = { href: string; priority: number };
  const candidates: Candidate[] = [];
  for (const m of html.matchAll(linkRe)) {
    const attrs = m[1] ?? '';
    const rel = getAttr(attrs, 'rel');
    const href = getAttr(attrs, 'href');
    if (rel === null || href === null) continue;
    const pri = relPriority(rel);
    if (pri <= 0) continue;
    // sizes 属性：越大越优先（apple-touch-icon 常带 sizes="180x180"）
    const sizes = getAttr(attrs, 'sizes');
    let sizeBonus = 0;
    if (sizes !== null) {
      const sm = /(\d+)\s*x\s*\d+/i.exec(sizes);
      const sizeStr = sm?.[1];
      if (sizeStr !== undefined) sizeBonus = Math.min(parseInt(sizeStr, 10), 512) / 100;
    }
    candidates.push({ href, priority: pri + sizeBonus });
  }
  candidates.sort((a, b) => b.priority - a.priority);

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const { href } of candidates) {
    const abs = toAbsolute(href, origin);
    if (abs === null || seen.has(abs)) continue;
    seen.add(abs);
    resolved.push(abs);
    if (resolved.length >= 5) break; // 最多取前 5 个候选
  }
  return resolved;
}

/** 按顺序尝试一组 URL，返回首个可转 dataURL 的结果 */
async function tryUrls(urls: readonly string[]): Promise<string | null> {
  for (const url of urls) {
    if (url.startsWith('data:')) return url; // 内联 data URI 直接用
    try {
      const res = await fetchWithTimeout(url, FAVICON_FETCH_TIMEOUT_MS);
      const dataUrl = await responseToDataUrl(res);
      if (dataUrl !== null) return dataUrl;
    } catch {
      // 失败走下一个
    }
  }
  return null;
}

/** 常见图标路径（高清 PNG 优先于传统 .ico；现代站点还会有 svg） */
const COMMON_ICON_PATHS: readonly string[] = [
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/favicon.png',
  '/favicon.svg',
  '/favicon.ico',
];

/**
 * 解析真实 favicon（多级候选）
 * 优先级：HTML <link> 候选（apple-touch-icon > icon > shortcut icon）
 *        → 常见路径（apple-touch-icon → favicon-32/16 → favicon.png/svg/ico）
 * 首页与常见路径都按「https → http」探测，跟随重定向后改用最终 origin。
 * @returns dataURL 或 null
 */
export async function resolveRealFavicon(domain: string): Promise<string | null> {
  if (!isSafeDomain(domain)) return null;

  // 1. 抓首页（https 失败回退 http，跟随重定向），解析 <link rel="icon">
  const home = await fetchHomePage(domain);
  if (home !== null) {
    const dataUrl = await tryUrls(parseIconLinks(home.html, home.origin));
    if (dataUrl !== null) return dataUrl;
  }

  // 2. 常见图标路径：优先用首页实际 origin；抓不到首页时 https 之后再试一轮 http
  const origin = home?.origin ?? `https://${domain}`;
  let dataUrl = await tryUrls(COMMON_ICON_PATHS.map((p) => `${origin}${p}`));
  if (dataUrl !== null) return dataUrl;
  if (home === null) {
    dataUrl = await tryUrls(COMMON_ICON_PATHS.map((p) => `http://${domain}${p}`));
    if (dataUrl !== null) return dataUrl;
  }

  // 站点本来就没有可用图标（很常见），不是异常：开发期用 debug 记录即可
  debug(MODULE, `favicon 解析失败`, { domain });
  return null;
}
