/**
 * 前后台消息协议（R3：判别联合 + 运行时校验）
 *
 * 所有 `chrome.runtime.sendMessage` / `onMessage` 消息体必须符合本文件判别联合。
 * - 新增消息 = 新增联合成员 + 在 background 路由 switch 中补充分支（never 兜底）。
 * - payload 只含可序列化 JSON，禁止函数/DOM/Map/Set。
 */

import type { MESSAGE_TYPE } from './constants';

/** SW 代理 GET 请求消息体 */
export interface FetchResourceData {
  /** 目标地址（仅允许 http/https） */
  url: string;
  /** json = 返回响应文本；dataurl = 图片等二进制转 dataURL 返回 */
  kind: 'json' | 'dataurl';
}

/** favicon 解析消息体 */
export interface ResolveFaviconData {
  /** 站点域名（SW 侧做格式白名单校验，防 SSRF，R18） */
  domain: string;
}

/** ===== 判别联合：全部 runtime 消息 ===== */
export type ExtensionRequest =
  | { type: typeof MESSAGE_TYPE.RESOLVE_FAVICON; data: ResolveFaviconData }
  | { type: typeof MESSAGE_TYPE.FETCH_RESOURCE; data: FetchResourceData };

/** 响应统一结构：success 判别 */
export type ExtensionResponse<T = unknown> =
  | { success: true; data?: T }
  | { success: false; reason: string };

/** 未识别消息的固定 reason */
export const UNKNOWN_MESSAGE_REASON = 'unknown_message_type' as const;

/** 构造成功响应 */
export function okResponse<T>(data?: T): ExtensionResponse<T> {
  return data === undefined ? { success: true } : { success: true, data };
}

/** 构造失败响应 */
export function errResponse(reason: string): ExtensionResponse<never> {
  return { success: false, reason };
}
