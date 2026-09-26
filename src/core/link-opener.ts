/**
 * 链接打开统一入口（wiki/04 §4.5 linkOpener）
 *
 * 所有外链打开行为统一走 `openUrl`，遵守「新标签打开」设置（linkNewTab_<type>）。
 * 新增链接类型需同步注册常量。
 */

import { LS_KEYS } from '../shared/constants';
import type { LinkOpenType } from '../shared/types';
import { isHttpsUrl } from '../shared/guards';
import { warn } from './logger';
import { localStorageService } from './storage';

const MODULE = 'link-opener';

/** 打开链接选项 */
export interface OpenUrlOptions {
  /** 链接类型：决定 linkNewTab_<type> 开关 */
  type?: LinkOpenType;
}

/** 读取对应类型的新标签开关（默认 true） */
function shouldOpenInNewTab(type: LinkOpenType): boolean {
  // tiles 与 search 各用独立键
  const key = type === 'tiles' ? LS_KEYS.LINK_NEW_TAB_TILES : LS_KEYS.LINK_NEW_TAB_SEARCH;
  const value = localStorageService.getRaw(key);
  return value !== 'false';
}

/**
 * 统一打开链接
 * - 非法 URL 直接忽略并告警（R18）
 * - 磁贴/搜索链接遵循新标签开关
 */
export async function openUrl(url: string, opts: OpenUrlOptions = {}): Promise<void> {
  const type = opts.type ?? 'other';
  if (typeof chrome === 'undefined' || chrome.tabs === undefined) {
    location.href = url;
    return;
  }
  if (type === 'tiles' || type === 'search') {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (shouldOpenInNewTab(type)) {
        await chrome.tabs.create({ url });
        return;
      }
      location.href = url;
      return;
    }
    warn(MODULE, `非 http(s) 链接已忽略`, { url });
    return;
  }
  // 其他类型：仅 https，非法忽略
  if (isHttpsUrl(url)) {
    await chrome.tabs.create({ url });
  } else {
    warn(MODULE, `非法链接已忽略`, { url });
  }
}
