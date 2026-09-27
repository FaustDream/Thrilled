/**
 * 出厂默认值（设置 / 风格皮肤）
 *
 * 内置 4 套风格仅为出厂初始值，与用户自建风格同构（02 §6.1）；
 * core/reset 与 app/store 都从这里取默认，避免双份维护。
 */
import type { AppSettings, SkinPack } from './types';

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
  clockColor: '#1f2937',
  showTime: true,
  showDate: true,
  showQuote: true,
  glass: { card: 0.6, tile: 0.35, dock: 0.7, search: 0.45, panel: 0.65, menu: 0.65 },
  gAlpha: 1,
  cover: 0.18,
  fontColor: '',
  immersive: false,
  simpleSearch: false,
  skinId: 'classic',
  wallpaper: 0,
  wallpaperRef: null,
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
  { id: 'classic', name: '经典', builtin: true, base: 'light', wall: 6, tokens: { ...CLASSIC_TOKENS } },
  {
    id: 'glass', name: '光感', builtin: true, base: 'light', wall: 3,
    tokens: {
      '--card-bg': 'rgba(255,255,255,.72)', '--card-text': '#16202e', '--card-sub': '#5d6b7d', '--accent': '#2f6bff',
      '--label-color': '#16202e', '--panel-bg': '#ffffff', '--panel-text': '#16202e', '--panel-sub': '#5d6b7d',
      '--line': '#e6ebf2', '--chip-bg': 'rgba(255,255,255,.55)', '--chip-text': '#16202e', '--menu-bg': '#ffffff',
      '--menu-hover': '#f1f5fa', '--clock-color': '#16202e', '--search-text': '#16202e',
      '--search-ph': 'rgba(22,32,46,.6)', '--mask-color': '#ffffff',
    },
  },
  {
    id: 'dark', name: '暗黑', builtin: true, base: 'dark', wall: 2,
    tokens: {
      '--card-bg': '#1b2030', '--card-text': '#e6ebf5', '--card-sub': '#8d9bb0', '--accent': '#3b82f6',
      '--label-color': '#ffffff', '--panel-bg': '#151a26', '--panel-text': '#e6ebf5', '--panel-sub': '#8d9bb0',
      '--line': '#252c3d', '--chip-bg': 'rgba(20,26,38,.72)', '--chip-text': '#e6ebf5', '--menu-bg': '#1b2030',
      '--menu-hover': '#252c3d', '--clock-color': '#ffffff', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.7)', '--mask-color': '#060a10',
    },
  },
  {
    id: 'purple', name: '黑紫', builtin: true, base: 'dark', wall: 5,
    tokens: {
      '--card-bg': '#17111f', '--card-text': '#ece6f5', '--card-sub': '#9583ab', '--accent': '#a855f7',
      '--label-color': '#ffffff', '--panel-bg': '#140e1c', '--panel-text': '#ece6f5', '--panel-sub': '#9583ab',
      '--line': '#261c33', '--chip-bg': 'rgba(23,17,31,.72)', '--chip-text': '#ece6f5', '--menu-bg': '#1b1424',
      '--menu-hover': '#2a1f38', '--clock-color': '#e9d5ff', '--search-text': '#ffffff',
      '--search-ph': 'rgba(255,255,255,.68)', '--mask-color': '#060a10',
    },
  },
];
