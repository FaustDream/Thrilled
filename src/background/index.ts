/**
 * Service Worker 入口
 *
 * - onMessage：判别联合路由（isExtensionRequest 守卫 + 穷尽 switch + never 兜底）
 * - RESOLVE_FAVICON：响应页面 favicon 解析请求
 * - FETCH_RESOURCE：SW 代理 GET（外部壁纸源 API / 图片下载，绕过页面 CORS）
 */

import { error, info } from '../core/logger';
import { BusinessError } from '../core/errors';
import { MESSAGE_TYPE } from '../shared/constants';
import {
  errResponse,
  okResponse,
  UNKNOWN_MESSAGE_REASON,
} from '../shared/messages';
import type { ExtensionRequest, ExtensionResponse } from '../shared/messages';
import { isExtensionRequest } from '../shared/guards';
import { resolveRealFavicon } from './favicon-resolver';

const MODULE = 'background';

/* ================= 消息路由 ================= */

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (res: ExtensionResponse) => void) => {
    void routeMessage(message)
      .then(sendResponse)
      .catch((e: unknown) => {
        error(MODULE, '消息处理失败', e);
        sendResponse(errResponse('internal_error'));
      });
    return true; // 异步响应
  },
);

/** SW 代理 GET：json 返回响应文本，dataurl 返回二进制 dataURL（host_permissions 已覆盖 https） */
async function proxyFetch(data: { url: string; kind: 'json' | 'dataurl' }): Promise<string> {
  if (!/^https?:\/\//.test(data.url)) throw new BusinessError('MESSAGE_BAD_REQUEST', '仅支持 http(s) 地址', { url: data.url });
  const res = await fetch(data.url);
  if (!res.ok) throw new BusinessError('MESSAGE_BAD_REQUEST', `upstream_${res.status}`, { status: res.status });
  if (data.kind === 'json') return res.text();
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
  return dataUrl;
}

async function routeMessage(message: unknown): Promise<ExtensionResponse> {
  if (!isExtensionRequest(message)) {
    return errResponse(UNKNOWN_MESSAGE_REASON);
  }
  const req: ExtensionRequest = message;

  if (req.type === MESSAGE_TYPE.RESOLVE_FAVICON) {
    const dataUrl = await resolveRealFavicon(req.data.domain);
    if (dataUrl === null) return errResponse('favicon_not_found');
    return okResponse(dataUrl);
  }

  if (req.type === MESSAGE_TYPE.FETCH_RESOURCE) {
    return okResponse(await proxyFetch(req.data));
  }

  const exhaustive: never = req;
  throw new BusinessError('MESSAGE_UNKNOWN_TYPE', '未预期的消息类型', { type: exhaustive });
}

info(MODULE, 'Service Worker 就绪');
