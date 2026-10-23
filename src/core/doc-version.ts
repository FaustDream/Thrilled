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

/**
 * 版本号归一化为三段式（主.次.修订）
 *
 * 两段式 A.B 是迁移前的写法，等价于 A.0.B（5.27 ≡ 5.0.27）；一段式补成 A.0.0。
 * 前导零一并抹掉（5.0.027 → 5.0.27）。无法解析的字符串原样返回，仍按字符串比较。
 */
export const normalizeVersion = (v: string | null | undefined): string => {
  if (typeof v !== 'string') return '';
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(v.trim());
  if (m === null) return v;
  const major = Number(m[1]);
  if (m[3] !== undefined) return `${major}.${Number(m[2])}.${Number(m[3])}`;
  if (m[2] !== undefined) return `${major}.0.${Number(m[2])}`;
  return `${major}.0.0`;
};

/** 是否需要在载入前备份：文档版本缺失或与当前版本不同（两段式 / 三段式按归一化后比较） */
export const needsUpgradeBackup = (doc: VersionedDoc, currentVersion: string): boolean =>
  normalizeVersion(doc.appVersion) !== normalizeVersion(currentVersion);

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
