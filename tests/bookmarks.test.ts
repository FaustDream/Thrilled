/**
 * 收藏夹导入单测（v4 转换规则）
 * 覆盖：协议过滤 / 系统文件夹跳过 / 同 URL 去重 / 标题回退
 */
import { describe, expect, it } from 'vitest'
import { collectBookmarks, isImportableUrl, type BookmarkNode } from '../src/core/bookmark-importer'

const node = (over: Partial<BookmarkNode>): BookmarkNode => ({ ...over })

describe('isImportableUrl', () => {
  it('仅接受 http/https', () => {
    expect(isImportableUrl('https://example.com')).toBe(true)
    expect(isImportableUrl('http://example.com')).toBe(true)
    expect(isImportableUrl('chrome://extensions')).toBe(false)
    expect(isImportableUrl('javascript:void(0)')).toBe(false)
    expect(isImportableUrl('not a url')).toBe(false)
  })
})

describe('collectBookmarks', () => {
  it('跳过系统文件夹（其他书签 / 移动设备书签）', () => {
    const tree = [
      node({ id: '0', children: [
        node({ id: '1', children: [node({ url: 'https://a.com', title: 'A' })] }),
        node({ id: '2', children: [node({ url: 'https://other.com', title: 'Other' })] }),
        node({ id: '3', children: [node({ url: 'https://mobile.com', title: 'Mobile' })] }),
      ] }),
    ]
    const out = collectBookmarks(tree)
    expect(out.map((x) => x.url)).toEqual(['https://a.com'])
  })

  it('同 URL 去重、协议过滤、空标题回退 URL', () => {
    const tree = [
      node({ id: '0', children: [
        node({ id: '1', children: [
          node({ url: 'https://a.com', title: 'A 站' }),
          node({ url: 'https://a.com/', title: 'A 站副本' }),
          node({ url: 'ftp://b.com', title: 'FTP' }),
          node({ url: 'https://c.com', title: '' }),
        ] }),
      ] }),
    ]
    const out = collectBookmarks(tree)
    expect(out).toEqual([
      { label: 'A 站', url: 'https://a.com' },
      { label: 'https://c.com', url: 'https://c.com' },
    ])
  })

  it('子文件夹内容被递归收集', () => {
    const tree = [
      node({ id: '0', children: [
        node({ id: '1', children: [
          node({ title: '开发', children: [node({ url: 'https://github.com', title: 'GitHub' })] }),
          node({ url: 'https://b.com', title: 'B' }),
        ] }),
      ] }),
    ]
    const out = collectBookmarks(tree)
    expect(out.map((x) => x.url)).toEqual(['https://github.com', 'https://b.com'])
  })
})
