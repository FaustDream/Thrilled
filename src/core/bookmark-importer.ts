/**
 * 收藏夹导入（v4，纯逻辑无 chrome.* 直接调用，可单测）
 *
 * 将浏览器收藏夹树（chrome.bookmarks.getTree() 结果）转换为 v4 网址图标条目：
 * - 只保留 http(s) 书签；跳过「其他书签」「移动设备书签」等 Chrome 系统文件夹
 * - 同 URL 去重
 * - 输出扁平列表，落位（findSlot / 自动翻页）由 app 层负责
 *
 * @see docs/v4/02-UI规格.md §13（内容模型）
 */

import { warn } from './logger';

/** 收藏夹栏顶层文件夹的典型 id（Chrome/Edge 固定 root 结构） */
const BOOKMARKS_BAR_ID = '1';
/** Chrome 系统文件夹 id（跳过，不导入） */
const OTHER_BOOKMARKS_ID = '2';
const MOBILE_BOOKMARKS_ID = '3';

/** 可导入的 URL 协议白名单（仅 http/https） */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/** 规范化书签节点树的最小形状（避免依赖 chrome.bookmarks.BookmarkTreeNode） */
export interface BookmarkNode {
  id?: string | undefined;
  title?: string | undefined;
  url?: string | undefined;
  children?: BookmarkNode[] | undefined;
}

/** 导出条目：网址图标实例的 config 素材 */
export interface BookmarkEntry {
  label: string;
  url: string;
}

/** 判定书签 URL 是否可导入 */
export function isImportableUrl(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** 是否为 Chrome 系统文件夹（整个跳过） */
function isSystemFolder(node: BookmarkNode): boolean {
  return node.id === OTHER_BOOKMARKS_ID || node.id === MOBILE_BOOKMARKS_ID;
}

/** 深度优先收集可导入书签（URL 规范化去重：忽略尾斜杠差异） */
function walk(nodes: BookmarkNode[] | undefined, out: BookmarkEntry[], seen: Set<string>): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (isSystemFolder(node)) continue;
    const url = typeof node.url === 'string' ? node.url : '';
    if (url !== '') {
      const key = url.replace(/\/+$/, '');
      if (!isImportableUrl(url) || seen.has(key)) continue;
      seen.add(key);
      out.push({ label: node.title?.trim() || url, url });
      continue;
    }
    walk(node.children, out, seen);
  }
}

/**
 * 收藏夹树 → 网址图标条目列表（收藏夹栏 + 其余顶层文件夹全部纳入，协议过滤、去重）
 * @param root getTree() 返回的根节点数组
 */
export function collectBookmarks(root: BookmarkNode[]): BookmarkEntry[] {
  const out: BookmarkEntry[] = [];
  const seen = new Set<string>();
  const bar = root.find((n) => n.id === BOOKMARKS_BAR_ID);
  const rest = root.filter((n) => n.id !== BOOKMARKS_BAR_ID);
  // 收藏夹栏在前，其余顶层（多为「其他书签」，已按 id 跳过）在后
  walk(bar ? [bar] : [], out, seen);
  walk(rest, out, seen);
  return out;
}

/** 读取浏览器收藏夹树（非扩展环境返回 null，UI 引导用） */
export async function readBookmarkTree(): Promise<BookmarkNode[] | null> {
  if (typeof chrome === 'undefined' || chrome.bookmarks === undefined) return null;
  try {
    const tree = await chrome.bookmarks.getTree();
    return tree as BookmarkNode[];
  } catch (e) {
    warn('bookmark-importer', '读取收藏夹失败', { err: (e as Error).message });
    return null;
  }
}
