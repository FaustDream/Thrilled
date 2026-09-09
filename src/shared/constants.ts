/**
 * 全局常量表（R14：禁止魔法值）
 *
 * 集中定义业务常量：存储键、消息类型、交互阈值、缓存 TTL 等。
 * 所有模块禁止在业务代码中散落裸数字/裸字符串，必须引用此处常量。
 */

/** ===== 主数据库（IndexedDB） ===== */
/** 业务主数据库名 */
export const APP_DB_NAME = 'ThrilledAppData' as const;
/** 业务主数据库版本 */
export const APP_DB_VERSION = 1 as const;
/** 通用键值 object store：所有业务数据按 key 拆分保存，便于后续扩展 store */
export const APP_DB_KV_STORE = 'kv' as const;
/** 本地同步时自动创建的项目目录名（隐藏目录，用于保存应用数据） */
export const APP_SYNC_DIR_NAME = '.ThrilledData' as const;

/** ===== 存储键（兼容旧 localStorage 前缀体系） ===== */
export const STORAGE_PREFIX = 'tabpage_' as const;

/** 业务存储键名（IndexedDB key；旧 localStorage 完整键 = STORAGE_PREFIX + key） */
export const LS_KEYS = {
  PAGES: 'pages',
  PAGE_NAMES: 'page_names',
  SEARCH_HISTORY: 'search_history',
  SHORTCUT_SIZE: 'shortcut_size',
  SHORTCUT_COLUMNS: 'shortcut_columns',
  AUTO_FOCUS: 'auto_focus',
  CATEGORY_MEMORY: 'category_memory',
  LAST_PAGE: 'last_page',
  CAT_ROW: 'cat_row',
  PAGE_TRANSITION: 'page_transition',
  ENGINE: 'engine',
  LINK_NEW_TAB_TILES: 'linkNewTab_tiles',
  LINK_NEW_TAB_SEARCH: 'linkNewTab_search',
  CONFIG_NICKNAME: 'config_nickname',
  SEARCH_RETAIN: 'search_retain',
  SEARCH_HIDE_BTN: 'search_hide_btn',
  /** 首次初始化标记（onboarding 已弹窗/已跳过） */
  ONBOARDED: 'tabpage_onboarded',
  /** 批量选择修饰键（ctrl / alt / ctrlShift） */
  BATCH_MODIFIER_KEY: 'batch_modifier_key',
  /** 主题设置 */
  THEME: 'theme',
  /** 首次配置本地目录的引导标记 */
  SYNC_DIR_PROMPTED: 'sync_dir_prompted',
  /** 搜索引擎显示顺序（EngineId 数组 JSON） */
  ENGINE_ORDER: 'engine_order',
  /** 用户选择的父目录路径（用于显示） */
  PARENT_DIR_PATH: 'parent_dir_path',
  /** 初始化设置完成标记（首次安装路径选择完成后设置） */
  INIT_SETUP_COMPLETED: 'init_setup_completed',
  /** 目录访问权限已授权缓存标记（命中则跳过每次启动的权限检查） */
  PERMISSION_CACHED: 'dir_permission_cached',
} as const;

/** 裸键（无前缀） */
export const RAW_KEYS = {
  COUNTDOWNS: 'countdowns',
  WALLPAPER_BG: 'wallpaper_bg',
  WALLPAPER_SETTINGS: 'wallpaper_settings',
  DAILY_GREETING_QUOTE: 'daily_greeting_card_quote',
  WEATHER_CACHE: 'tabpage_weather_cache',
  THEME_CARD: '_devhome_theme_card',
  LAST_MODE: '_devhome_last_mode',
} as const;

/** ===== 消息类型（R3：判别联合 type 常量） ===== */
export const MESSAGE_TYPE = {
  RESOLVE_FAVICON: 'RESOLVE_FAVICON',
} as const;

/** ===== 磁贴/分类交互阈值 ===== */
/** 磁贴长按进入拖拽的阈值（ms） */
export const TILE_LONG_PRESS_MS = 600;
/** 分类长按进入拖拽的阈值（ms） */
export const CATEGORY_LONG_PRESS_MS = 600;
/** 滚轮翻页累加阈值（px） */
export const WHEEL_PAGE_THRESHOLD = 25;
/** 滚轮翻页冷却（ms） */
export const WHEEL_PAGE_COOLDOWN_MS = 350;
/** 搜索历史上限 */
export const SEARCH_HISTORY_LIMIT = 20;
/** 搜索建议面板最近历史条数 */
export const SUGGESTION_HISTORY_LIMIT = 10;

/** ===== 尺寸/布局 ===== */
export const DEFAULT_SHORTCUT_SIZE = 'standard' as const;
export const DEFAULT_SHORTCUT_COLUMNS = '8' as const;

/** 快捷方式尺寸配置（容器宽/图标尺寸/间距/圆角/字号） */
export const SHORTCUT_SIZE_OPTIONS = {
  small: { size: 76, icon: 44, gap: 18, radius: 14, fontSize: 12 },
  standard: { size: 100, icon: 56, gap: 24, radius: 18, fontSize: 12 },
  large: { size: 124, icon: 68, gap: 28, radius: 22, fontSize: 14 },
} as const;

/** ===== 默认配置 ===== */
export const DEFAULT_NICKNAME = '主人';
export const DEFAULT_TILE_COLOR = '#4a9eff';
export const DEFAULT_ENGINE = 'google' as const;
export const DEFAULT_PAGE_NAME = '第1页';
export const DEFAULT_SETTINGS = {
  engine: DEFAULT_ENGINE,
  shortcutSize: DEFAULT_SHORTCUT_SIZE,
  shortcutColumns: DEFAULT_SHORTCUT_COLUMNS,
  autoFocus: false,
  categoryMemory: true,
  catRow: true,
  pageTransition: true,
  linkNewTabTiles: true,
  linkNewTabSearch: true,
  nickname: DEFAULT_NICKNAME,
  lastPage: 0,
  batchModifierKey: 'ctrlShift',
} as const;

/** ===== 文件同步 fileConfig ===== */
/** FileConfig IndexedDB 数据库名 */
export const FILECONFIG_DB_NAME = 'DevHomeFileConfig' as const;
/** FileConfig IndexedDB object store 名 */
export const FILECONFIG_DB_STORE = 'handles' as const;
/** DirectoryHandle 存储键 */
export const FILECONFIG_HANDLE_KEY = 'directoryHandle' as const;
/** 数据变更写盘防抖（ms） */
export const FILECONFIG_WRITE_DEBOUNCE_MS = 1000 as const;

/** ===== 壁纸 ===== */
export const WALLPAPER_DEFAULT_SETTINGS = { blur: 0, overlay: 30 } as const;
/** 壁纸压缩目标宽度（px） */
export const WALLPAPER_MAX_WIDTH = 1920;
/** 壁纸压缩质量 */
export const WALLPAPER_JPEG_QUALITY = 0.85;

/** ===== 时钟/问候 ===== */
export const COUNTDOWN_REFRESH_INTERVAL_MS = 60 * 1000;
export const GREETING_PERIODS = [
  { from: 5, to: 9, text: '早上好' },
  { from: 9, to: 12, text: '上午好' },
  { from: 12, to: 14, text: '中午好' },
  { from: 14, to: 18, text: '下午好' },
  { from: 18, to: 24, text: '晚上好' },
] as const;
/** 深夜问候（0-5 点） */
export const GREETING_NIGHT = '夜深了' as const;

/** ===== favicon 解析 ===== */
/** SW 解析 favicon 超时（ms） */
export const FAVICON_FETCH_TIMEOUT_MS = 4000;
/** favicon 响应体积上限（10MB，防超大图） */
export const FAVICON_MAX_BYTES = 10 * 1024 * 1024;
