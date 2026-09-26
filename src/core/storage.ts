/**
 * 页面侧主存储服务（IndexedDB 主库 + 内存缓存）
 *
 * 业务数据以 IndexedDB 为唯一主存储；启动时一次性加载到内存缓存，
 * 页面交互继续使用同步读写 API，写入时异步落库，避免 UI 事件全部改为异步。
 * 兼容开发期旧数据：首次启动会从旧 localStorage 迁移到 IndexedDB。
 */

import {
  APP_DB_KV_STORE,
  APP_DB_NAME,
  APP_DB_VERSION,
  DEFAULT_SETTINGS,
  LS_KEYS,
  RAW_KEYS,
  STORAGE_PREFIX,
} from '../shared/constants';
import type { CountdownItem, TabPageSettings, TilePage, WallpaperSettings } from '../shared/types';
import { SettingsSchema } from '../shared/guards';
import { warn } from './logger';

const MODULE = 'storage';

/** IndexedDB 通用键值记录 */
interface KvRecord {
  key: string;
  value: unknown;
}

/** 主题设置存储形状（避免与 theme-manager 互相 import） */
export interface StoredThemeState {
  colorScheme: 'light' | 'dark';
  autoFollowSystem: boolean;
}

/** 本地目录同步/导出使用的完整业务快照 */
export interface AppDataSnapshot {
  [key: string]: unknown;
  tiles: {
    pages: TilePage[];
    pageNames: string[];
    settings: Record<string, string>;
  };
  config: {
    settings: Record<string, string>;
    theme: StoredThemeState | null;
  };
  user: {
    countdowns: CountdownItem[];
    wallpaper: {
      background: unknown | null;
      settings: WallpaperSettings | null;
    };
  };
}

/** 数据变更回调（用于文件同步等） */
type ChangeCallback = (key: string, value: unknown) => void;
const changeListeners: Set<ChangeCallback> = new Set();

/** 注册数据变更监听器，返回取消注册函数 */
export function onStorageChange(callback: ChangeCallback): () => void {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

function notifyChange(key: string, value: unknown): void {
  for (const cb of changeListeners) {
    try {
      cb(key, value);
    } catch {
      // 监听器错误不影响主流程
    }
  }
}

const cache = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let storageReady = false;

/** 旧 localStorage 中按 JSON 保存的数据键 */
const JSON_VALUE_KEYS = new Set<string>([
  LS_KEYS.PAGES,
  LS_KEYS.PAGE_NAMES,
  LS_KEYS.SEARCH_HISTORY,
  RAW_KEYS.COUNTDOWNS,
  RAW_KEYS.WALLPAPER_BG,
  RAW_KEYS.WALLPAPER_SETTINGS,
]);

/** 必须持久化的设置键：包含默认值，确保导出/文件同步拿到完整配置 */
const REQUIRED_SETTING_DEFAULTS: Readonly<Record<string, string>> = {
  [LS_KEYS.ENGINE]: DEFAULT_SETTINGS.engine,
  [LS_KEYS.SHORTCUT_SIZE]: DEFAULT_SETTINGS.shortcutSize,
  [LS_KEYS.SHORTCUT_COLUMNS]: DEFAULT_SETTINGS.shortcutColumns,
  [LS_KEYS.AUTO_FOCUS]: String(DEFAULT_SETTINGS.autoFocus),
  [LS_KEYS.CATEGORY_MEMORY]: String(DEFAULT_SETTINGS.categoryMemory),
  [LS_KEYS.LAST_PAGE]: String(DEFAULT_SETTINGS.lastPage),
  [LS_KEYS.CAT_ROW]: String(DEFAULT_SETTINGS.catRow),
  [LS_KEYS.PAGE_TRANSITION]: String(DEFAULT_SETTINGS.pageTransition),
  [LS_KEYS.LINK_NEW_TAB_TILES]: String(DEFAULT_SETTINGS.linkNewTabTiles),
  [LS_KEYS.LINK_NEW_TAB_SEARCH]: String(DEFAULT_SETTINGS.linkNewTabSearch),
  [LS_KEYS.CONFIG_NICKNAME]: DEFAULT_SETTINGS.nickname,
  [LS_KEYS.SEARCH_RETAIN]: 'false',
  [LS_KEYS.SEARCH_HIDE_BTN]: 'false',
  [LS_KEYS.BATCH_MODIFIER_KEY]: DEFAULT_SETTINGS.batchModifierKey,
};

/** 打开业务主数据库 */
function openAppDB(): Promise<IDBDatabase | null> {
  if (dbPromise !== null) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    warn(MODULE, 'IndexedDB 不可用，当前会话仅使用内存缓存');
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);
    request.onerror = () => {
      warn(MODULE, 'IndexedDB 打开失败，当前会话仅使用内存缓存', { err: request.error?.message ?? 'unknown' });
      resolve(null);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(APP_DB_KV_STORE)) {
        db.createObjectStore(APP_DB_KV_STORE, { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

/** 事务完成 Promise */
function waitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 从 IndexedDB 读取全部键值到缓存 */
async function loadDbCache(): Promise<void> {
  const db = await openAppDB();
  if (db === null) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(APP_DB_KV_STORE, 'readonly');
    const store = tx.objectStore(APP_DB_KV_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const row of request.result as KvRecord[]) {
        cache.set(row.key, row.value);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/** 写入单个键值到 IndexedDB */
async function persistValue(key: string, value: unknown): Promise<void> {
  const db = await openAppDB();
  if (db === null) return;
  const tx = db.transaction(APP_DB_KV_STORE, 'readwrite');
  tx.objectStore(APP_DB_KV_STORE).put({ key, value } satisfies KvRecord);
  await waitTransaction(tx);
}

/** 删除单个键 */
async function deleteValue(key: string): Promise<void> {
  const db = await openAppDB();
  if (db === null) return;
  const tx = db.transaction(APP_DB_KV_STORE, 'readwrite');
  tx.objectStore(APP_DB_KV_STORE).delete(key);
  await waitTransaction(tx);
}

/** 清空业务主库 */
async function clearDbStore(): Promise<void> {
  const db = await openAppDB();
  if (db === null) return;
  const tx = db.transaction(APP_DB_KV_STORE, 'readwrite');
  tx.objectStore(APP_DB_KV_STORE).clear();
  await waitTransaction(tx);
}

/** 旧 localStorage key → 业务 key */
function normalizeLegacyKey(fullKey: string): string | null {
  if (fullKey === '_devhome_theme') return LS_KEYS.THEME;
  if (fullKey === 'bg') return RAW_KEYS.WALLPAPER_BG;
  if (fullKey === 'wallpaperSettings') return RAW_KEYS.WALLPAPER_SETTINGS;
  if (Object.values(LS_KEYS).includes(fullKey as (typeof LS_KEYS)[keyof typeof LS_KEYS])) return fullKey;
  if (Object.values(RAW_KEYS).includes(fullKey as (typeof RAW_KEYS)[keyof typeof RAW_KEYS])) return fullKey;
  if (fullKey.startsWith(STORAGE_PREFIX)) return fullKey.slice(STORAGE_PREFIX.length);
  return null;
}

/** 解析旧 localStorage 数据，保留开关类原始字符串语义 */
function parseLegacyValue(key: string, raw: string): unknown {
  if (key === LS_KEYS.THEME) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredThemeState>;
      if (parsed.colorScheme === 'light' || parsed.colorScheme === 'dark') {
        return { colorScheme: parsed.colorScheme, autoFollowSystem: !!parsed.autoFollowSystem };
      }
    } catch {
      return null;
    }
    return null;
  }
  if (!JSON_VALUE_KEYS.has(key)) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** 开发期旧数据迁移：IndexedDB 已有同名 key 时不覆盖 */
function migrateLegacyLocalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  for (let i = 0; i < localStorage.length; i++) {
    const fullKey = localStorage.key(i);
    if (fullKey === null) continue;
    const key = normalizeLegacyKey(fullKey);
    if (key === null || cache.has(key)) continue;
    const raw = localStorage.getItem(fullKey);
    if (raw === null) continue;
    const value = parseLegacyValue(key, raw);
    if (value !== null) cache.set(key, value);
  }
}

/** 补齐默认设置到主库，保证“当前设置 + 默认设置”都能被同步/导出 */
function ensureDefaultSettings(): void {
  for (const [key, value] of Object.entries(REQUIRED_SETTING_DEFAULTS)) {
    if (!cache.has(key)) cache.set(key, value);
  }
}

/** 将当前缓存整批落库 */
async function persistCache(): Promise<void> {
  const db = await openAppDB();
  if (db === null) return;
  const tx = db.transaction(APP_DB_KV_STORE, 'readwrite');
  const store = tx.objectStore(APP_DB_KV_STORE);
  for (const [key, value] of cache.entries()) {
    store.put({ key, value } satisfies KvRecord);
  }
  await waitTransaction(tx);
}

/** 启动时必须先初始化主存储，再进入主题/业务数据读取 */
export async function initStorage(): Promise<void> {
  if (storageReady) return;
  await loadDbCache();
  migrateLegacyLocalStorage();
  ensureDefaultSettings();
  await persistCache();
  storageReady = true;
}

/** 清空业务主存储；用于恢复出厂设置 */
export async function clearAppStorage(): Promise<void> {
  cache.clear();
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  await clearDbStore();
  ensureDefaultSettings();
  await persistCache();
}

/**
 * 兼容原调用名的同步门面。
 * 数据实际来自 IndexedDB 启动缓存，写入会立即更新缓存并异步落库。
 */
export const localStorageService = {
  /** 读业务 key 对应的结构化值 */
  get<T>(key: string, fallback: T): T {
    const value = cache.get(key);
    return value === undefined ? fallback : (value as T);
  },

  /** 读原始字符串设置 */
  getRaw(key: string): string | null {
    const value = cache.get(key);
    if (value === undefined || value === null) return null;
    return typeof value === 'string' ? value : String(value);
  },

  /** 写结构化值 */
  set<T>(key: string, value: T): void {
    cache.set(key, value);
    void persistValue(key, value);
    notifyChange(key, value);
  },

  /** 写原始字符串设置 */
  setRaw(key: string, value: string): void {
    cache.set(key, value);
    void persistValue(key, value);
    notifyChange(key, value);
  },

  /** 删除业务 key */
  remove(key: string): void {
    cache.delete(key);
    void deleteValue(key);
    notifyChange(key, undefined);
  },
};

/** 磁贴设置默认值合并 */
export function mergeSettings(partial: Partial<TabPageSettings>): TabPageSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}

/** 收集所有必存设置，包含默认值 */
export function collectSettingsSnapshot(): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(REQUIRED_SETTING_DEFAULTS)) {
    settings[key] = localStorageService.getRaw(key) ?? fallback;
  }
  return settings;
}

/** 获取完整业务快照，用于本地目录同步 */
export function collectAppSnapshot(): AppDataSnapshot {
  return {
    tiles: {
      pages: localStorageService.get<TilePage[]>(LS_KEYS.PAGES, []),
      pageNames: localStorageService.get<string[]>(LS_KEYS.PAGE_NAMES, []),
      settings: collectSettingsSnapshot(),
    },
    config: {
      settings: collectSettingsSnapshot(),
      theme: localStorageService.get<StoredThemeState | null>(LS_KEYS.THEME, null),
    },
    user: {
      countdowns: localStorageService.get<CountdownItem[]>(RAW_KEYS.COUNTDOWNS, []),
      wallpaper: {
        background: localStorageService.get<unknown | null>(RAW_KEYS.WALLPAPER_BG, null),
        settings: localStorageService.get<WallpaperSettings | null>(RAW_KEYS.WALLPAPER_SETTINGS, null),
      },
    },
  };
}

/** 从本地目录快照恢复到 IndexedDB 主库 */
export function restoreAppSnapshot(data: Record<string, unknown>): void {
  const tiles = data.tiles as { pages?: unknown; pageNames?: unknown; settings?: Record<string, string> } | undefined;
  const config = data.config as { settings?: Record<string, string>; theme?: StoredThemeState | null } | undefined;
  const user = data.user as {
    countdowns?: CountdownItem[];
    wallpaper?: { background?: unknown | null; settings?: WallpaperSettings | null };
  } | undefined;
  if (tiles?.pages !== undefined) {
    localStorageService.set(LS_KEYS.PAGES, tiles.pages);
  }
  if (tiles?.pageNames !== undefined) {
    localStorageService.set(LS_KEYS.PAGE_NAMES, tiles.pageNames);
  }
  for (const settings of [tiles?.settings, config?.settings]) {
    if (settings === undefined) continue;
    for (const [key, value] of Object.entries(settings)) {
      localStorageService.setRaw(key, value);
    }
  }
  if (config?.theme !== undefined && config.theme !== null) {
    localStorageService.set(LS_KEYS.THEME, config.theme);
  }
  if (user?.countdowns !== undefined) {
    localStorageService.set(RAW_KEYS.COUNTDOWNS, user.countdowns);
  }
  if (user?.wallpaper?.background !== undefined && user.wallpaper.background !== null) {
    localStorageService.set(RAW_KEYS.WALLPAPER_BG, user.wallpaper.background);
  }
  if (user?.wallpaper?.settings !== undefined && user.wallpaper.settings !== null) {
    localStorageService.set(RAW_KEYS.WALLPAPER_SETTINGS, user.wallpaper.settings);
  }
}

/** 磁贴/设置业务门面 */
export const dataService = {
  async getPages(): Promise<TilePage[]> {
    return localStorageService.get<TilePage[]>(LS_KEYS.PAGES, []);
  },

  async savePages(pages: TilePage[]): Promise<void> {
    localStorageService.set(LS_KEYS.PAGES, pages);
  },

  async getPageNames(): Promise<string[]> {
    return localStorageService.get<string[]>(LS_KEYS.PAGE_NAMES, []);
  },

  async savePageNames(names: string[]): Promise<void> {
    localStorageService.set(LS_KEYS.PAGE_NAMES, names);
  },

  /** 读取设置，读取即校验 */
  async getSettings(): Promise<TabPageSettings> {
    const parsed = SettingsSchema.safeParse({
      engine: localStorageService.getRaw(LS_KEYS.ENGINE) ?? DEFAULT_SETTINGS.engine,
      shortcutSize: localStorageService.getRaw(LS_KEYS.SHORTCUT_SIZE) ?? DEFAULT_SETTINGS.shortcutSize,
      shortcutColumns: localStorageService.getRaw(LS_KEYS.SHORTCUT_COLUMNS) ?? DEFAULT_SETTINGS.shortcutColumns,
      autoFocus: localStorageService.getRaw(LS_KEYS.AUTO_FOCUS) === 'true',
      catRow: localStorageService.getRaw(LS_KEYS.CAT_ROW) !== 'false',
      pageTransition: localStorageService.getRaw(LS_KEYS.PAGE_TRANSITION) !== 'false',
      linkNewTabTiles: localStorageService.getRaw(LS_KEYS.LINK_NEW_TAB_TILES) !== 'false',
      linkNewTabSearch: localStorageService.getRaw(LS_KEYS.LINK_NEW_TAB_SEARCH) !== 'false',
      nickname: localStorageService.getRaw(LS_KEYS.CONFIG_NICKNAME) ?? DEFAULT_SETTINGS.nickname,
      lastPage: parseInt(localStorageService.getRaw(LS_KEYS.LAST_PAGE) ?? '0', 10),
      categoryMemory: localStorageService.getRaw(LS_KEYS.CATEGORY_MEMORY) !== 'false',
      batchModifierKey: localStorageService.getRaw(LS_KEYS.BATCH_MODIFIER_KEY) ?? DEFAULT_SETTINGS.batchModifierKey,
    });
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  },
};
