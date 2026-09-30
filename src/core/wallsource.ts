/**
 * 外部壁纸来源统一适配器（v4.4）
 *
 * 系统不内置任何壁纸资源；来源由用户在「个性化 - 壁纸来源」自主添加，支持新增 / 启用 / 禁用 / 删除 / 改基址。
 * 每个适配器独立实现：分类获取、列表地址、分页规则、图片字段映射；buildListUrl / parseList 为纯函数（单测覆盖）。
 *
 * 线上验证记录（2026-09-30，HTTP 状态码实测）：
 * - wallhaven：wallhaven.cc 官方 API；分类保持原站结构（General / Anime / People）
 * - picsum：picsum.photos v2 列表协议；原站无分类 → 单一「全部」
 * - bing：必应官方 HPImageArchive 接口 200 JSON，原图 1080p/UHD 与缩略图 CDN 均 200 可达；分类=每日精选，按天分页
 * - wg061129：Wallpaper Gallery（github.com/IT-NuanxinPro/wallpaper-gallery，MIT）公开数据目录 /data，
 *   分类与清单 JSON 经项目开源 codec 解码（blob 字段），图片 CDN img.061129.xyz 浏览器内核实测可达；分类保持原站结构
 * - 哲风壁纸（haowallpaper.com）：接口报文为站方私有加密，属访问限制，不做逆向接入
 *
 * 请求统一经 core/fetch-proxy：扩展环境由 SW 代理绕过 CORS，开发预览回退直连。
 */

import type { WallpaperSource } from '../shared/types';
import { decodeBlob } from './wallpaper061129-codec';
import { fetchText } from './fetch-proxy';

export interface WallCategory {
  key: string;
  label: string;
}

export interface WallPhoto {
  id: string;
  /** 预览缩略图（<img> 直接加载，不受 CORS 限制） */
  thumb: string;
  /** 原图地址（设为壁纸时下载落地） */
  full: string;
  author: string;
  title: string;
}

export interface WallPage {
  photos: WallPhoto[];
  page: number;
  hasMore: boolean;
}

/** 添加来源的协议模板（一键加入，基址可后续编辑为镜像地址；可用性以实测结果标注） */
export const WALL_SOURCE_TEMPLATES: readonly { kind: WallpaperSource['kind']; name: string; apiBase: string }[] = [
  { kind: 'wallhaven', name: 'Wallhaven', apiBase: 'https://wallhaven.cc/api/v1' },
  { kind: 'picsum', name: 'Picsum', apiBase: 'https://picsum.photos' },
  { kind: 'bing', name: '必应每日', apiBase: 'https://www.bing.com' },
  { kind: 'wg061129', name: '061129 精选', apiBase: 'https://wallpaper.061129.xyz/data' },
  { kind: 'zhefeng', name: '哲风壁纸', apiBase: 'https://haowallpaper.com/link' },
];

/** 实测存在无法合法解决的访问限制的来源（保留为可配置源，但明确标记为当前不可用；不做破解或伪造） */
export const WALL_SOURCE_UNAVAILABLE: Partial<Record<WallpaperSource['kind'], string>> = {
  zhefeng: '接口报文为站方加密保护（请求参数经对称加密），不做破解，当前无法合法接入',
};

/** 来源是否支持关键词搜索（由适配器声明） */
export const sourceSearchable = (kind: WallpaperSource['kind']): boolean => kind === 'wallhaven' || kind === 'wg061129';

const PICSUM_PAGE_SIZE = 30 as const;
const WG061129_PAGE_SIZE = 30 as const;
const BING_PAGE_SIZE = 8 as const;
/** 061129 图片 CDN（与数据域分离，前端 bundle 与浏览器实测确认） */
const WG061129_IMG_BASE = 'https://img.061129.xyz';
/** wallhaven categories 参数：General/Anime/People 三位开关（原站协议） */
const WH_CATEGORY_BITS: Record<string, string> = { general: '100', anime: '010', people: '001' };

const cleanBase = (apiBase: string): string => apiBase.replace(/\/+$/, '');
const itemOf = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {});

/* ================= 分类 ================= */

/** 各协议的静态分类（061129 之外原样返回） */
const staticCategories = (kind: WallpaperSource['kind']): WallCategory[] => {
  if (kind === 'wallhaven') return [{ key: 'general', label: 'General' }, { key: 'anime', label: 'Anime' }, { key: 'people', label: 'People' }];
  if (kind === 'bing') return [{ key: 'daily', label: '每日精选' }];
  return [{ key: 'all', label: '全部' }];
};

/** 061129 分类清单缓存（key = 数据基址） */
const wgCategoryCache = new Map<string, WallCategory[]>();

/** 解析 061129 分类清单（index.json 的 blob 字段 → 分类数组；纯函数） */
export const parse061129Categories = (text: string): WallCategory[] => {
  let decoded: unknown;
  try {
    const j = itemOf(JSON.parse(text));
    decoded = JSON.parse(decodeBlob(String(j['blob'])));
  } catch {
    return [];
  }
  if (!Array.isArray(decoded)) return [];
  return decoded.map((x) => {
    const o = itemOf(x);
    const id = String(o['id'] ?? '');
    return { key: id, label: String(o['name'] ?? id) };
  }).filter((c) => c.key !== '');
};

/** 获取来源的分类清单（保持外部网站原有分类结构；061129 从数据目录拉取并缓存） */
export const fetchCategories = async (src: WallpaperSource): Promise<WallCategory[]> => {
  const unavailable = WALL_SOURCE_UNAVAILABLE[src.kind];
  if (unavailable) throw new Error(`当前不可用：${unavailable}`);
  if (src.kind !== 'wg061129') return staticCategories(src.kind);
  const base = cleanBase(src.apiBase);
  const cached = wgCategoryCache.get(base);
  if (cached) return cached;
  const cats = parse061129Categories(await fetchText(`${base}/desktop/index.json`));
  if (cats.length > 0) wgCategoryCache.set(base, cats);
  return cats;
};

/* ================= 列表 ================= */

/** 列表 API 地址（纯函数；query 为搜索关键词） */
export const buildListUrl = (src: WallpaperSource, cat: string, page: number, query = ''): string => {
  const base = cleanBase(src.apiBase);
  if (src.kind === 'picsum') return `${base}/v2/list?page=${page}&limit=${PICSUM_PAGE_SIZE}`;
  if (src.kind === 'bing') {
    const idx = (page - 1) * BING_PAGE_SIZE;
    return `${base}/HPImageArchive.aspx?format=js&idx=${idx}&n=${BING_PAGE_SIZE}&mkt=zh-CN`;
  }
  if (src.kind === 'wg061129') return `${base}/desktop/${encodeURIComponent(cat)}.json`;
  const bits = WH_CATEGORY_BITS[cat];
  const q = query.trim() !== '' ? `&q=${encodeURIComponent(query)}` : '';
  return `${base}/search?purity=100&page=${page}${bits ? `&categories=${bits}` : ''}${q}`;
};

/** 解析 wallhaven 响应（纯函数） */
const parseWallhaven = (page: number, text: string): WallPage => {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { photos: [], page, hasMore: false }; }
  const o = itemOf(data);
  const rows = Array.isArray(o['data']) ? o['data'] : [];
  const meta = itemOf(o['meta']);
  const lastPage = typeof meta['last_page'] === 'number' ? meta['last_page'] : 0;
  const photos = rows.map((x) => {
    const it = itemOf(x);
    const id = String(it['id'] ?? '');
    const path = String(it['path'] ?? '');
    const thumbs = itemOf(it['thumbs']);
    const thumb = typeof thumbs['large'] === 'string' ? thumbs['large'] : (typeof thumbs['small'] === 'string' ? thumbs['small'] : path);
    const uploader = itemOf(it['uploader']);
    return { id, thumb, full: path, author: typeof uploader['username'] === 'string' ? uploader['username'] : '', title: id };
  });
  return { photos, page, hasMore: lastPage > page };
};

/** 解析 picsum 响应（纯函数） */
const parsePicsum = (base: string, page: number, text: string): WallPage => {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { photos: [], page, hasMore: false }; }
  const rows = Array.isArray(data) ? data : [];
  const photos = rows.map((x) => {
    const it = itemOf(x);
    const id = String(it['id'] ?? '');
    const author = String(it['author'] ?? '');
    return { id, thumb: `${base}/id/${id}/360/240`, full: `${base}/id/${id}/1920/1080`, author, title: author };
  });
  return { photos, page, hasMore: rows.length >= PICSUM_PAGE_SIZE };
};

/** 解析必应每日响应（纯函数；1920x1080 原图替换为 UHD，缩略图取 400x240） */
const parseBing = (base: string, page: number, text: string): WallPage => {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { photos: [], page, hasMore: false }; }
  const rows = Array.isArray(itemOf(data)['images']) ? (itemOf(data)['images'] as unknown[]) : [];
  const abs = (u: string): string => (u.startsWith('http') ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`);
  const photos = rows.map((x) => {
    const it = itemOf(x);
    const url = String(it['url'] ?? '');
    const copyright = String(it['copyright'] ?? '');
    return {
      id: `bing-${String(it['date'] ?? url)}`,
      thumb: abs(url.replace(/_\d+x\d+/, '_400x240')),
      full: abs(url.replace(/_\d+x\d+/, '_UHD')),
      author: copyright.split('(')[0]?.trim() ?? '',
      title: String(it['title'] ?? ''),
    };
  });
  return { photos, page, hasMore: rows.length >= BING_PAGE_SIZE };
};

/** 解析 061129 分类清单响应（纯函数；全量数组按关键词过滤后 30/页切片分页） */
export const parse061129List = (page: number, text: string, query = ''): WallPage => {
  let data: unknown;
  try { data = JSON.parse(decodeBlob(String(itemOf(JSON.parse(text))['blob']))); } catch { return { photos: [], page, hasMore: false }; }
  const kw = query.trim().toLowerCase();
  const rows = (Array.isArray(data) ? data : []).filter((x) => {
    if (kw === '') return true;
    const it = itemOf(x);
    return [it['keywords'], it['tags'], it['displayTitle'], it['description'], it['filename'], it['subcategory']]
      .some((v) => JSON.stringify(v ?? '').toLowerCase().includes(kw));
  });
  const all = rows.map((x) => {
    const it = itemOf(x);
    const path = String(it['path'] ?? '');
    const thumb = String(it['thumbnailPath'] ?? '');
    const title = String(it['displayTitle'] ?? it['description'] ?? '');
    return { id: String(it['id'] ?? ''), thumb: `${WG061129_IMG_BASE}${thumb}`, full: `${WG061129_IMG_BASE}${path}`, author: '', title: title.slice(0, 40) };
  });
  return { photos: all.slice((page - 1) * WG061129_PAGE_SIZE, page * WG061129_PAGE_SIZE), page, hasMore: page * WG061129_PAGE_SIZE < all.length };
};

/** 解析列表响应（纯函数；坏数据返回空页不抛错） */
export const parseList = (src: WallpaperSource, page: number, text: string, query = ''): WallPage => {
  const base = cleanBase(src.apiBase);
  if (src.kind === 'picsum') return parsePicsum(base, page, text);
  if (src.kind === 'bing') return parseBing(base, page, text);
  if (src.kind === 'wg061129') return parse061129List(page, text, query);
  return parseWallhaven(page, text);
};

/** 拉取一页壁纸（分类 + 页码 + 可选搜索关键词） */
export const fetchWallPage = async (src: WallpaperSource, cat: string, page: number, query = ''): Promise<WallPage> => {
  const unavailable = WALL_SOURCE_UNAVAILABLE[src.kind];
  if (unavailable) throw new Error(`当前不可用：${unavailable}`);
  return parseList(src, page, await fetchText(buildListUrl(src, cat, page, query)), query);
};
