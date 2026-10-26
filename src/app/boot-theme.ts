/**
 * 首帧底色（避免打开新标签页时先闪一下白屏）
 *
 * chrome.storage 只有异步接口，配置读出来之前页面已经可以绘制。这里把「上次主题的底色」
 * 存一份到 localStorage（同步可读），首帧由 public/boot.js 在解析阶段铺上，
 * 界面挂载时看到的已经是正确底色，不会先闪默认浅色，也不会是白屏。
 *
 * 壁纸不在这条链路上：它是几 MB 的 dataURL，得先从 IndexedDB 读出来再解码，同步拿不到。
 * 用低分辨率缩略图顶替只会让整页先糊一下再变清晰，反而更扎眼——壁纸改为挂载前预载
 * （见 app/wallpaper-preload），首个画面就是清晰的它。
 *
 * 两条链路必须共用同一个键：public/boot.js（同步、解析阶段、不经过打包）与这里。
 */

/** 上次主题底色（皮肤令牌的 --mask-color） */
const BOOT_BG_KEY = 'thrilled:boot:bg';

/** 读取上次主题底色（无记录返回空串） */
export const readBootBg = (): string => {
  try {
    return localStorage.getItem(BOOT_BG_KEY) ?? '';
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

/** 首帧应用底色（在 React 挂载前调用；public/boot.js 已在解析阶段铺过一次，这里是兜底） */
export const applyBootBg = (): void => {
  const bg = readBootBg();
  /* 只写 backgroundColor：根元素的背景会自动传播到整个画布，body / #root 保持透明 */
  if (bg !== '') document.documentElement.style.backgroundColor = bg;
};
