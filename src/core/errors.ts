/**
 * 统一异常体系（禁止裸 throw 非业务异常）
 *
 * 所有业务异常继承 {@link BusinessError}，携带错误码与上下文，便于日志定位。
 */

/** 错误码字面量联合 */
export type ErrorCode = 'INVALID_INPUT' | 'MESSAGE_UNKNOWN_TYPE';

/** 业务异常基类 */
export class BusinessError extends Error {
  readonly code: ErrorCode;
  /** 附加上下文（可序列化，避免敏感信息） */
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.context = context;
  }
}
