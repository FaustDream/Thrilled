/**
 * 链接打开统一入口（01 §1.1 link-opener）
 *
 * 所有外链打开行为统一走 `openLink`，打开方式遵循设置（AppSettings.openMode，02 §10）：
 * - tab：新标签页打开（默认）
 * - link：当前窗口打开
 * - search：搜索结果当前窗口打开，站点链接仍开新标签页
 */

import type { OpenMode } from '../shared/types';
import { isHttpUrl } from '../shared/guards';
import { warn } from './logger';

const MODULE = 'link-opener';

/** 在新标签页打开（扩展用 chrome.tabs；浏览器开发预览用 window.open） */
async function openInNewTab(url: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.tabs !== undefined) {
    await chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/**
 * 统一打开链接
 * @param url 目标地址（仅接受 http/https）
 * @param mode 打开方式设置
 * @param kind 链接种类：search（搜索结果）/ link（站点链接）
 */
export async function openLink(url: string, mode: OpenMode, kind: 'search' | 'link'): Promise<void> {
  if (!isHttpUrl(url)) {
    warn(MODULE, '非 http(s) 链接已忽略', { url });
    return;
  }
  const newTab = mode === 'tab' || (mode === 'search' && kind === 'link');
  if (newTab) {
    await openInNewTab(url);
    return;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs !== undefined) {
    // 扩展新标签页里「当前窗口打开」= 覆盖当前标签页
    const self = await chrome.tabs.getCurrent()
    if (self?.id !== undefined) {
      await chrome.tabs.update(self.id, { url });
      return;
    }
  }
  window.open(url, '_self');
}

/** 由引擎与关键词拼搜索地址 */
export const buildSearchUrl = (base: string, term: string): string => `${base}${encodeURIComponent(term)}`;
