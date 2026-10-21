/**
 * 当前皮肤的「落点底色」实时值
 *
 * 品牌色字形需要知道自己在什么底色上才能挑出可读的墨色（见 shared/luma 的 readableInk）。
 * 每次渲染都读 getComputedStyle 会在时钟每秒重渲染时反复触发样式解析（一页 40+ 个字形），
 * 所以由 App 在写主题令牌的同一个 effect 里把解析好的值放进来，渲染期同步读取。
 */
export const skinRuntime = {
  /** 图标容器底色（Dock 图标 / 图标格容器 / 网址导航） */
  tileBg: '#ffffff',
  /** 卡片底色（小组件卡内文字与图标的参照） */
  cardBg: '#ffffff',
}

/** 写入当前底色（App 的主题 effect 调用） */
export const setSkinRuntime = (v: { tileBg: string; cardBg: string }): void => {
  skinRuntime.tileBg = v.tileBg
  skinRuntime.cardBg = v.cardBg
}
