/**
 * 新标签页启动入口
 *
 * Phase 0：主题（0 开销）
 * Phase 1：数据加载（设置/磁贴）
 * Phase 2：首屏渲染（引擎/磁贴/分类/搜索/背景/问候/天气/设置面板）
 */

import { info } from '../../lib/logger';
import { SHORTCUT_SIZE_OPTIONS } from '../../shared/constants';
import { initTheme, getColorScheme } from './theme-manager';
import { initStorage, dataService } from './storage';
import { state } from './state';
import { tileManager, renderTiles, attachTileDrag, toggleEditMode, selectAllInCurrentPage, batchMoveSelected } from './tiles';
import { renderCatRow, handleWheelScroll, attachCategoryDrag } from './category-ui';
import { initSearch } from './search';
import { bindEngineSelector, initEngineUI } from './navigation';
import { initWallpaper } from './wallpaper';
import { initDailyGreetingCard } from './daily-greeting';
import { initWeather } from './weather';
import { initSettingsPanel } from './settings-panel';
import { initExport, exportAllData } from './export';
import { initFileConfig, runInitialSetup, setOnLocalDataRestored } from './file-config';
import { initIconHydrate } from './icon-hydrate';
import { initOnboarding } from './onboarding';
import { resetAllData } from './reset';
import { showConfirm } from './dialogs';
import { bindGlobalEvents } from '../events';
import { initCommandPalette } from './command-palette';

const MODULE = 'main';

/** 应用快捷方式尺寸（CSS 变量） */
function applyShortcutSize(): void {
  const cfg = SHORTCUT_SIZE_OPTIONS[state.settings.shortcutSize];
  const root = document.documentElement;
  root.style.setProperty('--shortcut-container', `${cfg.size}px`);
  root.style.setProperty('--shortcut-icon', `${cfg.icon}px`);
  root.style.setProperty('--shortcut-gap', `${cfg.gap}px`);
  root.style.setProperty('--shortcut-radius', `${cfg.radius}px`);
  root.style.setProperty('--shortcut-label-size', `${cfg.fontSize}px`);
  if (state.settings.shortcutColumns !== 'auto') {
    root.style.setProperty('--shortcut-columns', String(Number(state.settings.shortcutColumns)));
  }
}

/**
 * 本地目录配置恢复完成后的重渲染钩子。
 * restoreHandleOnStartup 把本地同步目录的 tiles/settings 等写回存储后，
 * 主程序的内存状态与 UI 仍是恢复前的旧值，必须重新加载并重渲染才能「真正使用」本地默认配置。
 */
async function applyLocalRestore(): Promise<void> {
  state.settings = await dataService.getSettings();
  applyShortcutSize();
  await tileManager.load();
  renderCatRow();
  renderTiles();
  info(MODULE, '已从本地目录配置重渲染');
}

/** 启动序列 */
export async function boot(): Promise<void> {
  await initStorage();

  // Phase 0：主题
  initTheme();
  info(MODULE, '主题初始化', { scheme: getColorScheme() });

  // Phase 1：数据加载
  const settings = await dataService.getSettings();
  state.settings = settings;
  state.engine = settings.engine;
  state.currentPage = settings.categoryMemory ? settings.lastPage : 0;
  await tileManager.load();
  info(MODULE, 'Phase 1 数据加载完成', { pages: state.totalPages, engine: state.engine });

  // Phase 2：首屏渲染
  applyShortcutSize();
  initEngineUI();
  renderTiles();
  renderCatRow();
  initSearch();
  // 自动聚焦开关：启动时聚焦搜索框
  if (state.settings.autoFocus) {
    document.getElementById('searchInput')?.focus();
  }
  initWallpaper();
  initDailyGreetingCard();
  initWeather();
  initSettingsPanel();
  initExport();
  initFileConfig();
  initIconHydrate();
  bindGlobalEvents();
  initCommandPalette();
  info(MODULE, 'Phase 2 渲染完成');

  // Phase 2.3：首次安装初始化设置（路径选择）- 必须在onboarding之前
  setOnLocalDataRestored(applyLocalRestore);
  await runInitialSetup();

  // Phase 2.5：首次初始化引导（收藏夹导入）
  void initOnboarding();

  // Phase 3：全局事件
  bindEvents();

  // Phase 4：全局快捷键
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    // 输入态不拦截，避免与文本编辑快捷键冲突（如 Ctrl+A 全选文字）
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable;

    if (!isTyping && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAllInCurrentPage();
      return;
    }
    if (!isTyping && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      batchMoveSelected();
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      void exportAllData();
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      void (async () => {
        const confirmed = await showConfirm(
          '此操作将清除所有自定义磁贴、设置和数据目录配置，恢复到初始默认状态，且不可撤销。确定要继续吗？',
          { title: '⚠️ 重置所有数据', iconType: 'danger', danger: true, confirmText: '确认重置', cancelText: '取消' },
        );
        if (confirmed) {
          await resetAllData();
        }
      })();
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleEditMode();
    }
  });

  info(MODULE, 'boot 完成');
}

/** 绑定全局交互事件 */
function bindEvents(): void {
  const tilesContainer = document.getElementById('tilesContainer');
  if (tilesContainer !== null) attachTileDrag(tilesContainer);

  const catRow = document.getElementById('catRow');
  if (catRow !== null) attachCategoryDrag(catRow);

  // 滚轮翻页：限定在磁贴容器区域，避免设置面板/下拉框滚动误触翻页
  if (tilesContainer !== null) {
    tilesContainer.addEventListener('wheel', (e) => {
      handleWheelScroll(e);
    });
  }

  // 引擎选择器
  const selector = document.getElementById('engineSelector');
  if (selector !== null) bindEngineSelector(selector);
  // 点击引擎下拉外部关闭
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#engineSelector') === null && target.closest('#engineDropdown') === null) {
      document.getElementById('engineDropdown')?.classList.remove('visible');
    }
  });

  info(MODULE, 'Phase 3 事件绑定完成');
}

void boot();
