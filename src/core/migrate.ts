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
import { COLS, ROWS, findSlot } from '../shared/grid';
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

/** v3 磁贴数组 → v4 图标卡片（findSlot 逐个落位，放不下的丢弃） */
function tilesToItems(tiles: unknown): GridItem[] {
  if (!Array.isArray(tiles)) return [];
  const out: GridItem[] = [];
  let seq = 0;
  for (const raw of tiles) {
    if (typeof raw !== 'object' || raw === null) continue;
    const t = raw as Record<string, unknown>;
    const label = typeof t['label'] === 'string' ? t['label'] : '';
    const url = typeof t['url'] === 'string' ? t['url'] : '';
    if (label === '') continue;
    const item: GridItem = {
      id: `m${Date.now().toString(36)}${seq++}`,
      c: 0, r: 0, w: 2, h: 2, t: 'icon',
      config: { label, url },
    };
    const slot = findSlot(out, 2, 2);
    if (slot === null) break;
    item.c = slot.c;
    item.r = slot.r;
    out.push(item);
  }
  return out;
}

/** v3 分页数组（TilePage[]）→ v4 页面集（最多 5 页，行数钳制由网格保证） */
function toModePages(raw: unknown): ModePages {
  if (!Array.isArray(raw)) return [];
  const pages: ModePages = [];
  for (const page of raw.slice(0, 5)) {
    if (typeof page !== 'object' || page === null) continue;
    const items = tilesToItems((page as Record<string, unknown>)['tiles']);
    if (items.length > 0) pages.push(items);
  }
  return pages;
}

/** 迁移结果（由 app 层并入初始文档） */
export interface MigrationResult {
  standard: ModePages;
  engines: EngineDef[];
  settings: Partial<AppSettings>;
  history: string[];
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

/** 执行迁移（幂等：已迁移或无旧数据返回 null） */
export async function migrateV3(): Promise<MigrationResult | null> {
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

  const standard = toModePages(old.get(OLD.PAGES));
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
  info(MODULE, 'v3 数据迁移完成', { pages: standard.length, engines: engines.length });
  return {
    standard: standard.map((pg) => pg.filter((it) => it.c + it.w <= COLS && it.r + it.h <= ROWS)),
    engines,
    settings,
    history: Array.isArray(history) ? history.filter((h): h is string => typeof h === 'string').slice(0, 8) : [],
  };
}
