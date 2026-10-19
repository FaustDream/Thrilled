/**
 * 文档版本与新旧判定（纯逻辑，可单测）
 *
 * 两个用途：
 * - 升级保护：文档由更早版本写入时，先备份再载入（覆盖安装不清 storage，留一层回滚保险）
 * - 快照保护：本地目录快照可能比本机数据旧，恢复前先比较写入时间，避免旧快照覆盖新数据
 */

/** 文档里用于比较的最小形状 */
export interface VersionedDoc {
  appVersion?: string | null;
  updatedAt?: string | null;
}

/** 是否需要在载入前备份：文档版本缺失或与当前版本不同 */
export const needsUpgradeBackup = (doc: VersionedDoc, currentVersion: string): boolean =>
  doc.appVersion !== currentVersion;

/** 快照是否比当前文档更旧；任一方缺时间戳时返回 false（不阻断恢复） */
export const isSnapshotOlder = (snapshot: VersionedDoc, current: VersionedDoc): boolean => {
  const a = snapshot.updatedAt;
  const b = current.updatedAt;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta < tb;
};
