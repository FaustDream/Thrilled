/**
 * 外部壁纸来源适配器（v4.4）
 *
 * 系统不内置任何壁纸资源；来源由用户在「个性化 - 壁纸来源」自主添加。
 * 现有两种协议适配器，同构 API 可通过改基址接入镜像服务：
 * - wallhaven：wallhaven.cc 及同构 API，分类保持原站结构（General / Anime / People）
 * - picsum：picsum.photos 列表协议，原站无分类 → 单一「全部」
 * buildListUrl / parseList 为纯函数（单测覆盖）；请求经 core/fetch-proxy。
 */

import type { WallpaperSource } from '../shared/types';
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
}

export interface WallPage {
  photos: WallPhoto[];
  page: number;
  hasMore: boolean;
}

/** 添加来源的协议模板（一键加入，基址可后续编辑为镜像地址） */
export const WALL_SOURCE_TEMPLATES: readonly { kind: WallpaperSource['kind']; name: string; apiBase: string }[] = [
  { kind: 'wallhaven', name: 'Wallhaven', apiBase: 'https://wallhaven.cc/api/v1' },
  { kind: 'picsum', name: 'Picsum', apiBase: 'https://picsum.photos' },
];

/** 来源的分类清单（与外部网站原有分类结构一致） */
export const sourceCategories = (kind: WallpaperSource['kind']): WallCategory[] =>
  kind === 'wallhaven'
    ? [{ key: 'general', label: 'General' }, { key: 'anime', label: 'Anime' }, { key: 'people', label: 'People' }]
    : [{ key: 'all', label: '全部' }];

const PICSUM_PAGE_SIZE = 30 as const;
/** wallhaven categories 参数：General/Anime/People 三位开关（原站协议） */
const WH_CATEGORY_BITS: Record<string, string> = { general: '100', anime: '010', people: '001' };

const cleanBase = (apiBase: string): string => apiBase.replace(/\/+$/, '');

/** 列表 API 地址（纯函数） */
export const buildListUrl = (src: WallpaperSource, cat: string, page: number): string => {
  const base = cleanBase(src.apiBase);
  if (src.kind === 'picsum') return `${base}/v2/list?page=${page}&limit=${PICSUM_PAGE_SIZE}`;
  const cats = WH_CATEGORY_BITS[cat];
  return `${base}/search?purity=100&page=${page}${cats ? `&categories=${cats}` : ''}`;
};

/** 解析列表响应（纯函数；坏数据字段丢弃，空列表原样返回） */
export const parseList = (src: WallpaperSource, page: number, text: string): WallPage => {
  const base = cleanBase(src.apiBase);
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    return { photos: [], page, hasMore: false };
  }
  if (src.kind === 'picsum') {
    const arr = Array.isArray(data) ? data : [];
    return {
      page,
      hasMore: arr.length >= PICSUM_PAGE_SIZE,
      photos: arr.map((x) => {
        const o = x as Record<string, unknown>;
        const id = String(o['id'] ?? '');
        return {
          id,
          thumb: `${base}/id/${id}/360/240`,
          full: `${base}/id/${id}/1920/1080`,
          author: String(o['author'] ?? ''),
        };
      }),
    };
  }
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const rows = Array.isArray(obj['data']) ? obj['data'] : [];
  const meta = (typeof obj['meta'] === 'object' && obj['meta'] !== null ? obj['meta'] : {}) as Record<string, unknown>;
  const lastPage = typeof meta['last_page'] === 'number' ? meta['last_page'] : 0;
  const photos = rows.map((x) => {
    const o = x as Record<string, unknown>;
    const id = String(o['id'] ?? '');
    const path = String(o['path'] ?? '');
    const thumbs = (typeof o['thumbs'] === 'object' && o['thumbs'] !== null ? o['thumbs'] : {}) as Record<string, unknown>;
    const uploader = (typeof o['uploader'] === 'object' && o['uploader'] !== null ? o['uploader'] : {}) as Record<string, unknown>;
    const thumb = typeof thumbs['large'] === 'string' ? thumbs['large']
      : (typeof thumbs['small'] === 'string' ? thumbs['small'] : path);
    return { id, thumb, full: path, author: typeof uploader['username'] === 'string' ? uploader['username'] : '' };
  });
  return { page, hasMore: lastPage > page, photos };
};

/** 拉取一页壁纸（分类 + 页码） */
export const fetchWallPage = async (src: WallpaperSource, cat: string, page: number): Promise<WallPage> =>
  parseList(src, page, await fetchText(buildListUrl(src, cat, page)));
