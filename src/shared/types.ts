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
  | 'clock'
  | 'cal'
  | 'weather'
  | 'todo'
  | 'countdown'
  | 'fav'
  | 'icon'
  | 'folder'
  | 'group';

/** 卡片尺寸档位（单位数，1 单位 = 60px，仅六档） */
export interface SlotSize {
  w: number;
  h: number;
}

/**
 * 可编辑字段类型（对齐 Storybook argTypes 的 control 词汇，便于配置面板按类型自动出控件）：
 * text→input / num→number input / list→逗号分隔 input / bool→SwitchRow / sel→cats 胶囊 /
 * range→SliderRow / color→ColorField（后两者复用设置面板既有控件）
 */
export type WidgetFieldType = 'text' | 'num' | 'list' | 'bool' | 'sel' | 'range' | 'color';

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
  /** range 的取值区间与步长（数值型） */
  min?: number;
  max?: number;
  step?: number;
  /** range 的显示单位后缀（如 '%' / 'px'） */
  unit?: string;
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
  /** 尺寸能力下限（单位数，缺省 2×2）——入口据此过滤，避免出现显不下的卡片 */
  min?: SlotSize;
  /** 尺寸能力上限（单位数，缺省 8×4） */
  max?: SlotSize;
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
  pages: ModePages;
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
  /** 已隐藏（不出现在下拉 / 右键二级菜单） */
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
  /** 完整令牌集；缺省项回退 base 默认值 */
  tokens: Record<string, string>;
}

/* ==========================================================================
 * 设置与本地持久化文档
 * ========================================================================== */

/**
 * 透明度可调项（对应 --ga-*）。
 * 前六个是「玻璃底色」——有可读性下限，alpha = 1 − 0.55×值（见 GLASS_ALPHA_FACTOR）；
 * 后六个是「元素显隐强度」——alpha = 1 − 值，可一路调到完全透明。
 */
export type GlassKey =
  | 'card' | 'tile' | 'glyph' | 'dock' | 'dockIcon' | 'search'
  | 'panel' | 'menu' | 'clock' | 'line' | 'hover';
export type GlassSettings = Record<GlassKey, number>;

/** 毛玻璃模糊半径（px，0–20），与有玻璃底色的六个透明度项一一配对（对应 --blur-*） */
export type BlurKey = 'card' | 'tile' | 'dock' | 'search' | 'panel' | 'menu';
export type BlurSettings = Record<BlurKey, number>;

/** 壁纸自适应裁剪焦点：object-position 百分比（0–100）+ 算它时的视口宽高比 */
export interface WallFocus {
  x: number;
  y: number;
  /** 计算该焦点时的视口宽高比；0 = 尚未计算（视口比例变化超阈值会重算） */
  ratio: number;
}

/** 模式（单套页面集；极简只留搜索 + 时钟 + Dock） */
export type ViewMode = 'minimal' | 'standard';

/** 链接打开方式（link-opener 统一入口） */
export type OpenMode = 'link' | 'tab' | 'search';

/** Dock 快捷方式（name 为悬浮提示名，url 为打开地址与 favicon 来源） */
export interface DockApp {
  name: string;
  url: string;
}

/** v4 界面设置（本地持久化，云同步见 01 §5） */
export interface AppSettings {
  mode: ViewMode;
  labels: boolean;
  hideTop: boolean;
  hideSearch: boolean;
  mascot: boolean;
  /** 页面网格对齐线（添加 / 拖拽组件时辅助确认位置；拖拽中会强制显示） */
  gridLines: boolean;
  engineId: string;
  openMode: OpenMode;
  autoFocus: boolean;
  searchKeep: boolean;
  hideBtn: boolean;
  searchHistory: boolean;
  /** 自定义占位文字（空串 = 默认的「<引擎名> 搜索」） */
  searchPlaceholder: string;
  /** 隐藏搜索框左侧的引擎图标（隐藏后到设置或右键菜单里切换引擎） */
  hideEngineIco: boolean;
  /** 引擎图标点击行为：展开引擎下拉 / 切换到下一个已启用引擎 */
  engineIcoAct: 'panel' | 'cycle';
  /** 搜索历史保留条数（4–20） */
  historyLimit: number;
  /** 搜索框字号（px，13–20） */
  searchFontSize: number;
  /** 搜索框距顶距离（px，20–44；只能往上收——网格下方到 Dock 已排满） */
  searchTop: number;
  /** 回车打开方式（inherit = 跟随通用里的全局打开方式） */
  searchEnterMode: SearchOpenOverride;
  /** 点放大镜打开方式（同上） */
  searchBtnMode: SearchOpenOverride;
  /** 搜索后自动失焦（收起光标与历史面板） */
  blurAfterSearch: boolean;
  /** 历史面板显示单条删除按钮 */
  historyItemDel: boolean;
  searchWidth: number;
  searchRadius: number;
  dockCount: number;
  dockIcon: 'rect' | 'circle';
  /** Dock 快捷应用（用户手动新增；图标显示站点 favicon，右键可改名 / 改网址 / 移除） */
  dockApps: DockApp[];
  clockColor: string;
  glass: GlassSettings;
  /** 毛玻璃模糊半径（px，0–20）；与透明度分开设置，互不影响 */
  blur: BlurSettings;
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
  /** 自定义壁纸引用（IndexedDB id，`idb:` 前缀；null = 未设置壁纸） */
  wallpaperRef: string | null;
  /** 壁纸自适应裁剪焦点（按视口宽高比自动算出，保证主体不被居中裁掉） */
  wallFocus: WallFocus;
  /** 外部壁纸来源清单（用户自主添加；系统不内置任何壁纸资源） */
  wallSources: WallpaperSource[];
  /** 自定义快捷键（动作 id → 规范组合键，见 shared/shortcuts；空串 = 未设置） */
  shortcuts: Record<string, string>;
  /** 按组件类型的默认样式（新放置的实例继承；键为 WidgetKind，值为 shared/widget-style 的样式项） */
  styleDefaults: Record<string, WidgetStyle>;
  /**
   * 按组件类型的默认大小（组件库里逐个类型单独设置；新放置的实例按此落位，页面已有实例不变）。
   * 键为 WidgetKind，值为六档尺寸之一；缺键 = 用定义表的出厂尺寸。
   */
  sizeDefaults: Record<string, WidgetSize>;
}

/** 组件尺寸（网格单位数，取值见 shared/grid 的 SIZES 六档） */
export interface WidgetSize {
  w: number;
  h: number;
}

/**
 * 实例级样式（配置弹窗「样式」段；也用作某类组件的默认样式）。
 * 四个键的合法范围与归一化在 shared/widget-style：fontScale / iconScale 为 0.6–1.6 的比例，
 * radius 为 0–32px，textColor 为 #rrggbb（缺省即跟随主题）。
 */
export interface WidgetStyle {
  fontScale?: number;
  iconScale?: number;
  radius?: number;
  textColor?: string;
}

/** 搜索触发的打开方式覆盖：inherit = 跟随设置里的全局打开方式 */
export type SearchOpenOverride = 'inherit' | OpenMode;

/** 外部壁纸来源（协议适配器 + 用户可改的 API 基址） */
export interface WallpaperSource {
  id: string;
  /** 协议适配器（同构 API 可换镜像基址） */
  kind: 'wallhaven' | 'picsum' | 'bing' | 'wg061129' | 'zhefeng';
  name: string;
  /** API 基址（如 https://wallhaven.cc/api/v1） */
  apiBase: string;
  /** 启用状态：禁用的来源不在浏览面板显示 */
  enabled: boolean;
}

/** 本地持久化文档（chrome.storage 单键整存整取；快照式备份复用同一形状，01 §5.1）
 *  v3：单套页面（隐私模式已并入标准模式）；v2 旧文档（standard + privacy 双套）读取时自动合并迁移 */
export interface StoredDoc {
  v: 3;
  settings: AppSettings;
  pages: ModePages;
  engines: EngineDef[];
  skins: SkinPack[];
  history: string[];
  /** 首次访问欢迎弹窗已展示 */
  welcomed: boolean;
  /** 上次备份时间（本地记录） */
  backupTime: string | null;
}
