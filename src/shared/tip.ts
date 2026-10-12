/**
 * 图标提示气泡的定位（纯函数：与渲染解耦，便于单测）
 *
 * 坐标都在舞台（1920×945 设计像素）里。默认浮在锚点（被悬停元素）上方并水平居中；
 * 上方放不下而下方放得下时翻到下方；两端与上下都做钳制，保证气泡完整可见。
 */
export interface TipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 气泡与锚点之间的间距（设计像素） */
export const TIP_GAP = 8;

/** 舞台边缘留白 */
const EDGE = 4;

export const tipBoxOf = (
  anchor: TipRect,
  size: { w: number; h: number },
  view: { w: number; h: number },
  gap = TIP_GAP,
): { x: number; y: number; flip: boolean } => {
  const above = anchor.y - size.h - gap;
  const below = anchor.y + anchor.h + gap;
  /* 只有「上方贴边」且「下方确实放得下」才翻转，避免底部元素为了翻转反而溢出 */
  const flip = above < EDGE && below + size.h <= view.h - EDGE;
  const y = Math.max(EDGE, Math.min(flip ? below : above, view.h - size.h - EDGE));
  const x = Math.max(EDGE, Math.min(anchor.x + anchor.w / 2 - size.w / 2, view.w - size.w - EDGE));
  return { x, y, flip };
};
