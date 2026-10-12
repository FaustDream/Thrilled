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
  AUTO_FOCUS: 'auto_focus',
  SEARCH_RETAIN: 'search_retain',
  SEARCH_HIDE_BTN: 'search_hide_btn',
} as const;

/** v3 引擎注册表的 id 与 v4 内置表同名同 id（google/bing/baidu/zhihu/weibo/duckduckgo）直接映射；
 * v3 独有的 github/bilibili/yandex/gamer520/linuxdo 见 V3_EXTRA_ENGINES */

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

/** v3 引擎偏好（旧 IndexedDB 的 engine_order / engine） */
export interface V3EnginePrefs {
  order: string[];
  current: string;
}

/** 读取 v3 引擎偏好；无旧数据 / 无有效顺序记录返回 null（不阻塞调用方） */
export async function readV3EnginePrefs(): Promise<V3EnginePrefs | null> {
  let old: Map<string, unknown>;
  try {
    old = await readOldKv();
  } catch {
    return null;
  }
  const raw = old.get(OLD.ENGINE_ORDER);
  if (!Array.isArray(raw)) return null;
  const order = raw.filter((id): id is string => typeof id === 'string');
  if (order.length === 0) return null;
  const current = old.get(OLD.ENGINE);
  return { order, current: typeof current === 'string' ? current : '' };
}

/**
 * 存量修正：把已迁移的引擎清单裁剪回 v3 设置的那套（v4.1 迁移曾把全部内置引擎补进清单）。
 * v3 独有引擎按 v3 定义注入；v4 里用户新加的自定义引擎保留在末尾；当前引擎优先恢复 v3 的选择。
 */
export function applyV3EngineSet(
  engines: readonly EngineDef[],
  engineId: string,
  prefs: V3EnginePrefs,
): { engines: EngineDef[]; engineId: string } {
  const builtinIds = new Set(BUILTIN_ENGINES.map((e) => e.id));
  const ordered: EngineDef[] = [];
  for (const id of prefs.order) {
    if (ordered.some((x) => x.id === id)) continue;
    const def = v3EngineDef(id);
    if (def !== null) ordered.push(def);
  }
  for (const e of engines) {
    if (ordered.some((x) => x.id === e.id)) continue;
    if (builtinIds.has(e.id)) continue;
    ordered.push({ ...e });
  }
  if (ordered.length === 0) return { engines: [...engines], engineId };
  const v3Cur = v3EngineDef(prefs.current);
  const nextId = v3Cur !== null && ordered.some((x) => x.id === v3Cur.id)
    ? v3Cur.id
    : (ordered.some((x) => x.id === engineId) ? engineId : (ordered[0]?.id ?? engineId));
  return { engines: ordered, engineId: nextId };
}

/** v3 引擎注册表（v3 shared/types ENGINES，11 个）中 v4 内置表没有的引擎——迁移 / 恢复时按 v3 定义注入为自定义引擎 */
const V3_EXTRA_ENGINES: readonly EngineDef[] = [
  { id: 'github', name: 'GitHub', color: '#24292F', glyph: 'G', latin: true, base: 'https://github.com/search?q=' },
  { id: 'bilibili', name: '哔哩哔哩', color: '#00A1D6', glyph: '哔', base: 'https://search.bilibili.com/all?keyword=' },
  { id: 'yandex', name: 'Yandex', color: '#FC3F1D', glyph: 'Y', latin: true, base: 'https://ya.ru/search/?text=' },
  { id: 'gamer520', name: 'Gamer520', color: '#64748B', glyph: 'G', latin: true, base: 'https://www.gamer520.com/?s=' },
  { id: 'linuxdo', name: 'Linux.do', color: '#64748B', glyph: 'L', latin: true, base: 'https://linux.do/search?q=' },
];

/** v3 引擎注册表顺序（v3 全部 11 个；前 6 个与 v4 内置同 id） */
const V3_REGISTRY_ORDER: readonly string[] = [
  'google', 'bing', 'baidu', 'zhihu', 'weibo', 'duckduckgo', 'github', 'bilibili', 'yandex', 'gamer520', 'linuxdo',
];

/** v3 引擎 id → v4 定义（v4 内置同 id 用内置，独有用 v3 定义） */
function v3EngineDef(id: string): EngineDef | null {
  const builtin = BUILTIN_ENGINES.find((e) => e.id === id);
  if (builtin !== undefined) return { ...builtin };
  return V3_EXTRA_ENGINES.find((e) => e.id === id) ?? null;
}

/** v3 引擎顺序落成 v4 清单：只保留 v3 设置的那套，不补齐未设置的内置引擎；order 缺失按 v3 注册表全量回退 */
function buildV3EngineList(order: readonly string[]): EngineDef[] {
  const ids = order.length > 0 ? order : V3_REGISTRY_ORDER;
  const out: EngineDef[] = [];
  for (const id of ids) {
    if (out.some((x) => x.id === id)) continue;
    const def = v3EngineDef(id);
    if (def !== null) out.push(def);
  }
  return out;
}

/** v3 引擎顺序 + 当前引擎 → v4 引擎清单（未来迁移用） */
function mapEngines(order: unknown, current: unknown): { engines: EngineDef[]; engineId: string } {
  const ids = Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string') : [];
  const engines = buildV3EngineList(ids);
  const cur = typeof current === 'string' ? current : '';
  return { engines, engineId: engines.some((e) => e.id === cur) ? cur : (engines[0]?.id ?? 'baidu') };
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
  const history = old.get(OLD.SEARCH_HISTORY);
  const settings: Partial<AppSettings> = {
    engineId,
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
