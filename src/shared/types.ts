/**
 * 共享类型定义（跨上下文，纯类型，无 chrome.* 依赖）
 *
 * 集中定义新标签页项目的数据模型：磁贴、分页、搜索引擎、设置项等。
 * 命名约定：`TileId`/`PageIndex` 等品牌类型（Branded Type）用于防止原始类型混用；
 * 所有可空字段显式使用 `| null`，避免 `exactOptionalPropertyTypes` 下赋值歧义。
 */

/**
 * 品牌类型工具：给原始类型打上语义标签
 * 采用「幽灵品牌」（optional 属性）：不强制构造处写品牌标记，仅用于文档化意图与
 * 防止跨语义的原始类型混用（配合 zod 产物与字面量赋值时零摩擦）。
 */
export type Brand<T, B extends string> = T & { readonly __brand?: B };

/** 磁贴 ID：`tile_<ts>_<rand>` */
export type TileId = Brand<string, 'TileId'>;
/** 页面索引（分类序号，从 0 开始） */
export type PageIndex = number;

/** 磁贴类型：favicon（站点图标）/ custom（自定义图标）/ text（首字符）/ emoji */
export type TileType = 'favicon' | 'custom' | 'text' | 'emoji';

/**
 * 磁贴（快捷方式）
 */
export interface Tile {
  /** 唯一 ID，`tile_<ts>_<rand>` */
  id: TileId;
  /** 显示名称 */
  label: string;
  /** 目标地址 */
  url: string;
  /** 图标渲染类型 */
  type: TileType;
  /** 图标 URL / emoji / SVG */
  icon: string;
  /** 磁贴底色 */
  color: string;
  /** 排序位 */
  position: number;
  /** 自定义图标 base64（`type === 'custom'` 时使用） */
  imageData: string;
}

/** 磁贴分页（分类），每个分类一页 */
export interface TilePage {
  /** 分类名（页面名） */
  name: string;
  /** 该分类下的磁贴列表 */
  tiles: Tile[];
}

/** 搜索引擎 id 字面量联合 */
export type EngineId =
  | 'google'
  | 'bing'
  | 'baidu'
  | 'zhihu'
  | 'weibo'
  | 'duckduckgo'
  | 'github'
  | 'bilibili'
  | 'yandex'
  | 'gamer520'
  | 'linuxdo';

/**
 * 搜索引擎定义
 * 图标渲染优先级：iconName（SVG symbol）→ badge（文本徽标）→ svg（内联路径）
 */
export interface SearchEngine {
  id: EngineId;
  /** 显示名 */
  name: string;
  /** 展示 URL */
  url: string;
  /** 搜索 URL 模板（query 需 encodeURIComponent） */
  base: string;
  /** SVG symbol 名（可选） */
  iconName?: string;
  /** 文本徽标（可选） */
  badge?: string;
  /** 内联 SVG path（可选） */
  svg?: string;
}

/** 快捷方式尺寸 */
export type ShortcutSize = 'small' | 'standard' | 'large';
/** 快捷方式列数配置值 */
export type ShortcutColumns = 'auto' | '4' | '5' | '6' | '7' | '8' | '10';

/** 主题方案 */
export type ColorScheme = 'light' | 'dark' | 'auto';

/** 链接打开类型（link-opener 统一入口） */
export type LinkOpenType = 'tiles' | 'search' | 'other';

/**
 * 新标签页设置项（tabpage_ 前缀存储）
 */
export interface TabPageSettings {
  /** 当前搜索引擎 id */
  engine: EngineId;
  /** 快捷方式尺寸 */
  shortcutSize: ShortcutSize;
  /** 快捷方式列数 */
  shortcutColumns: ShortcutColumns;
  /** 自动聚焦开关 */
  autoFocus: boolean;
  /** 分类记忆开关 */
  categoryMemory: boolean;
  /** 分类按钮行开关 */
  catRow: boolean;
  /** 页面切换动画 */
  pageTransition: boolean;
  /** 磁贴新标签打开 */
  linkNewTabTiles: boolean;
  /** 搜索结果新标签打开 */
  linkNewTabSearch: boolean;
  /** 昵称（默认「主人」） */
  nickname: string;
  /** 上次所在分页（分类记忆恢复） */
  lastPage: PageIndex;
  /** 批量选择修饰键：ctrl / alt / ctrlShift */
  batchModifierKey: string;
}

/** 倒计时目标（localStorage `countdowns`） */
export interface CountdownItem {
  id: string;
  title: string;
  /** 目标日期 YYYY-MM-DD */
  targetDate: string;
  /** 创建日期 YYYY-MM-DD */
  createdAt: string;
}

/** 壁纸设置（localStorage `wallpaperSettings`） */
export interface WallpaperSettings {
  /** 模糊度 0-100 */
  blur: number;
  /** 遮罩透明度 0-100 */
  overlay: number;
}

/** 搜索引擎注册表 */
export const ENGINES: readonly SearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com', base: 'https://www.google.com/search?q=', iconName: 'google' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com', base: 'https://www.bing.com/search?q=', iconName: 'bing' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com', base: 'https://www.baidu.com/s?wd=', iconName: 'baidu' },
  { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com', base: 'https://www.zhihu.com/search?type=content&q=', iconName: 'zhihu' },
  { id: 'weibo', name: '微博', url: 'https://weibo.com', base: 'https://s.weibo.com/weibo?q=', iconName: 'weibo' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com', base: 'https://duckduckgo.com/?q=', iconName: 'duckduckgo' },
  { id: 'github', name: 'GitHub', url: 'https://github.com', base: 'https://github.com/search?q=', iconName: 'github' },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://www.bilibili.com', base: 'https://search.bilibili.com/all?keyword=', iconName: 'bilibili' },
  { id: 'yandex', name: 'Yandex', url: 'https://ya.ru/', base: 'https://ya.ru/search/?text=', iconName: 'yandex' },
  { id: 'gamer520', name: 'Gamer520', url: 'https://www.gamer520.com/', base: 'https://www.gamer520.com/?s=', iconName: 'gamer520' },
  { id: 'linuxdo', name: 'Linux.do', url: 'https://linux.do/', base: 'https://linux.do/search?q=', iconName: 'linuxdo' },
] as const;

/** 引擎查询辅助 */
export function getEngineById(id: EngineId): SearchEngine | null {
  return ENGINES.find((e) => e.id === id) ?? null;
}

/* ==========================================================================
 * v4 内容模型（冻结于 docs/v4/02-UI规格.md §13）
 * 卡片 = 对某个小组件定义的一次引用：位置与尺寸属于布局，config 属于内容。
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

/** 布局导出 / 导入文档（设置 → 数据与备份） */
export interface LayoutDoc {
  v: number;
  app: string;
  exportedAt: string;
  standard: ModePages;
  privacy: ModePages;
}

/** v4 搜索引擎定义（内置 12 个见 BUILTIN_ENGINES；可隐藏、可排序、可自定义） */
export interface EngineDef {
  id: string;
  name: string;
  /** 品牌色 */
  color: string;
  /** 字形（占位素材） */
  glyph: string;
  /** 拉丁字形（字号按 0.74 缩小） */
  latin?: boolean;
  /** 搜索地址（query 前拼） */
  base: string;
  /** 已隐藏（不出现在下拉 / 数字键 / 右键二级菜单） */
  hidden?: boolean;
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

/** 透明度与玻璃质感的六个可调区域（对应 --ga-* / --blur-*） */
export type GlassKey = 'card' | 'tile' | 'dock' | 'search' | 'panel' | 'menu';
export type GlassSettings = Record<GlassKey, number>;

/** 模式（标准 / 隐私各自独立页面集，极简只留搜索 + 时钟 + Dock） */
export type ViewMode = 'minimal' | 'standard' | 'privacy';

/** v4 界面设置（本地保存，云同步见 01 §5） */
export interface AppSettings {
  mode: ViewMode;
  labels: boolean;
  hideTop: boolean;
  hideSearch: boolean;
  mascot: boolean;
  engineId: string;
  openMode: 'link' | 'tab' | 'search';
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
  skinId: string;
  wallpaper: number;
}
