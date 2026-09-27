/**
 * 全局常量表（禁止魔法值）
 *
 * 集中定义业务常量：存储键、消息类型、交互阈值、缓存 TTL、玻璃质感换算系数等。
 * v3 的磁贴/分类存储键已随数据模型一并移除（03 文档 D13）。
 */

/** ===== 本地持久化（v4 文档单键整存整取，见 core/storage.ts） ===== */
/** v4 界面文档键（StoredDoc） */
export const DOC_KEY = 'thrilled:v4:doc' as const;
/** v3 → v4 一次性迁移标记键 */
export const MIGRATED_KEY = 'thrilled:v4:migrated' as const;

/** ===== 本地目录同步（File System Access，core/file-config.ts） ===== */
/** FileConfig IndexedDB 数据库名 */
export const FILECONFIG_DB_NAME = 'DevHomeFileConfig' as const;
/** FileConfig IndexedDB object store 名 */
export const FILECONFIG_DB_STORE = 'handles' as const;
/** DirectoryHandle 存储键 */
export const FILECONFIG_HANDLE_KEY = 'directoryHandle' as const;
/** 数据变更写盘防抖（ms） */
export const FILECONFIG_WRITE_DEBOUNCE_MS = 1000 as const;
/** 本地同步时自动创建的项目目录名（隐藏目录） */
export const APP_SYNC_DIR_NAME = '.ThrilledData' as const;

/** file-config 状态标记键（kv 存储） */
export const FC_KEYS = {
  /** 目录访问权限已授权缓存标记（命中则跳过每次启动的权限检查） */
  PERMISSION_CACHED: 'fc_permission_cached',
  /** 初始化设置完成标记 */
  INIT_SETUP_COMPLETED: 'fc_init_setup_completed',
  /** 首次配置本地目录的引导标记 */
  SYNC_DIR_PROMPTED: 'fc_sync_dir_prompted',
  /** 用户选择的父目录路径（用于显示） */
  PARENT_DIR_PATH: 'fc_parent_dir_path',
} as const;

/** ===== 壁纸 ===== */
/** 壁纸压缩目标宽度（px） */
export const WALLPAPER_MAX_WIDTH = 1920 as const;
/** 壁纸压缩质量 */
export const WALLPAPER_JPEG_QUALITY = 0.85 as const;
/** 上传大小上限（5MB） */
export const WALLPAPER_MAX_BYTES = 5 * 1024 * 1024;
/** 允许的壁纸 MIME 类型 */
export const WALLPAPER_ALLOWED_TYPES: readonly string[] = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
];

/** ===== 天气 ===== */
/** 天气缓存键 */
export const WEATHER_CACHE_KEY = 'tabpage_weather_cache' as const;
/** 天气缓存 TTL（30min） */
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
/** 定位超时（ms），超时降级北京坐标 */
export const GEO_TIMEOUT_MS = 5000 as const;

/** ===== 交互阈值 ===== */
/** 滚轮翻页冷却（ms） */
export const WHEEL_PAGE_COOLDOWN_MS = 450 as const;
/** 滚轮翻页最小位移（px） */
export const WHEEL_MIN_DELTA = 12 as const;
/** 搜索历史上限 */
export const SEARCH_HISTORY_LIMIT = 8 as const;
/** 卡片拖拽判定阈值（px，原型 4px） */
export const DRAG_THRESHOLD_PX = 4 as const;

/** ===== 玻璃质感换算（02 §6.4：alpha = 1 − 0.55×值，blur = 26px×值） ===== */
export const GLASS_ALPHA_FACTOR = 0.55 as const;
export const GLASS_BLUR_PX = 26 as const;
/** 遮罩超过该值时壁纸加轻模糊（原型行为） */
export const WALLPAPER_BLUR_COVER_THRESHOLD = 0.3 as const;
export const WALLPAPER_BLUR_PX = 6 as const;

/** ===== favicon 解析 ===== */
/** SW 解析 favicon 超时（ms） */
export const FAVICON_FETCH_TIMEOUT_MS = 4000 as const;
/** favicon 响应体积上限（10MB，防超大图） */
export const FAVICON_MAX_BYTES = 10 * 1024 * 1024;

/** ===== 消息类型（判别联合 type 常量） ===== */
export const MESSAGE_TYPE = {
  RESOLVE_FAVICON: 'RESOLVE_FAVICON',
} as const;
