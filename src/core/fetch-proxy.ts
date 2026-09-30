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

/** GET 文本（JSON API） */
export async function fetchText(url: string): Promise<string> {
  const viaBg = await sendToBackground({ url, kind: 'json' });
  if (viaBg !== null) return viaBg;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** GET 二进制并转 dataURL（壁纸图片落地用） */
export async function fetchDataUrl(url: string): Promise<string> {
  const viaBg = await sendToBackground({ url, kind: 'dataurl' });
  if (viaBg !== null) return viaBg;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return blobToDataUrl(await res.blob());
}
