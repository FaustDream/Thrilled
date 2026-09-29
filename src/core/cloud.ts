/**
 * 云端数据同步（v4.3）
 *
 * 定位：云端为唯一权威数据源——已配置云端时，本地改动自动推送到服务器；
 * 其他环境初始化 / 手动「从云端恢复」时拉取云端文档覆盖本地（以云端最新版本为准）。
 *
 * 安全约定：
 * - 服务器地址与访问令牌只保存在浏览器本地存储（chrome.storage / localStorage），
 *   通过设置界面注入，**绝不写入代码仓库**；仓库中不存在任何真实云端配置。
 * - 服务端鉴权：Authorization: Bearer <令牌>；服务端部署与令牌设置见 server/README.md。
 */

import { parseStoredDoc } from '../shared/guards';
import { WIDGET_KINDS } from '../shared/widget-defs';
import type { StoredDoc } from '../shared/types';
import { kvGet, kvSet } from './storage';
import { info, warn } from './logger';

const MODULE = 'cloud';

const CLOUD_URL_KEY = 'thrilled:cloud:url';
const CLOUD_TOKEN_KEY = 'thrilled:cloud:token';

/** 云端连接配置（仅存于本机浏览器存储，与代码仓库分离） */
export interface CloudConfig {
  url: string;
  token: string;
}

export const getCloudConfig = (): CloudConfig => ({
  url: kvGet<string>(CLOUD_URL_KEY, '').trim(),
  token: kvGet<string>(CLOUD_TOKEN_KEY, '').trim(),
});

export const setCloudConfig = (cfg: CloudConfig): void => {
  kvSet(CLOUD_URL_KEY, cfg.url.trim());
  kvSet(CLOUD_TOKEN_KEY, cfg.token.trim());
  info(MODULE, '云端连接配置已更新（仅保存在本机）');
};

export const cloudConfigured = (): boolean => getCloudConfig().url !== '';

/** 规范化端点：去掉尾部斜杠，拼上文档路径 */
const endpoint = (url: string): string => `${url.replace(/\/+$/, '')}/thrilled/doc`;

/** 拉取云端文档；未配置 / 无数据 / 结构非法返回 null */
export async function cloudPull(): Promise<StoredDoc | null> {
  const { url, token } = getCloudConfig();
  if (url === '') return null;
  try {
    const res = await fetch(endpoint(url), { headers: token !== '' ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as unknown;
    const doc = parseStoredDoc(data, WIDGET_KINDS);
    info(MODULE, '已拉取云端文档');
    return doc;
  } catch (e) {
    warn(MODULE, '拉取云端文档失败', { err: (e as Error).message });
    throw e;
  }
}

/** 推送本地文档到云端（整存整取） */
export async function cloudPush(doc: StoredDoc): Promise<void> {
  const { url, token } = getCloudConfig();
  if (url === '') return;
  try {
    const res = await fetch(endpoint(url), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token !== '' ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(doc),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    info(MODULE, '已推送本地文档到云端');
  } catch (e) {
    warn(MODULE, '推送云端失败', { err: (e as Error).message });
    throw e;
  }
}
