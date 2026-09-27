/**
 * 网格常量与算法（冻结于 docs/v4/02-UI规格.md §12.1）
 *
 * 纯函数无依赖 → app（布局渲染 / 拖拽）与 core（导入校验 / 迁移落位）共用。
 */

/** 单元格边长（px） */
export const CELL = 60;
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
