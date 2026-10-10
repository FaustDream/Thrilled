/**
 * 网格常量与算法（冻结于 docs/v4/02-UI规格.md §12.1）
 *
 * 纯函数无依赖 → app（布局渲染 / 拖拽）与 core（导入校验 / 迁移落位）共用。
 */

/** 单元格边长（px）：放大以填满搜索行与 Dock 之间的可用带（72px 头部区 + 740px 网格 ≈ 无首尾留白） */
export const CELL = 74;
/** 卡片四边内缩（px） */
export const INSET = 25;
/** 网格列数 */
export const COLS = 24;
/** 网格行数 */
export const ROWS = 10;
/** 每页宽度（= 设计稿宽 1920） */
export const PAGE_W = 1920;
/** 设计稿舞台尺寸 */
export const STAGE_W = 1920;
export const STAGE_H = 945;
/** 每种模式最多页数（04 §5.1：应用最多添加 5 页） */
export const MAX_PAGES = 5;

/** 卡片尺寸档位（单位数，仅六档） */
export const SIZES: readonly { w: number; h: number }[] = [
  { w: 2, h: 2 }, { w: 2, h: 4 }, { w: 4, h: 2 }, { w: 4, h: 4 }, { w: 8, h: 4 }, { w: 8, h: 2 },
];

/** 网格单位尺寸是否合法（仅六档） */
export const isLegalSize = (w: number, h: number): boolean => SIZES.some((s) => s.w === w && s.h === h);

/**
 * 组件库的尺寸三档：小 / 宽 / 大（映射到六档规范里的 2×2 / 4×2 / 4×4）。
 * 用户口语的「1×1 / 2×1 / 2×2」即这三档；六档校验与既有卡片尺寸不受影响。
 */
export const LIBRARY_SIZES: readonly { k: string; w: number; h: number }[] = [
  { k: '小', w: 2, h: 2 },
  { k: '宽', w: 4, h: 2 },
  { k: '大', w: 4, h: 4 },
];

/** 两张卡片是否重叠 */
export const overlaps = (
  a: { c: number; r: number; w: number; h: number },
  b: { c: number; r: number; w: number; h: number },
): boolean => a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;

/** 找页内第一块能放下的空位（自上而下、自左而右） */
export const findSlot = (
  page: readonly { c: number; r: number; w: number; h: number }[],
  w: number,
  h: number,
): { c: number; r: number } | null => {
  for (let r = 0; r + h <= ROWS; r++) {
    for (let c = 0; c + w <= COLS; c++) {
      const hit = page.some((it) => it.c < c + w && c < it.c + it.w && it.r < r + h && r < it.r + it.h)
      if (!hit) return { c, r }
    }
  }
  return null
};

/** 卡片绝对定位（px）：单元格块内四边内缩 */
export const itemBox = (it: { c: number; r: number; w: number; h: number }): string =>
  `left:${it.c * CELL + INSET}px;top:${it.r * CELL + INSET}px;width:${it.w * CELL - 2 * INSET}px;height:${it.h * CELL - 2 * INSET}px`;

/** 图标格容器的格子边长上限（px）：避免少格数把图标撑成巨块 */
const GROUP_TILE_MAX = 64;

/** 图标格容器的卡内内距与格子间距（px；随 --u 缩放，自然尺寸下即这些值） */
export const GROUP_PAD = 15;
export const GROUP_GAP = 10;

/**
 * 图标格容器的可用框（按候选尺寸算，含卡片内缩与容器内距；名称标签已移除，不再有条带）。
 * 与渲染侧同一算法，尺寸能力判定与渲染不会各算一套。
 */
export const groupBoxOf = (w: number, h: number): { w: number; h: number } => ({
  w: w * CELL - 2 * INSET - GROUP_PAD * 2,
  h: h * CELL - 2 * INSET - GROUP_PAD * 2,
});

/**
 * 图标格容器（group）自适应行列：在给定可用框内为 n 个格子挑「边长最大」的行列组合，
 * 行列数乘积 ≥ n（末行可不满），用于把图标铺满卡片而不是挤成一串小字形。
 */
export const groupGrid = (
  n: number,
  availW: number,
  availH: number,
  gap: number,
): { cols: number; rows: number; cell: number } => {
  const count = Math.max(1, Math.floor(n));
  let cols = 1;
  let rows = count;
  let cell = 0;
  for (let c = 1; c <= count; c++) {
    const r = Math.ceil(count / c);
    const size = Math.min((availW - (c - 1) * gap) / c, (availH - (r - 1) * gap) / r);
    if (size > cell) {
      cell = size;
      cols = c;
      rows = r;
    }
  }
  return { cols, rows, cell: Math.max(16, Math.min(Math.floor(cell), GROUP_TILE_MAX)) };
};

/**
 * 图标格容器是否装不下：格子边长有 16px 下限（太少格数撑成巨块 / 太小看不清），
 * 格子多而卡片小时网格会超出可用框——此时容器改为可滚动，而不是把格子继续压小。
 */
export const groupOverflows = (n: number, availW: number, availH: number, gap: number): boolean => {
  const { cols, rows, cell } = groupGrid(n, availW, availH, gap);
  return cols * cell + (cols - 1) * gap > availW + 0.001 || rows * cell + (rows - 1) * gap > availH + 0.001;
};

/**
 * 给定卡片尺寸下，图标格容器能否「不滚动」装下全部应用。
 * 用于尺寸能力：应用多时不再允许选太小的档位（否则只能滚动条浏览）。
 */
export const groupFits = (n: number, w: number, h: number): boolean => {
  const box = groupBoxOf(w, h);
  return !groupOverflows(n, box.w, box.h, GROUP_GAP);
};

