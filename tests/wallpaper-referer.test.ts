/**
 * Wallpaper Gallery 防盗链规则单测
 * img.061129.xyz 只接受壁纸站点域名的 Referer，扩展靠 DNR 静态规则补上；规则与 manifest 声明必须对齐。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface HeaderOp {
  header: string
  operation: string
  value?: string
}

interface Rule {
  id: number
  action: { type: string; requestHeaders?: HeaderOp[] }
  condition: { requestDomains?: string[]; resourceTypes?: string[] }
}

interface Manifest {
  permissions?: string[]
  declarative_net_request?: { rule_resources?: { id: string; enabled: boolean; path: string }[] }
}

const ROOT = new URL('../', import.meta.url)
const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8')) as T

const manifest = readJson<Manifest>('manifest.json')
const rules = readJson<Rule[]>('rules/wallpaper-referer.json')
const rule = rules.find((r) => r.condition.requestDomains?.includes('img.061129.xyz'))

describe('Wallpaper Gallery 防盗链规则', () => {
  it('manifest 声明 DNR 权限并启用规则文件', () => {
    expect(manifest.permissions).toContain('declarativeNetRequestWithHostAccess')
    const resources = manifest.declarative_net_request?.rule_resources ?? []
    expect(resources.map((r) => [r.path, r.enabled])).toContainEqual(['rules/wallpaper-referer.json', true])
  })
  it('给图片 CDN 补上站点 Referer，覆盖缩略图与原图请求', () => {
    expect(rule?.action.type).toBe('modifyHeaders')
    expect(rule?.action.requestHeaders).toContainEqual({
      header: 'Referer',
      operation: 'set',
      value: 'https://wallpaper.061129.xyz/',
    })
    expect(rule?.condition.resourceTypes).toEqual(expect.arrayContaining(['image', 'xmlhttprequest']))
  })
})
