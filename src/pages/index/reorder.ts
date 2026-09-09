/**
 * 通用「拖拽排序」实现（地址栏引擎下拉与设置面板引擎顺序共用）
 *
 * 采用指针几何定位：
 * - dragover：仅计算鼠标相对各子项中线的插入位置并高亮，不做重建，避免拖拽手势被打断；
 * - drop / dragend：一次性提交新顺序并持久化、重建。
 *
 * 解决了旧实现的缺陷：当指针落在最后一项下方/容器底边时，closest 无命中导致
 * 无法插入到最底部。本实现默认「最后一项之后」即插入到列表末尾。
 */

import type { EngineId } from '../../shared/types';

export interface AttachReorderOptions {
  /** 容器元素（监听 drag 系列事件） */
  container: HTMLElement;
  /** 可拖拽子项选择器，要求子项带 data-id = EngineId */
  itemSelector: string;
  /** 读取当前顺序（拖拽前静态快照，避免重建导致指针漂移） */
  getOrder: () => EngineId[];
  /** 提交新顺序（持久化） */
  onCommit: (order: EngineId[]) => void;
  /** 提交后重建列表（保持视觉同步） */
  onRebuild: () => void;
}

/** 绑定拖拽排序（内部幂等，重复调用不重复绑定） */
export function attachReorder(opts: AttachReorderOptions): void {
  const { container, itemSelector, getOrder, onCommit, onRebuild } = opts;
  if (container.dataset.reorderBound === '1') return;
  container.dataset.reorderBound = '1';

  /** 当前被拖拽的引擎 id */
  let dragId: EngineId | null = null;
  /** 拖拽中实时计算的插入位置（相对重排前静态列表的下标） */
  let insertIndex = -1;

  const items = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(itemSelector));

  const clearIndicators = (): void => {
    container
      .querySelectorAll('.reorder-indicator, .reorder-indicator--after')
      .forEach((el) => el.classList.remove('reorder-indicator', 'reorder-indicator--after'));
  };

  /** 高亮插入指示：index < length 插到该子项前，index == length 追加到末尾 */
  const showIndicator = (index: number): void => {
    clearIndicators();
    const list = items();
    if (list.length === 0) return;
    const target = list[Math.min(index, list.length - 1)];
    if (target === undefined) return;
    if (index >= list.length) {
      target.classList.add('reorder-indicator', 'reorder-indicator--after');
    } else {
      target.classList.add('reorder-indicator');
    }
  };

  const commit = (): void => {
    if (dragId === null || insertIndex < 0) return;
    const from = getOrder().indexOf(dragId);
    if (from < 0) return;
    const order = getOrder();
    const next = order.filter((id) => id !== dragId);
    // 去掉被拖项后的命名空间内插入位置：若目标在被拖项之后，需回退一格
    let target = insertIndex;
    if (from < insertIndex) target -= 1;
    target = Math.max(0, Math.min(target, next.length));
    next.splice(target, 0, dragId);
    onCommit(next);
  };

  const reset = (): void => {
    dragId = null;
    insertIndex = -1;
    clearIndicators();
    onRebuild();
  };

  container.addEventListener('dragstart', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(itemSelector);
    if (el === null || el.dataset.id === undefined) {
      e.preventDefault();
      return;
    }
    // HTML5 拖拽要求设置 dataTransfer
    e.dataTransfer?.setData('text/plain', el.dataset.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    dragId = el.dataset.id as EngineId;
    el.classList.add('dragging');
  });

  container.addEventListener('dragover', (e) => {
    if (dragId === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const list = items();
    const y = e.clientY;
    let index = list.length; // 默认末尾 = 指针低于最后一项中线
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el === undefined) continue;
      const rect = el.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    insertIndex = index;
    showIndicator(index);
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    commit();
    reset();
  });

  container.addEventListener('dragend', () => {
    commit();
    reset();
  });
}