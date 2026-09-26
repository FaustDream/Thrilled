/**
 * 文件配置与数据持久化模块
 *
 * 功能：
 * 1. 首次启动强制选择数据目录，不能跳过
 * 2. 用户需手动创建名为 .ThrilledData 的文件夹后选择，程序不自动创建目录
 * 3. 使用 File System Access API，DirectoryHandle 持久化到 IndexedDB
 * 4. 刷新/重启后自动请求权限恢复访问，无需重复选择目录
 * 5. 选择目录时验证可写性和目录名
 * 6. 更改目录时弹出确认对话框，防止误操作导致数据丢失
 * 7. 设置界面清晰显示当前存储路径，并提供修改入口和重置功能
 * 8. 弹窗中提供文件夹名一键复制功能，方便用户手动创建
 *
 * 日志说明：关键节点均有详细日志，便于排查权限/路径问题
 */

// v4：UI 交互由 app 层注入
import { debug, error, info, warn } from './logger';
import {
  FILECONFIG_DB_NAME,
  FILECONFIG_DB_STORE,
  FILECONFIG_HANDLE_KEY,
  APP_SYNC_DIR_NAME,
  LS_KEYS,
  FILECONFIG_WRITE_DEBOUNCE_MS,
} from '../shared/constants';
import { collectAppSnapshot, localStorageService, onStorageChange, restoreAppSnapshot } from './storage';

/** 确认弹窗选项（对应原 dialogs.ConfirmOptions） */
export interface ConfirmOptions {
  title?: string;
  iconType?: 'info' | 'warning' | 'danger';
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/** Toast 类型 */
export type FileConfigToastType = 'success' | 'error' | 'warning' | 'info';

/** 文件配置模块 UI 回调（由 app 层注入） */
export interface FileConfigUI {
  /** 确认弹窗 → Promise<boolean>（true=确认） */
  showConfirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
  /** 自动消失通知 */
  showToast: (message: string, type: FileConfigToastType) => void;
  /** 自定义内容弹窗，返回关闭函数 */
  createModal: (title: string, bodyHTML: string, footerHTML?: string, onDismiss?: () => void) => () => void;
}

let ui: FileConfigUI = {
  showConfirm: () => Promise.resolve(false),
  showToast: () => {},
  createModal: () => () => {},
};

/** 注入 UI 回调（app 层提供 confirm / toast / modal 实现） */
export function setFileConfigUI(next: FileConfigUI): void {
  ui = next;
}

const MODULE = 'file-config';

/**
 * 本地目录配置恢复完成后的回调（由主程序注册）。
 * 当启动时从本地同步目录恢复数据写回存储后，主程序需要重新加载内存状态并重渲染，
 * 否则用户会看到空白——即「本地目录配置未被插件实际使用」。
 */
let onLocalDataRestored: (() => Promise<void> | void) | null = null;

/** 主程序注册本地配置恢复后的重渲染钩子 */
export function setOnLocalDataRestored(cb: () => Promise<void> | void): void {
  onLocalDataRestored = cb;
}

/**
 * 从任意抛出值中提取有意义的错误信息。
 * DOMException/Error 取 name + message；其他类型退回 String()。
 */
function getErrorInfo(e: unknown): { name: string; message: string } {
  if (e instanceof DOMException || e instanceof Error) {
    return { name: e.name || 'Error', message: e.message || String(e) };
  }
  return { name: 'UnknownError', message: String(e) };
}

/** 判断错误是否为权限/安全错误（需要重新授权） */
function isPermissionError(e: unknown): boolean {
  const name = (e as { name?: string })?.name;
  return name === 'SecurityError' || name === 'NotAllowedError';
}

/**
 * 判断错误是否为句柄状态失效（InvalidStateError）。
 * File System Access API 的 DirectoryHandle 在浏览器重启/扩展重载后，
 * 从旧会话恢复出的句柄内部状态与磁盘不一致，再次读写会抛此错。
 * 这类错误与权限失效等价：需要用户重新选择/授权目录才能恢复同步。
 */
function isStateError(e: unknown): boolean {
  return (e as { name?: string })?.name === 'InvalidStateError';
}

/** 句柄失效或权限失效，均需重新授权目录 */
function isHandleInvalid(e: unknown): boolean {
  return isPermissionError(e) || isStateError(e);
}

/** 判断错误是否为"文件/目录不存在"（正常情况，首次同步时出现） */
function isNotFoundError(e: unknown): boolean {
  return (e as { name?: string })?.name === 'NotFoundError';
}

/**
 * File System Access API 类型补充
 */
declare global {
  interface Window {
    showDirectoryPicker(options?: { mode: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

/** 数据类别 → 子目录/文件名/描述 */
interface CategoryLayout {
  dir: string;
  file: string;
  desc: string;
}

const DATA_LAYOUT: Readonly<Record<string, CategoryLayout>> = {
  tiles: { dir: 'tiles', file: 'tiles.json', desc: '磁贴与分类' },
  config: { dir: 'config', file: 'app.json', desc: '应用配置' },
  user: { dir: 'user', file: 'data.json', desc: '用户扩展数据' },
};

/** 测试文件名用于可写性验证 */
const WRITE_TEST_FILENAME = '.write_test';

/* ================= 内部状态 ================= */

let dirHandle: FileSystemDirectoryHandle | null = null;
let isReady = false;
let syncInProgress = false;
let lastSyncTime = 0;
let lastSyncError: string | null = null;
let dirHandleDB: IDBDatabase | null = null;
let writePermissionPending = false;
let startupRestorePromise: Promise<void> | null = null;
let initialSetupDone = false;
let permissionRequestInProgress = false;
let permissionDialogOpen = false;
let permissionDialogClose: (() => void) | null = null;
/** 防抖同步定时器 */
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** 同步中是否有新的数据变更需要再次同步 */
let pendingSync = false;

/* ================= IndexedDB Handle 持久化 ================= */

function openHandlesDB(): Promise<IDBDatabase> {
  if (dirHandleDB !== null) {
    debug(MODULE, 'IndexedDB 已连接，复用');
    return Promise.resolve(dirHandleDB);
  }
  debug(MODULE, '打开 IndexedDB...', { db: FILECONFIG_DB_NAME });
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILECONFIG_DB_NAME, 1);
    request.onerror = () => {
      error(MODULE, 'IndexedDB 打开失败', { err: request.error?.message });
      reject(request.error);
    };
    request.onsuccess = () => {
      dirHandleDB = request.result;
      info(MODULE, 'IndexedDB 已打开');
      resolve(dirHandleDB);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILECONFIG_DB_STORE)) {
        db.createObjectStore(FILECONFIG_DB_STORE);
        debug(MODULE, '创建 object store', { store: FILECONFIG_DB_STORE });
      }
    };
  });
}

async function saveHandleToDB(handle: FileSystemDirectoryHandle): Promise<void> {
  debug(MODULE, '保存目录句柄到 IndexedDB', { dir: handle.name });
  const db = await openHandlesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILECONFIG_DB_STORE, 'readwrite');
    tx.objectStore(FILECONFIG_DB_STORE).put(handle, FILECONFIG_HANDLE_KEY);
    tx.oncomplete = () => {
      info(MODULE, '目录句柄已保存');
      resolve();
    };
    tx.onerror = () => {
      error(MODULE, '保存句柄失败', { err: tx.error?.message });
      reject(tx.error);
    };
  });
}

async function loadHandleFromDB(): Promise<FileSystemDirectoryHandle | null> {
  debug(MODULE, '从 IndexedDB 加载目录句柄...');
  const db = await openHandlesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILECONFIG_DB_STORE, 'readonly');
    const req = tx.objectStore(FILECONFIG_DB_STORE).get(FILECONFIG_HANDLE_KEY);
    req.onsuccess = () => {
      const handle = (req.result as FileSystemDirectoryHandle | undefined) ?? null;
      info(MODULE, handle !== null ? `加载到句柄: ${handle.name}` : '无已保存句柄');
      resolve(handle);
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearHandleFromDB(): Promise<void> {
  debug(MODULE, '清除 IndexedDB 中保存的句柄');
  const db = await openHandlesDB();
  return new Promise((resolve) => {
    const tx = db.transaction(FILECONFIG_DB_STORE, 'readwrite');
    tx.objectStore(FILECONFIG_DB_STORE).delete(FILECONFIG_HANDLE_KEY);
    tx.oncomplete = () => {
      info(MODULE, '句柄已清除');
      resolve();
    };
    tx.onerror = () => {
      warn(MODULE, '清除句柄失败', { err: tx.error?.message });
      resolve();
    };
  });
}

/* ================= 权限管理 ================= */

async function verifyPermission(handle: FileSystemDirectoryHandle, withWrite: boolean, requestIfNeeded = false): Promise<boolean> {
  const mode = withWrite ? 'readwrite' : 'read';
  const opts = { mode } as const;
  const dirName = handle.name;
  try {
    debug(MODULE, `检查${withWrite ? '读写' : '只读'}权限`, { dir: dirName });
    let state: PermissionState;
    try {
      state = await handle.queryPermission(opts);
    } catch (queryErr) {
      // queryPermission 抛出异常通常意味着句柄已失效（如浏览器重启后 IndexedDB 中的句柄已不可用）
      const info = getErrorInfo(queryErr);
      warn(MODULE, `查询权限失败(${info.name})，句柄可能已失效：${info.message}`, { dir: dirName });
      return false;
    }
    if (state !== 'granted' && requestIfNeeded) {
      if (permissionRequestInProgress) {
        debug(MODULE, '已有权限请求在进行中，跳过');
        return false;
      }
      permissionRequestInProgress = true;
      info(MODULE, '权限未授予，弹出授权请求...', { dir: dirName, mode });
      try {
        state = await handle.requestPermission(opts);
      } catch (reqErr) {
        const info = getErrorInfo(reqErr);
        // requestPermission 在非用户手势上下文中调用会抛错（SecurityError）
        warn(MODULE, `请求权限异常(${info.name})：${info.message}`, { dir: dirName });
        return false;
      } finally {
        permissionRequestInProgress = false;
      }
    }
    const granted = state === 'granted';
    info(MODULE, `权限检查结果: ${withWrite ? '读写' : '只读'} ${granted ? '✓' : '✗'}`, { dir: dirName, state });
    return granted;
  } catch (e) {
    const info = getErrorInfo(e);
    warn(MODULE, `权限检查异常(${info.name})：${info.message}`, { dir: dirName });
    return false;
  }
}

/**
 * 验证目录是否可写：尝试创建临时文件并删除
 */
async function verifyDirectoryWritable(handle: FileSystemDirectoryHandle): Promise<boolean> {
  info(MODULE, '验证目录可写性...', { dir: handle.name });
  try {
    // 尝试创建一个临时测试文件
    const testFile = await handle.getFileHandle(WRITE_TEST_FILENAME, { create: true });
    const writable = await testFile.createWritable();
    await writable.write('write-test-' + Date.now());
    await writable.close();
    // 读取验证
    await testFile.getFile();
    // 删除测试文件
    await handle.removeEntry(WRITE_TEST_FILENAME);
    info(MODULE, '目录可写性验证 ✓ 成功', { dir: handle.name });
    return true;
  } catch (e) {
    const info = getErrorInfo(e);
    error(MODULE, `目录可写性验证 ✗ 失败(${info.name})：${info.message}`, { dir: handle.name });
    return false;
  }
}

/* ================= 目录验证 ================= */

async function hasProjectLayout(handle: FileSystemDirectoryHandle): Promise<boolean> {
  for (const layout of Object.values(DATA_LAYOUT)) {
    try {
      await handle.getDirectoryHandle(layout.dir, { create: false });
      return true;
    } catch { /* continue */ }
  }
  return false;
}

/**
 * 验证用户选择的目录：
 * - 如果已有数据结构，直接通过
 * - 如果目录名为 .ThrilledData，直接通过
 * - 否则提示用户确认（避免选错目录）
 */
async function validateSelectedDir(handle: FileSystemDirectoryHandle): Promise<{ valid: boolean; needConfirm?: boolean }> {
  info(MODULE, '[验证] 检查用户选择的目录...', { dirName: handle.name });

  // 已有数据结构 → 直接通过
  if (await hasProjectLayout(handle)) {
    info(MODULE, '[验证] 目录中已有数据结构，通过');
    return { valid: true };
  }

  // 目录名正好是 .ThrilledData → 通过
  if (handle.name === APP_SYNC_DIR_NAME) {
    info(MODULE, '[验证] 目录名正确，通过');
    return { valid: true };
  }

  // 目录名不对，需要用户确认
  warn(MODULE, '[验证] 目录名不是 .ThrilledData，需要用户确认', { dirName: handle.name });
  return { valid: true, needConfirm: true };
}

/* ================= 数据读写 ================= */

async function readCategoryFile(category: string): Promise<unknown> {
  if (dirHandle === null) return null;
  const layout = DATA_LAYOUT[category];
  if (layout === undefined) return null;
  try {
    const subDir = await dirHandle.getDirectoryHandle(layout.dir, { create: false });
    const fh = await subDir.getFileHandle(layout.file, { create: false });
    const content = await (await fh.getFile()).text();
    return JSON.parse(content);
  } catch (e) {
    if (isNotFoundError(e)) return null;
    throw e;
  }
}

async function writeCategoryFile(category: string, data: unknown): Promise<void> {
  if (dirHandle === null) throw new Error('目录未配置');
  const layout = DATA_LAYOUT[category];
  if (layout === undefined) throw new Error(`未知类别: ${category}`);
  const subDir = await dirHandle.getDirectoryHandle(layout.dir, { create: true });
  const fh = await subDir.getFileHandle(layout.file, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

interface ReadResult {
  data: Record<string, unknown> | null;
  /** 读取过程中遇到权限错误 */
  hasPermissionError: boolean;
}

async function readAllCategoryFiles(): Promise<ReadResult> {
  if (dirHandle === null) return { data: null, hasPermissionError: false };
  const data: Record<string, unknown> = {};
  let hasPermissionError = false;
  for (const cat of Object.keys(DATA_LAYOUT)) {
    try {
      const v = await readCategoryFile(cat);
      if (v !== null) data[cat] = v;
    } catch (e) {
      const info = getErrorInfo(e);
      if (isHandleInvalid(e)) hasPermissionError = true;
      warn(MODULE, `读取 ${DATA_LAYOUT[cat]?.desc ?? cat} 失败(${info.name})：${info.message}`);
    }
  }
  return {
    data: Object.keys(data).length > 0 ? data : null,
    hasPermissionError,
  };
}

async function restoreAllData(data: Record<string, unknown>): Promise<void> {
  restoreAppSnapshot(data);
  info(MODULE, '数据已恢复到应用', { cats: Object.keys(data) });
}

/* ================= 同步逻辑 ================= */

/**
 * 防抖调度文件同步：数据变更后延迟 FILECONFIG_WRITE_DEBOUNCE_MS 再写盘，
 * 避免频繁操作（拖拽排序、批量删除等）触发大量磁盘写入。
 * 同步进行中如果有新变更，标记 pendingSync，当前同步结束后立即再同步一次。
 */
function scheduleFileSync(): void {
  if (dirHandle === null || writePermissionPending || !isReady) return;
  if (syncInProgress) {
    pendingSync = true;
    return;
  }
  if (syncDebounceTimer !== null) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    void syncToFile(false);
  }, FILECONFIG_WRITE_DEBOUNCE_MS);
}

async function syncToFile(force = false): Promise<void> {
  if (!isReady || syncInProgress || dirHandle === null || writePermissionPending) {
    debug(MODULE, '同步跳过', { ready: isReady, busy: syncInProgress, hasHandle: dirHandle !== null, pendingPerm: writePermissionPending });
    return;
  }
  syncInProgress = true;
  pendingSync = false;
  lastSyncError = null; // 清除之前的错误状态
  const failedCategories: string[] = [];
  let hadPermissionError = false;
  info(MODULE, `[同步] 开始${force ? '强制' : ''}同步...`);
  try {
    const data = collectAppSnapshot();
    let ok = 0;
    for (const cat of Object.keys(DATA_LAYOUT)) {
      if (data[cat] === undefined) continue;
      const layout = DATA_LAYOUT[cat];
      if (layout === undefined) continue;
      try {
        await writeCategoryFile(cat, data[cat]);
        ok++;
      } catch (e) {
        const errInfo = getErrorInfo(e);
        if (isHandleInvalid(e)) {
          hadPermissionError = true;
          // 查询权限状态（不自动请求，因为可能不在用户手势上下文中）
          const hasPerm = await verifyPermission(dirHandle, true, false);
          if (!hasPerm) {
            // 权限/句柄确实失效了，标记为待授权并中断后续写入
            warn(MODULE, `写入失败(${errInfo.name})：${errInfo.message}，目录需要重新授权`);
            writePermissionPending = true;
            localStorageService.remove(LS_KEYS.PERMISSION_CACHED);
            failedCategories.push(layout.desc);
            break;
          }
          // 权限正常但仍写入失败，重试一次（可能是瞬态错误）
          try {
            await writeCategoryFile(cat, data[cat]);
            ok++;
            continue;
          } catch (retryErr) {
            const retryInfo = getErrorInfo(retryErr);
            if (isHandleInvalid(retryErr)) hadPermissionError = true;
            warn(MODULE, `重试写入仍失败(${retryInfo.name})：${retryInfo.message}`);
          }
        } else {
          warn(MODULE, `写入失败(${errInfo.name})：${errInfo.message}`);
        }
        failedCategories.push(layout.desc);
        error(MODULE, `写入失败: ${layout.desc} (${errInfo.name}: ${errInfo.message})`);
      }
    }
    lastSyncTime = Date.now();
    if (failedCategories.length > 0) {
      lastSyncError = `${failedCategories.length}个分类写入失败: ${failedCategories.join(', ')}`;
      warn(MODULE, `[同步部分失败] ${ok}/${Object.keys(DATA_LAYOUT).length} 个分类已同步，失败: ${failedCategories.join(', ')}`);
      // 如果因为权限错误导致失败，显示一键授权弹窗
      if (hadPermissionError && !permissionDialogOpen) {
        setTimeout(() => showPermissionRequestDialog(), 300);
      }
    } else {
      info(MODULE, `[同步完成] ${ok}/${Object.keys(DATA_LAYOUT).length} 个分类已同步`);
      // 同步成功说明权限有效，更新缓存
      localStorageService.setRaw(LS_KEYS.PERMISSION_CACHED, '1');
    }
    updateStatusUI();
  } catch (e) {
    const errInfo = getErrorInfo(e);
    lastSyncError = errInfo.message || '同步失败';
    error(MODULE, `[同步失败] (${errInfo.name}): ${errInfo.message}`);
  } finally {
    syncInProgress = false;
    // 如果同步过程中有新数据变更，且不是因为权限问题中断的，立即再执行一次
    if (pendingSync && !writePermissionPending) {
      pendingSync = false;
      void syncToFile(false);
    }
  }
}

/** 页面卸载前立即刷盘（不走防抖） */
function handleBeforeUnload(): void {
  if (syncDebounceTimer !== null) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  void syncToFile(true);
}

/* ================= UI 状态 ================= */

function getCurrentPathDisplay(): string {
  if (dirHandle === null) return '未配置数据目录';
  return dirHandle.name;
}

function updateStatusUI(): void {
  const dirLabel = document.getElementById('configDirLabel');
  const syncBtn = document.getElementById('configSyncBtn');
  const changeBtn = document.getElementById('configChangeDirBtn');
  const authBtn = document.getElementById('configAuthBtn');
  const status = document.getElementById('configSyncStatus');
  const pathDisplay = document.getElementById('configCurrentPath');

  const hasDir = dirHandle !== null;
  const pathText = getCurrentPathDisplay();

  if (dirLabel !== null) {
    dirLabel.textContent = hasDir ? '更改数据目录' : '选择数据目录';
  }
  if (changeBtn !== null) {
    changeBtn.title = pathText;
  }
  if (pathDisplay !== null) {
    pathDisplay.textContent = pathText;
    pathDisplay.title = pathText;
  }
  // 同步按钮：有目录且有权限时显示
  if (syncBtn !== null) {
    syncBtn.style.display = hasDir && !writePermissionPending ? '' : 'none';
  }
  // 授权按钮：有目录但权限待定时显示
  if (authBtn !== null) {
    authBtn.style.display = hasDir && writePermissionPending ? '' : 'none';
  }
  if (status !== null) {
    if (writePermissionPending && hasDir) {
      status.textContent = '⚠ 需要重新授权目录访问权限';
      status.style.color = 'var(--color-warning)';
    } else if (lastSyncError !== null) {
      status.textContent = `同步失败：${lastSyncError}`;
      status.style.color = 'var(--color-danger)';
    } else if (lastSyncTime > 0) {
      status.textContent = `上次同步：${new Date(lastSyncTime).toLocaleTimeString()}`;
      status.style.color = '';
    } else {
      status.textContent = hasDir ? '已就绪' : '请先选择数据保存目录';
      status.style.color = '';
    }
  }
}

/**
 * 显示路径选择帮助
 */
function showPathHelp(): void {
  const close = ui.createModal(
    '📁 如何设置数据保存目录',
    `<div class="ui-dialog-body" style="line-height:1.8;">
      <p style="margin-bottom:12px;"><strong>请按照以下步骤手动创建数据文件夹：</strong></p>

      <div style="margin:12px 0;padding:12px;background:var(--color-bg-secondary);border-radius:8px;border:1px solid var(--color-border);">
        <p style="margin:0 0 8px 0;font-weight:500;">文件夹名称（请复制）：</p>
        <div style="display:flex;gap:8px;align-items:center;">
          <code id="folderNameToCopy" style="flex:1;padding:8px 12px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:6px;font-size:var(--font-size-md);font-weight:600;user-select:all;">${APP_SYNC_DIR_NAME}</code>
          <button type="button" class="ui-btn ui-btn-primary" id="copyFolderNameBtn" style="white-space:nowrap;">📋 复制</button>
        </div>
      </div>

      <p style="font-weight:500;margin-top:16px;">操作步骤：</p>
      <ol style="padding-left:22px;margin:8px 0;">
        <li>最小化浏览器，回到<strong>桌面</strong></li>
        <li>在桌面空白处<strong>右键 → 新建 → 文件夹</strong></li>
        <li>点击上面的"📋 复制"按钮复制文件夹名</li>
        <li>将新建的文件夹<strong>重命名</strong>，粘贴刚才复制的名称 <code>${APP_SYNC_DIR_NAME}</code></li>
        <li>回到扩展，点击"选择数据目录"按钮</li>
        <li>在弹出的对话框中，点击左侧<strong>"桌面"</strong>，找到并选中你刚创建的 <code>${APP_SYNC_DIR_NAME}</code> 文件夹</li>
        <li>点击"选择文件夹"按钮</li>
      </ol>

      <div style="margin-top:14px;padding:10px;background:var(--warning-bg,#fef3c7);border-radius:6px;font-size:var(--font-size-sm);color:var(--warning,#92400e);">
        ⚠ <strong>重要提示</strong>：<br>
        • 文件夹名称必须是 <code>${APP_SYNC_DIR_NAME}</code>（注意前面有个点）<br>
        • 请务必手动创建，不要选择系统文件夹（如用户根目录、文档等）<br>
        • 如果选错了目录，可点击"重置目录配置"后重新操作
      </div>
    </div>`,
    `<button type="button" class="ui-btn ui-btn-primary" data-help-close>我知道了</button>`,
  );

  // 绑定复制按钮
  const copyBtn = document.getElementById('copyFolderNameBtn');
  const nameEl = document.getElementById('folderNameToCopy') as HTMLElement & { select: () => void };
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(APP_SYNC_DIR_NAME);
      copyBtn.textContent = '✅ 已复制';
      setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 2000);
    } catch {
      // fallback: 选中文字让用户手动复制
      const range = document.createRange();
      if (nameEl) {
        range.selectNodeContents(nameEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      document.execCommand('copy');
      copyBtn.textContent = '✅ 已复制';
      setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 2000);
    }
  });

  document.querySelector<HTMLButtonElement>('[data-help-close]')?.addEventListener('click', close);
}

/* ================= 核心目录选择流程 ================= */

/**
 * 内部目录选择逻辑（不包含确认对话框）
 */
async function selectDirectoryInternal(forceNew = false): Promise<boolean> {
  info(MODULE, '========== [目录选择] 开始 ==========', { forceNew });

  if (typeof window.showDirectoryPicker !== 'function') {
    error(MODULE, '浏览器不支持 showDirectoryPicker (需 Chrome 86+)');
    ui.showToast('当前浏览器不支持目录选择，请升级到 Chrome 86+', 'error');
    return false;
  }

  try {
    info(MODULE, '弹出系统目录选择对话框...');
    const selectedHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    info(MODULE, '用户已选择目录', { dirName: selectedHandle.name });

    // 验证读权限
    const canRead = await verifyPermission(selectedHandle, false, true);
    if (!canRead) {
      error(MODULE, '无目录读权限，用户可能拒绝了授权');
      ui.showToast('需要授权目录访问权限才能保存数据', 'error');
      return false;
    }

    // 验证目录
    const validation = await validateSelectedDir(selectedHandle);
    if (!validation.valid) {
      return false;
    }

    // 如果目录名不对，提示用户确认
    if (validation.needConfirm) {
      warn(MODULE, '目录名不是 .ThrilledData，请求用户确认');
      const confirmed = await ui.showConfirm(
        `<p>你选择的文件夹名称是 <code style="background:var(--color-bg-secondary);padding:2px 6px;border-radius:4px;">${selectedHandle.name}</code>，不是推荐的 <code style="background:var(--color-bg-secondary);padding:2px 6px;border-radius:4px;">${APP_SYNC_DIR_NAME}</code>。</p>
        <p style="margin-top:8px;">确认要使用此文件夹保存数据吗？建议点击"取消"，按照帮助提示手动创建名为 <code>${APP_SYNC_DIR_NAME}</code> 的文件夹后再选择。</p>`,
        {
          title: '⚠ 文件夹名称确认',
          iconType: 'warning',
          confirmText: '确认使用此文件夹',
          cancelText: '取消，重新选择',
        },
      );
      if (!confirmed) {
        info(MODULE, '用户取消了非标准目录的确认');
        return false;
      }
    }

    // 验证写权限
    const canWrite = await verifyPermission(selectedHandle, true, true);
    if (!canWrite) {
      error(MODULE, '无数据目录写权限');
      ui.showToast('没有目录写入权限，请选择其他位置', 'error');
      return false;
    }

    // 验证可写性（实际写入测试文件）
    const writable = await verifyDirectoryWritable(selectedHandle);
    if (!writable) {
      ui.showToast('该目录不可写，请选择你手动创建的用户文件夹', 'error');
      return false;
    }

    // 更新状态
    dirHandle = selectedHandle;
    isReady = true;
    writePermissionPending = false;

    // 保存配置
    localStorageService.setRaw(LS_KEYS.PARENT_DIR_PATH, selectedHandle.name);
    localStorageService.setRaw(LS_KEYS.SYNC_DIR_PROMPTED, '1');
    localStorageService.setRaw(LS_KEYS.INIT_SETUP_COMPLETED, '1');
    localStorageService.setRaw(LS_KEYS.PERMISSION_CACHED, '1');
    await saveHandleToDB(selectedHandle);

    // 读取已有数据或写入初始数据
    info(MODULE, '检查目录中是否有已有数据...');
    const { data: existingData } = await readAllCategoryFiles();
    if (existingData !== null && !forceNew) {
      info(MODULE, '检测到已有数据，正在恢复...');
      await restoreAllData(existingData);
      ui.showToast(`已连接到现有数据目录：${selectedHandle.name}`, 'success');
    } else {
      info(MODULE, '写入当前数据到目录...');
      await syncToFile(true);
      ui.showToast(`数据目录设置完成：${selectedHandle.name}`, 'success');
    }

    updateStatusUI();
    info(MODULE, '========== [目录选择] 成功 ==========', {
      dataDir: selectedHandle.name,
      path: getCurrentPathDisplay(),
    });
    return true;
  } catch (e) {
    const errInfo = getErrorInfo(e);
    if (errInfo.name === 'AbortError') {
      info(MODULE, '用户取消了目录选择');
      return false;
    }
    error(MODULE, `========== [目录选择] 失败(${errInfo.name})：${errInfo.message} ==========`);
    // 常见错误的友好提示
    const errMsg = errInfo.message || '';
    if (errInfo.name === 'SecurityError' || errInfo.name === 'NotAllowedError') {
      if (errMsg.includes('系统') || errMsg.includes('system') || errMsg.includes('protected')) {
        ui.showToast('该目录包含系统保护文件，请选择你手动创建的文件夹', 'error');
      } else {
        ui.showToast('权限被拒绝，请选择你手动创建的文件夹并授予访问权限', 'error');
      }
    } else if (errMsg.includes('系统') || errMsg.includes('无法访问') || errMsg.includes('access')) {
      ui.showToast('无法访问该目录，请选择你手动创建的新文件夹', 'error');
    } else {
      ui.showToast(`目录选择失败：${errMsg}。建议按帮助步骤手动创建文件夹`, 'error');
    }
    return false;
  }
}

/**
 * 对外暴露的目录选择接口：
 * - 如果已有目录配置，更改前弹出确认对话框
 * - 防止误操作导致数据丢失
 */
export async function selectSyncDir(): Promise<boolean> {
  // 如果已有配置，需要确认
  if (dirHandle !== null) {
    const confirmed = await ui.showConfirm(
      '更改数据目录后，当前目录下的数据不会自动迁移。新目录将使用当前数据创建新的数据文件。确定要更改吗？',
      {
        title: '⚠ 更改数据目录',
        iconType: 'warning',
        confirmText: '确认更改',
        cancelText: '取消',
        danger: true,
      },
    );
    if (!confirmed) {
      info(MODULE, '用户取消了目录更改');
      return false;
    }
  }
  const success = await selectDirectoryInternal(dirHandle !== null);
  // 如果用户取消选择且之前有配置，保持原配置不变
  return success;
}

/**
 * 请求目录权限（刷新后调用）
 */
export async function requestDirectoryPermission(): Promise<boolean> {
  if (dirHandle === null) return false;
  info(MODULE, '请求目录访问权限...');
  const granted = await verifyPermission(dirHandle, true, true);
  if (granted) {
    writePermissionPending = false;
    localStorageService.setRaw(LS_KEYS.PERMISSION_CACHED, '1');
    ui.showToast('目录访问权限已恢复', 'success');
    // 关闭权限弹窗（如果是从弹窗触发的，弹窗自己的回调也会关闭；从设置按钮触发的则需要这里关闭）
    if (permissionDialogClose !== null) {
      permissionDialogClose();
    }
    // 权限恢复后执行一次同步
    await syncToFile(true);
  } else {
    warn(MODULE, '用户拒绝了权限请求');
    ui.showToast('未授予目录权限，数据无法保存', 'error');
  }
  updateStatusUI();
  return granted;
}

/**
 * 显示一键授权弹窗
 * 当检测到目录权限已失效（如浏览器重启后）时调用。
 * 必须通过用户点击按钮来触发 requestPermission()（浏览器安全策略要求），
 * 不能用 setTimeout 等非用户手势方式调用。
 */
function showPermissionRequestDialog(): void {
  if (permissionDialogOpen || dirHandle === null) return;
  permissionDialogOpen = true;
  info(MODULE, '显示一键授权弹窗');

  const dirName = dirHandle.name;

  // 关闭时的统一清理（无论通过何种方式关闭：一键授权成功、稍后再说、X按钮、Esc、遮罩点击）
  const cleanup = (): void => {
    permissionDialogOpen = false;
    permissionDialogClose = null;
  };

  const close = ui.createModal(
    '🔒 需要目录访问授权',
    `<div class="ui-dialog-body">
      <p style="margin-top:0;">浏览器已收回对数据目录的访问权限，需要你重新授权才能继续同步数据。</p>
      <div style="margin:14px 0;padding:12px;background:var(--color-bg-secondary);border-radius:8px;border:1px solid var(--color-border);">
        <p style="margin:0 0 4px 0;font-size:var(--font-size-sm);color:var(--color-text-secondary);">数据目录：</p>
        <p style="margin:0;font-weight:600;font-size:var(--font-size-md);word-break:break-all;">${dirName}</p>
      </div>
      <p style="margin:0;font-size:var(--font-size-sm);color:var(--color-text-secondary);">
        点击下方「一键授权」按钮，在浏览器弹出的系统对话框中点击「允许」即可。
      </p>
      <p id="permDialogError" style="display:none;margin:10px 0 0 0;padding:8px 12px;background:rgba(239,68,68,0.08);border:1px solid var(--color-danger);border-radius:6px;font-size:var(--font-size-sm);color:var(--color-danger);"></p>
    </div>`,
    `<button type="button" class="ui-btn ui-btn-outline" data-perm-later>稍后再说</button>
     <button type="button" class="ui-btn ui-btn-primary" data-perm-auth style="min-width:120px;">
       <svg class="dh-icon dh-icon--sm" style="vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
       一键授权
     </button>`,
    cleanup,
  );
  permissionDialogClose = close;

  const authBtn = document.querySelector<HTMLButtonElement>('[data-perm-auth]');
  const laterBtn = document.querySelector<HTMLButtonElement>('[data-perm-later]');
  const errorEl = document.getElementById('permDialogError');

  authBtn?.focus();

  authBtn?.addEventListener('click', async () => {
    if (authBtn === null) return;
    const originalHTML = authBtn.innerHTML;
    authBtn.disabled = true;
    authBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;vertical-align:middle;margin-right:4px;"></span>授权中...';

    const granted = await requestDirectoryPermission();

    if (granted) {
      close();
    } else {
      // 用户拒绝了系统授权，恢复按钮状态并显示错误提示
      authBtn.disabled = false;
      authBtn.innerHTML = originalHTML;
      if (errorEl !== null) {
        errorEl.style.display = 'block';
        errorEl.textContent = '授权被拒绝，请点击「一键授权」再次尝试，或在设置中重新选择目录。';
      }
    }
  });

  laterBtn?.addEventListener('click', () => {
    info(MODULE, '用户选择稍后授权');
    close();
  });
}

/**
 * 重置目录配置（清除保存的句柄）
 */
export async function resetDirectoryConfig(): Promise<void> {
  const confirmed = await ui.showConfirm(
    '这将清除保存的目录配置，你需要重新选择数据目录。确定吗？',
    { title: '重置目录配置', iconType: 'danger', danger: true, confirmText: '确认重置' },
  );
  if (!confirmed) return;
  dirHandle = null;
  writePermissionPending = false;
  lastSyncTime = 0;
  lastSyncError = null;
  await clearHandleFromDB();
  localStorageService.remove(LS_KEYS.PERMISSION_CACHED);
  localStorageService.setRaw(LS_KEYS.INIT_SETUP_COMPLETED, '0');
  localStorageService.setRaw(LS_KEYS.SYNC_DIR_PROMPTED, '0');
  localStorageService.setRaw(LS_KEYS.PARENT_DIR_PATH, '');
  updateStatusUI();
  ui.showToast('目录配置已重置，请重新选择数据目录', 'info');
}

/* ================= 首次强制设置 ================= */

async function showInitialSetupDialog(): Promise<void> {
  if (initialSetupDone) return;
  initialSetupDone = true;
  info(MODULE, '显示初始设置对话框（强制选择目录）');

  const close = ui.createModal(
    '⚙ 欢迎使用 Thrilled - 数据目录设置',
    `<div class="ui-dialog-body">
      <p>请先<strong>手动创建</strong>一个数据文件夹，然后选择它。程序不会自动创建文件夹。</p>

      <div style="margin:14px 0;padding:12px;background:var(--color-bg-secondary);border-radius:8px;border:1px solid var(--color-border);">
        <p style="margin:0 0 8px 0;font-weight:500;">📂 文件夹名称：</p>
        <div style="display:flex;gap:8px;align-items:center;">
          <code id="initFolderName" style="flex:1;padding:8px 12px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:6px;font-size:var(--font-size-md);font-weight:600;user-select:all;">${APP_SYNC_DIR_NAME}</code>
          <button type="button" class="ui-btn ui-btn-primary" id="initCopyBtn" style="white-space:nowrap;">📋 复制</button>
        </div>
      </div>

      <div style="margin:12px 0;">
        <p style="margin:0 0 8px 0;font-weight:500;">快速操作：</p>
        <ol style="margin:0;padding-left:22px;font-size:var(--font-size-sm);line-height:1.8;">
          <li>最小化浏览器，在桌面<strong>新建文件夹</strong></li>
          <li>将文件夹重命名为 <code>${APP_SYNC_DIR_NAME}</code>（点击复制按钮）</li>
          <li>回到扩展，点击下方按钮选择该文件夹</li>
        </ol>
        <p style="margin:10px 0 0 0;font-size:var(--font-size-sm);">
          <button type="button" class="ui-link" data-init-help>📖 查看详细图文步骤</button>
        </p>
      </div>

      <div style="padding:10px;background:var(--warning-bg,#fef3c7);border-radius:6px;font-size:var(--font-size-sm);color:var(--warning,#92400e);">
        ⚠ 文件夹名必须是 <code>${APP_SYNC_DIR_NAME}</code>（开头有个点）。不要选择系统文件夹！
      </div>

      <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin:10px 0 0 0;">
        🔒 数据仅保存在本地，不会上传。
      </p>
    </div>`,
    `<button type="button" class="ui-btn ui-btn-primary" data-init-select style="width:100%;">
      <svg class="dh-icon dh-icon--folder dh-icon--sm" style="vertical-align:middle;margin-right:6px;" role="img"><use href="#dh-icon-folder"></use></svg>
      选择 ${APP_SYNC_DIR_NAME} 文件夹
    </button>`,
  );

  // 注意：不提供"稍后"按钮，强制用户必须选择
  const selectBtn = document.querySelector<HTMLButtonElement>('[data-init-select]');
  const helpBtn = document.querySelector<HTMLButtonElement>('[data-init-help]');
  const copyBtn = document.getElementById('initCopyBtn');
  const nameEl = document.getElementById('initFolderName') as HTMLElement & { select: () => void };

  selectBtn?.focus();

  // 复制按钮
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(APP_SYNC_DIR_NAME);
      copyBtn.textContent = '✅ 已复制';
      setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 2000);
    } catch {
      const range = document.createRange();
      if (nameEl) {
        range.selectNodeContents(nameEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      document.execCommand('copy');
      copyBtn.textContent = '✅ 已复制';
      setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 2000);
    }
  });

  selectBtn?.addEventListener('click', async () => {
    close();
    const success = await selectDirectoryInternal();
    if (!success) {
      // 用户取消了，再次弹出（必须选择）
      initialSetupDone = false;
      setTimeout(() => void showInitialSetupDialog(), 300);
    }
  });

  helpBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    showPathHelp();
  });
}

function shouldShowInitialSetup(): boolean {
  const initDone = localStorageService.getRaw(LS_KEYS.INIT_SETUP_COMPLETED) === '1';
  const hasHandle = dirHandle !== null;
  const should = !initDone && !hasHandle;
  debug(MODULE, '检查是否需要初始设置', { initDone, hasHandle, should });
  return should;
}

/* ================= 启动恢复 ================= */

async function restoreHandleOnStartup(): Promise<void> {
  info(MODULE, '========== [启动] 恢复文件配置 ==========');

  if (typeof window.showDirectoryPicker !== 'function') {
    warn(MODULE, '浏览器不支持 File System Access API');
    isReady = true;
    updateStatusUI();
    return;
  }

  // 尝试加载已保存的句柄
  const handle = await loadHandleFromDB();
  if (handle === null) {
    info(MODULE, '[启动] 无已保存句柄，等待用户选择目录');
    isReady = true;
    updateStatusUI();
    return;
  }

  dirHandle = handle;
  isReady = true;

  // 保存正确的目录名到localStorage（覆盖可能的旧值）
  localStorageService.setRaw(LS_KEYS.PARENT_DIR_PATH, handle.name);

  // 权限缓存命中：仍然先做一次轻量级 queryPermission 校验（不需要用户手势，很快）
  // 防止浏览器重启后权限已被回收但缓存标记仍为 '1' 的情况
  let hasValidPermission = false;
  if (localStorageService.getRaw(LS_KEYS.PERMISSION_CACHED) === '1') {
    debug(MODULE, '[启动] 命中权限缓存，验证权限是否仍有效...');
    hasValidPermission = await verifyPermission(handle, true, false);
    if (!hasValidPermission) {
      // 缓存已失效，清除标记并继续走正常权限检查流程
      warn(MODULE, '[启动] 权限缓存已失效，需要重新授权');
      localStorageService.remove(LS_KEYS.PERMISSION_CACHED);
    }
  }

  // 权限有效（缓存验证通过），直接读取数据
  if (hasValidPermission) {
    writePermissionPending = false;
    info(MODULE, '[启动] 权限验证通过，读取数据...');
    const { data: existingData, hasPermissionError } = await readAllCategoryFiles();
    if (hasPermissionError) {
      // 读取时仍然遇到权限错误，说明句柄可能已失效
      warn(MODULE, '[启动] 读取数据时遇到权限错误，需要重新授权');
      localStorageService.remove(LS_KEYS.PERMISSION_CACHED);
      writePermissionPending = true;
      localStorageService.setRaw(LS_KEYS.SYNC_DIR_PROMPTED, '1');
      localStorageService.setRaw(LS_KEYS.INIT_SETUP_COMPLETED, '1');
      updateStatusUI();
      setTimeout(() => showPermissionRequestDialog(), 300);
      info(MODULE, '========== [启动] 需要重新授权 ==========', { dir: handle.name });
      return;
    }
    if (existingData !== null) {
      await restoreAllData(existingData);
      info(MODULE, '[启动] 已从文件恢复数据');
      // 通知主程序：本地目录配置已写回存储，需重新加载并渲染
      await onLocalDataRestored?.();
    } else {
      await syncToFile(true);
      info(MODULE, '[启动] 目录为空，已写入当前数据');
    }
    localStorageService.setRaw(LS_KEYS.SYNC_DIR_PROMPTED, '1');
    localStorageService.setRaw(LS_KEYS.INIT_SETUP_COMPLETED, '1');
    updateStatusUI();
    info(MODULE, '========== [启动] 配置恢复完成（权限缓存） ==========', { dir: handle.name });
    return;
  }

  // 检查权限（首次安装或缓存失效时执行）
  info(MODULE, '[启动] 检查目录权限...');
  const canRead = await verifyPermission(handle, false);

  if (!canRead) {
    // 读权限都没有，需要用户通过点击按钮来授权
    info(MODULE, '[启动] 无读权限，显示一键授权弹窗');
    writePermissionPending = true;
    localStorageService.setRaw(LS_KEYS.SYNC_DIR_PROMPTED, '1');
    localStorageService.setRaw(LS_KEYS.INIT_SETUP_COMPLETED, '1');
    updateStatusUI();
    // 延迟一下显示弹窗，等首屏渲染完成
    setTimeout(() => showPermissionRequestDialog(), 300);
    return;
  }

  // 有读权限，检查写权限（仅查询，不自动请求——requestPermission 需要用户手势）
  const canWrite = await verifyPermission(handle, true);
  writePermissionPending = !canWrite;

  if (canWrite) {
    // 权限恢复成功，写入缓存标记，下次启动可快速路径
    localStorageService.setRaw(LS_KEYS.PERMISSION_CACHED, '1');
    info(MODULE, '[启动] 权限正常，读取数据...');
    const { data: existingData } = await readAllCategoryFiles();
    if (existingData !== null) {
      await restoreAllData(existingData);
      info(MODULE, '[启动] 已从文件恢复数据');
      // 通知主程序：本地目录配置已写回存储，需重新加载并渲染
      await onLocalDataRestored?.();
    } else {
      await syncToFile(true);
      info(MODULE, '[启动] 目录为空，已写入当前数据');
    }
  } else {
    // 写权限未授予，显示一键授权弹窗（用户点击按钮后在用户手势中 requestPermission）
    warn(MODULE, '[启动] 无写权限，显示一键授权弹窗');
    setTimeout(() => showPermissionRequestDialog(), 300);
  }

  localStorageService.setRaw(LS_KEYS.SYNC_DIR_PROMPTED, '1');
  localStorageService.setRaw(LS_KEYS.INIT_SETUP_COMPLETED, '1');
  updateStatusUI();
  info(MODULE, '========== [启动] 配置恢复完成 ==========', {
    dir: handle.name,
    canWrite,
    pending: writePermissionPending,
  });
}

export async function runInitialSetup(): Promise<void> {
  info(MODULE, '========== 运行初始设置 ==========');
  await restoreFileConfigOnStartup();
  if (shouldShowInitialSetup()) {
    await showInitialSetupDialog();
  }
  info(MODULE, '========== 初始设置结束 ==========');
}

export async function manualSync(): Promise<void> {
  info(MODULE, '========== [手动同步] 用户点击同步按钮 ==========');

  // 前置检查并给出明确提示
  if (dirHandle === null) {
    warn(MODULE, '[手动同步] 未配置数据目录');
    ui.showToast('请先选择数据保存目录', 'error');
    return;
  }
  if (writePermissionPending) {
    warn(MODULE, '[手动同步] 权限待授权');
    ui.showToast('目录访问权限已失效，请点击"重新授权目录访问"按钮', 'error');
    return;
  }
  if (syncInProgress) {
    info(MODULE, '[手动同步] 同步正在进行中，跳过');
    ui.showToast('正在同步中，请稍候...', 'info');
    return;
  }

  ui.showToast('正在同步数据到文件...', 'info');
  await syncToFile(true);

  // 根据同步结果给出反馈
  if (lastSyncError !== null) {
    ui.showToast(`同步失败：${lastSyncError}`, 'error');
  } else {
    ui.showToast(`同步成功！数据已保存到 ${dirHandle.name}`, 'success');
  }
}

export function closeFileConfigDB(): void {
  if (dirHandleDB !== null) {
    dirHandleDB.close();
    dirHandleDB = null;
    info(MODULE, 'IndexedDB 连接已关闭');
  }
}

export function initFileConfig(): void {
  info(MODULE, '初始化文件配置模块...');

  // 选择/更改目录按钮
  document.querySelectorAll('[data-setting-action="changeConfigDir"]').forEach((btn) => {
    btn.addEventListener('click', () => void selectSyncDir());
  });

  // 手动同步按钮
  document.querySelectorAll('[data-setting-action="syncToFile"]').forEach((btn) => {
    btn.addEventListener('click', () => void manualSync());
  });

  // 授权按钮（权限失效时显示）
  const authBtn = document.getElementById('configAuthBtn');
  authBtn?.addEventListener('click', () => void requestDirectoryPermission());

  // 帮助按钮
  document.getElementById('configDirHelpBtn')?.addEventListener('click', showPathHelp);

  // 重置按钮（如果存在）
  document.getElementById('configResetBtn')?.addEventListener('click', () => void resetDirectoryConfig());

  window.addEventListener('beforeunload', handleBeforeUnload);

  // 监听数据变更，防抖自动同步到文件
  onStorageChange(() => {
    scheduleFileSync();
  });

  // 页面可见性变化时检查权限状态（不直接 requestPermission——需要用户手势）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dirHandle !== null && writePermissionPending) {
      debug(MODULE, '页面重新可见，查询权限状态');
      void verifyPermission(dirHandle, true, false).then((granted) => {
        if (granted) {
          writePermissionPending = false;
          localStorageService.setRaw(LS_KEYS.PERMISSION_CACHED, '1');
          updateStatusUI();
          void syncToFile(true);
          ui.showToast('目录访问权限已恢复', 'success');
        } else if (!permissionDialogOpen) {
          // 权限未恢复且弹窗未打开，显示一键授权弹窗
          showPermissionRequestDialog();
        }
      });
    }
  });

  updateStatusUI();
  info(MODULE, '文件配置模块初始化完成');
}

export function restoreFileConfigOnStartup(): Promise<void> {
  startupRestorePromise ??= restoreHandleOnStartup();
  return startupRestorePromise;
}

/**
 * 获取当前数据目录信息（供其他模块使用）
 */
export function getDataDirInfo(): {
  configured: boolean;
  path: string;
  writable: boolean;
  lastSync: number;
  lastError: string | null;
} {
  return {
    configured: dirHandle !== null,
    path: getCurrentPathDisplay(),
    writable: !writePermissionPending && dirHandle !== null,
    lastSync: lastSyncTime,
    lastError: lastSyncError,
  };
}
