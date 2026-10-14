/**
 * 长按进入拖拽的判定（页面网格上的卡片共用）
 *
 * 交互约定（v4.4 补丁 35，用户需求）：进入拖拽的**唯一入口是「按住不动 0.5 秒」**——
 * 单击绝不会让卡片动起来。原先是「按下后位移超过 4px 就进入拖拽」，4px 是屏幕像素、
 * 太小了：点击时的手抖 / 触控板轻滑就能越线，看起来就是「点一下卡片就进入移动状态」。
 *
 * 按住期间若指针漂移超过容差，视为「想拖但没按住」：本次按下作废——既不拖（卡片留在原位），
 * 也不当作点击打开卡片（由调用方吃掉那次 click 并给一次性提示）。
 * 判定只在「还没进入拖拽」的阶段用；进入拖拽后位移就是拖动本身，不再受此约束。
 */

/** 长按多久进入拖拽（毫秒） */
export const HOLD_MS = 500

/** 按住期间允许的抖动容差（屏幕像素）：鼠标点击抖动通常 ≤5px，手指按压约 8–10px */
export const HOLD_SLOP = 12

/** wait = 继续等；arm = 到点了，可以拖；abort = 漂移过大，本次按下作废 */
export type HoldVerdict = 'wait' | 'arm' | 'abort'

/**
 * 判定按下后的状态。`elapsedMs` 为按下至今的毫秒数，`dx` / `dy` 为指针相对按下点的**屏幕**位移
 * （stage 坐标在整体缩放下会被放大，故与阈值比较一律用屏幕像素）。
 */
export function holdVerdict(elapsedMs: number, dx: number, dy: number): HoldVerdict {
  if (Math.abs(dx) > HOLD_SLOP || Math.abs(dy) > HOLD_SLOP) return 'abort'
  return elapsedMs >= HOLD_MS ? 'arm' : 'wait'
}
