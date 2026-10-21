/**
 * 在线壁纸应用反馈相关单测（下载进度 + 入库校验）
 *
 * 覆盖：
 * - fetchDataUrl 直连路径的进度累计（有 Content-Length 的确定态 / 无 Content-Length 的不确定态）
 * - fetchDataUrl 上游非 2xx 的错误
 * - storeRemoteWallpaper 的体积上限与入库失败分支
 * - wallpapersToClear：一键清空历史壁纸时保留当前使用中的那张
 *
 * 环境为 node，无 DOM：FileReader 与 fetch 用最小桩件替代。
 */
import { describe, expect, it, vi } from 'vitest'
import { fetchDataUrl, probeRemoteImage } from '../src/core/fetch-proxy'
import { findWallpaperBySource, storeRemoteWallpaper, wallpapersToClear, wallpaperRefOf, WALLPAPER_REF_PREFIX } from '../src/core/wallpaper'

/* ---------- 环境桩件 ---------- */

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;

/** 构造只含 headers / body 的假 Response（避开 undici 对 content-length 的自动补齐） */
const fakeRes = (chunks: readonly Uint8Array[], withLength: boolean): Response => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(x));
      c.close();
    },
  });
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const headers = new Headers(withLength ? { 'content-length': String(total) } : {});
  return { ok: true, status: 200, headers, body } as unknown as Response;
};

const chunkOf = (size: number): Uint8Array => new Uint8Array(size).fill(7);

const stubFetch = (res: Response | Error): void => {
  vi.stubGlobal('fetch', res instanceof Error
    ? vi.fn(async () => { throw res; })
    : vi.fn(async () => res));
};

/* ---------- fetchDataUrl：下载进度 ---------- */

describe('fetchDataUrl 下载进度', () => {
  it('总量已知时按块累计，最后一次 loaded 等于 total', async () => {
    const chunks = [chunkOf(1024), chunkOf(2048), chunkOf(512)];
    stubFetch(fakeRes(chunks, true));
    const seen: [number, number][] = [];
    const url = await fetchDataUrl('https://x.test/a.jpg', (l, t) => seen.push([l, t]));
    expect(seen.map((s) => s[0])).toEqual([1024, 3072, 3584]);
    expect(seen.every((s) => s[1] === 3584)).toBe(true);
    /* 3584 字节全为同值 0x07，base64 长度可反推体积确实被完整读出 */
    expect(url.startsWith('data:')).toBe(true);
    expect(url.length).toBeGreaterThan(3584);
  });

  it('总量不可知时 total 恒为 0（供 UI 走循环等待动画）', async () => {
    stubFetch(fakeRes([chunkOf(1000), chunkOf(1000)], false));
    const seen: number[] = [];
    await fetchDataUrl('https://x.test/b.jpg', (_l, t) => seen.push(t));
    expect(seen).toEqual([0, 0]);
  });

  it('不传回调也能正常完成（回调为可选）', async () => {
    stubFetch(fakeRes([chunkOf(64)], true));
    await expect(fetchDataUrl('https://x.test/c.jpg')).resolves.toMatch(/^data:/);
  });

  it('上游返回 404 时抛出带状态码的错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(fetchDataUrl('https://x.test/d.jpg')).rejects.toThrow('HTTP 404');
  });
});

/* ---------- storeRemoteWallpaper：入库校验 ---------- */

describe('storeRemoteWallpaper 入库校验', () => {
  it('超过 20MB 上限时拒绝并说明原因', async () => {
    const tooBig = `data:image/jpeg;base64,${'A'.repeat(30 * 1024 * 1024)}`;
    await expect(storeRemoteWallpaper('https://x.test/big.jpg', tooBig, 'Test')).rejects.toThrow('图片过大，超过 20MB 上限');
  });

  it('node 环境无 indexedDB 时抛出存储失败（不静默成功）', async () => {
    await expect(storeRemoteWallpaper('https://x.test/small.jpg', 'data:image/jpeg;base64,AAAA', 'Test'))
      .rejects.toThrow('壁纸保存失败');
  });
});

/* ---------- probeRemoteImage：下载前先看体积与类型 ---------- */

describe('probeRemoteImage 下载前探测', () => {
  it('体积超上限时提前拒绝，不白下', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      headers: { 'content-length': String(30 * 1024 * 1024), 'content-type': 'image/jpeg' },
    })));
    await expect(probeRemoteImage('https://x.test/big.jpg')).rejects.toThrow('超过 20MB');
  });

  it('不是图片时提前拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { headers: { 'content-type': 'text/html' } })));
    await expect(probeRemoteImage('https://x.test/a.html')).rejects.toThrow('不是图片');
  });

  it('HEAD 不可用（被限制）时放行，交给正式下载兜底', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('blocked'); }));
    await expect(probeRemoteImage('https://x.test/a.jpg')).resolves.toBeUndefined();
  });
});

/* ---------- 清空历史壁纸：挑选规则 ---------- */

describe('wallpapersToClear（清空历史壁纸的挑选规则）', () => {
  const all = [{ ref: 'idb:a' }, { ref: 'idb:b' }, { ref: 'idb:c' }];

  it('保留当前使用中的那张，其余全部待清理', () => {
    expect(wallpapersToClear(all, 'idb:b')).toEqual(['idb:a', 'idb:c']);
  });

  it('没有当前壁纸（已移除壁纸）时全部待清理', () => {
    expect(wallpapersToClear(all, null)).toEqual(['idb:a', 'idb:b', 'idb:c']);
  });

  it('只有当前壁纸时无可清理项；空库同样返回空', () => {
    expect(wallpapersToClear([{ ref: 'idb:a' }], 'idb:a')).toEqual([]);
    expect(wallpapersToClear([], null)).toEqual([]);
  });
});

/* ---------- 资料来源去重键 ---------- */

describe('wallpaperRefOf 去重键', () => {
  it('同一来源地址得到同一引用（重复下载判定与复用的基础）', async () => {
    const a = await wallpaperRefOf('url:https://x.test/a.jpg');
    const b = await wallpaperRefOf('url:https://x.test/a.jpg');
    expect(a).toBe(b);
    expect(a.startsWith(WALLPAPER_REF_PREFIX)).toBe(true);
    /* idb: 前缀 + SHA-256 前 16 位十六进制 */
    expect(a).toHaveLength(WALLPAPER_REF_PREFIX.length + 16);
  });

  it('不同来源地址得到不同引用', async () => {
    const a = await wallpaperRefOf('url:https://x.test/a.jpg');
    const b = await wallpaperRefOf('url:https://x.test/b.jpg');
    expect(a).not.toBe(b);
  });

  it('无 indexedDB 时按来源查询返回 null 而不抛错', async () => {
    await expect(findWallpaperBySource('https://x.test/a.jpg')).resolves.toBeNull();
    await expect(findWallpaperBySource('')).resolves.toBeNull();
  });
});
