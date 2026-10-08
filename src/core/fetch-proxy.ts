/**
 * 网络请求代理（v4.4）
 *
 * 页面上下文的 fetch 受 CORS 限制：扩展环境把 GET 请求转交 Service Worker
 * （manifest host_permissions 已覆盖全部 https 域名），开发预览无 SW 时回退直连。
 * 仅支持 http(s)；json 返回响应文本，dataurl 返回二进制 dataURL。
 */

import { MESSAGE_TYPE } from '../shared/constants';
import type { ExtensionResponse, FetchResourceData } from '../shared/messages';

const backgroundAvailable = (): boolean =>
  typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function';

/** 经 SW 代理请求，失败（非扩展环境 / 上游错误 / 未配置权限）返回 null 由调用方回退直连 */
async function sendToBackground(data: FetchResourceData): Promise<string | null> {
  if (!backgroundAvailable()) return null;
  try {
    const res = (await chrome.runtime.sendMessage({
      type: MESSAGE_TYPE.FETCH_RESOURCE,
      data,
    })) as ExtensionResponse<string>;
    return res.success && typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取响应失败'));
    reader.readAsDataURL(blob);
  });

/** 下载进度回调（字节；total = 0 表示总量不可知，如经 SW 代理拿不到 Content-Length） */
export type ProgressFn = (loaded: number, total: number) => void;

/** 流式读取响应体并按字节回报进度（响应不支持流时退化为一次性读取） */
async function readBlobWithProgress(res: Response, onProgress: ProgressFn): Promise<Blob> {
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body?.getReader();
  if (reader === undefined) {
    const whole = await res.blob();
    onProgress(whole.size, whole.size);
    return whole;
  }
  const parts: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    /* 拷贝到独立 ArrayBuffer 段：避免把 SharedArrayBuffer 视图直接交给 Blob（类型不兼容） */
    const seg = new Uint8Array(value.byteLength);
    seg.set(value);
    parts.push(seg.buffer);
    loaded += seg.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(parts, { type: res.headers.get('content-type') ?? 'application/octet-stream' });
}

/** GET 文本（JSON API） */
export async function fetchText(url: string): Promise<string> {
  const viaBg = await sendToBackground({ url, kind: 'json' });
  if (viaBg !== null) return viaBg;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** GET 二进制并转 dataURL（壁纸图片落地用）；直连时按字节回报下载进度 */
export async function fetchDataUrl(url: string, onProgress?: ProgressFn): Promise<string> {
  const viaBg = await sendToBackground({ url, kind: 'dataurl' });
  if (viaBg !== null) {
    onProgress?.(0, 0);
    return viaBg;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return blobToDataUrl(await readBlobWithProgress(res, onProgress ?? (() => {})));
}
