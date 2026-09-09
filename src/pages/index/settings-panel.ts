/**
 * 设置面板
 *
 * - 打开/关闭：`#settingsGearBtn` / `#settingsCloseBtn` / 遮罩点击
 * - Tab 切换：`.s-nav-item[data-s-tab]` ↔ `.s-tab[data-s-tab]`
 * - 开关：`.s-toggle input` 读写对应存储键并更新 state
 * - 分段控件：磁贴大小/每排数量 → CSS 变量
 */

import { info } from '../../lib/logger';
import { LS_KEYS, SHORTCUT_SIZE_OPTIONS } from '../../shared/constants';
import { isShortcutColumns, isShortcutSize } from '../../shared/guards';
import type { ShortcutColumns, ShortcutSize } from '../../shared/types';
import { state } from './state';
import { localStorageService } from './storage';
import { showConfirm } from './dialogs';
import { resetAllData } from './reset';
import { clearSelection } from './tiles';
import { updateSearchFlags } from './search';
import { getOrderedEngines, saveEngineOrder } from './navigation';
import { icon } from './icons';
import { attachReorder } from './reorder';

const MODULE = 'settings-panel';

/** 之前聚焦的元素（关闭面板时恢复） */
let lastFocusedElement: HTMLElement | null = null;

/** 获取面板内所有可聚焦元素 */
function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  const selectors = [
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(panel.querySelectorAll<HTMLElement>(selectors)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  );
}

/** 焦点陷阱：Tab/Shift+Tab 循环 */
function trapFocus(e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const panel = document.getElementById('settingsPanel');
  if (panel === null) return;
  const focusable = getFocusableElements(panel);
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement as HTMLElement | null;

  if (e.shiftKey) {
    // Shift+Tab: 如果在第一个元素，跳到最后一个
    if (active === first || !panel.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    // Tab: 如果在最后一个元素，跳到第一个
    if (active === last || !panel.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }
}

/** 获取开关 input（兼容 id 写在 label 或 input 上的两种写法） */
function getToggleInput(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) return el;
  return el?.querySelector<HTMLInputElement>('input') ?? null;
}

/** 开关控件 id → 存储键映射（原版命名） */
const TOGGLE_MAP: Readonly<Record<string, { key: string; defaultVal: boolean }>> = {
  sToggleAutoFocus: { key: LS_KEYS.AUTO_FOCUS, defaultVal: false },
  sToggleCategoryMemory: { key: LS_KEYS.CATEGORY_MEMORY, defaultVal: true },
  sToggleNewTabTiles: { key: LS_KEYS.LINK_NEW_TAB_TILES, defaultVal: true },
  sToggleNewTabSearch: { key: LS_KEYS.LINK_NEW_TAB_SEARCH, defaultVal: true },
  searchRetainToggle: { key: LS_KEYS.SEARCH_RETAIN, defaultVal: false },
  searchHideBtnToggle: { key: LS_KEYS.SEARCH_HIDE_BTN, defaultVal: false },
  sToggleCatRow: { key: LS_KEYS.CAT_ROW, defaultVal: true },
};

/** 打开设置面板 */
export function openSettings(): void {
  const overlay = document.getElementById('settingsOverlay');
  if (overlay === null) return;
  // 记录当前聚焦元素，关闭时恢复
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.classList.add('visible');
  syncAllControls();
  // 将焦点移到面板内的关闭按钮（或第一个可聚焦元素）
  requestAnimationFrame(() => {
    const panel = document.getElementById('settingsPanel');
    if (panel !== null) {
      const focusable = getFocusableElements(panel);
      (focusable[0] ?? panel).focus();
    }
  });
}

/** 关闭设置面板 */
export function closeSettings(): void {
  const overlay = document.getElementById('settingsOverlay');
  overlay?.classList.remove('visible');
  // 恢复之前的焦点
  if (lastFocusedElement !== null && document.body.contains(lastFocusedElement)) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

/** 切换设置面板 */
export function toggleSettings(): void {
  if (isSettingsOpen()) closeSettings();
  else openSettings();
}

/** 面板是否打开 */
export function isSettingsOpen(): boolean {
  const overlay = document.getElementById('settingsOverlay');
  return overlay !== null && overlay.classList.contains('visible');
}

/** 同步所有控件状态（从存储读取） */
function syncAllControls(): void {
  for (const [toggleId, cfg] of Object.entries(TOGGLE_MAP)) {
    const el = getToggleInput(toggleId);
    if (el !== null) {
      const raw = localStorageService.getRaw(cfg.key);
      el.checked = raw === null ? cfg.defaultVal : raw !== 'false';
    }
  }
  syncShortcutControls();
  syncBatchModifierKey();
}

/** 同步批量选择修饰键单选 */
function syncBatchModifierKey(): void {
  const key = state.settings.batchModifierKey;
  document.querySelectorAll<HTMLElement>('[data-batch-modifier]').forEach((el) => {
    el.classList.toggle('active', el.dataset.batchModifier === key);
  });
}

/** 同步磁贴大小/列数分段控件 */
function syncShortcutControls(): void {
  const sizeBtns = document.querySelectorAll<HTMLElement>('[data-shortcut-size]');
  sizeBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.shortcutSize === state.settings.shortcutSize);
  });
  const colBtns = document.querySelectorAll<HTMLElement>('[data-shortcut-columns]');
  colBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.shortcutColumns === state.settings.shortcutColumns);
  });
}

/** 应用磁贴尺寸 */
function applyShortcutSize(size: ShortcutSize): void {
  state.settings.shortcutSize = size;
  const cfg = SHORTCUT_SIZE_OPTIONS[size];
  const root = document.documentElement;
  root.style.setProperty('--shortcut-container', `${cfg.size}px`);
  root.style.setProperty('--shortcut-icon', `${cfg.icon}px`);
  root.style.setProperty('--shortcut-gap', `${cfg.gap}px`);
  root.style.setProperty('--shortcut-radius', `${cfg.radius}px`);
  root.style.setProperty('--shortcut-label-size', `${cfg.fontSize}px`);
  localStorageService.setRaw(LS_KEYS.SHORTCUT_SIZE, size);
}

/** 应用磁贴列数 */
function applyShortcutColumns(cols: ShortcutColumns): void {
  state.settings.shortcutColumns = cols;
  document.documentElement.style.setProperty('--shortcut-columns', String(cols === 'auto' ? 6 : Number(cols)));
  localStorageService.setRaw(LS_KEYS.SHORTCUT_COLUMNS, cols);
}

/** 初始化设置面板 */

/**
 * 渲染设置面板的「引擎顺序」可拖拽列表（与地址栏下拉共用顺序）
 * 列表内容在 initSettingsPanel 时创建一次，自增序号会随拖拽后的顺序刷新。
 */
function renderEngineOrderList(): void {
  const el = document.getElementById('engineOrderList');
  if (el === null) return;
  const list = el;

  function rebuild(): void {
    list.replaceChildren();
    for (const [index, eng] of getOrderedEngines().entries()) {
      const item = document.createElement('div');
      item.className = 's-engine-order-item';
      item.draggable = true;
      item.dataset.id = eng.id;
      item.innerHTML = `
        ${icon(eng.iconName ?? eng.id, 'dh-icon--md')}
        <span class="s-engine-order-name">${eng.name}</span>
        <span class="s-engine-order-num">${index + 1}</span>
        <svg class="dh-engine-grip" role="img" aria-hidden="true"><use href="#dh-icon-grip"></use></svg>`;
      list.appendChild(item);
    }
  }

  // 拖拽排序（指针几何定位，内部幂等绑定一次，支持插入到最底部）
  attachReorder({
    container: list,
    itemSelector: '.s-engine-order-item',
    getOrder: () => getOrderedEngines().map((x) => x.id),
    onCommit: saveEngineOrder,
    onRebuild: rebuild,
  });

  rebuild();
}

export function initSettingsPanel(): void {
  const overlay = document.getElementById('settingsOverlay');
  const gearBtn = document.getElementById('settingsGearBtn');
  const closeBtn = document.getElementById('settingsCloseBtn');

  gearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSettingsOpen()) closeSettings();
    else openSettings();
  });
  closeBtn?.addEventListener('click', closeSettings);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    // Ctrl+, 打开/关闭设置面板（VS Code / Chrome 约定快捷键）
    // 不在输入框中触发，避免与输入冲突
    const target = e.target as HTMLElement;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable;

    if (e.ctrlKey && e.key === ',' && !isTyping) {
      e.preventDefault();
      toggleSettings();
      return;
    }

    if (e.key === 'Escape' && isSettingsOpen()) {
      e.preventDefault();
      closeSettings();
      return;
    }

    // 设置面板打开时，启用焦点陷阱
    if (isSettingsOpen()) {
      trapFocus(e);
    }
  });

  // Tab 切换
  const nav = document.getElementById('sNav');
  nav?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('.s-nav-item');
    if (item === null) return;
    const tab = item.dataset.sTab;
    if (tab === undefined) return;
    nav.querySelectorAll('.s-nav-item').forEach((n) => n.classList.toggle('active', n === item));
    document.querySelectorAll('.s-tab').forEach((t) => t.classList.toggle('active', t.getAttribute('data-s-tab') === tab));
  });

  // 开关绑定
  for (const [toggleId, cfg] of Object.entries(TOGGLE_MAP)) {
    const el = getToggleInput(toggleId);
    el?.addEventListener('change', () => {
      localStorageService.setRaw(cfg.key, String(el.checked));
      // 搜索相关开关需立即同步到 searchFlags，否则需刷新才生效
      if (cfg.key === LS_KEYS.SEARCH_RETAIN || cfg.key === LS_KEYS.SEARCH_HIDE_BTN) {
        updateSearchFlags(cfg.key, el.checked);
      }
      info(MODULE, `设置变更`, { key: cfg.key, value: el.checked });
    });
  }

  // 分段控件：磁贴大小
  document.querySelectorAll<HTMLElement>('[data-shortcut-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = btn.dataset.shortcutSize;
      if (size !== undefined && isShortcutSize(size)) {
        applyShortcutSize(size);
        syncShortcutControls();
      }
    });
  });

  // 分段控件：每排数量
  document.querySelectorAll<HTMLElement>('[data-shortcut-columns]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cols = btn.dataset.shortcutColumns;
      if (cols !== undefined && isShortcutColumns(cols)) {
        applyShortcutColumns(cols);
        syncShortcutControls();
      }
    });
  });

  // 高级 Tab：全部数据重置按钮
  document.querySelectorAll('[data-setting-action="resetSettings"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void showConfirm('确定要重置所有数据到出厂状态吗？此操作不可撤销。', {
        title: '重置所有数据',
        iconType: 'warning',
        danger: true,
        confirmText: '重置',
      }).then((ok) => {
        if (ok) {
          void resetAllData();
        }
      });
    });
  });

  // 批量选择修饰键
  document.querySelectorAll<HTMLElement>('[data-batch-modifier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.batchModifier;
      if (key === undefined) return;
      state.settings.batchModifierKey = key;
      syncBatchModifierKey();
      localStorageService.setRaw(LS_KEYS.BATCH_MODIFIER_KEY, key);
      // 切换修饰键后清除当前选中状态
      clearSelection();
    });
  });

  // 引擎顺序拖拽列表（与地址栏下拉共用顺序）
  renderEngineOrderList();
}
