/**
 * 内置壁纸来源适配器
 *
 * 来源随代码内置（五个协议各一个站点），用户在壁纸页只切换来源，不增删改：
 * 站点地址固定，避免用户填错基址导致整源不可用。
 * 每个适配器独立实现：分类获取、列表地址、分页规则、图片字段映射；buildListUrl / parseList 为纯函数（单测覆盖）。
 *
 * 线上验证记录（2026-09-30，HTTP 状态码实测）：
 * - wallhaven：wallhaven.cc 官方 API；分类保持原站结构（General / Anime / People）
 * - picsum：picsum.photos v2 列表协议；原站无分类 → 单一「全部」
 * - bing：必应官方 HPImageArchive 接口 200 JSON，原图 1080p/UHD 与缩略图 CDN 均 200 可达；分类=每日精选，按天分页
 * - wg061129：Wallpaper Gallery（github.com/IT-NuanxinPro/wallpaper-gallery，MIT）公开数据目录 /data，
 *   分类与清单 JSON 经项目开源 codec 解码（blob 字段）。图片 CDN img.061129.xyz 有 Cloudflare
 *   防盗链：Referer 不是壁纸站点域一律 403（2026-10-23 实测，扩展页的默认 Referer 同样被拒），
 *   由 rules/wallpaper-referer.json 的 DNR 规则补站点 Referer 后缩略图与原图均可取；分类保持原站结构
 * - 哲风壁纸（haowallpaper.com）：**经用户明确授权**的兼容实现——其请求/响应为 AES-128-CBC
 *   加密（key/iv 硬编码于站方公开前端 JS，对所有用户统一，无身份绑定与时效签名），按其公开传输
 *   协议复现；分类保持原站「壁纸类型」结构，支持关键词搜索；原图下载需登录站方账号，当前以
 *   站方裁剪图（约 890px）作为壁纸图源。授权例外记录见 BUG_FIXES.md。
 *   站方对分页参数有校验：rows 超过 21 直接返回 400 PUBLIC_REQUEST_INVALID（2026-10-21 实测
 *   12 / 20 / 21 通过，22 起失败），页大小因此取站方 PC 端默认值 12。
 *
 * 请求统一经 core/fetch-proxy：扩展环境由 SW 代理绕过 CORS，开发预览回退直连。
 */

import type { WallpaperSource, WallSourceKind } from '../shared/types';
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

/** 出厂来源：未知协议一律回退到它（与设置里的出厂值一致） */
const ZHEFENG_SOURCE: WallpaperSource = { kind: 'zhefeng', name: '哲风壁纸', apiBase: 'https://haowallpaper.com/link' };

/** 内置来源清单（顺序即壁纸页的切换顺序；站点固定，不支持编辑） */
export const WALL_SOURCES: readonly WallpaperSource[] = [
  ZHEFENG_SOURCE,
  { kind: 'wg061129', name: 'Wallpaper Gallery', apiBase: 'https://wallpaper.061129.xyz/data' },
  { kind: 'bing', name: '必应每日', apiBase: 'https://www.bing.com' },
  { kind: 'picsum', name: 'Picsum', apiBase: 'https://picsum.photos' },
  { kind: 'wallhaven', name: 'Wallhaven', apiBase: 'https://wallhaven.cc/api/v1' },
];

/** 按协议取内置来源（未知协议回退出厂来源） */
export const wallSourceOf = (kind: WallSourceKind): WallpaperSource =>
  WALL_SOURCES.find((w) => w.kind === kind) ?? ZHEFENG_SOURCE;

/** 来源是否支持关键词搜索（由适配器声明） */
export const sourceSearchable = (kind: WallSourceKind): boolean =>
  kind === 'wallhaven' || kind === 'wg061129' || kind === 'zhefeng';

const PICSUM_PAGE_SIZE = 30 as const;
const WG061129_PAGE_SIZE = 30 as const;
const BING_PAGE_SIZE = 8 as const;
/**
 * 必应归档只有最近一周多：idx 超界后站方把最老的 8 张再返回一遍
 * （实测 idx=80 与 idx=8 首图完全一致），所以翻到第 2 页就到底。
 */
const BING_MAX_PAGE = 2 as const;
/** 061129 图片 CDN（与数据域分离，前端 bundle 与浏览器实测确认） */
const WG061129_IMG_BASE = 'https://img.061129.xyz';
/** wallhaven categories 参数：General/Anime/People 三位开关（原站协议） */
const WH_CATEGORY_BITS: Record<string, string> = { general: '100', anime: '010', people: '001' };

const cleanBase = (apiBase: string): string => apiBase.replace(/\/+$/, '');
const itemOf = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {});

/* ================= 分类 ================= */

/**
 * 静态分类：只有 wallhaven 需要写死（其 API 只接受 categories 参数，不返回分类清单）；
 * picsum / 必应 是单一信息流，没有分类，返回空数组让界面不显示分类行。
 */
const staticCategories = (kind: WallSourceKind): WallCategory[] => {
  if (kind === 'wallhaven') return [{ key: 'general', label: 'General' }, { key: 'anime', label: 'Anime' }, { key: 'people', label: 'People' }];
  return [];
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

/** 获取来源的分类清单：能取站方分类的取站方（061129 / 哲风），其余给静态分类或空 */
export const fetchCategories = async (src: WallpaperSource): Promise<WallCategory[]> => {
  if (src.kind === 'wg061129') {
    const base = cleanBase(src.apiBase);
    const cached = wgCategoryCache.get(base);
    if (cached !== undefined) return cached;
    const cats = parse061129Categories(await fetchText(`${base}/desktop/index.json`));
    if (cats.length > 0) wgCategoryCache.set(base, cats);
    return cats;
  }
  if (src.kind === 'zhefeng') return fetchZhefengCategories(src);
  return staticCategories(src.kind);
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
  return { photos, page, hasMore: page < BING_MAX_PAGE && rows.length >= BING_PAGE_SIZE };
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

/* ================= 列表缓存（会话级内存，TTL 30 分钟；壁纸本体本就落地 IndexedDB） ================= */

const PAGE_CACHE_TTL = 30 * 60 * 1000;
const pageCache = new Map<string, { at: number; page: WallPage }>();

/** 清空来源列表缓存（切换来源配置 / 排查数据问题时用） */
export const clearWallSourceCache = (): void => {
  pageCache.clear();
  wgCategoryCache.clear();
  zfCategoryCache.clear();
};

/**
 * 拉取一页壁纸（分类 + 页码 + 可选搜索关键词）
 * @param fresh 跳过读缓存（界面上的「重试 / 刷新」用它拿站方最新结果）；写缓存照旧
 */
export const fetchWallPage = async (src: WallpaperSource, cat: string, page: number, query = '', fresh = false): Promise<WallPage> => {
  const key = `${src.kind}:${cleanBase(src.apiBase)}:${cat}:${page}:${query.trim()}`;
  const hit = fresh ? undefined : pageCache.get(key);
  if (hit !== undefined && Date.now() - hit.at < PAGE_CACHE_TTL) return hit.page;
  const res =
    src.kind === 'zhefeng'
      ? await fetchZhefengPage(src, cat, page, query)
      : parseList(src, page, await fetchText(buildListUrl(src, cat, page, query)), query);
  pageCache.set(key, { at: Date.now(), page: res });
  return res;
};

/* ================= 哲风壁纸（经用户授权的兼容实现，协议见文件头注释） ================= */

/** 站方公开前端的 AES-128-CBC 密钥与 IV（对所有用户统一） */
const ZF_KEY = '68zhehao2O776519' as const;
const ZF_IV = 'aa176b7519e84710' as const;
/** 站方上限：rows > 21 直接返回 400「壁纸分页参数不正确」；取站方 PC 端默认页大小 */
const ZF_PAGE_SIZE = 12 as const;
/** 「综合推荐」分类键：不带 typeId，静态 + 动态一起返回（站方 PC 端默认口径） */
const ZF_ALL_CATEGORY = 'all' as const;
/** 站方壁纸类型位：1 静态 / 3 动态（4、7 为站方历史位，带上与站方前端一致） */
const ZF_WP_TYPES = '1,3,4,7' as const;

/** iv 显式声明为 ArrayBuffer 承载：WebCrypto 的 BufferSource 不接受 ArrayBufferLike（SharedArrayBuffer）版视图 */
const zfKeyIv = async (): Promise<{ key: CryptoKey; iv: Uint8Array<ArrayBuffer> }> => {
  const keyData = new TextEncoder().encode(ZF_KEY).slice().buffer;
  const iv = new TextEncoder().encode(ZF_IV).slice();
  const key = await crypto.subtle.importKey('raw', keyData, 'AES-CBC', false, ['encrypt', 'decrypt']);
  return { key, iv };
};

/** 站方协议加密：AES-128-CBC(PKCS7) → base64 */
export const zfEncrypt = async (text: string): Promise<string> => {
  const { key, iv } = await zfKeyIv();
  const buf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(text).slice().buffer);
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** 站方协议解密：base64 → AES-128-CBC 解密 → 去除 NUL 结尾（与站方前端行为一致） */
export const zfDecrypt = async (b64: string): Promise<string> => {
  const { key, iv } = await zfKeyIv();
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).slice();
  const buf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, raw.buffer);
  /* 明文尾部可能带 NUL 填充：按首个 NUL 截断（等价于去掉 NUL 及其后内容） */
  const text = new TextDecoder().decode(buf);
  const nul = text.indexOf('\u0000');
  return nul < 0 ? text : text.slice(0, nul);
};

/**
 * 解析哲风列表响应（纯函数：解密后的 JSON → 壁纸页）
 *
 * 清晰度取站方允许的最高档：静态壁纸用 previewFileImg（约 1100px，未登录可达的最高档）；
 * 动态壁纸的 previewFileImg 返回 mp4，不能当壁纸，仍用 getCroppingImg 的封面帧（约 890px）。
 * 原图需登录站方账号，未在本扩展内接入。
 */
export const parseZhefengList = (page: number, text: string): WallPage => {
  let body: Record<string, unknown>;
  try { body = itemOf(JSON.parse(text)); } catch { return { photos: [], page, hasMore: false }; }
  const rows: unknown[] = Array.isArray(body['list']) ? body['list'] : [];
  const total = typeof body['total'] === 'number' ? body['total'] : 0;
  const pages = typeof body['pages'] === 'number' ? body['pages'] : 0;
  const base = 'https://haowallpaper.com/link';
  const photos = rows.map((x) => {
    const it = itemOf(x);
    const fileId = String(it['fileId'] ?? '');
    const title = Array.isArray(it['labelList']) ? (it['labelList'] as unknown[]).slice(0, 3).join(' · ') : '';
    const crop = `${base}/common/file/getCroppingImg/${fileId}`;
    const preview = `${base}/common/file/previewFileImg/${fileId}`;
    return {
      id: String(it['wtId'] ?? ''),
      thumb: crop,
      full: Number(it['type']) === 1 ? preview : crop,
      author: '',
      title,
    };
  });
  return { photos, page, hasMore: (pages > 0 ? page < pages : photos.length > 0) && page * ZF_PAGE_SIZE < (total || page * ZF_PAGE_SIZE + 1) };
};

/**
 * 列表请求体（纯函数）
 * 字段与站方 PC 端 dataForm 一致：wpType 为壁纸类型位，typeId 为主题分类（站方 getTypeAll 的 id），lbId 为标签。
 */
export const buildZhefengPayload = (cat: string, page: number, query = ''): Record<string, string | number | boolean> => ({
  page,
  sortType: 3,
  rows: ZF_PAGE_SIZE,
  isFavorites: false,
  wpType: ZF_WP_TYPES,
  lbId: '',
  ...(cat !== '' && cat !== ZF_ALL_CATEGORY ? { typeId: cat } : {}),
  ...(query.trim() !== '' ? { search: query.trim() } : {}),
});

/** 解析哲风分类清单（纯函数：getTypeAll 解密后的 JSON → 综合推荐 + 站方主题分类） */
export const parseZhefengCategories = (text: string): WallCategory[] => {
  let body: Record<string, unknown>;
  try { body = itemOf(JSON.parse(text)); } catch { return []; }
  const rows = Array.isArray(body['1']) ? (body['1'] as unknown[]) : [];
  const types = rows.map((x) => {
    const o = itemOf(x);
    const id = String(o['id'] ?? '');
    return { key: id, label: String(o['typeName'] ?? id) };
  }).filter((c) => c.key !== '');
  return types.length > 0 ? [{ key: ZF_ALL_CATEGORY, label: '综合推荐' }, ...types] : [];
};

/** 哲风分类缓存（key = API 基址） */
const zfCategoryCache = new Map<string, WallCategory[]>();

/** 解析 JSON 对象（坏数据返回空对象，不抛错） */
const asObject = (text: string): Record<string, unknown> => {
  try { return itemOf(JSON.parse(text)); } catch { return {}; }
};

/** 站方错误响应里的提示语（非 JSON / 无 msg 时为空串），让失败原因直接可读 */
const zfErrorSuffix = (text: string): string => {
  const msg = asObject(text)['msg'];
  return typeof msg === 'string' && msg !== '' ? `：${msg}` : '';
};

/** 拉取哲风一页（加密请求 → 解密响应） */
const fetchZhefengPage = async (src: WallpaperSource, cat: string, page: number, query: string): Promise<WallPage> => {
  const data = encodeURIComponent(await zfEncrypt(JSON.stringify(buildZhefengPayload(cat, page, query))));
  const res = await fetch(`${cleanBase(src.apiBase)}/pc/wallpaper/wallpaperList?data=${data}`, { signal: AbortSignal.timeout(20000) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}${zfErrorSuffix(raw)}`);
  const body = asObject(raw)['data'];
  if (typeof body !== 'string' || body === '') throw new Error('响应格式异常');
  return parseZhefengList(page, await zfDecrypt(body));
};

/** 拉取哲风分类（getTypeAll → 解密）：站方返回的分类清单，取不到就让界面隐藏分类行 */
const fetchZhefengCategories = async (src: WallpaperSource): Promise<WallCategory[]> => {
  const base = cleanBase(src.apiBase);
  const cached = zfCategoryCache.get(base);
  if (cached !== undefined) return cached;
  const res = await fetch(`${base}/pc/wallpaper/getTypeAll`, { signal: AbortSignal.timeout(20000) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}${zfErrorSuffix(raw)}`);
  const data = asObject(raw)['data'];
  if (typeof data !== 'string' || data === '') throw new Error('响应格式异常');
  const cats = parseZhefengCategories(await zfDecrypt(data));
  if (cats.length > 0) zfCategoryCache.set(base, cats);
  return cats;
};
