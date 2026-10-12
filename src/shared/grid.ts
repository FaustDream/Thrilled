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

/**
 * 找离目标格最近的空位：先试目标格本身（钳制到合法范围），被占则遍历全部合法落点取平方距离最小者。
 * 用于空白处右键「新建」——在哪儿右键就长在哪儿，放不下才就近。
 */
export const findSlotNear = (
  page: readonly { c: number; r: number; w: number; h: number }[],
  w: number,
  h: number,
  target: { c: number; r: number },
): { c: number; r: number } | null => {
  const tc = Math.max(0, Math.min(COLS - w, target.c));
  const tr = Math.max(0, Math.min(ROWS - h, target.r));
  let best: { c: number; r: number } | null = null;
  let bestD = Infinity;
  for (let r = 0; r + h <= ROWS; r++) {
    for (let c = 0; c + w <= COLS; c++) {
      const hit = page.some((it) => it.c < c + w && c < it.c + it.w && it.r < r + h && r < it.r + it.h);
      if (hit) continue;
      const d = (c - tc) * (c - tc) + (r - tr) * (r - tr);
      if (d === 0) return { c, r };
      if (d < bestD) {
        bestD = d;
        best = { c, r };
      }
    }
  }
  return best;
};

/* ---------- 网格原点与「网格 + 组件」统一吸附 ---------- */

/** 卡片网格在舞台 / 页面内的原点（px）：宽 1776 居中于 1920 → 72，顶部 97（与 .grid 的 CSS 保持一致） */
export const GRID_LEFT = (PAGE_W - COLS * CELL) / 2;
export const GRID_TOP = 97;
/** 组件对齐吸附阈值（设计像素）：自由位置与对齐格偏差不超过它就改用对齐格（约 0.3 格） */
export const SNAP_ALIGN_PX = 22;

/** 对齐参考盒：拖拽时只关心同页其它卡片的位置与尺寸 */
export interface AlignBox {
  id: string;
  c: number;
  r: number;
  w: number;
  h: number;
}

/** 单轴的落格结果 */
export interface AxisSnap {
  /** 最终格坐标 */
  index: number;
  /** 命中组件对齐时的参考线位置（设计像素，相对网格原点）；null = 只用网格基准 */
  guide: { pos: number; ids: string[] } | null;
}

/**
 * 单轴选格：以「最近网格格」为基准，若同页其它卡片存在偏差不超过阈值的对齐候选
 * （起点边 / 终点边 / 居中），则改用偏差最小的那个对齐格——这就是「网格给基准、组件对齐在近处微调」。
 *
 * free 是自由位置（格单位，可含小数）；size 是本卡该轴的格数；max 是该轴格数上限（COLS / ROWS）；
 * thresholdPx ≤ 0 表示不做组件对齐（只用网格基准）。宽高都是偶数，三类候选都落在整数格上，不会出现半格。
 */
export const snapAxis = (
  free: number,
  size: number,
  max: number,
  others: readonly AlignBox[],
  axis: 'x' | 'y',
  thresholdPx: number,
): AxisSnap => {
  const clamp = (v: number): number => Math.max(0, Math.min(max - size, v));
  const base = clamp(Math.round(free));
  if (thresholdPx <= 0) return { index: base, guide: null };
  const threshold = thresholdPx / CELL;
  let index = base;
  let guidePos: number | null = null;
  let best = Infinity;
  let ids: string[] = [];
  for (const o of others) {
    const start = axis === 'x' ? o.c : o.r;
    const span = axis === 'x' ? o.w : o.h;
    /* 三类参考点：起点边对齐 / 终点边对齐 / 居中（第二个值是参考线在设计像素里的位置） */
    const cands: readonly [number, number][] = [
      [start, start * CELL + INSET],
      [start + span - size, (start + span) * CELL - INSET],
      [start + (span - size) / 2, (start + span / 2) * CELL],
    ];
    for (const [cand, pos] of cands) {
      if (cand !== clamp(cand)) continue;
      const dev = Math.abs(cand - free);
      if (dev > threshold) continue;
      if (dev < best - 1e-9) {
        best = dev;
        index = cand;
        guidePos = pos;
        ids = [o.id];
      } else if (guidePos !== null && Math.abs(dev - best) < 1e-9 && !ids.includes(o.id)) {
        /* 同一张卡的起点 / 终点候选可能给出同一个格，去重后再收集 */
        ids.push(o.id);
      }
    }
  }
  return { index, guide: guidePos === null ? null : { pos: guidePos, ids } };
};

/**
 * 另一轴上是否邻近（重叠，或间隙不超过 1 格）：某轴做对齐时只参考「另一轴邻近」的卡片，
 * 否则整页同列 / 同行的卡片都会被算作对齐目标，参考线与高亮会糊成一片。
 */
export const nearOnAxis = (a0: number, a1: number, b0: number, b1: number): boolean =>
  a0 <= b1 + 1 && b0 <= a1 + 1;

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

