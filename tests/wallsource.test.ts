/**
 * 外部壁纸来源适配器单测（v4.4）
 * 覆盖：列表地址构造（各协议 / 分类映射 / 分页）、响应解析（wallhaven / picsum / bing / 061129 / 坏数据）
 */
import { describe, expect, it, vi } from 'vitest'
import { buildListUrl, buildZhefengPayload, parse061129Categories, parse061129List, parseList, parseZhefengCategories, parseZhefengList, fetchCategories } from '../src/core/wallsource'
import type { WallpaperSource } from '../src/shared/types'

vi.mock('../src/core/fetch-proxy', () => ({ fetchText: vi.fn(async (url: string) => {
  if (url.endsWith('index.json')) {
    return JSON.stringify({ blob: encodeSample(JSON.stringify([{ id: '插画', name: '插画', count: 1 }, { id: '动漫', name: '动漫' }])) })
  }
  return '[]'
}) }))

const { BLOB_PREFIX, CHAR_MAP_DECODE } = await import('../src/core/wallpaper061129-codec')

/** 用解码映射反推一条样例 blob（与站点编码方向一致：base64 → 映射 → 反转） */
const encodeSample = (raw: string): string => {
  const encMap: Record<string, string> = {}
  for (const [k, v] of Object.entries(CHAR_MAP_DECODE)) encMap[v] = k
  const b64 = Buffer.from(raw, 'utf8').toString('base64')
  return BLOB_PREFIX + b64.split('').map((c) => encMap[c] ?? c).reverse().join('')
}

const wh: WallpaperSource = { kind: 'wallhaven', name: 'Wallhaven', apiBase: 'https://wallhaven.cc/api/v1/' }
const ps: WallpaperSource = { kind: 'picsum', name: 'Picsum', apiBase: 'https://picsum.photos' }
const bg: WallpaperSource = { kind: 'bing', name: '必应每日', apiBase: 'https://www.bing.com' }
const wg: WallpaperSource = { kind: 'wg061129', name: 'Wallpaper Gallery', apiBase: 'https://wallpaper.061129.xyz/data' }

describe('buildListUrl', () => {
  it('wallhaven 分类映射为原站三位开关参数', () => {
    expect(buildListUrl(wh, 'general', 2)).toBe('https://wallhaven.cc/api/v1/search?purity=100&page=2&categories=100')
    expect(buildListUrl(wh, 'anime', 1)).toBe('https://wallhaven.cc/api/v1/search?purity=100&page=1&categories=010')
  })
  it('必应按天分页：page → idx 偏移', () => {
    expect(buildListUrl(bg, 'daily', 1)).toBe('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN')
    expect(buildListUrl(bg, 'daily', 3)).toBe('https://www.bing.com/HPImageArchive.aspx?format=js&idx=16&n=8&mkt=zh-CN')
  })
  it('061129 分类文件名经 URL 编码', () => {
    expect(buildListUrl(wg, '插画', 1)).toBe('https://wallpaper.061129.xyz/data/desktop/' + encodeURIComponent('插画') + '.json')
  })
  it('picsum 忽略分类，走 v2 列表协议', () => {
    expect(buildListUrl(ps, 'all', 3)).toBe('https://picsum.photos/v2/list?page=3&limit=30')
  })
})

describe('fetchCategories / parse061129Categories', () => {
  it('wallhaven 保持原站三类', async () => {
    expect((await fetchCategories(wh)).map((x) => x.label)).toEqual(['General', 'Anime', 'People'])
  })
  it('必应 / picsum 没有分类，返回空数组由界面隐藏分类行', async () => {
    expect(await fetchCategories(bg)).toEqual([])
    expect(await fetchCategories(ps)).toEqual([])
  })
  it('061129 从 index.json blob 解码原站分类', async () => {
    expect((await fetchCategories(wg)).map((x) => x.key)).toEqual(['插画', '动漫'])
  })
  it('坏数据返回空分类清单', () => {
    expect(parse061129Categories('not-json')).toEqual([])
  })
})

describe('parseZhefengCategories', () => {
  const text = JSON.stringify({
    1: [{ id: 'a1', typeName: '动漫｜二次元' }, { id: 'b2', typeName: '自然｜风景' }],
    2: [{ id: '1', typeName: '1 K' }],
  })
  it('取站方主题分类，并在最前面补「综合推荐」', () => {
    expect(parseZhefengCategories(text)).toEqual([
      { key: 'all', label: '综合推荐' },
      { key: 'a1', label: '动漫｜二次元' },
      { key: 'b2', label: '自然｜风景' },
    ])
  })
  it('没有主题分类时返回空数组（界面隐藏分类行）', () => {
    expect(parseZhefengCategories('{}')).toEqual([])
    expect(parseZhefengCategories('oops')).toEqual([])
  })
})

describe('parseList', () => {
  it('wallhaven 响应映射缩略图 / 原图 / 作者，页码解析 hasMore', () => {
    const text = JSON.stringify({
      data: [
        { id: 'abc123', path: 'https://w.wallhaven.cc/full/x/wallhaven-abc123.jpg', thumbs: { small: 'https://th.small/x.jpg', large: 'https://th.large/x.jpg' }, uploader: { username: 'neo' } },
      ],
      meta: { current_page: 1, last_page: 7 },
    })
    const page = parseList(wh, 1, text)
    expect(page.photos[0]).toEqual({ id: 'abc123', thumb: 'https://th.large/x.jpg', full: 'https://w.wallhaven.cc/full/x/wallhaven-abc123.jpg', author: 'neo', title: 'abc123' })
    expect(page.hasMore).toBe(true)
  })
  it('必应响应映射 UHD 原图 / 缩略图 / 版权与标题', () => {
    const text = JSON.stringify({ images: Array.from({ length: 8 }, () => ({ url: '/th?id=OHR.X_1920x1080.jpg&pid=hp', title: '一张图', copyright: '雄性文须雀 (© Andrew)', date: '20260930' })), tooltips: {} })
    const page = parseList(bg, 1, text)
    expect(page.photos[0]).toEqual({
      id: 'bing-20260930',
      thumb: 'https://www.bing.com/th?id=OHR.X_400x240.jpg&pid=hp',
      full: 'https://www.bing.com/th?id=OHR.X_UHD.jpg&pid=hp',
      author: '雄性文须雀',
      title: '一张图',
    })
    expect(page.hasMore).toBe(true)
  })
  it('必应翻到第 2 页就到底（站方 idx 越界会重发最老的 8 张）', () => {
    const rows = Array.from({ length: 8 }, () => ({ url: '/th?id=OHR.X_1920x1080.jpg', title: 't', copyright: 'c', date: '20261001' }))
    const text = JSON.stringify({ images: rows })
    expect(parseList(bg, 1, text).hasMore).toBe(true)
    expect(parseList(bg, 2, text).hasMore).toBe(false)
  })
  it('061129 分类清单解码后按 30/页切片分页', () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({ id: 'd' + i, path: '/wallpaper/desktop/' + i + '.jpg', thumbnailPath: '/thumbnail/desktop/' + i + '.webp', displayTitle: '图' + i }))
    const text = JSON.stringify({ blob: encodeSample(JSON.stringify(rows)) })
    const p1 = parse061129List(1, text)
    const p2 = parse061129List(2, text)
    expect(p1.photos).toHaveLength(30)
    const first = p1.photos[0]
    expect(first?.thumb).toBe('https://img.061129.xyz/thumbnail/desktop/0.webp')
    expect(first?.full).toBe('https://img.061129.xyz/wallpaper/desktop/0.jpg')
    expect(p1.hasMore).toBe(true)
    expect(p2.photos).toHaveLength(5)
    expect(p2.hasMore).toBe(false)
  })
  it('坏 JSON / 非对象返回空页', () => {
    expect(parseList(wh, 1, 'not-json')).toEqual({ photos: [], page: 1, hasMore: false })
    expect(parseList(bg, 1, '{"x":1}')).toEqual({ photos: [], page: 1, hasMore: false })
    expect(parseList(wg, 1, '{"blob":"v1.bad"}')).toEqual({ photos: [], page: 1, hasMore: false })
  })
})

describe('哲风壁纸请求体', () => {
  it('页大小不超过站方上限 21（22 起返回 400 壁纸分页参数不正确）', () => {
    expect(buildZhefengPayload('all', 1).rows).toBeLessThanOrEqual(21)
  })
  it('综合推荐不带 typeId；选主题分类时转成 typeId', () => {
    expect('typeId' in buildZhefengPayload('all', 1)).toBe(false)
    expect(buildZhefengPayload('a1b2', 2)).toMatchObject({ typeId: 'a1b2', wpType: '1,3,4,7' })
  })
  it('字段与站方 PC 端一致：标签留空、排序 3、非收藏', () => {
    expect(buildZhefengPayload('all', 2)).toMatchObject({ page: 2, sortType: 3, wpType: '1,3,4,7', lbId: '', isFavorites: false })
  })
  it('搜索词去空白后写入 search，空搜索不带该字段', () => {
    expect(buildZhefengPayload('all', 1, '  原神 ')).toMatchObject({ search: '原神' })
    expect('search' in buildZhefengPayload('all', 1, '   ')).toBe(false)
  })
})

describe('parseZhefengList', () => {
  const text = JSON.stringify({
    list: [{ wtId: 'w1', fileId: 'f1', type: 1, labelList: ['五条悟', '咒术回战', '特写', '多余'] }],
    pages: 2,
    total: 24,
  })
  it('静态壁纸取最高清晰度预览图，缩略图仍用裁剪图，标题取前三个标签', () => {
    const page = parseZhefengList(1, text)
    expect(page.photos[0]).toEqual({
      id: 'w1',
      thumb: 'https://haowallpaper.com/link/common/file/getCroppingImg/f1',
      full: 'https://haowallpaper.com/link/common/file/previewFileImg/f1',
      author: '',
      title: '五条悟 · 咒术回战 · 特写',
    })
    expect(page.hasMore).toBe(true)
  })
  it('动态壁纸的预览图是 mp4，回退到封面帧', () => {
    const dyn = JSON.stringify({ list: [{ wtId: 'w2', fileId: 'f2', type: 3, labelList: [] }], pages: 1, total: 1 })
    expect(parseZhefengList(1, dyn).photos[0]?.full).toBe('https://haowallpaper.com/link/common/file/getCroppingImg/f2')
  })
  it('末页不再 hasMore', () => {
    expect(parseZhefengList(2, text).hasMore).toBe(false)
  })
  it('坏 JSON 返回空页', () => {
    expect(parseZhefengList(1, 'oops')).toEqual({ photos: [], page: 1, hasMore: false })
  })
})
