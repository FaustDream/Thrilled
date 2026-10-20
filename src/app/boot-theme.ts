/**
 * 首帧底色（避免打开新标签页时先闪一下默认浅色）
 *
 * chrome.storage 只有异步接口，配置读出来之前页面已经可以绘制；
 * 这里把上次主题的底色另存一份到 localStorage（同步可读），首帧先铺这个颜色，
 * 等配置就绪再渲染界面，观感上不会出现「先默认、后跳变」。
 */

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

/** 首帧应用底色（在 React 挂载前调用） */
export const applyBootBg = (): void => {
  const bg = readBootBg();
  if (bg === '') return;
  document.documentElement.style.background = bg;
  document.body.style.background = bg;
};
