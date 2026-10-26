/**
 * 壁纸启动预载
 *
 * 壁纸存在 IndexedDB 里（base64，可达数 MB），只能异步读；而页面在读完之前就已经在绘制。
 * 先挂载界面、等壁纸回来再补上，首屏必然出现一次「底色 / 界面 → 壁纸」的跳变；
 * 拿低分辨率缩略图去顶替只会把这次跳变换成「整页先糊一下」，更难看。
 *
 * 所以启动时先把它读出来并解码好，再挂载界面：首个画面就是最终画面，没有中间态。
 * 代价是界面晚一点点出来（读库 + 解码，通常几十毫秒），这段空白由 public/boot.js
 * 在解析阶段铺好的主题底色填着，看到的就是一块正常底色，不是白屏。
 */

import { getWallpaper, type BgData } from '../core/wallpaper';

/** 解码兜底上限（ms）：图片体积 / 解码异常时，界面不能一直不出来 */
const DECODE_TIMEOUT_MS = 800;

/** 启动预读结果（挂在模块上：读取在挂载前，取用在首次渲染） */
let bootWall: { ref: string; bg: BgData } | null = null;

/**
 * 把图片解码进浏览器缓存（同一 dataURL 再次绘制时不必重新解码）。
 * `decode()` 失败（坏图 / 不支持的格式）不算错，界面照常挂载，由 <img> 自己兜底。
 */
const warmDecode = (dataUrl: string): Promise<void> => {
  if (typeof Image === 'undefined') return Promise.resolve();
  const img = new Image();
  img.src = dataUrl;
  const timeout = new Promise<void>((resolve) => { setTimeout(resolve, DECODE_TIMEOUT_MS); });
  return Promise.race([img.decode().catch(() => undefined), timeout]);
};

/** 启动时读一次壁纸并解码（在挂载界面之前调用；无壁纸 / 读取失败时什么都不做） */
export const preloadWallpaper = async (ref: string | null): Promise<void> => {
  if (ref === null) return;
  const bg = await getWallpaper(ref);
  if (bg === null) return;
  /* 视频没法预先解码：等 <video> 自己加载，这里只把数据读进内存（省掉一次读库） */
  if (bg.type === 'image') await warmDecode(bg.data);
  bootWall = { ref, bg };
};

/** 首屏渲染取预读结果：引用对不上或没预读过返回 null（调用方回退到正常读取） */
export const readBootWallpaper = (ref: string | null): BgData | null =>
  ref !== null && bootWall !== null && bootWall.ref === ref ? bootWall.bg : null;

/** 首屏已经用过这份预读数据：之后一律走正常读取（否则切回旧壁纸会命中过期缓存） */
export const dropBootWallpaper = (): void => {
  bootWall = null;
};
