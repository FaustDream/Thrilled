/**
 * 导航与搜索引擎（对齐原版 js/search.js 引擎选择器）
 *
 * 引擎选择器：`#currentEngine`（引擎图标 + 名称 + chevron）点击 → body 级 `#engineDropdown`
 * 显示；`.engine-option[data-engine]` 点击 → 切换引擎并更新 UI。
 * 引擎顺序：独立持久化（LS_KEYS.ENGINE_ORDER，EngineId[]），地址栏下拉与设置面板共用；
 * 数字键 1-N 切换与命令面板均按该顺序取值。
 * 引擎图标：`#dhIconSprite` 中的 `dh-icon-<engine.icon>` symbol。
 */

import { info } from '../../lib/logger';
import { LS_KEYS } from '../../shared/constants';
import { ENGINES, getEngineById } from '../../shared/types';
import type { EngineId, SearchEngine } from '../../shared/types';
import { isEngineId } from '../../shared/guards';
import { state } from './state';
import { localStorageService } from './storage';
import { icon } from './icons';
import { showToast } from './dialogs';
import { attachReorder } from './reorder';

const MODULE = 'navigation';
/** 引擎顺序存储键名（校验后回写） */
const engineOrderKey = LS_KEYS.ENGINE_ORDER;

/** 读取持久化引擎（启动恢复） */
export function loadEngine(): EngineId {
  const raw = localStorageService.getRaw(LS_KEYS.ENGINE);
  if (raw !== null && isEngineId(raw)) {
    state.engine = raw;
    return raw;
  }
  return state.engine;
}

/* ================= 引擎顺序（共享状态） ================= */

/** 读取持久化引擎顺序（合法性过滤，缺失引擎回退注册表顺序；无效存储回退全部注册表） */
export function loadEngineOrder(): EngineId[] {
  const stored = localStorageService.get<unknown>(engineOrderKey, null);
  const valid: EngineId[] = [];
  if (Array.isArray(stored)) {
    for (const id of stored) {
      if (isEngineId(id)) valid.push(id);
    }
  }
  // 合并注册表中未出现在存储里的引擎（追加在末尾），保证全部引擎可见
  const seen = new Set<string>(valid);
  const merged = [...valid, ...ENGINES.map((e) => e.id).filter((id) => !seen.has(id))];
  return merged;
}

/** 按持久化顺序返回引擎列表（地址栏下拉、设置面板、数字键、命令面板统一调用） */
export function getOrderedEngines(): SearchEngine[] {
  const order = loadEngineOrder();
  const byId = new Map<EngineId, SearchEngine>(ENGINES.map((e) => [e.id, e]));
  return order.map((id) => byId.get(id)).filter((e): e is SearchEngine => e !== undefined);
}

/** 应用新引擎顺序并持久化（由拖拽 / 重置调用） */
export function saveEngineOrder(order: EngineId[]): void {
  const valid = order.filter(isEngineId);
  localStorageService.set(engineOrderKey, valid);
  info(MODULE, `引擎顺序更新`, { order: valid });
}

/* ================= 引擎选择器 UI ================= */

/** 渲染引擎下拉（从 ENGINES 依持久化顺序动态生成下拉项） */
export function initEngineUI(): void {
  const dropdown = document.getElementById('engineDropdown');
  if (dropdown !== null) {
    renderEngineDropdown(dropdown);
  }
  updateCurrentEngine();
}

/** 重建下拉列表（顺序变更后调用，保持拖拽可重绑定） */
function renderEngineDropdown(dropdown: HTMLElement): void {
  dropdown.replaceChildren();
  const activeId = state.engine;
  for (const eng of getOrderedEngines()) {
    const opt = document.createElement('div');
    opt.className = 'engine-option';
    opt.draggable = true;
    opt.dataset.engine = eng.id;
    opt.dataset.id = eng.id;
    opt.innerHTML = `${icon(eng.iconName ?? eng.id, 'dh-icon--md')}<span>${eng.name}</span>${'<svg class="dh-icon dh-icon--grip dh-icon--sm dh-engine-grip" role="img" aria-hidden="true"><use href="#dh-icon-grip"></use></svg>'}`;
    opt.classList.toggle('active', eng.id === activeId);
    opt.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.dh-engine-grip') !== null) return;
      if (isEngineId(eng.id)) {
        setEngine(eng.id);
        hideEngineDropdown();
      }
    });
    dropdown.appendChild(opt);
  }
  // 拖拽排序（指针几何定位，内部幂等绑定一次）
  attachReorder({
    container: dropdown,
    itemSelector: '.engine-option',
    getOrder: () => getOrderedEngines().map((x) => x.id),
    onCommit: saveEngineOrder,
    onRebuild: () => renderEngineDropdown(dropdown),
  });
}

/** 切换引擎：持久化 + 更新 UI + 反馈 */
export function setEngine(id: EngineId): void {
  if (!isEngineId(id)) return;
  const prevEngine = state.engine;
  state.engine = id;
  localStorageService.setRaw(LS_KEYS.ENGINE, id);
  updateCurrentEngine();
  info(MODULE, `引擎切换`, { id });
  // 仅在用户主动切换时提示（非首次加载恢复）
  if (prevEngine !== id) {
    const engine = getEngineById(id);
    if (engine !== null) {
      showToast(`已切换到 ${engine.name}`, 'info');
    }
  }
}

/** 更新引擎选择器按钮（图标 + 名称） */
function updateCurrentEngine(): void {
  const current = document.getElementById('currentEngine');
  const engine = getEngineById(state.engine);
  if (current === null || engine === null) return;
  const iconEl = current.querySelector('.engine-icon-placeholder');
  if (iconEl !== null) {
    iconEl.innerHTML = icon(engine.iconName ?? engine.id, 'dh-icon--md');
  }
  const nameEl = current.querySelector<HTMLElement>('span:nth-child(2)');
  if (nameEl !== null) {
    nameEl.textContent = engine.name;
  }
}

/** 引擎下拉是否可见 */
export function isEngineDropdownVisible(): boolean {
  const dropdown = document.getElementById('engineDropdown');
  return dropdown !== null && dropdown.classList.contains('visible');
}

/** 显示引擎下拉（定位到引擎选择器正下方，对齐原版） */
export function showEngineDropdown(): void {
  const dropdown = document.getElementById('engineDropdown');
  const selector = document.getElementById('engineSelector');
  if (dropdown === null || selector === null) return;
  const rect = selector.getBoundingClientRect();
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.top = `${rect.bottom + 6}px`;
  dropdown.classList.add('visible');
  selector.classList.add('active');
}

/** 隐藏引擎下拉 */
export function hideEngineDropdown(): void {
  const dropdown = document.getElementById('engineDropdown');
  const selector = document.getElementById('engineSelector');
  dropdown?.classList.remove('visible');
  selector?.classList.remove('active');
}

/** 绑定引擎选择器事件（点击切换下拉） */
export function bindEngineSelector(selectorEl: HTMLElement): void {
  selectorEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.engine-option') !== null) return;
    e.stopPropagation();
    if (isEngineDropdownVisible()) {
      hideEngineDropdown();
    } else {
      showEngineDropdown();
    }
  });
}

/** 数字键 1-N 快速切换引擎（global-events 调用，按持久化顺序） */
export function switchEngineByNumber(n: number): void {
  const engine = getOrderedEngines()[n - 1];
  if (engine !== undefined) {
    setEngine(engine.id);
  }
}