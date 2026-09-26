/**
 * 收藏夹 → 分类/磁贴 转换（纯逻辑，无 chrome.* 直接调用，可单测）
 *
 * 首次初始化时，将浏览器收藏夹树（chrome.bookmarks.getTree() 结果）转换为
 * 新标签页的分类（TilePage）与磁贴（Tile）：
 * - 收藏夹栏的直接子书签 → 「第1页」分类；子文件夹 → 各自独立分类
 * - 仅保留 http(s) 书签；空文件夹/空分类跳过
 * - 跳过「其他书签」「移动设备书签」等 Chrome 系统文件夹（id="2"/"3"）
 *
 * @see wiki/02 §2.4 磁贴数据模型
 */

import { DEFAULT_PAGE_NAME } from '../shared/constants';
import type { Tile, TilePage } from '../shared/types';

/** 收藏夹栏顶层文件夹的典型 id（Chrome/Edge 固定 root 结构） */
const BOOKMARKS_BAR_ID = '1';
/** Chrome 系统文件夹 id（跳过，不导入） */
const OTHER_BOOKMARKS_ID = '2';
const MOBILE_BOOKMARKS_ID = '3';
/** 收藏夹栏下直接书签的分类名（没有归属子文件夹的书签归入此分类） */
const DIRECT_BOOKMARKS_CATEGORY = DEFAULT_PAGE_NAME;

/** 可导入的 URL 协议白名单（仅 http/https） */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/** 规范化书签节点树的最小形状（避免依赖 chrome.bookmarks.BookmarkTreeNode；exactOptionalPropertyTypes 下显式允许 undefined） */
interface BookmarkNode {
  id?: string | undefined;
  title?: string | undefined;
  url?: string | undefined;
  children?: BookmarkNode[] | undefined;
}

/** 判定书签 URL 是否可导入 */
export function isImportableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}

/** 由单个书签项生成磁贴 */
function makeTile(item: { title: string; url: string }, idx: number): Tile | null {
  if (!isImportableUrl(item.url)) return null;
  const label = item.title.trim() || item.url;
  return {
    id: `tile_bm_${idx}` as Tile['id'],
    label,
    url: item.url,
    type: 'favicon',
    icon: '',
    color: '#1c1c1c',
    position: idx,
    imageData: '',
  };
}

/** 从一组 {title,url} 生成 TilePage（去重同 URL） */
function itemsToPage(items: Array<{ title: string; url: string }>, categoryName: string): TilePage | null {
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  for (const item of items) {
    const norm = item.url.replace(/\/+$/, '');
    if (seen.has(norm)) continue;
    seen.add(norm);
    const tile = makeTile(item, tiles.length);
    if (tile !== null) tiles.push(tile);
  }
  if (tiles.length === 0) return null;
  return { name: categoryName, tiles };
}

/** 收集节点下所有书签（递归平铺，用于子文件夹内容） */
function collectBookmarks(node: BookmarkNode): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const walk = (n: BookmarkNode): void => {
    if (typeof n.url === 'string' && n.url !== '') {
      out.push({ title: n.title ?? '', url: n.url });
      return;
    }
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return out;
}

/** 判定节点是否为文件夹（无 url 且有 children） */
function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined || node.url === '';
}

/**
 * 收藏夹树 → 分类列表
 *
 * 分类策略：
 * 1. 收藏夹栏（id="1"）：
 *    a. 直接书签（非文件夹子节点）→ 「第1页」（DIRECT_BOOKMARKS_CATEGORY）
 *    b. 子文件夹 → 各自独立分类（文件夹名 = 分类名）
 * 2. 跳过「其他书签」（id="2"）和「移动设备书签」（id="3"）
 *
 * @param tree chrome.bookmarks.getTree() 的返回（根节点数组）
 * @returns 分类数组
 */
export function buildPagesFromBookmarks(tree: readonly BookmarkNode[]): TilePage[] {
  const root = tree[0];
  const topLevel = root?.children ?? [];
  const pages: TilePage[] = [];
  const seenNames = new Set<string>();

  const pushPage = (name: string, page: TilePage | null): void => {
    if (page === null) return;
    if (seenNames.has(name)) return;
    seenNames.add(name);
    pages.push(page);
  };

  // 1) 收藏夹栏（id="1"）：子文件夹 → 独立分类；直接书签 → 「第1页」
  const bar = topLevel.find((n) => n.id === BOOKMARKS_BAR_ID);
  if (bar !== undefined) {
    const directBookmarks: Array<{ title: string; url: string }> = [];
    for (const child of bar.children ?? []) {
      if (isFolder(child)) {
        // 子文件夹 → 独立分类
        const name = child.title?.trim();
        if (name !== undefined && name !== '') {
          const bookmarks = collectBookmarks(child).filter((x) => isImportableUrl(x.url));
          pushPage(name, itemsToPage(bookmarks, name));
        }
      } else if (typeof child.url === 'string' && child.url !== '') {
        // 直接书签
        directBookmarks.push({ title: child.title ?? '', url: child.url });
      }
    }
    // 收藏夹栏根层级直接书签 → 「第1页」
    pushPage(DIRECT_BOOKMARKS_CATEGORY, itemsToPage(directBookmarks, DIRECT_BOOKMARKS_CATEGORY));
  }

  // 2) 其余顶层文件夹（跳过 Chrome 系统文件夹：其他书签 id="2" / 移动设备 id="3"）
  for (const folder of topLevel) {
    const id = folder.id ?? '';
    if (id === BOOKMARKS_BAR_ID || id === OTHER_BOOKMARKS_ID || id === MOBILE_BOOKMARKS_ID) continue;

    const name = folder.title?.trim();
    if (name === undefined || name === '') continue;

    const bookmarks = collectBookmarks(folder).filter((x) => isImportableUrl(x.url));
    pushPage(name, itemsToPage(bookmarks, name));
  }

  return pages;
}
