/**
 * 共享类型定义（跨上下文，纯类型，无 chrome.* 依赖）
 *
 * 唯一数据模型 = v4 内容模型（冻结于 docs/v4/02-UI规格.md §13）：
 * 卡片 = 对某个小组件定义的一次引用：位置与尺寸属于布局，config 属于内容。
 * v3 的磁贴 / 分类分页 / 11 引擎注册表已删除（03 文档 D13）。
 */

/* ==========================================================================
 * 内容模型
 * ========================================================================== */

/** 小组件类型（= WIDGET_DEFS 的键） */
export type WidgetKind =
  | 'news'
  | 'clock'
  | 'cal'
  | 'weather'
  | 'todo'
  | 'ann'
  | 'countday'
  | 'countdown'
  | 'fav'
  | 'quote'
  | 'music'
  | 'trans'
  | 'calc'
  | 'woodfish'
  | 'ai'
  | 'icon'
  | 'folder'
  | 'group';

/** 卡片尺寸档位（单位数，1 单位 = 60px，仅六档） */
export interface SlotSize {
  w: number;
  h: number;
}

/** 可编辑字段类型：文本 / 数字 / 逗号分隔列表 / 开关 / 选项 */
export type WidgetFieldType = 'text' | 'num' | 'list' | 'bool' | 'sel';

export interface WidgetField {
  /** config 键 */
  k: string;
  /** 显示名 */
  l: string;
  t: WidgetFieldType;
  /** sel 的选项 */
  o?: string[];
  /** 占位提示 */
  ph?: string;
}

/** 小组件定义（唯一来源，定义默认值属于这里） */
export interface WidgetDefinition {
  t: WidgetKind;
  /** 显示名 */
  n: string;
  /** 字形（占位素材，真 Logo 后续替换） */
  g: string;
  /** 品牌色 */
  c: string;
  /** 一句话说明（添加面板副标题） */
  s: string;
  /** 添加时的默认单位尺寸 */
  units: SlotSize;
  /** 可编辑字段（编辑弹窗据此渲染） */
  fields: WidgetField[];
  /** 默认配置 */
  def: Record<string, unknown>;
}

/** 卡片实例：引用某个小组件定义 + 自己的覆盖配置 */
export interface GridItem {
  id: string;
  /** 网格单位坐标（1 单位 = 60px） */
  c: number;
  r: number;
  w: number;
  h: number;
  /** 引用的小组件类型 */
  t: WidgetKind;
  /** 只存本实例的覆盖值；读取时按「定义默认值 ⊕ 实例覆盖值」合成 */
  config: Record<string, unknown>;
}

/** 一套模式的页面集合（每页是一组卡片） */
export type ModePages = GridItem[][];

/** 布局导出 / 导入文档（设置 → 数据与备份；01 §5.1：本地导出文件 = 云快照的布局部分） */
export interface LayoutDoc {
  v: number;
  app: string;
  exportedAt: string;
  standard: ModePages;
  privacy: ModePages;
}

/* ==========================================================================
 * 搜索引擎
 * ========================================================================== */

/** v4 搜索引擎定义（内置 12 个见 BUILTIN_ENGINES；可隐藏、可排序、可自定义） */
export interface EngineDef {
  id: string;
  name: string;
  /** 品牌色 */
  color: string;
  /** 字形（占位素材） */
  glyph: string;
  /** 自定义图标（URL 或 data:image，可选） */
  img?: string | undefined;
  /** 拉丁字形（字号按 0.74 缩小） */
  latin?: boolean | undefined;
  /** 搜索地址（query 前拼） */
  base: string;
  /** 已隐藏（不出现在下拉 / 数字键 / 右键二级菜单） */
  hidden?: boolean | undefined;
}

/** v4 内置搜索引擎全集（12 个 = 启用上限，见 docs/v4/04 §5.1） */
export const BUILTIN_ENGINES: readonly EngineDef[] = [
  { id: 'baidu', name: '百度', color: '#2932E1', glyph: '百', base: 'https://www.baidu.com/s?wd=' },
  { id: 'bing', name: '必应', color: '#008373', glyph: '必', base: 'https://www.bing.com/search?q=' },
  { id: 'google', name: '谷歌', color: '#4285F4', glyph: 'G', latin: true, base: 'https://www.google.com/search?q=' },
  { id: 'sogou', name: '搜狗', color: '#FD5720', glyph: '搜', base: 'https://www.sogou.com/web?query=' },
  { id: 'so360', name: '360 搜索', color: '#0EB55A', glyph: '360', latin: true, base: 'https://www.so.com/s?q=' },
  { id: 'shenma', name: '神马搜索', color: '#FF6A00', glyph: '神', base: 'https://so.m.sm.cn/s?q=' },
  { id: 'quark', name: '夸克搜索', color: '#2F6BFF', glyph: '夸', base: 'https://quark.sm.cn/s?q=' },
  { id: 'toutiao', name: '今日头条', color: '#F04142', glyph: '头', base: 'https://so.toutiao.com/search?keyword=' },
  { id: 'zhihu', name: '知乎', color: '#0084FF', glyph: '知', base: 'https://www.zhihu.com/search?type=content&q=' },
  { id: 'weibo', name: '微博', color: '#E6162D', glyph: '微', base: 'https://s.weibo.com/weibo?q=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', color: '#DE5833', glyph: 'D', latin: true, base: 'https://duckduckgo.com/?q=' },
  { id: 'brave', name: 'Brave', color: '#FB542B', glyph: 'B', latin: true, base: 'https://search.brave.com/search?q=' },
] as const;

/* ==========================================================================
 * 风格皮肤（02 §6.1：用户可完全自定义的数据资产，内置 4 套仅为出厂初始值）
 * ========================================================================== */

export interface SkinPack {
  /** 自由 id（文件名或时间戳生成） */
  id: string;
  /** 用户可改 */
  name: string;
  /** 出厂初始值 → 可「还原内置」；自建风格无此操作 */
  builtin: boolean;
  /** 仅决定文字与图标的对比基线，不限制配色 */
  base: 'light' | 'dark';
  /** 该风格配套壁纸（WALLS 下标，切风格可带出） */
  wall: number;
  /** 完整令牌集；缺省项回退 base 默认值 */
  tokens: Record<string, string>;
}

/* ==========================================================================
 * 设置与本地持久化文档
 * ========================================================================== */

/** 透明度与玻璃质感的六个可调区域（对应 --ga-* / --blur-*） */
export type GlassKey = 'card' | 'tile' | 'dock' | 'search' | 'panel' | 'menu';
export type GlassSettings = Record<GlassKey, number>;

/** 模式（标准 / 隐私各自独立页面集，极简只留搜索 + 时钟 + Dock） */
export type ViewMode = 'minimal' | 'standard' | 'privacy';

/** 链接打开方式（link-opener 统一入口） */
export type OpenMode = 'link' | 'tab' | 'search';

/** v4 界面设置（本地持久化，云同步见 01 §5） */
export interface AppSettings {
  mode: ViewMode;
  labels: boolean;
  hideTop: boolean;
  hideSearch: boolean;
  mascot: boolean;
  engineId: string;
  openMode: OpenMode;
  autoFocus: boolean;
  searchKeep: boolean;
  hideBtn: boolean;
  searchHistory: boolean;
  nick: string;
  searchWidth: number;
  searchRadius: number;
  dockCount: number;
  dockIcon: 'rect' | 'circle';
  clockColor: string;
  showTime: boolean;
  showDate: boolean;
  showQuote: boolean;
  glass: GlassSettings;
  /** 全局透明度 0.2–1 */
  gAlpha: number;
  /** 壁纸遮罩 0–1（02 §6.4 遮罩滑杆） */
  cover: number;
  /** 字体颜色（名称标签覆盖色；空串 = 跟随风格令牌） */
  fontColor: string;
  /** 沉浸式搜索框（与壁纸融合的透明样式） */
  immersive: boolean;
  /** 简洁模式搜索框改为线框样式 */
  simpleSearch: boolean;
  skinId: string;
  /** 内置壁纸下标（WALLS） */
  wallpaper: number;
  /** 自定义壁纸引用（IndexedDB id；非空时优先于内置壁纸） */
  wallpaperRef: string | null;
}

/** 本地持久化文档（chrome.storage 单键整存整取；快照式备份复用同一形状，01 §5.1） */
export interface StoredDoc {
  v: 2;
  settings: AppSettings;
  pages: { standard: ModePages; privacy: ModePages };
  engines: EngineDef[];
  skins: SkinPack[];
  history: string[];
  /** 本地演示账号（真实鉴权见 01 §4，thrilled-server 接入后替换） */
  user: { email: string } | null;
  /** 首次访问欢迎弹窗已展示 */
  welcomed: boolean;
  /** 上次备份时间（本地记录） */
  backupTime: string | null;
}
