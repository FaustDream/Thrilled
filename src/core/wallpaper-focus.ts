import type { WallFocus } from '../shared/types';

/**
 * 壁纸裁剪焦点（v4.4）
 *
 * `object-fit: cover` 只保证「等比填满、不变形、无黑边」，裁剪位置固定居中——
 * 人像、地平线偏上或偏下的图会被居中切掉主体。这里沿可移动轴滑窗搜索，
 * 用三个归一化分数挑出主体最集中的裁剪窗口，换算成 `object-position` 百分比。
 *
 * 分两层：`focusOffset` 是纯函数（可直接单测），`sampleLuma` 负责浏览器侧降采样。
 * 不做重活：原图先降到 256px 宽取灰度，再在灰度矩阵上滑窗，几十毫秒量级。
 */

/** 滑窗搜索步数（越大越精细，代价线性增长） */
const SEARCH_STEPS = 32;
/** 降采样目标宽度（像素）：越高越准、越慢 */
const FOCUS_SAMPLE_WIDTH = 256;
/** 评分权重：边缘能量（主体密度，主判据）/ 中心先验（不把主体推到边）/ 明度方差（排除纯色天空地面） */
const W_ENERGY = 0.7;
const W_CENTER = 0.2;
const W_VARIANCE = 0.1;
/** 灰度方差的实用上限（实测多在 0–0.25，放大到 0–1 参与加权） */
const VARIANCE_SCALE = 4;

/** 裁剪焦点（object-position 百分比，0–100） */
export interface FocusOffset {
  x: number;
  y: number;
}

/** 浏览器侧一步到位：采样 → 评分；解码失败时退回居中（仍然记下比例，避免反复重试） */
export const computeWallFocus = async (dataUrl: string, screenRatio: number): Promise<WallFocus> => {
  const sample = await sampleLuma(dataUrl);
  if (sample === null) return { x: 50, y: 50, ratio: screenRatio };
  return { ...focusOffset(sample.lum, sample.gw, sample.gh, screenRatio), ratio: screenRatio };
};

/** 已降采样的灰度矩阵 */
export interface LumaSample {
  lum: Float32Array;
  gw: number;
  gh: number;
}

const CENTER: FocusOffset = { x: 50, y: 50 };

/** Sobel 梯度幅值图（主体边缘 / 纹理密度） */
const sobel = (lum: Float32Array, gw: number, gh: number): Float32Array => {
  const out = new Float32Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) {
    const row = y * gw;
    for (let x = 1; x < gw - 1; x++) {
      const i = row + x;
      const a = lum[i - gw - 1] ?? 0;
      const b = lum[i - gw] ?? 0;
      const c = lum[i - gw + 1] ?? 0;
      const d = lum[i - 1] ?? 0;
      const f = lum[i + 1] ?? 0;
      const g = lum[i + gw - 1] ?? 0;
      const h = lum[i + gw] ?? 0;
      const k = lum[i + gw + 1] ?? 0;
      const sx = c + 2 * f + k - (a + 2 * d + g);
      const sy = g + 2 * h + k - (a + 2 * b + c);
      out[i] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  return out;
};

/** 单个候选窗口的加权得分（三项各自归一化到 0–1，窗口尺寸固定故可直接比较） */
const windowScore = (
  lum: Float32Array, grad: Float32Array, gw: number, gh: number,
  winW: number, winH: number, sx: number, sy: number, gradMax: number,
): number => {
  let sum = 0;
  let sum2 = 0;
  let energy = 0;
  let n = 0;
  for (let y = sy; y < sy + winH; y++) {
    const row = y * gw;
    for (let x = sx; x < sx + winW; x++) {
      const i = row + x;
      const v = lum[i] ?? 0;
      sum += v;
      sum2 += v * v;
      energy += grad[i] ?? 0;
      n++;
    }
  }
  if (n === 0) return -Infinity;
  const mean = sum / n;
  const variance = Math.max(0, sum2 / n - mean * mean);
  const e = gradMax > 0 ? energy / n / gradMax : 0;
  const cx = (sx + winW / 2) / gw;
  const cy = (sy + winH / 2) / gh;
  const dist = Math.hypot(cx - 0.5, cy - 0.5) / Math.SQRT1_2;
  const center = 1 - Math.min(1, dist);
  const texture = Math.min(1, variance * VARIANCE_SCALE);
  return W_ENERGY * e + W_CENTER * center + W_VARIANCE * texture;
};

/**
 * 按屏幕宽高比在原图上找主体最集中的裁剪窗口。
 *
 * 比值判断可移动轴：图比屏宽 → cover 后裁左右 → 窗口沿 X 滑；图比屏高 → 沿 Y 滑。
 * 返回的百分比与 CSS 语义一致：0% 贴左/上边缘，100% 贴右/下边缘。
 */
export const focusOffset = (lum: Float32Array, gw: number, gh: number, screenRatio: number): FocusOffset => {
  if (gw < 3 || gh < 3 || !(screenRatio > 0)) return CENTER;
  const imgRatio = gw / gh;
  if (Math.abs(imgRatio - screenRatio) < 1e-3) return CENTER;

  const alongX = imgRatio > screenRatio;
  const winW = alongX ? Math.min(gw, Math.round(gh * screenRatio)) : gw;
  const winH = alongX ? gh : Math.min(gh, Math.round(gw / screenRatio));
  const range = alongX ? gw - winW : gh - winH;
  if (range <= 0) return CENTER;

  const grad = sobel(lum, gw, gh);
  let gradMax = 0;
  for (let i = 0; i < grad.length; i++) {
    const v = grad[i] ?? 0;
    if (v > gradMax) gradMax = v;
  }

  let bestStep = 0;
  let bestScore = -Infinity;
  for (let s = 0; s <= SEARCH_STEPS; s++) {
    const off = Math.round((range * s) / SEARCH_STEPS);
    const score = windowScore(lum, grad, gw, gh, winW, winH, alongX ? off : 0, alongX ? 0 : off, gradMax);
    if (score > bestScore) {
      bestScore = score;
      bestStep = s;
    }
  }
  const pct = Math.round((100 * bestStep) / SEARCH_STEPS);
  return alongX ? { x: pct, y: 50 } : { x: 50, y: pct };
};

/** 浏览器侧：把图片降采样成灰度矩阵（解码失败 / 无 canvas 时返回 null） */
export const sampleLuma = async (dataUrl: string): Promise<LumaSample | null> => {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  const img = new Image();
  const loaded = new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
  if (!(await loaded)) return null;
  const gw = Math.max(3, Math.min(FOCUS_SAMPLE_WIDTH, img.naturalWidth));
  const gh = Math.max(3, Math.round((img.naturalHeight * gw) / Math.max(1, img.naturalWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.drawImage(img, 0, 0, gw, gh);
  const px = ctx.getImageData(0, 0, gw, gh).data;
  const lum = new Float32Array(gw * gh);
  for (let i = 0; i < lum.length; i++) {
    const r = px[i * 4] ?? 0;
    const g = px[i * 4 + 1] ?? 0;
    const b = px[i * 4 + 2] ?? 0;
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return { lum, gw, gh };
};
