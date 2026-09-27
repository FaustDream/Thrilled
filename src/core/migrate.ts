/**
 * v3 → v4 一次性数据迁移（R8 / 03 文档 B13）
 *
 * v3 数据存于 IndexedDB `ThrilledAppData`（kv store）：
 * - 迁移范围（B13 建议）：磁贴 → 网址图标实例；引擎顺序与当前引擎 → v4 引擎；
 *   搜索历史 / 昵称 / 自动聚焦等设置；壁纸二进制在同名 IndexedDB（thrilled-wallpaper），
 *   只需在文档里接上引用
 * - 不迁移：分组概念（v4 由网格替代，03 文档 C14）、仅会话内有效的状态
 * - 迁移完成写入 MIGRATED_KEY 标记，不重复执行；失败静默跳过（不阻塞启动）
 */

import { MIGRATED_KEY } from '../shared/constants';
import { COLS, MAX_PAGES, ROWS, findSlot } from '../shared/grid';
import { BUILTIN_ENGINES, type AppSettings, type EngineDef, type GridItem, type ModePages } from '../shared/types';
import { info, warn } from './logger';
import { kvGetRaw, kvSetRaw } from './storage';

const MODULE = 'migrate';

const APP_DB_NAME = 'ThrilledAppData';
const APP_DB_STORE = 'kv';
/** 旧壁纸 IndexedDB 的数据键（wallpaper.ts 同名库直接可读） */
export const OLD_WALLPAPER_KEY = 'bg_data';

/** v3 旧设置键（localStorage 语义） */
const OLD = {
  PAGES: 'pages',
  ENGINE: 'engine',
  ENGINE_ORDER: 'engine_order',
  SEARCH_HISTORY: 'search_history',
  NICKNAME: 'config_nickname',
  AUTO_FOCUS: 'auto_focus',
  SEARCH_RETAIN: 'search_retain',
  SEARCH_HIDE_BTN: 'search_hide_btn',
} as const;

/** v3 EngineId → v4 引擎 id（v3 独有引擎无对应项，丢弃） */
const ENGINE_ID_MAP: Readonly<Record<string, string>> = {
  google: 'google', bing: 'bing', baidu: 'baidu', zhihu: 'zhihu', weibo: 'weibo', duckduckgo: 'duckduckgo',
};

/** 读取旧 IndexedDB 全部键值 */
async function readOldKv(): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (typeof indexedDB === 'undefined') return out;
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(APP_DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => resolve(null); // 库不存在 → 无旧数据
  });
  if (db === null) return out;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(APP_DB_STORE, 'readonly');
    const req = tx.objectStore(APP_DB_STORE).getAll();
    req.onsuccess = () => {
      for (const row of req.result as unknown[]) {
        if (typeof row === 'object' && row !== null) {
          const o = row as Record<string, unknown>;
          if (typeof o['key'] === 'string') out.set(o['key'], o['value']);
        }
      }
      resolve();
    };
    req.onerror = () => resolve();
  });
  db.close();
  return out;
}

/** v3 分页数组（TilePage[]）→ 网址图标条目（扁平，去重） */
function toEntries(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const page of raw) {
    if (typeof page !== 'object' || page === null) continue;
    const tiles = (page as Record<string, unknown>)['tiles'];
    if (!Array.isArray(tiles)) continue;
    for (const t of tiles) {
      if (typeof t !== 'object' || t === null) continue;
      const label = typeof (t as Record<string, unknown>)['label'] === 'string' ? (t as Record<string, unknown>)['label'] as string : '';
      const url = typeof (t as Record<string, unknown>)['url'] === 'string' ? (t as Record<string, unknown>)['url'] as string : '';
      if (label === '') continue;
      const key = `${label}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, url });
    }
  }
  return out;
}

/**
 * 出厂布局在前、迁移图标追加为后续新页（每页尽量装满 2×2 图标，最多 5 页）
 * 纯函数：v3 用户保留完整出厂观感，自己的图标不丢。
 */
export function appendIconPages(
  factoryStandard: ModePages,
  entries: readonly { label: string; url: string }[],
): { pages: ModePages; appended: number } {
  const pages: ModePages = factoryStandard.map((pg) => pg.map((it) => ({ ...it, config: { ...it.config } })));
  // 出厂已有的图标（label|url 相同）不重复追加
  const factoryKeys = new Set(
    factoryStandard.flat().filter((it) => it.t === 'icon').map((it) => `${String(it.config['label'] ?? '')}|${String(it.config['url'] ?? '')}`),
  );
  let appended = 0;
  let page: GridItem[] = [];
  let seq = 0;
  const flush = (): void => {
    if (page.length > 0) {
      pages.push(page);
      page = [];
    }
  };
  for (const entry of entries) {
    const key = `${entry.label}|${entry.url}`;
    if (factoryKeys.has(key)) continue;
    let slot = findSlot(page, 2, 2);
    if (slot === null) {
      flush();
      if (pages.length >= MAX_PAGES) break;
      slot = { c: 0, r: 0 };
    }
    page.push({
      id: `m${Date.now().toString(36)}${seq++}`,
      c: slot.c, r: slot.r, w: 2, h: 2, t: 'icon',
      config: { label: entry.label, url: entry.url },
    });
    appended++;
  }
  flush();
  return { pages, appended };
}

/** 迁移结果（由 app 层并入初始文档） */
export interface MigrationResult {
  standard: ModePages;
  engines: EngineDef[];
  settings: Partial<AppSettings>;
  history: string[];
  /** 追加的迁移图标数量 */
  appended: number;
}

/** v3 引擎顺序 + 当前引擎 → v4 引擎清单（内置表重排，未收录的引擎丢弃） */
function mapEngines(order: unknown, current: unknown): { engines: EngineDef[]; engineId: string } {
  const byId = new Map(BUILTIN_ENGINES.map((e) => [e.id, e]));
  const ordered: EngineDef[] = [];
  if (Array.isArray(order)) {
    for (const id of order) {
      const mapped = typeof id === 'string' ? byId.get(ENGINE_ID_MAP[id] ?? '') : undefined;
      if (mapped && !ordered.some((x) => x.id === mapped.id)) ordered.push({ ...mapped });
    }
  }
  for (const e of BUILTIN_ENGINES) {
    if (!ordered.some((x) => x.id === e.id)) ordered.push({ ...e });
  }
  const cur = ENGINE_ID_MAP[typeof current === 'string' ? current : ''] ?? 'baidu';
  return { engines: ordered, engineId: byId.has(cur) ? cur : 'baidu' };
}

/** 执行迁移（幂等：已迁移或无旧数据返回 null；factoryStandard 由调用方提供出厂布局） */
export async function migrateV3(factoryStandard: ModePages): Promise<MigrationResult | null> {
  if (kvGetRaw(MIGRATED_KEY) === '1') return null;
  let old: Map<string, unknown>;
  try {
    old = await readOldKv();
  } catch (e) {
    warn(MODULE, '读取旧数据失败，跳过迁移', { err: (e as Error).message });
    kvSetRaw(MIGRATED_KEY, '1');
    return null;
  }
  if (old.size === 0) {
    kvSetRaw(MIGRATED_KEY, '1');
    return null;
  }

  const entries = toEntries(old.get(OLD.PAGES));
  const { pages: standard, appended } = appendIconPages(factoryStandard, entries);
  const { engines, engineId } = mapEngines(old.get(OLD.ENGINE_ORDER), old.get(OLD.ENGINE));
  const nick = old.get(OLD.NICKNAME);
  const history = old.get(OLD.SEARCH_HISTORY);
  const settings: Partial<AppSettings> = {
    engineId,
    ...(typeof nick === 'string' && nick.trim() !== '' ? { nick: nick.trim() } : {}),
    ...(old.get(OLD.AUTO_FOCUS) === 'true' ? { autoFocus: true } : {}),
    ...(old.get(OLD.SEARCH_RETAIN) === 'true' ? { searchKeep: true } : {}),
    ...(old.get(OLD.SEARCH_HIDE_BTN) === 'true' ? { hideBtn: true } : {}),
  };

  kvSetRaw(MIGRATED_KEY, '1');
  info(MODULE, 'v3 数据迁移完成', { appended, pages: standard.length, engines: engines.length });
  return {
    standard: standard.map((pg) => pg.filter((it) => it.c + it.w <= COLS && it.r + it.h <= ROWS)),
    engines,
    settings,
    history: Array.isArray(history) ? history.filter((h): h is string => typeof h === 'string').slice(0, 8) : [],
    appended,
  };
}
