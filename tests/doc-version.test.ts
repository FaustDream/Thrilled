/**
 * 文档版本与快照新旧判定单测
 * 覆盖：版本升级触发备份 / 同版本不重复备份 / 快照新旧比较 / 缺时间戳不阻断
 */
import { describe, expect, it } from 'vitest'
import { isSnapshotOlder, needsUpgradeBackup } from '../src/core/doc-version'

describe('needsUpgradeBackup', () => {
  it('旧版本或缺失版本号 → 需要备份', () => {
    expect(needsUpgradeBackup({ appVersion: '4.6' }, '4.7')).toBe(true)
    expect(needsUpgradeBackup({ appVersion: null }, '4.7')).toBe(true)
    expect(needsUpgradeBackup({}, '4.7')).toBe(true)
  })

  it('同版本 → 不重复备份', () => {
    expect(needsUpgradeBackup({ appVersion: '4.7' }, '4.7')).toBe(false)
  })
})

describe('isSnapshotOlder', () => {
  it('快照写入更早 → 视为旧快照', () => {
    expect(isSnapshotOlder(
      { updatedAt: '2026-10-18T10:00:00.000Z' },
      { updatedAt: '2026-10-19T10:00:00.000Z' },
    )).toBe(true)
  })

  it('快照更新或相同 → 可以恢复', () => {
    expect(isSnapshotOlder(
      { updatedAt: '2026-10-19T10:00:00.000Z' },
      { updatedAt: '2026-10-18T10:00:00.000Z' },
    )).toBe(false)
    expect(isSnapshotOlder(
      { updatedAt: '2026-10-19T10:00:00.000Z' },
      { updatedAt: '2026-10-19T10:00:00.000Z' },
    )).toBe(false)
  })

  it('任一方缺时间戳或时间非法 → 不阻断恢复', () => {
    expect(isSnapshotOlder({}, { updatedAt: '2026-10-19T10:00:00.000Z' })).toBe(false)
    expect(isSnapshotOlder({ updatedAt: '2026-10-19T10:00:00.000Z' }, {})).toBe(false)
    expect(isSnapshotOlder({ updatedAt: 'bad' }, { updatedAt: 'also-bad' })).toBe(false)
  })
})
