/**
 * 统一日志入口（R4：禁止 console.* 散落）
 *
 * 规范：
 * - 交互事件使用 `[交互]` / `[面板]` / `[编辑]` / `[警告]` / `[错误]` / `[模式]` 前缀。
 * - 禁止在循环/高频路径（如 rAF、每秒广播）无节制打日志。
 * - 禁止记录密钥、令牌、完整请求体等敏感信息。
 * - 生产构建（`process.env.NODE_ENV === 'production'`）降噪：info 静默。
 */

export const LOG_TAG = {
  INTERACTION: '[交互]',
  PANEL: '[面板]',
  EDIT: '[编辑]',
  WARN: '[警告]',
  ERROR: '[错误]',
  MODE: '[模式]',
} as const;

type LogTag = (typeof LOG_TAG)[keyof typeof LOG_TAG];

/** 生产构建判定（esbuild 注入 `process.env.NODE_ENV`） */
const IS_PRODUCTION = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

/** 组装带标签与模块名的日志前缀 */
function buildPrefix(module: string, tag?: LogTag): string {
  return tag ? `${tag}[${module}]` : `[${module}]`;
}

/** 信息日志 */
export function info(module: string, message: string, extra?: unknown, tag?: LogTag): void {
  if (IS_PRODUCTION) return;
  // eslint-disable-next-line no-console
  console.info(buildPrefix(module, tag), message, extra ?? '');
}

/** 警告日志 */
export function warn(module: string, message: string, extra?: unknown): void {
  console.warn(buildPrefix(module, LOG_TAG.WARN), message, extra ?? '');
}

/** 错误日志 */
export function error(module: string, message: string, extra?: unknown): void {
  console.error(buildPrefix(module, LOG_TAG.ERROR), message, extra ?? '');
}

/** 调试日志（仅非生产） */
export function debug(module: string, message: string, extra?: unknown): void {
  if (IS_PRODUCTION) return;
  // eslint-disable-next-line no-console
  console.debug(buildPrefix(module), message, extra ?? '');
}

export const logger = { info, warn, error, debug } as const;
