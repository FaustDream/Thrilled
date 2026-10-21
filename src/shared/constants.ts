/**
 * 全局常量表（禁止魔法值）
 *
 * 集中定义业务常量：存储键、消息类型、交互阈值、缓存 TTL、玻璃质感换算系数等。
 * v3 的磁贴/分类存储键已随数据模型一并移除（03 文档 D13）。
 */

/** ===== 本地持久化（v4 文档单键整存整取，见 core/storage.ts） ===== */
/** v4 界面文档键（StoredDoc） */
export const DOC_KEY = 'thrilled:v4:doc' as const;
/** 更新前自动备份的文档键（版本升级 / 快照覆盖前留一份，数据不丢） */
export const BACKUP_DOC_KEY = 'thrilled:v4:doc:backup' as const;
/** 已为哪个版本留过更新前备份（同一版本只备份一次，避免每次启动重复覆盖） */
export const BACKUP_VERSION_KEY = 'thrilled:v4:doc:backup-version' as const;
/** 当前扩展版本（随文档落盘，用于识别版本升级并自动备份） */
export const APP_VERSION = '4.97' as const;
/** v3 → v4 一次性迁移标记键 */
export const MIGRATED_KEY = 'thrilled:v4:migrated' as const;
/** 一次性布局修正标记键（v4.1 迁移的多图标页合并，store/hydrate） */
export const LAYOUT_MERGE_KEY = 'thrilled:v4:layout-merged' as const;
/** 一次性引擎修正标记键（v4.1 迁移补齐了未设置的内置引擎，恢复 v3 引擎清单） */
export const ENGINE_RESTORE_KEY = 'thrilled:v4:engine-restored' as const;
/** 一次性补种标记键（v4.94 给已有倒计时卡补上两条农历生日） */
export const BIRTHDAY_SEED_KEY = 'thrilled:v4:birthday-seeded' as const;

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
/** 外部壁纸下载落地上限（20MB，覆盖 4K 大图） */
export const WALLPAPER_EXT_MAX_BYTES = 20 * 1024 * 1024;
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
/** 跨页拖拽：指针进入舞台左右边缘多少像素内开始准备翻页（屏幕像素；另有「不超过舞台宽 15%」的上限，
 *  窄窗口下不至于把半屏都算成边缘） */
export const PAGE_EDGE_PX = 110 as const;
/** 跨页拖拽：在边缘带停留多久翻页（ms）；翻过后仍停在带内会继续翻下一页 */
export const PAGE_EDGE_MS = 600 as const;

/** ===== 透明度 / 毛玻璃换算（两者已解耦，分别由 settings.glass 与 settings.blur 驱动） ===== */
/** 玻璃底色的透气因子：alpha = 1 − 0.55×值（保留可读下限，滑到底不会消失） */
export const GLASS_ALPHA_FACTOR = 0.55 as const;
/** 有玻璃底色的透明度项——其余项按 alpha = 1 − 值 计算，可一路调到完全透明 */
export const GLASS_FADED_KEYS: readonly string[] = ['card', 'tile', 'dock', 'search', 'panel', 'menu'];
/** 毛玻璃模糊半径上限（px） */
export const BLUR_MAX_PX = 20 as const;
/** 壁纸历史保留张数（入库后淘汰更旧的，当前使用中的不删） */
export const WALLPAPER_HISTORY_LIMIT = 12 as const;
/** 视口宽高比相对上次计算值变化超过该比例时，重算裁剪焦点 */
export const WALLPAPER_FOCUS_RATIO_TOLERANCE = 0.03 as const;
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
  /** SW 代理 GET 请求（json 文本 / 图片 dataURL），绕过页面 CORS 限制 */
  FETCH_RESOURCE: 'FETCH_RESOURCE',
} as const;
