/**
 * 壁纸明暗取景（v4.4 补丁 38）
 *
 * 「自动对比」要知道**每张卡片背后那块壁纸**有多亮。做法：把壁纸降采样成灰度矩阵
 * （直接复用 core/wallpaper-focus 的 sampleLuma——它本来就是给裁剪焦点算法做的降采样），
 * 再按 CSS `cover` + `object-position` 的同一条公式算出**可见区域**，把卡片的舞台坐标
 * 线性映射进去取样。
 *
 * 为什么不是「上中下三带」：实测一张「蓝天 + 白鸽 + 深色裙摆」的壁纸里，同一条带内
 * 既有 L≈0.92 的白鸽也有 L≈0.10 的裙摆——按带取平均对这两处都是错的。逐卡局部取样的
 * 代价只是每张卡几十次数组读取，而且只在壁纸 / 布局 / 缩放变化时重建。
 */
import { sampleLuma } from './wallpaper-focus';
import type { LumaSample } from './wallpaper-focus';

/** 可见区域灰度图（矩阵坐标 + 整块的统计量） */
export interface ToneGrid extends LumaSample {
  /** 可见区域在矩阵里的矩形（wx/wh 为宽高，单位是矩阵格） */
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  /** 整块可见区域的平均 / 最小 / 最大亮度 */
  avg: number;
  min: number;
  max: number;
}

/** 一处局部取样的结果 */
export interface Tone {
  avg: number;
  min: number;
  max: number;
}

/** 舞台里一个矩形（设计像素，相对 #stage 左上角） */
export interface StageBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 可见窗口：与 `object-fit:cover` + `object-position:X% Y%` 同一条公式。
 * 图比屏宽 → 裁左右（窗口沿 X 滑动）；图比屏高 → 裁上下。返回矩阵坐标。
 */
export const visibleWindow = (
  gw: number, gh: number, screenRatio: number, fx: number, fy: number,
): { wx: number; wy: number; ww: number; wh: number } => {
  if (!(gw > 0 && gh > 0 && screenRatio > 0)) return { wx: 0, wy: 0, ww: gw, wh: gh };
  const imgRatio = gw / gh;
  let ww = gw;
  let wh = gh;
  if (imgRatio > screenRatio) ww = Math.min(gw, Math.round(gh * screenRatio));
  else wh = Math.min(gh, Math.round(gw / screenRatio));
  const kx = Math.min(100, Math.max(0, fx)) / 100;
  const ky = Math.min(100, Math.max(0, fy)) / 100;
  return { wx: Math.round((gw - ww) * kx), wy: Math.round((gh - wh) * ky), ww, wh };
};

/** 舞台设计坐标的矩形 → 可见区域内的 UV（舞台左上角即视口左上角，整体按 scale 缩放） */
export const boxUv = (
  box: StageBox, scale: number, vpW: number, vpH: number,
): { u0: number; v0: number; u1: number; v1: number } => {
  const u = (v: number, span: number) => Math.min(1, Math.max(0, v / Math.max(1, span)));
  return {
    u0: u(box.x * scale, vpW),
    v0: u(box.y * scale, vpH),
    u1: u((box.x + box.w) * scale, vpW),
    v1: u((box.y + box.h) * scale, vpH),
  };
};

/** 可见区域 UV → 灰度矩阵坐标，并在该矩形内取平均 / 最小 / 最大（隔行取样，够用且快） */
export const toneAt = (
  g: ToneGrid, uv: { u0: number; v0: number; u1: number; v1: number },
): Tone => {
  const x0 = Math.floor(g.wx + uv.u0 * g.ww);
  const x1 = Math.ceil(g.wx + uv.u1 * g.ww);
  const y0 = Math.floor(g.wy + uv.v0 * g.wh);
  const y1 = Math.ceil(g.wy + uv.v1 * g.wh);
  let sum = 0;
  let n = 0;
  let min = 1;
  let max = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = Math.min(g.gw - 1, Math.max(0, x));
      const cy = Math.min(g.gh - 1, Math.max(0, y));
      const v = g.lum[cy * g.gw + cx] ?? 0;
      sum += v;
      n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (n === 0) return { avg: 0.5, min: 0.5, max: 0.5 };
  return { avg: sum / n, min, max };
};

/** 整块可见区域的统计（给「壁纸遮罩加成」用） */
export const gridTone = (g: ToneGrid): Tone => {
  let sum = 0;
  let n = 0;
  let min = 1;
  let max = 0;
  for (let y = g.wy; y < g.wy + g.wh; y++) {
    for (let x = g.wx; x < g.wx + g.ww; x++) {
      const v = g.lum[y * g.gw + x] ?? 0;
      sum += v;
      n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (n === 0) return { avg: 0.5, min: 0.5, max: 0.5 };
  return { avg: sum / n, min, max };
};

/** 浏览器侧：壁纸图 → 可见区域灰度图（解码失败返回 null，调用方退回兜底亮度） */
export const buildToneGrid = async (
  dataUrl: string, screenRatio: number, fx: number, fy: number,
): Promise<ToneGrid | null> => {
  const s = await sampleLuma(dataUrl);
  if (s === null) return null;
  const w = visibleWindow(s.gw, s.gh, screenRatio, fx, fy);
  const grid: ToneGrid = { ...s, ...w, avg: 0.5, min: 0.5, max: 0.5 };
  const t = gridTone(grid);
  return { ...grid, ...t };
};
