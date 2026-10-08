/**
 * 出厂默认值（设置 / 风格皮肤）
 *
 * 内置 4 套风格仅为出厂初始值，与用户自建风格同构（02 §6.1）；
 * core/reset 与 app/store 都从这里取默认，避免双份维护。
 */
import type { AppSettings, DockApp, SkinPack } from './types';

/** Dock 出厂为空：快捷方式由用户在「添加 → 自定义」手动新增（右键图标可改名 / 改网址 / 移除） */
export const DEFAULT_DOCK_APPS: readonly DockApp[] = [];

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'standard',
  labels: true,
  hideTop: false,
  hideSearch: false,
  mascot: true,
  engineId: 'baidu',
  openMode: 'tab',
  autoFocus: false,
  searchKeep: false,
  hideBtn: false,
  searchHistory: true,
  nick: '主人',
  searchWidth: 880,
  searchRadius: 25,
  dockCount: 8,
  dockIcon: 'rect',
  dockApps: [...DEFAULT_DOCK_APPS],
  clockColor: '#1f2937',
  showTime: true,
  showDate: true,
  showQuote: true,
  /* 透明度：前六项等同旧「玻璃质感」的视觉，后六项默认 0（不改变出厂外观） */
  glass: {
    card: 0.6, tile: 0.35, dock: 0.7, search: 0.45, panel: 0.65, menu: 0.65,
    glyph: 0, dockIcon: 0, clock: 0, quote: 0, line: 0, hover: 0,
  },
  /* 毛玻璃模糊：与透明度解耦，默认值取旧 glass 换算结果（26px × 旧值），升级后外观不变 */
  blur: { card: 15.6, tile: 9.1, dock: 18.2, search: 11.7, panel: 16.9, menu: 16.9 },
  gAlpha: 1,
  cover: 0.18,
  fontColor: '',
  immersive: false,
  simpleSearch: false,
  skinId: 'classic',
  wallpaperRef: null,
  wallFocus: { x: 50, y: 50, ratio: 0 },
  wallSources: [],
};

/** 12 项用户可编辑令牌（风格抽屉取色行，02 §6.1） */
export const SKIN_FIELDS: readonly (readonly [string, string])[] = [
  ['--card-bg', '卡片背景'], ['--card-text', '卡片文字'], ['--card-sub', '次要文字'], ['--accent', '主题色'],
  ['--label-color', '名称标签'], ['--panel-bg', '面板背景'], ['--panel-text', '面板文字'],
  ['--line', '分隔线'], ['--chip-bg', '顶部胶囊'], ['--chip-text', '胶囊文字'],
  ['--menu-bg', '菜单背景'], ['--menu-hover', '菜单悬停'],
];

const CLASSIC_TOKENS: Record<string, string> = {
  '--card-bg': '#ffffff', '--card-text': '#1f2937', '--card-sub': '#6b7280', '--accent': '#3b82f6',
  '--label-color': '#1f2937', '--panel-bg': '#ffffff', '--panel-text': '#1f2937', '--panel-sub': '#6b7280',
  '--line': '#eef1f6', '--chip-bg': 'rgba(255,255,255,.55)', '--chip-text': '#1f2937', '--menu-bg': '#ffffff',
  '--menu-hover': '#f3f5f9', '--clock-color': '#1f2937', '--search-text': '#1f2937',
  '--search-ph': 'rgba(31,41,55,.55)', '--mask-color': '#ffffff',
};

export const BUILTIN_SKINS: readonly SkinPack[] = [
  { id: 'classic', name: '经典', builtin: true, base: 'light', tokens: { ...CLASSIC_TOKENS } },
  {
    id: 'glass', name: '光感', builtin: true, base: 'light',
    tokens: {
      '--card-bg': 'rgba(255,255,255,.68)', '--card-text': '#141e2c', '--card-sub': '#5a6a7e', '--accent': '#2b7fff',
      '--label-color': '#141e2c', '--panel-bg': '#ffffff', '--panel-text': '#141e2c', '--panel-sub': '#5a6a7e',
      '--line': '#e4eaf3', '--chip-bg': 'rgba(255,255,255,.6)', '--chip-text': '#141e2c', '--menu-bg': '#ffffff',
      '--menu-hover': '#f0f5fc', '--clock-color': '#141e2c', '--search-text': '#141e2c',
      '--search-ph': 'rgba(20,30,44,.55)', '--mask-color': '#ffffff',
    },
  },
  {
    id: 'dark', name: '暗黑', builtin: true, base: 'dark',
    tokens: {
      '--card-bg': '#1d2332', '--card-text': '#e8edf7', '--card-sub': '#8e9cb4', '--accent': '#4f8cff',
      '--label-color': '#f2f5fb', '--panel-bg': '#171c29', '--panel-text': '#e8edf7', '--panel-sub': '#8e9cb4',
      '--line': '#2a3247', '--chip-bg': 'rgba(22,28,42,.74)', '--chip-text': '#e8edf7', '--menu-bg': '#1d2332',
      '--menu-hover': '#27304a', '--clock-color': '#ffffff', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.68)', '--mask-color': '#05070c',
    },
  },
  {
    id: 'purple', name: '黑紫', builtin: true, base: 'dark',
    tokens: {
      '--card-bg': '#1a1326', '--card-text': '#efe8fa', '--card-sub': '#9d8bb5', '--accent': '#b06aff',
      '--label-color': '#ffffff', '--panel-bg': '#160f20', '--panel-text': '#efe8fa', '--panel-sub': '#9d8bb5',
      '--line': '#2b1f3c', '--chip-bg': 'rgba(25,18,36,.76)', '--chip-text': '#efe8fa', '--menu-bg': '#1d1429',
      '--menu-hover': '#2d2140', '--clock-color': '#ecd5ff', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.66)', '--mask-color': '#07040c',
    },
  },
  {
    id: 'dawn', name: '晨曦', builtin: true, base: 'light',
    tokens: {
      '--card-bg': '#fffdf9', '--card-text': '#463225', '--card-sub': '#a68a76', '--accent': '#f0762b',
      '--label-color': '#463225', '--panel-bg': '#fffaf3', '--panel-text': '#463225', '--panel-sub': '#a68a76',
      '--line': '#f2e4d5', '--chip-bg': 'rgba(255,250,242,.62)', '--chip-text': '#463225', '--menu-bg': '#fffdf8',
      '--menu-hover': '#f9efe2', '--clock-color': '#463225', '--search-text': '#463225',
      '--search-ph': 'rgba(70,50,37,.55)', '--mask-color': '#fdf5ea',
    },
  },
  {
    id: 'teal', name: '黛青', builtin: true, base: 'dark',
    tokens: {
      '--card-bg': '#11211e', '--card-text': '#e3f2ec', '--card-sub': '#8fb0a6', '--accent': '#2fd4b0',
      '--label-color': '#f0faf6', '--panel-bg': '#0d1a17', '--panel-text': '#e3f2ec', '--panel-sub': '#8fb0a6',
      '--line': '#1f3730', '--chip-bg': 'rgba(14,27,24,.76)', '--chip-text': '#e3f2ec', '--menu-bg': '#122420',
      '--menu-hover': '#1c3630', '--clock-color': '#c9f5e6', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.66)', '--mask-color': '#040e0c',
    },
  },
];
