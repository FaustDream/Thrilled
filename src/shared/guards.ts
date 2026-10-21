/**
 * 运行时类型守卫（外部输入必须先校验再进入业务逻辑）
 *
 * 基于 zod schema 的 `safeParse` 封装：用于消息边界、存储读取、JSON 解析。
 * - `isX(v)` 类型守卫：`v is X`，可在 if 中收窄。
 * - `parseStoredDoc(v)`：持久化文档归一化，坏数据逐项丢弃并回退默认值。
 * 纯类型 + zod，无 chrome.* 依赖，app / core / background 任意层可引用。
 */

import { z } from 'zod';
import { BLUR_MAX_PX, MESSAGE_TYPE } from './constants';
import { BUILTIN_SKINS, DEFAULT_SETTINGS } from './defaults';
import { isLegalSize } from './grid';
import { normalizeShortcuts } from './shortcuts';
import { isBlankStyle, normStyle } from './widget-style';
import { WIDGET_KINDS, fromLegacyKind, sizeAllowed } from './widget-defs';
import type { ExtensionRequest, FetchResourceData, ResolveFaviconData } from './messages';
import type { AppSettings, CityPick, DockApp, EngineDef, ModePages, SkinPack, StoredDoc, WallFocus, WallpaperSource, WidgetKind, WidgetSize, WidgetStyle } from './types';

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

/** SW 代理 GET 请求校验（仅 http(s)，防 file:/data: 等协议滥用） */
const fetchResourceSchema: z.ZodType<FetchResourceData> = z.object({
  url: z.string().min(1).regex(/^https?:\/\//, '仅支持 http(s) 地址'),
  kind: z.enum(['json', 'dataurl']),
});

/** 消息判别联合 schema：逐分支 safeParse 兜底 */
const requestParsers = [
  { type: MESSAGE_TYPE.RESOLVE_FAVICON, dataSchema: resolveFaviconSchema },
  { type: MESSAGE_TYPE.FETCH_RESOURCE, dataSchema: fetchResourceSchema },
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

/** 皮肤归一化：只认两套内置主题的 id（旧版本的自定义皮肤与其余内置主题不再载入） */
const skinIdOf = (v: unknown, d: string): string =>
  typeof v === 'string' && BUILTIN_SKINS.some((s) => s.id === v) ? v : d;

/** 皮肤归一化：只保留两套内置主题（经典 / 暗黑）；旧版本的自定义皮肤与其余内置主题不再载入 */
export const normalizeSkins = (): SkinPack[] => BUILTIN_SKINS.map((s) => ({ ...s, tokens: { ...s.tokens } }));

/** 引擎清单归一化：全部坏数据时回退内置表 */
export const normalizeEngines = (v: unknown): EngineDef[] => {
  if (!Array.isArray(v)) return [];
  return v.map(normalizeEngine).filter((e): e is EngineDef => e !== null);
};

/** Dock 快捷方式归一化：只认 {name,url} 对象（旧版品牌名字符串数据一并丢弃） */
const normDockApp = (v: unknown): DockApp | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const name = typeof o['name'] === 'string' ? o['name'].trim() : '';
  const url = typeof o['url'] === 'string' ? o['url'].trim() : '';
  return name === '' ? null : { name, url };
};

/** 外部壁纸来源归一化：kind 只认适配器协议，基址必须是 http(s) URL */
const normWallSource = (v: unknown): WallpaperSource | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const kind = o['kind'];
  const name = typeof o['name'] === 'string' ? o['name'].trim() : '';
  const apiBase = typeof o['apiBase'] === 'string' ? o['apiBase'].trim().replace(/\/+$/, '') : '';
  if ((kind !== 'wallhaven' && kind !== 'picsum' && kind !== 'bing' && kind !== 'wg061129' && kind !== 'zhefeng') || name === '' || !/^https?:\/\//.test(apiBase)) return null;
  return {
    id: typeof o['id'] === 'string' && o['id'] !== '' ? o['id'] : `ws${Date.now().toString(36)}`,
    kind,
    name,
    apiBase,
    enabled: o['enabled'] === undefined ? true : o['enabled'] === true,
  };
};

/** 按出厂默认的键集合归一化一组数值记录（缺项 / 坏值回退默认，限幅到 [min,max]；新增键无需改动此处） */
const numRecord = <T extends string>(raw: unknown, def: Record<T, number>, min: number, max: number): Record<T, number> => {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<T, number>;
  for (const k of Object.keys(def) as T[]) out[k] = numish(o[k], def[k], min, max);
  return out;
};

/** 搜索触发的打开方式覆盖：只认四态枚举，坏值回退出厂默认 */
const overrideish = (v: unknown, d: AppSettings['searchEnterMode']): AppSettings['searchEnterMode'] =>
  v === 'inherit' || v === 'link' || v === 'tab' || v === 'search' ? v : d;

/** 设置归一化：逐字段合并到出厂默认（坏数据回退） */
export const normalizeSettings = (v: unknown): AppSettings => {
  const d = DEFAULT_SETTINGS;
  if (typeof v !== 'object' || v === null) return { ...d, glass: { ...d.glass }, blur: { ...d.blur } };
  const o = v as Record<string, unknown>;
  const glass = numRecord(o['glass'], d.glass, 0, 1);
  const blur = numRecord(o['blur'], d.blur, 0, BLUR_MAX_PX);
  const mode = o['mode'];
  const openMode = o['openMode'];
  const dockIcon = o['dockIcon'];
  // privacy 模式已移除：旧值归位为 standard
  const normalizedMode = mode === 'minimal' || mode === 'standard' ? mode : d.mode;
  return {
    mode: normalizedMode,
    iconNames: boolish(o['iconNames'], d.iconNames),
    autoArrange: boolish(o['autoArrange'], d.autoArrange),
    autoArrangeWidgets: boolish(o['autoArrangeWidgets'], d.autoArrangeWidgets),
    hideTop: boolish(o['hideTop'], d.hideTop),
    hideSearch: boolish(o['hideSearch'], d.hideSearch),
    mascot: boolish(o['mascot'], d.mascot),
    gridLines: boolish(o['gridLines'], d.gridLines),
    snapItems: boolish(o['snapItems'], d.snapItems),
    showGuides: boolish(o['showGuides'], d.showGuides),
    engineId: strish(o['engineId'], d.engineId),
    openMode: openMode === 'link' || openMode === 'tab' || openMode === 'search' ? openMode : d.openMode,
    autoFocus: boolish(o['autoFocus'], d.autoFocus),
    searchKeep: boolish(o['searchKeep'], d.searchKeep),
    hideBtn: boolish(o['hideBtn'], d.hideBtn),
    searchHistory: boolish(o['searchHistory'], d.searchHistory),
    searchPlaceholder: strish(o['searchPlaceholder'], d.searchPlaceholder),
    hideEngineIco: boolish(o['hideEngineIco'], d.hideEngineIco),
    engineIcoAct: o['engineIcoAct'] === 'cycle' ? 'cycle' : 'panel',
    historyLimit: numish(o['historyLimit'], d.historyLimit, 4, 20),
    searchFontSize: numish(o['searchFontSize'], d.searchFontSize, 13, 20),
    searchTop: numish(o['searchTop'], d.searchTop, 20, 44),
    searchEnterMode: overrideish(o['searchEnterMode'], d.searchEnterMode),
    searchBtnMode: overrideish(o['searchBtnMode'], d.searchBtnMode),
    blurAfterSearch: boolish(o['blurAfterSearch'], d.blurAfterSearch),
    historyItemDel: boolish(o['historyItemDel'], d.historyItemDel),
    searchWidth: numish(o['searchWidth'], d.searchWidth, 400, 1400),
    searchRadius: numish(o['searchRadius'], d.searchRadius, 0, 25),
    dockCount: numish(o['dockCount'], d.dockCount, 4, 8),
    dockIcon: dockIcon === 'circle' ? 'circle' : 'rect',
    dockApps: Array.isArray(o['dockApps'])
      ? (o['dockApps'] as unknown[]).map(normDockApp).filter((x): x is DockApp => x !== null)
      : [...d.dockApps],
    /* 时间颜色：空串 = 跟随主题。4.97 之前出厂值写死 #1f2937，
       切到暗黑主题后时钟等于隐形；存量的这个旧出厂值一并归位（用户改过的其它颜色保留） */
    clockColor: ((): string => {
      const v = strish(o['clockColor'], d.clockColor);
      return v.toLowerCase() === '#1f2937' ? '' : v;
    })(),
    glass,
    blur,
    gAlpha: numish(o['gAlpha'], d.gAlpha, 0.2, 1),
    cover: numish(o['cover'], d.cover, 0, 1),
    fontColor: strish(o['fontColor'], d.fontColor),
    autoContrast: boolish(o['autoContrast'], d.autoContrast),
    immersive: boolish(o['immersive'], d.immersive),
    simpleSearch: boolish(o['simpleSearch'], d.simpleSearch),
    skinId: skinIdOf(o['skinId'], d.skinId),
    wallpaperRef: typeof o['wallpaperRef'] === 'string' ? o['wallpaperRef'] : null,
    wallFocus: ((): WallFocus => {
      const f = o['wallFocus'];
      if (typeof f !== 'object' || f === null) return { ...d.wallFocus };
      const fo = f as Record<string, unknown>;
      return {
        x: numish(fo['x'], d.wallFocus.x, 0, 100),
        y: numish(fo['y'], d.wallFocus.y, 0, 100),
        ratio: numish(fo['ratio'], d.wallFocus.ratio, 0, 100),
      };
    })(),
    wallSources: Array.isArray(o['wallSources'])
      ? (o['wallSources'] as unknown[]).map(normWallSource).filter((x): x is WallpaperSource => x !== null)
      : [...d.wallSources],
    shortcuts: normalizeShortcuts(o['shortcuts']),
    styleDefaults: normStyleDefaults(o['styleDefaults']),
    sizeDefaults: normSizeDefaults(o['sizeDefaults']),
    weatherCity: normCityPick(o['weatherCity']),
  };
};

/** 手选城市归一化：名称与有限坐标齐备才认，否则回退 null（= 用真实定位） */
const normCityPick = (v: unknown): CityPick | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const name = typeof o['name'] === 'string' ? o['name'].trim() : '';
  const lat = typeof o['lat'] === 'number' && Number.isFinite(o['lat']) ? o['lat'] : NaN;
  const lon = typeof o['lon'] === 'number' && Number.isFinite(o['lon']) ? o['lon'] : NaN;
  if (name === '' || Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { name, lat, lon };
};

/**
 * 按类型的默认大小归一化：只认已知组件类型 + 六档合法 + 落在该组件的能力区间内，
 * 坏值直接丢弃（该类型回到定义表尺寸）——`{}` 即「该类没有单独设置默认大小」。
 */
const normSizeDefaults = (v: unknown): Record<string, WidgetSize> => {
  if (typeof v !== 'object' || v === null) return {};
  const out: Record<string, WidgetSize> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!WIDGET_KINDS.has(k)) continue;
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const w = typeof o['w'] === 'number' ? o['w'] : -1;
    const h = typeof o['h'] === 'number' ? o['h'] : -1;
    if (!isLegalSize(w, h) || !sizeAllowed(k as WidgetKind, w, h)) continue;
    out[k] = { w, h };
  }
  return out;
};

/**
 * 按类型的默认样式归一化：只认已知组件类型，样式项按 shared/widget-style 归一化，
 * 空样式（四个键都没设）丢弃——`{}` 即「该类没有默认样式」。
 */
const normStyleDefaults = (v: unknown): Record<string, WidgetStyle> => {
  if (typeof v !== 'object' || v === null) return {};
  const out: Record<string, WidgetStyle> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!WIDGET_KINDS.has(k)) continue;
    const s = normStyle(raw);
    if (!isBlankStyle(s)) out[k] = s;
  }
  return out;
};

/** 网格坐标归一化（数字 + 边界钳制） */
const gridNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : -1);

/** 卡片实例归一化：未知类型丢弃（坏数据不进布局）；旧类型（「倒数日」）转接为「倒计时」 */
export const normalizeGridItem = (v: unknown, kinds: ReadonlySet<string>): StoredDoc['pages'][number][number] | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const w = gridNum(o['w']);
  const h = gridNum(o['h']);
  if (w <= 0 || h <= 0) return null;
  const config = typeof o['config'] === 'object' && o['config'] !== null ? (o['config'] as Record<string, unknown>) : {};
  const raw = typeof o['t'] === 'string' ? o['t'] : '';
  const mapped = kinds.has(raw) ? { t: raw, config } : fromLegacyKind(raw, config);
  if (mapped === null) return null;
  return {
    id: typeof o['id'] === 'string' && o['id'] !== '' ? o['id'] : `i${Math.random().toString(36).slice(2, 8)}`,
    c: Math.max(0, gridNum(o['c'])),
    r: Math.max(0, gridNum(o['r'])),
    w,
    h,
    t: mapped.t as StoredDoc['pages'][number][number]['t'],
    config: mapped.config,
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
 * 持久化文档归一化：任何一部分坏数据只丢该部分。
 * 布局允许为空（首次安装是空白页，用户可能只留一个空页），空数组是合法文档；
 * 只有结构非法（pages 不是数组/对象，或 v2 双套都为空）才返回 null。
 * v2 旧文档（standard + privacy 双套）自动合并为单套：隐私页在前为基准，标准页卡片追加其后。
 */
export const parseStoredDoc = (v: unknown, kinds: ReadonlySet<string>): StoredDoc | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const pages = o['pages'];
  if (typeof pages !== 'object' || pages === null) return null;
  const po = pages as Record<string, unknown>;
  const single = normalizeModePages(pages, kinds);
  const standard = normalizeModePages(po['standard'], kinds);
  const privacy = normalizeModePages(po['privacy'], kinds);
  // v3 单套直读；v2 双套合并（隐私页在前为基准）
  const merged = single.length > 0 ? single : [...privacy, ...standard];
  /* 空白页是合法状态（首次安装 / 用户清空）：结构完好但没有任何卡片时保留一个空页；
     有卡片却全部无法识别仍判为坏数据（回退空白页会让用户误以为数据丢了） */
  const blankV3 = Array.isArray(pages) && pages.every((pg) => Array.isArray(pg) && pg.length === 0);
  if (merged.length === 0 && !blankV3) return null;
  return {
    v: 3,
    settings: normalizeSettings(o['settings']),
    pages: merged.length > 0 ? merged : [[]],
    engines: normalizeEngines(o['engines']),
    skins: normalizeSkins(),
    history: Array.isArray(o['history']) ? o['history'].filter((h): h is string => typeof h === 'string').slice(0, 20) : [],
    welcomed: boolish(o['welcomed'], false),
    backupTime: typeof o['backupTime'] === 'string' ? o['backupTime'] : null,
    updatedAt: typeof o['updatedAt'] === 'string' ? o['updatedAt'] : null,
    appVersion: typeof o['appVersion'] === 'string' ? o['appVersion'] : null,
  };
};

/** 布尔串 'true'/'false' → boolean（kv 字符串开关） */
export function parseBooleanStr(v: string | null | undefined): boolean {
  return v === 'true';
}
