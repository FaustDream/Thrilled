/**
 * 倒计时数据管理
 */

import { RAW_KEYS } from '../shared/constants';
import type { CountdownItem } from '../shared/types';
import { localStorageService } from './storage';

/** 读取倒计时列表（校验结构） */
export function getCountdowns(): CountdownItem[] {
  const parsed = localStorageService.get<unknown>(RAW_KEYS.COUNTDOWNS, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isCountdownItem);
}

function isCountdownItem(v: unknown): v is CountdownItem {
  if (typeof v !== 'object' || v === null) return false;
  const item = v as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.targetDate === 'string' &&
    typeof item.createdAt === 'string'
  );
}

/** 保存倒计时列表 */
export function saveCountdowns(items: readonly CountdownItem[]): void {
  localStorageService.set(RAW_KEYS.COUNTDOWNS, items);
}

/** 删除倒计时 */
export function deleteCountdown(id: string): void {
  const next = getCountdowns().filter((c) => c.id !== id);
  saveCountdowns(next);
}
