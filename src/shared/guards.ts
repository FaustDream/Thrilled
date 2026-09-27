/**
 * 运行时类型守卫（外部输入必须先校验再进入业务逻辑）
 *
 * 基于 zod schema 的 `safeParse` 封装：用于消息边界、存储读取、JSON 解析。
 * - `isX(v)` 类型守卫：`v is X`，可在 if 中收窄。
 * - `parseStoredDoc(v)`：持久化文档归一化，坏数据逐项丢弃并回退默认值。
 * 纯类型 + zod，无 chrome.* 依赖，app / core / background 任意层可引用。
 */

import { z } from 'zod';
import { MESSAGE_TYPE } from './constants';
import { BUILTIN_SKINS, DEFAULT_SETTINGS } from './defaults';
import type { ExtensionRequest, ResolveFaviconData } from './messages';
import type { AppSettings, EngineDef, ModePages, SkinPack, StoredDoc } from './types';

/* ===== 消息 payload schema ===== */

/** favicon 解析消息校验（域名格式白名单，防 SSRF） */
const resolveFaviconSchema: z.ZodType<ResolveFaviconData> = z.object({
  domain: z
    .string()
    .min(1)
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      '非法域名格式',
    ),
});

/** 消息判别联合 schema：逐分支 safeParse 兜底 */
const requestParsers = [
  { type: MESSAGE_TYPE.RESOLVE_FAVICON, dataSchema: resolveFaviconSchema },
] as const;

/** 基础对象形状校验 */
const requestShapeSchema = z.object({
  type: z.string(),
  data: z.unknown().optional(),
});

/**
 * 运行时守卫：是否为合法的 ExtensionRequest
 * 匹配 type + 对应 payload schema（safeParse，非法即拒收）
 */
export function isExtensionRequest(v: unknown): v is ExtensionRequest {
  if (typeof v !== 'object' || v === null) return false;
  const shape = requestShapeSchema.safeParse(v);
  if (!shape.success) return false;
  const { type, data } = shape.data;
  for (const parser of requestParsers) {
    if (parser.type === type) {
      return parser.dataSchema.safeParse(data).success;
    }
  }
  return false;
}

/* ===== 常用类型守卫 ===== */

/** 是否为合法域名（favicon 解析 / 外链校验共用） */
export function isSafeDomain(v: string): boolean {
  return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(v);
}

/** 是否为合法 http(s) URL */
export function isHttpUrl(v: string): boolean {
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** 是否为合法图标值：http(s) URL 或 data:image */
export function isIconValue(v: string): boolean {
  return isHttpUrl(v) || v.startsWith('data:image/');
}

/* ===== 持久化文档归一化 ===== */

/** 布尔归一化：非 boolean 一律回退默认 */
const boolish = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);
const numish = (v: unknown, dflt: number, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return dflt;
  return Math.min(max, Math.max(min, v));
};
const strish = (v: unknown, dflt: string): string => (typeof v === 'string' ? v : dflt);

/** 引擎定义归一化：缺字段丢弃；未知字段不收 */
const engineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string(),
  glyph: z.string(),
  base: z.string(),
  img: z.string().optional(),
  latin: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export const normalizeEngine = (v: unknown): EngineDef | null => {
  const r = engineSchema.safeParse(v);
  return r.success ? (r.data as EngineDef) : null;
};

/** 皮肤归一化：tokens 逐键校验为字符串 */
const skinSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  builtin: z.boolean(),
  base: z.enum(['light', 'dark']),
  wall: z.number().int().nonnegative(),
  tokens: z.record(z.string()),
});

export const normalizeSkin = (v: unknown): SkinPack | null => {
  const r = skinSchema.safeParse(v);
  return r.success ? (r.data as SkinPack) : null;
};

export const normalizeSkins = (v: unknown): SkinPack[] => {
  if (!Array.isArray(v)) return BUILTIN_SKINS.map((s) => ({ ...s, tokens: { ...s.tokens } }));
  const out = v.map(normalizeSkin).filter((s): s is SkinPack => s !== null);
  return out.length > 0 ? out : BUILTIN_SKINS.map((s) => ({ ...s, tokens: { ...s.tokens } }));
};

/** 引擎清单归一化：全部坏数据时回退内置表 */
export const normalizeEngines = (v: unknown): EngineDef[] => {
  if (!Array.isArray(v)) return [];
  return v.map(normalizeEngine).filter((e): e is EngineDef => e !== null);
};

/** 设置归一化：逐字段合并到出厂默认（坏数据回退） */
export const normalizeSettings = (v: unknown): AppSettings => {
  const d = DEFAULT_SETTINGS;
  if (typeof v !== 'object' || v === null) return { ...d, glass: { ...d.glass } };
  const o = v as Record<string, unknown>;
  const glass = ((): AppSettings['glass'] => {
    const g = o['glass'];
    if (typeof g !== 'object' || g === null) return { ...d.glass };
    const go = g as Record<string, unknown>;
    return {
      card: numish(go['card'], d.glass.card, 0, 1),
      tile: numish(go['tile'], d.glass.tile, 0, 1),
      dock: numish(go['dock'], d.glass.dock, 0, 1),
      search: numish(go['search'], d.glass.search, 0, 1),
      panel: numish(go['panel'], d.glass.panel, 0, 1),
      menu: numish(go['menu'], d.glass.menu, 0, 1),
    };
  })();
  const mode = o['mode'];
  const openMode = o['openMode'];
  const dockIcon = o['dockIcon'];
  return {
    mode: mode === 'minimal' || mode === 'standard' || mode === 'privacy' ? mode : d.mode,
    labels: boolish(o['labels'], d.labels),
    hideTop: boolish(o['hideTop'], d.hideTop),
    hideSearch: boolish(o['hideSearch'], d.hideSearch),
    mascot: boolish(o['mascot'], d.mascot),
    engineId: strish(o['engineId'], d.engineId),
    openMode: openMode === 'link' || openMode === 'tab' || openMode === 'search' ? openMode : d.openMode,
    autoFocus: boolish(o['autoFocus'], d.autoFocus),
    searchKeep: boolish(o['searchKeep'], d.searchKeep),
    hideBtn: boolish(o['hideBtn'], d.hideBtn),
    searchHistory: boolish(o['searchHistory'], d.searchHistory),
    nick: strish(o['nick'], d.nick),
    searchWidth: numish(o['searchWidth'], d.searchWidth, 400, 1400),
    searchRadius: numish(o['searchRadius'], d.searchRadius, 0, 25),
    dockCount: numish(o['dockCount'], d.dockCount, 4, 8),
    dockIcon: dockIcon === 'circle' ? 'circle' : 'rect',
    clockColor: strish(o['clockColor'], d.clockColor),
    showTime: boolish(o['showTime'], d.showTime),
    showDate: boolish(o['showDate'], d.showDate),
    showQuote: boolish(o['showQuote'], d.showQuote),
    glass,
    gAlpha: numish(o['gAlpha'], d.gAlpha, 0.2, 1),
    cover: numish(o['cover'], d.cover, 0, 1),
    fontColor: strish(o['fontColor'], d.fontColor),
    immersive: boolish(o['immersive'], d.immersive),
    simpleSearch: boolish(o['simpleSearch'], d.simpleSearch),
    skinId: strish(o['skinId'], d.skinId),
    wallpaper: numish(o['wallpaper'], d.wallpaper, 0, 99),
    wallpaperRef: typeof o['wallpaperRef'] === 'string' ? o['wallpaperRef'] : null,
  };
};

/** 网格坐标归一化（数字 + 边界钳制） */
const gridNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : -1);

/** 卡片实例归一化：未知类型丢弃（坏数据不进布局） */
export const normalizeGridItem = (v: unknown, kinds: ReadonlySet<string>): StoredDoc['pages']['standard'][number][number] | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const t = typeof o['t'] === 'string' && kinds.has(o['t']) ? o['t'] : null;
  const w = gridNum(o['w']);
  const h = gridNum(o['h']);
  if (t === null || w <= 0 || h <= 0) return null;
  const config = typeof o['config'] === 'object' && o['config'] !== null ? (o['config'] as Record<string, unknown>) : {};
  return {
    id: typeof o['id'] === 'string' && o['id'] !== '' ? o['id'] : `i${Math.random().toString(36).slice(2, 8)}`,
    c: Math.max(0, gridNum(o['c'])),
    r: Math.max(0, gridNum(o['r'])),
    w,
    h,
    t: t as StoredDoc['pages']['standard'][number][number]['t'],
    config,
  };
};

/** 页面集归一化：支持多页（数组套数组）与扁平单页 */
export const normalizeModePages = (v: unknown, kinds: ReadonlySet<string>): ModePages => {
  if (!Array.isArray(v) || v.length === 0) return [];
  const raw = Array.isArray(v[0]) ? v : [v];
  return raw
    .map((pg) => (Array.isArray(pg) ? pg.map((it) => normalizeGridItem(it, kinds)).filter((x) => x !== null) : []))
    .filter((pg) => pg.length > 0);
};

/**
 * 持久化文档归一化：任何一部分坏数据只丢该部分（布局空则回退 null 由调用方种入出厂布局）
 */
export const parseStoredDoc = (v: unknown, kinds: ReadonlySet<string>): StoredDoc | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const pages = o['pages'];
  if (typeof pages !== 'object' || pages === null) return null;
  const po = pages as Record<string, unknown>;
  const standard = normalizeModePages(po['standard'], kinds);
  const privacy = normalizeModePages(po['privacy'], kinds);
  if (standard.length === 0 || privacy.length === 0) return null;
  const user = o['user'];
  return {
    v: 2,
    settings: normalizeSettings(o['settings']),
    pages: {
      standard,
      privacy: privacy.length > 0 ? privacy : standard,
    },
    engines: normalizeEngines(o['engines']),
    skins: normalizeSkins(o['skins']),
    history: Array.isArray(o['history']) ? o['history'].filter((h): h is string => typeof h === 'string').slice(0, 20) : [],
    user: typeof user === 'object' && user !== null && typeof (user as Record<string, unknown>)['email'] === 'string'
      ? { email: (user as Record<string, unknown>)['email'] as string }
      : null,
    welcomed: boolish(o['welcomed'], false),
    backupTime: typeof o['backupTime'] === 'string' ? o['backupTime'] : null,
  };
};

/** 布尔串 'true'/'false' → boolean（kv 字符串开关） */
export function parseBooleanStr(v: string | null | undefined): boolean {
  return v === 'true';
}
