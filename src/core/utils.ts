/**
 * 纯逻辑工具函数（无 chrome.* / 无 DOM 依赖，可在 Node 单测）
 */

import { GREETING_PERIODS, GREETING_NIGHT } from '../shared/constants';
import type { Tile, TilePage, CountdownItem } from '../shared/types';

/* ===== ID 生成 ===== */

/** 生成业务 ID：`<prefix>_<ts>_<rand6>` */
export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

/* ===== HTML 处理 ===== */

/** 剥离 HTML 标签为纯文本（纯函数，Node/浏览器通用） */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ===== 磁贴工具 ===== */

/** 磁贴身份指纹：`label|url` */
export function getTileIdentity(tile: Tile): string {
  return `${tile.label}|${tile.url}`;
}

/** 页面磁贴签名（按 identity 排序拼接，用于分类内容修复对比） */
export function getPageTileSignature(page: TilePage): string {
  return page.tiles
    .map(getTileIdentity)
    .slice()
    .sort()
    .join('||');
}

/**
 * 归一化页面状态（修复分类名错位）
 * 以 `page.name || page_names[i] || '第N页'` 归一化
 * @returns { pages, changed }
 */
export function normalizePageState(
  pagesData: readonly TilePage[],
  storedPageNames: readonly string[],
): { pages: TilePage[]; changed: boolean } {
  let changed = false;
  const pages = pagesData.map((page, i) => {
    const fallback = storedPageNames[i] ?? `第${i + 1}页`;
    if (page.name !== fallback) {
      changed = true;
    }
    return { ...page, name: page.name || fallback };
  });
  return { pages, changed };
}

/**
 * 默认分类内容错位修复
 * 仅当页数一致、所有页名都在默认页名集合中、且存在签名错位时执行修复。
 * @returns 修复后的 pages（无需修复时原样返回）
 */
export function repairDefaultCategoryContent(
  pagesData: readonly TilePage[],
  pageNames: readonly string[],
  defaultPagesData: readonly TilePage[],
): TilePage[] {
  // 条件 1：页数不一致 → 不修复
  if (pagesData.length !== defaultPagesData.length) return pagesData.slice();

  const defaultNames = new Set(defaultPagesData.map((p) => p.name));
  // 条件 2：任意页名不在默认页名中 → 不修复
  if (pageNames.some((n) => !defaultNames.has(n))) return pagesData.slice();

  // 默认页名 → 页、默认页名 → 签名、签名 → 默认页名
  const defaultByName = new Map(defaultPagesData.map((p) => [p.name, p]));
  const signatureToDefaultName = new Map(defaultPagesData.map((p) => [getPageTileSignature(p), p.name]));

  let needsRepair = false;
  for (let i = 0; i < pagesData.length; i++) {
    const expected = defaultByName.get(pageNames[i] ?? '');
    const page = pagesData[i];
    if (page === undefined || expected === undefined) continue;
    const curSig = getPageTileSignature(page);
    if (curSig !== getPageTileSignature(expected) && signatureToDefaultName.get(curSig) !== (pageNames[i] ?? '')) {
      needsRepair = true;
      break;
    }
  }
  if (!needsRepair) return pagesData.slice();

  // 修复：按 pageNames[i] 重建每页 tiles，并补齐 position
  return pageNames.map((name) => {
    const def = defaultByName.get(name);
    const tiles = (def?.tiles ?? []).map((t, idx) => ({ ...t, position: idx }));
    return { name, tiles };
  });
}

/** 创建默认磁贴 */
export function createDefaultTile(
  item: { label: string; url: string },
  idx: number,
  seed: string,
): Tile {
  return {
    id: `tile_${seed}_${idx}` as Tile['id'],
    label: item.label,
    url: item.url,
    type: 'favicon',
    icon: '',
    color: '#4a9eff',
    position: idx,
    imageData: '',
  };
}

/* ===== 问候 ===== */

/** 按小时返回时段问候语 */
export function getGreetingByHour(hour: number): string {
  const period = GREETING_PERIODS.find((p) => hour >= p.from && hour < p.to);
  return period?.text ?? GREETING_NIGHT;
}

/* ===== 倒计时 ===== */

export interface CountdownResult {
  /** 剩余天数（可为负） */
  days: number;
  /** 进度 0~100 */
  progress: number;
  /** 是否已过期 */
  isOverdue: boolean;
  /** 是否今天到期 */
  isToday: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 计算倒计时状态 */
export function calcCountdown(item: CountdownItem, now: Date = new Date()): CountdownResult {
  const target = new Date(`${item.targetDate}T00:00:00`).getTime();
  const created = new Date(`${item.createdAt}T00:00:00`).getTime();
  const nowMs = now.getTime();

  const diff = target - nowMs;
  const days = Math.ceil(diff / DAY_MS) + 0;
  const isOverdue = diff < 0;
  const isToday = days === 0;

  let progress = 0;
  if (!isOverdue && target > created) {
    progress = Math.min(100, Math.max(0, ((nowMs - created) / (target - created)) * 100));
  }
  return { days, progress, isOverdue, isToday };
}

/* ===== 数值工具 ===== */

/** 数值钳制 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
