/**
 * 使用记录（本机习惯，v5.0.35）
 *
 * 只为一件事存在：面板在空输入时先给「最近打开」，省掉翻页找站那一步。
 * 它是本机习惯，不属于配置——因此**不进文档、不随导出、不参与目录同步**，
 * 单独一个 localStorage 键，随「重置 / 清空数据」一起清，滚动保留 30 天。
 */

import { siteUrlOf } from './brands';
import { cfgOf } from '../shared/widget-defs';
import type { GridItem } from '../shared/types';

/** 一条使用记录（同一地址只留一份，计数累加） */
export interface UsageEntry {
  /** 30 天窗口内的次数（「按频率整理」用） */
  n: number;
  /** 最后一次打开的时间戳（ms） */
  last: number;
  /** 显示名（站点名 / 卡片名） */
  label: string;
  /** app = 直接开站点；card = 打开卡片详情 */
  kind: 'app' | 'card';
  /** 站点地址（card 为空） */
  url: string;
  /** 所属卡片 id（站点类用于「按频率整理」，也可用来找回名字） */
  cardId: string;
}

const USAGE_KEY = 'thrilled:usage';
/** 滚动窗口：三个月前点过三次的站不该排在最前面 */
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** 记录条数上限（防脏数据把键写爆） */
const MAX_ENTRIES = 200;

/** 站点类记录的键（同一地址合并计数） */
export const usageKeyOfUrl = (url: string): string => `u:${url}`;
/** 卡片类记录的键 */
export const usageKeyOfCard = (cardId: string): string => `c:${cardId}`;

/** 丢掉超出窗口的条目（纯函数，便于单测） */
export const pruneUsage = (all: Readonly<Record<string, UsageEntry>>, now: number): Record<string, UsageEntry> =>
  Object.fromEntries(Object.entries(all).filter(([, e]) => Number.isFinite(e.last) && now - e.last <= WINDOW_MS));

/** 按最后打开时间倒序取前 limit 条（纯函数） */
export const topRecent = (
  all: Readonly<Record<string, UsageEntry>>,
  limit: number,
): { key: string; entry: UsageEntry }[] =>
  Object.entries(all)
    .sort((a, b) => b[1].last - a[1].last)
    .slice(0, Math.max(0, limit))
    .map(([key, entry]) => ({ key, entry }));

const readAll = (): Record<string, UsageEntry> => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return pruneUsage(parsed as Record<string, UsageEntry>, Date.now());
  } catch {
    return {};
  }
};

/**
 * 记一次打开。
 * @param key usageKeyOfUrl / usageKeyOfCard 生成的键
 */
export const recordUsage = (
  key: string,
  info: { label: string; kind: UsageEntry['kind']; url: string; cardId: string },
): void => {
  if (typeof localStorage === 'undefined') return;
  const all = readAll();
  const prev = all[key];
  all[key] = {
    n: (prev?.n ?? 0) + 1,
    last: Date.now(),
    label: info.label,
    kind: info.kind,
    url: info.url,
    cardId: info.cardId,
  };
  /* 超出上限时按最后打开时间淘汰最旧的 */
  const kept = Object.entries(all)
    .sort((a, b) => b[1].last - a[1].last)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* 存储不可用：最近打开退化为空，不影响其它功能 */
  }
};

/** 整份使用记录（「按使用频率整理」用；不做裁剪以外的加工） */
export const readUsage = (): Record<string, UsageEntry> => readAll();

/**
 * 一张图标类卡片的权重：「网站图标」取自身地址的次数，
 * 「图标格容器」取格内所有应用次数之和（格子里点得多的那些就该往前排）。
 */
export const cardWeightOf = (item: GridItem, all: Readonly<Record<string, UsageEntry>>): number => {
  const n = (key: string): number => all[key]?.n ?? 0;
  const cfg = cfgOf(item);
  if (item.t === 'group') {
    const apps = Array.isArray(cfg['apps']) ? cfg['apps'] : [];
    return apps.reduce<number>((sum, name) => {
      const url = typeof name === 'string' ? siteUrlOf(name) : null;
      return sum + (url === null ? 0 : n(usageKeyOfUrl(url)));
    }, 0);
  }
  const explicit = typeof cfg['url'] === 'string' ? cfg['url'] : '';
  const label = typeof cfg['label'] === 'string' ? cfg['label'] : '';
  const url = /^https?:\/\//.test(explicit) ? explicit : siteUrlOf(label);
  return url === null ? n(usageKeyOfCard(item.id)) : n(usageKeyOfUrl(url));
};

/** 最近打开（倒序；面板空输入时用） */
export const recentUsage = (limit: number): { key: string; entry: UsageEntry }[] => topRecent(readAll(), limit);

/** 清空使用记录（随「重置 / 清空数据」一起调用） */
export const clearUsage = (): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(USAGE_KEY);
  } catch {
    /* 存储不可用：无需处理 */
  }
};
