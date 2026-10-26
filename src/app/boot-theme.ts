/**
 * 首帧底色与壁纸占位（避免打开新标签页时先闪一下白屏）
 *
 * chrome.storage 只有异步接口，配置读出来之前页面已经可以绘制。这里把「上次主题的底色」
 * 与「上次壁纸的低质量缩略图」各存一份到 localStorage（同步可读），首帧由 public/boot.js
 * 在解析阶段铺上，等配置与真壁纸就绪再无缝替换。
 *
 * 两条链路必须共用同一组键：public/boot.js（同步、解析阶段、不经过打包）与这里。
 */

/** 上次主题底色（皮肤令牌的 --mask-color） */
const BOOT_BG_KEY = 'thrilled:boot:bg';
/** 上次壁纸的缩略占位（小尺寸 dataURL，见 LQIP_WIDTH） */
const BOOT_LQIP_KEY = 'thrilled:boot:lqip';
/** 上次壁纸的裁剪焦点（CSS background-position 值，如 "35% 62%"） */
const BOOT_FOCUS_KEY = 'thrilled:boot:focus';

/**
 * 占位图目标宽度（px）。
 *
 * 不能太小：占位图要铺满整个窗口，40px 宽放大三十多倍后只剩几团色块，
 * 第一眼看到的不是「壁纸有点糊」而是「整页糊掉了」，然后真壁纸再硬切上来，
 * 观感就是页面形变了一下。320px 放大后仍明显发虚，但轮廓、构图都认得出，
 * 和真壁纸交接时只是「变清晰」。
 */
const LQIP_WIDTH = 320;
/**
 * 占位图 JPEG 质量。
 *
 * 别为省几 KB 往低压：小图上 JPEG 的块效应会被放大成一片片色块（天空、墙面尤其明显），
 * 比整体发虚更扎眼。320px 宽配 0.7 大约 20–35KB，localStorage 完全放得下。
 */
const LQIP_QUALITY = 0.7;

/** 读取上次主题底色（无记录返回空串） */
export const readBootBg = (): string => {
  try {
    return localStorage.getItem(BOOT_BG_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 读取上次壁纸占位图（无记录返回空串） */
export const readBootLqip = (): string => {
  try {
    return localStorage.getItem(BOOT_LQIP_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 记录主题底色（主题切换 / 启动载入后调用） */
export const writeBootBg = (color: string): void => {
  if (color === '') return;
  try {
    localStorage.setItem(BOOT_BG_KEY, color);
  } catch {
    /* 存储不可用：首帧退回 CSS 默认色，不影响功能 */
  }
};

/**
 * 读取上次壁纸的裁剪焦点（CSS background-position 值；无记录返回空串）。
 *
 * 占位图与真壁纸必须用同一套百分比裁切：`background-position` 与 `object-position`
 * 的百分比语义一致（都是「图片的 x% 对齐容器的 x%」），交接时画面才不滑动。
 */
export const readBootFocus = (): string => {
  try {
    return localStorage.getItem(BOOT_FOCUS_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 记录裁剪焦点（焦点算出来 / 换壁纸后调用；传 null 表示清除） */
export const writeBootFocus = (focus: { x: number; y: number } | null): void => {
  try {
    if (focus === null) {
      localStorage.removeItem(BOOT_FOCUS_KEY);
      return;
    }
    localStorage.setItem(BOOT_FOCUS_KEY, `${Math.round(focus.x)}% ${Math.round(focus.y)}%`);
  } catch {
    /* 存储不可用：占位图退回居中裁切，不影响功能 */
  }
};

/** 记录壁纸占位图（换壁纸 / 启动载入后调用；空串表示清除，回到纯底色） */
export const writeBootLqip = (lqip: string): void => {
  try {
    if (lqip === '') {
      localStorage.removeItem(BOOT_LQIP_KEY);
      return;
    }
    localStorage.setItem(BOOT_LQIP_KEY, lqip);
  } catch {
    /* 存储不可用：首帧只铺底色 */
  }
};

/** 首帧应用底色与占位壁纸（在 React 挂载前调用；public/boot.js 已在解析阶段铺过一次，这里是兜底） */
export const applyBootBg = (): void => {
  const html = document.documentElement;
  const bg = readBootBg();
  /* 只写 backgroundColor：backgroundImage 归占位壁纸，用 background 简写会把占位图清掉 */
  if (bg !== '') html.style.backgroundColor = bg;
  const lqip = readBootLqip();
  if (lqip === '') return;
  const focus = readBootFocus();
  html.style.backgroundImage = `url("${lqip}")`;
  html.style.backgroundSize = 'cover';
  html.style.backgroundPosition = focus === '' ? 'center' : focus;
  html.style.backgroundRepeat = 'no-repeat';
};

/**
 * 把壁纸压成一张小尺寸占位图（浏览器侧；非浏览器环境或无 Image 时返回空串）。
 *
 * 这是标准的 LQIP（low quality image placeholder）做法：首帧先铺一张缩小的版本，
 * 真壁纸解码完再淡入替换——观感上从「白屏 → 壁纸」变成「虚一点的壁纸 → 清晰壁纸」。
 * 缩得太小反而更显眼：整屏只剩色块，看起来就是页面糊掉了。
 */
export const makeLqip = (dataUrl: string): Promise<string> => {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve('');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, LQIP_WIDTH / Math.max(1, img.width));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        resolve('');
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', LQIP_QUALITY));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
};
