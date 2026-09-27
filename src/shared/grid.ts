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
/** 网格顶边（CSS .grid top 对应值：搜索行 44+50=94 底下 8px 起排） */
export const GRID_TOP = 77;
/** 搜索行底边（search-row top:44 + h:50，与 CSS 对应） */
export const SEARCH_ROW_BOTTOM = 94;

/** 卡片尺寸档位（单位数，仅六档） */
export const SIZES: readonly { w: number; h: number }[] = [
  { w: 2, h: 2 }, { w: 2, h: 4 }, { w: 4, h: 2 }, { w: 4, h: 4 }, { w: 8, h: 4 }, { w: 8, h: 2 },
];

/** 网格单位尺寸是否合法（仅六档） */
export const isLegalSize = (w: number, h: number): boolean => SIZES.some((s) => s.w === w && s.h === h);

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

/** 名称标签定位：顶边 = (row + h) × 60 − 24，宽 = w × 60 */
export const labelBox = (it: { c: number; r: number; w: number; h: number }): string =>
  `left:${it.c * CELL}px;top:${(it.r + it.h) * CELL - 24}px;width:${it.w * CELL}px`;

/* ===== 页面内容垂直居中（消除稀疏页的非对称留白） ===== */

/** Dock 顶边（stage 高 945 − dock 高 122） */
export const DOCK_TOP = STAGE_H - 122;
/** 名称标签高（视觉底边比单元格底边高出 4px） */
const LABEL_VISUAL_OVERHANG = 4;

/**
 * 计算某页内容的垂直位移（px）：把内容实际占用的行带在
 * 「搜索行底 ↔ Dock 顶」之间垂直居中，满页时位移趋近 0。
 */
export const verticalOffset = (items: readonly { r: number; h: number }[]): number => {
  if (items.length === 0) return 0;
  const minR = Math.min(...items.map((it) => it.r));
  const maxR = Math.max(...items.map((it) => it.r + it.h));
  const bandCenter = (SEARCH_ROW_BOTTOM + DOCK_TOP) / 2;
  const contentCenterLocal = ((minR + maxR) * CELL + INSET - LABEL_VISUAL_OVERHANG) / 2;
  return Math.round(bandCenter - GRID_TOP - contentCenterLocal);
};
