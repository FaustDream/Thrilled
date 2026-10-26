/**
 * 出厂默认值（设置 / 风格皮肤）
 *
 * 内置 4 套风格仅为出厂初始值，与用户自建风格同构（02 §6.1）；
 * core/reset 与 app/store 都从这里取默认，避免双份维护。
 */
import type { AppSettings, DockApp, SkinPack } from './types';
import { DEFAULT_SHORTCUTS } from './shortcuts';

/** Dock 出厂为空：快捷方式由用户在「添加 → 自定义」手动新增（右键图标可改名 / 改网址 / 移除） */
export const DEFAULT_DOCK_APPS: readonly DockApp[] = [];

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'standard',
  /* 图标名称出厂不常显：保持纯字形，需要辨认时悬停看提示 */
  iconNames: false,
  /* 删除后自动整理出厂开（用户需求）：删掉图标后不留空洞，后面的图标依次前移补位 */
  autoArrange: true,
  /* 删掉组件后同样不留空洞：后面的卡片（含图标）依次前移补位 */
  autoArrangeWidgets: true,
  hideTop: false,
  hideSearch: false,
  mascot: true,
  /* 网格对齐线出厂关：开启后页面常显网格，关闭后拖拽时也不显示 */
  gridLines: false,
  /* 对齐辅助出厂全开：网格是落点基座，组件对齐在阈值内覆盖它 */
  snapItems: true,
  showGuides: true,
  engineId: 'baidu',
  openMode: 'tab',
  autoFocus: false,
  searchKeep: false,
  hideBtn: false,
  searchHistory: true,
  searchPlaceholder: '',
  hideEngineIco: false,
  /* 出厂保持既有行为：点引擎图标展开下拉（切换引擎的入口在设置 / 右键菜单） */
  engineIcoAct: 'panel',
  historyLimit: 8,
  searchFontSize: 15,
  /* 出厂 44px（= 既有设计值：搜索框底缘 98px，与首行卡片留 24px） */
  searchTop: 44,
  /* 出厂都跟随全局打开方式（与旧行为一致） */
  searchEnterMode: 'inherit',
  searchBtnMode: 'inherit',
  blurAfterSearch: false,
  historyItemDel: true,
  searchWidth: 880,
  searchRadius: 25,
  dockIcon: 'rect',
  dockIconSize: 'md',
  dockApps: [...DEFAULT_DOCK_APPS],
  clockColor: '',
  /* 透明度：前六项等同旧「玻璃质感」的视觉，后六项默认 0（不改变出厂外观） */
  glass: {
    card: 0.6, tile: 0.35, dock: 0.7, search: 0.45, panel: 0.65, menu: 0.65,
    glyph: 0, dockIcon: 0, clock: 0, line: 0, hover: 0,
  },
  /* 毛玻璃模糊：与透明度解耦，默认值取旧 glass 换算结果（26px × 旧值），升级后外观不变 */
  blur: { card: 15.6, tile: 9.1, dock: 18.2, search: 11.7, panel: 16.9, menu: 16.9 },
  gAlpha: 1,
  cover: 0.18,
  fontColor: '',
  /* 自动对比默认开：出厂壁纸是纯色，开与不开都看不出差别；换上亮 / 花壁纸才见效 */
  autoContrast: true,
  immersive: false,
  simpleSearch: false,
  skinId: 'classic',
  wallpaperRef: null,
  wallFocus: { x: 50, y: 50, ratio: 0 },
  /* 出厂停留在哲风：它同时有静态 / 动态与主题分类（其余来源切一下即可） */
  wallSource: 'zhefeng',
  shortcuts: { ...DEFAULT_SHORTCUTS },
  /* 按组件类型的默认样式：出行为空（跟随主题），用户可在配置弹窗「样式」段里设为默认 */
  styleDefaults: {},
  /* 天气默认用真实定位（浏览器定位权限）；手选城市是定位不可用时的替代方案 */
  weatherCity: null,
  weatherCities: [],
  /* 天气默认 30 分钟自动刷新（与数据源缓存 TTL 一致） */
  weatherEvery: 30,
};

/** 内置主题只有两套：经典（浅色）与暗黑（深色）；配色不再提供编辑器 */
/* 语义色（--ok / --bad / --warn / --danger）两套主题各给一份：写死一个绿 / 红不可能同时
   在浅底与深底上跨过 3:1——暗黑主题的深色卡上，#16a34a 只有 2.2:1（4.97 修） */
const CLASSIC_TOKENS: Record<string, string> = {
  '--card-bg': '#ffffff', '--card-text': '#1f2937', '--card-sub': '#6b7280', '--accent': '#3b82f6',
  '--label-color': '#1f2937', '--panel-bg': '#ffffff', '--panel-text': '#1f2937', '--panel-sub': '#6b7280',
  '--tile-bg': '#ffffff', '--tile-line': 'rgba(255,255,255,.55)',
  '--line': '#eef1f6', '--chip-bg': 'rgba(255,255,255,.55)', '--chip-text': '#1f2937', '--menu-bg': '#ffffff',
  '--menu-hover': '#f3f5f9', '--clock-color': '#1f2937', '--search-text': '#1f2937',
  '--search-ph': 'rgba(31,41,55,.55)', '--mask-color': '#ffffff',
  '--ok': '#15803d', '--bad': '#b91c1c', '--warn': '#b45309', '--todo-accent': '#0f766e',
};

export const BUILTIN_SKINS: readonly SkinPack[] = [
  { id: 'classic', name: '经典', builtin: true, base: 'light', tokens: { ...CLASSIC_TOKENS } },
  {
    id: 'dark', name: '暗黑', builtin: true, base: 'dark',
    tokens: {
      '--card-bg': '#1d2332', '--card-text': '#e8edf7', '--card-sub': '#8e9cb4', '--accent': '#4f8cff',
      '--label-color': '#f2f5fb', '--panel-bg': '#171c29', '--panel-text': '#e8edf7', '--panel-sub': '#8e9cb4',
      '--tile-bg': '#2a3247', '--tile-line': 'rgba(255,255,255,.16)',
      '--line': '#2a3247', '--chip-bg': 'rgba(22,28,42,.74)', '--chip-text': '#e8edf7', '--menu-bg': '#1d2332',
      '--menu-hover': '#27304a', '--clock-color': '#ffffff', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.68)', '--mask-color': '#05070c',
      /* 深底上的语义色要提亮：同一支绿 / 红在深色卡上会沉下去 */
      '--ok': '#4ade80', '--bad': '#f87171', '--warn': '#fbbf24', '--todo-accent': '#2dd4bf',
    },
  },
];
