/**
 * 搜索系统（对齐原版 js/search.js）
 *
 * v3 起：按用户要求移除「自做探测联想」面板，输入后直接使用当前搜索引擎搜索。
 * 保留搜索历史记录（去重上限 20）供未来复用；不再渲染任何建议面板。
 */

import { debug } from '../../lib/logger';
import {
  LS_KEYS,
  SEARCH_HISTORY_LIMIT,
} from '../../shared/constants';
import { getEngineById } from '../../shared/types';
import type { EngineId } from '../../shared/types';
import { parseBooleanStr } from '../../shared/guards';
import { state } from './state';
import { localStorageService } from './storage';
import { openUrl } from './link-opener';

const MODULE = 'search';

/** 搜索相关开关（initSearch 时读取一次，设置变更时通过 updateSearchFlags 更新） */
export const searchFlags = {
  /** 搜索后是否保留输入框内容 */
  retain: false,
  /** 是否隐藏搜索按钮 */
  hideBtn: false,
};

/** 更新搜索开关并立即生效 */
export function updateSearchFlags(key: string, value: boolean): void {
  const searchBtn = document.getElementById('searchButton');
  switch (key) {
    case 'search_retain':
      searchFlags.retain = value;
      break;
    case 'search_hide_btn':
      searchFlags.hideBtn = value;
      if (searchBtn !== null) {
        searchBtn.style.display = value ? 'none' : '';
      }
      break;
  }
}

/* ================= 搜索历史 ================= */

/** 加载搜索历史 */
export function loadSearchHistory(): void {
  state.searchHistory = localStorageService.get<string[]>(LS_KEYS.SEARCH_HISTORY, []);
}

/** 新增搜索历史：去重后 unshift，超限截断（幂等 R6） */
export function addSearchHistory(term: string): void {
  const trimmed = term.trim();
  if (trimmed === '') return;
  const next = [trimmed, ...state.searchHistory.filter((t) => t !== trimmed)];
  state.searchHistory = next.slice(0, SEARCH_HISTORY_LIMIT);
  localStorageService.set(LS_KEYS.SEARCH_HISTORY, state.searchHistory);
}

/** 清除搜索历史 */
export function clearSearchHistory(): void {
  state.searchHistory = [];
  localStorageService.set(LS_KEYS.SEARCH_HISTORY, []);
}

/* ================= 搜索执行 ================= */

/** 执行搜索 */
export async function executeSearch(query: string, engineId?: EngineId): Promise<void> {
  const q = query.trim();
  if (q === '') return;
  const engine = getEngineById(engineId ?? state.engine);
  if (engine === null) return;
  addSearchHistory(q);
  await openUrl(`${engine.base}${encodeURIComponent(q)}`, { type: 'search' });
  // 未开启「保留搜索内容」时，搜索后清空输入框
  if (!searchFlags.retain) {
    const input = document.getElementById('searchInput') as HTMLInputElement | null;
    if (input !== null) input.value = '';
  }
}

/** 初始化搜索：加载历史 + 绑定事件 */
export function initSearch(): void {
  loadSearchHistory();
  searchFlags.retain = parseBooleanStr(localStorageService.getRaw(LS_KEYS.SEARCH_RETAIN));
  searchFlags.hideBtn = parseBooleanStr(localStorageService.getRaw(LS_KEYS.SEARCH_HIDE_BTN));

  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  const searchBtn = document.getElementById('searchButton');
  if (input === null) return;

  // 隐藏搜索按钮开关
  if (searchFlags.hideBtn && searchBtn !== null) {
    searchBtn.style.display = 'none';
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void executeSearch(input.value);
    } else if (e.key === 'Escape') {
      input.value = '';
    }
  });
  searchBtn?.addEventListener('click', () => {
    void executeSearch(input.value);
  });
  debug(MODULE, '搜索初始化完成');
}