/**
 * 命令面板（Ctrl+K）
 *
 * 功能：
 * - 模糊搜索磁贴（直接打开）
 * - 常用命令（打开设置、切换编辑模式、同步数据、切换引擎等）
 * - ↑/↓ 导航、Enter 执行、Esc 关闭
 * - 焦点管理：打开时聚焦输入框，关闭后恢复焦点
 */

import { debug } from '../../lib/logger';
import { getOrderedEngines } from './navigation';
import { state } from './state';
import { toggleEditMode } from './tiles';
import { openSettings } from './settings-panel';
import { icon } from './icons';
import { setEngine } from './navigation';
import { openUrl } from './link-opener';
import { manualSync } from './file-config';
import { exportAllData } from './export';

const MODULE = 'cmd-palette';

/** 命令项类型 */
interface CommandItem {
  type: 'command';
  id: string;
  label: string;
  description?: string;
  icon: string;
  keywords?: string[];
  action: () => void;
}

/** 磁贴项类型 */
interface TileItem {
  type: 'tile';
  id: string;
  label: string;
  url: string;
  icon: string;
  action: () => void;
}

type PaletteItem = CommandItem | TileItem;

/** 面板状态 */
const paletteState = {
  visible: false,
  items: [] as PaletteItem[],
  selectedIndex: 0,
  lastFocused: null as HTMLElement | null,
  query: '',
};

let panelEl: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;

/** 内置命令列表 */
function getCommands(): CommandItem[] {
  const commands: CommandItem[] = [
    {
      type: 'command',
      id: 'cmd-settings',
      label: '打开设置',
      description: '打开设置面板',
      icon: 'settings',
      keywords: ['settings', 'preferences', '配置', '选项'],
      action: () => openSettings(),
    },
    {
      type: 'command',
      id: 'cmd-edit-mode',
      label: state.tileEditMode ? '退出编辑模式' : '进入编辑模式',
      description: '切换磁贴编辑模式',
      icon: 'edit',
      keywords: ['edit', '编辑', '管理'],
      action: () => toggleEditMode(),
    },
    {
      type: 'command',
      id: 'cmd-sync',
      label: '同步数据',
      description: '手动同步数据到文件',
      icon: 'refresh',
      keywords: ['sync', 'save', '同步', '保存'],
      action: () => void manualSync(),
    },
    {
      type: 'command',
      id: 'cmd-export',
      label: '导出数据',
      description: '导出所有数据为 JSON 文件',
      icon: 'download',
      keywords: ['export', 'backup', '导出', '备份'],
      action: () => void exportAllData(),
    },
  ];

  // 搜索引擎切换命令（按持久化顺序展示，与地址栏下拉/数字键一致）
  for (const eng of getOrderedEngines()) {
    commands.push({
      type: 'command',
      id: `cmd-engine-${eng.id}`,
      label: `切换到 ${eng.name}`,
      description: `将默认搜索引擎切换为 ${eng.name}`,
      icon: 'search',
      keywords: ['engine', 'search', '引擎', '搜索', eng.name],
      action: () => {
        setEngine(eng.id);
      },
    });
  }

  return commands;
}

/** 收集所有磁贴作为可选项 */
function getTileItems(): TileItem[] {
  const items: TileItem[] = [];
  for (const page of state.pagesData) {
    for (const tile of page.tiles) {
      items.push({
        type: 'tile',
        id: `tile-${tile.id}`,
        label: tile.label,
        url: tile.url,
        icon: 'link',
        action: () => {
          void openUrl(tile.url, { type: 'tiles' });
        },
      });
    }
  }
  return items;
}

/** 简单模糊匹配 */
function fuzzyMatch(text: string, query: string): boolean {
  if (query === '') return true;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerText.includes(lowerQuery)) return true;
  // 简单的首字母/子序列匹配
  let qi = 0;
  for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[qi]) qi++;
  }
  return qi === lowerQuery.length;
}

/** 过滤并排序匹配项 */
function filterItems(query: string): PaletteItem[] {
  const commands = getCommands();
  const tiles = getTileItems();
  const all: PaletteItem[] = [...commands, ...tiles];

  if (query === '') return all;

  return all.filter((item) => {
    const searchText = item.type === 'command'
      ? `${item.label} ${item.description ?? ''} ${(item.keywords ?? []).join(' ')}`
      : `${item.label} ${item.url}`;
    return fuzzyMatch(searchText, query);
  });
}

/** 创建面板 DOM */
function createPanel(): void {
  if (panelEl !== null) return;

  panelEl = document.createElement('div');
  panelEl.className = 'cmd-palette-overlay';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-modal', 'true');
  panelEl.setAttribute('aria-label', '命令面板');
  panelEl.innerHTML = `
    <div class="cmd-palette" role="combobox" aria-expanded="true" aria-haspopup="listbox">
      <div class="cmd-palette-search">
        <span class="cmd-palette-search-icon" aria-hidden="true">${icon('search', 'dh-icon--md')}</span>
        <input type="text" class="cmd-palette-input" placeholder="输入命令或搜索磁贴..." autocomplete="off" role="textbox" aria-label="搜索命令">
      </div>
      <div class="cmd-palette-list" role="listbox" aria-label="命令列表"></div>
      <div class="cmd-palette-footer">
        <span><kbd>↑↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 执行</span>
        <span><kbd>Esc</kbd> 关闭</span>
      </div>
    </div>
  `;

  document.body.appendChild(panelEl);

  inputEl = panelEl.querySelector('.cmd-palette-input') as HTMLInputElement;
  listEl = panelEl.querySelector('.cmd-palette-list') as HTMLElement;

  // 点击遮罩关闭
  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl) closePalette();
  });

  // 输入搜索
  inputEl.addEventListener('input', () => {
    paletteState.query = inputEl?.value ?? '';
    paletteState.selectedIndex = 0;
    renderList();
  });

  // 键盘导航
  inputEl.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        navigate(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigate(-1);
        break;
      case 'Enter':
        e.preventDefault();
        executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        closePalette();
        break;
    }
  });
}

/** 导航 */
function navigate(direction: -1 | 1): void {
  const len = paletteState.items.length;
  if (len === 0) return;
  let next = paletteState.selectedIndex + direction;
  if (next < 0) next = len - 1;
  if (next >= len) next = 0;
  paletteState.selectedIndex = next;
  renderList();
  // 滚动到可见区域
  const selected = listEl?.querySelector('.cmd-palette-item.selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

/** 执行选中项 */
function executeSelected(): void {
  const item = paletteState.items[paletteState.selectedIndex];
  if (item === undefined) return;
  debug(MODULE, '执行命令', { id: item.id, label: item.label });
  closePalette();
  item.action();
}

/** 渲染列表 */
function renderList(): void {
  if (listEl === null) return;
  listEl.replaceChildren();

  if (paletteState.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cmd-palette-empty';
    empty.textContent = '没有匹配的结果';
    listEl.appendChild(empty);
    return;
  }

  paletteState.items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = `cmd-palette-item${i === paletteState.selectedIndex ? ' selected' : ''}`;
    el.id = `cmd-item-${i}`;
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(i === paletteState.selectedIndex));

    const iconEl = document.createElement('span');
    iconEl.className = 'cmd-palette-item-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = icon(item.icon, 'dh-icon--sm');

    const contentEl = document.createElement('div');
    contentEl.className = 'cmd-palette-item-content';

    const labelEl = document.createElement('span');
    labelEl.className = 'cmd-palette-item-label';
    labelEl.textContent = item.label;
    contentEl.appendChild(labelEl);

    if (item.type === 'tile') {
      const urlEl = document.createElement('span');
      urlEl.className = 'cmd-palette-item-desc';
      urlEl.textContent = item.url;
      contentEl.appendChild(urlEl);
    } else if (item.description) {
      const descEl = document.createElement('span');
      descEl.className = 'cmd-palette-item-desc';
      descEl.textContent = item.description;
      contentEl.appendChild(descEl);
    }

    el.appendChild(iconEl);
    el.appendChild(contentEl);

    el.addEventListener('click', () => {
      paletteState.selectedIndex = i;
      executeSelected();
    });

    el.addEventListener('mouseenter', () => {
      paletteState.selectedIndex = i;
      // 更新选中样式
      listEl?.querySelectorAll('.cmd-palette-item.selected').forEach((el) => el.classList.remove('selected'));
      el.classList.add('selected');
    });

    listEl?.appendChild(el);
  });

  // 更新 aria-activedescendant
  if (inputEl !== null && paletteState.items.length > 0) {
    inputEl.setAttribute('aria-activedescendant', `cmd-item-${paletteState.selectedIndex}`);
  }
}

/** 打开命令面板 */
export function openPalette(): void {
  createPanel();
  if (panelEl === null || inputEl === null) return;
  if (paletteState.visible) return;

  paletteState.visible = true;
  paletteState.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  paletteState.query = '';
  paletteState.selectedIndex = 0;

  // 收集所有项
  paletteState.items = filterItems('');

  panelEl.classList.add('visible');
  inputEl.value = '';
  renderList();

  // 延迟聚焦，确保面板已显示
  requestAnimationFrame(() => {
    inputEl?.focus();
  });
}

/** 关闭命令面板 */
export function closePalette(): void {
  if (!paletteState.visible || panelEl === null) return;
  paletteState.visible = false;
  panelEl.classList.remove('visible');
  // 恢复焦点
  if (paletteState.lastFocused !== null) {
    paletteState.lastFocused.focus();
    paletteState.lastFocused = null;
  }
}

/** 切换命令面板 */
export function togglePalette(): void {
  if (paletteState.visible) {
    closePalette();
  } else {
    openPalette();
  }
}

/** 判断面板是否打开 */
export function isPaletteOpen(): boolean {
  return paletteState.visible;
}

/** 初始化命令面板快捷键 */
export function initCommandPalette(): void {
  createPanel();

  // Ctrl+K 打开
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;

    // Ctrl+K 或 Cmd+K 打开（不在命令面板自己的输入框中时触发）
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      // 如果在命令面板输入框中，不拦截（让输入正常工作）
      if (target === inputEl) return;
      e.preventDefault();
      togglePalette();
      return;
    }
  });

  debug(MODULE, '命令面板已初始化');
}
