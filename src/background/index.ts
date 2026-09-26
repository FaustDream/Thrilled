/**
 * Service Worker 入口
 *
 * - onMessage：判别联合路由（isExtensionRequest 守卫 + 穷尽 switch + never 兜底）
 * - RESOLVE_FAVICON：响应页面 favicon 解析请求
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

  const exhaustive: never = req.type;
  throw new BusinessError('MESSAGE_UNKNOWN_TYPE', '未预期的消息类型', { type: exhaustive });
}

info(MODULE, 'Service Worker 就绪');
