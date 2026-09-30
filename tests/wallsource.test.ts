/**
 * 外部壁纸来源适配器单测（v4.4）
 * 覆盖：列表地址构造（分类映射 / 基址清理）、响应解析（wallhaven / picsum / 坏数据）
 */
import { describe, expect, it } from 'vitest'
import { buildListUrl, parseList, sourceCategories } from '../src/core/wallsource'
import type { WallpaperSource } from '../src/shared/types'

const wh: WallpaperSource = { id: 'a', kind: 'wallhaven', name: 'Wallhaven', apiBase: 'https://wallhaven.cc/api/v1/' }
const ps: WallpaperSource = { id: 'b', kind: 'picsum', name: 'Picsum', apiBase: 'https://picsum.photos' }

describe('buildListUrl', () => {
  it('wallhaven 分类映射为原站三位开关参数', () => {
    expect(buildListUrl(wh, 'general', 2)).toBe('https://wallhaven.cc/api/v1/search?purity=100&page=2&categories=100')
    expect(buildListUrl(wh, 'anime', 1)).toBe('https://wallhaven.cc/api/v1/search?purity=100&page=1&categories=010')
    expect(buildListUrl(wh, 'people', 1)).toBe('https://wallhaven.cc/api/v1/search?purity=100&page=1&categories=001')
  })
  it('picsum 忽略分类，走 v2 列表协议', () => {
    expect(buildListUrl(ps, 'all', 3)).toBe('https://picsum.photos/v2/list?page=3&limit=30')
  })
})

describe('sourceCategories', () => {
  it('wallhaven 保持原站三类，picsum 原站无分类', () => {
    expect(sourceCategories('wallhaven').map((c) => c.label)).toEqual(['General', 'Anime', 'People'])
    expect(sourceCategories('picsum')).toEqual([{ key: 'all', label: '全部' }])
  })
})

describe('parseList', () => {
  it('wallhaven 响应映射缩略图 / 原图 / 作者，页码解析 hasMore', () => {
    const text = JSON.stringify({
      data: [
        { id: 'abc123', path: 'https://w.wallhaven.cc/full/x/wallhaven-abc123.jpg', thumbs: { small: 'https://th.small/x.jpg', large: 'https://th.large/x.jpg' }, uploader: { username: 'neo' } },
        { id: 'bad' },
      ],
      meta: { current_page: 1, last_page: 7 },
    })
    const page = parseList(wh, 1, text)
    expect(page.photos[0]).toEqual({ id: 'abc123', thumb: 'https://th.large/x.jpg', full: 'https://w.wallhaven.cc/full/x/wallhaven-abc123.jpg', author: 'neo' })
    expect(page.photos[1]).toEqual({ id: 'bad', thumb: '', full: '', author: '' })
    expect(page.hasMore).toBe(true)
  })
  it('wallhaven 末页 hasMore=false', () => {
    const text = JSON.stringify({ data: [], meta: { current_page: 7, last_page: 7 } })
    expect(parseList(wh, 7, text).hasMore).toBe(false)
  })
  it('picsum 响应按 id 构造缩略图与原图地址', () => {
    const text = JSON.stringify([{ id: '0', author: 'Alejandro', download_url: 'https://picsum.photos/id/0/5000/3333' }])
    const page = parseList(ps, 1, text)
    expect(page.photos[0]).toEqual({ id: '0', thumb: 'https://picsum.photos/id/0/360/240', full: 'https://picsum.photos/id/0/1920/1080', author: 'Alejandro' })
    expect(page.hasMore).toBe(false)
  })
  it('坏 JSON / 非对象返回空页', () => {
    expect(parseList(wh, 1, 'not-json')).toEqual({ photos: [], page: 1, hasMore: false })
    expect(parseList(ps, 1, '{"x":1}')).toEqual({ photos: [], page: 1, hasMore: false })
  })
})
