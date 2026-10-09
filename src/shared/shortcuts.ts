/**
 * 可自定义快捷键（v4.4）
 *
 * 约定：
 * - 组合键统一存成规范字符串：修饰键按 `Ctrl` → `Alt` → `Shift` 排序，键名取 `KeyboardEvent.key` 归一化
 *   （字母大写、空格写 `Space`、方向键保留 `ArrowXxx`）；空串表示「未设置」。macOS 的 Cmd 归一到 `Ctrl`。
 * - 生效范围：单按键只在非输入状态下触发；含修饰键的组合键在任意位置都触发；`typing` 标记的动作
 *   （关闭浮层这类）在输入状态下也生效。
 */

/** 快捷键动作定义 */
export interface ShortcutDef {
  id: string;
  /** 设置里显示的动作名 */
  label: string;
  /** 出厂组合键（空串 = 未设置） */
  def: string;
  /** 输入状态下也生效 */
  typing?: boolean;
}

/** 动作清单：数组顺序即设置里的显示顺序 */
export const SHORTCUT_DEFS: readonly ShortcutDef[] = [
  { id: 'focus-search', label: '聚焦搜索框', def: '/' },
  { id: 'page-prev', label: '上一页', def: 'ArrowLeft' },
  { id: 'page-next', label: '下一页', def: 'ArrowRight' },
  { id: 'mode-toggle', label: '切换极简 / 标准模式', def: 'Alt+M' },
  { id: 'open-add', label: '打开「添加」面板', def: 'Alt+A' },
  { id: 'open-personal', label: '打开「个性化」面板', def: 'Alt+P' },
  { id: 'open-setting', label: '打开「设置」面板', def: 'Alt+S' },
  { id: 'roll-quote', label: '换一条鼓励语', def: 'Alt+Q' },
  { id: 'export-layout', label: '导出布局 JSON', def: 'Ctrl+Shift+E' },
  { id: 'reset-all', label: '一键重置（需确认）', def: 'Ctrl+Shift+R' },
  { id: 'close-overlay', label: '关闭浮层 / 菜单 / 弹窗', def: 'Escape', typing: true },
];

/** 出厂绑定表（id → 组合键） */
export const DEFAULT_SHORTCUTS: Readonly<Record<string, string>> = Object.fromEntries(
  SHORTCUT_DEFS.map((d) => [d.id, d.def]),
);

/** 只按修饰键时不给组合键 */
const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];

/** 键名归一化：单字符统一大写、空格写 Space */
const normKey = (k: string): string => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);

/** 归一化后的组合键是否需要「非输入状态」前提（单按键） */
export const isBareCombo = (combo: string): boolean => combo !== '' && !combo.includes('+');

/** 键盘事件 → 规范组合键；只按了修饰键返回 null */
export const comboOf = (e: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null => {
  if (MODIFIER_KEYS.includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(normKey(e.key));
  return parts.join('+');
};

/** 展示用语替换（符号 / 缩写比原名好读） */
const DISPLAY: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: '空格',
};

/** 组合键 → 设置里显示的键帽文案 */
export const formatCombo = (combo: string): string =>
  combo.split('+').map((k) => DISPLAY[k] ?? k).join(' + ');

/** 设置归一化：只保留已知动作，缺省回退出厂值；空串是用户主动清除，保留 */
export const normalizeShortcuts = (v: unknown): Record<string, string> => {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const d of SHORTCUT_DEFS) {
    const raw = o[d.id];
    out[d.id] = typeof raw === 'string' ? raw : d.def;
  }
  return out;
};
