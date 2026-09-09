/**
 * 磁贴管理（对齐原版 js/tiles.js）
 *
 * 渲染 DOM 结构对齐原版：
 * `<a class="tile" data-tile-id data-index style="--tile-color">`
 *   `.tile-icon-wrap > img.tile-img`（favicon，失败回退字母）
 *   `.tile-label` / `.tile-delete-btn`（svg x）
 * 拖拽：长按 600ms 启动 → mousemove 跟随 → 目标位高亮 → mouseup 完成重排；触屏等价。
 */

import { LS_KEYS, TILE_LONG_PRESS_MS } from '../../shared/constants';
import { isTileId } from '../../shared/guards';
import type { Tile, TilePage } from '../../shared/types';
import { localStorageService } from './storage';
import { dom, state } from './state';
import { pageManager } from './page-manager';
import { loadFavicon } from './favicon';
import { openUrl } from './link-opener';
import { icon, ICONS } from './icons';
import { showPrompt, showConfirm, showToast, createModal } from './dialogs';
import type { PromptFieldValues } from './dialogs';
import { showPopover } from './popover';
import { renderCatRow } from './category-ui';

/* ================= 批量选择辅助 ================= */

/** 检查修饰键是否按下 */
function isModifierHeld(e: MouseEvent): boolean {
  const key = state.settings.batchModifierKey;
  if (key === 'ctrl') return e.ctrlKey && !e.shiftKey && !e.altKey;
  if (key === 'alt') return e.altKey && !e.ctrlKey && !e.shiftKey;
  if (key === 'ctrlShift') return e.ctrlKey && e.shiftKey && !e.altKey;
  // fallback：默认 Ctrl+Shift
  return e.ctrlKey && e.shiftKey && !e.altKey;
}

/** HTML 转义，防分类名注入 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/** 规范化磁贴 position 与数组下标一致 */
function normalizePositions(tiles: Tile[]): Tile[] {
  return tiles.map((t, i) => ({ ...t, position: i }));
}

/** 核心移动：把指定磁贴从 fromPage 移动到 toPage，返回新的 pagesData（无变化返回原引用） */
function moveTilesBetweenPages(
  pagesData: readonly TilePage[],
  tileIds: readonly string[],
  fromPageIndex: number,
  toPageIndex: number,
): TilePage[] {
  if (fromPageIndex === toPageIndex) return pagesData as TilePage[];
  const next = pagesData.slice();
  const fromPage = next[fromPageIndex];
  const toPage = next[toPageIndex];
  if (fromPage === undefined || toPage === undefined) return pagesData as TilePage[];

  const idSet = new Set(tileIds);
  const moved = fromPage.tiles.filter((t) => idSet.has(t.id));
  if (moved.length === 0) return pagesData as TilePage[];

  next[fromPageIndex] = { ...fromPage, tiles: normalizePositions(fromPage.tiles.filter((t) => !idSet.has(t.id))) };
  next[toPageIndex] = { ...toPage, tiles: normalizePositions(toPage.tiles.concat(moved)) };
  return next;
}

/** 清除所有选中状态 */
export function clearSelection(): void {
  state.batchSelectMode = false;
  state.selectedTileIds.clear();
  document.querySelectorAll('.tile.tile-selected').forEach((el) => el.classList.remove('tile-selected'));
  hideBatchBar();
}

/** 更新磁贴选中样式 */
function syncTileSelectedState(): void {
  document.querySelectorAll<HTMLElement>('.tile').forEach((el) => {
    const id = el.dataset.tileId;
    el.classList.toggle('tile-selected', id !== undefined && state.selectedTileIds.has(id));
  });
}

/* ================= 批量操作栏 ================= */

let _batchBar: HTMLElement | null = null;

function getBatchBar(): HTMLElement {
  if (_batchBar === null || !document.body.contains(_batchBar)) {
    _batchBar = document.createElement('div');
    _batchBar.className = 'batch-action-bar';
    _batchBar.setAttribute('role', 'toolbar');
    _batchBar.setAttribute('aria-label', '批量操作');
    _batchBar.style.display = 'none';
    document.body.appendChild(_batchBar);
  }
  return _batchBar;
}

function showBatchBar(): void {
  const bar = getBatchBar();
  const count = state.selectedTileIds.size;
  const disabledAttr = count === 0 ? ' disabled aria-disabled="true"' : '';
  bar.innerHTML = `
    <span class="batch-action-count">已选择 ${count} 个</span>
    <button class="batch-action-btn batch-action-move" type="button" title="移动到分类（Ctrl+Shift+M）"${disabledAttr}>
      <svg class="dh-icon dh-icon--move-folder dh-icon--sm" role="img"><use href="#dh-icon-move-folder"></use></svg>移动到分类
    </button>
    <button class="batch-action-btn batch-action-delete" type="button"${disabledAttr}>删除选中</button>
    <button class="batch-action-btn batch-action-cancel" type="button">取消选择</button>
  `;
  bar.style.display = 'flex';

  // 批量模式下可连续点选磁贴；移动/删除仅在已有选中项时可用
  bar.querySelector('.batch-action-move')?.addEventListener('click', () => {
    if (state.selectedTileIds.size === 0) return;
    void promptSelectCategory([...state.selectedTileIds] as Tile['id'][], 'move');
  });
  bar.querySelector('.batch-action-delete')?.addEventListener('click', () => {
    if (state.selectedTileIds.size === 0) return;
    void confirmBatchDelete();
  });
  bar.querySelector('.batch-action-cancel')?.addEventListener('click', () => {
    clearSelection();
  });
}

function hideBatchBar(): void {
  const bar = getBatchBar();
  bar.style.display = 'none';
  bar.replaceChildren();
}

/** 确认批量删除 */
async function confirmBatchDelete(): Promise<void> {
  const ids = [...state.selectedTileIds];
  if (ids.length === 0) return;
  const ok = await showConfirm(`确定要删除选中的 ${ids.length} 个快捷方式吗？`, { title: '批量删除', danger: true });
  if (!ok) return;

  const idSet = new Set(ids);
  const deleted = state.currentTiles.filter((t) => idSet.has(t.id));
  const nextPages = state.pagesData.slice();
  const page = nextPages[state.currentPage];
  if (page !== undefined) {
    nextPages[state.currentPage] = { ...page, tiles: normalizePositions(page.tiles.filter((t) => !idSet.has(t.id))) };
  }
  state.pagesData = nextPages;
  await pageManager.save(nextPages);
  tileManager.updateCurrentTiles();
  state.undoAction = { type: 'delete', tiles: deleted, pageIndex: state.currentPage };

  clearSelection();
  renderTiles();
  showUndoToast('delete', String(deleted.length));
}

/* ================= 键盘辅助：全选 / 批量移动 ================= */

/** 全选当前分类的全部磁贴（进入批量选择模式，供批量移动/删除） */
export function selectAllInCurrentPage(): void {
  if (state.currentTiles.length === 0) return;
  state.batchSelectMode = true;
  state.selectedTileIds.clear();
  for (const t of state.currentTiles) state.selectedTileIds.add(t.id as Tile['id']);
  showBatchBar();
  syncTileSelectedState();
  showToast(`已全选 ${state.selectedTileIds.size} 个快捷方式`, 'info');
}

/** 批量移动：将当前选中的磁贴移动到目标分类（无选中时给出提示） */
export function batchMoveSelected(): void {
  const ids = [...state.selectedTileIds];
  if (ids.length === 0) {
    showToast('请先选中要移动的快捷方式（Ctrl+Shift+A 全选，或 Ctrl+Shift+点击多选）', 'warning');
    return;
  }
  void promptSelectCategory(ids as Tile['id'][], 'move');
}

/* ================= 移动/复制分类选择弹窗 ================= */

/** 分类选择弹窗模式 */
type CategorySelectMode = 'move' | 'copy';

/** 弹出分类选择弹窗，确认后将磁贴移动/复制到目标分类（含「新建分类」入口） */
async function promptSelectCategory(tileIds: Tile['id'][], mode: CategorySelectMode): Promise<void> {
  if (tileIds.length === 0) return;
  const count = tileIds.length;
  const isCopy = mode === 'copy';

  const otherPages = state.pageNames
    .map((name, idx) => ({ name, idx }))
    .filter(({ idx }) => idx !== state.currentPage);

  const listHTML = otherPages
    .map(
      (t) => `
      <button type="button" class="move-target-item" data-page-index="${t.idx}">
        <span class="move-target-icon">${icon('folder', 'dh-icon--md')}</span>
        <span class="move-target-name">${escapeHtml(t.name)}</span>
        <span class="move-target-arrow">${icon('chevron-right', 'dh-icon--sm')}</span>
      </button>`,
    )
    .join('');

  const emptyHint =
    otherPages.length === 0
      ? '<p class="move-target-empty">当前没有其他分类，可点击下方「新建分类」创建目标分类。</p>'
      : '';

  const verb = isCopy ? '复制' : '移动';
  const hintText = isCopy
    ? '选择目标分类，磁贴副本将追加到目标分类。'
    : '选择目标分类，磁贴将从当前分类移除。';

  const destroy = createModal(
    `${verb} ${count} 个快捷方式到`,
    `<p class="move-target-hint">${hintText}</p>
     ${emptyHint}
     <div class="move-target-list">${listHTML}</div>
     <button type="button" class="move-target-new">${icon('plus', 'dh-icon--sm')}<span>新建分类</span></button>`,
    '',
  );

  // 绑定已有分类选项
  const itemEls = Array.from(document.querySelectorAll<HTMLElement>('.move-target-item'));
  itemEls.forEach((el) => {
    const idx = Number(el.dataset.pageIndex);
    el.addEventListener('click', () => {
      destroy();
      if (isCopy) {
        void tileManager.copyTilesToPage(tileIds, idx);
      } else {
        void tileManager.moveTilesToPage(tileIds, idx);
      }
    });
  });

  // 键盘导航：↑/↓ 在分类间移动焦点，Enter/Space 由按钮原生触发确认
  if (itemEls.length > 0) {
    const list = document.querySelector<HTMLElement>('.move-target-list');
    let activeIndex = 0;
    itemEls[activeIndex]?.focus();
    list?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (e.key === 'ArrowDown') activeIndex = (activeIndex + 1) % itemEls.length;
      else activeIndex = (activeIndex - 1 + itemEls.length) % itemEls.length;
      itemEls[activeIndex]?.focus();
    });
  }

  // 绑定「新建分类」：仅移动模式支持（复制到新分类无意义）
  document.querySelector<HTMLElement>('.move-target-new')?.addEventListener('click', () => {
    destroy();
    if (isCopy) return;
    void (async () => {
      const name = await showPrompt('新建分类', {
        title: '新建分类',
        placeholder: '分类名称',
        confirmText: '创建并移动',
      });
      if (name === null) return;
      const trimmed = (name as string).trim();
      if (trimmed === '') return;
      await tileManager.moveTilesToNewPage(tileIds, trimmed);
    })();
  });
}

/* ================= 撤销机制 ================= */

/** 获取 Toast 挂载点（懒创建） */
function getToastHost(): HTMLElement {
  let host = document.getElementById('dhDialogHost');
  if (host === null) {
    host = document.createElement('div');
    host.id = 'dhDialogHost';
    host.style.cssText = 'position:fixed;inset:0;z-index:3200;pointer-events:none;';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    document.body.appendChild(host);
  }
  return host;
}

/** 撤销最近一次删除、移动或删除分类操作 */
function undoLastAction(): void {
  const action = state.undoAction;
  if (action === null) return;
  state.undoAction = null;

  if (action.type === 'delete') {
    const nextPages = state.pagesData.slice();
    const page = nextPages[action.pageIndex];
    if (page !== undefined) {
      nextPages[action.pageIndex] = { ...page, tiles: normalizePositions(page.tiles.concat(action.tiles)) };
      state.pagesData = nextPages;
      void pageManager.save(nextPages);
    }
    tileManager.updateCurrentTiles();
    renderTiles();
    renderCatRow();
    clearSelection();
    showToast('已恢复快捷方式', 'success');
    return;
  }

  if (action.type === 'deletePage') {
    const nextPages = state.pagesData.slice();
    // 从首页移除之前合并过来的磁贴
    const firstPage = nextPages[0];
    if (firstPage !== undefined) {
      const idSet = new Set(action.movedTileIds);
      nextPages[0] = { ...firstPage, tiles: normalizePositions(firstPage.tiles.filter((t) => !idSet.has(t.id))) };
    }
    // 在原位置插回被删除的分类
    nextPages.splice(action.pageIndex, 0, action.page);
    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    state.totalPages = nextPages.length;
    if (state.currentPage >= nextPages.length) {
      state.currentPage = nextPages.length - 1;
    }
    void pageManager.save(nextPages);
    tileManager.updateCurrentTiles();
    renderTiles();
    renderCatRow();
    clearSelection();
    showToast(`已恢复分类「${action.page.name}」`, 'success');
    return;
  }

  // 撤销移动：把磁贴从目标分类移回源分类
  const nextPages = moveTilesBetweenPages(
    state.pagesData,
    action.tiles.map((t) => t.id),
    action.toPageIndex,
    action.fromPageIndex,
  );
  if (nextPages === state.pagesData) return;
  state.pagesData = nextPages;
  void pageManager.save(nextPages);
  tileManager.updateCurrentTiles();
  renderTiles();
  renderCatRow();
  clearSelection();
  showToast('已撤销移动', 'success');
}

/** 显示带撤销按钮的 Toast */
function showUndoToast(kind: 'delete' | 'move' | 'deletePage', label?: string): void {
  const host = getToastHost();
  host.querySelectorAll('.ui-toast').forEach((t) => t.remove());

  let text: string;
  if (kind === 'delete') text = `已删除 ${label ?? '1'} 个快捷方式`;
  else if (kind === 'move') text = `已移动 ${label ?? '1'} 个快捷方式`;
  else text = `已删除分类「${label ?? ''}」`;

  const toast = document.createElement('div');
  toast.className = 'ui-toast ui-toast--warning';
  toast.style.pointerEvents = 'auto';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="ui-toast-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
    <span>${text}</span>
    <button class="ui-toast-undo-btn" type="button">撤销</button>
  `;
  host.appendChild(toast);

  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    toast.classList.add('ui-toast--out');
    setTimeout(() => toast.remove(), 200);
  }, 5000);

  toast.querySelector('.ui-toast-undo-btn')?.addEventListener('click', () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    toast.remove();
    undoLastAction();
  });
}

/* ================= 数据操作 ================= */

export const tileManager = {
  /** 从 pageManager 加载页数据，更新 currentTiles */
  async load(): Promise<void> {
    await pageManager.load();
    this.updateCurrentTiles();
  },

  /** 用当前页数据刷新 currentTiles，并按 position 排序 */
  updateCurrentTiles(): void {
    const page = pageManager.getCurrentPageData();
    state.currentTiles = page === null ? [] : page.tiles.slice().sort((a, b) => a.position - b.position);
  },

  /** 保存：写回 position 与数组下标一致 → updateCurrentPage → save */
  async save(): Promise<void> {
    const tiles = state.currentTiles.slice().map((t, i) => ({ ...t, position: i }));
    const nextPages = pageManager.updateCurrentPage(state.pagesData, tiles);
    await pageManager.save(nextPages);
    this.updateCurrentTiles();
  },

  /** 新增磁贴 */
  add(tile: Tile): Tile[] {
    const tiles = state.currentTiles.slice();
    tiles.push({ ...tile, position: tiles.length });
    state.currentTiles = tiles;
    void this.save();
    renderTiles();
    return tiles;
  },

  /** 删除磁贴（按 id） */
  remove(tileId: Tile['id']): void {
    if (!isTileId(tileId)) return;
    state.currentTiles = state.currentTiles.filter((t) => t.id !== tileId);
    void this.save();
    renderTiles();
  },

  /** 更新磁贴属性（按 id） */
  update(tileId: Tile['id'], updates: Partial<Omit<Tile, 'id'>>): void {
    state.currentTiles = state.currentTiles.map((t) => (t.id === tileId ? { ...t, ...updates } : t));
    void this.save();
    renderTiles();
  },

  /** 拖拽重排 */
  reorder(fromIndex: number, toIndex: number): void {
    const tiles = state.currentTiles.slice();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= tiles.length || toIndex >= tiles.length) {
      return;
    }
    const [moved] = tiles.splice(fromIndex, 1);
    if (moved === undefined) return;
    tiles.splice(toIndex, 0, moved);
    state.currentTiles = tiles;
    void this.save();
    renderTiles();
  },

  /** 切页（支持分类记忆写 last_page） */
  async changePage(pageIndex: number): Promise<void> {
    if (pageIndex < 0 || pageIndex >= state.totalPages || pageIndex === state.currentPage) return;
    state.currentPage = pageIndex;
    if (state.settings.categoryMemory) {
      localStorageService.set(LS_KEYS.LAST_PAGE, pageIndex);
    }
    this.updateCurrentTiles();
    renderTiles();
  },

  /** 新增空白页 */
  async addNewPage(name?: string): Promise<void> {
    const nextPages = pageManager.addPage(state.pagesData, name);
    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    state.totalPages = nextPages.length;
    state.currentPage = nextPages.length - 1;
    await pageManager.save(nextPages);
    this.updateCurrentTiles();
  },

  /** 删除当前页 */
  async removeCurrentPage(): Promise<void> {
    const nextPages = pageManager.removePageWithStrategy(state.pagesData, state.currentPage);
    if (nextPages.length === state.pagesData.length) return; // 至少保留一页
    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    state.totalPages = nextPages.length;
    await pageManager.save(nextPages);
    this.updateCurrentTiles();
  },

  /** 重命名当前页 */
  async renameCurrentPage(newName: string): Promise<void> {
    const nextPages = pageManager.renamePage(state.pagesData, state.currentPage, newName);
    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    await pageManager.save(nextPages);
  },

  /** 重命名指定索引的页面 */
  async renamePageAt(idx: number, newName: string): Promise<void> {
    const nextPages = pageManager.renamePage(state.pagesData, idx, newName);
    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    await pageManager.save(nextPages);
  },

  /** 删除指定页（支持撤销，磁贴会先移入首页，撤销时移回） */
  async removePageAt(pageIndex: number): Promise<void> {
    const page = state.pagesData[pageIndex];
    if (page === undefined) return;
    const movedTileIds = page.tiles.map((t) => t.id);
    const nextPages = pageManager.removePageWithStrategy(state.pagesData, pageIndex);
    if (nextPages.length === state.pagesData.length) return;
    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    state.totalPages = nextPages.length;
    await pageManager.save(nextPages);
    this.updateCurrentTiles();
    renderTiles();
    renderCatRow();

    // 记录撤销动作
    state.undoAction = { type: 'deletePage', page: { ...page, tiles: [...page.tiles] }, pageIndex, movedTileIds };
    showUndoToast('deletePage', page.name);
  },

  /** 页面重排 */
  async reorderPage(fromIndex: number, toIndex: number): Promise<void> {
    const nextPages = pageManager.reorderPage(state.pagesData, fromIndex, toIndex);
    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    await pageManager.save(nextPages);
    this.updateCurrentTiles();
  },

  /** 批量移动磁贴到目标分类（记录撤销动作，自动重排两分类 position） */
  async moveTilesToPage(tileIds: Tile['id'][], targetPageIndex: number): Promise<void> {
    if (targetPageIndex === state.currentPage) return;
    if (tileIds.length === 0) return;

    const idSet = new Set(tileIds as string[]);
    const moved = state.currentTiles.filter((t) => idSet.has(t.id));
    if (moved.length === 0) return;

    const fromPageIndex = state.currentPage;
    const nextPages = moveTilesBetweenPages(state.pagesData, [...idSet], fromPageIndex, targetPageIndex);
    if (nextPages === state.pagesData) return;
    state.pagesData = nextPages;
    await pageManager.save(nextPages);
    this.updateCurrentTiles();

    state.undoAction = {
      type: 'move',
      tiles: moved,
      fromPageIndex,
      toPageIndex: targetPageIndex,
    };

    clearSelection();
    renderTiles();
    renderCatRow();
    showUndoToast('move', String(moved.length));
  },

  /** 移动磁贴到新建分类（创建分类 + 移动 + 记录撤销，不切换当前页） */
  async moveTilesToNewPage(tileIds: Tile['id'][], newName: string): Promise<void> {
    const safeName = newName.trim();
    if (safeName === '' || tileIds.length === 0) return;

    const fromPageIndex = state.currentPage;
    const idSet = new Set(tileIds as string[]);
    const moved = state.currentTiles.filter((t) => idSet.has(t.id));
    if (moved.length === 0) return;

    const nextPages = state.pagesData.slice();
    const fromPage = nextPages[fromPageIndex];
    if (fromPage === undefined) return;
    nextPages[fromPageIndex] = { ...fromPage, tiles: normalizePositions(fromPage.tiles.filter((t) => !idSet.has(t.id))) };
    nextPages.push({ name: safeName, tiles: normalizePositions(moved) });

    state.pagesData = nextPages;
    state.pageNames = nextPages.map((p) => p.name);
    state.totalPages = nextPages.length;
    await pageManager.save(nextPages);
    this.updateCurrentTiles();

    state.undoAction = { type: 'move', tiles: moved, fromPageIndex, toPageIndex: nextPages.length - 1 };

    clearSelection();
    renderTiles();
    renderCatRow();
    showUndoToast('move', String(moved.length));
  },

  /** 复制磁贴到目标分类（源分类保留，副本追加到目标分类） */
  async copyTilesToPage(tileIds: Tile['id'][], targetPageIndex: number): Promise<void> {
    if (targetPageIndex === state.currentPage) return;
    if (tileIds.length === 0) return;

    const idSet = new Set(tileIds as string[]);
    const copies = state.currentTiles.filter((t) => idSet.has(t.id));
    if (copies.length === 0) return;

    const nextPages = state.pagesData.slice();
    const target = nextPages[targetPageIndex];
    if (target === undefined) return;
    const cloned = copies.map((t) => ({
      ...t,
      id: `tile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` as Tile['id'],
    }));
    nextPages[targetPageIndex] = { ...target, tiles: normalizePositions(target.tiles.concat(cloned)) };
    state.pagesData = nextPages;
    await pageManager.save(nextPages);
    this.updateCurrentTiles();
    showToast(`已复制 ${copies.length} 个快捷方式`, 'success');
  },
};

/* ================= 添加磁贴弹窗 ================= */

/** 弹出添加磁贴表单（label + url），确认后写入当前分类 */
async function promptAddTile(): Promise<void> {
  const values = await showPrompt('添加新磁贴', {
    title: '添加新磁贴',
    fields: [
      { name: 'label', label: '磁贴名称', placeholder: '例如：GitHub' },
      { name: 'url', label: '网址', placeholder: 'https://...', defaultValue: 'https://' },
    ],
    confirmText: '添加',
  });
  if (values === null) return;
  const v = values as PromptFieldValues;
  const url = (v.url ?? '').trim();
  if (url === '' || url === 'https://') return;
  const label = (v.label ?? '').trim() || url;
  tileManager.add({
    id: `tile_${Date.now()}` as Tile['id'],
    label,
    url,
    type: 'favicon',
    icon: '',
    color: '#4a9eff',
    position: state.currentTiles.length,
    imageData: '',
  });
}

/** 确认后删除磁贴（支持撤销） */
async function confirmDeleteTile(tile: Tile): Promise<void> {
  const ok = await showConfirm(`确定要删除「${tile.label}」吗？`, { title: '删除磁贴', danger: true });
  if (!ok) return;

  const page = state.pagesData[state.currentPage];
  if (page === undefined) return;
  const nextPages = state.pagesData.slice();
  nextPages[state.currentPage] = { ...page, tiles: normalizePositions(page.tiles.filter((t) => t.id !== tile.id)) };
  state.pagesData = nextPages;
  await pageManager.save(nextPages);
  tileManager.updateCurrentTiles();
  state.undoAction = { type: 'delete', tiles: [tile], pageIndex: state.currentPage };

  renderTiles();
  showUndoToast('delete');
}

/** 编辑磁贴（弹出 Prompt 修改名称+URL） */
async function editTile(tile: Tile): Promise<void> {
  const values = await showPrompt('编辑磁贴', {
    title: '编辑磁贴',
    fields: [
      { name: 'label', label: '磁贴名称', defaultValue: tile.label },
      { name: 'url', label: '网址', defaultValue: tile.url },
    ],
    confirmText: '保存',
  });
  if (values === null) return;
  const v = values as PromptFieldValues;
  const label = (v.label ?? '').trim();
  const url = (v.url ?? '').trim();
  if (url === '') return;
  tileManager.update(tile.id, { label: label || tile.label, url });
}

/** 更换磁贴图标：读取本地图片 → dataURL → 更新为 custom 类型 */
async function promptChangeIcon(tile: Tile): Promise<void> {
  const input = document.getElementById('tileImageInput') as HTMLInputElement | null;
  if (input === null) return;

  // 一次性读取文件
  const file = await new Promise<File | null>((resolve) => {
    const onChange = (): void => {
      input.removeEventListener('change', onChange);
      resolve(input.files?.[0] ?? null);
    };
    input.addEventListener('change', onChange);
    input.click();
  });
  if (file === null) return;

  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
  if (dataUrl === null) return;

  tileManager.update(tile.id, { type: 'custom', imageData: dataUrl });
  showToast('图标已更新', 'success');
}

/* ================= 渲染 ================= */

/**
 * 渲染磁贴网格（对齐原版 DOM）
 * tilesContainer 通过 `tile-edit-mode` 类控制删除按钮显示
 * 空状态：显示 `#hiddenMessage` 引导（提示如何添加快捷方式 + 添加快捷方式按钮）
 */
export function renderTiles(container: HTMLElement | null = dom.get('#tilesContainer')): void {
  if (container === null) return;
  const fragment = document.createDocumentFragment();
  for (const tile of state.currentTiles) {
    fragment.appendChild(buildTileElement(tile));
  }

  // 磁贴网格末尾的 + 按钮（快速添加磁贴到当前分类）
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-tile-btn';
  addBtn.title = '添加新磁贴';
  addBtn.setAttribute('aria-label', '添加新磁贴到当前分类');
  addBtn.innerHTML = icon('plus', 'dh-icon--md');
  addBtn.addEventListener('click', () => {
    void promptAddTile();
  });
  fragment.appendChild(addBtn);

  container.replaceChildren(fragment);
  container.classList.toggle('tile-edit-mode', state.tileEditMode);

  // 恢复选中状态
  syncTileSelectedState();
  if (state.selectedTileIds.size > 0) showBatchBar();

  // 空状态引导：让用户知道如何添加
  const hidden = document.getElementById('hiddenMessage');
  if (hidden !== null) {
    if (state.currentTiles.length === 0) {
      hidden.style.display = '';
      hidden.replaceChildren();
      const hint = document.createElement('div');
      hint.className = 'hidden-message-hint';
      hint.textContent = '此分类暂无快捷方式';
      const sub = document.createElement('div');
      sub.className = 'hidden-message-sub';
      sub.textContent = '点击下方按钮，或右键空白处「新添磁贴」';
      const addBtn = document.createElement('button');
      addBtn.className = 'hidden-message-add';
      addBtn.textContent = '+ 添加快捷方式';
      addBtn.setAttribute('aria-label', '添加快捷方式');
      addBtn.addEventListener('click', () => void promptAddTile());
      hidden.appendChild(hint);
      hidden.appendChild(sub);
      hidden.appendChild(addBtn);
    } else {
      hidden.style.display = 'none';
    }
  }
}

/** 构建单个磁贴 DOM（对齐原版） */
export function buildTileElement(tile: Tile): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = tile.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = tile.label;
  a.setAttribute('aria-label', `${tile.label}，在新标签页打开`);
  a.dataset.tileId = tile.id;
  a.draggable = false;
  a.style.setProperty('--tile-color', tile.color || '#4a9eff');

  // 图标区
  const iconWrap = document.createElement('div');
  iconWrap.className = 'tile-icon-wrap';
  const img = document.createElement('img');
  img.className = 'tile-img';
  img.width = 56;
  img.height = 56;
  img.decoding = 'async';
  iconWrap.appendChild(img);
  // favicon 加载（失败时 img 移除、iconWrap 显示纯色背景）
  if (tile.imageData) {
    img.src = tile.imageData;
  } else {
    void loadFavicon(tile.url, img, iconWrap, tile.label, tile.color);
  }

  // 标签
  const label = document.createElement('span');
  label.className = 'tile-label';
  label.textContent = tile.label;

  // 删除按钮（tile-edit-mode 下可见，单击立即删除）
  const deleteBtn = document.createElement('span');
  deleteBtn.className = 'tile-delete-btn';
  deleteBtn.setAttribute('role', 'button');
  deleteBtn.tabIndex = 0;
  deleteBtn.dataset.tileDelete = tile.id;
  deleteBtn.setAttribute('aria-label', `删除 ${tile.label}`);
  deleteBtn.innerHTML = icon(ICONS.X, 'dh-icon--sm');
  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void confirmDeleteTile(tile);
  });
  deleteBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      void confirmDeleteTile(tile);
    }
  });

  a.appendChild(iconWrap);
  a.appendChild(label);
  a.appendChild(deleteBtn);

  // 右键弹出菜单（编辑 / 更换图标 / 移动到分类 / 复制到分类 / 删除）
  a.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPopover(a, [
      {
        label: '编辑',
        icon: icon('edit'),
        action: () => void editTile(tile),
      },
      {
        label: '更换图标',
        icon: icon('image'),
        action: () => void promptChangeIcon(tile),
      },
      {
        label: '移动到分类',
        icon: icon('move-folder'),
        action: () => void promptSelectCategory([tile.id], 'move'),
      },
      {
        label: '复制到分类',
        icon: icon('copy'),
        action: () => void promptSelectCategory([tile.id], 'copy'),
      },
      {
        label: '删除',
        icon: icon('trash'),
        danger: true,
        action: () => void confirmDeleteTile(tile),
      },
    ], { x: e.clientX, y: e.clientY });
  });

  a.addEventListener('click', (e) => {
    if (state.dragMoved || state.preventNextTileClick || state.tileEditMode) {
      e.preventDefault();
      state.dragMoved = false;
      state.preventNextTileClick = false;
      return;
    }

    // 修饰键首次进入批量模式；进入后普通点击磁贴即可选择 / 取消选择
    if (isModifierHeld(e) || state.batchSelectMode) {
      e.preventDefault();
      state.batchSelectMode = true;
      if (state.selectedTileIds.has(tile.id)) {
        state.selectedTileIds.delete(tile.id);
      } else {
        state.selectedTileIds.add(tile.id);
      }
      syncTileSelectedState();
      showBatchBar();
      return;
    }

    e.preventDefault();
    void openUrl(tile.url, { type: 'tiles' });
  });
  return a;
}

/* ================= 删除模式 ================= */

/** 是否处于删除模式 */
export function isTileDeleteModeActive(): boolean {
  return state.tileEditMode;
}

/** 切换删除模式并重渲染 */
export function setTileDeleteMode(active: boolean): void {
  state.tileEditMode = active;
  const container = dom.get('#tilesContainer');
  container?.classList.toggle('tile-edit-mode', active);
}

/**
 * 切换编辑模式（磁贴 + 分类联动）
 * 进入后磁贴/分类右上角删除按钮可见，再次触发退出。
 */
export function toggleEditMode(): void {
  state.tileEditMode = !state.tileEditMode;
  state.categoryEditMode = state.tileEditMode;
  renderTiles();
  renderCatRow();
}

/* ================= 拖拽系统（对齐原版：长按 + 跟随 + 目标位高亮 + 触屏） ================= */

interface DragPointer {
  tile: HTMLElement | null;
  index: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  /** 拖拽启动时磁贴的原始尺寸（fixed 定位时保持，避免反复读取缩放后的 rect 导致坍缩） */
  width: number;
  height: number;
  /** 指针按下点相对磁贴左上角的偏移（保持拖动相对位置稳定） */
  offsetX: number;
  offsetY: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  moved: boolean;
  ready: boolean;
  active: boolean;
}

const pointer: DragPointer = {
  tile: null,
  index: -1,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  width: 0,
  height: 0,
  offsetX: 0,
  offsetY: 0,
  longPressTimer: null,
  moved: false,
  ready: false,
  active: false,
};

/** 拖拽悬停的目标分类索引（-1 表示未悬停在分类按钮上） */
let catDropTarget = -1;

function isTouch(e: Event): boolean {
  return 'touches' in e;
}

function getClientPos(e: Event): { x: number; y: number } {
  if (isTouch(e)) {
    const touch = (e as TouchEvent).touches[0];
    return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
  }
  const me = e as MouseEvent;
  return { x: me.clientX, y: me.clientY };
}

/** 绑定拖拽事件（事件委托到容器，一次绑定 R5） */
export function attachTileDrag(container: HTMLElement): void {
  container.addEventListener('mousedown', onPointerDown);
  container.addEventListener('touchstart', onPointerDown, { passive: false });
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup', onPointerUp);
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp);
}

function onPointerDown(e: Event): void {
  const target = (e.target as HTMLElement).closest<HTMLElement>('.tile');
  if (target === null) return;
  if ((e.target as HTMLElement).closest('.tile-delete-btn') !== null) return;
  if (e instanceof MouseEvent && e.button !== 0) return;
  if (isTouch(e)) e.preventDefault();

  const id = target.dataset.tileId;
  if (id === undefined || !isTileId(id)) return;
  const index = state.currentTiles.findIndex((t) => t.id === id);
  if (index < 0) return;

  const pos = getClientPos(e);
  const rect = target.getBoundingClientRect();
  pointer.tile = target;
  pointer.index = index;
  pointer.startX = pos.x;
  pointer.startY = pos.y;
  pointer.currentX = pos.x;
  pointer.currentY = pos.y;
  // 记录原始尺寸与指针相对磁贴左上角的偏移，拖动时保持不变，杜绝缩放坍缩
  pointer.width = rect.width;
  pointer.height = rect.height;
  pointer.offsetX = pos.x - rect.left;
  pointer.offsetY = pos.y - rect.top;
  pointer.moved = false;
  pointer.ready = false;
  pointer.active = true;

  pointer.longPressTimer = setTimeout(() => {
    pointer.ready = true;
    pointer.tile?.classList.add('long-pressing');
  }, TILE_LONG_PRESS_MS);
}

function onPointerMove(e: Event): void {
  if (!pointer.active || pointer.tile === null) return;
  const pos = getClientPos(e);
  pointer.currentX = pos.x;
  pointer.currentY = pos.y;
  if (pointer.ready) {
    pointer.moved = true;
    if (isTouch(e)) e.preventDefault();
    positionDragTile();
    highlightDropTarget();
    highlightCategoryDropTarget();
  }
}

function onPointerUp(): void {
  if (pointer.longPressTimer !== null) {
    clearTimeout(pointer.longPressTimer);
    pointer.longPressTimer = null;
  }
  if (!pointer.active) return;
  const tile = pointer.tile;
  if (pointer.ready && pointer.moved && tile !== null) {
    // 优先：拖到分类按钮 → 跨分类移动
    if (catDropTarget >= 0 && catDropTarget !== state.currentPage) {
      const id = tile.dataset.tileId;
      if (id !== undefined && isTileId(id)) {
        // 若当前磁贴在选中集合中，则移动整个选中集合
        const ids = state.selectedTileIds.has(id) ? [...state.selectedTileIds] : [id];
        void tileManager.moveTilesToPage(ids as Tile['id'][], catDropTarget);
      }
      state.preventNextTileClick = true;
    } else {
      // 原有：同分类内重排
      const target = document.querySelector<HTMLElement>('.tile.drag-over');
      const toId = target?.dataset.tileId;
      if (toId !== undefined) {
        const toIndex = state.currentTiles.findIndex((t) => t.id === toId);
        if (toIndex >= 0 && toIndex !== pointer.index) {
          tileManager.reorder(pointer.index, toIndex);
        }
      }
      state.preventNextTileClick = true;
    }
  }
  resetDragState();
}

function resetDragState(): void {
  document.querySelectorAll('.tile.long-pressing, .tile.dragging, .tile.drag-over').forEach((el) => {
    el.classList.remove('long-pressing', 'dragging', 'drag-over');
    (el as HTMLElement).style.position = '';
    (el as HTMLElement).style.left = '';
    (el as HTMLElement).style.top = '';
    (el as HTMLElement).style.width = '';
    (el as HTMLElement).style.height = '';
    (el as HTMLElement).style.zIndex = '';
  });
  clearCategoryDropTarget();
  pointer.tile = null;
  pointer.index = -1;
  pointer.width = 0;
  pointer.height = 0;
  pointer.offsetX = 0;
  pointer.offsetY = 0;
  pointer.moved = false;
  pointer.ready = false;
  pointer.active = false;
}

/** 检测鼠标坐标下命中的分类按钮 */
function findCatBtnAt(x: number, y: number): HTMLElement | null {
  const btns = document.querySelectorAll<HTMLElement>('.cat-btn[data-page]');
  for (const btn of Array.from(btns)) {
    const r = btn.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return btn;
    }
  }
  return null;
}

/** 高亮拖拽悬停的分类按钮 */
function highlightCategoryDropTarget(): void {
  clearCategoryDropTarget();
  const btn = findCatBtnAt(pointer.currentX, pointer.currentY);
  if (btn !== null) {
    btn.classList.add('tile-drop-over');
    catDropTarget = Number(btn.dataset.page ?? '-1');
  }
}

/** 清除分类按钮拖拽高亮 */
function clearCategoryDropTarget(): void {
  document.querySelectorAll('.cat-btn.tile-drop-over').forEach((el) => el.classList.remove('tile-drop-over'));
  catDropTarget = -1;
}

/** 拖拽跟随定位（使用指针按下时记录的原始尺寸，不反复读取 rect 避免缩放坍缩） */
function positionDragTile(): void {
  const tile = pointer.tile;
  if (tile === null) return;
  // 启动拖拽时移除长按脉冲动画，避免 transform 与 fixed 定位冲突
  tile.classList.remove('long-pressing');
  tile.classList.add('dragging');
  tile.style.position = 'fixed';
  tile.style.width = `${pointer.width}px`;
  tile.style.height = `${pointer.height}px`;
  tile.style.left = `${pointer.currentX - pointer.offsetX}px`;
  tile.style.top = `${pointer.currentY - pointer.offsetY}px`;
  tile.style.zIndex = '9999';
}

/** 目标位高亮 */
function highlightDropTarget(): void {
  document.querySelectorAll('.tile.drag-over').forEach((el) => el.classList.remove('drag-over'));
  const tiles = document.querySelectorAll<HTMLElement>('.tile:not(.dragging)');
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const t of Array.from(tiles)) {
    const r = t.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = (pointer.currentX - cx) ** 2 + (pointer.currentY - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  if (best !== null && best.dataset.tileId !== pointer.tile?.dataset.tileId) {
    best.classList.add('drag-over');
  }
}

